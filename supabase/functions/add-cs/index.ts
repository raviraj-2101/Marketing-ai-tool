import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLICKUP_LIST_ID = "901522569196";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: { label: string; value: string }[] = await req.json();

    if (!Array.isArray(payload) || payload.length === 0) {
      return new Response(
        JSON.stringify({ error: "Payload must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ClickUp members
    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY")!;
    const membersRes = await fetch(
      `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/member`,
      { headers: { Authorization: clickupApiKey } }
    );

    if (!membersRes.ok) {
      const errText = await membersRes.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch ClickUp members", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const membersData = await membersRes.json();
    const members: { id: number; username: string; email: string }[] =
      membersData.members || [];

    // Init Supabase client with service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: { email: string; action: string }[] = [];

    for (const item of payload) {
      const email = item.value;
      const label = item.label;

      // Find matching ClickUp member by email
      const member = members.find(
        (m) => m.email?.toLowerCase() === email.toLowerCase()
      );

      if (!member) {
        results.push({ email, action: "skipped - no ClickUp member match" });
        continue;
      }

      const clickupUserId = String(member.id);

      // Check if email exists in cs_config
      const { data: existing, error: selectError } = await supabase
        .from("cs_config")
        .select("id, clickup_user_id")
        .eq("value", email)
        .maybeSingle();

      if (selectError) {
        results.push({ email, action: `error - ${selectError.message}` });
        continue;
      }

      if (existing) {
        if (existing.clickup_user_id === clickupUserId) {
          results.push({ email, action: "no change" });
        } else {
          const { error: updateError } = await supabase
            .from("cs_config")
            .update({ clickup_user_id: clickupUserId, updated_at: new Date().toISOString() })
            .eq("id", existing.id);

          if (updateError) {
            results.push({ email, action: `update error - ${updateError.message}` });
          } else {
            results.push({ email, action: "updated clickup_user_id" });
          }
        }
      } else {
        const { error: insertError } = await supabase
          .from("cs_config")
          .insert({ label, value: email, clickup_user_id: clickupUserId });

        if (insertError) {
          results.push({ email, action: `insert error - ${insertError.message}` });
        } else {
          results.push({ email, action: "inserted" });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
