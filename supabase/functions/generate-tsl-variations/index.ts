const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt_for_images, count } = await req.json();
    console.log("[generate-tsl-variations] Received request:", { prompt_for_images, count });

    if (!prompt_for_images || !count) {
      return new Response(JSON.stringify({ error: "prompt_for_images and count are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedCount = parseInt(String(count));
    if (isNaN(parsedCount) || parsedCount < 1) {
      return new Response(JSON.stringify({ error: "count must be a positive integer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the system prompt with the count substituted
    const systemPrompt = `generate ${parsedCount} variations
You are a high-converting Direct Response Creative Strategist specialized in TSL (Text Sales Letter) ads.

Your job is to transform a short user idea into a SCROLL-STOPPING image prompt designed ONLY to grab attention and force curiosity so users read the ad text.

IMPORTANT RULE:
The image must NOT fully explain the story.
It should create a "WHAT is going on here?" reaction.

YOUR OBJECTIVE:
Turn this into a visually shocking, curiosity-driven, emotionally triggering image prompt.

CORE PRINCIPLES:
1. PATTERN INTERRUPT - Something unusual, unsettling, or unexpected — break normal scrolling behavior
2. CURIOSITY GAP - Viewer should feel: "I need to know what's happening"
3. EMOTIONAL TRIGGER - Discomfort, fear, guilt, shock, intrigue, tension
4. VISUAL STORY (INCOMPLETE) - Hint at a story, but DO NOT resolve it

For each variation, include:
- Subject (appearance, pose, emotion)
- Environment (specific, immersive details)
- Disturbing or unusual element (IMPORTANT)
- Lighting (dramatic, cinematic, high contrast)
- Mood (tense, eerie, uncomfortable, mysterious)
- Composition (close-up, wide, angle, framing)
- Symbolism (subtle hints like mess, shadows, reflections)
- Realism level (photorealistic, cinematic, raw)

RULES:
- NO introductory text like "Here is your prompt"
- Direct, ready-to-paste prompts only
- NO text inside image
- NO clean or perfect scenes
- Add imperfection, chaos, tension
- Make it feel like a real moment caught at the wrong time
- Avoid generic stock image vibes
- Prioritize ATTENTION over beauty
- End each prompt with: cinematic, photorealistic, high contrast, dramatic lighting, unsettling, moody, 4k, raw`;

    const userPrompt = `INPUT: ${prompt_for_images}

Generate exactly ${parsedCount} independent, detailed image prompt variations. Return ONLY a valid JSON array of strings where each string is the complete, ready-to-paste image prompt (include all visual details and style tags). Format: ["variation 1 text", "variation 2 text", ...]`;

    // Build Gemini payload
    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { text: userPrompt },
          ],
        },
      ],
    };

    // Call Gemini with 90s timeout
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    console.log("[generate-tsl-variations] Calling Gemini API...");
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
      console.error("[generate-tsl-variations] Gemini API error:", geminiRes.status, errText);
      throw new Error(`Gemini API error [${geminiRes.status}]: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    console.log("[generate-tsl-variations] Gemini response received, length:", responseText.length);

    // Parse JSON array from response
    let variations: string[] = [];
    try {
      // Try to extract JSON array from the response text
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        variations = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(variations)) {
          throw new Error("Parsed JSON is not an array");
        }
        // Ensure we have the right count
        variations = variations.slice(0, parsedCount);
      } else {
        // Fallback: split by double newline and take first count items
        const parts = responseText.split(/\n\n+/).filter((p: string) => p.trim());
        variations = parts.slice(0, parsedCount);
      }
    } catch (parseErr: unknown) {
      console.error(
        "[generate-tsl-variations] JSON parse failed, using fallback split:",
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      );
      // Final fallback
      const parts = responseText.split(/\n\n+/).filter((p: string) => p.trim());
      variations = parts.slice(0, parsedCount);
    }

    console.log("[generate-tsl-variations] Generated variations count:", variations.length);

    return new Response(JSON.stringify({ success: true, variations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-tsl-variations] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
