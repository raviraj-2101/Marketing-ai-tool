import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Avatar { url: string; label?: string; seed?: string }
interface SceneImages { scene_number: number; images: Array<{ url: string; prompt?: string }> }

interface CallbackPayload {
  job_id: string;
  callback_token: string;
  type: "character" | "scene_images" | "video";
  status: "in_progress" | "completed" | "failed";
  avatars?: Avatar[];
  scenes?: SceneImages[];
  final_video_url?: string;
  error?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload: CallbackPayload = await req.json();
    if (!payload?.job_id || !payload?.type || !payload?.status) {
      return json({ ok: false, error: "Missing job_id / type / status" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Route to the right job table by type.
    const table =
      payload.type === "character" ? "pixar_character_jobs"
      : payload.type === "video" ? "pixar_video_jobs"
      : "pixar_scene_image_jobs";

    // Only the scene table has result_scenes (needed for the incremental merge).
    const selectCols =
      payload.type === "scene_images" ? "id, callback_token, result_scenes" : "id, callback_token";

    const { data: jobRow, error: fetchErr } = await supabase
      .from(table)
      .select(selectCols)
      .eq("id", payload.job_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!jobRow) return json({ ok: false, error: "Unknown job_id" }, 404);
    if (jobRow.callback_token && payload.callback_token !== jobRow.callback_token) {
      return json({ ok: false, error: "callback_token mismatch" }, 401);
    }

    const update: Record<string, unknown> = { status: payload.status };
    if (payload.status === "failed") {
      update.error = payload.error || "Image Builder reported a failure";
    }

    if (payload.type === "character" && payload.avatars) {
      update.result_avatars = payload.avatars;
    }

    if (payload.type === "video" && payload.final_video_url) {
      update.final_video_url = payload.final_video_url;
    }

    if (payload.type === "scene_images" && payload.scenes) {
      // Merge by scene_number so incremental callbacks accumulate.
      const existing = Array.isArray(jobRow.result_scenes) ? (jobRow.result_scenes as SceneImages[]) : [];
      const byNum = new Map<number, SceneImages>();
      for (const s of existing) byNum.set(s.scene_number, s);
      for (const s of payload.scenes) byNum.set(s.scene_number, s);
      update.result_scenes = Array.from(byNum.values()).sort((a, b) => a.scene_number - b.scene_number);
    }

    const { error: updErr } = await supabase.from(table).update(update).eq("id", payload.job_id);
    if (updErr) throw updErr;

    return json({ ok: true });
  } catch (error: unknown) {
    console.error("pixar-image-callback error:", JSON.stringify(error));
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return json(
      { ok: false, error: e?.message ?? "Unknown error", details: e?.details, hint: e?.hint, code: e?.code },
      500,
    );
  }
});