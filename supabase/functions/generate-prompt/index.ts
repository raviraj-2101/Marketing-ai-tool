import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    console.log("Calling n8n generate-prompt webhook with payload:", JSON.stringify(payload, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    let response: Response;
    try {
      response = await fetch("https://acentecom.app.n8n.cloud/webhook/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw new Error("n8n webhook timed out after 5 minutes. The workflow may still be processing — please check n8n.");
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const responseText = await response.text();
    console.log("n8n webhook response status:", response.status);
    console.log("n8n webhook response body:", responseText);

    if (!response.ok) {
      // If we got an HTML error page (like Cloudflare 524), show a clean message
      if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html")) {
        throw new Error(`n8n webhook failed with status ${response.status}. The workflow may have timed out — please retry or check n8n.`);
      }
      throw new Error(`n8n webhook failed [${response.status}]: ${responseText}`);
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { prompt: responseText };
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
