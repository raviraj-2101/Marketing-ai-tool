# Pixar-style 3D-animated ads — pipeline design

> Status: **design / not yet built**. Author: agentic, 2026-06-02.
> Goal: add a *parallel* generation track for stylized 3D-animated (Pixar-look)
> video ads, alongside the existing HeyGen human-avatar UGC track.

---

## 1. Why this is a new track, not a tweak

The existing video path is built end-to-end around **photoreal human-avatar UGC**:

- `execute-avatar-generation` / `execute-scene-generation` proxy to n8n, which
  drives **HeyGen** (lip-synced human presenter) + a TTS voice (`voice_id`).
- The build unit is a script with a fixed **P1 (without product) / P2 (with
  product)** two-clip shape, tied to an `avatar_id` (see `BuildFromChatModal`).
- `ugc-generation-callback` only writes `result_images` for `avatar`/`scene`.

A Pixar-style ad is a **multi-shot stylized CGI narrative** with a consistent
cartoon character, cinematic camera, music/SFX, and (optionally) character
dialogue. HeyGen cannot produce it. So we keep the proven plumbing pattern
(**edge-function proxy → n8n job → Supabase callback → realtime UI**) but add a
new workflow, new tables, and a new UI track. Nothing in the avatar/HeyGen path
changes.

---

## 2. The generation workflow (keyframe-driven image-to-video)

One-shot text-to-video drifts badly on character identity. The reliable recipe
is **lock a character reference, then drive each shot from a keyframe image**:

```
Brief ─▶ [1] Shotlist (LLM)
            │
            ▼
        [2] Character + style reference sheet (image model)   ◀── the "lock"
            │
   ┌────────┴───────────────────────────────────────────┐
   │  per shot (fan-out)                                  │
   │   [3] Keyframe image  = charRef + shot description   │
   │   [4] Clip            = image-to-video(keyframe)     │
   └────────┬───────────────────────────────────────────┘
            ▼
        [5] Audio: VO (ElevenLabs) + music + SFX
            ▼
        [6] Assemble (ffmpeg): shots + audio + endcard → 9:16 / 16:9 mp4
            ▼
        [7] Human curation ─▶ push to AdsDB / Drive / Frame.io (existing flow)
```

| Step | What | Where it runs | Tooling |
|---|---|---|---|
| 1 | Brief → N-shot shotlist (visual, camera, action, dialogue) | edge fn or n8n | LLM (reuse `generate-brief` prompt style) |
| 2 | Character + style reference sheet | n8n | image model (see §5) |
| 3 | Per-shot start keyframe from char ref | n8n | image-to-image |
| 4 | Per-shot clip | n8n | **video model (see §5)** |
| 5 | VO / music / SFX | n8n | ElevenLabs + music lib; skip if Veo native audio |
| 6 | Stitch + endcard | n8n | ffmpeg |
| 7 | Review + ship | this app | existing AdsDB/Drive/Frame.io |

**Character consistency** (the hard problem) is solved at step 2: one locked
reference image is reused for every keyframe. Don't regenerate the character
per shot.

---

## 3. Architecture changes in this repo

### 3.1 New edge function — `execute-pixar-generation`

Mirror `execute-scene-generation` exactly (CORS, `verify_jwt = false`,
forward-to-n8n, return job ack). Register in `supabase/config.toml`:

```toml
[functions.execute-pixar-generation]
verify_jwt = false
```

Posts to a new n8n webhook, e.g. `https://acentecom.app.n8n.cloud/webhook/pixar-ad`:

```ts
interface PixarN8nPayload {
  generation_id: string;
  brief: string;            // product + concept + angle
  style: string;            // "Pixar 3D", color script, mood
  character_brief: string;  // who the hero character is
  reference_image?: string | null; // optional brand/product/char ref
  shot_count: number;       // default 6
  aspect_ratio: "9:16" | "16:9" | "1:1";
  with_dialogue: boolean;
  type: "pixar";
}
```

### 3.2 Extend the callback (or add `pixar-generation-callback`)

The current `ugc-generation-callback` is hard-typed to `avatar|scene` and only
stores images. Add a `"pixar"` branch (or a sibling function) that writes
**per-shot video assets** and the **assembled ad URL**, not base64 images.
Recommend a sibling function to avoid bloating the avatar callback:

```ts
interface PixarCallbackPayload {
  generation_id: string;
  status: "shotlist_ready" | "rendering" | "assembling" | "completed" | "failed";
  shots?: Array<{ idx: number; keyframe_url: string; clip_url: string;
                  status: string }>;
  final_video_url?: string;
  error?: string;
}
```

n8n calls this multiple times as the job progresses (one per phase), so the UI
gets live status via Supabase realtime.

### 3.3 New tables (migration)

Follow the conventions in `20260204110233_*.sql` exactly — `gen_random_uuid()`
PK, `status` default `'pending'`, `created_at`/`updated_at`, permissive RLS,
`update_updated_at_column` trigger, and add both tables to
`supabase_realtime`.

```sql
CREATE TABLE public.pixar_ad_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|shotlist_ready|rendering|assembling|completed|failed
  brief TEXT NOT NULL,
  style TEXT,
  character_brief TEXT,
  reference_image_url TEXT,
  shot_count INTEGER NOT NULL DEFAULT 6,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  with_dialogue BOOLEAN NOT NULL DEFAULT false,
  character_ref_url TEXT,        -- the locked reference sheet (step 2)
  final_video_url TEXT,          -- assembled ad (step 6)
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pixar_shots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id UUID NOT NULL
    REFERENCES public.pixar_ad_generations(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,          -- shot order
  description TEXT,
  camera TEXT,
  dialogue TEXT,
  keyframe_url TEXT,
  clip_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(generation_id, idx)
);
```

Per-shot rows are what let the user **regenerate a single bad shot** without
re-rendering the whole ad — important given cost/latency (§6).

### 3.4 New storage bucket

`pixar-assets` (public), mirroring `scene-images`. Holds character refs,
keyframes, clips, and finals.

### 3.5 New UI (parallel to the UGC pages)

The avatar/voice/P1-P2 modal does **not** map. Add:

- **`PixarGeneratorForm`** — brief, style preset, character brief, shot count,
  aspect ratio, dialogue toggle, optional reference upload. Submits via
  `supabase.functions.invoke("execute-pixar-generation", …)`, exactly like
  `SceneGenerationForm`.
- **Shot-review grid** — one card per `pixar_shots` row (keyframe + clip +
  "regenerate this shot"), plus the assembled-ad player. Subscribe to the two
  realtime tables for live progress (reuse the `useScenes`/`useAvatars` hook
  pattern).
- A `usePixarGenerations` hook mirroring `useScenes`.

---

## 4. n8n workflow (lives outside this repo)

New workflow on `acentecom.app.n8n.cloud` triggered by `webhook/pixar-ad`:

1. **Shotlist** node — LLM call, brief → JSON shotlist; POST
   `status: shotlist_ready` + shots to the callback.
2. **Character ref** node — image model → character_ref_url.
3. **Fan-out over shots** — keyframe (image-to-image) → clip (image-to-video);
   POST each finished shot to the callback (`status: rendering`).
4. **Audio** — ElevenLabs VO per dialogue line + music bed (skip VO if Veo
   native audio is used).
5. **Assemble** — ffmpeg concat + audio mux + endcard; upload to
   `pixar-assets`; POST `status: completed` + final_video_url.
6. On any failure → POST `status: failed` + error.

Secrets (model API keys, ElevenLabs) live in n8n, consistent with how HeyGen
keys are stored today.

---

## 5. Model recommendation (you were undecided)

**Primary: Google Veo 3.** Best Pixar/3D-render look, and — crucially — it
generates **native dialogue + SFX + lip-synced character mouths in one pass**,
which collapses steps 4–5 into one and removes a whole lip-sync sub-pipeline.
Access via Gemini API / Vertex AI. Highest cost per second, but fewest moving
parts.

**Character/keyframe image model: Nano Banana (Gemini 2.5 Flash Image)** for
fast, consistent character edits, or **Midjourney** for the strongest stylized
look. Either produces the locked reference (step 2) and keyframes (step 3).

**Cost-down alternative: Kling 2.x** (via fal.ai / Replicate) for the clips —
strong character coherence and image-to-video, materially cheaper than Veo, at
the cost of adding back a separate ElevenLabs VO + lip-sync pass.

**Runway Gen-4** is a solid middle option with good camera control and a mature
API.

Recommendation: **prototype one shot on Veo 3 first** to set the quality bar,
then decide whether Kling's cost savings justify the extra audio pipeline.

---

## 6. Risks & differences from the HeyGen track

- **Cost & latency**: cinematic models cost more per second and take minutes per
  shot, with high reject rates. Generate multiple candidates, curate. Per-shot
  regeneration (§3.3) keeps re-rolls cheap.
- **Consistency drift**: mitigated by the locked character ref, but expect some
  shots to need re-rolls — build that into the UI, not just the happy path.
- **Audio**: no human voice means no HeyGen lip-sync; either use Veo native
  audio or add ElevenLabs + a lip-sync pass.
- **Aspect ratio / duration**: confirm the chosen model supports 9:16 and your
  target ad length; some cap clips at 5–8s, so a 30s ad = ~5–6 stitched shots.

---

## 7. Build order (suggested)

1. Migration: `pixar_ad_generations` + `pixar_shots` + bucket + realtime.
2. `execute-pixar-generation` edge fn + `config.toml` entry.
3. `pixar-generation-callback` edge fn.
4. n8n workflow (single-shot happy path first, Veo 3).
5. `PixarGeneratorForm` + `usePixarGenerations` hook.
6. Shot-review grid + per-shot regenerate + final player.
7. Wire "ship" into the existing AdsDB/Drive/Frame.io push.
```

