const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRIEF_PROMPT = `You are an expert visual design analyst. I will provide multiple images. For each image, analyze the visual composition, layout, and styling, then provide a professional description suitable for marketing and design reference.

⚠️ CRITICAL RULES:
- DO NOT mention, quote, or reference any actual text, words, phrases, or numbers visible in any image.
- ONLY describe visual elements: colors, shapes, layout, typography style (handwritten vs. digital, serif vs. sans-serif), composition, atmosphere, and placement focus.
- Ignore watermarks, logos, and copyright marks.
- Tone: Determine tone based on image content (e.g., clinical, formal, casual, lifestyle, aspirational, energetic).

---

ANALYSIS GUIDELINES:

1. THEME & VISUAL CONCEPT:
   - Identify the core visual mood and aesthetic (e.g., "Minimalist Clean Professional", "Bold Typography Focus", "Lifestyle Wellness")
   - Describe the overall tone (professional, aspirational, energetic, calm, etc.)

2. LAYOUT & COMPOSITION:
   - Describe how elements are arranged (centered, asymmetrical, layered, etc.)
   - Note the visual hierarchy and emphasis areas
   - Identify the main focal point

3. TEXT & TYPOGRAPHY (Do NOT quote actual text):
   - Identify exact text placement in image (top, center, bottom, overlay, corners, scattered, etc.)
   - Describe text positioning relative to other elements (on top of, beside, overlaid on background, etc.)
   - Describe text style: handwritten, digital serif, sans-serif, bold, elegant, script, calligraphy, etc.
   - Text color and any background/box styling (solid color box, transparent, outlined, shadow, gradient background, etc.)
   - For ALL text (handwritten, printed, digital): describe EXACTLY WHERE it appears in the image and what surface/area it's placed on (e.g., "handwritten text on belly area", "script on product label", "text overlaid on background", "text on top corner", etc.)
   - Identify different text layers: title area, subtitle area, CTA/call-to-action area, secondary text
   - Describe how text is oriented (horizontal, diagonal, curved, vertical, angled, etc.)
   - Note text box styling: border colors, background colors, transparency, padding, corner radius, etc.

4. BODY & SPATIAL FOCUS (if applicable):
   - Note which area/region is prominent (belly, chest, torso, full body, etc.)
   - Describe positioning (frontal, side, dynamic angle, etc.)
   - Note skin tone focus and styling if visible

5. COLOR & VISUAL ELEMENTS:
   - Primary color palette: exact colors observed (e.g., "deep navy, bright coral, cream white")
   - Secondary/accent colors: supporting color scheme
   - Color distribution: where colors are placed and their visual impact
   - Background style: solid color, gradient (direction and colors), blur, texture, pattern, or image
   - Lighting: natural, studio, dramatic, soft, harsh, warm, cool, shadows, highlights
   - Key design elements: shapes (geometric, organic, circular, angular), decorative elements, icons, illustrations, photography style
   - Visual effects: shadows, depth, 3D effects, blur, transparency, opacity levels
   - Textures: rough, smooth, fabric, paper, metal, glass, or other material qualities
   - Visual weight distribution: balance of light and dark areas, visual hierarchy through contrast

6. OVERALL VISUAL CHARACTERISTICS:
   - Visual style classification: minimal/maximalist, bold/subtle, detailed/simple, clean/complex, elegant/casual, modern/vintage
   - Mood and atmosphere: calm, energetic, inspiring, luxurious, clinical, casual, playful, serious, intimate, corporate
   - Design approach: flat design, 3D, photographic, illustrated, mixed media, hand-drawn, digital
   - Visual balance: symmetrical, asymmetrical, radial, or dynamic composition
   - Visual flow: eye movement through the image (top to bottom, left to right, center-focused, scattered)
   - Dominant visual language: photography, illustration, typography, abstract, geometric, organic shapes
   - Contrast level: high contrast (bold, attention-grabbing), medium contrast, low contrast (subtle, blended)
   - Overall cohesion: how well all elements work together, unity of design theme

---

OUTPUT FORMAT:
Return a valid JSON array only. No extra text, no markdown, no backticks.

[
  {
    "name": "theme name here",
    "description": "comprehensive detailed visual analysis including all observed elements: colors, shapes, layout, background, lighting, textures, visual effects, design elements, text positioning, typography style, character/body positioning and focus, overall mood and atmosphere, visual flow, balance, contrast level, design approach, and complete design guidance for text placement, hierarchy, and tone. No sentence limit - include every visual detail observed."
  }
]

---

RULES:
- Theme name = the core visual/mood concept of the image (e.g. "Professional Typography Focus", "Bold Layout Energy", "Minimalist Design Aesthetic")
- Count the images provided. Output exactly that many themes — no more, no less.
- Description = describe EXACTLY what you see in the image with comprehensive visual analysis and NO sentence limit. Include ALL details:
  * Visual elements observed: every color, shape, design element, decorative component, and visual effect
  * Color palette: exact colors observed with their locations and visual impact
  * Layout and composition: how elements are arranged, visual hierarchy, focal points
  * Textures, lighting, and effects: shadows, gradients, depth, 3D effects, blur, transparency
  * Background: solid, gradient, textured, blurred, patterned, or photographic
  * Text positioning: exact placement (top, center, bottom, overlay, corners), orientation, styling
  * Typography: text style, size, weight, color, background styling
  * Overall mood and atmosphere: visual tone, design approach, visual flow, balance, contrast
  * Design guidance: where text should be placed, what typography style works, recommended title/subtitle length and tone
- NO bullet points, no labels, no extra commentary in the output.
- Use professional, marketing-appropriate language.
- If 3 images → 3 themes. If 5 images → 5 themes. Match exactly.`;

const BRIEF_PROMPT_SIMPLE = `I will provide multiple images. For each image, extract the theme and provide a brief description.

⚠️ CRITICAL RULES:
- DO NOT mention, quote, or reference any actual text, words, phrases, or numbers visible in any image.
- ONLY describe visual elements: colors, shapes, layout, props, atmosphere.
- Keep descriptions short — 1 to 2 lines only.

---

OUTPUT FORMAT:
Return a valid JSON array only. No extra text, no markdown, no backticks.

[
  {
    "name": "theme name here",
    "description": "1-2 line description here"
  }
]

---

RULES:
- NEVER describe the specific product itself. Instead, write "product" in its place (e.g. "product sits on a tiered white podium" instead of "dark glass bottle sits on a tiered white podium").
- Theme name = the core visual/mood concept of the image (e.g. "Soft Pastel Luxury", "Bold Neon Energy", "Minimal White Clean")
- Count the images provided. Output exactly that many themes — no more, no less.
- Description = short visual snapshot: background color, key props, product placement, overall feel
- No bullet points, no labels, no extra commentary
- If 3 images → 3 themes. If 5 images → 5 themes. Match exactly.`;

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;

  console.log("[generate-inspo-brief] Exchanging refresh token for access token...");
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
  console.log("[generate-inspo-brief] Access token obtained");
  return tokenData.access_token;
}

function extractFolderId(driveLink: string): string | null {
  const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function updateInspoStatus(inspoId: string, status: string, brief?: unknown[]) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const body: Record<string, unknown> = { inspo_brief_status: status };
  if (brief !== undefined) body.inspo_brief = brief;

  await fetch(`${supabaseUrl}/rest/v1/inspos?id=eq.${inspoId}`, {
    method: "PATCH",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let inspoId: string | null = null;

  try {
    const body = await req.json();
    inspoId = body.inspo_id;
    const driveLink: string = body.drive_link;
    const funnel: string = body.funnel || "comparison";

    console.log("[generate-inspo-brief] Starting for inspo:", inspoId, "funnel:", funnel);

    if (!inspoId || !driveLink) {
      return new Response(JSON.stringify({ error: "inspo_id and drive_link are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
console.log(funnel,"funnel")
    // Select prompt based on funnel type
    const selectedPrompt = funnel.toLowerCase() === "adv" ? BRIEF_PROMPT : BRIEF_PROMPT_SIMPLE;

    console.log(selectedPrompt,"selectedPrompt")

    const folderId = extractFolderId(driveLink);
    if (!folderId) {
      console.error("[generate-inspo-brief] Could not extract folder ID from:", driveLink);
      await updateInspoStatus(inspoId, "failed");
      return new Response(JSON.stringify({ error: "Could not extract folder ID from drive_link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as generating immediately so the UI can show the spinner
    await updateInspoStatus(inspoId, "generating");
    console.log("[generate-inspo-brief] Status set to generating, folder:", folderId);

    const accessToken = await getAccessToken();

    // List image files in the Drive folder (max 20)
    const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
    listUrl.searchParams.set("q", `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`);
    listUrl.searchParams.set("fields", "files(id,name,mimeType)");
    listUrl.searchParams.set("pageSize", "20");

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const err = await listRes.text();
      throw new Error(`Drive list error [${listRes.status}]: ${err}`);
    }
    const listData = await listRes.json();
    const files: { id: string; name: string; mimeType: string }[] = listData.files || [];
    console.log("[generate-inspo-brief] Found", files.length, "image files");

    if (files.length === 0) {
      await updateInspoStatus(inspoId, "failed");
      return new Response(JSON.stringify({ error: "No images found in the Drive folder" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download each image and convert to base64
    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (const file of files) {
      try {
        const imgRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!imgRes.ok) {
          console.warn("[generate-inspo-brief] Skipping file", file.id, "status:", imgRes.status);
          continue;
        }
        const buffer = await imgRes.arrayBuffer();
        const base64 = await arrayBufferToBase64(buffer);
        const mimeType = file.mimeType.startsWith("image/") ? file.mimeType : "image/jpeg";
        imageParts.push({ inlineData: { mimeType, data: base64 } });
      } catch (e) {
        console.warn("[generate-inspo-brief] Failed to fetch image", file.id, e);
      }
    }

    if (imageParts.length === 0) {
      await updateInspoStatus(inspoId, "failed");
      return new Response(JSON.stringify({ error: "Could not download any images from the folder" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[generate-inspo-brief] Calling Gemini with", imageParts.length, "images...");

    // Call Gemini API directly via HTTP
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

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
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: selectedPrompt },
                  ...imageParts,
                ],
              },
            ],
          }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error [${geminiRes.status}]: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const rawText: string =
      geminiData.candidates?.[0]?.content?.parts
        ?.filter((p: { text?: string }) => p.text)
        ?.map((p: { text: string }) => p.text)
        ?.join("\n") ?? "";

    console.log("[generate-inspo-brief] Gemini raw response length:", rawText.length);

    // Strip markdown fences if present and parse JSON
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const brief = JSON.parse(cleaned);

    if (!Array.isArray(brief)) {
      throw new Error("Gemini response is not a JSON array");
    }

    // Persist results
    await updateInspoStatus(inspoId, "completed", brief);
    console.log("[generate-inspo-brief] Done —", brief.length, "themes generated");

    return new Response(JSON.stringify({ success: true, brief }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-inspo-brief] Error:", msg);
    if (inspoId) {
      await updateInspoStatus(inspoId, "failed").catch(() => {});
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
