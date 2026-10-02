import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
];

const CONFIG_FIELD_COLUMNS: Record<string, { labelCol: number; valueCol: number }> = {
  "Brand": { labelCol: 4, valueCol: 6 },
  "Product": { labelCol: 11, valueCol: 13 },
  "Funnel Type": { labelCol: 14, valueCol: 15 },
  "Creation Method": { labelCol: 38, valueCol: 39 },
  "Priority": { labelCol: 16, valueCol: 17 },
  "Intended Platform": { labelCol: 36, valueCol: 37 },
  "Stage": { labelCol: 9, valueCol: 10 },
};

const FIELD_TO_DB_COLUMN: Record<string, string> = {
  "Concept Name": "concept_name",
  "Cs": "cs",
  "Batch": "week",
  "Language": "language",
  "# of Ads": "number_of_ads",
  "Brand": "brand_name",
  "Product": "product_name",
  "Funnel Type": "funnel",
  "Stage": "stage",
  "Creation Method": "creation_method",
  "Drive Folder": "drive_link",
  "TSL Script": "tsl_script_id",
  "TSL ID": "tsl_script_id",
  "Priority": "priority",
  "Intended Platform": "intended_chanel",
};

const FIELD_TO_ADS_COLUMN: Record<string, string> = {
  "Concept Name": "concept_name",
  "Cs": "cs",
  "Batch": "batch_week",
  "Language": "language",
  "Brand": "brand",
  "Product": "product",
  "Funnel Type": "funnel",
  "Stage": "pipeline_status",
  "Priority": "priority",
  "Intended Platform": "intended_platform",
  "Drive Folder": "g_drive_link",
};

// Sheet column name → FIELD_MAP label (when they differ)
const COLUMN_ALIASES: Record<string, string> = {
  "TSL ID": "TSL Script",
  "# of Images": "# of Ads",
};

async function resolveClickUpDropdownId(
  taskId: string,
  fieldId: string,
  optionLabel: string,
  apiKey: string,
): Promise<string | null> {
  // Step 1: try from task's inline type_config.options
  const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: apiKey },
  });
  if (!taskRes.ok) {
    console.warn(`[update-ad] resolveDropdownId: task fetch failed ${taskRes.status}`);
    return null;
  }
  const taskData = await taskRes.json();

  const findInOptions = (options: any[]): string | null => {
    const match = options.find((o: any) => (o.name || "").toLowerCase() === optionLabel.toLowerCase());
    if (match?.id) {
      console.log(`[update-ad] resolveDropdownId: "${optionLabel}" → id=${match.id}`);
      return String(match.id);
    }
    return null;
  };

  const taskField = (taskData.custom_fields || []).find((f: any) => f.id === fieldId);
  const taskOptions: any[] = taskField?.type_config?.options || [];
  if (taskOptions.length > 0) {
    const result = findInOptions(taskOptions);
    if (result !== null) return result;
    console.warn(`[update-ad] resolveDropdownId: no match for "${optionLabel}" in task options [${taskOptions.map((o: any) => o.name).join(", ")}]`);
  }

  // Step 2: fetch list fields for full type_config
  const listId = taskData.list?.id;
  if (!listId) {
    console.warn(`[update-ad] resolveDropdownId: no list ID on task ${taskId}`);
    return null;
  }
  const listRes = await fetch(`https://api.clickup.com/api/v2/list/${listId}/field`, {
    headers: { Authorization: apiKey },
  });
  if (!listRes.ok) {
    console.warn(`[update-ad] resolveDropdownId: list field fetch failed ${listRes.status}`);
    return null;
  }
  const listData = await listRes.json();
  const listField = (listData.fields || []).find((f: any) => f.id === fieldId);
  const listOptions: any[] = listField?.type_config?.options || [];
  const result = findInOptions(listOptions);
  if (result === null) {
    console.warn(`[update-ad] resolveDropdownId: no match for "${optionLabel}" in list options [${listOptions.map((o: any) => o.name).join(", ")}]`);
  }
  return result;
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

async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    console.error(`Drive rename failed for ${fileId}: ${res.status} ${await res.text()}`);
  } else {
    console.log(`Renamed Drive file ${fileId} to: ${newName}`);
  }
}

async function renameTslAssets(supabase: any, tslScriptId: string, cs: string, conceptName: string, accessToken: string): Promise<void> {
  const tslIdNum = parseInt(tslScriptId.replace(/^0+/, "") || "0", 10);
  if (!tslIdNum) return;

  const { data: tslData } = await supabase
    .from("tsl_scripts")
    .select("gfolder_link, gdoc_link")
    .eq("tsl_script_id", tslIdNum)
    .maybeSingle();

  if (!tslData) return;

  const paddedTslId = String(tslIdNum).padStart(6, "0");
  const newName = `${paddedTslId}_${cs || ""}${conceptName ? `_${conceptName}` : ""}`;

  const folderId = tslData.gfolder_link?.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  const docId = tslData.gdoc_link?.match(/document\/d\/([a-zA-Z0-9_-]+)/)?.[1];

  const promises: Promise<void>[] = [];
  if (folderId) promises.push(renameDriveFile(accessToken, folderId, newName));
  if (docId) promises.push(renameDriveFile(accessToken, docId, newName));
  await Promise.all(promises);
}

interface ConfigMappings {
  labelToId: Record<string, Record<string, string>>;
}

async function readConfigSheet(accessToken: string, spreadsheetId: string): Promise<ConfigMappings> {
  const range = `'IMG/TSL/VID Config'!A:AN`;
  console.log(`[readConfigSheet] Reading spreadsheetId=${spreadsheetId} range=${range}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const rows: string[][] = data.values || [];
  console.log(`[readConfigSheet] Rows fetched: ${rows.length}`);

  const labelToId: Record<string, Record<string, string>> = {};

  if (rows.length < 3) {
    console.warn(`[readConfigSheet] Not enough rows (${rows.length}) — config empty`);
    return { labelToId };
  }

  for (const [fieldName, cols] of Object.entries(CONFIG_FIELD_COLUMNS)) {
    labelToId[fieldName] = {};
    for (let i = 2; i < rows.length; i++) {
      const label = rows[i]?.[cols.labelCol] || "";
      const value = rows[i]?.[cols.valueCol] || "";
      if (label) {
        labelToId[fieldName][label.toLowerCase()] = value;
      }
    }
    console.log(`[readConfigSheet] ${fieldName}: ${Object.keys(labelToId[fieldName]).join(", ") || "(none)"}`);
  }

  return { labelToId };
}

interface UpdateItem {
  row?: number;
  id: number;
  columnName: string;
  value: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY")!;
    const configSpreadsheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const items: UpdateItem[] = await req.json();
    console.log(`[update-ad] Received ${items?.length ?? 0} item(s): ${JSON.stringify(items?.map(i => ({ id: i.id, columnName: i.columnName, value: i.value })))}`);

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Payload must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if any item needs dropdown resolution
    const needsConfig = items.some((item) => {
      const aliased = COLUMN_ALIASES[item.columnName] ?? item.columnName;
      const field = FIELD_MAP.find((f) => f.label === aliased);
      return field?.type === "drop_down";
    });

    let config: ConfigMappings | null = null;
    if (needsConfig) {
      const accessToken = await getGoogleAccessToken();
      config = await readConfigSheet(accessToken, configSpreadsheetId);
    }

    const results: { id: number; columnName: string; success: boolean; error?: string }[] = [];

    for (const item of items) {
      try {
        // Find the field in FIELD_MAP (resolve sheet column aliases first)
        const resolvedColumnName = COLUMN_ALIASES[item.columnName] ?? item.columnName;
        const field = FIELD_MAP.find((f) => f.label === resolvedColumnName);
        if (!field) {
          results.push({ id: item.id, columnName: item.columnName, success: false, error: `Unknown field: ${item.columnName}` });
          continue;
        }
        // Use resolvedColumnName for all post-processing checks below
        const effectiveColumnName = resolvedColumnName;

        // Fetch the statics_logs record by ad_id
        const { data: record, error: dbError } = await supabase
          .from("statics_logs")
          .select("*")
          .eq("ad_id", item.id)
          .single();

        if (dbError || !record) {
          results.push({ id: item.id, columnName: item.columnName, success: false, error: `Record not found for ad_id ${item.id}` });
          continue;
        }

        const taskId = record.clickup_task_id;
        if (!taskId) {
          results.push({ id: item.id, columnName: item.columnName, success: false, error: `No clickup_task_id for ad_id ${item.id}` });
          continue;
        }

        let resolvedValue: unknown;

        if (field.type === "short_text") {
          resolvedValue = item.value;
        } else if (field.type === "drop_down") {
          if (!config) {
            results.push({ id: item.id, columnName: item.columnName, success: false, error: "Config sheet not loaded" });
            continue;
          }
          const availableOptions = Object.keys(config.labelToId[field.label] || {});
          let optionId: string | undefined = config.labelToId[field.label]?.[item.value.toLowerCase()];
          console.log(`[update-ad] Dropdown lookup: field="${field.label}" value="${item.value}" available=[${availableOptions.join(", ")}] optionId="${optionId || "NOT FOUND"}"`);
          if (!optionId) {
            optionId = await resolveClickUpDropdownId(taskId, field.id, item.value, clickupApiKey) ?? undefined;
            if (optionId) {
              console.log(`[update-ad] ✓ Dropdown resolved via ClickUp API: ${field.label}="${item.value}" → ${optionId}`);
            }
          }
          if (!optionId) {
            console.error(`[update-ad] No option ID found for ${field.label}="${item.value}". Available: ${availableOptions.join(", ")}`);
            results.push({ id: item.id, columnName: item.columnName, success: false, error: `No option ID for ${field.label}="${item.value}". Available: ${availableOptions.join(", ")}` });
            continue;
          }
          resolvedValue = optionId!;
          console.log(`[update-ad] ✓ Dropdown resolved: ${field.label}="${item.value}" → ${optionId}`);
        } else if (field.type === "users") {
          // Trim and normalize CS value before lookup
          const trimmedCs = item.value.trim();
          // Look up new CS user ID
          const { data: newCsConfig } = await supabase
            .from("cs_config")
            .select("clickup_user_id")
            .ilike("label", trimmedCs)
            .single();

          const newUserId = newCsConfig?.clickup_user_id ? Number(newCsConfig.clickup_user_id) : null;

          // Look up old CS user ID from current record
          const oldCs = record.cs;
          let oldUserId: number | null = null;
          if (oldCs) {
            const { data: oldCsConfig } = await supabase
              .from("cs_config")
              .select("clickup_user_id")
              .eq("label", oldCs)
              .single();
            oldUserId = oldCsConfig?.clickup_user_id ? Number(oldCsConfig.clickup_user_id) : null;
          }

          const userValue: { add?: number[]; rem?: number[] } = {};
          if (newUserId) userValue.add = [newUserId];
          if (oldUserId) userValue.rem = [oldUserId];

          if (!newUserId) {
            results.push({ id: item.id, columnName: item.columnName, success: false, error: `No ClickUp user ID for CS="${item.value}"` });
            continue;
          }

          resolvedValue = userValue;
          console.log(`ClickUp users ${field.label}: add=${newUserId}, rem=${oldUserId}`);
        } else {
          // Unsupported type (e.g. date) — pass value directly
          resolvedValue = item.value;
        }

        // Call ClickUp API
        console.log(`[update-ad] About to send to ClickUp - taskId=${taskId} fieldId=${field.id} fieldLabel="${field.label}" resolvedValue=${JSON.stringify(resolvedValue)} (type: ${typeof resolvedValue})`);
        const clickupRes = await fetch(
          `https://api.clickup.com/api/v2/task/${taskId}/field/${field.id}`,
          {
            method: "POST",
            headers: {
              Authorization: clickupApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ value: resolvedValue }),
          }
        );

        if (!clickupRes.ok) {
          const errBody = await clickupRes.text();
          console.error(`ClickUp API error for ad_id ${item.id}, field ${field.label}: ${clickupRes.status} ${errBody}`);
          results.push({ id: item.id, columnName: item.columnName, success: false, error: `ClickUp API ${clickupRes.status}: ${errBody}` });
          continue;
        }

        console.log(`[update-ad] ✓ ClickUp updated: task=${taskId} field="${field.label}" value="${item.value}" (ad_id=${item.id})`);

        // Update statics_logs DB table FIRST so post-processing reads fresh values
        const dbColumn = FIELD_TO_DB_COLUMN[effectiveColumnName];
        if (dbColumn) {
          const { error: updateError } = await supabase
            .from("statics_logs")
            .update({ [dbColumn]: item.value })
            .eq("ad_id", item.id);
          if (updateError) {
            console.error(`[update-ad] ✗ DB update failed: statics_logs.${dbColumn}="${item.value}" for ad_id=${item.id}: ${updateError.message}`);
          } else {
            console.log(`[update-ad] ✓ Supabase updated: statics_logs.${dbColumn}="${item.value}" for ad_id=${item.id}`);
          }
        } else {
          console.warn(`[update-ad] No DB column mapped for field "${effectiveColumnName}" — Supabase not updated`);
        }

        // Also update ads table
        const adsColumn = FIELD_TO_ADS_COLUMN[effectiveColumnName];
        if (adsColumn) {
          const { error: adsUpdateError } = await supabase
            .from("ads")
            .update({ [adsColumn]: item.value })
            .eq("ad_id", item.id);
          if (adsUpdateError) {
            console.error(`[update-ad] ✗ ads update failed: ads.${adsColumn}="${item.value}" for ad_id=${item.id}: ${adsUpdateError.message}`);
          } else {
            console.log(`[update-ad] ✓ ads updated: ads.${adsColumn}="${item.value}" for ad_id=${item.id}`);
          }
        }

        // Post-processing for TSL Script: look up docs link, update TSL Script Link, rename Drive assets
        if (effectiveColumnName === "TSL Script") {
          try {
            if (item.value) {
              // Look up TSL docs link using the raw string value (tsl_script_id is a text column)
              const { data: tslRecord } = await supabase
                .from("tsl_scripts")
                .select("gdoc_link, gfolder_link")
                .eq("tsl_script_id", item.value)
                .single();

              if (tslRecord?.gdoc_link) {
                // Update ClickUp "TSL Script Link" field
                const tslLinkField = FIELD_MAP.find((f) => f.label === "TSL Script Link");
                if (tslLinkField) {
                  const linkRes = await fetch(
                    `https://api.clickup.com/api/v2/task/${taskId}/field/${tslLinkField.id}`,
                    {
                      method: "POST",
                      headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
                      body: JSON.stringify({ value: tslRecord.gdoc_link }),
                    }
                  );
                  if (!linkRes.ok) {
                    console.error(`Failed to set TSL Script Link: ${linkRes.status} ${await linkRes.text()}`);
                  } else {
                    console.log(`Set TSL Script Link for task ${taskId}`);
                  }
                }
              }

              // Rename Drive folder & doc
              const freshRecord = await supabase
                .from("statics_logs")
                .select("cs, concept_name, tsl_script_id")
                .eq("ad_id", item.id)
                .single();
              const fr = freshRecord.data;
              if (fr?.tsl_script_id) {
                const driveToken = await getGoogleAccessToken();
                await renameTslAssets(supabase, fr.tsl_script_id, fr.cs || "", fr.concept_name || "", driveToken);
              }
            }
          } catch (postErr) {
            console.error(`TSL Script post-processing error for ad_id ${item.id}:`, postErr);
          }
        }

        // Post-processing for CS or Concept Name: rename Drive folder & doc
        if (effectiveColumnName === "CS" || effectiveColumnName === "Concept Name") {
          try {
            const freshRecord = await supabase
              .from("statics_logs")
              .select("cs, concept_name, tsl_script_id")
              .eq("ad_id", item.id)
              .single();
            const fr = freshRecord.data;
            if (fr?.tsl_script_id) {
              const driveToken = await getGoogleAccessToken();
              await renameTslAssets(supabase, fr.tsl_script_id, fr.cs || "", fr.concept_name || "", driveToken);
            }
          } catch (renameErr) {
            console.error(`Drive rename error for ad_id ${item.id} on ${effectiveColumnName}:`, renameErr);
          }
        }

        // Shared: Rename ClickUp task when any title-related field changes
        const TITLE_FIELDS = ["TSL Script", "Cs", "Concept Name", "Brand", "Product", "Batch", "# of Ads", "Creation Method", "Funnel Type", "Language"];
        if (TITLE_FIELDS.includes(effectiveColumnName) && taskId) {
          try {
            const { data: fresh } = await supabase
              .from("statics_logs")
              .select("*")
              .eq("ad_id", item.id)
              .single();
            if (fresh) {
              const paddedAdId = String(item.id).padStart(6, "0");
              let brandCode = "";
              let productCode = "";
              if (fresh.brand_id) {
                const { data: bd } = await supabase.from("brands").select("brand_code").eq("id", fresh.brand_id).maybeSingle();
                brandCode = bd?.brand_code || "";
              }
              if (!brandCode && fresh.brand_name) {
                const { data: bd } = await supabase.from("brands").select("brand_code").ilike("name", fresh.brand_name).maybeSingle();
                brandCode = bd?.brand_code || "";
              }
              if (fresh.product_id) {
                const { data: pd } = await supabase.from("products").select("product_code").eq("id", fresh.product_id).maybeSingle();
                productCode = pd?.product_code || "";
              }
              if (!productCode && fresh.product_name) {
                const { data: pd } = await supabase.from("products").select("product_code").ilike("name", fresh.product_name).maybeSingle();
                productCode = pd?.product_code || "";
              }
              const adTypeLabel = (fresh.funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";
              const parts = [
                paddedAdId,
                fresh.tsl_script_id || "NONE",
                fresh.number_of_ads ? `V${fresh.number_of_ads}` : "",
                brandCode || "",
                productCode || "",
                fresh.week || "",
                fresh.concept_name || "",
                adTypeLabel,
                fresh.creation_method || "Auto",
                fresh.funnel || "",
                fresh.cs ? `CS.${fresh.cs.split("@")[0]}` : "",
                fresh.language || "EN",
              ].filter(Boolean);
              const taskName = parts.join("_");

              const renameRes = await fetch(
                `https://api.clickup.com/api/v2/task/${taskId}`,
                {
                  method: "PUT",
                  headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
                  body: JSON.stringify({ name: taskName }),
                }
              );
              if (!renameRes.ok) {
                console.error(`Failed to rename task ${taskId}: ${renameRes.status} ${await renameRes.text()}`);
              } else {
                console.log(`Renamed ClickUp task ${taskId} to: ${taskName}`);
              }
            }
          } catch (renameErr) {
            console.error(`Task rename error for ad_id ${item.id}:`, renameErr);
          }
        }

        results.push({ id: item.id, columnName: item.columnName, success: true });
      } catch (itemErr) {
        console.error(`Error processing item ad_id ${item.id}:`, itemErr);
        results.push({ id: item.id, columnName: item.columnName, success: false, error: String(itemErr) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("update-ad error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
