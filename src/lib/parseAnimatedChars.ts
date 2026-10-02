// parseAnimatedChars.ts
//
// Self-contained parser for Format 04 — "Animated Characters - Ads" storyboards.
// Sibling of parsePixar.ts. A Format-04 message is a multi-character storyboard:
//
//   ===META===
//   chosen_framework: ...
//   main_pain: "..."
//   total_spoken_words: 83
//   estimated_seconds: 50
//   character_count: 5
//   script_plan:
//     - character_id: 1
//       role: ...
//       identifier: "..."
//       sets_up: "..."
//       transition_to_next: "..."
//   ===END_META===
//
//   storyboard:
//     - character_id: 1
//       character_concept: "..."   <- the character + its description
//       visual: "..."              <- the scene / setting (VIDEO-MOTION prompt)
//       first_frame_prompt: "..."  <- the STILL opening frame (seeds image gen)
//       spoken_line: "..."         <- the voice line for that character
//       duration_s: 6              <- per-beat clip length (≤15s)
//
// The skill defines no dedicated background-music or per-voice fields, so this
// parser DERIVES them at the rendering layer (no skill.md change): a Voice/Tone
// label per character from its `role`, plus a single sound-design note. The
// brand product is always the final character.

// ---------- Types ----------

export type AnimatedScriptPlanEntry = {
  characterId: number | null;
  role?: string;
  identifier?: string;
  setsUp?: string;
  transitionToNext?: string;
};

export type AnimatedCharacter = {
  characterId: number | null;
  role?: string;          // joined from script_plan (drives the Voice/Tone label)
  identifier?: string;    // joined from script_plan
  characterConcept: string; // the character + character description
  visual: string;           // the scene / setting description (VIDEO-MOTION prompt)
  firstFramePrompt: string;  // the STILL opening frame — seeds image generation
  spokenLine: string;       // the voice line
  durationS?: string;
  voiceTone: string;        // DERIVED from role (no skill field exists)
};

export type ParsedAnimatedCharsScript = {
  meta: {
    chosenFramework?: string;
    mainPain?: string;
    totalSpokenWords?: string;
    estimatedSeconds?: string;
    characterCount?: string;
  };
  scriptPlan: AnimatedScriptPlanEntry[];
  characters: AnimatedCharacter[];
  musicDirection: string; // DERIVED — the skill carries no music field
  preface: string;
};

// Derived sound/music direction. The skill is sound-on / voice-driven and
// defines no scored-music field, so we surface a sensible, fixed direction
// rather than inventing per-script music (which would be ungrounded).
export const ANIMATED_MUSIC_DIRECTION =
  "Sound-on, voice-driven. Each character speaks its own line in its own voice; this format specifies no scored music track. Optional: a light, whimsical Pixar-style underscore kept low under the voices, lifting on the brand reveal.";

// ---------- Helpers ----------

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (m) return m[1].trim();
  const m2 = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```\s*$/);
  if (m2) return m2[1].trim();
  return text;
}

function unquoteYaml(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if ((t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("“") && t.endsWith("”"))) {
    return t.slice(1, -1).trim();
  }
  if ((t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith("‘") && t.endsWith("’"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Group a block of YAML-ish lines into entries. A new entry starts at a list
 * dash whose first token is a `key:` pair (`- character_id: 1`); subsequent
 * indented `key: value` lines fill the current entry. Used for both the
 * `script_plan` array and the `storyboard` list.
 */
function parseDashEntries(lines: string[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const dash = raw.match(/^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (dash) {
      cur = {};
      out.push(cur);
      cur[dash[1].toLowerCase()] = unquoteYaml(dash[2]);
      continue;
    }
    if (!cur) continue;
    const kv = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (kv) cur[kv[1].toLowerCase()] = unquoteYaml(kv[2]);
  }
  return out;
}

/** Map a storyboard/plan character_id string to a number (or null). */
function toCharId(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive a Voice/Tone label from a character's role. The skill encodes voice
 * implicitly through each character's role + spoken-line tone (hero confident,
 * villain smug, failed-solution apologetic, brand collective), so this is a
 * faithful surfacing of that intent — not an invented field.
 */
export function deriveVoiceTone(role?: string): string {
  const r = (role || "").toLowerCase().replace(/[_\s]+/g, "-");
  if (!r) return "Characterful — distinct from the other voices";
  if (r.includes("failed")) return "Apologetic, deflated — admits it didn't work";
  if (r.includes("villain")) return "Smug, menacing — the antagonist gloating";
  if (r.includes("symptom")) return "Weary, uncomfortable — the lived pain personified";
  if (r === "brand" || r.includes("brand")) return "Warm, confident, authoritative — collective brand voice";
  if (r.includes("ingredient") || r.includes("hero")) return "Upbeat, capable — the helpful hero ingredient";
  return "Characterful — distinct from the other voices";
}

// ---------- Public API ----------

export function parseAnimatedCharsScript(text: string): ParsedAnimatedCharsScript | null {
  if (!text || typeof text !== "string") return null;
  let cleaned = text.replace(/^<!--VALIDATION_FAILED:[^>]*-->\s*\n?/, "");
  cleaned = cleaned.replace(/<script_skeleton>[\s\S]*?<\/script_skeleton>/gi, "");
  cleaned = stripCodeFence(cleaned).trim();

  // Split META block from the storyboard body.
  const metaMatch = cleaned.match(/===\s*META\s*===([\s\S]*?)===\s*END_META\s*===/i);
  const metaBlock = metaMatch ? metaMatch[1] : "";
  const body = metaMatch ? cleaned.slice(metaMatch.index! + metaMatch[0].length) : cleaned;

  // --- META: top-level keys (before script_plan:) ---
  const meta: ParsedAnimatedCharsScript["meta"] = {};
  const metaLines = metaBlock.split("\n");
  let planStart = -1;
  for (let i = 0; i < metaLines.length; i++) {
    const ln = metaLines[i];
    if (/^\s*script_plan\s*:/i.test(ln)) { planStart = i; break; }
    const kv = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = unquoteYaml(kv[2]);
    if (key === "chosen_framework") meta.chosenFramework = value;
    else if (key === "main_pain") meta.mainPain = value;
    else if (key === "total_spoken_words") meta.totalSpokenWords = value;
    else if (key === "estimated_seconds") meta.estimatedSeconds = value;
    else if (key === "character_count") meta.characterCount = value;
  }

  // --- META: script_plan array ---
  const scriptPlan: AnimatedScriptPlanEntry[] = [];
  if (planStart !== -1) {
    const planRaw = parseDashEntries(metaLines.slice(planStart + 1));
    for (const e of planRaw) {
      scriptPlan.push({
        characterId: toCharId(e.character_id),
        role: e.role,
        identifier: e.identifier,
        setsUp: e.sets_up,
        transitionToNext: e.transition_to_next,
      });
    }
  }

  // --- storyboard list ---
  const sbIdx = body.search(/^[ \t]*storyboard\s*:/m);
  const sbText = sbIdx >= 0 ? body.slice(sbIdx).replace(/^[ \t]*storyboard\s*:.*\n?/, "") : body;
  const sbRaw = parseDashEntries(sbText.split("\n"));

  // Lookup plan entry by character_id to source role/identifier (drives Voice/Tone).
  const planById = new Map<number, AnimatedScriptPlanEntry>();
  scriptPlan.forEach((p, i) => {
    if (p.characterId != null) planById.set(p.characterId, p);
    else planById.set(i + 1, p); // positional fallback when id missing
  });

  const characters: AnimatedCharacter[] = [];
  sbRaw.forEach((e, i) => {
    const id = toCharId(e.character_id) ?? (i + 1);
    // Only keep entries that carry real storyboard fields (skip stray dash rows).
    if (!e.character_concept && !e.visual && !e.spoken_line) return;
    const plan = (id != null && planById.get(id)) || undefined;
    const role = plan?.role;
    characters.push({
      characterId: toCharId(e.character_id),
      role,
      identifier: plan?.identifier,
      characterConcept: e.character_concept ?? "",
      visual: e.visual ?? "",
      firstFramePrompt: e.first_frame_prompt ?? "",
      spokenLine: e.spoken_line ?? "",
      durationS: e.duration_s,
      voiceTone: deriveVoiceTone(role),
    });
  });

  if (characters.length === 0) return null;

  return {
    meta,
    scriptPlan,
    characters,
    musicDirection: ANIMATED_MUSIC_DIRECTION,
    preface: "",
  };
}

/**
 * True when `text` looks like a Format-04 animated-characters storyboard: a
 * `storyboard:` list with `character_concept` entries. `character_concept:` is
 * unique to Format 04 — Pixar (03) uses scene_number / character_action and
 * never emits it — so the two formats don't collide. We deliberately do NOT
 * also require the `===META===` / `chosen_framework` markers: the chat bubble
 * renders a meta-stripped copy of the message, so requiring those made a clean
 * storyboard dump raw YAML in the bubble instead of routing to the side panel.
 * Callers should still test this BEFORE isPixarStoryboard to be safe.
 */
export function isAnimatedCharsStoryboard(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = stripCodeFence(text);
  const hasStoryboard = /^[ \t]*storyboard\s*:/m.test(t);
  const hasCharacterConcept = /character[_\s]?concept\s*:/i.test(t);
  return hasStoryboard && hasCharacterConcept;
}
