# Pixar "Build UGC" — Image Builder API contract

> For the **Image Builder repo** team. This app (ai-static-generator) drives the
> UI + job state in Supabase; the Image Builder repo owns all image-creation
> logic. This doc is the contract between them.
>
> Status: **WIRED.** The image-builder lives at `VITE_SERVER_URL` (== the app's
> `API_BASE`). The **frontend calls your endpoints directly** with the logged-in
> user's JWT (`Authorization: Bearer <jwt>`), the same way it calls every other
> `/api/*` route — there is no Supabase edge-function proxy in the trigger path.
>
> - **Endpoints:** `POST {VITE_SERVER_URL}/api/pixar/character` and
>   `POST {VITE_SERVER_URL}/api/pixar/scene-images`
> - **Images:** hosted HTTPS URLs.
> - **Scene callbacks:** incremental (one per finished scene), then a final
>   `completed`.
> - **Results path:** you POST results to the `callback_url` we send you, which
>   is our Supabase function `pixar-image-callback`. It updates the job row →
>   the UI updates live via Supabase realtime.

---

## 1. The flow (what the user does)

1. User generates a **Pixar storyboard** (Format 03) in Script Chat.
2. A **Build UGC** button appears on top of the storyboard. Clicking it opens a
   new page showing the scenes in a table + basic details.
3. User clicks **Create main character avatar** → we call **Endpoint A**. You
   generate **3 character reference images** and call our **callback** with them.
4. User picks **one** of the 3 references.
5. User clicks **Generate scene images** → we call **Endpoint B** with the full
   storyboard + the chosen reference. You analyze each scene + its duration and
   generate **4–5 images per scene**, then call our **callback** with them.
6. We render scene-wise cards (scene details + its images).

## 2. Async + realtime model

Both steps are **fire-and-forget + callback** (the existing avatar/scene
pattern in this app):

```
Frontend ──insert job row (Supabase)──▶ status: "pending"
   │
   └─apiRequest POST {VITE_SERVER_URL}/api/pixar/<endpoint>   (Image Builder)
                          │  Authorization: Bearer <user jwt>
                          │  (returns 200 ack immediately)
                          ▼
                    you do the work (async)
                          │
                          ▼
        POST <callback_url>   ◀── you call us back (= pixar-image-callback)
                          │
                          ▼
        we UPDATE the job row → Supabase realtime → UI updates live
```

**You never write to our database directly.** You only (a) accept the trigger
POST and (b) POST results to the `callback_url` we hand you in every trigger
(don't hardcode it).

- **Auth on the trigger (A/B):** the frontend sends the logged-in user's JWT as
  `Authorization: Bearer <jwt>` (handled automatically by `apiRequest`). Verify
  it the same way your other `/api/*` routes do.
- **Auth on the callback:** we send you a per-job `callback_token` in the
  trigger payload. Send it back in the callback body so we can verify.
- **Idempotency:** `job_id` is unique. If you retry a callback, reuse the same
  `job_id`; we treat the latest `status` as authoritative.
- **Images:** return **public HTTPS URLs** (preferred) hosted by you, OR
  base64 data URIs. URLs are strongly preferred (smaller payloads, no re-upload
  on our side). State which you'll use.

---

## 3. Endpoint A — Create main character avatar

**Request (we → you)**

```
POST {VITE_SERVER_URL}/api/pixar/character
Authorization: Bearer <user jwt>
Content-Type: application/json
```

```jsonc
{
  "job_id": "uuid",                       // our job row id; echo it in the callback
  "callback_url": "https://<proj>.supabase.co/functions/v1/pixar-image-callback",
  "callback_token": "opaque-string",      // echo it in the callback
  "type": "character",
  "variant_count": 3,                     // how many references to return (default 3)
  "style": "Pixar 3D animated",           // global art-direction string
  "product": "acme-glow",                 // product slug (for context)
  "product_label": "Acme Glow",
  "character": {
    "main_character": "A tired 30-something mom, warm and relatable",  // meta.main_character
    "main_pain": "Visible: dull skin · Hidden: low confidence",        // meta.main_pain
    "storyline_pattern": "Before/after transformation",                // meta.chosen_storyline_pattern
    "description": "free-text extra notes if the user added any"       // optional
  }
}
```

**Immediate response (you → us)** — just an ack; the real result comes via callback:

```jsonc
{ "ok": true, "job_id": "uuid", "message": "character generation started" }
```

**Callback (you → us), when done** — see §5. For this step:

```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque-string",
  "type": "character",
  "status": "completed",                  // or "failed"
  "avatars": [
    { "url": "https://.../ref-1.png", "label": "Option 1", "seed": "optional" },
    { "url": "https://.../ref-2.png", "label": "Option 2" },
    { "url": "https://.../ref-3.png", "label": "Option 3" }
  ]
}
```

---

## 4. Endpoint B — Generate scene images

Called after the user picks one of the 3 references.

**Request (we → you)**

```
POST {VITE_SERVER_URL}/api/pixar/scene-images
Authorization: Bearer <user jwt>
Content-Type: application/json
```

```jsonc
{
  "job_id": "uuid",
  "callback_url": "https://<proj>.supabase.co/functions/v1/pixar-image-callback",
  "callback_token": "opaque-string",
  "type": "scene_images",
  "style": "Pixar 3D animated",
  "product": "acme-glow",
  "product_label": "Acme Glow",
  "selected_avatar": {
    "url": "https://.../ref-2.png",       // the reference the user chose
    "character_job_id": "uuid"            // links back to the character job
  },
  "meta": {
    "main_character": "A tired 30-something mom…",
    "main_pain": "Visible: dull skin · Hidden: low confidence",
    "storyline_pattern": "Before/after transformation"
  },
  // The full storyboard. You decide 4–5 images per scene based on duration_s
  // (rule of thumb we suggest: ~1 image per 1.5–2s, min 4, max 5). You may
  // override; return whatever you generate.
  "scenes": [
    {
      "scene_number": 1,
      "duration_s": 6,                    // null if the model didn't supply it
      "spoken_line": "I used to dread mornings…",
      "setting": "Sunlit bedroom, soft pastel palette",
      "expression": "weary, then hopeful",
      "action": "Character sits up in bed, rubs eyes",
      "camera": "Slow push-in, medium shot",
      "audio_beat": "Beat: low → rising · Music: gentle piano",
      "bridge_beat": "Opening scene"      // null/absent if none
    }
    // … one object per scene
  ]
}
```

**Immediate response (you → us)**

```jsonc
{ "ok": true, "job_id": "uuid", "message": "scene image generation started" }
```

**Callback (you → us)** — you may call **once at the end** with all scenes, or
**incrementally** (one callback per finished scene with
`status: "in_progress"`, then a final `status: "completed"`). We render
whatever has arrived so far, so incremental is nicer UX.

```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque-string",
  "type": "scene_images",
  "status": "completed",                  // "in_progress" | "completed" | "failed"
  "scenes": [
    {
      "scene_number": 1,
      "images": [
        { "url": "https://.../s1-a.png", "prompt": "optional prompt used" },
        { "url": "https://.../s1-b.png" },
        { "url": "https://.../s1-c.png" },
        { "url": "https://.../s1-d.png" }
      ]
    }
    // … one object per scene you've finished
  ]
}
```

> On an incremental callback, send only the scenes finished so far (or all
> scenes generated up to now). We merge by `scene_number`, so re-sending a
> scene replaces its images.

---

## 4b. Endpoint C — Build the final video

Called after the per-scene frames are generated. You animate each scene's frames
into that scene's clip, generate the voiceover from each scene's `spoken_line`,
add a music bed, **stitch everything into a single 9:16 mp4**, and return its URL
via callback.

**Flow:** the frontend makes a SINGLE call here (generating `job_id` +
`callback_token` itself). You validate the payload, and ONLY then create the
`pixar_video_jobs` row (status `pending`) keyed by that `job_id` — the frontend
no longer pre-inserts it. You then render and deliver via the callback, which
updates the same row.

Each scene sends its **full ordered frame list** in `frame_urls` so the clip
animates the whole performance arc, not a single image. `keyframe_url` (the one
the user anchored on) is kept for back-compat — if `frame_urls` is omitted the
scene falls back to that single keyframe (original behavior). Optional top-level
`motion_mode` selects how frames become motion:
- `"interpolate"` (default) — frame interpolation between the keyframes.
- `"kling-chain"` — generative start→end motion per consecutive pair (higher
  fidelity, more cost, longer scenes).

**Request (we → you)**

```
POST {VITE_SERVER_URL}/api/pixar/video
Authorization: Bearer <user jwt>
Content-Type: application/json
```

```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque-string",
  "callback_url": "https://<proj>.supabase.co/functions/v1/pixar-image-callback",
  "type": "video",
  "style": "Pixar 3D animated",
  "product": "acme-glow",
  "product_label": "Acme Glow",
  "selected_avatar": { "url": "https://.../ref-2.png", "character_job_id": "uuid" },
  "scene_image_job_id": "uuid",            // optional lineage (stored on the job row)
  "character_job_id": "uuid",              // optional lineage (stored on the job row)
  "with_audio": true,                      // true → mix VO (from spoken_line) + music
  "music": null,                           // optional music-style hint, else you choose
  "motion_mode": "interpolate",            // optional: "interpolate" (default) | "kling-chain"
  "scenes": [
    {
      "scene_number": 1,
      "frame_urls": [                          // full ordered frames for this scene
        "https://.../s1-a.png",
        "https://.../s1-b.png",
        "https://.../s1-c.png"
      ],
      "keyframe_url": "https://.../s1-b.png",  // anchor / back-compat fallback
      "duration_s": 6,                          // target clip length (null = you decide)
      "spoken_line": "I used to dread mornings…" // VO text for this scene
    }
    // … one object per scene, in order
  ]
}
```

**Immediate response (you → us)**

```jsonc
{ "ok": true, "job_id": "uuid", "message": "video generation started" }
```

**Callback (you → us)** — send `in_progress` while rendering (optional), then a
final `completed` with the stitched video URL:

```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque-string",
  "type": "video",
  "status": "completed",                   // "in_progress" | "completed" | "failed"
  "final_video_url": "https://.../final-9x16.mp4"
}
```

> Return **one** `final_video_url` (hosted HTTPS, 9:16 mp4). It plays directly in
> the UI; Google Drive URLs are auto-proxied like the images.

---

## 5. Callback endpoint (our side — you POST here)

```
POST {SUPABASE_URL}/functions/v1/pixar-image-callback
Content-Type: application/json
```

Body = the callback objects shown in §3 / §4. Required fields on **every**
callback: `job_id`, `callback_token`, `type`, `status`.

**Our responses to your callback:**

| Code | Meaning |
|---|---|
| `200 {"ok":true}` | accepted, job row updated |
| `401` | `callback_token` mismatch |
| `404` | unknown `job_id` |
| `400` | malformed body |

`status` values we understand:

| status | meaning |
|---|---|
| `in_progress` | partial results attached; keep the spinner, render what's there |
| `completed` | final; we stop waiting |
| `failed` | attach `error` (string); we show the error and let the user retry |

---

## 6. Summary table

| # | Caller | Method + Path | Purpose |
|---|---|---|---|
| A | frontend → you | `POST {VITE_SERVER_URL}/api/pixar/character` | start 3 character refs |
| B | frontend → you | `POST {VITE_SERVER_URL}/api/pixar/scene-images` | start 4–5 imgs/scene |
| C | frontend → you | `POST {VITE_SERVER_URL}/api/pixar/video` | animate + stitch final mp4 |
| D | you → us | `POST <callback_url>` (= `{SUPABASE_URL}/functions/v1/pixar-image-callback`) | deliver results (all types) |

All three triggers carry `type` (`"character"`, `"scene_images"`, `"video"`) and
`callback_token`; echo both back in the callback.

## 7. Status — all confirmed

- ✅ Paths: `/api/pixar/character`, `/api/pixar/scene-images`, `/api/pixar/video`
- ✅ Base URL: `VITE_SERVER_URL` (frontend calls directly with the user JWT)
- ✅ Images + final video: hosted HTTPS URLs
- ✅ Scene callbacks: incremental, then final `completed`
- ✅ Video: one keyframe per scene in → one stitched 9:16 mp4 out, with VO + music

Remaining on our side: run the two migrations + deploy `pixar-image-callback`.
Then end-to-end test.
