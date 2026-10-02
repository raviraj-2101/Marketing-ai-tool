import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { core_id, variation, sheet_id } = body;

    if (!core_id || variation === undefined || variation === null || !sheet_id) {
      return new Response(
        JSON.stringify({ success: false, error: "core_id, variation, and sheet_id are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 1. Generate TSL Script ID
    const tslScriptId = `${String(core_id).padStart(5, '0')}-${variation}`;

    // 1a. Check if TSL Script ID already exists in DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from("tsl_scripts")
      .select("tsl_script_id")
      .eq("tsl_script_id", tslScriptId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, error: `TSL Script ID "${tslScriptId}" already exists.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // 2. Format date as MM-DD-YYYY
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    const createdDate = `${mm}-${dd}-${yyyy}`;

    // 3. Exchange refresh token for access token
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
    const accessToken = tokenData.access_token;
    const gHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // 4. Look up Brand Code, Product Code, and Google Docs FolderId from Config Sheet
    const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID")!;
    const configRange = encodeURIComponent("'Revenue Sources Sync'!A:Z");  // A:Z covers columns up to AA since we'll use a wider range
    // Fetch A:AB to ensure we capture column AA (Google Docs FolderId)
    const configRangeWide = encodeURIComponent("'Revenue Sources Sync'!A:AB");
    const configRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${configRangeWide}`,
      { headers: gHeaders }
    );
    const configData = await configRes.json();
    if (configData.error) {
      throw new Error(`Config sheet read failed: ${JSON.stringify(configData.error)}`);
    }
    const configRows: string[][] = configData.values || [];

    // Find column indices from header row
    const headerRow = configRows[0] || [];
    const adDbColIdx = headerRow.findIndex((h: string) =>
      h.trim().toLowerCase().includes("ad db sheet") ||
      h.trim().toLowerCase().includes("ad db shield")
    );
    const brandColIdx = headerRow.findIndex((h: string) =>
      h.trim().toLowerCase() === "brand code"
    );
    const productColIdx = headerRow.findIndex((h: string) =>
      h.trim().toLowerCase() === "product code"
    );
    const googleDocsFolderIdColIdx = headerRow.findIndex((h: string) =>
      h.trim().toLowerCase() === "google docs folderid"
    );

    if (adDbColIdx === -1 || brandColIdx === -1 || productColIdx === -1) {
      throw new Error(
        `Required columns not found in Revenue Sources Sync header. Found: ${headerRow.join(", ")}`
      );
    }

    if (googleDocsFolderIdColIdx === -1) {
      throw new Error(
        `"Google Docs FolderId" column not found in Revenue Sources Sync header. Found: ${headerRow.join(", ")}`
      );
    }

    let brandCode = "";
    let productCode = "";
    let parentFolderId = "";

    for (let i = 1; i < configRows.length; i++) {
      if (configRows[i][adDbColIdx]?.trim() === sheet_id) {
        brandCode = configRows[i][brandColIdx]?.trim() || "";
        productCode = configRows[i][productColIdx]?.trim() || "";
        parentFolderId = configRows[i][googleDocsFolderIdColIdx]?.trim() || "";
        break;
      }
    }

    if (!brandCode || !productCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No matching entry found in Revenue Sources Sync for sheet_id: ${sheet_id}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!parentFolderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Folder ID not found for sheet_id: ${sheet_id}. Please fill in the "Google Docs FolderId" column in the config sheet.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const scriptName = `${tslScriptId}_CS_ConceptName`;

    // 5. Find or create "Week XX" folder inside the parent folder
    const weekNum = getISOWeekNumber(now);
    const weekFolderName = `Week ${weekNum}`;
    const searchQuery = `name='${weekFolderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)`,
      { headers: gHeaders }
    );
    const searchData = await searchRes.json();
    let weekFolderId: string;

    if (searchData.files && searchData.files.length > 0) {
      weekFolderId = searchData.files[0].id;
    } else {
      const weekFolderRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: gHeaders,
        body: JSON.stringify({
          name: weekFolderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        }),
      });
      const weekFolder = await weekFolderRes.json();
      if (!weekFolder.id) throw new Error(`Week folder creation failed: ${JSON.stringify(weekFolder)}`);
      weekFolderId = weekFolder.id;
    }

    // 5b. Create script folder inside the week folder
    const folderRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: gHeaders,
      body: JSON.stringify({
        name: scriptName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [weekFolderId],
      }),
    });
    const folder = await folderRes.json();
    if (!folder.id) throw new Error(`Folder creation failed: ${JSON.stringify(folder)}`);
    const folderUrl = `https://drive.google.com/drive/folders/${folder.id}`;

    // 6. Create Google Doc inside the folder
    const docRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: gHeaders,
      body: JSON.stringify({
        name: scriptName,
        mimeType: "application/vnd.google-apps.document",
        parents: [folder.id],
      }),
    });
    const doc = await docRes.json();
    if (!doc.id) throw new Error(`Doc creation failed: ${JSON.stringify(doc)}`);
    const docUrl = `https://docs.google.com/document/d/${doc.id}/edit`;

    // 7. Append row to "TSL Scripts" tab in the target sheet
    const tslSheetName = "TSL Scripts";
    const tslRange = `'${tslSheetName}'!A:L`;
    const values = [
      [
        tslScriptId,        // A: TSL ID
        core_id,            // B: Core ID
        String(variation),  // C: Variation
        createdDate,        // D: Created Date
        brandCode,          // E: Brand
        productCode,        // F: Product
        "",                 // G: Angle
        "",                 // H: Summary
        "",                 // I: Variation Update
        "",                 // J: CS
        "",                 // K: Language
        "link",                          // L: Script Link (hyperlink set via batchUpdate)
      ],
    ];

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}/values/${encodeURIComponent(tslRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: gHeaders,
        body: JSON.stringify({ values }),
      }
    );
    const appendData = await appendRes.json();
    if (appendData.error) {
      throw new Error(`Sheet append failed: ${JSON.stringify(appendData.error)}`);
    }

    // 7b. Format the appended row (white bg, black text, size 10)
    const updatedRange = appendData.updates?.updatedRange || "";
    const rowMatch = updatedRange.match(/!A(\d+):/);
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1], 10) - 1; // 0-indexed

      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}?fields=sheets(properties)`,
        { headers: gHeaders }
      );
      const metaData = await metaRes.json();
      const tab = metaData.sheets?.find(
        (s: any) => s.properties?.title === tslSheetName
      );
      const tabId = tab?.properties?.sheetId ?? 0;

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}:batchUpdate`,
        {
          method: "POST",
          headers: gHeaders,
          body: JSON.stringify({
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: tabId,
                    startRowIndex: rowIndex,
                    endRowIndex: rowIndex + 1,
                    startColumnIndex: 0,
                    endColumnIndex: 11, // A–K only; column L (Script Link) handled separately
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 1, green: 1, blue: 1 },
                      textFormat: {
                        foregroundColor: { red: 0, green: 0, blue: 0 },
                        bold: false,
                        fontSize: 10,
                      },
                    },
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat)",
                },
              },
              {
                // Column L: embed a proper clickable hyperlink
                updateCells: {
                  range: {
                    sheetId: tabId,
                    startRowIndex: rowIndex,
                    endRowIndex: rowIndex + 1,
                    startColumnIndex: 11,
                    endColumnIndex: 12,
                  },
                  rows: [
                    {
                      values: [
                        {
                          userEnteredValue: { stringValue: "link" },
                          userEnteredFormat: {
                            backgroundColor: { red: 1, green: 1, blue: 1 },
                            textFormat: {
                              bold: false,
                              fontSize: 10,
                              underline: true,
                              foregroundColor: { red: 0.06, green: 0.46, blue: 0.82 },
                              link: { uri: docUrl },
                            },
                          },
                        },
                      ],
                    },
                  ],
                  fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat)",
                },
              },
            ],
          }),
        }
      );
    }

    // 8. Insert into database
    const { data: record, error: insertErr } = await supabase
      .from("tsl_scripts")
      .insert({
        tsl_script_id: tslScriptId,
        core_id: core_id,
        variation: String(variation),
        brand_code: brandCode,
        product_code: productCode,
        created_date: createdDate,
        gfolder_link: folderUrl,
        gdoc_link: docUrl,
      })
      .select()
      .single();

    if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        tsl_script_id: tslScriptId,
        core_id,
        variation,
        brand_code: brandCode,
        product_code: productCode,
        created_date: createdDate,
        gdrive_link: folderUrl,
        gdoc_link: docUrl,
        record,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});