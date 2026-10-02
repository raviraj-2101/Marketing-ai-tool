import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";
import { apiRequest } from "@/lib/queryClient";

// The image-builder API lives on VITE_SERVER_URL (== API_BASE), same backend
// the rest of the app calls via apiRequest (user JWT auth attached for us).
// It does the work async and POSTs results to PIXAR_CALLBACK_URL (our Supabase
// edge function), which updates the job row → realtime → UI.
const PIXAR_CALLBACK_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/pixar-image-callback`;

// New tables aren't in the generated Supabase types yet (types.ts is also
// out of sync repo-wide), so we access them through a loosely-typed handle.
// Regenerate src/integrations/supabase/types.ts to tighten this.
type LooseQuery = {
  insert: (values: Record<string, unknown>) => LooseQuery;
  update: (values: Record<string, unknown>) => LooseQuery;
  select: (cols?: string) => LooseQuery;
  eq: (col: string, val: unknown) => LooseQuery;
  single: () => Promise<{ data: Record<string, unknown>; error: unknown }>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
};
const db = supabase as unknown as {
  from: (t: string) => LooseQuery;
  channel: typeof supabase.channel;
  removeChannel: typeof supabase.removeChannel;
};

export type PixarAvatarRef = { url: string; label?: string; seed?: string };
export type PixarSceneImages = {
  scene_number: number;
  images: Array<{ url: string; prompt?: string }>;
};

export interface PixarCharacterJob {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  product: string | null;
  product_label: string | null;
  style: string | null;
  main_character: string | null;
  main_pain: string | null;
  storyline_pattern: string | null;
  description: string | null;
  variant_count: number;
  result_avatars: PixarAvatarRef[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PixarSceneImageJob {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  character_job_id: string | null;
  selected_avatar_url: string | null;
  product: string | null;
  product_label: string | null;
  style: string | null;
  storyboard: unknown;
  result_scenes: PixarSceneImages[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PixarVideoJob {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  scene_image_job_id: string | null;
  character_job_id: string | null;
  selected_avatar_url: string | null;
  with_audio: boolean;
  final_video_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const newToken = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`);

export interface StartCharacterInput {
  product?: string;
  productLabel?: string;
  style?: string;
  mainCharacter?: string;
  mainPain?: string;
  storylinePattern?: string;
  description?: string;
  variantCount?: number;
  /** Full character roster — when present the backend generates one CHARACTER
   *  BOARD per character (board mode) instead of N main-character variants.
   *  Each entry: { label, value } where value is the "Name: … <paragraph>". */
  characters?: Array<{ label: string; value: string }>;
}

/** Insert a character job row, then trigger the Image Builder via the edge fn.
 *  Returns the job id; the page subscribes to it via realtime. */
export function useStartPixarCharacter() {
  return useMutation({
    mutationFn: async (input: StartCharacterInput): Promise<string> => {
      const callback_token = newToken();
      const { data, error } = await db
        .from("pixar_character_jobs")
        .insert({
          status: "pending",
          product: input.product ?? null,
          product_label: input.productLabel ?? null,
          style: input.style ?? "Pixar 3D animated",
          main_character: input.mainCharacter ?? null,
          main_pain: input.mainPain ?? null,
          storyline_pattern: input.storylinePattern ?? null,
          description: input.description ?? null,
          variant_count: input.variantCount ?? 3,
          callback_token,
          result_avatars: [],
        })
        .select()
        .single();
      if (error) throw error;

      try {
        await apiRequest("POST", "/api/pixar/character", {
          job_id: data.id,
          callback_token,
          callback_url: PIXAR_CALLBACK_URL,
          variant_count: input.variantCount ?? 3,
          style: input.style ?? "Pixar 3D animated",
          product: input.product,
          product_label: input.productLabel,
          character: {
            main_character: input.mainCharacter,
            main_pain: input.mainPain,
            storyline_pattern: input.storylinePattern,
            description: input.description,
          },
          // When a roster is provided the backend switches to board mode and
          // generates one CHARACTER BOARD per character.
          ...(input.characters && input.characters.length
            ? { characters: input.characters }
            : {}),
        });
      } catch (fnErr) {
        // Surface the failure on the row so the UI shows it.
        await db.from("pixar_character_jobs")
          .update({ status: "failed", error: getErrorMessage(fnErr) })
          .eq("id", data.id);
        throw fnErr;
      }
      return data.id as string;
    },
    onError: (error) => {
      toast({ title: "Couldn't start character generation", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export interface StartProductBoardInput {
  product?: string;
  productLabel?: string;
  productName?: string;
  brand?: string;
  style?: string;
  /** Product reference image URL(s) — the single source of truth for the board. */
  productImages: string[];
}

/** Insert a job row (reuses pixar_character_jobs) then trigger the product-board
 *  generation. The result board lands in result_avatars via the same callback as
 *  characters (type:"character"). Returns the job id for realtime subscription. */
export function useStartPixarProductBoard() {
  return useMutation({
    mutationFn: async (input: StartProductBoardInput): Promise<string> => {
      const callback_token = newToken();
      const { data, error } = await db
        .from("pixar_character_jobs")
        .insert({
          status: "pending",
          product: input.product ?? null,
          product_label: input.productLabel ?? null,
          style: input.style ?? "Product board",
          description: "product-board",
          variant_count: 1,
          callback_token,
          result_avatars: [],
        })
        .select()
        .single();
      if (error) throw error;

      try {
        await apiRequest("POST", "/api/pixar/product-board", {
          job_id: data.id,
          callback_token,
          callback_url: PIXAR_CALLBACK_URL,
          product: input.product,
          product_label: input.productLabel,
          product_name: input.productName,
          brand: input.brand,
          product_images: input.productImages,
        });
      } catch (fnErr) {
        await db.from("pixar_character_jobs")
          .update({ status: "failed", error: getErrorMessage(fnErr) })
          .eq("id", data.id);
        throw fnErr;
      }
      return data.id as string;
    },
    onError: (error) => {
      toast({ title: "Couldn't start product board", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export interface StartSceneImagesInput {
  characterJobId?: string;
  selectedAvatarUrl: string;
  product?: string;
  productLabel?: string;
  /** Reference image URL of the chosen product — reproduced in product scenes. */
  productImage?: string;
  style?: string;
  meta?: Record<string, unknown>;
  /** Scenes in the Image-Builder payload shape (snake_case keys). */
  scenes: Array<Record<string, unknown>>;
  /** Full storyboard ({meta, scenes}) stored on the row for reference. */
  storyboard: unknown;
}

export function useStartPixarSceneImages() {
  return useMutation({
    mutationFn: async (input: StartSceneImagesInput): Promise<string> => {
      const callback_token = newToken();
      const { data, error } = await db
        .from("pixar_scene_image_jobs")
        .insert({
          status: "pending",
          character_job_id: input.characterJobId ?? null,
          selected_avatar_url: input.selectedAvatarUrl,
          product: input.product ?? null,
          product_label: input.productLabel ?? null,
          style: input.style ?? "Pixar 3D animated",
          storyboard: input.storyboard ?? {},
          callback_token,
          result_scenes: [],
        })
        .select()
        .single();
      if (error) throw error;

      try {
        await apiRequest("POST", "/api/pixar/scene-images", {
          job_id: data.id,
          callback_token,
          callback_url: PIXAR_CALLBACK_URL,
          style: input.style ?? "Pixar 3D animated",
          product: input.product,
          product_label: input.productLabel,
          product_image: input.productImage,
          selected_avatar: { url: input.selectedAvatarUrl, character_job_id: input.characterJobId },
          meta: input.meta ?? {},
          scenes: input.scenes,
        });
      } catch (fnErr) {
        await db.from("pixar_scene_image_jobs")
          .update({ status: "failed", error: getErrorMessage(fnErr) })
          .eq("id", data.id);
        throw fnErr;
      }
      return data.id as string;
    },
    onError: (error) => {
      toast({ title: "Couldn't start scene image generation", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export interface StartVideoInput {
  sceneImageJobId?: string;
  characterJobId?: string;
  selectedAvatarUrl?: string;
  product?: string;
  productLabel?: string;
  style?: string;
  withAudio: boolean;
  music?: string;
  /** Per-scene frames: [{scene_number, keyframe_url, frame_urls, duration_s, spoken_line}].
   *  frame_urls carries every generated frame so Image Builder animates the full arc. */
  scenes: Array<Record<string, unknown>>;
  /** Motion method on Image Builder. Omit to use its default ("interpolate"). */
  motionMode?: "interpolate" | "kling-chain";
}

/** Single call to the Image Builder: it validates the payload, creates the
 *  pixar_video_jobs row (backend-owned), then animates + stitches the scenes into
 *  one final mp4. We generate the job_id client-side so we can subscribe to the
 *  row's realtime updates immediately after the call returns. */
export function useStartPixarVideo() {
  return useMutation({
    mutationFn: async (input: StartVideoInput): Promise<string> => {
      const job_id = newToken();
      const callback_token = newToken();

      // No Supabase insert here — the backend creates the row only after it has
      // validated the payload (see createVideo in image-builder). One round-trip.
      await apiRequest("POST", "/api/pixar/video", {
        job_id,
        callback_token,
        callback_url: PIXAR_CALLBACK_URL,
        style: input.style ?? "Pixar 3D animated",
        product: input.product,
        product_label: input.productLabel,
        scene_image_job_id: input.sceneImageJobId ?? null,
        character_job_id: input.characterJobId ?? null,
        selected_avatar: { url: input.selectedAvatarUrl, character_job_id: input.characterJobId },
        with_audio: input.withAudio,
        music: input.music,
        scenes: input.scenes,
        ...(input.motionMode ? { motion_mode: input.motionMode } : {}),
      });

      return job_id;
    },
    onError: (error) => {
      toast({ title: "Couldn't start video generation", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export interface StartNewVideoInput {
  /** Optional label for backend logs; also the generation_id grouping the scenes' fal rows. */
  jobId?: string;
  style?: string;
  /** Brand + product label (same human label, like the HeyGen path) and the chosen
   *  product reference image — written onto each scene's fal video_generation_logs row. */
  brand?: string;
  product?: string;
  product_name?: string;
  product_image?: string;
  /** Script format label (e.g. "Pixar-Style Video Ads (under 60s)") — stamped on each fal row. */
  video_format?: string;
  /** Concept name + Creative Strategist — written onto each scene's video_generation_logs row. */
  concept?: string;
  cs?: string;
  /** { main_character, main_pain, storyline_pattern } — used to build the prompt. */
  meta?: Record<string, unknown>;
  /** Per-scene: [{ scene_number, first_frame, duration_s, spoken_line,
   *  setting, expression, action, camera, audio_beat, show_product }]. */
  scenes: Array<Record<string, unknown>>;
}

/** Standalone call to the Seedance "new-video" endpoint. The backend builds the
 *  cinematic prompt from the scene fields, runs Seedance per scene (first+last
 *  frame → clip with its own audio), and LOGS the raw output URL. No job row, no
 *  callback, no realtime — this just fires the request and returns the ack. */
export function useStartPixarNewVideo() {
  return useMutation({
    mutationFn: async (input: StartNewVideoInput): Promise<{ ok: boolean; scenes: number }> => {
      const res = await apiRequest("POST", "/api/pixar/new-video", {
        job_id: input.jobId ?? newToken(),
        style: input.style ?? "Stylized 3D animated",
        // Omit empty product fields so an unselected product stays clean (the
        // backend treats them as optional / empty-on-first-submit).
        ...(input.brand ? { brand: input.brand } : {}),
        ...(input.product ? { product: input.product } : {}),
        ...(input.product_name ? { product_name: input.product_name } : {}),
        ...(input.product_image ? { product_image: input.product_image } : {}),
        ...(input.video_format ? { video_format: input.video_format } : {}),
        ...(input.concept ? { concept: input.concept } : {}),
        ...(input.cs ? { cs: input.cs } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
        scenes: input.scenes,
      });
      return res.json();
    },
    onError: (error) => {
      toast({ title: "Couldn't start new-video generation", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

/** Fetch a single job row (used to seed state before realtime kicks in). */
export async function fetchPixarCharacterJob(id: string): Promise<PixarCharacterJob | null> {
  const { data, error } = await db.from("pixar_character_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data
    ? { ...data, result_avatars: (data.result_avatars as PixarAvatarRef[]) || [] }
    : null;
}

export async function fetchPixarSceneImageJob(id: string): Promise<PixarSceneImageJob | null> {
  const { data, error } = await db.from("pixar_scene_image_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data
    ? { ...data, result_scenes: (data.result_scenes as PixarSceneImages[]) || [] }
    : null;
}

export async function fetchPixarVideoJob(id: string): Promise<PixarVideoJob | null> {
  const { data, error } = await db.from("pixar_video_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as PixarVideoJob) || null;
}

/** Subscribe to UPDATE events on a job row. Returns an unsubscribe fn. */
export function subscribePixarJob(
  table: "pixar_character_jobs" | "pixar_scene_image_jobs" | "pixar_video_jobs",
  id: string,
  onUpdate: (row: Record<string, unknown>) => void,
): () => void {
  const channel = db
    .channel(`${table}-${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table, filter: `id=eq.${id}` },
      (payload: { new: Record<string, unknown> }) => onUpdate(payload.new),
    )
    .subscribe();
  return () => { db.removeChannel(channel); };
}
