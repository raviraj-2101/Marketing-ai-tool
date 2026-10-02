import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallbackPayload {
  generation_id: string;
  type: "avatar" | "scene";
  status: "completed" | "failed";
  images?: string[]; // Array of base64 images
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: CallbackPayload = await req.json();

    console.log("Received UGC generation callback:", JSON.stringify({
      generation_id: payload.generation_id,
      type: payload.type,
      status: payload.status,
      imageCount: payload.images?.length || 0,
    }));

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tableName = payload.type === "avatar" ? "avatar_generations" : "scene_generations";

    // Update the generation record
    const updateData: Record<string, unknown> = {
      status: payload.status,
    };

    if (payload.status === "completed" && payload.images) {
      updateData.result_images = payload.images;
    }

    const { error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq("id", payload.generation_id);

    if (error) {
      console.error("Error updating generation:", error);
      throw error;
    }

    console.log(`Successfully updated ${tableName} with id ${payload.generation_id}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error processing callback:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
