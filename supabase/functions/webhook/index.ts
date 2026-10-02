import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ── Google Auth ── */

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/* ── Revenue Sources helper ── */

function matchProduct(productName: string, configProduct: string): boolean {
  if (!productName || !configProduct) return false;
  const pLower = productName.toLowerCase();
  const cLower = configProduct.toLowerCase();
  return pLower.includes(cLower) || cLower.includes(pLower);
}

async function readRevenueSources(
  accessToken: string,
  configSheetId: string,
): Promise<Array<{ product: string; adDbSheetId: string }>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent("'Revenue Sources Sync'!A:Z")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];

  if (rows.length < 2) return [];

  const header = rows[0].map((h) => (h || "").toLowerCase().trim());
  const productCol = header.findIndex((h) => h === "product");
  const adDbCol = header.findIndex((h) => h.includes("ad db") && h.includes("sheet"));

  if (productCol === -1 || adDbCol === -1) {
    console.warn(
      `[webhook] Revenue Sources Sync: could not find columns. productCol=${productCol}, adDbCol=${adDbCol}. Headers: ${header.join("|")}`,
    );
    return [];
  }

  const result: Array<{ product: string; adDbSheetId: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    const product = rows[i]?.[productCol] || "";
    const adDbSheetId = rows[i]?.[adDbCol] || "";
    if (product && adDbSheetId) {
      result.push({ product, adDbSheetId });
    }
  }
  return result;
}

/* ── Config stage options helper ── */

async function readConfigStageOptions(
  accessToken: string,
  configSheetId: string,
): Promise<Map<string, string>> {
  const tabName = "IMG/TSL/VID Config";
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent(`'${tabName}'!J3:K`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];
  const optionMap = new Map<string, string>();
  for (const row of rows) {
    const label = (row[0] || "").trim();
    const clickupId = (row[1] || "").trim();
    if (label && clickupId) {
      optionMap.set(clickupId, label);
    }
  }
  console.log(`[webhook] Stage config options for "${tabName}": ${optionMap.size} entries`);
  return optionMap;
}

/* ── Sheet helpers ── */

function formatAdId(n: number): string {
  return String(n).padStart(6, "0");
}

const KNOWN_HDR_COLS = ["ad id", "brand", "funnel", "status", "language", "# of images", "# of ads"];

/**
 * Reads rows 1 and 2 of the given tab, picks whichever row is the real header row
 * (highest count of recognizable column names), and returns a map of
 * lowercased-header → 0-based column index.
 */
async function readHeaderMap(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<Record<string, number>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!1:2`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const twoRows: string[][] = data.values || [];
  let headers: string[] = [];
  let bestScore = -1;
  for (const row of twoRows) {
    const h = (row || []).map((c: string) => (c || "").toLowerCase().trim());
    const score = KNOWN_HDR_COLS.filter((k) => h.includes(k)).length;
    if (score > bestScore) { bestScore = score; headers = h; }
  }
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) colMap[h] = i; });
  console.log(`[webhook] Header map for "${tabName}" (score ${bestScore}): ${Object.keys(colMap).join("|")}`)
  return colMap;
}

/** Converts 0-based column index to A1 letter (e.g. 0→A, 25→Z, 26→AA) */
function colIdxToLetter(idx: number): string {
  let result = "";
  let n = idx + 1;
  while (n > 0) { const rem = (n - 1) % 26; result = String.fromCharCode(65 + rem) + result; n = Math.floor((n - 1) / 26); }
  return result;
}

/** Finds the 0-based row index in the given tab where column A matches paddedAdId */
async function findAdDbRow(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  paddedAdId: string,
): Promise<number> {
  const range = `'${tabName}'!A:A`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];

  for (let i = 1; i < rows.length; i++) {
    const cellVal = (rows[i]?.[0] || "").replace(/^'/, "").trim();
    if (cellVal === paddedAdId) {
      return i; // 0-based
    }
  }
  return -1;
}

/* ── Main handler ── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const body = await req.json();

  const processPromise = processWebhook(body);
  processPromise.catch((err) => console.error("[webhook] Processing error:", err));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

const PRIORITY_FIELD_ID = "5927d263-c1f4-4a1a-b131-70cfa91aed8b";
const AD_SET_NAME_FIELD_ID = "7b311585-e935-45d2-9b95-47c5b3a978f2";
const STAGE_FIELD_ID = "eab52ea4-aef0-4ff3-aac6-6ea284e1b5e3";

async function findRecordsByTaskId(supabase: any, taskId: string) {
  // Exact match
  const { data: exact, error } = await supabase
    .from("statics_logs")
    .select("id, ad_id, product_name, funnel")
    .eq("clickup_task_id", taskId);
  if (error) return { data: null as any, error };
  if (exact && exact.length > 0) return { data: exact, error: null };

  // Fallback: case-insensitive / partial match (covers URL-stored IDs or case drift)
  const { data: fuzzy, error: fuzzyErr } = await supabase
    .from("statics_logs")
    .select("id, ad_id, product_name, funnel")
    .ilike("clickup_task_id", `%${taskId}%`);
  if (fuzzyErr) return { data: null as any, error: fuzzyErr };
  if (fuzzy && fuzzy.length > 0) {
    console.warn(`[webhook] Exact match failed for "${taskId}", found ${fuzzy.length} record(s) via partial match`);
    return { data: fuzzy, error: null };
  }

  console.warn(`[webhook] No records in DB for task_id "${taskId}" (exact or partial)`);
  return { data: [] as any[], error: null };
}

async function handlePriorityFieldUpdate(task_id: string, history_items: any[]): Promise<void> {
  // Extract the new Priority label from the webhook payload
  let priorityValue: string | null = null;
  for (const item of history_items || []) {
    if (item.field !== "custom_field") continue;
    const fieldId = item.after?.id || item.before?.id;
    const fieldName = (item.after?.name || item.before?.name || "").toLowerCase();
    if (fieldId !== PRIORITY_FIELD_ID && fieldName !== "priority") continue;

    const afterVal = item.after?.value;
    const options: any[] = item.after?.type_config?.options || [];
    if (afterVal !== null && afterVal !== undefined) {
      if (typeof afterVal === "number" && options[afterVal]) {
        priorityValue = options[afterVal].label || options[afterVal].name || String(afterVal);
      } else if (typeof afterVal === "string") {
        const opt = options.find((o: any) => o.id === afterVal);
        priorityValue = opt?.label || opt?.name || afterVal;
      } else {
        priorityValue = String(afterVal);
      }
    }
    break;
  }

  if (!priorityValue) {
    console.log("[webhook] No Priority value found in taskCustomFieldUpdated payload");
    return;
  }

  console.log(`[webhook] Priority update: task=${task_id} value="${priorityValue}"`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: records, error } = await findRecordsByTaskId(supabase, task_id);

  if (error) { console.error("[webhook] DB lookup error:", error); return; }
  if (!records || records.length === 0) {
    console.log(`[webhook] No statics_logs records for task ${task_id}`);
    return;
  }

  for (const record of records) {
    const { error: updateError } = await supabase
      .from("statics_logs")
      .update({ priority: priorityValue, updated_at: new Date().toISOString() })
      .eq("id", record.id);
    if (updateError) {
      console.error(`[webhook] Failed to update priority for ${record.id}:`, updateError);
    } else {
      console.log(`[webhook] statics_logs ${record.id} priority → "${priorityValue}"`);
    }

    const { error: adsUpdateError } = await supabase
      .from("ads")
      .update({ priority: priorityValue })
      .eq("ad_id", record.ad_id);
    if (adsUpdateError) {
      console.error(`[webhook] Failed to update ads priority for ad_id ${record.ad_id}:`, adsUpdateError);
    } else {
      console.log(`[webhook] ads ad_id=${record.ad_id} priority → "${priorityValue}"`);
    }
  }

  // Update Google Sheet Priority column (TSL tab only — Priority col lives there)
  const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID");
  if (!configSheetId) {
    console.warn("[webhook] GOOGLE_CONFIG_SHEET_ID not set — skipping sheet priority update");
    return;
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const revenueSources = await readRevenueSources(accessToken, configSheetId);
    const processedAdIds = new Set<number>();

    for (const record of records) {
      if (processedAdIds.has(record.ad_id)) continue;
      processedAdIds.add(record.ad_id);

      if ((record.funnel || "").toLowerCase() !== "tsl") continue;

      const revenueMatch = revenueSources.find((r) => matchProduct(record.product_name || "", r.product));
      if (!revenueMatch) {
        console.warn(`[webhook] No Ad DB sheet for product "${record.product_name}"`);
        continue;
      }

      const paddedAdId = formatAdId(record.ad_id);
      // Find the Priority column by header name (rows 1:2, picks the real header row)
      const priorityColMap = await readHeaderMap(accessToken, revenueMatch.adDbSheetId, "TSL");
      const priorityColIdx = priorityColMap["priority"] ?? -1;
      if (priorityColIdx === -1) {
        console.warn(`[webhook] "priority" column not found in TSL tab for ad_id ${record.ad_id}`);
        continue;
      }
      const colLetter = colIdxToLetter(priorityColIdx);

      const rowIndex = await findAdDbRow(accessToken, revenueMatch.adDbSheetId, "TSL", paddedAdId);
      if (rowIndex === -1) {
        console.warn(`[webhook] Row not found for ad_id "${paddedAdId}" in TSL tab`);
        continue;
      }

      const cellRange = `'TSL'!${colLetter}${rowIndex + 1}`;
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${revenueMatch.adDbSheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[priorityValue]] }),
        },
      );
      if (!updateRes.ok) {
        console.error(`[webhook] Sheet Priority update failed for "${paddedAdId}": ${await updateRes.text()}`);
      } else {
        console.log(`[webhook] Sheet TSL ${colLetter}${rowIndex + 1} = "${priorityValue}" (ad_id: ${record.ad_id})`);
      }
    }
  } catch (sheetErr) {
    console.error("[webhook] Sheet priority update failed:", sheetErr);
  }

  console.log(`[webhook] Done processing Priority update for task ${task_id}`);
}

function resolveOptionLabel(value: unknown, options: any[]): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const v = value as any;
    return v.label || v.name || null;
  }
  if (options.length > 0) {
    if (typeof value === "number") {
      const opt = options.find((o: any) => Number(o.orderindex) === value) ?? options[value];
      return opt?.label || opt?.name || null;
    }
    if (typeof value === "string") {
      const opt = options.find((o: any) => o.id === value);
      return opt?.label || opt?.name || value;
    }
  }
  return typeof value === "string" ? value : String(value);
}

async function fetchClickUpFieldOptions(taskId: string, fieldId: string, apiKey: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const field = (data.custom_fields || []).find((f: any) => f.id === fieldId);
  return field?.type_config?.options || [];
}

async function handleStageFieldUpdate(task_id: string, history_items: any[]): Promise<void> {
  console.log(`[webhook] Stage field updated: task=${task_id}`);
  const clickupApiKey = Deno.env.get("CLICKUP_API_KEY");
  let stageValue: string | null = null;
  let rawAfterVal: unknown = undefined;
  let inlineOptions: any[] = [];

  for (const item of history_items || []) {
    if (item.field !== "custom_field") continue;
    // taskCustomFieldUpdated: field ID in item.after?.id
    // taskUpdated:            field ID in item.custom_field?.id; name in item.name
    const fieldId = item.after?.id || item.before?.id || item.custom_field?.id;
    const fieldName = (item.name || item.after?.name || item.before?.name || item.custom_field?.name || "").toLowerCase();
    if (fieldId !== STAGE_FIELD_ID) continue;

    // taskCustomFieldUpdated: value at item.after.value
    // taskUpdated:            value may be item.after directly (string/object)
    if (item.after !== null && item.after !== undefined) {
      rawAfterVal = typeof item.after === "object" && "value" in item.after
        ? item.after.value
        : item.after;
    }
    inlineOptions = item.after?.type_config?.options || item.custom_field?.type_config?.options || [];
    console.log(`[webhook] Stage raw afterVal=${JSON.stringify(rawAfterVal)} inlineOptions=${inlineOptions.length}`);

    stageValue = resolveOptionLabel(rawAfterVal, inlineOptions);
    break;
  }

  if (rawAfterVal === undefined) {
    console.log(`[webhook] Stage: no matching item in history_items. Full payload: ${JSON.stringify(history_items)}`);
    return;
  }

  // If inline options missing, fetch from ClickUp API for the label
  if (inlineOptions.length === 0 && rawAfterVal !== null && clickupApiKey) {
    console.log(`[webhook] Stage: no inline options, fetching from ClickUp API`);
    const apiOptions = await fetchClickUpFieldOptions(task_id, STAGE_FIELD_ID, clickupApiKey);
    stageValue = resolveOptionLabel(rawAfterVal, apiOptions);
    console.log(`[webhook] Stage: API options=${apiOptions.length} resolved="${stageValue}"`);
  }

  if (!stageValue) {
    console.log(`[webhook] No Stage value resolved (rawAfterVal=${JSON.stringify(rawAfterVal)})`);
    return;
  }

  console.log(`[webhook] Stage update: task=${task_id} value="${stageValue}"`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: records, error } = await findRecordsByTaskId(supabase, task_id);

  if (error) { console.error("[webhook] DB lookup error:", error); return; }
  if (!records || records.length === 0) {
    console.log(`[webhook] No statics_logs records for task ${task_id}`);
    return;
  }

  for (const record of records) {
    const { error: updateError } = await supabase
      .from("statics_logs")
      .update({ stage: stageValue, updated_at: new Date().toISOString() })
      .eq("id", record.id);
    if (updateError) {
      console.error(`[webhook] Failed to update stage for ${record.id}:`, updateError);
    } else {
      console.log(`[webhook] statics_logs ${record.id} stage → "${stageValue}"`);
    }

    const { error: adsUpdateError } = await supabase
      .from("ads")
      .update({ pipeline_status: stageValue })
      .eq("ad_id", record.ad_id);
    if (adsUpdateError) {
      console.error(`[webhook] Failed to update ads pipeline_status for ad_id ${record.ad_id}:`, adsUpdateError);
    } else {
      console.log(`[webhook] ads ad_id=${record.ad_id} pipeline_status → "${stageValue}"`);
    }
  }

  const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID");
  if (!configSheetId) {
    console.warn("[webhook] GOOGLE_CONFIG_SHEET_ID not set — skipping sheet stage update");
    return;
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const revenueSources = await readRevenueSources(accessToken, configSheetId);
    const processedAdIds = new Set<number>();
    const configOptions = await readConfigStageOptions(accessToken, configSheetId);

    for (const record of records) {
      if (processedAdIds.has(record.ad_id)) continue;
      processedAdIds.add(record.ad_id);

      const revenueMatch = revenueSources.find((r) => matchProduct(record.product_name || "", r.product));
      if (!revenueMatch) {
        console.warn(`[webhook] No Ad DB sheet for product "${record.product_name}"`);
        continue;
      }

      const funnelLower = (record.funnel || "").toLowerCase();
      const tabName = funnelLower === "tsl" ? "TSL" : funnelLower === "vid" ? "VID" : "IMG";
      const paddedAdId = formatAdId(record.ad_id);
      const rawKey = rawAfterVal !== null && rawAfterVal !== undefined ? String(rawAfterVal) : null;
      const sheetStageValue = (rawKey && configOptions.get(rawKey)) || stageValue || "";
      console.log(`[webhook] Stage sheet label: rawKey="${rawKey}" → sheetLabel="${sheetStageValue}" (stageValue="${stageValue}")`);
      if (rawKey && !configOptions.get(rawKey)) {
        console.warn(`[webhook] Stage: option ID "${rawKey}" not found in "IMG/TSL/VID Config" — falling back to ClickUp label "${stageValue}"`);
      }

      const rowIndex = await findAdDbRow(accessToken, revenueMatch.adDbSheetId, tabName, paddedAdId);
      if (rowIndex === -1) {
        console.warn(`[webhook] Row not found for ad_id "${paddedAdId}" in tab "${tabName}"`);
        continue;
      }

      const colMap = await readHeaderMap(accessToken, revenueMatch.adDbSheetId, tabName);
      const stageColIdx = colMap["stage"] ?? -1;
      if (stageColIdx === -1) {
        console.warn(`[webhook] "stage" column not found in "${tabName}" tab for ad_id ${record.ad_id}`);
        continue;
      }

      const colLetter = colIdxToLetter(stageColIdx);
      const cellRange = `'${tabName}'!${colLetter}${rowIndex + 1}`;
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${revenueMatch.adDbSheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[sheetStageValue]] }),
        },
      );
      if (!updateRes.ok) {
        console.error(`[webhook] Sheet Stage update failed for "${paddedAdId}" (status ${updateRes.status}): ${await updateRes.text()}`);
      } else {
        console.log(`[webhook] Sheet ${tabName} ${colLetter}${rowIndex + 1} = "${sheetStageValue}" (ad_id: ${record.ad_id})`);
      }
    }
  } catch (sheetErr) {
    console.error("[webhook] Sheet stage update failed:", sheetErr);
  }

  console.log(`[webhook] Done processing Stage update for task ${task_id}`);
}

async function handleTaskNameUpdate(task_id: string, history_items: any[]): Promise<void> {
  let newName: string | null = null;
  for (const item of history_items || []) {
    if (item.field === "name") {
      newName = typeof item.after === "string" ? item.after : (item.after?.value ?? null);
      break;
    }
  }

  if (!newName) {
    console.log("[webhook] taskUpdated — no name change in history_items");
    return;
  }

  console.log(`[webhook] Task name updated: task=${task_id} newName="${newName}"`);

  const clickupApiKey = Deno.env.get("CLICKUP_API_KEY");
  if (!clickupApiKey) {
    console.warn("[webhook] CLICKUP_API_KEY not set — skipping Ad Set Name update");
    return;
  }

  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${task_id}/field/${AD_SET_NAME_FIELD_ID}`,
    {
      method: "POST",
      headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ value: newName }),
    },
  );

  if (!res.ok) {
    console.error(`[webhook] Ad Set Name update failed for task ${task_id}: ${await res.text()}`);
  } else {
    console.log(`[webhook] Ad Set Name synced for task ${task_id} → "${newName}"`);
  }
}

async function processWebhook(body: any): Promise<void> {
  const { event, task_id, history_items } = body;

  console.log(`[webhook] Received event: ${event}, task_id: ${task_id}`);

  if (!task_id) {
    console.log("[webhook] No task_id, skipping");
    return;
  }

  if (event === "taskCustomFieldUpdated") {
    await handlePriorityFieldUpdate(task_id, history_items);
    await handleStageFieldUpdate(task_id, history_items);
    return;
  }

  if (event === "taskUpdated") {
    await handleTaskNameUpdate(task_id, history_items);
    await handlePriorityFieldUpdate(task_id, history_items);
    await handleStageFieldUpdate(task_id, history_items);
    return;
  }

  if (event !== "taskStatusUpdated") {
    console.log(`[webhook] Ignoring event type: ${event}`);
    return;
  }

  // Extract new status from history_items
  let newStatus: string | null = null;
  if (history_items && Array.isArray(history_items)) {
    for (const item of history_items) {
      if (item.field === "status") {
        newStatus = item.after?.status ?? null;
        break;
      }
    }
  }

  if (!newStatus) {
    console.log("[webhook] No status change found in history_items, skipping");
    return;
  }

  console.log(`[webhook] New status: "${newStatus}"`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up statics_logs records by clickup_task_id
  const { data: records, error } = await findRecordsByTaskId(supabase, task_id);

  if (error) {
    console.error("[webhook] DB lookup error:", error);
    return;
  }

  if (!records || records.length === 0) {
    console.log(`[webhook] No statics_logs records found for clickup_task_id: ${task_id}`);
    return;
  }

  console.log(`[webhook] Found ${records.length} record(s) for task ${task_id}`);

  // Update clickup_task_status in all matching statics_logs records
  for (const record of records) {
    const { error: updateError } = await supabase
      .from("statics_logs")
      .update({ clickup_task_status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", record.id);

    if (updateError) {
      console.error(`[webhook] Failed to update statics_logs ${record.id}:`, updateError);
    } else {
      console.log(`[webhook] Updated statics_logs ${record.id} (ad_id: ${record.ad_id}) → "${newStatus}"`);
    }

    const { error: adsUpdateError } = await supabase
      .from("ads")
      .update({ list_status: newStatus })
      .eq("ad_id", record.ad_id);
    if (adsUpdateError) {
      console.error(`[webhook] Failed to update ads list_status for ad_id ${record.ad_id}:`, adsUpdateError);
    } else {
      console.log(`[webhook] ads ad_id=${record.ad_id} list_status → "${newStatus}"`);
    }
  }

  // Update Google Sheet status (column resolved by header name)
  const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID");
  if (!configSheetId) {
    console.warn("[webhook] GOOGLE_CONFIG_SHEET_ID not set — skipping sheet update");
    return;
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const revenueSources = await readRevenueSources(accessToken, configSheetId);

    const processedAdIds = new Set<number>();

    for (const record of records) {
      if (processedAdIds.has(record.ad_id)) continue;
      processedAdIds.add(record.ad_id);

      // Resolve Ad DB sheet for this product
      const revenueMatch = revenueSources.find((r) => matchProduct(record.product_name || "", r.product));
      if (!revenueMatch) {
        console.warn(`[webhook] No Ad DB SheetId found for product "${record.product_name}" (ad_id: ${record.ad_id})`);
        continue;
      }

      const adDbSheetId = revenueMatch.adDbSheetId;
      const tabName = (record.funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";
      const paddedAdId = formatAdId(record.ad_id);

      console.log(`[webhook] Searching for ad_id "${paddedAdId}" in sheet ${adDbSheetId}, tab "${tabName}"`);

      const rowIndex = await findAdDbRow(accessToken, adDbSheetId, tabName, paddedAdId);
      if (rowIndex === -1) {
        console.warn(`[webhook] Row not found for ad_id "${paddedAdId}" in tab "${tabName}"`);
        continue;
      }

      // Find Status column by header name (rows 1:2, picks the real header row)
      const statusColMap = await readHeaderMap(accessToken, adDbSheetId, tabName);
      const statusColIdx = statusColMap["status"] ?? -1;
      if (statusColIdx === -1) {
        console.warn(`[webhook] "status" column not found in "${tabName}" tab for ad_id ${record.ad_id}`);
        continue;
      }
      const statusColLetter = colIdxToLetter(statusColIdx);
      const cellRange = `'${tabName}'!${statusColLetter}${rowIndex + 1}`;
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${adDbSheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[newStatus]] }),
        },
      );

      if (!updateRes.ok) {
        console.error(`[webhook] Sheet update failed for ad_id "${paddedAdId}": ${await updateRes.text()}`);
      } else {
        console.log(`[webhook] Sheet updated: tab "${tabName}", row ${rowIndex + 1}, col ${statusColLetter} = "${newStatus}" (ad_id: ${record.ad_id})`);
      }
    }
  } catch (sheetErr) {
    console.error("[webhook] Sheet update failed:", sheetErr);
  }

  console.log(`[webhook] Done processing task ${task_id}`);
}
