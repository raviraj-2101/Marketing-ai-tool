// supabase/functions/manage-users/index.ts
// User management edge function with custom JWT authentication.
// Actions: list, create, update, delete

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verify,
} from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// ───────────────────────────────────────────────────────────
// CORS headers
// ───────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// All-Brands access sentinel: a distinguished custom_role_types entry
// ("<sentinel>:<role>") meaning "every brand, current and future" instead of
// a snapshot of today's brand ids. Deno edge functions cannot import from
// src/, so this literal MUST stay in sync with src/lib/brandAccess.ts's
// ALL_BRANDS_SENTINEL.
//
// IMPORTANT: users.brand_ids is a Postgres UUID[] column (see
// supabase/migrations/20260504000001_user_type_system.sql) — it CANNOT store
// this string. The sentinel is therefore carried only in custom_role_types
// (a TEXT[] column); every place below that rebuilds brand_ids from
// custom_role_types must explicitly skip the sentinel entry rather than
// pushing it into that array, or the insert/update will fail with
// "invalid input syntax for type uuid".
const ALL_BRANDS_SENTINEL = "__ALL_BRANDS__";

// ───────────────────────────────────────────────────────────
// JWT key derivation (identical to auth-login)
// ───────────────────────────────────────────────────────────
async function getJwtKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ───────────────────────────────────────────────────────────
// Verify custom JWT token (replaces Supabase Auth verification)
// ───────────────────────────────────────────────────────────
async function verifyRequest(req: Request): Promise<{
  sub: string;
  email: string;
  roles: string[];
  user_type: string[];
}> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const key = await getJwtKey();

  // verify() throws if signature is invalid or token is expired
  const payload = await verify(token, key) as {
    sub: string;
    email: string;
    roles: string[];
    user_type: string[];
    exp: number;
  };

  return { sub: payload.sub, email: payload.email, roles: payload.roles, user_type: payload.user_type };
}

// ───────────────────────────────────────────────────────────
// Fetch members from ClickUp list
// ───────────────────────────────────────────────────────────
async function getClickUpListMembers(clickupApiKey: string): Promise<any[]> {
  const listId = "901523581126";
  if (!listId) {
    throw new Error("CLICKUP_LIST_ID is not configured");
  }

  const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/member`, {
    method: "GET",
    headers: {
      "Authorization": clickupApiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ClickUp API error: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.members || [];
}

// ───────────────────────────────────────────────────────────
// Fetch all workspace (team) members from ClickUp.
// This is a superset of any single list's members and includes
// invited-but-not-yet-joined users, so it resolves people that the
// list-scoped lookup above misses. Normalized to the list-member
// shape { id, email, username }.
// ───────────────────────────────────────────────────────────
async function getClickUpTeamMembers(clickupApiKey: string): Promise<any[]> {
  const response = await fetch("https://api.clickup.com/api/v2/team", {
    method: "GET",
    headers: {
      "Authorization": clickupApiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ClickUp team API error: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const teams = data.teams ?? [];
  const wantedId = Deno.env.get("CLICKUP_TEAM_ID");
  const team =
    (wantedId ? teams.find((t: any) => String(t.id) === String(wantedId)) : null) ??
    teams[0];
  const members = team?.members ?? [];

  return members
    .map((m: any) => m.user)
    .filter((u: any) => u && u.email)
    .map((u: any) => ({ id: u.id, email: u.email, username: u.username }));
}

// ───────────────────────────────────────────────────────────
// Resolve the ClickUp people directory for user-sync flows.
// Prefers the full workspace member list so invited/unlisted users
// resolve; merges in list members as a fallback (and covers the case
// where a guest exists only on the list). Never throws unless BOTH
// sources fail.
// ───────────────────────────────────────────────────────────
async function getClickUpMembers(clickupApiKey: string): Promise<any[]> {
  const byEmail = new Map<string, any>();
  let teamOk = false;

  try {
    for (const m of await getClickUpTeamMembers(clickupApiKey)) {
      if (m.email) byEmail.set(String(m.email).toLowerCase(), m);
    }
    teamOk = byEmail.size > 0;
  } catch (err) {
    console.warn(
      "getClickUpTeamMembers failed, falling back to list members:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    for (const m of await getClickUpListMembers(clickupApiKey)) {
      const key = String(m.email).toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, { id: m.id, email: m.email, username: m.username });
      }
    }
  } catch (err) {
    if (!teamOk) throw err; // both sources failed — surface the error
    console.warn(
      "getClickUpListMembers fallback failed; using workspace members only:",
      err instanceof Error ? err.message : err,
    );
  }

  return [...byEmail.values()];
}

// ───────────────────────────────────────────────────────────
// Sync user to cs_config table (lookup from ClickUp if needed)
// ───────────────────────────────────────────────────────────
async function syncUserTocsConfig(firstName: string, lastName: string, email: string, admin: any): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const fullName = `${firstName} ${lastName}`.trim();

  // Check if email already exists in cs_config
  const { data: csRecords, error: csCheckError } = await admin
    .from("cs_config")
    .select("id, clickup_user_id")
    .eq("value", normalizedEmail)
    .limit(1);

  if (!csCheckError && csRecords && csRecords.length > 0) {
    // Record exists — update label only
    const { error: csUpdateError } = await admin
      .from("cs_config")
      .update({ label: fullName || "Unknown" })
      .eq("value", normalizedEmail);

    if (csUpdateError) {
      console.error(`Failed to update cs_config for ${normalizedEmail}:`, csUpdateError);
    }
    return;
  }

  // Record doesn't exist — lookup from ClickUp API
  const clickupApiKey = Deno.env.get("CLICKUP_API_KEY");
  if (!clickupApiKey) {
    console.warn("CLICKUP_API_KEY not configured, skipping cs_config sync");
    return;
  }

  try {
    const members = await getClickUpMembers(clickupApiKey);
    const member = members.find((m: any) => String(m.email).toLowerCase() === normalizedEmail);

    if (member?.id) {
      // Create cs_config record with ClickUp user ID
      const { error: csInsertError } = await admin
        .from("cs_config")
        .insert({
          label: fullName || member.username || "Unknown",
          value: normalizedEmail,
          clickup_user_id: member.id,
        });

      if (csInsertError) {
        console.error(`Failed to create cs_config for ${normalizedEmail}:`, csInsertError);
      }
    }
  } catch (err) {
    console.error(`ClickUp lookup failed for ${normalizedEmail}:`, err);
  }
}

// ───────────────────────────────────────────────────────────
// Add a user to their brand's ClickUp user group (CS or Editor) so
// they gain access to that brand's ClickUp folders automatically —
// this removes the manual "add the person to the ClickUp project"
// step that otherwise makes ad creation fail with
// "All users must have access to task".
//
// The brand→group map lives in other_config (name = 'brand_clickup_groups');
// each entry has brand_id + cs_group_id / editor_group_id / uploader_group_id.
//
// FAIL-SOFT by design: this NEVER blocks onboarding. Any problem
// (no group mapped for the brand, insufficient ClickUp permission,
// ClickUp 4xx/5xx) is logged and skipped so the user still gets created/updated.
// Add-only: it never removes a user from a group here.
//
// NOTE: adding to a brand group only grants folder access if that group is
// SHARED on the brand's folders in the ClickUp UI (one-time manual step —
// the API cannot share a group on a folder, and guest-to-folder needs an
// Enterprise plan). Verified 2026-07-22 on the CELMOR/Body Oil folder.
// ───────────────────────────────────────────────────────────
interface BrandGroupRow {
  brand_id: string;
  brand_code?: string;
  brand?: string;
  cs_group_id: string | null;
  editor_group_id: string | null;
  uploader_group_id: string | null;
}

async function loadBrandGroupMap(admin: any): Promise<Record<string, BrandGroupRow>> {
  const { data, error } = await admin
    .from("other_config")
    .select("data")
    .eq("name", "brand_clickup_groups")
    .maybeSingle();

  if (error || !data) {
    console.warn("[brand-group-sync] brand_clickup_groups not found in other_config; skipping");
    return {};
  }
  const arr: BrandGroupRow[] = typeof data.data === "string" ? JSON.parse(data.data) : data.data;
  const byBrandId: Record<string, BrandGroupRow> = {};
  for (const r of arr ?? []) if (r?.brand_id) byBrandId[r.brand_id] = r;
  return byBrandId;
}

// Classify a role label into the right ClickUp group.
// Handles both role vocabularies in use:
//   UserDialog       → "CS", "Editor", "Media Buyer", "Copywriter"
//   AssignUsersModal → "Main CS", "Secondary CS", "Coordinator", "Editor"
// Editors → Editor group; CS / Coordinator → CS group; everything else → none.
function groupIdForRole(row: BrandGroupRow | undefined, role: string): string | null {
  if (!row) return null;
  const r = role.toLowerCase();
  if (r.includes("editor")) return row.editor_group_id;
  if (r.includes("cs") || r.includes("coordinator")) return row.cs_group_id;
  return null;
}

async function addUserToClickUpGroup(clickupApiKey: string, groupId: string, clickupUserId: number): Promise<void> {
  const res = await fetch(`https://api.clickup.com/api/v2/group/${groupId}`, {
    method: "PUT",
    headers: { "Authorization": clickupApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ members: { add: [clickupUserId] } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`group ${groupId} update failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

// ───────────────────────────────────────────────────────────
// All-Brands CS/Editor fan-out.
//
// The brands table stores CS/Editor assignments as per-row email arrays
// (main_cs / secondary_cs / main_editor / secondary_editor), so an
// "every brand" grant has no single row to live on. Instead we FAN IT OUT:
// the user's email is written into the matching column on EVERY brand row,
// which is what makes them appear in BrandCsTable, the ad CS/Editor picker
// and the ClickUp group sync exactly like a per-brand assignee.
//
// Brands created LATER are covered by the "backfill-brand" action below,
// which the frontend calls right after inserting a new brand.
//
// This enforces the full desired state (idempotent): the email is present in
// `targetColumn` on every brand and absent from the other three, so a role
// change (CS → Editor) and a revoked grant (targetColumn = null) both work.
// It only ever touches THIS one email — other users' entries are untouched.
// ───────────────────────────────────────────────────────────
const BRAND_ROLE_COLUMNS = ["main_cs", "secondary_cs", "main_editor", "secondary_editor"] as const;
type BrandRoleColumn = typeof BRAND_ROLE_COLUMNS[number];

// Maps a stored role label to its brands-table column. Media Buyer / Copywriter
// are not CS/Editor picker roles, so they map to null (no column).
function roleToBrandColumn(role: string): BrandRoleColumn | null {
  const roleMap: Record<string, BrandRoleColumn> = {
    "Main CS": "main_cs",
    "Secondary CS": "secondary_cs",
    "Main Editor": "main_editor",
    "Secondary Editor": "secondary_editor",
    // Backward-compat with the older single-value roles (default to "main"):
    "CS": "main_cs",
    "Editor": "main_editor",
  };
  return roleMap[role] ?? null;
}

// Pull the All-Brands role out of a custom_role_types array (null if no grant).
function getAllBrandsRole(customRoleTypes: string[] | null | undefined): string | null {
  for (const assignment of customRoleTypes ?? []) {
    const raw = String(assignment);
    if (raw.startsWith(`${ALL_BRANDS_SENTINEL}:`)) {
      return raw.slice(ALL_BRANDS_SENTINEL.length + 1);
    }
  }
  return null;
}

async function applyAllBrandsCsEditorColumns(
  admin: any,
  email: string,
  targetColumn: BrandRoleColumn | null,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return;

  const { data: brandRows, error } = await admin
    .from("brands")
    .select("id, main_cs, secondary_cs, main_editor, secondary_editor");

  if (error) {
    console.error("[all-brands-sync] failed to load brands; skipping fan-out:", error.message);
    return;
  }

  let changed = 0;
  for (const brand of brandRows ?? []) {
    const next: Record<string, string[]> = {};
    let rowChanged = false;

    for (const column of BRAND_ROLE_COLUMNS) {
      const current: string[] = [...(brand[column] ?? [])];
      const without = current.filter((e) => String(e).toLowerCase().trim() !== normalizedEmail);
      const desired = column === targetColumn ? [...without, normalizedEmail] : without;

      if (desired.length !== current.length) rowChanged = true;
      next[column] = desired;
    }

    if (!rowChanged) continue;

    const { error: updateError } = await admin.from("brands").update(next).eq("id", brand.id);
    if (updateError) {
      console.error(`[all-brands-sync] failed to update brand ${brand.id}:`, updateError.message);
    } else {
      changed++;
    }
  }

  console.log(
    `[all-brands-sync] ${normalizedEmail} → ${targetColumn ?? "removed from all CS/Editor columns"} on ${changed} brand row(s)`,
  );
}

async function syncUserToBrandGroups(email: string, customRoleTypes: string[], admin: any): Promise<void> {
  if (!Array.isArray(customRoleTypes) || customRoleTypes.length === 0) return;

  const clickupApiKey = Deno.env.get("CLICKUP_API_KEY");
  if (!clickupApiKey) {
    console.warn("[brand-group-sync] CLICKUP_API_KEY not configured; skipping");
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Resolve the person's ClickUp user id (cs_config was just synced upstream).
  const { data: cs } = await admin
    .from("cs_config")
    .select("clickup_user_id")
    .eq("value", normalizedEmail)
    .maybeSingle();

  const clickupUserId = cs?.clickup_user_id ? Number(cs.clickup_user_id) : null;
  if (!clickupUserId) {
    console.warn(`[brand-group-sync] no clickup_user_id for ${normalizedEmail}; skipping`);
    return;
  }

  const map = await loadBrandGroupMap(admin);
  const doneGroups = new Set<string>();

  // Expand the assignment list before syncing: the All-Brands sentinel is not a
  // real brand id, so it stands in for EVERY mapped brand. Fanning it out here
  // is what gets an All-Brands CS/Editor into each brand's ClickUp group (and
  // therefore its folders), instead of no group at all.
  const expandedAssignments: string[] = [];
  for (const assignment of customRoleTypes) {
    const raw = String(assignment);
    const sepIdx = raw.indexOf(":");
    const brandId = sepIdx === -1 ? raw : raw.slice(0, sepIdx);
    const role = sepIdx === -1 ? "" : raw.slice(sepIdx + 1);
    if (brandId === ALL_BRANDS_SENTINEL) {
      const mappedBrandIds = Object.keys(map);
      console.log(`[brand-group-sync] expanding All-Brands grant for ${normalizedEmail} (role "${role}") to ${mappedBrandIds.length} mapped brand(s)`);
      for (const mappedBrandId of mappedBrandIds) {
        expandedAssignments.push(`${mappedBrandId}:${role}`);
      }
    } else {
      expandedAssignments.push(raw);
    }
  }

  for (const assignment of expandedAssignments) {
    const [brandId, role] = String(assignment).split(":");
    if (!brandId || !role || role === "No Access") continue;

    const groupId = groupIdForRole(map[brandId], role);
    if (!groupId) {
      console.warn(`[brand-group-sync] no ClickUp group mapped for brand ${brandId} role "${role}"; skipping`);
      continue;
    }
    if (doneGroups.has(groupId)) continue;
    doneGroups.add(groupId);

    try {
      await addUserToClickUpGroup(clickupApiKey, groupId, clickupUserId);
      console.log(`[brand-group-sync] added ${normalizedEmail} (${clickupUserId}) to ClickUp group ${groupId} (brand ${brandId}, role "${role}")`);
    } catch (err) {
      console.error(`[brand-group-sync] failed for ${normalizedEmail} brand ${brandId}:`, err instanceof Error ? err.message : err);
    }
  }
}

// ───────────────────────────────────────────────────────────
// Admin client (service_role) — never sent to the browser
// ───────────────────────────────────────────────────────────
function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ───────────────────────────────────────────────────────────
// Main handler
// ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth gate — verify custom JWT
  let caller: { sub: string; email: string; roles: string[]; user_type: string[] };
  try {
    caller = await verifyRequest(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Determine if caller is Super Admin or Admin
  const isAdmin = caller.user_type?.includes("Super Admin") || caller.user_type?.includes("Admin") || caller.user_type?.includes("Dev");
  const isSuperAdmin = caller.user_type?.includes("Super Admin");

  try {
    const { action, payload } = await req.json() as {
      action: "list" | "create" | "update" | "delete" | "backfill-brand";
      payload?: Record<string, any>;
    };

    const admin = getAdminClient();

    // ── LIST ───────────────────────────────────────────────────────────
    // Allow all user types to view users list
    if (action === "list") {
      const { data, error } = await admin
        .from("users")
        .select("id, first_name, last_name, email, roles, user_type, brand_ids, custom_role_types, allowed_routes, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ users: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── CREATE ───────────────────────────────────────────────────────
    if (action === "create") {
      // Only Super Admin or Admin can create users
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { firstName, lastName, email, password, user_type: userTypeStr, custom_role_types: customRoleTypesStr, allowed_routes: allowedRoutesStr } = payload ?? {};

      if (!firstName || !email || !password || !userTypeStr) {
        return new Response(
          JSON.stringify({ error: "firstName, lastName, email, password, and user_type are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Step 1: Check if email already exists in users table
      const { data: existingUser, error: userCheckError } = await admin
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .single();

      if (!userCheckError && existingUser) {
        return new Response(
          JSON.stringify({ error: "A user with this email already exists" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 2: Check if email already exists in cs_config
      const { data: existingCsRecord, error: csCheckError } = await admin
        .from("cs_config")
        .select("id")
        .eq("value", normalizedEmail)
        .limit(1);

      // If email doesn't exist in cs_config, create it from ClickUp
      if ((!csCheckError && (!existingCsRecord || existingCsRecord.length === 0)) || csCheckError) {
        const clickupApiKey = Deno.env.get("CLICKUP_API_KEY");
        if (!clickupApiKey) {
          return new Response(
            JSON.stringify({ error: "CLICKUP_API_KEY is not configured" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        try {
          const members = await getClickUpMembers(clickupApiKey);
          const member = members.find((m: any) => String(m.email).toLowerCase() === normalizedEmail);

          if (!member?.id) {
            return new Response(
              JSON.stringify({ error: `User with email "${email}" not found in ClickUp workspace` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Create cs_config record with ClickUp user ID
          const fullName = `${firstName} ${lastName}`.trim();
          const { error: csInsertError } = await admin
            .from("cs_config")
            .insert({
              label: fullName || member.username || "Unknown",
              value: normalizedEmail,
              clickup_user_id: member.id,
            });

          if (csInsertError) {
            return new Response(
              JSON.stringify({ error: `Failed to create cs_config record: ${csInsertError.message}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          return new Response(
            JSON.stringify({ error: `ClickUp lookup failed: ${errorMsg}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // If email already exists in cs_config, just continue (no error)

      let user_type: string[];
      try {
        user_type = JSON.parse(userTypeStr);
        if (!Array.isArray(user_type) || user_type.length === 0) throw new Error("Invalid user_type");
      } catch {
        return new Response(
          JSON.stringify({ error: "user_type must be a non-empty JSON array" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Admin restriction: Admin caller cannot assign Super Admin or Admin types
      if (!isSuperAdmin && (user_type.includes("Super Admin") || user_type.includes("Admin"))) {
        return new Response(
          JSON.stringify({ error: "Only Super Admin can assign Super Admin or Admin types" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse custom_role_types to extract brand IDs and roles
      let customRoleTypes: string[] = [];
      const brand_ids: string[] = [];
      const brandRoleUpdates: Record<string, { main_cs: string[]; secondary_cs: string[]; main_editor: string[]; secondary_editor: string[] }> = {};

      if (customRoleTypesStr && user_type.includes("Custom")) {
        try {
          customRoleTypes = typeof customRoleTypesStr === "string" ? JSON.parse(customRoleTypesStr) : customRoleTypesStr;
          if (!Array.isArray(customRoleTypes)) {
            throw new Error("custom_role_types must be an array");
          }

          // Helper: normalize role name to database column name
          // Maps a brand role to the brands-table array column. Main/Secondary CS & Editor
          // map to the four real columns; legacy "CS"/"Editor" default to the "main" column.
          // Anything else (Media Buyer, Copywriter, Coordinator) returns null → not a picker role.
          const normalizeRole = (role: string): string | null => {
            const roleMap: Record<string, string> = {
              "Main CS": "main_cs",
              "Secondary CS": "secondary_cs",
              "Main Editor": "main_editor",
              "Secondary Editor": "secondary_editor",
              // Backward-compat with the older single-value roles (default to "main"):
              "CS": "main_cs",
              "Editor": "main_editor",
            };
            return roleMap[role] ?? null;
          };

          // Process each brand role assignment (format: "brandId:role")
          for (const roleAssignment of customRoleTypes) {
            const [brandId, role] = roleAssignment.split(":");
            if (brandId && role && role !== "No Access") {
              // All-Brands sentinel: not a real brand row, and it must NOT be
              // pushed into brand_ids (a Postgres UUID[] column — see the
              // module-level comment above). Its CS/Editor columns are written
              // by applyAllBrandsCsEditorColumns after the insert, which fans
              // the grant out across every brand row instead of one.
              if (brandId === ALL_BRANDS_SENTINEL) {
                continue;
              }

              if (!brand_ids.includes(brandId)) {
                brand_ids.push(brandId);
              }

              const normalizedRole = normalizeRole(role);
              // Only update brands table for mapped roles (not "CS" or "Editor" base roles)
              if (normalizedRole) {
                // Prepare brand updates
                if (!brandRoleUpdates[brandId]) {
                  // Fetch current brand data
                  const { data: brandData, error: brandError } = await admin
                    .from("brands")
                    .select("main_cs, secondary_cs, main_editor, secondary_editor")
                    .eq("id", brandId)
                    .single();

                  if (!brandError && brandData) {
                    brandRoleUpdates[brandId] = {
                      main_cs: [...(brandData.main_cs || [])],
                      secondary_cs: [...(brandData.secondary_cs || [])],
                      main_editor: [...(brandData.main_editor || [])],
                      secondary_editor: [...(brandData.secondary_editor || [])],
                    };
                  }
                }

                // Add email to the appropriate role array
                if (brandRoleUpdates[brandId] && !brandRoleUpdates[brandId][normalizedRole as keyof typeof brandRoleUpdates[string]]?.includes(normalizedEmail)) {
                  const roleArray = brandRoleUpdates[brandId][normalizedRole as keyof typeof brandRoleUpdates[string]];
                  if (roleArray) roleArray.push(normalizedEmail);
                }
              }
            }
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Unknown error parsing custom_role_types";
          return new Response(
            JSON.stringify({ error: `Failed to process custom_role_types: ${errorMsg}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Parse allowed_routes
      let allowedRoutes: string[] = [];
      if (allowedRoutesStr) {
        try {
          allowedRoutes = typeof allowedRoutesStr === "string" ? JSON.parse(allowedRoutesStr) : allowedRoutesStr;
          if (!Array.isArray(allowedRoutes)) allowedRoutes = [];
        } catch {
          allowedRoutes = [];
        }
      }

      // Insert into public.users — password will be hashed by pgcrypto trigger
      // Note: name is computed by trigger from first_name and last_name
      const { data: row, error: dbError } = await admin
        .from("users")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: email.toLowerCase().trim(),
          password,
          roles: user_type, // Keep roles in sync for legacy JWT compat
          user_type,
          brand_ids,
          custom_role_types: customRoleTypes,
          allowed_routes: allowedRoutes,
        })
        .select("id, first_name, last_name, email, roles, user_type, brand_ids, custom_role_types, allowed_routes, created_at")
        .single();

      if (dbError) {
        return new Response(
          JSON.stringify({ error: dbError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update brands table with user email in appropriate role columns
      for (const [brandId, roleData] of Object.entries(brandRoleUpdates)) {
        const { error: brandUpdateError } = await admin
          .from("brands")
          .update(roleData)
          .eq("id", brandId);

        if (brandUpdateError) {
          console.error(`Failed to update brand ${brandId}:`, brandUpdateError);
        }
      }

      // All-Brands grant: fan the CS/Editor role out across EVERY brand row so
      // the person shows up in BrandCsTable and the ad CS/Editor picker for all
      // of them (a per-brand assignment writes its column in the loop above).
      const createdAllBrandsRole = getAllBrandsRole(row.custom_role_types);
      if (createdAllBrandsRole) {
        await applyAllBrandsCsEditorColumns(admin, row.email, roleToBrandColumn(createdAllBrandsRole));
      }

      // Sync to cs_config (lookup from ClickUp if needed)
      await syncUserTocsConfig(row.first_name, row.last_name, row.email, admin);

      // Add the person to their brand's ClickUp CS/Editor group so ad creation
      // no longer fails on ClickUp folder membership (fail-soft — never blocks create).
      await syncUserToBrandGroups(row.email, row.custom_role_types ?? [], admin);

      return new Response(
        JSON.stringify({ success: true, user: row }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UPDATE ───────────────────────────────────────────────────────
    if (action === "update") {
      // Only Super Admin or Admin can update users
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { id, firstName, lastName, email, password, user_type: userTypeStr, brand_ids, custom_role_types: customRoleTypesStr, allowed_routes: allowedRoutesStr } = payload ?? {};

      // If id not provided, look up by email
      let userId = id;
      if (!userId && email) {
        const { data: userByEmail, error: emailLookupError } = await admin
          .from("users")
          .select("id")
          .eq("email", email.toLowerCase().trim())
          .single();

        if (emailLookupError || !userByEmail) {
          return new Response(
            JSON.stringify({ error: "User not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        userId = userByEmail.id;
      }

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "id or email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch existing user to check restrictions and get current role assignments
      const { data: existingUser, error: fetchError } = await admin
        .from("users")
        .select("user_type, custom_role_types, email")
        .eq("id", userId)
        .single();

      if (fetchError || !existingUser) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Admin restriction: Admin caller cannot edit Super Admin or Admin users
      const existingUserType = existingUser.user_type || [];
      if (!isSuperAdmin && (existingUserType.includes("Super Admin") || existingUserType.includes("Admin"))) {
        return new Response(
          JSON.stringify({ error: "Only Super Admin can edit Super Admin or Admin users" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateFields: Record<string, any> = {};
      if (firstName || lastName) {
        updateFields.first_name = firstName || "";
        updateFields.last_name = lastName || "";
        // name is computed by trigger from first_name and last_name
      }
      if (email) {
        const normalizedNewEmail = email.toLowerCase().trim();
        // Check if new email is already used by another user
        const { data: emailExists, error: emailCheckError } = await admin
          .from("users")
          .select("id")
          .eq("email", normalizedNewEmail)
          .neq("id", userId) // Exclude current user
          .single();

        if (!emailCheckError && emailExists) {
          return new Response(
            JSON.stringify({ error: "A user with this email already exists" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        updateFields.email = normalizedNewEmail;
      }

      if (userTypeStr) {
        try {
          const user_type = JSON.parse(userTypeStr);
          if (!Array.isArray(user_type) || user_type.length === 0) throw new Error("Invalid user_type");

          // Admin restriction: Admin caller cannot assign Super Admin or Admin types
          if (!isSuperAdmin && (user_type.includes("Super Admin") || user_type.includes("Admin"))) {
            return new Response(
              JSON.stringify({ error: "Only Super Admin can assign Super Admin or Admin types" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          updateFields.user_type = user_type;
          updateFields.roles = user_type; // Keep roles in sync
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "user_type must be a non-empty JSON array" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Handle custom_role_types update for Custom users
      if (customRoleTypesStr !== undefined) {
        let customRoleTypes: string[] = [];
        const brandRoleUpdates: Record<string, { main_cs: string[]; secondary_cs: string[]; main_editor: string[]; secondary_editor: string[] }> = {};
        const brandRoleRemoves: Record<string, { main_cs: string[]; secondary_cs: string[]; main_editor: string[]; secondary_editor: string[] }> = {};
        const newBrandIds: string[] = [];

        try {
          customRoleTypes = typeof customRoleTypesStr === "string" ? JSON.parse(customRoleTypesStr) : customRoleTypesStr;
          if (!Array.isArray(customRoleTypes)) {
            throw new Error("custom_role_types must be an array");
          }

          // Check if user is actually a Custom user (use new type if being updated, otherwise existing)
          const userTypeForCheck = updateFields.user_type || existingUser.user_type || [];
          if (!Array.isArray(userTypeForCheck) || !userTypeForCheck.includes("Custom")) {
            throw new Error("Only Custom users can have custom_role_types");
          }

          // Get the email to use (updated email if provided, otherwise existing)
          const userEmail = updateFields.email || existingUser.email;
          const normalizedUserEmail = userEmail.toLowerCase().trim();

          // Parse old role assignments to remove email from old roles
          const oldCustomRoleTypes = existingUser.custom_role_types || [];
          const oldBrandRoleMap: Record<string, string> = {};

          for (const roleAssignment of oldCustomRoleTypes) {
            const [brandId, role] = roleAssignment.split(":");
            if (brandId && role) {
              oldBrandRoleMap[brandId] = role;
            }
          }

          // Helper: normalize role name to database column name
          const normalizeRole = (role: string): string | null => {
            const roleMap: Record<string, string> = {
              "Main CS": "main_cs",
              "Secondary CS": "secondary_cs",
              "Main Editor": "main_editor",
              "Secondary Editor": "secondary_editor",
              // Backward-compat with the older single-value roles (default to "main"):
              "CS": "main_cs",
              "Editor": "main_editor",
            };
            return roleMap[role] ?? null;
          };

          // Process new role assignments
          for (const roleAssignment of customRoleTypes) {
            const [brandId, role] = roleAssignment.split(":");
            if (brandId && role && role !== "No Access") {
              // All-Brands sentinel: must NOT be pushed into newBrandIds (a
              // Postgres UUID[] column — see the module-level comment above).
              // Its CS/Editor columns are fanned out across every brand row by
              // applyAllBrandsCsEditorColumns after the update below.
              if (brandId === ALL_BRANDS_SENTINEL) {
                continue;
              }

              if (!newBrandIds.includes(brandId)) {
                newBrandIds.push(brandId);
              }

              // Fetch current brand data
              if (!brandRoleUpdates[brandId] && !brandRoleRemoves[brandId]) {
                const { data: brandData, error: brandError } = await admin
                  .from("brands")
                  .select("main_cs, secondary_cs, main_editor, secondary_editor")
                  .eq("id", brandId)
                  .single();

                if (!brandError && brandData) {
                  brandRoleUpdates[brandId] = {
                    main_cs: [...(brandData.main_cs || [])],
                    secondary_cs: [...(brandData.secondary_cs || [])],
                    main_editor: [...(brandData.main_editor || [])],
                    secondary_editor: [...(brandData.secondary_editor || [])],
                  };
                  brandRoleRemoves[brandId] = {
                    main_cs: [...(brandData.main_cs || [])],
                    secondary_cs: [...(brandData.secondary_cs || [])],
                    main_editor: [...(brandData.main_editor || [])],
                    secondary_editor: [...(brandData.secondary_editor || [])],
                  };
                }
              }

              // Add email to the new role array
              const normalizedRole = normalizeRole(role);
              if (normalizedRole && brandRoleUpdates[brandId] && !brandRoleUpdates[brandId][normalizedRole as keyof typeof brandRoleUpdates[string]]?.includes(normalizedUserEmail)) {
                const roleArray = brandRoleUpdates[brandId][normalizedRole as keyof typeof brandRoleUpdates[string]];
                if (roleArray) roleArray.push(normalizedUserEmail);
              }
            }
          }

          // Remove email from old roles that are no longer assigned
          for (const [oldBrandId, oldRole] of Object.entries(oldBrandRoleMap)) {
            // All-Brands sentinel isn't a brands row; a revoked or changed
            // All-Brands grant is undone across every brand row by
            // applyAllBrandsCsEditorColumns after the update below.
            if (oldBrandId === ALL_BRANDS_SENTINEL) {
              continue;
            }
            // If this brand isn't in the new assignments or role changed, remove from old role
            if (!customRoleTypes.some((assignment: string) => assignment.startsWith(oldBrandId + ":"))) {
              if (!brandRoleRemoves[oldBrandId]) {
                const { data: brandData, error: brandError } = await admin
                  .from("brands")
                  .select("main_cs, secondary_cs, main_editor, secondary_editor")
                  .eq("id", oldBrandId)
                  .single();

                if (!brandError && brandData) {
                  brandRoleRemoves[oldBrandId] = {
                    main_cs: [...(brandData.main_cs || [])],
                    secondary_cs: [...(brandData.secondary_cs || [])],
                    main_editor: [...(brandData.main_editor || [])],
                    secondary_editor: [...(brandData.secondary_editor || [])],
                  };
                }
              }

              // Remove email from old role
              const normalizedOldRole = normalizeRole(oldRole);
              if (normalizedOldRole && brandRoleRemoves[oldBrandId]) {
                const roleArray = brandRoleRemoves[oldBrandId][normalizedOldRole as keyof typeof brandRoleRemoves[string]];
                if (roleArray) {
                  const idx = roleArray.indexOf(normalizedUserEmail);
                  if (idx !== -1) {
                    roleArray.splice(idx, 1);
                  }
                }
              }
            }
          }

          updateFields.custom_role_types = customRoleTypes;
          updateFields.brand_ids = newBrandIds;

          // Prepare final brand updates (removing old roles and adding new ones)
          const finalBrandUpdates: Record<string, any> = {};
          const allBrandIds = new Set([...Object.keys(brandRoleUpdates), ...Object.keys(brandRoleRemoves)]);

          for (const brandId of allBrandIds) {
            const updateData = brandRoleUpdates[brandId] || brandRoleRemoves[brandId];
            if (updateData) {
              finalBrandUpdates[brandId] = updateData;
            }
          }

          // Store brand updates to apply after user update
          (updateFields as any)._brandUpdates = finalBrandUpdates;
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Unknown error parsing custom_role_types";
          return new Response(
            JSON.stringify({ error: `Failed to process custom_role_types: ${errorMsg}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Handle allowed_routes update
      if (allowedRoutesStr !== undefined) {
        try {
          const parsedRoutes = typeof allowedRoutesStr === "string" ? JSON.parse(allowedRoutesStr) : allowedRoutesStr;
          updateFields.allowed_routes = Array.isArray(parsedRoutes) ? parsedRoutes : [];
        } catch {
          updateFields.allowed_routes = [];
        }
      }

      // EDGE CASE: Only update password if the caller actually provided one.
      // An empty string or missing field means "keep existing password".
      // The trigger will NOT double-hash because it checks LEFT(password, 4).
      if (password && password.trim() !== "") {
        updateFields.password = password;
      }

      // Handle brand_ids update (from brand assignment modal only)
      if (brand_ids !== undefined && Array.isArray(brand_ids)) {
        updateFields.brand_ids = brand_ids;
      }

      // Extract brand updates before updating user
      const brandUpdates = (updateFields as any)._brandUpdates;
      delete (updateFields as any)._brandUpdates;

      if (Object.keys(updateFields).length === 0) {
        return new Response(
          JSON.stringify({ error: "No fields to update" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: updated, error: dbError } = await admin
        .from("users")
        .update(updateFields)
        .eq("id", userId)
        .select("id, first_name, last_name, email, roles, user_type, brand_ids, custom_role_types, allowed_routes, created_at")
        .single();

      if (dbError) {
        return new Response(
          JSON.stringify({ error: dbError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update brands table with user email in appropriate role columns
      if (brandUpdates) {
        for (const [brandId, roleData] of Object.entries(brandUpdates)) {
          const { error: brandUpdateError } = await admin
            .from("brands")
            .update(roleData)
            .eq("id", brandId);

          if (brandUpdateError) {
            console.error(`Failed to update brand ${brandId}:`, brandUpdateError);
          }
        }
      }

      // All-Brands grant: enforce the CS/Editor columns across EVERY brand row.
      // Re-applying is idempotent, and driving it off the stored state (rather
      // than only the submitted diff) makes it self-healing and covers all three
      // transitions: newly granted, role changed (CS → Editor), and revoked.
      const prevAllBrandsRole = getAllBrandsRole(existingUser.custom_role_types);
      const nextAllBrandsRole = getAllBrandsRole(updated.custom_role_types);
      // If the email itself changed, clear the OLD address from every brand row
      // first so it doesn't linger as a stale CS/Editor entry.
      const previousEmail = String(existingUser.email ?? "").toLowerCase().trim();
      if (prevAllBrandsRole && previousEmail && previousEmail !== String(updated.email).toLowerCase().trim()) {
        await applyAllBrandsCsEditorColumns(admin, previousEmail, null);
      }
      if (nextAllBrandsRole) {
        await applyAllBrandsCsEditorColumns(admin, updated.email, roleToBrandColumn(nextAllBrandsRole));
      } else if (prevAllBrandsRole) {
        await applyAllBrandsCsEditorColumns(admin, updated.email, null);
      }

      // Sync to cs_config (lookup from ClickUp if needed)
      await syncUserTocsConfig(updated.first_name, updated.last_name, updated.email, admin);

      // Add the person to their brand's ClickUp CS/Editor group so ad creation
      // no longer fails on ClickUp folder membership (fail-soft — never blocks update).
      await syncUserToBrandGroups(updated.email, updated.custom_role_types ?? [], admin);

      return new Response(
        JSON.stringify({ success: true, user: updated }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (action === "delete") {
      // Only Super Admin or Admin can delete users
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { id } = payload ?? {};

      if (!id) {
        return new Response(
          JSON.stringify({ error: "id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // EDGE CASE: Super Admin protection — only Super Admin can delete Super Admin users.
      // Admin, Dev, and Custom users can be deleted by Admin and Super Admin callers.
      const { data: existing, error: fetchError } = await admin
        .from("users")
        .select("id, email, custom_role_types")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch user_type to check Super Admin protection
      const { data: userTypeData, error: userTypeError } = await admin
        .from("users")
        .select("user_type")
        .eq("id", id)
        .single();

      if (!userTypeError && userTypeData?.user_type?.includes("Super Admin") && !isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: "Only Super Admin can delete Super Admin users" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Remove user email from brand role columns before deleting
      const userEmail = existing.email?.toLowerCase().trim();
      const customRoleTypes = existing.custom_role_types || [];

      // An All-Brands grant fanned this email out to EVERY brand row, so clean
      // it off all of them (the per-brand loop below only visits real brand ids).
      if (userEmail && getAllBrandsRole(customRoleTypes)) {
        await applyAllBrandsCsEditorColumns(admin, userEmail, null);
      }

      if (customRoleTypes.length > 0) {
        // Collect all brands to clean up
        const brandsToCleanup: Record<string, { main_cs: string[]; secondary_cs: string[]; main_editor: string[]; secondary_editor: string[] }> = {};

        for (const roleAssignment of customRoleTypes) {
          const [brandId, role] = roleAssignment.split(":");
          if (brandId && role && brandId !== ALL_BRANDS_SENTINEL) {
            // Fetch brand data if not already fetched
            if (!brandsToCleanup[brandId]) {
              const { data: brandData, error: brandError } = await admin
                .from("brands")
                .select("main_cs, secondary_cs, main_editor, secondary_editor")
                .eq("id", brandId)
                .single();

              if (!brandError && brandData) {
                brandsToCleanup[brandId] = {
                  main_cs: [...(brandData.main_cs || [])],
                  secondary_cs: [...(brandData.secondary_cs || [])],
                  main_editor: [...(brandData.main_editor || [])],
                  secondary_editor: [...(brandData.secondary_editor || [])],
                };
              }
            }

            // Remove email from all role arrays for this brand
            if (brandsToCleanup[brandId] && userEmail) {
              for (const roleKey of ["main_cs", "secondary_cs", "main_editor", "secondary_editor"]) {
                const roleArray = brandsToCleanup[brandId][roleKey as keyof typeof brandsToCleanup[string]];
                if (roleArray) {
                  const idx = roleArray.indexOf(userEmail);
                  if (idx !== -1) {
                    roleArray.splice(idx, 1);
                  }
                }
              }
            }
          }
        }

        // Update brands to remove user email
        for (const [brandId, roleData] of Object.entries(brandsToCleanup)) {
          const { error: brandUpdateError } = await admin
            .from("brands")
            .update(roleData)
            .eq("id", brandId);

          if (brandUpdateError) {
            console.error(`Failed to remove user email from brand ${brandId}:`, brandUpdateError);
          }
        }
      }

      const { error: dbError } = await admin
        .from("users")
        .delete()
        .eq("id", id);

      if (dbError) {
        return new Response(
          JSON.stringify({ error: dbError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── BACKFILL-BRAND ───────────────────────────────────────────────
    // Makes "and every brand created in the future" true for CS/Editor.
    // The frontend calls this right after inserting a brand: every user holding
    // an All-Brands grant gets written into the NEW brand's CS/Editor column and
    // added to its ClickUp group, so nobody has to re-edit those users.
    // Fail-soft by design — a brand must never fail to be created because this
    // follow-up step had a problem.
    if (action === "backfill-brand") {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { brandId } = payload ?? {};
      if (!brandId) {
        return new Response(
          JSON.stringify({ error: "brandId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: brandRow, error: brandFetchError } = await admin
        .from("brands")
        .select("id, main_cs, secondary_cs, main_editor, secondary_editor")
        .eq("id", brandId)
        .single();

      if (brandFetchError || !brandRow) {
        return new Response(
          JSON.stringify({ error: "Brand not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Postgres array "contains" can't prefix-match, so filter in JS over the
      // Custom users (the only ones that can hold an All-Brands grant).
      const { data: candidateUsers, error: usersError } = await admin
        .from("users")
        .select("email, custom_role_types");

      if (usersError) {
        return new Response(
          JSON.stringify({ error: usersError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const next: Record<string, string[]> = {};
      for (const column of BRAND_ROLE_COLUMNS) {
        next[column] = [...(brandRow[column] ?? [])];
      }

      const applied: string[] = [];
      for (const candidate of candidateUsers ?? []) {
        const role = getAllBrandsRole(candidate.custom_role_types);
        if (!role) continue;
        const column = roleToBrandColumn(role);
        const email = String(candidate.email ?? "").toLowerCase().trim();
        if (!column || !email) continue;
        if (!next[column].some((e) => String(e).toLowerCase().trim() === email)) {
          next[column].push(email);
        }
        applied.push(`${email}:${role}`);
      }

      if (applied.length > 0) {
        const { error: brandUpdateError } = await admin.from("brands").update(next).eq("id", brandId);
        if (brandUpdateError) {
          console.error(`[all-brands-backfill] failed to update brand ${brandId}:`, brandUpdateError.message);
          return new Response(
            JSON.stringify({ error: brandUpdateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Also put them in the new brand's ClickUp group (fail-soft; a freshly
        // created brand usually has no group mapped yet, which just logs a warn).
        for (const entry of applied) {
          const sepIdx = entry.indexOf(":");
          const email = entry.slice(0, sepIdx);
          const role = entry.slice(sepIdx + 1);
          await syncUserToBrandGroups(email, [`${brandId}:${role}`], admin);
        }
      }

      console.log(`[all-brands-backfill] brand ${brandId}: applied ${applied.length} All-Brands grant(s)`);

      return new Response(
        JSON.stringify({ success: true, applied: applied.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
