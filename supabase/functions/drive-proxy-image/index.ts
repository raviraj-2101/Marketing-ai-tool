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
    const url = new URL(req.url);
    const fileId = url.searchParams.get("fileId");

    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const full = url.searchParams.get("full") === "true";
    const accessToken = await getAccessToken();

    let imageRes: Response;

    if (full) {
      // Full-resolution download — skip metadata lookup
      imageRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    } else {
      // Get the file's thumbnailLink and mimeType
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,mimeType`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!metaRes.ok) {
        throw new Error(`Drive metadata error [${metaRes.status}]`);
      }

      const meta = await metaRes.json();

      if (meta.thumbnailLink) {
        // Fetch thumbnail at higher resolution with the service account token
        const thumbUrl = meta.thumbnailLink.replace(/=s\d+$/, "=s400");
        imageRes = await fetch(thumbUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } else {
        // Fall back to direct file download
        imageRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }
    }

    if (!imageRes.ok) {
      throw new Error(`Image fetch error [${imageRes.status}]`);
    }

    const contentType = imageRes.headers.get("Content-Type") || "image/jpeg";

    return new Response(imageRes.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[drive-proxy-image] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
