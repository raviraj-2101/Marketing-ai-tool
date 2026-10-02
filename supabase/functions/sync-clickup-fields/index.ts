import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLICKUP_FOLDER_ID = "901515448472";

const DROPDOWN_FIELDS = ["Brand", "Product", "Stage", "Funnel Type Type", "Creation Method", "Priority", "Intended Platform"];

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY")!;

    // 1. Fetch ClickUp folder fields
    const fieldsRes = await fetch(
      `https://api.clickup.com/api/v2/folder/${CLICKUP_FOLDER_ID}/field`,
      {
        headers: {
          Authorization: clickupApiKey,
          accept: "application/json",
        },
      }
    );

    const fieldsData = await fieldsRes.json();
    if (!fieldsRes.ok) {
      throw new Error(`ClickUp fields fetch failed: ${JSON.stringify(fieldsData)}`);
    }

    // 2. Filter dropdown fields and extract options
    const dropdownData: Record<string, { labels: string[]; values: string[] }> = {};

    for (const field of fieldsData.fields || []) {
      if (field.type === "drop_down" && DROPDOWN_FIELDS.includes(field.name)) {
        const options = field.type_config?.options || [];
        dropdownData[field.name] = {
          labels: options.map((o: any) => o.name),
          values: options.map((o: any) => o.id),
        };
      }
    }

    console.log("Dropdown fields found:", Object.keys(dropdownData));

    // 3. Fetch CS data from cs_config table
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: csRows, error: csError } = await supabaseClient
      .from("cs_config")
      .select("label, value")
      .order("label");
    if (csError) {
      console.warn("Failed to fetch cs_config:", csError.message);
    }
    const csLabels = (csRows || []).map((r: any) => r.label);
    const csValues = (csRows || []).map((r: any) => r.value);

    console.log("CS entries found:", csLabels.length);

    // 4. Build sheet rows
    // Layout: A-B: Brand, C-D: Product, E-F: Stage, G: Status (under Stage), H-I: Funnel Type, J-K: Creation Method, L-M: Cs, N-O: Priority, P/Q/R: Intended Platform
    const fieldOrder = ["Brand", "Product", "Stage"];
    const fieldOrderAfterGap = ["Funnel Type", "Creation Method"];

    // Find max number of options across all fields including CS
    const allFields = [...fieldOrder, ...fieldOrderAfterGap];
    const maxOptions = Math.max(
      ...allFields.map((f) => dropdownData[f]?.labels?.length || 0),
      csLabels.length,
      dropdownData["Intended Platform"]?.labels?.length || 0,
      0
    );

    // Header row 1: field names
    const headerRow: string[] = [];
    for (const f of fieldOrder) {
      headerRow.push(f, f);
    }
    headerRow.push("Stage"); // Column G: Status under Stage
    for (const f of fieldOrderAfterGap) {
      headerRow.push(f, f);
    }
    headerRow.push("Cs", "Cs"); // Columns L-M
    headerRow.push("Priority", "Priority"); // Columns N-O
    headerRow.push("Intended Platform", "Intended Platform", "Intended Platform"); // Columns P-Q-R (Label, empty, Value)

    // Header row 2: Label/Value
    const subHeaderRow: string[] = [];
    for (const f of fieldOrder) {
      subHeaderRow.push("Label", "Value");
    }
    subHeaderRow.push("Status"); // Column G: Status sub-header
    for (const f of fieldOrderAfterGap) {
      subHeaderRow.push("Label", "Value");
    }
    subHeaderRow.push("Label", "Value"); // Columns L-M
    subHeaderRow.push("Label", "Value"); // Columns N-O
    subHeaderRow.push("Label", "", "Value"); // Columns P-Q-R

    // Data rows
    const dataRows: string[][] = [];
    for (let i = 0; i < maxOptions; i++) {
      const row: string[] = [];
      for (const f of fieldOrder) {
        const d = dropdownData[f];
        row.push(d?.labels?.[i] || "", d?.values?.[i] || "");
      }
      const stageLabel = dropdownData["Stage"]?.labels?.[i] || "";
      const activeAd Stages = ["Generating", "Generated", "Ready to Launch"];
      row.push(activeAd Stages.includes(stageLabel) ? "Active" : "");
      for (const f of fieldOrderAfterGap) {
        const d = dropdownData[f];
        row.push(d?.labels?.[i] || "", d?.values?.[i] || "");
      }
      row.push(csLabels[i] || "", csValues[i] || ""); // Columns L-M
      // Priority columns N-O
      const priorityData = dropdownData["Priority"];
      row.push(priorityData?.labels?.[i] || "", priorityData?.values?.[i] || "");
      // Intended Platform columns P-Q-R
      const intendedChanelData = dropdownData["Intended Platform"];
      row.push(intendedChanelData?.labels?.[i] || "", "", intendedChanelData?.values?.[i] || "");
      dataRows.push(row);
    }

    const allRows = [headerRow, subHeaderRow, ...dataRows];

    // 5. Write to Config sheet
    const accessToken = await getGoogleAccessToken();
    const spreadsheetId = "1S-S9rlYvYRbv59hKXeXzW8qhfnxPfWG1PyKB2tG37to";
    const sheetName = "Config";
    const range = `'${sheetName}'!A:R`;

    // Clear existing data
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    // Write new data
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: allRows }),
      }
    );

    const updateData = await updateRes.json();
    if (updateData.error) {
      throw new Error(`Sheet update failed: ${JSON.stringify(updateData.error)}`);
    }

    console.log("Config sheet updated successfully");

    return new Response(
      JSON.stringify({ success: true, fields: Object.keys(dropdownData) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error in sync-clickup-fields:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
