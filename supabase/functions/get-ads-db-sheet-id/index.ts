const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { product_name } = body;

    if (!product_name) {
      return new Response(
        JSON.stringify({ success: false, error: "product_name is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID")!;
    const configRange = encodeURIComponent("'Revenue Sources Sync'!A:Z");
    const accessToken = await getAccessToken();

    const gHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const configRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${configRange}`,
      { headers: gHeaders }
    );
    const configData = await configRes.json();
    if (configData.error) {
      throw new Error(`Config sheet read failed: ${JSON.stringify(configData.error)}`);
    }

    const configRows: string[][] = configData.values || [];
    const headerRow = configRows[0] || [];

    // Find column indices
    const productColIdx = headerRow.findIndex((h: string) =>
      h.trim().toLowerCase() === "product"
    );
    const adDbSheetIdColIdx = headerRow.findIndex((h: string) =>
      h.trim().toLowerCase().includes("ad db") && h.trim().toLowerCase().includes("sheet")
    );

    if (productColIdx === -1 || adDbSheetIdColIdx === -1) {
      throw new Error(
        `Required columns not found in Revenue Sources Sync header. Found: ${headerRow.join(", ")}`
      );
    }

    // Search for matching product
    let adDbSheetId: string | null = null;
    const productNameLower = product_name.trim().toLowerCase();

    for (let i = 1; i < configRows.length; i++) {
      const rowProductName = configRows[i][productColIdx]?.trim().toLowerCase() || "";
      if (rowProductName === productNameLower) {
        adDbSheetId = configRows[i][adDbSheetIdColIdx]?.trim() || null;
        break;
      }
    }

    return new Response(
      JSON.stringify({ success: true, ad_db_sheet_id: adDbSheetId }),
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
