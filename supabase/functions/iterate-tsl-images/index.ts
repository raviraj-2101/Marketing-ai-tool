import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPREADSHEET_ID = Deno.env.get("GOOGLE_CONFIG_SHEET_ID")!;

const FIELD_MAP = [
  { label: "Ad Id", id: "7b111c17-3b76-41b4-9708-2c99c9fdec2d", type: "short_text" },
  { label: "TSL Script", id: "0597568a-6060-40ed-8648-9b82f52f6ae4", type: "short_text" },
  { label: "Brand", id: "a5c44020-f416-411a-85fe-c05a71c86737", type: "drop_down" },
  { label: "Product", id: "9d2b68c9-1e27-4d21-ada6-29cdacae2315", type: "drop_down" },
  { label: "Cs", id: "715b59ce-68f9-45c6-9c0e-32fdf971180f", type: "users" },
  { label: "Batch", id: "8ce5aae5-4dbc-406f-9ff1-3a55cbe365dd", type: "short_text" },
  { label: "Created Date", id: "ff3821d6-7447-49f9-8a67-1d456ec2ca2c", type: "date" },
  { label: "Concept Name", id: "f0b9e5c4-1b0c-4139-bc54-5077f90275c7", type: "short_text" },
  { label: "# of Ads", id: "710a8543-a9b1-476d-b9c1-e6842cf045dd", type: "short_text" },
  { label: "Creation Method", id: "4c0d9833-0c69-4c0e-95eb-1bb977f1cfa1", type: "drop_down" },
  { label: "Funnel Type", id: "40db4572-af51-41a3-8c25-937bd3b4ded2", type: "drop_down" },
  { label: "Language", id: "89f0fa1a-d749-40d3-b448-dfe4bcb17a35", type: "short_text" },
  { label: "Stage", id: "eab52ea4-aef0-4ff3-aac6-6ea284e1b5e3", type: "drop_down" },
  { label: "Drive Folder", id: "b2ba579c-b23d-470e-8838-11e408513b3a", type: "short_text" },
  { label: "Log", id: "27207d21-619e-478d-95b8-51423836f405", type: "short_text" },
  { label: "TSL Script Link", id: "34250452-0ec3-462e-a22f-8773ca4586fc", type: "short_text" },
  { label: "Priority", id: "5927d263-c1f4-4a1a-b131-70cfa91aed8b", type: "drop_down" },
  { label: "Intended Platform", id: "d079985c-4032-4873-b376-4480c8939f9b", type: "drop_down" },
  { label: "Images", id: "00683847-5eae-4f63-849b-6b70dac8591b", type: "short_text" },
  { label: "Brief (Docs)", id: "ecb82263-5d73-459d-8753-bc108cfa4826", type: "short_text" },
];

const AD_SET_NAME_FIELD_ID = "7b311585-e935-45d2-9b95-47c5b3a978f2";
const AD_TYPE_FIELD_ID = "f323f950-5191-4b61-bdb0-1d6a8709209c";
const AD_TYPE_OPTION_IDS: Record<string, string> = {
  vid: "2aa3802e-eb77-4709-8368-31a68e47e9aa",
  tsl: "faaf14f6-2d9b-4330-b978-86c605069ce6",
  img: "29b19ebf-2f7d-4062-9553-ad477167546c",
};

const CONFIG_FIELD_COLUMNS: Record<string, { labelCol: number; valueCol: number; codeCol?: number }> = {
  "Brand": { labelCol: 4, valueCol: 6 },
  "Product": { labelCol: 11, valueCol: 13, codeCol: 12 },
  "Stage": { labelCol: 9, valueCol: 10 },
  "Funnel Type": { labelCol: 14, valueCol: 15 },
  "Creation Method": { labelCol: 38, valueCol: 39 },
  "Priority": { labelCol: 16, valueCol: 17 },
  "Intended Platform": { labelCol: 36, valueCol: 37 },
};

const PRODUCT_CLICKUP_LISTS = {
  'GL':    Deno.env.get("CLICKUP_LIST_GL_READY_TO_LAUNCH"),
  'LYMPH': Deno.env.get("CLICKUP_LIST_LYMPH_READY_TO_LAUNCH"),
  'SOUR':  Deno.env.get("CLICKUP_LIST_SOUR_READY_TO_LAUNCH"),
  'BO':    Deno.env.get("CLICKUP_LIST_BO_READY_TO_LAUNCH"),
  'PF':    Deno.env.get("CLICKUP_LIST_PF_READY_TO_LAUNCH"),
  'MC':    Deno.env.get("CLICKUP_LIST_MUSH_READY_TO_LAUNCH"),
  'OREG':  Deno.env.get("CLICKUP_LIST_OREG_READY_TO_LAUNCH"),
  'PARA':  Deno.env.get("CLICKUP_LIST_PARA_READY_TO_LAUNCH"),
  'GLB':   Deno.env.get("CLICKUP_LIST_GLB_READY_TO_LAUNCH"),
};

// ── Helpers ──

function padAdId(adId: number): string {
  return String(adId).padStart(6, "0");
}

function formatDateMMDDYY(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

function getBatchString(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `Y${yy}W${String(weekNo).padStart(2, "0")}`;
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

interface ConfigMappings {
  labelToId: Record<string, Record<string, string>>;
  labels: Record<string, string[]>;
  originalLabels: Record<string, Record<string, string>>;
  activeStageLabels: string[];
}

async function readConfigSheet(accessToken: string): Promise<ConfigMappings> {
  const range = `'IMG/TSL/VID Config'!A:AN`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];
  const labelToId: Record<string, Record<string, string>> = {};
  const labels: Record<string, string[]> = {};
  const originalLabels: Record<string, Record<string, string>> = {};
  const activeStageLabels: string[] = [];

  if (rows.length < 3) return { labelToId, labels, originalLabels, activeStageLabels };

  for (const [fieldName, cols] of Object.entries(CONFIG_FIELD_COLUMNS)) {
    labelToId[fieldName] = {};
    labels[fieldName] = [];
    originalLabels[fieldName] = {};
    for (let i = 2; i < rows.length; i++) {
      const label = rows[i]?.[cols.labelCol] || "";
      const value = rows[i]?.[cols.valueCol] || "";
      if (label) {
        labelToId[fieldName][label.toLowerCase()] = value;
        labels[fieldName].push(label);
        originalLabels[fieldName][label.toLowerCase()] = label;
      }
      // Also index by code column (e.g. "GL" → same UUID) so productCode lookups work
      if (cols.codeCol !== undefined) {
        const code = rows[i]?.[cols.codeCol] || "";
        if (code && value) labelToId[fieldName][code.toLowerCase()] = value;
      }
    }
  }

  // Build activeStageLabels: Stage labels (col E) where Status (col G, index 6) is "Active"
  for (let i = 2; i < rows.length; i++) {
    const stageLabel = rows[i]?.[4] || "";
    const statusValue = rows[i]?.[6] || "";
    if (stageLabel && statusValue === "Active") {
      activeStageLabels.push(stageLabel);
    }
  }

  return { labelToId, labels, originalLabels, activeStageLabels };
}

async function readAdDbSheetForProduct(
  accessToken: string,
  productCode: string,
): Promise<string | null> {
  const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID")!;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent("'Revenue Sources Sync'!A:AB")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];
  if (rows.length < 2) return null;

  const header = rows[0].map((h) => (h || "").toLowerCase().trim());
  const productCodeCol = header.findIndex((h) => h === "product code");
  const adDbCol = header.findIndex(
    (h) => h.includes("ad db sheet") || h.includes("ad db shield"),
  );

  if (productCodeCol === -1 || adDbCol === -1) {
    console.warn(
      `Revenue Sources Sync: columns not found. productCodeCol=${productCodeCol}, adDbCol=${adDbCol}`,
    );
    return null;
  }

  const target = productCode.toLowerCase().trim();
  for (let i = 1; i < rows.length; i++) {
    const rowCode = (rows[i]?.[productCodeCol] || "").toLowerCase().trim();
    if (rowCode === target) {
      return rows[i]?.[adDbCol]?.trim() || null;
    }
  }
  return null;
}

function matchProduct(productName: string, configProduct: string): boolean {
  if (!productName || !configProduct) return false;
  const pLower = productName.toLowerCase();
  const cLower = configProduct.toLowerCase();
  return pLower.includes(cLower) || cLower.includes(pLower);
}

async function readDropdowns(
  accessToken: string,
  configSheetId: string,
): Promise<Array<{ product: string; listType: string; clickupListId: string }>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent("'IMG/TSL/VID Config'!AF:AH")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];
  const result: Array<{ product: string; listType: string; clickupListId: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    const product = rows[i]?.[0] || "";
    const listType = rows[i]?.[1] || "";
    const clickupListId = rows[i]?.[2] || "";
    if (product && listType && clickupListId) {
      result.push({ product, listType, clickupListId });
    }
  }
  return result;
}

function getOriginalLabel(config: ConfigMappings, fieldName: string, value: string): string {
  if (!value) return "";
  return config.originalLabels[fieldName]?.[value.toLowerCase()] || value;
}

// ── Drive helpers ──

function extractFolderIdFromLink(link: string): string | null {
  // Handle links like https://drive.google.com/drive/folders/FOLDER_ID or /drive/u/0/folders/FOLDER_ID
  const match = link.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function getDriveFolderMeta(accessToken: string, folderId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name,parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive folder meta failed: ${await res.text()}`);
  return await res.json();
}


async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<string> {
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!createRes.ok) throw new Error(`Create folder failed: ${await createRes.text()}`);
  const created = await createRes.json();
  console.log(`[iterate-tsl-images] Created root folder: ${name} (${created.id})`);
  return created.id;
}

async function findSubfolderByName(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string | null> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function copyFolderFiles(
  accessToken: string,
  srcId: string,
  dstId: string,
  oldAdId: string,
  newAdId: string,
): Promise<void> {
  let pageToken: string | undefined;
  const files: Array<{ id: string; name: string }> = [];
  do {
    const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
    listUrl.searchParams.set(
      "q",
      `'${srcId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
    );
    listUrl.searchParams.set("fields", "nextPageToken,files(id,name)");
    listUrl.searchParams.set("pageSize", "1000");
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
    const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const listData = await listRes.json();
    files.push(...(listData.files || []));
    pageToken = listData.nextPageToken;
  } while (pageToken);

  console.log(`[iterate-tsl-images] Copying ${files.length} files from ${srcId} → ${dstId}`);
  for (const file of files) {
    const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/copy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name.replace(oldAdId, newAdId), parents: [dstId] }),
    });
    if (!copyRes.ok) {
      console.warn(`[iterate-tsl-images] Failed to copy file ${file.name}: ${await copyRes.text()}`);
    }
  }
}

async function findOrCreateFolder(
  name: string,
  parentId: string,
  accessToken: string,
): Promise<string> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) {
    console.log(`[iterate-tsl-images] Reusing existing folder: ${name} (${listData.files[0].id})`);
    return listData.files[0].id;
  }
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const created = await createRes.json();
  if (!created.id) {
    throw new Error(`Failed to create folder "${name}": ${JSON.stringify(created)}`);
  }
  console.log(`[iterate-tsl-images] Created folder: ${name} (${created.id})`);
  return created.id;
}

async function findOrCreateDoc(
  name: string,
  parentId: string,
  accessToken: string,
): Promise<string> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
  );
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) {
    console.log(`[iterate-tsl-images] Reusing existing doc: ${name} (${listData.files[0].id})`);
    return listData.files[0].id;
  }
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.document", parents: [parentId] }),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error(`Failed to create doc "${name}": ${JSON.stringify(created)}`);
  console.log(`[iterate-tsl-images] Created doc: ${name} (${created.id})`);
  return created.id;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { source_ad_id, tsl_script_id } = body;

    if (!source_ad_id || !tsl_script_id) {
      return new Response(
        JSON.stringify({ success: false, error: "source_ad_id and tsl_script_id are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const sourceAdIdNum = parseInt(String(source_ad_id).replace(/^0+/, "") || "0", 10);
    console.log(`Iterating TSL images: source_ad_id=${sourceAdIdNum}, tsl_script_id=${tsl_script_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY")!;
    const now = new Date();

    // ── 1. Validate source ad ──
    const { data: sourceAd, error: sourceErr } = await supabase
      .from("statics_logs")
      .select("*")
      .eq("ad_id", sourceAdIdNum)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sourceErr || !sourceAd) {
      throw new Error(`Source ad ${sourceAdIdNum} not found: ${sourceErr?.message || "no record"}`);
    }

    const driveLink = sourceAd.image_generation_drive_link || sourceAd.drive_link;
    if (!driveLink) {
      throw new Error(`Source ad ${sourceAdIdNum} has no Drive link`);
    }

    const sourceFolderId = extractFolderIdFromLink(driveLink);
    if (!sourceFolderId) {
      throw new Error(`Could not extract folder ID from link: ${driveLink}`);
    }

    // ── 2. Get Google access token + source folder meta + Config sheet ──
    const accessToken = await getGoogleAccessToken();
    const [folderMeta, config] = await Promise.all([
      getDriveFolderMeta(accessToken, sourceFolderId),
      readConfigSheet(accessToken),
    ]);

    const sourceFolderName = folderMeta.name;
    const parentFolderId = folderMeta.parents?.[0];
    console.log(`Source folder: ${sourceFolderName}, parent: ${parentFolderId}`);

    // ── 3. Generate new ad_id ──
    const { data: maxData } = await supabase
      .from("ads")
      .select("ad_id")
      .order("ad_id", { ascending: false })
      .limit(1)
      .single();

    const newAdId = (maxData?.ad_id || 0) + 1;
    const paddedNewAdId = padAdId(newAdId);
    const paddedSourceAdId = padAdId(sourceAdIdNum);
    const weekString = getBatchString(now);
    console.log(`New ad_id: ${newAdId} (${paddedNewAdId})`);

    // ── 4. Create new Drive folder structure and copy images ──
    const newFolderName = sourceFolderName.replace(paddedSourceAdId, paddedNewAdId);
    const newFolderId = await createDriveFolder(accessToken, newFolderName, parentFolderId);
    const newDriveLink = `https://drive.google.com/drive/folders/${newFolderId}`;
    console.log(`New folder created: ${newDriveLink}`);

    // Create Images/ subfolder first, then copy source files into it
    const imagesFolderId   = await findOrCreateFolder("Images", newFolderId, accessToken);
    const imagesFolderLink = `https://drive.google.com/drive/folders/${imagesFolderId}`;

    // Prefer source's Images/ subfolder; fall back to source root for older ad structure
    const sourceImagesFolderId = await findSubfolderByName(accessToken, sourceFolderId, "Images") ?? sourceFolderId;
    await copyFolderFiles(accessToken, sourceImagesFolderId, imagesFolderId, paddedSourceAdId, paddedNewAdId);

    const briefDocId = await findOrCreateDoc(`${paddedNewAdId}_Image Brief`, newFolderId, accessToken);
    const imageBriefLink   = briefDocId
      ? `https://docs.google.com/document/d/${briefDocId}/edit`
      : "";

    const csShort = sourceAd.cs ? sourceAd.cs.split("@")[0] : "";

    // ── 5. Look up CS ClickUp user ID ──
    let csClickupUserId: number | null = null;
    if (sourceAd.cs) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const tryFetch = async (url: string) => {
          const r = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
          const d = await r.json();
          return Array.isArray(d) && d[0]?.clickup_user_id ? Number(d[0].clickup_user_id) : null;
        };
        csClickupUserId =
          await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&value=eq.${encodeURIComponent(sourceAd.cs)}&limit=1`) ??
          (csShort ? await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&label=eq.${encodeURIComponent(csShort)}&limit=1`) : null);
        if (csClickupUserId) {
          console.log(`[iterate-tsl-images] CS "${sourceAd.cs}" → ClickUp user ID: ${csClickupUserId}`);
        } else {
          console.warn(`[iterate-tsl-images] No ClickUp user ID found for CS "${sourceAd.cs}"`);
        }
      } catch (e) {
        console.warn("[iterate-tsl-images] CS ClickUp lookup failed:", e);
      }
    }

    // ── 6. Look up TSL Script gdoc_link and gfolder_link ──
    const tslIdString = String(tsl_script_id).trim();
    let tslGdocLink = "";
    let tslGfolderLink = "";
    let tslIdNum = 0;
    if (tslIdString) {
      const { data: tslData } = await supabase
        .from("tsl_scripts")
        .select("gdoc_link, gfolder_link")
        .eq("tsl_script_id", tslIdString)
        .maybeSingle();
      tslGdocLink = tslData?.gdoc_link || "";
      tslGfolderLink = tslData?.gfolder_link || "";
      tslIdNum = parseInt(tslIdString.replace(/^0+/, "") || "0", 10);
      console.log(`[iterate-tsl-images] TSL Script lookup - tslIdString="${tslIdString}", found=${!!tslData}, gdoc_link="${tslGdocLink}", gfolder_link="${tslGfolderLink}"`);
    } else {
      console.warn(`[iterate-tsl-images] No TSL Script ID provided (tsl_script_id=${tsl_script_id})`);
    }

    // ── 7. Insert new statics_logs record ──
    const newLogId = crypto.randomUUID();
    const { error: insertErr } = await supabase
      .from("statics_logs")
      .insert({
        id: newLogId,
        ad_id: newAdId,
        brand_name: sourceAd.brand_name,
        brand_id: sourceAd.brand_id,
        product_name: sourceAd.product_name,
        product_id: sourceAd.product_id,
        cs: sourceAd.cs,
        concept_name: sourceAd.concept_name,
        number_of_ads: sourceAd.number_of_ads,
        funnel: sourceAd.funnel,
        language: sourceAd.language || "EN",
        max_variations_per_ad_group: sourceAd.max_variations_per_ad_group,
        week: weekString,
        creation_method: sourceAd.creation_method || "Auto",
        stage: "Ready to Launch",
        status: "Ready",
        image_generation_drive_link: newDriveLink,
        tsl_script_id: String(tsl_script_id),
        file_naming_convention: sourceAd.file_naming_convention
          ? sourceAd.file_naming_convention.replace(paddedSourceAdId, paddedNewAdId)
          : null,
        inspo_links: sourceAd.inspo_links,
        title: sourceAd.title,
        subtitle: sourceAd.subtitle,
        design_elements: sourceAd.design_elements,
        is_multiple: sourceAd.is_multiple,
        logo_name: sourceAd.logo_name,
        is_cta_button: sourceAd.is_cta_button,
        cta_button_text: sourceAd.cta_button_text,
        is_badge: sourceAd.is_badge,
        badge_text: sourceAd.badge_text,
        prompt: sourceAd.prompt,
        prompt_for_images: sourceAd.prompt_for_images,
        selected_images: sourceAd.selected_images,
        description: sourceAd.description,
        generation_id: crypto.randomUUID(),
        drive_link: sourceAd.drive_link || null,
        priority: sourceAd.priority || null,
        products_to_show: sourceAd.products_to_show || null,
        intended_chanel: sourceAd.intended_chanel || "Meta",
        images_folder_link: imagesFolderLink || null,
        image_brief_link: imageBriefLink || null,
        clickup_task_status: "to do",
      });

    if (insertErr) {
      throw new Error(`Insert statics_logs failed: ${insertErr.message}`);
    }
    console.log(`Inserted new statics_logs record: ${newLogId}`);

    // ── 7b. Rename TSL folder & doc ──
    if (tslIdNum && (tslGfolderLink || tslGdocLink)) {
      try {
        const paddedTslId = String(tslIdNum).padStart(6, "0");
        const renameName = `${paddedTslId}_${sourceAd.cs || ""}${sourceAd.concept_name ? `_${sourceAd.concept_name}` : ""}`;
        const folderId = tslGfolderLink?.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];
        const docId = tslGdocLink?.match(/document\/d\/([a-zA-Z0-9_-]+)/)?.[1];

        const renamePromises: Promise<any>[] = [];
        for (const fileId of [folderId, docId].filter(Boolean)) {
          renamePromises.push(
            fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name: renameName }),
            }).then(async (r) => {
              if (!r.ok) console.error(`Drive rename failed for ${fileId}: ${r.status} ${await r.text()}`);
              else console.log(`Renamed Drive file ${fileId} to: ${renameName}`);
            })
          );
        }
        await Promise.all(renamePromises);
      } catch (renameErr) {
        console.error("TSL rename error:", renameErr);
      }
    }

    // ── 8. Get original-case labels ──
    const originalFunnelType = getOriginalLabel(config, "Funnel Type", sourceAd.funnel || "");
    const originalBrand = getOriginalLabel(config, "Brand", sourceAd.brand_name || "");
    const originalProduct = getOriginalLabel(config, "Product", sourceAd.product_name || "");

    // ── 9. Resolve brand_code + product_code from DB ──
    let brandCode = "";
    let productCode = "";
    if (sourceAd.brand_id) {
      const { data: brandData } = await supabase
        .from("brands")
        .select("brand_code")
        .eq("id", sourceAd.brand_id)
        .maybeSingle();
      brandCode = brandData?.brand_code || "";
    }
    if (sourceAd.product_id) {
      const { data: prodData } = await supabase
        .from("products")
        .select("product_code")
        .eq("id", sourceAd.product_id)
        .maybeSingle();
      productCode = prodData?.product_code || "";
    }

    // ── 9b. Resolve target Ad DB spreadsheet from Revenue Sources Sync ──
    let targetSpreadsheetId = SPREADSHEET_ID;
    if (productCode) {
      const resolvedSheetId = await readAdDbSheetForProduct(accessToken, productCode);
      if (resolvedSheetId) {
        targetSpreadsheetId = resolvedSheetId;
        console.log(`Using product sheet: ${targetSpreadsheetId} for product code: ${productCode}`);
      } else {
        console.warn(`No Ad DB sheet found for product: ${productCode}, using default`);
      }
    }

    // ── 9c. Resolve ClickUp list ID from Dropdowns config ──
    const funnelType = (sourceAd.funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";
    const normalizedProductCode = productCode.toUpperCase().trim();
    const clickupListId = PRODUCT_CLICKUP_LISTS[normalizedProductCode] || null;
    console.log("🚀 ~ clickupListId:", clickupListId)
    if (!clickupListId) {
      console.warn(`[iterate-tsl-images] No ClickUp list ID for product "${sourceAd.product_name}" / funnel "${funnelType}"`);
    } else {
      console.log(`[iterate-tsl-images] Resolved ClickUp list ID: ${clickupListId}`);
    }

    // ── 10. Create ClickUp task ──
    const taskNameParts = [
      paddedNewAdId,
      tsl_script_id || "NONE",
      sourceAd.number_of_ads ? `V${sourceAd.number_of_ads}` : "",
      brandCode,
      productCode,
      weekString,
      sourceAd.concept_name || "",
      funnelType,
      sourceAd.creation_method || "Auto",
      originalFunnelType || "",
      csShort ? `CS.${csShort}` : "",
      sourceAd.language || "EN",
    ].filter(Boolean);
    const taskName = taskNameParts.join("_");

    const customFields: any[] = [];
    const fieldValues: Record<string, string> = {
      "Ad Id": paddedNewAdId,
      "TSL Script": String(tsl_script_id),
      "Brand": sourceAd.brand_name || "",
      "Product": sourceAd.product_name || "",
      "Concept Name": sourceAd.concept_name || "",
      "# of Ads": sourceAd.number_of_ads || "",
      "Funnel Type": sourceAd.funnel || "",
      "Language": sourceAd.language || "EN",
      "Creation Method": sourceAd.creation_method || "Auto",
      "Batch": weekString,
      "Log": `${(Deno.env.get("APP_BASE_URL") || "").replace(/\/$/, "")}/statics-generator?ad_id=${paddedNewAdId}`,
      "Drive Folder": newDriveLink,
      "Images": imagesFolderLink,
      "Brief (Docs)": imageBriefLink,
      "Intended Platform": sourceAd.intended_chanel || "Meta",
      "Stage": "Ready to Launch",
      "TSL Script Link": tslGdocLink || "",
    };

    for (const field of FIELD_MAP) {
      if (field.type === "users") {
        if (csClickupUserId) {
          customFields.push({ id: field.id, value: { add: [csClickupUserId] } });
        }
        continue;
      }
      const value = fieldValues[field.label];
      if (value === undefined) continue;
      if (field.type === "short_text") {
        customFields.push({ id: field.id, value });
        if (!value) {
          console.warn(`[iterate-tsl-images] ⚠️ Short text "${field.label}" is EMPTY but still added to ClickUp payload`);
        }
      } else if (field.type === "drop_down") {
        if (value) {
          let optionId = config.labelToId[field.label]?.[value.toLowerCase()];
          if (!optionId && field.label === "Product" && productCode) {
            optionId = config.labelToId[field.label]?.[productCode.toLowerCase()];
          }
          if (!optionId && field.label === "Brand" && brandCode) {
            optionId = config.labelToId[field.label]?.[brandCode.toLowerCase()];
          }
          if (optionId) {
            customFields.push({ id: field.id, value: optionId });
            console.log(`[iterate-tsl-images] ClickUp dropdown ${field.label}: "${value}" → ${optionId}`);
          } else {
            console.warn(`[iterate-tsl-images] No option ID for ${field.label}="${value}"`);
          }
        }
      }
    }

    // Created Date
    const createdDateField = FIELD_MAP.find(f => f.label === "Created Date");
    if (createdDateField) {
      customFields.push({ id: createdDateField.id, value: now.getTime() });
    }

    // Ad Set Name
    customFields.push({ id: AD_SET_NAME_FIELD_ID, value: taskName });

    // Ad Type resolved from funnel
    const funnelLowerForType = (sourceAd.funnel || "").toLowerCase();
    const adTypeOptionId = funnelLowerForType === "tsl" ? AD_TYPE_OPTION_IDS.tsl
      : funnelLowerForType === "vid" ? AD_TYPE_OPTION_IDS.vid
      : AD_TYPE_OPTION_IDS.img;
    customFields.push({ id: AD_TYPE_FIELD_ID, value: adTypeOptionId });
    console.log(`[iterate-tsl-images] Ad Type: "${funnelLowerForType}" → ${adTypeOptionId}`);

    console.log("[iterate-tsl-images] customFields count:", customFields.length);
    console.log("[iterate-tsl-images] customFields:", JSON.stringify(customFields, null, 2));
    console.log("[iterate-tsl-images] taskName:", taskName);
    console.log("[iterate-tsl-images] clickupListId:", clickupListId);
    console.log("[iterate-tsl-images] fieldValues:", JSON.stringify(fieldValues, null, 2));
    console.log("[iterate-tsl-images] TSL Script Link value:", fieldValues["TSL Script Link"], "tslGdocLink:", tslGdocLink);

    let clickupTaskId = "";
    let clickupTaskUrl = "";
    if (!clickupListId || !clickupApiKey) {
      console.warn("[iterate-tsl-images] Skipping ClickUp task creation — no list ID or API key");
    } else {
      const clickupPayload = { name: taskName, status: "to do", custom_fields: customFields };

      console.log("\n" + "=".repeat(80));
      console.log("[iterate-tsl-images] 📤 CLICKUP TASK PAYLOAD");
      console.log("=".repeat(80));
      console.log("Task Name:", taskName);
      console.log("List ID:", clickupListId);
      console.log("Total Custom Fields:", customFields.length);
      console.log("\nCustom Fields Detail:");
      customFields.forEach((cf, idx) => {
        const fieldLabel = FIELD_MAP.find(f => f.id === cf.id)?.label || "Unknown";
        console.log(`  [${idx}] ${fieldLabel} (${cf.id}): ${JSON.stringify(cf.value)}`);
      });
      console.log("\nFull Payload JSON:");
      console.log(JSON.stringify(clickupPayload, null, 2));
      console.log("=".repeat(80) + "\n");

      const clickupRes = await fetch(
        `https://api.clickup.com/api/v2/list/${clickupListId}/task`,
        {
          method: "POST",
          headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(clickupPayload),
        }
      );
      const clickupData = await clickupRes.json();

      if (!clickupRes.ok) {
        console.error("\n" + "=".repeat(80));
        console.error("[iterate-tsl-images] ❌ CLICKUP API ERROR");
        console.error("=".repeat(80));
        console.error("Status:", clickupRes.status);
        console.error("Error Response:", JSON.stringify(clickupData, null, 2));
        console.error("=".repeat(80) + "\n");
        throw new Error(`ClickUp task creation failed: ${clickupData.err || JSON.stringify(clickupData)}`);
      }

      clickupTaskId = clickupData.id;
      clickupTaskUrl = clickupData.url;

      console.log("\n" + "=".repeat(80));
      console.log("[iterate-tsl-images] ✅ CLICKUP TASK CREATED SUCCESSFULLY");
      console.log("=".repeat(80));
      console.log("Task ID:", clickupTaskId);
      console.log("Task URL:", clickupTaskUrl);
      console.log("Custom Fields Accepted:", clickupData.custom_fields?.length || 0);
      if (clickupData.custom_fields) {
        clickupData.custom_fields.forEach((cf: any) => {
          console.log(`  - ${cf.name}: ${JSON.stringify(cf.value)}`);
        });
      }
      console.log("=".repeat(80) + "\n");
    }

    // ── 10b. Insert new ads record ──
    const { error: adsInsertErr } = await supabase
      .from("ads")
      .insert({
        ad_id: newAdId,
        script_id: String(tsl_script_id),
        brand: brandCode || sourceAd.brand_name || null,
        product: productCode || sourceAd.product_name || null,
        cs: csShort || null,
        batch_week: weekString,
        created_date: formatDateMMDDYY(now),
        clickup_link: clickupTaskUrl || null,
        clickup_task_id: clickupTaskId || null,
        concept_name: sourceAd.concept_name || null,
        ad_format: null,
        funnel: originalFunnelType || sourceAd.funnel || null,
        language: sourceAd.language || "EN",
        intended_platform: sourceAd.intended_chanel || "Meta",
        g_drive_link: newDriveLink || null,
        ad_brief_doc: imageBriefLink || null,
        status: "to do",
        pipeline_status: "Ready to Launch",
        priority: sourceAd.priority || null,
      });

    if (adsInsertErr) {
      console.error(`[iterate-tsl-images] ads insert failed: ${adsInsertErr.message}`);
    } else {
      console.log(`[iterate-tsl-images] Inserted into ads: ad_id=${newAdId}`);
    }

    // ── 11. Read TSL sheet header row to build dynamic column map ──
    const sheetName = "TSL";

    const tslHeaderRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!2:2`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const tslHeaderData = await tslHeaderRes.json();
    const tslHeaders: string[] = tslHeaderData.values?.[0] || [];
    const colMap: Record<string, number> = {};
    tslHeaders.forEach((h: string, i: number) => { if (h?.trim()) colMap[h.trim()] = i; });
    console.log("[iterate-tsl-images] TSL colMap:", JSON.stringify(colMap));

    const numCols = Math.max(tslHeaders.length, 26);
    const row = new Array(numCols).fill("");

    const logUrl = `${(Deno.env.get("APP_BASE_URL") || "").replace(/\/$/, "")}/statics-generator?ad_id=${paddedNewAdId}`;

    const setCol = (name: string, value: string) => {
      if (colMap[name] !== undefined) row[colMap[name]] = value;
      else console.warn(`[iterate-tsl-images] Column not found in TSL header: "${name}"`);
    };

    setCol("Ad ID",         "'" + paddedNewAdId);
    setCol("Brand",         brandCode || "");
    setCol("Product",       productCode || "");
    setCol("CS",            csShort || "");
    setCol("Batch Week",    weekString);
    setCol("Created Date",  formatDateMMDDYY(now));
    setCol("Concept Name",  sourceAd.concept_name || "");
    setCol("# of Images",   String(sourceAd.max_variations_per_ad_group || ""));
    setCol("TSL ID",        String(tsl_script_id));
    setCol("Funnel",        funnelType);
    setCol("Language",      sourceAd.language || "EN");
    setCol("Status",        "to do");
    setCol("Stage",         "Ready to Launch");
    setCol("Intended Chanel", sourceAd.intended_chanel || "Meta");
    if (newDriveLink) setCol("G-Drive", `=HYPERLINK("${newDriveLink}","link")`);
    if (imagesFolderLink) setCol("Images", `=HYPERLINK("${imagesFolderLink}","link")`);
    if (imageBriefLink) setCol("Images Brief", `=HYPERLINK("${imageBriefLink}","link")`);
    setCol("LOG",           `=HYPERLINK("${logUrl}","link")`);
    if (clickupTaskUrl) setCol("ClickUp", `=HYPERLINK("${clickupTaskUrl}","link")`);
    setCol("Click Up Task Id", clickupTaskId || "");

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
      }
    );

    const appendData = await appendRes.json();
    if (appendData.error) {
      throw new Error(`Sheet append failed: ${JSON.stringify(appendData.error)}`);
    }
    console.log("Sheet row appended");

    // ── 11b. Clear inherited formatting on new row ──
    const updatedRange = appendData.updates?.updatedRange;
    console.log(`[iterate-tsl-images] updatedRange=${updatedRange} | colMap.Stage=${colMap["Stage"]} | stageLabels=${JSON.stringify(config.labels["Stage"])}`);
    const rowMatch = updatedRange?.match(/:.*?(\d+)$/);
    if (!rowMatch) {
      console.warn(`[iterate-tsl-images] rowMatch is null — formatting block skipped. updatedRange="${updatedRange}"`);
    }
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1]) - 1;
      const sheetIdRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const sheetIdData = await sheetIdRes.json();
      const adsDbSheet = sheetIdData.sheets?.find((s: any) => s.properties.title === "TSL");
      const sheetId = adsDbSheet?.properties?.sheetId || 0;

      // Helper: 0-based index → column letter (A, B, …, Z, AA, …)
      const cl = (name: string): string => {
        const idx = colMap[name];
        if (idx === undefined) { console.warn(`[iterate-tsl-images] colMap missing: "${name}"`); return "A"; }
        if (idx < 26) return String.fromCharCode(65 + idx);
        return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
      };

      const reqs: any[] = [
        // Clear all formatting on the new row
        {
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: numCols },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 }, fontSize: 10 },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
      ];

      // Ad ID column → plain text format
      const adIdColIdx = colMap["Ad ID"];
      if (adIdColIdx !== undefined) {
        reqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: adIdColIdx, endColumnIndex: adIdColIdx + 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "TEXT", pattern: "@" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        });
      }

      // Created Date column → date format
      const createdDateIdx = colMap["Created Date"];
      if (createdDateIdx !== undefined) {
        reqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: createdDateIdx, endColumnIndex: createdDateIdx + 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "MM-dd-yy" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        });
      }

      // Link columns → blue underline + automatic number format
      for (const linkName of ["Drive Folder", "Images", "Images Brief", "LOG", "ClickUp"]) {
        const ci = colMap[linkName];
        if (ci !== undefined) {
          reqs.push({
            repeatCell: {
              range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: ci, endColumnIndex: ci + 1 },
              cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 }, underline: true } } },
              fields: "userEnteredFormat.textFormat(foregroundColor,underline)",
            },
          });
          reqs.push({
            repeatCell: {
              range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: ci, endColumnIndex: ci + 1 },
              cell: { userEnteredFormat: { numberFormat: { type: "NUMBER_FORMAT_TYPE_UNSPECIFIED", pattern: "" } } },
              fields: "userEnteredFormat.numberFormat",
            },
          });
        }
      }

      // Script ID dropdown via named range
      const scriptIdIdx = colMap["Script ID"];
      if (scriptIdIdx !== undefined) {
        reqs.push({
          setDataValidation: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: scriptIdIdx, endColumnIndex: scriptIdIdx + 1 },
            rule: {
              condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: "'TSL Scripts'!$A$2:$A" }] },
              showCustomUi: true,
              strict: false,
            },
          },
        });
      }

      // List dropdowns by column name
      const dropdownColumns = [
        { name: "Funnel Type",   values: ["IMG", "VID", "TSL"] as string[] },
        { name: "Status",   values: config.activeStageLabels || [] as string[] },
        { name: "Stage",    values: config.labels["Stage"] || [] as string[] },
        { name: "Priority", values: config.labels["Priority"] || [] as string[] },
      ];
      for (const dd of dropdownColumns) {
        const ci = colMap[dd.name];
        if (ci !== undefined && dd.values.length > 0) {
          reqs.push({
            setDataValidation: {
              range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: ci, endColumnIndex: ci + 1 },
              rule: {
                condition: { type: "ONE_OF_LIST", values: dd.values.map((v: string) => ({ userEnteredValue: v })) },
                showCustomUi: true,
                strict: false,
              },
            },
          });
        }
      }

      const formatRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests: reqs }),
        }
      );
      if (formatRes.ok) {
        console.log("Row formatting applied");
      } else {
        console.warn("Format failed:", await formatRes.text());
      }

      // ── 11c. Write formulas using dynamic column letters from colMap ──
      const r = parseInt(rowMatch[1]);

      const aL = cl("Ad ID");
      const bL = cl("Brand");
      const cL = cl("Product");
      const dL = cl("CS");
      const eL = cl("Batch Week");
      const gL = cl("Concept Name");
      const hL = cl("# of Images");
      const iL = cl("Script ID");
      const jL = cl("TSL ID");
      const kL = cl("Script Variation");
      const lL = cl("Funnel");
      const nL = cl("Language");
      const wL = cl("Ad Set Name");
      const xL = cl("Ad Name Template");

      const adSetNameFormula      = `=${aL}${r}&"_"&IF(${jL}${r}="","NONE",${jL}${r})&"_V"&${hL}${r}&"_"&${bL}${r}&"_"&${cL}${r}&"_"&${eL}${r}&"_"&${gL}${r}&"_"&${lL}${r}&"_Auto_"&${lL}${r}&"_CS."&${dL}${r}&"_"&${nL}${r}`;
      const adNameTemplateFormula = `=${aL}${r}&"_"&IF(${jL}${r}="","NONE",${jL}${r})&"_"&${bL}${r}&"_"&${cL}${r}&"_"&${eL}${r}&"_"&${gL}${r}&"_"&${lL}${r}&"_Auto_"&${lL}${r}&"_CS."&${dL}${r}&"_"&${nL}${r}`;
      const coreIdFormula         = `=IF(${jL}${r}<>"",INDEX('TSL Scripts'!A:Z,MATCH(${jL}${r},'TSL Scripts'!A:A,0),MATCH("Core ID",'TSL Scripts'!2:2,0)),"")`;
      const variationFormula      = `=IF(${jL}${r}<>"",INDEX('TSL Scripts'!A:Z,MATCH(${jL}${r},'TSL Scripts'!A:A,0),MATCH("Variation",'TSL Scripts'!2:2,0)),"")`;

      if (colMap["Ad Set Name"] !== undefined && colMap["Ad Name Template"] !== undefined) {
        const formulaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/'TSL'!${wL}${r}:${xL}${r}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [[adSetNameFormula, adNameTemplateFormula]] }),
          }
        );
        if (formulaRes.ok) {
          console.log(`Ad Set Name/Template formulas written to ${wL}:${xL}${r}`);

          // Read back computed Ad Set Name value and push to ClickUp
          if (clickupTaskId && clickupApiKey) {
            const readRes = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(`'TSL'!${wL}${r}`)}?valueRenderOption=FORMATTED_VALUE`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const readData = await readRes.json();
            const adSetNameValue = readData.values?.[0]?.[0] || "";
            if (adSetNameValue) {
              const adSetNameFieldId = FIELD_MAP.find(f => f.label === "Ad Set Name")?.id;
              if (adSetNameFieldId) {
                const cuRes = await fetch(
                  `https://api.clickup.com/api/v2/task/${clickupTaskId}/field/${adSetNameFieldId}`,
                  {
                    method: "POST",
                    headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
                    body: JSON.stringify({ value: adSetNameValue }),
                  }
                );
                if (cuRes.ok) console.log(`[iterate-tsl-images] Ad Set Name set in ClickUp: ${adSetNameValue}`);
                else console.warn(`[iterate-tsl-images] Failed to set Ad Set Name in ClickUp:`, await cuRes.text());
              }
            }
          }
        } else {
          console.warn("Failed to write naming formulas:", await formulaRes.text());
        }
      }

      if (colMap["Script ID"] !== undefined) {
        const coreIdRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/'TSL'!${iL}${r}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [[coreIdFormula]] }),
          }
        );
        if (!coreIdRes.ok) console.warn(`Failed to write Core ID formula to ${iL}:`, await coreIdRes.text());
        else console.log(`Core ID formula written to ${iL}${r}`);
      }

      if (colMap["Script Variation"] !== undefined) {
        const variationRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/'TSL'!${kL}${r}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [[variationFormula]] }),
          }
        );
        if (!variationRes.ok) console.warn(`Failed to write Variation formula to ${kL}:`, await variationRes.text());
        else console.log(`Variation formula written to ${kL}${r}`);
      }
    }

    // ── 12. Update statics_logs with ClickUp info ──
    await supabase
      .from("statics_logs")
      .update({
        clickup_task_id: clickupTaskId,
        clickup_task_url: clickupTaskUrl,
      })
      .eq("id", newLogId);

    console.log("Done! New ad:", paddedNewAdId);

    return new Response(
      JSON.stringify({
        success: true,
        new_ad_id: paddedNewAdId,
        drive_link: newDriveLink,
        clickup_task_url: clickupTaskUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error in iterate-tsl-images:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
