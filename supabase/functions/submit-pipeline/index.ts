const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Constants ─────────────────────────────────────────────────────────────────

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

// Config sheet column mapping (A-B: Brand, C-D: Product, H-I: Funnel, J-K: Creation Method, N-O: Priority, P/R: Intended Chanel)
const CONFIG_FIELD_COLUMNS: Record<string, { labelCol: number; valueCol: number }> = {
  "Brand": { labelCol: 4, valueCol: 6 },
  "Product": { labelCol: 11, valueCol: 13 },
  "Funnel Type": { labelCol: 14, valueCol: 15 },
  "Creation Method": { labelCol: 38, valueCol: 39 },
  "Priority": { labelCol: 16, valueCol: 17 },
  "Intended Platform": { labelCol: 36, valueCol: 37 },
  "Stage": { labelCol: 9, valueCol: 10 },
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

interface ConfigMappings {
  labelToId: Record<string, Record<string, string>>;
  labels: Record<string, string[]>;
  originalLabels: Record<string, Record<string, string>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
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
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

function extractFolderId(driveLink: string): string | null {
  const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Extracts a Drive file ID from uc?export=view&id= or /file/d/ URLs (stage 1 generated images) */
function extractGdriveFileId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("fileId") || parsed.searchParams.get("id");
    if (id) return id;
  } catch { /* fall through */ }
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Strip characters that are invalid in Drive folder/file names */
function sanitize(str: string): string {
  return (str || "")
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

/** Returns e.g. "Y26W16" */
function getWeekString(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - ys.getTime()) / 86400000 + 1) / 7);
  return `Y${yy}W${String(weekNum).padStart(2, "0")}`;
}

/** Returns e.g. "04-15-26" */
function getDateString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

/** Returns e.g. "04.13.26.12.56.56" (MM.DD.YY.HH.MM.SS) */
function getTimestampString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  return `${mm}.${dd}.${yy}.${hh}.${min}.${sec}`;
}

/** Pads ad_id to 6 digits e.g. 50 → "000050" */
function formatAdId(n: number): string {
  return String(n).padStart(6, "0");
}

/** Returns e.g. "04-15-26" from a Date object */
function formatDateMMDDYY(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

// ── Config Sheet Helpers ───────────────────────────────────────────────────────

/** Reads the "Config" tab → ClickUp dropdown option ID mappings */
async function readConfigSheet(accessToken: string, spreadsheetId: string): Promise<ConfigMappings> {
  const range = `'IMG/TSL/VID Config'!A:AN`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];

  const labelToId: Record<string, Record<string, string>> = {};
  const labels: Record<string, string[]> = {};
  const originalLabels: Record<string, Record<string, string>> = {};

  if (rows.length < 3) {
    console.warn("[submit-pipeline] AI Static Config tab has fewer than 3 rows");
    return { labelToId, labels, originalLabels };
  }

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
    }
  }

  return { labelToId, labels, originalLabels };
}

function getOriginalLabel(config: ConfigMappings, fieldName: string, value: string): string {
  if (!value) return "";
  return config.originalLabels[fieldName]?.[value.toLowerCase()] || value;
}

/** Reads "Revenue Sources Sync" tab → product to Ad DB SheetId mapping */
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
      `[submit-pipeline] Revenue Sources Sync: could not find columns. productCol=${productCol}, adDbCol=${adDbCol}. Headers: ${header.join("|")}`,
    );
    return [];
  }

  console.log(`[submit-pipeline] Revenue Sources Sync: productCol=${productCol}, adDbCol=${adDbCol}`);

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

/** Reads "Dropdowns" tab columns AE/AF/AG → product + list type to ClickUp list ID */
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

  // First row is header (Product / List / Value), skip it
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

/** Bidirectional case-insensitive includes match */
function matchProduct(productName: string, configProduct: string): boolean {
  if (!productName || !configProduct) return false;
  const pLower = productName.toLowerCase();
  const cLower = configProduct.toLowerCase();
  return pLower.includes(cLower) || cLower.includes(pLower);
}

/** Converts a 0-based column index to a spreadsheet column letter (e.g. 0→A, 25→Z, 26→AA) */
function colIndexToLetter(idx: number): string {
  let result = "";
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Appends a row to the given tab using column header names for positioning.
 * Reads the header row first so it works regardless of column order.
 * namedValues: { "column header (lowercase)": "value" }
 */
async function appendAdDbRow(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  namedValues: Record<string, string>,
  funnelType: "TSL" | "IMG" = "IMG",
  priorityLabels: string[] = [],
  intendedChanelLabels: string[] = [],
  stageLabels: string[] = [],
): Promise<void> {
  // ── 1. Read header row to discover column positions ──────────────────────
  // Some tabs have section labels in row 1 and actual column headers in row 2.
  // Read both rows and use whichever one has the most recognizable column names.
  const KNOWN_COLS = ["ad id", "brand", "product", "cs", "funnel", "status", "language", "# of images", "# of ads", "images", "images brief"];
  const hRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!1:2`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const hData = await hRes.json();
  const twoRows: string[][] = hData.values || [];

  let headers: string[] = [];
  let bestScore = -1;
  for (let ri = 0; ri < twoRows.length; ri++) {
    const row = (twoRows[ri] || []).map((h: string) => (h || "").toLowerCase().trim());
    const score = KNOWN_COLS.filter((k) => row.includes(k)).length;
    if (score > bestScore) { bestScore = score; headers = row; }
  }
  console.log(`[submit-pipeline] Using header row with score ${bestScore}: ${headers.filter(Boolean).join("|")}`);

  // Build normalized column position map (lowercased header → 0-based index)
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) colMap[h] = i; });

  // Known aliases: caller key → list of alternative header names to try
  const ALIASES: Record<string, string[]> = {
    "ad id":            ["ad_id", "adid"],
    "batch week":       ["week"],
    "created date":     ["date created", "date"],
    "# of images":      ["# of ads", "num images", "number of images"],
    "g-drive":          ["g drive", "gdrive", "drive link", "drive"],
    "images":           ["images folder", "images link", "images folder link"],
    "images brief":     ["image brief", "image brief doc", "brief", "brief doc", "brief link", "image_brief"],
    "log":              ["log link"],
    "clickup":          ["click up", "clickup link", "clickup url"],
    "click up task id": ["clickup task id", "clickup_task_id"],
  };

  // Flexible column finder: tries each name variant in order
  const findCol = (...names: string[]): number => {
    for (const name of names) {
      const idx = colMap[name.toLowerCase().trim()];
      if (idx !== undefined) return idx;
    }
    return -1;
  };

  // ── 2. Build positional row array from namedValues ────────────────────────
  const rowLen = Math.max(headers.length, 22);
  const row: string[] = new Array(rowLen).fill("");

  for (const [key, value] of Object.entries(namedValues)) {
    const k = key.toLowerCase().trim();
    let idx = colMap[k];
    if (idx === undefined) {
      for (const alt of (ALIASES[k] || [])) {
        const altIdx = colMap[alt.toLowerCase().trim()];
        if (altIdx !== undefined) { idx = altIdx; break; }
      }
    }
    if (idx !== undefined) {
      row[idx] = value;
    } else {
      console.warn(`[submit-pipeline] Column "${key}" not found in "${tabName}" header`);
    }
  }

  console.log(`[submit-pipeline] Appending to "${tabName}" — ${headers.length} header cols, row len ${rowLen}`);

  // ── 3. Append row ─────────────────────────────────────────────────────────
  const lastCol = colIndexToLetter(rowLen - 1);
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!A:${lastCol}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    },
  );
  const appendData = await appendRes.json();
  if (appendData.error) {
    throw new Error(`Sheet append to "${tabName}" failed: ${JSON.stringify(appendData.error)}`);
  }
  console.log(`[submit-pipeline] Row appended to "${tabName}" tab in sheet ${spreadsheetId}`);

  const updatedRange: string = appendData.updates?.updatedRange || "";
  const rowMatch = updatedRange.match(/:.*?(\d+)$/);
  if (!rowMatch) return;

  const rowIndex = parseInt(rowMatch[1]) - 1; // 0-based for batchUpdate
  const r = parseInt(rowMatch[1]); // 1-based for formula references

  // ── 4. Get numeric sheet ID ───────────────────────────────────────────────
  const sheetIdRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const sheetIdData = await sheetIdRes.json();
  const targetSheet = sheetIdData.sheets?.find((s: any) => s.properties.title === tabName);
  const sheetId: number = targetSheet?.properties?.sheetId ?? 0;

  // ── 5. Formatting requests ────────────────────────────────────────────────
  const reqs: any[] = [
    // Reset background/text formatting
    {
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: rowLen },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 }, fontSize: 10 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    // Col A: force TEXT so leading-zero Ad ID is preserved
    {
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "TEXT", pattern: "@" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
  ];

  // Created Date: DATE format (found by header name)
  const createdDateCol = findCol("created date", "date created", "date");
  if (createdDateCol !== -1) {
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: createdDateCol, endColumnIndex: createdDateCol + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "MM-dd-yy" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }

  // Link columns: blue underlined + Automatic number format (found by header name)
  const gDriveCol      = findCol("g-drive", "g drive", "gdrive", "drive link", "drive");
  const imagesCol      = findCol("images", "images folder", "images link");
  const imagesBriefCol = findCol("images brief", "image brief", "brief", "brief doc");
  const logCol         = findCol("log", "log link");
  const clickupUrlCol  = findCol("clickup", "click up", "clickup link", "clickup url");

  for (const linkCol of [gDriveCol, imagesCol, imagesBriefCol, logCol, clickupUrlCol]) {
    if (linkCol === -1) continue;
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: linkCol, endColumnIndex: linkCol + 1 },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 }, underline: true } } },
        fields: "userEnteredFormat.textFormat(foregroundColor,underline)",
      },
    });
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: linkCol, endColumnIndex: linkCol + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER_FORMAT_TYPE_UNSPECIFIED", pattern: "" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }

  // TSL-specific validation (column positions found by header name)
  let tslIdCol = -1, scriptIdCol = -1, scriptVariationCol = -1;
  if (funnelType === "TSL") {
    tslIdCol = findCol("tsl id");
    scriptIdCol = findCol("script id");
    scriptVariationCol = findCol("script variation");
    const priorityCol = findCol("priority");

    console.log(`[submit-pipeline] TSL cols — tslId:${tslIdCol} scriptId:${scriptIdCol} scriptVar:${scriptVariationCol} priority:${priorityCol}`);

    if (tslIdCol !== -1) {
      reqs.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: tslIdCol, endColumnIndex: tslIdCol + 1 },
          rule: {
            condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='TSL Scripts'!$A$3:$A` }] },
            showCustomUi: true,
            strict: false,
          },
        },
      });
    }
    if (priorityCol !== -1 && priorityLabels.length > 0) {
      reqs.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: priorityCol, endColumnIndex: priorityCol + 1 },
          rule: {
            condition: { type: "ONE_OF_LIST", values: priorityLabels.map((l) => ({ userEnteredValue: l })) },
            showCustomUi: true,
            strict: false,
          },
        },
      });
    }

  }

  // Intended Chanel dropdown — applied to both TSL and IMG tabs
  const intendedChanelCol = findCol("intended chanel");
  if (intendedChanelCol !== -1 && intendedChanelLabels.length > 0) {
    reqs.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: intendedChanelCol, endColumnIndex: intendedChanelCol + 1 },
        rule: {
          condition: { type: "ONE_OF_LIST", values: intendedChanelLabels.map((l) => ({ userEnteredValue: l })) },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  }

  // Stage dropdown — applied to both TSL and IMG tabs
  const stageCol = findCol("stage");
  if (stageCol !== -1 && stageLabels.length > 0) {
    reqs.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: stageCol, endColumnIndex: stageCol + 1 },
        rule: {
          condition: { type: "ONE_OF_LIST", values: stageLabels.map((l) => ({ userEnteredValue: l })) },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  }

  // Execute all formatting + validation
  const formatRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: reqs }),
    },
  );
  if (!formatRes.ok) {
    console.warn("[submit-pipeline] Sheet batchUpdate failed:", await formatRes.text());
  }

  // ── 6. Write Ad Set Name / Ad Name Template formulas ─────────────────────
  // Column letters resolved dynamically so TSL extra columns don't break the formulas
  const adSetNameCol     = findCol("ad set name");
  const adNameTemplateCol = findCol("ad name template");

  if (adSetNameCol !== -1 || adNameTemplateCol !== -1) {
    const numImagesCol  = findCol("# of images", "# of ads", "num images");
    const brandCol      = findCol("brand");
    const productCol    = findCol("product");
    const weekCol       = findCol("batch week", "week");
    const conceptCol    = findCol("concept name");
    const funnelColIdx  = findCol("funnel");
    const csColIdx      = findCol("cs");
    const languageCol   = findCol("language");

    const cl = (col: number, fb: string) => col !== -1 ? colIndexToLetter(col) : fb;
    const H = cl(numImagesCol, "H");
    const B = cl(brandCol, "B");
    const C = cl(productCol, "C");
    const E = cl(weekCol, "E");
    const G = cl(conceptCol, "G");
    const I = cl(funnelColIdx, "I");
    const D = cl(csColIdx, "D");
    const K = cl(languageCol, "K");

    const adTypeLabel = funnelType === "TSL" ? "TSL" : "IMG";
    const adSetNameFormula =
      `=A${r}&"_NONE_V"&${H}${r}&"_"&${B}${r}&"_"&${C}${r}&"_"&${E}${r}&"_"&${G}${r}&"_${adTypeLabel}_Auto_"&${I}${r}&"_CS."&${D}${r}&"_"&${K}${r}`;
    const adNameTemplateFormula =
      `=A${r}&"_NONE_"&${B}${r}&"_"&${C}${r}&"_"&${E}${r}&"_"&${G}${r}&"_${adTypeLabel}_Auto_"&${I}${r}&"_CS."&${D}${r}&"_"&${K}${r}`;

    for (const [col, formula] of [
      [adSetNameCol, adSetNameFormula],
      [adNameTemplateCol, adNameTemplateFormula],
    ] as [number, string][]) {
      if (col === -1) continue;
      const fmRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!${colIndexToLetter(col)}${r}`)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[formula]] }),
        },
      );
      if (!fmRes.ok) {
        console.warn("[submit-pipeline] Formula write failed:", await fmRes.text());
      }
    }
  }

  // ── 7. TSL: Write INDEX/MATCH formulas for Script ID and Script Variation ─
  if (funnelType === "TSL" && tslIdCol !== -1) {
    const tslIdLetter = colIndexToLetter(tslIdCol);
    const tslFormulas: [number, string][] = [];

    if (scriptIdCol !== -1) {
      tslFormulas.push([
        scriptIdCol,
        `=IF(${tslIdLetter}${r}<>"",INDEX('TSL Scripts'!A:Z,MATCH(${tslIdLetter}${r},'TSL Scripts'!A:A,0),MATCH("Core ID",'TSL Scripts'!2:2,0)),"")`,
      ]);
    }
    if (scriptVariationCol !== -1) {
      tslFormulas.push([
        scriptVariationCol,
        `=IF(${tslIdLetter}${r}<>"",INDEX('TSL Scripts'!A:Z,MATCH(${tslIdLetter}${r},'TSL Scripts'!A:A,0),MATCH("Variation",'TSL Scripts'!2:2,0)),"")`,
      ]);
    }

    for (const [col, formula] of tslFormulas) {
      const tslFmRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!${colIndexToLetter(col)}${r}`)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[formula]] }),
        },
      );
      if (!tslFmRes.ok) {
        console.warn(`[submit-pipeline] TSL formula write to col ${colIndexToLetter(col)} failed:`, await tslFmRes.text());
      }
    }
  }
}

interface CreateClickUpTaskParams {
  listId: string;
  clickupApiKey: string;
  paddedAdId: string;
  brandName: string;
  brandCode: string;
  productName: string;
  productCode: string;
  cs: string;
  csClickupUserId: number | null;
  conceptName: string;
  numberOfAds: string;
  funnel: string;
  originalFunnel: string;
  language: string;
  weekString: string;
  config: ConfigMappings;
  now: Date;
  gDriveLink: string;
  imagesFolderLink: string;
  imageBriefLink: string;
  appBaseUrl: string;
}

/** Creates a ClickUp task in the given list and returns taskId + taskUrl */
async function createClickUpTask(
  params: CreateClickUpTaskParams,
): Promise<{ taskId: string; taskUrl: string }> {
  const {
    listId, clickupApiKey, paddedAdId, brandName, brandCode, productName, productCode,
    cs, csClickupUserId, conceptName, numberOfAds, funnel, originalFunnel, language,
    weekString, config, now, gDriveLink, imagesFolderLink, imageBriefLink, appBaseUrl,
  } = params;

  const adTypeLabel = (funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";
  const taskNameParts = [
    paddedAdId,
    "NONE",
    numberOfAds ? `V${numberOfAds}` : "",
    brandCode || "",
    productCode || "",
    weekString,
    conceptName || "",
    adTypeLabel,
    "Auto",
    originalFunnel || "",
    cs ? `CS.${cs.split("@")[0]}` : "",
    language || "EN",
  ].filter(Boolean);
  const taskName = taskNameParts.join("_");

  const fieldValues: Record<string, string> = {
    "Ad Id": paddedAdId,
    "Brand": brandName || "",
    "Product": productName || "",
    "Concept Name": conceptName || "",
    "# of Ads": numberOfAds || "",
    "Funnel Type": funnel || "",
    "Language": language || "EN",
    "Creation Method": "Auto",
    "Batch": weekString,
    "Drive Folder": gDriveLink || "",
    "Images": imagesFolderLink || "",
    "Brief (Docs)": imageBriefLink || "",
    "Log": `${appBaseUrl}/statics-generator?ad_id=${paddedAdId}`,
    "Intended Platform": "Meta",
    "Stage": "Ready to Launch",
  };

  const customFields: any[] = [];
  for (const field of FIELD_MAP) {
    if (field.type === "users") {
      if (csClickupUserId) {
        customFields.push({ id: field.id, value: { add: [csClickupUserId] } });
        console.log(`[submit-pipeline] ClickUp users field ${field.label}: user ID ${csClickupUserId}`);
      }
      continue;
    }

    const value = fieldValues[field.label];
    if (value === undefined) continue;

    if (field.type === "short_text") {
      if (value) customFields.push({ id: field.id, value });
    } else if (field.type === "drop_down") {
      if (value) {
        let optionId: string | undefined;
        if (field.label === "Stage") {
          optionId = "a7474342-7c6f-4b04-9047-e419d5b932b6";
        } else {
          optionId = config.labelToId[field.label]?.[value.toLowerCase()];
        }
        if (optionId) {
          customFields.push({ id: field.id, value: optionId });
          console.log(`[submit-pipeline] ClickUp dropdown ${field.label}: "${value}" → ${optionId}`);
        } else {
          console.warn(`[submit-pipeline] No ClickUp option ID for ${field.label}="${value}"`);
        }
      }
    }
  }

  // Created Date (epoch ms)
  const createdDateField = FIELD_MAP.find((f) => f.label === "Created Date");
  if (createdDateField) {
    customFields.push({ id: createdDateField.id, value: now.getTime() });
  }

    // Ad Set Name mirrors the ClickUp task name
  customFields.push({ id: AD_SET_NAME_FIELD_ID, value: taskName });

  // Ad Type resolved from funnel
  const funnelLowerForType = (funnel || "").toLowerCase();
  const adTypeOptionId = funnelLowerForType === "tsl" ? AD_TYPE_OPTION_IDS.tsl
    : funnelLowerForType === "vid" ? AD_TYPE_OPTION_IDS.vid
    : AD_TYPE_OPTION_IDS.img;
  customFields.push({ id: AD_TYPE_FIELD_ID, value: adTypeOptionId });

  console.log("clickup - listId: ",listId)
  console.log("clickup - customFields: ",customFields)

  const clickupRes = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task`,
    {
      method: "POST",
      headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: taskName, custom_fields: customFields, status : 'to do' }),
    },
  );

  const clickupData = await clickupRes.json();
  if (!clickupRes.ok) {
    throw new Error(`ClickUp task creation failed: ${clickupData.err || JSON.stringify(clickupData)}`);
  }

  console.log(`[submit-pipeline] ClickUp task created: ${clickupData.id} in list ${listId}`);
  return { taskId: clickupData.id, taskUrl: clickupData.url };
}

// ── Drive API ─────────────────────────────────────────────────────────────────

/**
 * Finds a folder by name inside parentId. Creates it if it doesn't exist.
 * Returns the folder's Drive ID.
 */
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
    console.log(`[submit-pipeline] Reusing existing folder: ${name} (${listData.files[0].id})`);
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
  console.log(`[submit-pipeline] Created folder: ${name} (${created.id})`);
  return created.id;
}

/** Finds or creates a Google Doc by name inside parentId. Returns the doc's Drive ID. */
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
    console.log(`[submit-pipeline] Reusing existing doc: ${name} (${listData.files[0].id})`);
    return listData.files[0].id;
  }
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.document", parents: [parentId] }),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error(`Failed to create doc "${name}": ${JSON.stringify(created)}`);
  console.log(`[submit-pipeline] Created doc: ${name} (${created.id})`);
  return created.id;
}

/**
 * Two-step binary upload to Drive — no base64 encoding.
 * Step 1: create file entry with metadata (JSON only).
 * Step 2: PATCH raw bytes as the content body.
 * Peak memory = 1× the raw image size (vs ~2.7× with base64 multipart).
 */
async function uploadFileToDrive(
  fileName: string,
  fileBytes: Uint8Array,
  mimeType: string,
  parentFolderId: string,
  accessToken: string,
): Promise<string> {
  // Step 1: create file entry with metadata
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: fileName, parents: [parentFolderId] }),
    },
  );
  const created = await createRes.json();
  if (!created.id) {
    throw new Error(`Failed to create Drive file "${fileName}": ${JSON.stringify(created)}`);
  }

  // Step 2: upload raw binary — no base64 conversion
  const uploadRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
      },
      // deno-lint-ignore no-explicit-any
      body: fileBytes as any,
    },
  );
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Binary upload failed for "${fileName}" [${uploadRes.status}]: ${errText}`);
  }
  return created.id;
}

/**
 * Moves a Drive file from its current parent(s) to newParentId.
 * Fetches current parents first so the old location is cleanly removed.
 */
async function moveDriveFile(
  fileId: string,
  newParentId: string,
  accessToken: string,
): Promise<void> {
  // Get current parents — supportsAllDrives required for Shared Drive files
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw new Error(`Could not get parents for file ${fileId} [${metaRes.status}]: ${errText}`);
  }
  const meta = await metaRes.json();
  const oldParents: string = (meta.parents || []).join(",");
  console.log(`[submit-pipeline] Moving file ${fileId}: parents="${oldParents}" → "${newParentId}"`);

  const moveUrl =
    `https://www.googleapis.com/drive/v3/files/${fileId}` +
    `?addParents=${newParentId}` +
    (oldParents ? `&removeParents=${oldParents}` : "") +
    `&supportsAllDrives=true` +
    `&fields=id`;

  const moveRes = await fetch(moveUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!moveRes.ok) {
    const errText = await moveRes.text();
    throw new Error(`Move PATCH failed for file ${fileId} [${moveRes.status}]: ${errText}`);
  }
  console.log(`[submit-pipeline] Successfully moved file ${fileId} to folder ${newParentId}`);
}

/** Renames a Drive file via PATCH — call after moveDriveFile to set the final name. */
async function renameDriveFile(
  fileId: string,
  newName: string,
  accessToken: string,
): Promise<void> {
  const renameRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    },
  );
  if (!renameRes.ok) {
    const errText = await renameRes.text();
    console.warn(`[submit-pipeline] Rename PATCH failed for file ${fileId} [${renameRes.status}]: ${errText}`);
  } else {
    console.log(`[submit-pipeline] Renamed file ${fileId} → "${newName}"`);
  }
}

// ── Supabase REST ─────────────────────────────────────────────────────────────

async function getLatestAdId(): Promise<number> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/statics_logs?select=ad_id&order=ad_id.desc&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const data = await res.json();
  return data[0]?.ad_id || 0;
}

async function getLatestAdsAdId(): Promise<number> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/ads?select=ad_id&order=ad_id.desc&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const data = await res.json();
  return data[0]?.ad_id || 0;
}

async function insertAdsRow(row: Record<string, unknown>): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${supabaseUrl}/rest/v1/ads`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(`Insert ads failed [${res.status}]: ${JSON.stringify(data)}`);
  }
}

async function insertStaticsLogRow(row: Record<string, unknown>): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${supabaseUrl}/rest/v1/statics_logs`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([row]),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Insert statics_log failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data[0]?.id as string;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      parent_drive_link,
      brand_code,
      product_code,
      brand_id,
      brand_name,
      product_id,
      product_name,
      funnel,
      cs,
      concept_name,
      selected_images,
      gdrive_file_ids,
      ads_per_set,
      total_ads,
      prompt,
      task_description,
      inspo_links,
      title,
      subtitle,
      design_elements,
      is_multiple,
      is_cta_button,
      cta_button_text,
      is_badge,
      badge_text,
      products_to_show,
      prompt_for_images,
      file_naming_convention,
      docs_file_url,
      template_id,
    } = body;

    console.log("[submit-pipeline] Starting for:", { brand_name, product_name, funnel, concept_name });

    // ── Prep naming components ──────────────────────────────────────────────
    const weekStr = getWeekString();
    const dateStr = getDateString();
    const bCode = sanitize(brand_code || "Brand");
    const pCode = sanitize(product_code || "Product");
    const cName = sanitize(concept_name || "Concept");
    const csShort = cs ? cs.split("@")[0] : "";
    const csName = sanitize(csShort || "CS");
    const funnelName = sanitize(funnel || "Onbrand");
    const adTypeLabel = (funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";

    const images: string[] = Array.isArray(selected_images) ? selected_images : [];
    const gdriveIdsDirect: string[] = Array.isArray(gdrive_file_ids) ? gdrive_file_ids : [];

    // gdriveIdsDirect (AI-generated file IDs) takes priority — these are what gets moved to Drive.
    // images (product reference URLs) may be present but are for DB storage only.
    const imageIdMap: (string | null)[] = gdriveIdsDirect.length > 0
      ? gdriveIdsDirect.map((id) => id)
      : images.map((url) => extractGdriveFileId(url));

    // The canonical list of image URLs for grouping — prefer generated file IDs, else original URLs
    const allImageUrls: string[] = gdriveIdsDirect.length > 0
      ? gdriveIdsDirect.map((id) => `https://drive.google.com/uc?export=view&id=${id}`)
      : images;

    const moveCount = imageIdMap.filter(Boolean).length;
    if (moveCount > 0) {
      console.log(`[submit-pipeline] ${moveCount}/${allImageUrls.length} image(s) will be MOVEd via Drive ID; rest downloaded`);
    }

    const adsPerSet = Math.max(1, parseInt(String(ads_per_set)) || 1);
    const totalAdsNum = parseInt(String(total_ads)) || allImageUrls.length || 1;
    // groupCount always based on actual image count, never on partial ID extraction
    const groupCount = allImageUrls.length > 0
      ? Math.ceil(allImageUrls.length / adsPerSet)
      : Math.max(1, Math.ceil(totalAdsNum / adsPerSet));

    // ── Drive folder structure ──────────────────────────────────────────────
    const parentFolderId = parent_drive_link ? extractFolderId(parent_drive_link) : null;
    let campaignFolderId: string | null = null;

    if (parentFolderId) {
      const accessToken = await getAccessToken();

      // 1. Week folder  e.g. "Y26W16"
      console.log(`[submit-pipeline] Week folder: ${weekStr}`);
      const weekFolderId = await findOrCreateFolder(weekStr, parentFolderId, accessToken);

      // 2. Campaign folder
      const campaignName = `${bCode}_${pCode}_${dateStr}_${weekStr}_${cName}_${adTypeLabel}_Auto_${funnelName}_${csName}_EN`;
      console.log(`[submit-pipeline] Campaign folder: ${campaignName}`);
      campaignFolderId = await findOrCreateFolder(campaignName, weekFolderId, accessToken);

      // 3. Latest ad_id — take max across both statics_logs and ads to keep them in sync
      const [latestStaticsAdId, latestAdsAdId] = await Promise.all([getLatestAdId(), getLatestAdsAdId()]);
      const baseAdId = Math.max(latestStaticsAdId, latestAdsAdId) + 1;
      const generationId = crypto.randomUUID();

      console.log(`[submit-pipeline] base_ad_id=${baseAdId}  generation_id=${generationId}  groups=${groupCount}`);

      interface AdGroupResult {
        ad_id: number;
        log_id: string;
        folder_id: string;
        images_folder_id: string;
        brief_doc_id: string;
        group_number: number;
        image_count: number;
      }
      const adGroups: AdGroupResult[] = [];

      for (let gi = 0; gi < groupCount; gi++) {
        const adId = baseAdId + gi;
        const adIdStr = formatAdId(adId);
        const groupNum = gi + 1;

        // Group subfolder
        const groupFolderName = `${adIdStr}_${bCode}_${pCode}_${dateStr}_${weekStr}_${cName}_G${groupNum}_${adTypeLabel}_Auto_${funnelName}_${csName}_EN`;
        console.log(`[submit-pipeline] Group folder: ${groupFolderName}`);
        const groupFolderId = await findOrCreateFolder(groupFolderName, campaignFolderId, accessToken);

        // Images subfolder inside group folder
        const imagesFolderId = await findOrCreateFolder("Images", groupFolderId, accessToken);
        console.log(`[submit-pipeline] Images folder: ${imagesFolderId}`);

        // Image Brief Google Doc inside group folder
        const briefDocId = await findOrCreateDoc(`${adIdStr}_Image Brief`, groupFolderId, accessToken);
        const imageBriefLink = `https://docs.google.com/document/d/${briefDocId}/edit`;
        console.log(`[submit-pipeline] Image Brief doc: ${imageBriefLink}`);

        // Unified: Move+Rename if Drive ID available, else download+upload
        const groupStart = gi * adsPerSet;
        const groupUrls = allImageUrls.slice(groupStart, groupStart + adsPerSet);

        await Promise.all(
          groupUrls.map(async (imageUrl: string, ii: number) => {
            const variationNum = ii + 1;
            const timestamp = getTimestampString();
            const newFileName = `${adIdStr}_${bCode}_${pCode}_${dateStr}_${weekStr}_${cName}_G${groupNum}_V${variationNum}_${adTypeLabel}_Auto_${funnelName}_${csShort || csName}_EN_TS_TS.${timestamp}`;
            const driveId = imageIdMap[groupStart + ii];
            if (driveId) {
              try {
                await moveDriveFile(driveId, imagesFolderId, accessToken);
                await renameDriveFile(driveId, newFileName, accessToken);
                console.log(`[submit-pipeline] Moved+Renamed: ${newFileName}`);
              } catch (e) {
                console.error(`[submit-pipeline] Move/Rename FAILED for file ${driveId}:`, e instanceof Error ? e.message : String(e));
              }
            } else {
              try {
                console.log(`[submit-pipeline] Downloading image: ${imageUrl}`);
                const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
                if (!imgRes.ok) {
                  console.warn(`[submit-pipeline] Download failed (${imgRes.status}): ${imageUrl}`);
                  return;
                }
                const rawContentType = imgRes.headers.get("content-type") || "image/jpeg";
                const mimeType = rawContentType.split(";")[0].trim();
                const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
                await uploadFileToDrive(newFileName, imgBytes, mimeType, imagesFolderId, accessToken);
                console.log(`[submit-pipeline] Uploaded: ${newFileName}`);
              } catch (e) {
                console.warn(`[submit-pipeline] Image upload skipped (G${groupNum} V${variationNum}):`, e);
              }
            }
          }),
        );

        // Insert statics_log row — stage removed
        const imagesFolderLink = `https://drive.google.com/drive/folders/${imagesFolderId}`;
        const logRow: Record<string, unknown> = {
          ad_id: adId,
          generation_id: generationId,
          brand_id: brand_id || null,
          brand_name: brand_name || "",
          product_id: product_id || null,
          product_name: product_name || "",
          funnel: funnel || "Onbrand",
          cs: cs || null,
          concept_name: concept_name || null,
          prompt: prompt || null,
          selected_images: images.length > 0 ? images : [],
          generated_images: groupUrls,
          inspo_links: inspo_links || null,
          drive_link: parent_drive_link || null,
          image_generation_drive_link: `https://drive.google.com/drive/folders/${groupFolderId}`,
          images_folder_link: imagesFolderLink,
          image_brief_link: imageBriefLink,
          number_of_ads: String(totalAdsNum),
          max_variations_per_ad_group: String(groupUrls.length),
          title: title || null,
          subtitle: subtitle || null,
          design_elements: design_elements || null,
          is_multiple: is_multiple || false,
          logo_name: null,
          is_cta_button: is_cta_button || false,
          cta_button_text: is_cta_button ? (cta_button_text || null) : null,
          is_badge: is_badge || false,
          badge_text: is_badge ? (badge_text || null) : null,
          products_to_show: products_to_show || null,
          file_naming_convention: file_naming_convention || null,
          description: task_description || docs_file_url || null,
          prompt_for_images: prompt_for_images || null,
          template_id: template_id || null,
          intended_chanel: "Meta",
          status: "In Work",
          week: weekStr,
          creation_method: "Auto",
          clickup_task_status: "generating",
          language: "EN",
          priority: null,
        };

        const logId = await insertStaticsLogRow(logRow);
        const groupImageCount = groupUrls.length;
        console.log(`[submit-pipeline] Log inserted: id=${logId}  ad_id=${adId}  group=${groupNum}  images=${groupImageCount}`);
        adGroups.push({ ad_id: adId, log_id: logId, folder_id: groupFolderId, images_folder_id: imagesFolderId, brief_doc_id: briefDocId, group_number: groupNum, image_count: groupImageCount });

        // Insert into ads table immediately — not inside bgWork so it always runs
        try {
          await insertAdsRow({
            ad_id: adId,
            script_id: 0,
            brand: brand_name || null,
            product: product_name || null,
            cs: csShort || null,
            batch_week: weekStr,
            created_date: dateStr,
            concept_name: concept_name || null,
            ad_type: adTypeLabel,
            funnel: funnel || null,
            language: "EN",
            intended_platform: "Meta",
            g_drive_link: `https://drive.google.com/drive/folders/${groupFolderId}`,
            ad_brief_doc: imageBriefLink || null,
            pipeline_status: "generating",
          });
          console.log(`[submit-pipeline] Ads row inserted: ad_id=${adId}`);
        } catch (e) {
          console.error(`[submit-pipeline] Ads insert error (group ${groupNum}):`, e instanceof Error ? e.message : String(e));
        }
      }

      // ── CS ClickUp user ID lookup ──────────────────────────────────────────
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      let csClickupUserId: number | null = null;
      if (cs) {
        try {
          // Try matching by full email (label), then by short name (before @), then by email column
          const tryFetch = async (url: string) => {
            const r = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
            const d = await r.json();
            return Array.isArray(d) && d[0]?.clickup_user_id ? Number(d[0].clickup_user_id) : null;
          };
          csClickupUserId =
            await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&label=eq.${encodeURIComponent(cs)}&limit=1`) ??
            (csShort ? await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&label=eq.${encodeURIComponent(csShort)}&limit=1`) : null) ??
            await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&value=eq.${encodeURIComponent(cs)}&limit=1`);
          if (csClickupUserId) {
            console.log(`[submit-pipeline] CS "${cs}" → ClickUp user ID: ${csClickupUserId}`);
          } else {
            console.warn(`[submit-pipeline] No ClickUp user ID found for CS "${cs}" (tried label full, label short, email)`);
          }
        } catch (e) {
          console.warn("[submit-pipeline] CS ClickUp lookup failed:", e);
        }
      }

      // ── Background: Sheet + ClickUp sync ──────────────────────────────────
      const bgWork = async () => {
        try {
          const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID");
          if (!configSheetId) {
            console.error("[submit-pipeline] GOOGLE_CONFIG_SHEET_ID not set — skipping sheet+ClickUp sync");
            return;
          }

          const bgAccessToken = await getAccessToken();
          const clickupApiKey = Deno.env.get("CLICKUP_API_KEY") || "";

          // Parallel: read all three config tabs
          const [revenueSources, config] = await Promise.all([
            readRevenueSources(bgAccessToken, configSheetId),
            readConfigSheet(bgAccessToken, configSheetId),
          ]);

          // Resolve Ad DB Sheet ID for this product
          const revenueMatch = revenueSources.find((r) => matchProduct(product_name || "", r.product));
          const adDbSheetId = revenueMatch?.adDbSheetId || null;
          if (!adDbSheetId) {
            console.warn(`[submit-pipeline] No Ad DB SheetId found for product "${product_name}"`);
          } else {
            console.log(`[submit-pipeline] Resolved Ad DB SheetId: ${adDbSheetId} (matched "${revenueMatch?.product}")`);
          }

          

          // Resolve ClickUp list ID: TSL or IMG based on funnel
          const funnelType = (funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";
          const normalizedProductCode = (product_code || "").toUpperCase().trim();
          const clickupListId = PRODUCT_CLICKUP_LISTS[normalizedProductCode as keyof typeof PRODUCT_CLICKUP_LISTS] || null;
          if (!clickupListId) {
            console.warn(`[submit-pipeline] No ClickUp list ID for product code "${normalizedProductCode}" / funnel "${funnelType}"`);
          } else {
            console.log(`[submit-pipeline] Resolved ClickUp list ID: ${clickupListId} (product code: ${normalizedProductCode})`);
          }

          const originalFunnel = getOriginalLabel(config, "Funnel Type", funnel || "");
          const now = new Date();
          const sheetTabName = funnelType; // "TSL" or "IMG"
          const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "").replace(/\/$/, "");

          console.log(`[submit-pipeline] csClickupUserId=${csClickupUserId} (cs="${cs}")`);

          // Process each ad group
          for (const group of adGroups) {
            const paddedAdId = formatAdId(group.ad_id);
            const gDriveLink = `https://drive.google.com/drive/folders/${group.folder_id}`;
            const imagesFolderLink = `https://drive.google.com/drive/folders/${group.images_folder_id}`;
            const imageBriefLink = group.brief_doc_id
              ? `https://docs.google.com/document/d/${group.brief_doc_id}/edit`
              : "";
            let clickupTaskId = "";
            let clickupTaskUrl = "";

            // ── ClickUp task ───────────────────────────────────────────────
            if (clickupListId && clickupApiKey) {
              try {
                console.log(`[submit-pipeline] Creating ClickUp task for group ${group.group_number}: csClickupUserId=${csClickupUserId}`);
                const result = await createClickUpTask({
                  listId: clickupListId,
                  clickupApiKey,
                  paddedAdId,
                  brandName: brand_name || "",
                  brandCode: brand_code || "",
                  productName: product_name || "",
                  productCode: product_code || "",
                  cs: cs || "",
                  csClickupUserId,
                  conceptName: concept_name || "",
                  numberOfAds: String(group.image_count),
                  funnel: funnel || "",
                  originalFunnel,
                  language: "EN",
                  weekString: weekStr,
                  config,
                  now,
                  gDriveLink,
                  imagesFolderLink,
                  imageBriefLink,
                  appBaseUrl,
                });
                clickupTaskId = result.taskId;
                clickupTaskUrl = result.taskUrl;
              } catch (e) {
                console.error(`[submit-pipeline] ClickUp error (group ${group.group_number}):`, e instanceof Error ? e.message : String(e));
              }
            }

            // ── Google Sheet row ───────────────────────────────────────────
            if (adDbSheetId) {
              try {
                // Build named row — appendAdDbRow reads the header row and places
                // each value in the correct column by name, regardless of column order.
                const rowData: Record<string, string> = {
                  "ad id":              "'" + paddedAdId,
                  "brand":              brand_code || "",
                  "product":            product_code || "",
                  "cs":                 csShort || "",
                  "batch week":         weekStr,
                  "created date":       formatDateMMDDYY(now),
                  "concept name":       concept_name || "",
                  "# of images":        String(group.image_count),
                  "intended chanel":    "Meta",
                  "funnel":             originalFunnel || funnel || "",
                  "language":           "EN",
                  "status":             "to do",
                  "stage":              "Ready to Launch",
                  "g-drive":            `=HYPERLINK("${gDriveLink}","link")`,
                  "images":             imagesFolderLink ? `=HYPERLINK("${imagesFolderLink}","link")` : "",
                  "images brief":       imageBriefLink ? `=HYPERLINK("${imageBriefLink}","link")` : "",
                  "log":                appBaseUrl ? `=HYPERLINK("${appBaseUrl}/statics-generator?ad_id=${paddedAdId}","link")` : "",
                  "clickup":            clickupTaskUrl ? `=HYPERLINK("${clickupTaskUrl}","link")` : "",
                  "click up task id":   clickupTaskId || "",
                };
                await appendAdDbRow(bgAccessToken, adDbSheetId, sheetTabName, rowData, sheetTabName as "TSL" | "IMG", config.labels["Priority"] || [], config.labels["Intended Platform"] || [], config.labels["Stage"] || []);
              } catch (e) {
                console.error(`[submit-pipeline] Sheet error (group ${group.group_number}):`, e instanceof Error ? e.message : String(e));
              }
            }

            // ── Update statics_log with ClickUp task info ──────────────────
            if (clickupTaskId) {
              try {
                await fetch(
                  `${supabaseUrl}/rest/v1/statics_logs?id=eq.${group.log_id}`,
                  {
                    method: "PATCH",
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                      "Content-Type": "application/json",
                      Prefer: "return=minimal",
                    },
                    body: JSON.stringify({
                      clickup_task_id: clickupTaskId,
                      clickup_task_url: clickupTaskUrl,
                    }),
                  },
                );
                console.log(`[submit-pipeline] statics_log updated with ClickUp task (group ${group.group_number})`);
              } catch (e) {
                console.error(`[submit-pipeline] DB update error (group ${group.group_number}):`, e instanceof Error ? e.message : String(e));
              }

              // ── Update ads row with ClickUp task info ──────────────────────
              try {
                await fetch(
                  `${supabaseUrl}/rest/v1/ads?ad_id=eq.${group.ad_id}`,
                  {
                    method: "PATCH",
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                      "Content-Type": "application/json",
                      Prefer: "return=minimal",
                    },
                    body: JSON.stringify({
                      clickup_task_id: clickupTaskId,
                      clickup_link: clickupTaskUrl,
                    }),
                  },
                );
                console.log(`[submit-pipeline] ads updated with ClickUp task (group ${group.group_number})`);
              } catch (e) {
                console.error(`[submit-pipeline] Ads ClickUp update error (group ${group.group_number}):`, e instanceof Error ? e.message : String(e));
              }
            }

          }

          console.log(`[submit-pipeline] Background sync complete — ${adGroups.length} group(s) processed`);
        } catch (e) {
          console.error("[submit-pipeline] Background work failed:", e instanceof Error ? e.message : String(e));
        }
      };

      try {
        (globalThis as any).EdgeRuntime?.waitUntil(bgWork());
      } catch {
        bgWork().catch(console.error);
      }

      console.log(`[submit-pipeline] Done — ${adGroups.length} group(s) created.`);

      return new Response(
        JSON.stringify({
          success: true,
          generation_id: generationId,
          campaign_folder_id: campaignFolderId,
          ad_groups: adGroups.map((g) => ({
            ad_id: g.ad_id,
            log_id: g.log_id,
            group_number: g.group_number,
            folder_url: `https://drive.google.com/drive/folders/${g.folder_id}`,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      // No drive link — still create statics_log entries without Drive folders
      console.warn("[submit-pipeline] No parent_drive_link provided; skipping Drive operations.");
      const [latestStaticsAdId, latestAdsAdId] = await Promise.all([getLatestAdId(), getLatestAdsAdId()]);
      const baseAdId = Math.max(latestStaticsAdId, latestAdsAdId) + 1;
      const generationId = crypto.randomUUID();
      const adIds: number[] = [];

      for (let gi = 0; gi < groupCount; gi++) {
        const adId = baseAdId + gi;
        const logRow: Record<string, unknown> = {
          ad_id: adId,
          generation_id: generationId,
          brand_id: brand_id || null,
          brand_name: brand_name || "",
          product_id: product_id || null,
          product_name: product_name || "",
          funnel: funnel || "Onbrand",
          cs: cs || null,
          concept_name: concept_name || null,
          prompt: prompt || null,
          selected_images: images.length > 0 ? images : [],
          generated_images: [],
          inspo_links: inspo_links || null,
          drive_link: null,
          number_of_ads: String(totalAdsNum),
          max_variations_per_ad_group: String(Math.min(adsPerSet, allImageUrls.length - gi * adsPerSet)),
          title: title || null,
          subtitle: subtitle || null,
          design_elements: design_elements || null,
          is_multiple: is_multiple || false,
          logo_name: null,
          is_cta_button: is_cta_button || false,
          cta_button_text: is_cta_button ? (cta_button_text || null) : null,
          is_badge: is_badge || false,
          badge_text: is_badge ? (badge_text || null) : null,
          products_to_show: products_to_show || null,
          file_naming_convention: file_naming_convention || null,
          description: task_description || docs_file_url || null,
          prompt_for_images: prompt_for_images || null,
          template_id: template_id || null,
          status: "In Work",
          week: weekStr,
          creation_method: "Auto",
          clickup_task_status: "generating",
          language: "EN",
          priority: null,
        };
        await insertStaticsLogRow(logRow);

        try {
          await insertAdsRow({
            ad_id: adId,
            script_id: 0,
            brand: brand_name || null,
            product: product_name || null,
            cs: csShort || null,
            batch_week: weekStr,
            created_date: dateStr,
            concept_name: concept_name || null,
            ad_type: adTypeLabel,
            funnel: funnel || null,
            language: "EN",
            intended_platform: "Meta",
            pipeline_status: "generating",
          });
          console.log(`[submit-pipeline] Ads row inserted: ad_id=${adId}`);
        } catch (e) {
          console.error(`[submit-pipeline] Ads insert error (group ${gi + 1}):`, e instanceof Error ? e.message : String(e));
        }

        adIds.push(adId);
      }

      return new Response(
        JSON.stringify({ success: true, generation_id: generationId, ad_groups: adIds.map((id, i) => ({ ad_id: id, group_number: i + 1 })) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[submit-pipeline] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
