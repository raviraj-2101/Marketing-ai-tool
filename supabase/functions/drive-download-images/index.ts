const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// Simple ZIP implementation for Deno (no external deps)
function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(n: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
  function u32(n: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const localHeader = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04, // sig
      ...u16(20), // version
      ...u16(0),  // flags
      ...u16(0),  // compression (store)
      ...u16(0), ...u16(0), // mod time/date
      ...u32(crc),
      ...u32(file.data.length), // compressed
      ...u32(file.data.length), // uncompressed
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...nameBytes,
    ]);
    entries.push({ name: nameBytes, data: file.data, crc, offset });
    parts.push(localHeader, file.data);
    offset += localHeader.length + file.data.length;
  }

  const centralStart = offset;
  for (const entry of entries) {
    const centralHeader = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02,
      ...u16(20), ...u16(20),
      ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(entry.crc),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(entry.name.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0),
      ...u32(entry.offset),
      ...entry.name,
    ]);
    parts.push(centralHeader);
    offset += centralHeader.length;
  }

  const centralSize = offset - centralStart;
  const endRecord = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06,
    ...u16(0), ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(centralStart),
    ...u16(0),
  ]);
  parts.push(endRecord);

  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { file_ids, file_names } = await req.json();
    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return new Response(JSON.stringify({ error: "file_ids array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken();
    const zipFiles: { name: string; data: Uint8Array }[] = [];

    for (let i = 0; i < file_ids.length; i++) {
      const fileId = file_ids[i];
      let fileName = file_names?.[i] || `image_${i}`;
      if (!/\.(jpg|jpeg|png|webp|gif|bmp|tiff?|svg)$/i.test(fileName)) {
        fileName += ".jpg";
      }
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        console.error(`Failed to download ${fileId}: ${res.status}`);
        continue;
      }
      const data = new Uint8Array(await res.arrayBuffer());
      zipFiles.push({ name: fileName, data });
    }

    if (zipFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No files could be downloaded" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zipData = createZip(zipFiles);

    return new Response(zipData, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=images.zip",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
