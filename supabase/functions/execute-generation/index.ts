import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerationPayload {
  Brand: string;
  Product: string;
  Flow: string;
  CS: string | null;
  Concept: string | null;
  prompt: string;
  referenceImages: string[];
  inspoLinks: string[];
  fileFormat: string | null;
  ad_id: number;
  description: string | null;
  driveLink: string | null;
  number_of_ads: string | null;
  max_variations_per_ad_group: string | null;
  generation_id: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: GenerationPayload = await req.json();

    console.log("Calling n8n webhook with payload:", JSON.stringify(payload, null, 2));

    const response = await fetch("https://acentecom.app.n8n.cloud/webhook/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
      responseData = { message: responseText };
    }

    return new Response(JSON.stringify({ success: true, data: responseData }), {
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
