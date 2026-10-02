import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [brandsRes, productsRes] = await Promise.all([
      supabase.from("brands").select("id, name, brand_code").order("name"),
      supabase.from("products").select("id, name, product_code, brand_id").order("name"),
    ]);

    if (brandsRes.error) throw new Error(brandsRes.error.message);
    if (productsRes.error) throw new Error(productsRes.error.message);

    return new Response(
      JSON.stringify({ brands: brandsRes.data, products: productsRes.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
