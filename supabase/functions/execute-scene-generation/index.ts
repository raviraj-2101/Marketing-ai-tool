import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SceneGenerationPayload {
  generation_id: string;
  avatar_id: string;
  avatar_image_url: string;
  avatar_name: string;
  reference_image_url?: string;
  variant_count: number;
  prompt: string;
}

interface N8nPayload {
  generation_id: string;
  avatar_id: string;
  avatar_image: string;
  avatar_name: string;
  reference_image: string | null;
  variant_count: number;
  prompt: string;
  type: "scene";
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: SceneGenerationPayload = await req.json();

    // Transform payload for n8n webhook
    const n8nPayload: N8nPayload = {
      generation_id: payload.generation_id,
      avatar_id: payload.avatar_id,
      avatar_image: payload.avatar_image_url,
      avatar_name: payload.avatar_name,
      reference_image: payload.reference_image_url || null,
      variant_count: payload.variant_count,
      prompt: payload.prompt,
      type: "scene",
    };

    console.log("Calling n8n scene generation webhook with payload:", JSON.stringify(n8nPayload, null, 2));

    const response = await fetch("https://acentecom.app.n8n.cloud/webhook/ugc-scene", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(n8nPayload),
    });

    const responseText = await response.text();
    console.log("n8n webhook response status:", response.status);
    console.log("n8n webhook response body:", responseText);

    if (!response.ok) {
      throw new Error(`n8n webhook failed [${response.status}]: ${responseText}`);
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText || "Scene generation started" };
    }

    return new Response(JSON.stringify({ success: true, message: responseData.message || "Scene generation in progress...", data: responseData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error calling n8n webhook:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
