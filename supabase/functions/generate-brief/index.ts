const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;

  console.log("[generate-brief] Exchanging refresh token for access token...");
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
    console.error("[generate-brief] Token exchange failed:", JSON.stringify(tokenData));
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  console.log("[generate-brief] Access token obtained successfully");
  return tokenData.access_token;
}

function extractDocId(url: string): string | null {
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { docs_file_url } = await req.json();
    console.log("[generate-brief] Received docs_file_url:", docs_file_url);

    if (!docs_file_url) {
      return new Response(JSON.stringify({ error: "docs_file_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = extractDocId(docs_file_url);
    if (!docId) {
      console.error("[generate-brief] Could not extract document ID from:", docs_file_url);
      return new Response(
        JSON.stringify({ error: "Could not extract document ID from the provided URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[generate-brief] Extracted docId:", docId);

    // 1. Get Google access token
    const accessToken = await getAccessToken();

    // 2. Export Google Doc as plain text
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`;
    console.log("[generate-brief] Exporting document from Drive...");
    const docRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!docRes.ok) {
      const errText = await docRes.text();
      console.error("[generate-brief] Drive export error:", docRes.status, errText);
      throw new Error(`Drive export error [${docRes.status}]: ${errText}`);
    }
    const docContent = await docRes.text();
    console.log("[generate-brief] Document exported, length:", docContent.length);

    // 3. Build Gemini payload
    const systemPrompt = `I need you to extract and summarize the advertising brief from the provided document. Give me copy paste brief,  Not in detailed prompt.\n\nYour task:\n1. Identify the product name and brand from the document content.\n2. Extract ALL key requirements for generating static ads for Meta (Facebook/Instagram).\n3. Focus specifically on the \'Product Packaging\' type ads mentioned in the document.\n\nProvide a comprehensive, product-agnostic advertising brief that includes:\n- Identified product name and brand\n- Core purpose and primary advertising angle\n- Target audience\n- Key messaging points and value propositions\n- Design and visual requirements\n- Product packaging representation rules\n- Restrictions, compliance rules, and guidelines\n- Brand tone, voice, and positioning\n\nImportant instructions:\n- Do NOT assume or invent any product details.\n- Use ONLY information explicitly present in the document.\n- If any section is missing from the document, clearly remove that section.\n- Structure the output as a clear, actionable brief that can be directly used by an ad designer or creative automation system.\n\nHere is the document content:`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { text:  docContent },
            {
              text: "\n\nBased on this document, generate a detailed advertising brief . Include all constraints, design inspirations, messaging guidelines, and technical requirements. Give me copy paste brief,  Not in detailed prompt. If anything not specified in the document, then don't provide that point in output.In output don't want any notes.",
            },
          ],
        },
      ],
    };

    // 4. Call Gemini with 120s timeout
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    console.log("[generate-brief] Calling Gemini API...");
    let geminiRes: Response;
    try {
      geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify(geminiPayload),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[generate-brief] Gemini API error:", geminiRes.status, errText);
      throw new Error(`Gemini API error [${geminiRes.status}]: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const briefText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    console.log("[generate-brief] Brief generated, length:", briefText.length);

    return new Response(JSON.stringify({ success: true, brief: briefText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-brief] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
