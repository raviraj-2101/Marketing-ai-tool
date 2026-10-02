# Image Builder — Requirements (Pixar "Build UGC" pipeline)

**Audience:** the Image Builder repo team.
**Goal:** implement 3 HTTP endpoints + 1 callback so the app's `/pixar-builder`
page can turn a storyboard into a finished 9:16 video.

The Image Builder is the backend at **`VITE_SERVER_URL`** (the app's `API_BASE`).
The app already calls it for other `/api/*` routes with the logged-in user's JWT.

---

## 1. Pipeline overview

```
Step 1  POST /api/pixar/character     → 3 character reference images
Step 2  POST /api/pixar/scene-images  → 4–5 images per scene
Step 3  POST /api/pixar/video         → 1 stitched 9:16 mp4 (VO + music)
```

Each call is **async + fire-and-forget**:
1. You receive the trigger, validate, return a `200` ack immediately.
2. You do the work in the background.
3. You **POST results to the `callback_url`** included in the trigger body
   (see §6). The app updates its UI live from that callback.

You never touch the app's database. You only (a) accept the trigger and (b) POST
to `callback_url`.

---

## 2. Common rules (all endpoints)

| Concern | Requirement |
|---|---|
| **Auth (incoming)** | Trigger requests carry `Authorization: Bearer <user-jwt>`. Validate it the same way your existing `/api/*` routes do. Reject unauthenticated with `401`. |
| **CORS** | The browser calls these directly. Allow the app origin (same config as your other `/api/*` routes). Handle `OPTIONS` preflight. |
| **Ack** | Respond `200 {"ok":true,"job_id":"…"}` within a few seconds. Do **not** hold the request open until rendering finishes. |
| **`callback_url`** | Read it from each request body; never hardcode. POST results there. |
| **`callback_token`** | Opaque per-job string in each request. Echo it back **unchanged** in every callback, or the app rejects it (`401`). |
| **`job_id`** | Unique per job. Echo it in callbacks. Use it as your idempotency key. |
| **Output hosting** | Return **public HTTPS URLs** for all images and the final video. Google Drive links are accepted (the app proxies them) but must be readable by the configured Google service account. A CDN/public bucket is preferred. |
| **Failure** | On any failure, POST a callback with `status:"failed"` and a human-readable `error` string. |
| **Timeouts/retries** | Renders can take minutes — that's fine (async). If a callback POST fails, retry with backoff (e.g. 3×). Reuse the same `job_id`. |

---

## 3. Endpoint A — `POST /api/pixar/character`

Generate **`variant_count` (3)** character reference images from the character
brief. These anchor the character's look across all later scenes — keep them
on-model and consistent with each other (same character, varied pose/framing).

**Request body**
```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque",
  "callback_url": "https://<proj>.supabase.co/functions/v1/pixar-image-callback",
  "variant_count": 3,
  "style": "Pixar 3D animated",
  "product": "ledisa-glp1-patches",
  "product_label": "GLP-1 Patches",
  "character": {
    "main_character": "Diane Kowalski, 54, …",
    "main_pain": "Visible: … · Hidden: …",
    "storyline_pattern": "peer-aspiration-handoff",
    "description": null
  }
}
```

**Callback** (when done)
```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque",
  "type": "character",
  "status": "completed",            // or "failed"
  "avatars": [
    { "url": "https://…/ref-1.png", "label": "Option 1" },
    { "url": "https://…/ref-2.png", "label": "Option 2" },
    { "url": "https://…/ref-3.png", "label": "Option 3" }
  ]
}
```

---

## 4. Endpoint B — `POST /api/pixar/scene-images`

For **each scene**, generate **4–5 images** that depict that scene, using the
**chosen character reference** for consistency. Suggested count rule: ~1 image
per 1.5–2s of `duration_s`, min 4, max 5 (you may override).

**Request body**
```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque",
  "callback_url": "https://…/functions/v1/pixar-image-callback",
  "style": "Pixar 3D animated",
  "product": "ledisa-glp1-patches",
  "product_label": "GLP-1 Patches",
  "selected_avatar": { "url": "https://…/ref-2.png", "character_job_id": "uuid" },
  "meta": {
    "main_character": "…",
    "main_pain": "…",
    "storyline_pattern": "…"
  },
  "scenes": [
    {
      "scene_number": 1,
      "duration_s": 6,                 // may be null
      "spoken_line": "…",
      "setting": "…",
      "expression": "…",
      "action": "…",
      "camera": "…",
      "audio_beat": "…",
      "bridge_beat": "…"               // may be null
    }
    // … one per scene
  ]
}
```

**Callback** — **incremental preferred**: POST one callback per finished scene
with `status:"in_progress"`, then a final `status:"completed"`. The app merges
by `scene_number` (re-sending a scene replaces its images).
```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque",
  "type": "scene_images",
  "status": "in_progress",            // … then "completed" on the last call
  "scenes": [
    { "scene_number": 1, "images": [ {"url":"https://…/s1-a.png"}, {"url":"…"}, {"url":"…"}, {"url":"…"} ] }
  ]
}
```

---

## 5. Endpoint C — `POST /api/pixar/video`

The user picked **one keyframe per scene**. For each scene: animate the keyframe
into a clip (image-to-video), generate **voiceover** from `spoken_line`, add a
**music bed**, then **stitch all clips into one 9:16 mp4**. Return one URL.

**Request body**
```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque",
  "callback_url": "https://…/functions/v1/pixar-image-callback",
  "type": "video",
  "style": "Pixar 3D animated",
  "product": "ledisa-glp1-patches",
  "product_label": "GLP-1 Patches",
  "selected_avatar": { "url": "https://…/ref-2.png", "character_job_id": "uuid" },
  "with_audio": true,                 // true → mix VO (from spoken_line) + music
  "music": null,                      // optional music-style hint
  "scenes": [
    { "scene_number": 1, "keyframe_url": "https://…/s1-b.png", "duration_s": 6, "spoken_line": "…" }
    // … one per scene, in order
  ]
}
```

**Callback**
```jsonc
{
  "job_id": "uuid",
  "callback_token": "opaque",
  "type": "video",
  "status": "completed",              // "in_progress" | "completed" | "failed"
  "final_video_url": "https://…/final-9x16.mp4"
}
```

Output: a single **9:16 H.264 mp4** with audio, hosted at a public HTTPS URL.

---

## 6. Callback endpoint (you POST here)

```
POST {callback_url}            // = {SUPABASE_URL}/functions/v1/pixar-image-callback
Content-Type: application/json
```

Required on every callback: `job_id`, `callback_token`, `type`, `status`.
`type` ∈ `"character" | "scene_images" | "video"`.
`status` ∈ `"in_progress" | "completed" | "failed"`.

Our responses:

| Code | Meaning |
|---|---|
| `200 {"ok":true}` | accepted |
| `400` | missing/invalid fields |
| `401` | `callback_token` mismatch |
| `404` | unknown `job_id` |

Self-test (should return `404` "Unknown job_id" for a bogus id, proving the
endpoint is reachable):
```bash
curl -s -X POST "{SUPABASE_URL}/functions/v1/pixar-image-callback" \
  -H "content-type: application/json" \
  -d '{"job_id":"00000000-0000-0000-0000-000000000000","callback_token":"x","type":"character","status":"completed","avatars":[]}'
```

---

## 7. AI capabilities required

| Step | Capability | Example tooling (your choice) |
|---|---|---|
| A | Stylized character image gen with cross-image consistency | Nano Banana / Gemini 2.5 Flash Image, Midjourney, Flux |
| B | Scene image gen conditioned on a character reference | image-to-image with the chosen ref |
| C | Image-to-video per shot | Veo 3, Kling 2.x, Runway Gen-4 |
| C | Voiceover (TTS) from `spoken_line` | ElevenLabs or equivalent |
| C | Music bed + final mux/stitch | music library + ffmpeg |

(Veo 3 can do native dialogue/audio, which can collapse the VO step — optional.)

---

## 8. Config / secrets you'll need (your side)

- API keys for the image model, the image-to-video model, and the TTS provider.
- Music source/library.
- Output hosting: a public bucket/CDN, **or** Google Drive (the app proxies
  Drive via a service account — ensure files are readable by it).
- The app sends `callback_url` per request, so you don't store our URL.

---

## 9. Acceptance criteria

- [ ] All three endpoints accept the bodies in §3–§5, validate the JWT, and ack `200` fast.
- [ ] Each posts results to `callback_url` echoing `job_id` + `callback_token` + correct `type`.
- [ ] `A` returns exactly `variant_count` consistent references.
- [ ] `B` returns 4–5 images per scene, incrementally, all on-model with the chosen reference.
- [ ] `C` returns one 9:16 mp4 with VO + music, scenes in order.
- [ ] All `url` / `final_video_url` values are public HTTPS and render in a browser `<img>`/`<video>`.
- [ ] Failures post `status:"failed"` with a clear `error`.
- [ ] The §6 self-test returns `404`.

---

## 10. What to send back to the app team

1. Confirm the three paths are live on `VITE_SERVER_URL`.
2. Confirm output format (hosted URL vs Drive) and that CORS allows the app origin.
3. A sample real callback body for each `type` (so we can confirm field names match).
