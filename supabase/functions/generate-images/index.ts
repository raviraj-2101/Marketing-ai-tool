const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    signal: AbortSignal.timeout(15000),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
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
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) },
  );
  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) {
    console.log(`[generate-images] Reusing folder: ${name}`);
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
    signal: AbortSignal.timeout(30000),
  });
  const created = await createRes.json();
  if (!created.id) {
    throw new Error(`Failed to create folder "${name}"`);
  }
  console.log(`[generate-images] Created folder: ${name}`);
  return created.id;
}

async function uploadFileToDrive(
  fileName: string,
  base64Data: string,
  mimeType: string,
  parentFolderId: string,
  accessToken: string,
): Promise<string> {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
  const metadata = JSON.stringify({ name: fileName, parents: [parentFolderId] });

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    "",
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Data,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await res.json();
  if (!data.id) {
    throw new Error(`Upload failed for "${fileName}"`);
  }
  return data.id;
}

async function makeFilePublic(fileId: string, accessToken: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
    signal: AbortSignal.timeout(30000),
  });
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.warn(`[generate-images] Failed to download ${url}`);
      return null;
    }
    const mimeType = res.headers.get("content-type")?.split(";")?.[0] || "image/jpeg";
    const buffer = await res.arrayBuffer();
    const data = uint8ArrayToBase64(new Uint8Array(buffer));
    return { data, mimeType };
  } catch (e) {
    console.warn(`[generate-images] Error downloading ${url}:`, e);
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      reference_image_urls: raw_reference_image_urls,
      variation,
      variation_index = 0,
      folder_id: existingFolderId,
      parent_folder_id,
    } = body;

    if (!variation) {
      return new Response(JSON.stringify({ error: "variation prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference_image_urls = (raw_reference_image_urls ?? []).slice(0, 3);

    console.log("[generate-images] Starting variation", variation_index);
    const accessToken = await getAccessToken();

    // Use provided folder or create a new timestamped one
    let folderId: string;
    if (existingFolderId) {
      folderId = existingFolderId;
      console.log(`[generate-images] Reusing folder: ${existingFolderId}`);
    } else {
      const now = new Date();
      const timestamp = `gen_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
      folderId = await findOrCreateFolder(timestamp, parent_folder_id, accessToken);
    }

    // Download reference images
    const refImages: { data: string; mimeType: string }[] = [];
    for (const url of reference_image_urls) {
      const img = await urlToBase64(url);
      if (img) refImages.push(img);
    }
    console.log(`[generate-images] Downloaded ${refImages.length} reference images`);

    // Build Gemini request parts
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const parts: Record<string, unknown>[] = [{ text: variation }];
    for (const refImg of refImages) {
      parts.push({ inlineData: { mimeType: refImg.mimeType, data: refImg.data } });
    }

    console.log(`[generate-images] Calling Gemini for variation ${variation_index + 1}`);
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: "1:1" },
          },
        }),
        signal: AbortSignal.timeout(90000),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[generate-images] Gemini error [${response.status}]:`, errText);
      return new Response(
        JSON.stringify({ error: `Gemini error: ${response.status}`, folder_id: folderId }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const parts_response = data.candidates?.[0]?.content?.parts || [];

    let imageUrl: string | null = null;
    for (const part of parts_response) {
      if (part.inlineData?.data) {
        const fileName = `gen_${variation_index + 1}_${Date.now()}.png`;
        const fileId = await uploadFileToDrive(fileName, part.inlineData.data, "image/png", folderId, accessToken);
        await makeFilePublic(fileId, accessToken);
        imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        console.log(`[generate-images] Uploaded variation ${variation_index + 1}: ${imageUrl}`);
        break;
      }
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    console.log(`[generate-images] Done — variation ${variation_index + 1}`);

    return new Response(
      JSON.stringify({ success: true, image_url: imageUrl, folder_id: folderId, folder_url: folderUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-images] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
