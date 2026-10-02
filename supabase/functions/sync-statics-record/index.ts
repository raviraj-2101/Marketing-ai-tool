import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLICKUP_LIST_ID = "901522569196";

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
  { label: "Funnel Type Type", id: "40db4572-af51-41a3-8c25-937bd3b4ded2", type: "drop_down" },
  { label: "Language", id: "89f0fa1a-d749-40d3-b448-dfe4bcb17a35", type: "short_text" },
  { label: "Stage", id: "eab52ea4-aef0-4ff3-aac6-6ea284e1b5e3", type: "drop_down" },
  { label: "Drive Folder", id: "b2ba579c-b23d-470e-8838-11e408513b3a", type: "short_text" },
  { label: "Log", id: "27207d21-619e-478d-95b8-51423836f405", type: "short_text" },
  { label: "TSL Script Link", id: "34250452-0ec3-462e-a22f-8773ca4586fc", type: "short_text" },
  { label: "Priority", id: "5927d263-c1f4-4a1a-b131-70cfa91aed8b", type: "drop_down" },
];

// Config sheet column mapping: A-B: Brand, C-D: Product, E-F: Ad Stage, G: empty, H-I: Funnel Type, J-K: Creation Method, L-M: Cs, N-O: Priority
const CONFIG_FIELD_COLUMNS: Record<string, { labelCol: number; valueCol: number }> = {
  "Brand": { labelCol: 0, valueCol: 1 },
  "Product": { labelCol: 2, valueCol: 3 },
  "Stage": { labelCol: 4, valueCol: 5 },
  "Funnel Type Type": { labelCol: 7, valueCol: 8 },
  "Creation Method": { labelCol: 9, valueCol: 10 },
  "Priority": { labelCol: 13, valueCol: 14 },
};

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
  // Map from lowercase label to original-case label
  originalLabels: Record<string, Record<string, string>>;
  activeAd StageLabels: string[];
}

async function readConfigSheet(accessToken: string, spreadsheetId: string): Promise<ConfigMappings> {
  const range = `'Config'!A:O`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];

  const labelToId: Record<string, Record<string, string>> = {};
  const labels: Record<string, string[]> = {};
  const originalLabels: Record<string, Record<string, string>> = {};
  const activeAd StageLabels: string[] = [];

  if (rows.length < 3) {
    console.warn("Config sheet has fewer than 3 rows, returning empty mappings");
    return { labelToId, labels, originalLabels, activeAd StageLabels };
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

  // Build activeAd StageLabels: Ad Stage labels (col E) where Status (col G, index 6) is "Active"
  for (let i = 2; i < rows.length; i++) {
    const stageLabel = rows[i]?.[4] || ""; // col E = index 4
    const statusValue = rows[i]?.[6] || ""; // col G = index 6
    if (stageLabel && statusValue === "Active") {
      activeAd StageLabels.push(stageLabel);
    }
  }

  return { labelToId, labels, originalLabels, activeAd StageLabels };
}

// Look up the original-case label from Config sheet
function getOriginalLabel(config: ConfigMappings, fieldName: string, value: string): string {
  if (!value) return "";
  return config.originalLabels[fieldName]?.[value.toLowerCase()] || value;
}

interface SyncPayload {
  log_id: string;
  ad_id: number;
  brand_name: string;
  brand_code: string;
  product_name: string;
  product_code: string;
  cs: string;
  concept_name: string;
  number_of_ads: string;
  funnel: string;
  language: string;
  drive_link: string;
  max_variations_per_ad_group: string;
  ad_index: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: SyncPayload = await req.json();
    const {
      log_id, ad_id, brand_name, brand_code, product_name, product_code, cs,
      concept_name, number_of_ads, funnel, language, drive_link,
    } = body;

    if (!log_id || !ad_id) {
      return new Response(
        JSON.stringify({ success: false, error: "log_id and ad_id are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY")!;
    const now = new Date();
    const paddedAdId = padAdId(ad_id);
    const weekString = getBatchString(now);
    const spreadsheetId = "1S-S9rlYvYRbv59hKXeXzW8qhfnxPfWG1PyKB2tG37to";

    // ── 0a. Init Supabase client early (needed for cs_config lookup) ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 0b. Look up ClickUp user ID for CS email ──
    let csClickupUserId: number | null = null;
    if (cs) {
      const { data: csData } = await supabase
        .from("cs_config")
        .select("clickup_user_id")
        .eq("label", cs)
        .maybeSingle();
      if (csData?.clickup_user_id) {
        csClickupUserId = Number(csData.clickup_user_id);
        console.log(`CS email "${cs}" → ClickUp user ID: ${csClickupUserId}`);
      } else {
        console.warn(`No clickup_user_id found for CS email "${cs}"`);
      }
    }

    // ── 0c. Get Google access token and read Config sheet ──
    const accessToken = await getGoogleAccessToken();
    const config = await readConfigSheet(accessToken, spreadsheetId);
    console.log("Config mappings loaded:", Object.keys(config.labelToId));

    // Get original-case labels for sheet and task name
    const originalFunnel Type = getOriginalLabel(config, "Funnel Type", funnel);
    const originalBrand = getOriginalLabel(config, "Brand", brand_name);
    const originalProduct = getOriginalLabel(config, "Product", product_name);

    // ── 1. Build task name ──
    // Convention: AdID_ScriptID_BrandCode_ProductCode_Batch_ConceptName_Format_CreationMethod_Funnel Type_CS.[CS]_Language
    const taskNameParts = [
      paddedAdId,
      "NONE",                          // ScriptID (not available yet)
      brand_code || "",
      product_code || "",
      weekString,
      concept_name || "",
      "IMG",                           // Format
      "Auto",                          // Creation Method
      originalFunnel Type || "",
      cs ? `CS.${cs}` : "",
      language || "EN",
    ].filter(Boolean);
    const taskName = taskNameParts.join("_");

    // ── 2. Create ClickUp Task ──
    const customFields: any[] = [];

    const fieldValues: Record<string, string> = {
      "Ad Id": paddedAdId,
      "Brand": brand_name || "",
      "Product": product_name || "",
      "Concept Name": concept_name || "",
      "# of Ads": number_of_ads || "",
      "Funnel Type": funnel || "",
      "Language": language || "EN",
      
      "Creation Method": "Auto",
      "Ad Stage": "Generating",
      "Batch": weekString,
      "Log": `https://id-preview--332895ea-e04e-4951-9acb-4d99e4914d72.lovable.app/statics-generator?ad_id=${paddedAdId}`,
    };

    for (const field of FIELD_MAP) {
      // Handle users (CS) field independently — not from fieldValues
      if (field.type === "users") {
        if (csClickupUserId) {
          customFields.push({ id: field.id, value: { add: [csClickupUserId] } });
          console.log(`ClickUp users ${field.label}: CS user ID ${csClickupUserId}`);
        } else {
          console.warn(`No ClickUp user ID for ${field.label}, skipping field`);
        }
        continue;
      }

      const value = fieldValues[field.label];
      if (value === undefined) continue;

      if (field.type === "short_text") {
        customFields.push({ id: field.id, value });
      } else if (field.type === "drop_down") {
        if (value) {
          const optionId = config.labelToId[field.label]?.[value.toLowerCase()];
          if (optionId) {
            customFields.push({ id: field.id, value: optionId });
            console.log(`ClickUp dropdown ${field.label}: "${value}" → ${optionId}`);
          } else {
            console.warn(`No option ID found for ${field.label}="${value}", skipping field`);
          }
        }
      }
    }

    // Add Created Date separately (date type needs epoch ms)
    const createdDateField = FIELD_MAP.find(f => f.label === "Created Date");
    if (createdDateField) {
      customFields.push({ id: createdDateField.id, value: now.getTime() });
    }

    const clickupPayload = {
      name: taskName,
      custom_fields: customFields,
    };

    const clickupRes = await fetch(
      `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`,
      {
        method: "POST",
        headers: {
          Authorization: clickupApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clickupPayload),
      }
    );

    const clickupData = await clickupRes.json();
    if (!clickupRes.ok) {
      console.error("ClickUp error:", JSON.stringify(clickupData));
      throw new Error(`ClickUp task creation failed: ${clickupData.err || JSON.stringify(clickupData)}`);
    }

    const clickupTaskId = clickupData.id;
    const clickupTaskUrl = clickupData.url;
    console.log("ClickUp task created:", clickupTaskId, clickupTaskUrl);

    // ── 3. Append Row to Google Sheet ──
    const sheetName = "Ads DB";
    const range = `'${sheetName}'!A:Y`;

    const row = [
      "'" + paddedAdId,              // A: Ad ID (apostrophe preserves leading zeros)
      "",                            // B: TSL Script
      brand_code || "",  // C: Brand (code)
      product_code || "",  // D: Product (code)
      cs || "",                      // E: CS
      weekString,                    // F: Batch Batch
      formatDateMMDDYY(now),         // G: Created Date (MM-DD-YY)
      "",                            // H: Source Ad Group for Images
      concept_name || "",            // I: Concept Name
      number_of_ads || "",           // J: # of Ads
      "Auto",                        // K: Creation Method
      "IMG",                         // L: Ad Type
      originalFunnel Type || funnel || "",  // M: Funnel Type (original case)
      language || "EN",              // N: Language
      "Generating",                  // O: Ad Stage
      "to do",                       // P: Status
      "",                            // Q: Priority
      "",                            // R: Launch Date Meta
      "",  // S: G-Drive (populated later by update-generation-status)
      `=HYPERLINK("https://id-preview--332895ea-e04e-4951-9acb-4d99e4914d72.lovable.app/statics-generator?ad_id=${paddedAdId}","link")`,  // T: LOG
      clickupTaskUrl ? `=HYPERLINK("${clickupTaskUrl}","link")` : "",  // U: ClickUp
      "",                            // V: Ad Set Name
      "",                            // W: Ad Name Template
      "",                            // X: Notes
      clickupTaskId || "",           // Y: Click Up Task Id
    ];

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
      console.error("Sheet append error:", JSON.stringify(appendData.error));
      throw new Error(`Sheet append failed: ${JSON.stringify(appendData.error)}`);
    }

    console.log("Sheet row appended successfully");

    // ── 3b. Clear inherited header formatting on the new row ──
    const updatedRange = appendData.updates?.updatedRange;
    const rowMatch = updatedRange?.match(/:.*?(\d+)$/);
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1]) - 1; // 0-based for batchUpdate

      const sheetIdRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const sheetIdData = await sheetIdRes.json();
      const adsDbSheet = sheetIdData.sheets?.find((s: any) => s.properties.title === "Ads DB");
      const sheetId = adsDbSheet?.properties?.sheetId || 0;

      const formatRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: (() => {
              const reqs: any[] = [
                // Reset background/text formatting
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 25 },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: { red: 1, green: 1, blue: 1 },
                        textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 }, fontSize: 10 },
                      },
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat)",
                  },
                },
                // Ad ID col A — force text format
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 1 },
                    cell: { userEnteredFormat: { numberFormat: { type: "TEXT", pattern: "@" } } },
                    fields: "userEnteredFormat.numberFormat",
                  },
                },
                // Created Date col G — display as MM-DD-YY
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 6, endColumnIndex: 7 },
                    cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "MM-dd-yy" } } },
                    fields: "userEnteredFormat.numberFormat",
                  },
                },
              ];

              // Blue underlined link text for G-Drive (col S, index 18) and ClickUp (col U, index 20)
      for (const linkCol of [18, 19, 20]) {
        reqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: linkCol, endColumnIndex: linkCol + 1 },
            cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 }, underline: true } } },
            fields: "userEnteredFormat.textFormat(foregroundColor,underline)",
          },
        });
      }

      // Set columns S, T, U to Automatic format so HYPERLINK formulas evaluate
      reqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 18, endColumnIndex: 21 },
          cell: { userEnteredFormat: { numberFormat: { type: "NUMBER_FORMAT_TYPE_UNSPECIFIED", pattern: "" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });

              // TSL Script dropdown (col B) via range reference
              reqs.push({
                setDataValidation: {
                  range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 1, endColumnIndex: 2 },
                  rule: {
                    condition: {
                      type: "ONE_OF_RANGE",
                      values: [{ userEnteredValue: "=TSL_Script_IDs!$A$2:$A" }],
                    },
                    showCustomUi: true,
                    strict: false,
                  },
                },
              });

              // Dropdown validations for K, L, M, O, Q
              const dropdownColumns = [
                { col: 10, values: config.labels["Creation Method"] || [] },
                { col: 11, values: ["IMG", "VID", "TSL"] },
                { col: 12, values: config.labels["Funnel Type"] || [] },
                { col: 14, values: config.activeAd StageLabels || [] },
                { col: 16, values: config.labels["Priority"] || [] },
              ];
              for (const dd of dropdownColumns) {
                if (dd.values.length > 0) {
                  reqs.push({
                    setDataValidation: {
                      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: dd.col, endColumnIndex: dd.col + 1 },
                      rule: {
                        condition: { type: "ONE_OF_LIST", values: dd.values.map(v => ({ userEnteredValue: v })) },
                        showCustomUi: true,
                        strict: false,
                      },
                    },
                  });
                }
              }
              return reqs;
            })(),
          }),
        }
      );

      if (formatRes.ok) {
        console.log("Row formatting reset to default");
      } else {
        console.warn("Failed to reset row formatting:", await formatRes.text());
      }
    }

    // ── 3c. Write Ad Set Name and Ad Name Template formulas ──
    if (rowMatch) {
      const r = parseInt(rowMatch[1]); // 1-based row number
      const adSetNameFormula = `=A${r}&"_"&IF(B${r}="","NONE",B${r})&"_V"&J${r}&"_"&C${r}&"_"&D${r}&"_"&F${r}&"_"&I${r}&"_"&L${r}&"_"&K${r}&"_"&M${r}&"_CS."&E${r}&"_"&N${r}`;
      const adNameTemplateFormula = `=A${r}&"_"&IF(B${r}="","NONE",B${r})&"_"&C${r}&"_"&D${r}&"_"&F${r}&"_"&I${r}&"_"&L${r}&"_"&K${r}&"_"&M${r}&"_CS."&E${r}&"_"&N${r}`;

      const formulaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Ads DB'!V${r}:W${r}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [[adSetNameFormula, adNameTemplateFormula]] }),
        }
      );

      if (formulaRes.ok) {
        console.log("Ad Set Name and Ad Name Template formulas written");
      } else {
        console.warn("Failed to write formulas:", await formulaRes.text());
      }
    }


    const { error: updateErr } = await supabase
      .from("statics_logs")
      .update({
        clickup_task_id: clickupTaskId,
        clickup_task_url: clickupTaskUrl,
      })
      .eq("id", log_id);

    if (updateErr) {
      console.error("DB update error:", updateErr.message);
      throw new Error(`DB update error: ${updateErr.message}`);
    }

    console.log("Statics log updated with ClickUp data");

    return new Response(
      JSON.stringify({
        success: true,
        clickup_task_id: clickupTaskId,
        clickup_task_url: clickupTaskUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error in sync-statics-record:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
