// supabase/functions/auth-login/index.ts
// Custom JWT login endpoint.
// POST { email, password } → { token, user: { id, name, email, roles, user_type, brand_ids, custom_role_types, created_at } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  create,
} from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── JWT key derivation ────────────────────────────────────────────────────────
// We derive a CryptoKey from the raw JWT_SECRET string using HMAC-SHA256.
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

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { email, password } = await req.json() as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verify password via RPC (bcrypt check happens in Postgres) ────────────
    // We use the anon client + SECURITY DEFINER function so we never expose
    // the hashed password to the edge function layer.
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: rows, error: rpcError } = await anonClient.rpc(
      "verify_user_password",
      { p_email: email.toLowerCase().trim(), p_password: password }
    );

    if (rpcError) {
      console.error("[auth-login] RPC error:", rpcError.message);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // rows is an array; empty means no match
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = rows[0] as {
      id: string;
      first_name: string;
      last_name: string;
      name: string;
      email: string;
      roles: string[];
      user_type: string[];
      brand_ids: string[];
      custom_role_types: string[];
      allowed_routes: string[];
      created_at: string;
    };

    // Compute name from first_name and last_name
    const fullName = `${user.first_name} ${user.last_name}`.trim();

    // ── Generate JWT (HS256, 7-day expiry) ────────────────────────────────────
    const key = await getJwtKey();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 7; // 7 days

    const payload = {
      sub: user.id,          // subject = public.users.id (UUID)
      email: user.email,
      name: fullName,
      roles: user.roles,
      user_type: user.user_type,
      brand_ids: user.brand_ids,
      custom_role_types: user.custom_role_types,
      allowed_routes: user.allowed_routes ?? [],
      iat: now,
      exp: exp,
    };

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      payload,
      key
    );

    return new Response(
      JSON.stringify({
        token,
        user: {
          id: user.id,
          name: fullName,
          email: user.email,
          roles: user.roles,
          user_type: user.user_type,
          brand_ids: user.brand_ids,
          custom_role_types: user.custom_role_types,
          allowed_routes: user.allowed_routes ?? [],
          created_at: user.created_at,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[auth-login] Unexpected error:", message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
