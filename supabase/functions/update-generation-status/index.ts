import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLICKUP_GDRIVE_FIELD_ID = "b2ba579c-b23d-470e-8838-11e408513b3a";
const CLICKUP_STAGE_FIELD_ID = "eab52ea4-aef0-4ff3-aac6-6ea284e1b5e3";
const SPREADSHEET_ID = "1S-S9rlYvYRbv59hKXeXzW8qhfnxPfWG1PyKB2tG37to";

const CONFIG_FIELD_COLUMNS: Record<string, { labelCol: number; valueCol: number }> = {
  "Stage": { labelCol: 4, valueCol: 5 },
};

interface UpdatePayload {
  generation_id: string;
  isRegeneration: boolean;
  status: string;
  drive_link: string[];
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

async function getGeneratedAd StageUuid(): Promise<string | null> {
  try {
    const accessToken = await getGoogleAccessToken();
    const range = `'Config'!A:O`;
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    const rows: string[][] = data.values || [];

    const cols = CONFIG_FIELD_COLUMNS["Ad Stage"];
    for (let i = 2; i < rows.length; i++) {
      const label = rows[i]?.[cols.labelCol] || "";
      const value = rows[i]?.[cols.valueCol] || "";
      if (label.toLowerCase() === "generated") {
        return value || null;
      }
    }
    console.warn("No 'Generated' stage found in Config sheet");
    return null;
  } catch (err) {
    console.error("Failed to read Config sheet for Ad Stage UUID:", err);
    return null;
  }
}

async function updateClickUpField(taskId: string, fieldId: string, value: string, clickupApiKey: string): Promise<void> {
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`,
    {
      method: "POST",
      headers: {
        Authorization: clickupApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.warn(`ClickUp field update failed for task ${taskId}, field ${fieldId}: ${res.status} ${body}`);
  }
}

function extractFolderId(driveLink: string): string | null {
  const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function padAdId(adId: number): string {
  return String(adId).padStart(6, "0");
}

async function renameDriveFolderIfNeeded(accessToken: string, folderId: string, adId: number): Promise<void> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      console.warn(`Failed to fetch folder name for ${folderId}: ${res.status}`);
      return;
    }
    const data = await res.json();
    const currentName: string = data.name || "";

    if (/^\d{5}_/.test(currentName)) {
      console.log(`Folder ${folderId} already has ID prefix: "${currentName}" — skipping rename`);
      return;
    }

    const newName = `${padAdId(adId)}_${currentName}`;
    const patchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      }
    );
    if (patchRes.ok) {
      console.log(`Renamed folder ${folderId}: "${currentName}" → "${newName}"`);
    } else {
      const errText = await patchRes.text();
      console.warn(`Failed to rename folder ${folderId}: ${patchRes.status} ${errText}`);
    }
  } catch (err) {
    console.error(`Error renaming Drive folder ${folderId} for ad_id ${adId}:`, err);
  }
}

async function findSheetRowForAdId(accessToken: string, adId: number): Promise<number> {
  const range = `'Ads DB'!A:A`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];

  for (let i = 1; i < rows.length; i++) {
    const cellVal = (rows[i]?.[0] || "").replace(/^'/, "");
    if (parseInt(cellVal, 10) === adId) {
      return i;
    }
  }
  return -1;
}

async function updateSheetAd Stage(accessToken: string, adId: number, stageValue: string): Promise<void> {
  try {
    const rowIndex = await findSheetRowForAdId(accessToken, adId);
    if (rowIndex === -1) {
      console.warn(`Sheet row not found for ad_id ${adId} (stage update)`);
      return;
    }

    const cellRange = `'Ads DB'!O${rowIndex + 1}`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[stageValue]] }),
      }
    );
    console.log(`Sheet Ad Stage updated to "${stageValue}" for ad_id ${adId} at row ${rowIndex + 1}`);
  } catch (err) {
    console.error(`Failed to update Sheet Ad Stage for ad_id ${adId}:`, err);
  }
}

async function updateSheetGDriveLink(accessToken: string, adId: number, driveLink: string): Promise<void> {
  try {
    const rowIndex = await findSheetRowForAdId(accessToken, adId);
    if (rowIndex === -1) {
      console.warn(`Sheet row not found for ad_id ${adId}`);
      return;
    }

    const cellRange = `'Ads DB'!S${rowIndex + 1}`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[`=HYPERLINK("${driveLink}","link")`]] }),
      }
    );

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const metaData = await metaRes.json();
    const sheet = metaData.sheets?.find((s: any) => s.properties.title === "Ads DB");
    const sheetId = sheet?.properties?.sheetId ?? 0;

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            repeatCell: {
              range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 18, endColumnIndex: 19 },
              cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 }, underline: true } } },
              fields: "userEnteredFormat.textFormat(foregroundColor,underline)",
            },
          }],
        }),
      }
    );

    console.log(`Sheet G-Drive link updated for ad_id ${adId} at row ${rowIndex + 1}`);
  } catch (err) {
    console.error(`Failed to update Sheet G-Drive for ad_id ${adId}:`, err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: UpdatePayload = await req.json();

    console.log("Received update payload:", JSON.stringify(payload, null, 2));

    if (!payload.generation_id) {
      return new Response(
        JSON.stringify({ success: false, error: "generation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.status) {
      return new Response(
        JSON.stringify({ success: false, error: "status is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const lookupColumn = payload.isRegeneration ? "ad_id" : "generation_id";
    const lookupValue = payload.isRegeneration ? Number(payload.generation_id) : payload.generation_id;

    console.log(`Looking up by ${lookupColumn} = ${lookupValue}`);

    const { data: records, error: fetchError } = await supabase
      .from("statics_logs")
      .select("id, ad_id, clickup_task_id, image_generation_drive_link")
      .eq(lookupColumn, lookupValue)
      .order("ad_id", { ascending: true });

    if (fetchError) {
      console.error("Database fetch error:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: `No records found with ${lookupColumn}: ${lookupValue}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${records.length} records for ${lookupColumn}: ${lookupValue}`);

    // Track clickup tasks with their drive links for later update
    const clickupUpdates: Map<string, string> = new Map();

    if (payload.isRegeneration) {
      const { error: updateError } = await supabase
        .from("statics_logs")
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq(lookupColumn, lookupValue);

      if (updateError) {
        console.error("Batch status update error:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For regeneration, collect unique clickup task ids (drive link stays unchanged)
      for (const record of records) {
        if (record.clickup_task_id) {
          clickupUpdates.set(record.clickup_task_id, "");
        }
      }

      console.log(`Updated status to "${payload.status}" for ${records.length} records (regeneration)`);

      // ── Update Google Sheet Ad Stage column for regeneration ──
      try {
        const sheetAccessToken = await getGoogleAccessToken();
        for (const record of records) {
          await updateSheetAd Stage(sheetAccessToken, record.ad_id, "Generated");
        }
      } catch (sheetErr) {
      console.error("Sheet Ad Stage update failed (regeneration):", sheetErr);
      }

      // ── Rename Drive folders for regeneration if needed ──
      try {
        const renameAccessToken = await getGoogleAccessToken();
        for (const record of records) {
          if (record.image_generation_drive_link) {
            const folderId = extractFolderId(record.image_generation_drive_link);
            if (folderId) {
              await renameDriveFolderIfNeeded(renameAccessToken, folderId, record.ad_id);
            }
          }
        }
      } catch (renameErr) {
        console.error("Drive folder rename failed (regeneration):", renameErr);
      }
    } else {
      const driveLinks = payload.drive_link || [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const updateData: Record<string, unknown> = {
          status: payload.status,
          updated_at: new Date().toISOString(),
        };

        if (i < driveLinks.length) {
          updateData.image_generation_drive_link = driveLinks[i];
        }

        const { error: updateError } = await supabase
          .from("statics_logs")
          .update(updateData)
          .eq("id", record.id);

        if (updateError) {
          console.error(`Error updating record ${record.id}:`, updateError);
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Track clickup task with its drive link
        if (record.clickup_task_id && i < driveLinks.length) {
          clickupUpdates.set(record.clickup_task_id, driveLinks[i]);
        }
      }

      console.log(`Updated ${records.length} records with drive links mapped by position`);

      // ── Rename Drive folders if they don't already have an ID prefix ──
      try {
        const renameAccessToken = await getGoogleAccessToken();
        for (let i = 0; i < records.length; i++) {
          if (i < driveLinks.length && driveLinks[i]) {
            const folderId = extractFolderId(driveLinks[i]);
            if (folderId) {
              await renameDriveFolderIfNeeded(renameAccessToken, folderId, records[i].ad_id);
            }
          }
        }
      } catch (renameErr) {
        console.error("Drive folder rename failed (DB already updated):", renameErr);
      }

      // ── Update Google Sheet G-Drive + Ad Stage columns ──
      try {
        const sheetAccessToken = await getGoogleAccessToken();
        for (let i = 0; i < records.length; i++) {
          if (i < driveLinks.length && driveLinks[i]) {
            await updateSheetGDriveLink(sheetAccessToken, records[i].ad_id, driveLinks[i]);
          }
          await updateSheetAd Stage(sheetAccessToken, records[i].ad_id, "Generated");
        }
      } catch (sheetErr) {
        console.error("Sheet G-Drive/Ad Stage update failed (DB already updated):", sheetErr);
      }
    }

    // ── ClickUp Update: G-Drive + Ad Stage ──
    if (clickupUpdates.size > 0) {
      try {
        const clickupApiKey = Deno.env.get("CLICKUP_API_KEY")!;
        const stageUuid = await getGeneratedAd StageUuid();

        for (const [taskId, driveLink] of clickupUpdates) {
          // Update G-Drive field if we have a link
          if (driveLink) {
            await updateClickUpField(taskId, CLICKUP_GDRIVE_FIELD_ID, driveLink, clickupApiKey);
            console.log(`ClickUp task ${taskId}: G-Drive updated`);
          }

          // Update Ad Stage to "Generated"
          if (stageUuid) {
            await updateClickUpField(taskId, CLICKUP_STAGE_FIELD_ID, stageUuid, clickupApiKey);
            console.log(`ClickUp task ${taskId}: Ad Stage set to Generated`);
          }
        }

        console.log(`ClickUp updates completed for ${clickupUpdates.size} task(s)`);
      } catch (clickupErr) {
        console.error("ClickUp update failed (DB already updated):", clickupErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${records.length} record(s) updated successfully`,
        updated_count: records.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing update request:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
