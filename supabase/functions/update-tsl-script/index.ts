import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maps Google Sheet column names to tsl_scripts DB column names
const COLUMN_MAP: Record<string, string> = {
  "Angle": "angle",
  "Summary": "summary",
  "Variation Update": "variation_update",
  "CS": "cs",
  "Language": "language",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { tsl_id, column_name, updated_value } = body;

    if (!tsl_id || !column_name || updated_value === undefined || updated_value === null) {
      return new Response(
        JSON.stringify({ success: false, error: "tsl_id, column_name, and updated_value are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const dbColumn = COLUMN_MAP[column_name];
    if (!dbColumn) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unknown column_name: "${column_name}". Allowed values: ${Object.keys(COLUMN_MAP).join(", ")}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
      .from("tsl_scripts")
      .update({ [dbColumn]: updated_value })
      .eq("tsl_script_id", tsl_id);

    if (error) {
      throw new Error(`DB update error: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, tsl_id, column_name, updated_value }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});