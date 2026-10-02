const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;

  console.log("[drive-list-images] Exchanging refresh token for access token...");
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
    console.error("[drive-list-images] Token exchange failed:", JSON.stringify(tokenData));
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  console.log("[drive-list-images] Access token obtained successfully");
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { drive_link } = await req.json();
    console.log("[drive-list-images] Received drive_link:", drive_link);

    if (!drive_link) {
      return new Response(JSON.stringify({ error: "drive_link is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const folderIdMatch = drive_link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderIdMatch) {
      console.error("[drive-list-images] Could not extract folder ID from:", drive_link);
      return new Response(JSON.stringify({ error: "Could not extract folder ID from drive_link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const folderId = folderIdMatch[1];
    console.log("[drive-list-images] Extracted folderId:", folderId);

    const accessToken = await getAccessToken();
    const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`;
    const fields = "files(id,name,thumbnailLink,webContentLink,mimeType)";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`;
    console.log("[drive-list-images] Fetching from Drive API...");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[drive-list-images] Drive API error:", res.status, errText);
      throw new Error(`Drive API error [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    const images = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      thumbnailLink: f.thumbnailLink,
      webContentLink: f.webContentLink,
      mimeType: f.mimeType,
    }));

    console.log("[drive-list-images] Found", images.length, "images");
    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[drive-list-images] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
