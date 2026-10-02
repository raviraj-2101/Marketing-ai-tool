// parseScripts.ts
//
// Parse an assistant message into a structured "doc" of one or more scripts.
// Direct port of NEW-UGC-Scripts/client/src/lib/parseScripts.ts

import type { ScriptSectionData, SectionVisualNotes } from "../components/ugc/ScriptSection";

// Format-08 (Classic UGC 4-18 min) ordered spoken segment. The body is
// HOOK → MODULE 1..N → REVEAL instead of P1/M1/M2/P2; each segment is one
// self-contained spoken beat (marker line excluded from `text`).
export type ScriptSegment = {
  key: "hook" | "module" | "reveal";
  /** "HOOK" | "MODULE <n>" | "REVEAL" */
  label: string;
  /** Optional same-line suffix after the marker token (e.g. the module's
   *  question title in `**MODULE 3 — Question three: …**`). */
  title?: string;
  /** Spoken prose for this segment — never includes the marker line. */
  text: string;
};

export type ParsedScript = {
  index: number;
  concept: string;
  angle: string;
  angleLabel: string;
  angleCode: string;
  description: string;
  body: string;
  // Optional spoken hook (ClickUp 86caz3tkg), split off the TOP of the body when
  // the writer was asked for one. "" for every hook-off script — `body` then
  // still holds exactly what it held before this field existed.
  hook?: string;
  p1: string;
  p2: string;
  // Format-05 (Classic UGC 1-4 min) middle beats. Empty string when the script
  // is a 60s Classic (no M1/M2 markers in the body). Set only when the parser
  // finds **M1** / **M2** marker blocks — same shape as P1/P2.
  m1: string;
  m2: string;
  // Format-08 (Classic UGC 4-18 min) ordered segments. Present only when the
  // body carries the full **HOOK** / **MODULE n** / **REVEAL** marker shape;
  // absent for every other format.
  segments?: ScriptSegment[];
  // Format-08 server-assigned style/archetype (e.g. "A-STAGES"), lifted from
  // the "Style: …" line under the 🎬 duration banner. Pinned per script so it
  // survives buildMergedDoc, which keeps only the first message's preface.
  style?: string;
  wordCount: number;
  avatarTypes: Array<"doctor" | "normal" | "natural_wellness" | "any">;
  suggestedPersona: string;
  suggestedSubAngle: string;
  inspiredByAdIds: string[];
};

export type ParsedDocMeta = {
  angleSummary: string;
  archetypes: string[];
  format: string;
  // Spoken-beat summary for the "Scripts" intro row, derived from the beats
  // that actually exist (e.g. "P1 → M1 → M2 → P2") instead of a hardcoded
  // "P1 hands-free → P2 holding bottle" tail.
  beats: string;
  wordCountRange: string;
  awarenessLevel: string;
};

export type ParsedDoc = {
  preface: string;
  scripts: ParsedScript[];
  byAngle: Array<{ angle: string; angleLabel: string; count: number; scripts: ParsedScript[] }>;
  meta: ParsedDocMeta;
};

/**
 * Describe the Classic-family format label + spoken beat set from the parsed
 * scripts, driven by which beats ACTUALLY exist. A 1-4 min (Format-05) script
 * that generated M1/M2 is no longer mislabeled with the static 60-second P1/P2
 * template. Falls back to the 60-second shape only when no middle beats are
 * present (true 60s Classic) or there are no scripts.
 */
export function describeClassicFormat(scripts: ParsedScript[]): { format: string; beats: string } {
  // Format-08 (Classic UGC 4-18 min): HOOK → MODULE 1..N → REVEAL segments.
  // Checked first — an 08 script never carries P1/M1/M2/P2 markers, and vice
  // versa, so this branch can't shadow the 05/00 shapes below.
  const segScripts = scripts.filter((s) => s.segments && s.segments.length > 0);
  if (segScripts.length > 0) {
    const maxModules = Math.max(
      ...segScripts.map((s) => (s.segments ?? []).filter((g) => g.key === "module").length),
    );
    const moduleBeat = maxModules > 1 ? `MODULE 1..${maxModules}` : "MODULE 1";
    return {
      format: "Classic UGC 4-18 min (hands-free HOOK · MODULES → REVEAL holding bottle)",
      beats: `HOOK → ${moduleBeat} → REVEAL`,
    };
  }
  const hasM1 = scripts.some((s) => s.m1);
  const hasM2 = scripts.some((s) => s.m2);
  if (hasM1 || hasM2) {
    const middle = [hasM1 ? "M1" : null, hasM2 ? "M2" : null].filter(Boolean).join(" · ");
    return {
      format: `Classic UGC 1-4 min (hands-free P1 · ${middle} → P2 holding bottle)`,
      beats: hasM2 ? "P1 → M1 → M2 → P2" : "P1 → M1 → P2",
    };
  }
  return {
    format: "60-second talking-head UGC (P1 hands-free · P2 holding bottle)",
    beats: "P1 hands-free → P2 holding bottle",
  };
}

const ANGLE_KEYWORDS: Array<{ slug: string; rx: RegExp }> = [
  { slug: "leg_ankle_swelling", rx: /\b(ankle|sock\s*indent|leg\s*swell|swollen\s+(?:ankle|leg|feet))/i },
  { slug: "brain_fog",          rx: /\b(brain[-_\s]?fog|foggy\s+head|mental\s+fog|cant\s+think\s+straight|can'?t\s+think\s+straight|head\s+(?:still\s+)?feels?\s+(?:underwater|cloudy|foggy|heavy)|that'?s\s+the\s+fog|morning\s+fog|the\s+fog\.)/i },
  { slug: "puffiness",          rx: /\b(puff(?:y|iness)|face\s+puff|morning\s+face|under[-\s]?eye)/i },
  { slug: "parasite_cleanse",   rx: /\b(parasit\w*|biofilm|carvacrol|worm|protozoa)/i },
  { slug: "weight_loss",        rx: /\b(weight[-\s]?loss|stuck\s+scale|scale\s+(?:barely|won'?t|wont)\s+(?:move|moves|budge)|cant\s+lose|can'?t\s+lose|fat\s+loss|calorie\s+deficit|fat\s+burner|glp[-\s]?1|jeans?\s+(?:button|won'?t|wont)\s+|mirror\s+and\s+the\s+scale)/i },
  { slug: "bloating",           rx: /\b(bloat\w*|belly\s+puff|stomach\s+balloon|afternoon\s+belly|gluten|gas\s+pain)/i },
];

function inferAngleFromBody(body: string): string {
  for (const { slug, rx } of ANGLE_KEYWORDS) {
    if (rx.test(body)) return slug;
  }
  return "";
}

function firstSentence(s: string, max = 80): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentenceMatch = cleaned.match(/^[^.!?\n]+[.!?]/);
  const candidate = sentenceMatch ? sentenceMatch[0].replace(/[.!?]$/, "") : cleaned;
  return candidate.length > max ? candidate.slice(0, max - 1).trim() + "…" : candidate;
}

// Comparison (Format 01a/01b) model output usually begins with a non-spoken
// META/HEADER line — e.g. "Script. Comparison Top 5 ToF. bloating_quick_relief.
// ~128w" (also em-dash / bold-wrapped variants) — and SOMETIMES appends a
// duplicate "Speaking script:" block at the end. Neither is spoken VO, so strip
// them before the prose becomes the side-panel card body.
function cleanComparisonBody(text: string): string {
  let out = stripHtmlComments(text);
  const lines = out.split(/\r?\n/);
  // Drop leading header/meta lines until we hit real spoken prose.
  while (lines.length) {
    const l = lines[0].trim();
    if (!l) { lines.shift(); continue; }
    const isHeader =
      /^[*_>\s]*(?:[A-Za-z]{2}\s*[—–-]\s*)?\*{0,2}\s*script\s*[.\-—:]/i.test(l) ||
      (/comparison\s+top\s*-?\s*5/i.test(l) && /(~?\s*\d+\s*w\b|\bto[fb]\b|funnel|_)/i.test(l));
    if (isHeader) { lines.shift(); continue; }
    break;
  }
  out = lines.join("\n");
  // Strip a trailing "Speaking script" / "Spoken script" duplicate block.
  out = out.replace(/(?:^|\n)\s*[*_>#\s]*\b(?:speaking|spoken)\s+script\b\s*:?[\s\S]*$/i, "");
  return out.trim();
}

// A clean, intentional title for a comparison card, derived from the header
// line we strip out of the body. Returns "" when the text isn't a Top-5
// comparison script (caller falls back to the first spoken sentence).
function comparisonLabel(text: string): string {
  if (!/comparison\s+top\s*-?\s*5/i.test(text)) return "";
  const lower = text.toLowerCase();
  if (/\bbof\b|bottom[\s-]?of[\s-]?funnel/.test(lower)) return "Comparison Top 5 · Bottom-of-funnel";
  if (/\btof\b|top[\s-]?of[\s-]?funnel/.test(lower)) return "Comparison Top 5 · Top-of-funnel";
  return "Comparison Top 5";
}

function splitByConcept(text: string): { preface: string; segments: { concept: string; body: string }[] } {
  const conceptRx = /^[ \t]*\*\*\s*Concept\s*:\s*([^\n*][^\n]*?)\s*\*\*[ \t]*$/gim;
  const matches: { idx: number; len: number; concept: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = conceptRx.exec(text)) !== null) {
    matches.push({ idx: m.index, len: m[0].length, concept: m[1].trim() });
  }
  if (matches.length === 0) return { preface: text.trim(), segments: [] };
  const preface = text.slice(0, matches[0].idx).trim();
  const segments: { concept: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx + matches[i].len;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const body = text.slice(start, end).trim();
    segments.push({ concept: matches[i].concept, body });
  }
  return { preface, segments };
}

function splitAngleAndDescription(concept: string): { angle: string; description: string } {
  const m = concept.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (m) return { angle: m[1].trim(), description: m[2].trim() };
  const trimmed = concept.trim();
  if (!trimmed) return { angle: "", description: "" };
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmed)) return { angle: trimmed, description: "" };
  return { angle: "", description: trimmed };
}

export function angleCode(angle: string): string {
  if (!angle) return "";
  const norm = angle
    .toLowerCase()
    .replace(/^angle[_\s-]+/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const RULES: { pattern: RegExp; code: string }[] = [
    { pattern: /\b(weight\s*loss|wl)\b/, code: "WL" },
    { pattern: /\b(bloating|bloat|belly\s+distension|distension|bl)\b/, code: "BL" },
    { pattern: /\b(swelling\s+ankles?|leg\s+ankle(?:s)?(?:\s+swelling)?|ankle(?:s)?(?:\s+swelling)?|sa)\b/, code: "SA" },
    { pattern: /\b(lymph(?:\s+general)?|lymph(?:atic)?|lm)\b/, code: "LM" },
    { pattern: /\b(kidney(?:\s+damage)?|kd)\b/, code: "KD" },
    { pattern: /\b(blood\s+pressure|hypertension|bp)\b/, code: "BP" },
    { pattern: /\b(cravings?|cr)\b/, code: "CR" },
    { pattern: /\b(parasites?(?:\s+general)?|parasit\w*|pr)\b/, code: "PR" },
    { pattern: /\b(puffiness|puffy(?:\s+face)?|pf)\b/, code: "PF" },
    { pattern: /\b(brain\s+fog|fog|bf)\b/, code: "BF" },
  ];
  for (const r of RULES) {
    if (r.pattern.test(norm)) return r.code;
  }
  return "";
}

export function prettyAngle(angle: string): string {
  if (!angle) return "Other";
  const cleaned = angle.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Other";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function angleHeadingPrefix(angle: string): string {
  const code = angleCode(angle);
  if (code) return code;
  return prettyAngle(angle);
}

function extractP1P2(body: string): { p1: string; p2: string; m1: string; m2: string } {
  // Stop tokens. P1 ends at the next marker (P2 or M1) OR a Concept/Meta/diff
  // separator. M1 ends at M2 / P2. M2 ends at P2. P2 ends at Concept/Meta etc.
  const STOP_P1 = /\n\s*\*\*M1\*\*|\n\s*\*\*P2\*\*|\n\s*\*\*\s*Concept\s*:|\n\s*\*\*\s*Meta\s*\*\*|\n\s*Meta\b|\n\s*\(P1?\s*:\s*\d|\n\s*-{3,}\s*\n|$/i;
  const STOP_M1 = /\n\s*\*\*M2\*\*|\n\s*\*\*P2\*\*|\n\s*\*\*\s*Concept\s*:|\n\s*\*\*\s*Meta\s*\*\*|\n\s*Meta\b|\n\s*-{3,}\s*\n|$/i;
  const STOP_M2 = /\n\s*\*\*P2\*\*|\n\s*\*\*\s*Concept\s*:|\n\s*\*\*\s*Meta\s*\*\*|\n\s*Meta\b|\n\s*-{3,}\s*\n|$/i;
  const STOP_P2 = /\n\s*\*\*\s*Concept\s*:|\n\s*\*\*\s*Meta\s*\*\*|\n\s*Meta\b|\n\s*\(P1?\s*:\s*\d|\n\s*-{3,}\s*\n|$/i;
  const p1Match = body.match(new RegExp(`\\*\\*P1\\*\\*\\s*\\n+([\\s\\S]*?)(?=${STOP_P1.source})`, "i"));
  const m1Match = body.match(new RegExp(`\\*\\*M1\\*\\*\\s*\\n+([\\s\\S]*?)(?=${STOP_M1.source})`, "i"));
  const m2Match = body.match(new RegExp(`\\*\\*M2\\*\\*\\s*\\n+([\\s\\S]*?)(?=${STOP_M2.source})`, "i"));
  const p2Match = body.match(new RegExp(`\\*\\*P2\\*\\*\\s*\\n+([\\s\\S]*?)(?=${STOP_P2.source})`, "i"));
  const clean = (s: string) =>
    s
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\n\s*\(P1?\s*:\s*\d[\s\S]*$/i, "")
      .replace(/\n\s*-{3,}\s*$/m, "")
      .replace(/\n\s*\*\*\s*Meta\s*\*\*[\s\S]*$/i, "")
      .replace(/\n\s*Meta\b[\s\S]*$/i, "")
      .trim();
  return {
    p1: p1Match ? clean(p1Match[1]) : "",
    p2: p2Match ? clean(p2Match[1]) : "",
    m1: m1Match ? clean(m1Match[1]) : "",
    m2: m2Match ? clean(m2Match[1]) : "",
  };
}

/**
 * Format-08 (Classic UGC 4-18 min) segment parser. The body is
 * `**HOOK**` → `**MODULE 1**`…`**MODULE N**` → `**REVEAL**`, each marker on
 * its own line. A marker MAY carry a suffix on the same line BEFORE the
 * closing `**` (e.g. `**MODULE 3 — Question three: my numbers dropped…**`),
 * so the regex must NOT require the closing `**` straight after the token —
 * a bare-token regex like `\*\*MODULE \d+\*\*` would miss suffixed markers.
 * Returns [] unless the full HOOK + ≥1 MODULE + REVEAL shape is present, so
 * other formats (and partial streams) fall through untouched.
 */
export function extractHookModulesReveal(body: string): ScriptSegment[] {
  if (!body || typeof body !== "string") return [];
  // Line-anchored marker: `**HOOK**` / `**MODULE n[ — suffix]**` / `**REVEAL**`.
  // Group 1 = token, group 2 = module ordinal, group 3 = same-line suffix.
  // The separator class includes `.` because the server runs stripEmDashes on
  // the spoken body BEFORE storing, rewriting " — " to ". " — so a marker the
  // model wrote as `**MODULE 3 — Question three…**` is STORED as
  // `**MODULE 3. Question three…**` and must still match here.
  const markerRx =
    /^[ \t]*\*\*\s*(HOOK|REVEAL|MODULE\s+(\d+))(?:\s*[—–.:-]+\s*([^\n]*?))?\s*\*\*[ \t]*$/gim;
  const hits: Array<{ end: number; idx: number; token: string; n?: number; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRx.exec(body)) !== null) {
    hits.push({
      idx: m.index,
      end: m.index + m[0].length,
      token: m[1].toUpperCase().replace(/\s+/g, " "),
      n: m[2] ? parseInt(m[2], 10) : undefined,
      title: (m[3] || "").trim(),
    });
  }
  if (hits.length < 3) return [];
  // Strip trailing Meta / Concept / separator blocks + markdown emphasis from
  // a segment's prose — same stop set extractP1P2's clean() uses.
  const clean = (s: string) =>
    s
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/===META===[\s\S]*$/i, "")
      .replace(/\n\s*\*\*\s*Concept\s*:[\s\S]*$/i, "")
      .replace(/\n\s*\*\*\s*Meta\s*\*\*[\s\S]*$/i, "")
      .replace(/\n\s*Meta\b[\s\S]*$/i, "")
      .replace(/\n\s*-{3,}\s*$/m, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .trim();
  const out: ScriptSegment[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const sliceEnd = i + 1 < hits.length ? hits[i + 1].idx : body.length;
    const text = clean(body.slice(h.end, sliceEnd));
    if (!text) continue;
    const key: ScriptSegment["key"] =
      h.token === "HOOK" ? "hook" : h.token === "REVEAL" ? "reveal" : "module";
    const label =
      key === "module"
        ? `MODULE ${h.n ?? out.filter((x) => x.key === "module").length + 1}`
        : h.token;
    out.push({ key, label, title: h.title || undefined, text });
  }
  const hasShape =
    out.some((s) => s.key === "hook") &&
    out.some((s) => s.key === "module") &&
    out.some((s) => s.key === "reveal");
  return hasShape ? out : [];
}

/**
 * Optional "With hook" block (ClickUp 86caz3tkg). When the writer was asked for
 * a hook it emits a line-anchored `**HOOK**` … `**END HOOK**` block ABOVE the
 * normal script. Split it off the body so:
 *   • the hook renders as its own block in the script panel, and
 *   • the body handed to DocsPanel / the ad builder does NOT still contain it
 *     (DocsPanel.scriptToPlain falls back to `body` when there are no P1/P2
 *     markers — the 06/07 case — so leaving it in would make the avatar narrate
 *     the hook twice).
 * The closing `**END HOOK**` terminator is REQUIRED, which is what keeps
 * format-08 (whose structural `**HOOK**` marker has no terminator) untouched.
 * Returns the original body unchanged when no complete block is present.
 */
export function extractLeadingHook(body: string): { hook: string; body: string } {
  if (!body || typeof body !== "string") return { hook: "", body: body || "" };
  const rx = /^[ \t]*\*\*\s*HOOK\s*\*\*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\*\*\s*END\s+HOOK\s*\*\*[ \t]*$/im;
  const m = body.match(rx);
  if (!m) return { hook: "", body };
  const hook = m[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
  const stripped = body.replace(rx, "").replace(/^\s*\n/, "").trimStart();
  return { hook, body: stripped };
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function splitByP1Fallback(text: string): { preface: string; segments: { concept: string; body: string }[] } {
  const matches: { idx: number; len: number }[] = [];
  const p1Rx = /^[ \t]*\*\*\s*P1\s*\*\*[ \t]*$/gim;
  let m: RegExpExecArray | null;
  while ((m = p1Rx.exec(text)) !== null) {
    matches.push({ idx: m.index, len: m[0].length });
  }
  if (matches.length === 0) return { preface: text.trim(), segments: [] };
  const preface = text.slice(0, matches[0].idx).trim();
  const segments: { concept: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const body = text.slice(start, end).trim();
    const inferredAngle = inferAngleFromBody(body);
    const { p1: p1Probe } = extractP1P2(body);
    const desc = firstSentence(p1Probe);
    const concept =
      inferredAngle && desc
        ? `${inferredAngle} – ${desc}`
        : inferredAngle
          ? inferredAngle
          : desc || "";
    segments.push({ concept, body });
  }
  return { preface, segments };
}

export function parseAvatarTypes(body: string): Array<"doctor" | "normal" | "natural_wellness" | "any"> {
  if (!body) return [];
  const m = body.match(/<!--\s*avatar_types\s*:\s*([^>-]+?)\s*-->/i);
  if (!m) return [];
  const allowed = new Set(["doctor", "normal", "natural_wellness", "any"]);
  return m[1]
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => allowed.has(s))
    .map((s) => s as "doctor" | "normal" | "natural_wellness" | "any");
}

export function parseInspoAdIds(body: string): string[] {
  if (!body) return [];
  const m = body.match(/<!--\s*inspo_ad_ids\s*:\s*([\s\S]*?)\s*-->/i);
  if (!m) return [];
  return m[1]
    .split(/[,\s]+/)
    .map((s) => s.replace(/\D/g, "").slice(0, 6))
    .filter((s) => s.length > 0)
    .slice(0, 8);
}

export function parseHiddenLabel(body: string, key: string): string {
  if (!body) return "";
  const re = new RegExp("<!--\\s*" + key + "\\s*:\\s*([\\s\\S]*?)\\s*-->", "i");
  const m = body.match(re);
  if (!m) return "";
  const v = m[1].trim();
  if (!v || /^none$/i.test(v) || /^any$/i.test(v) || /^n\/?a$/i.test(v)) return "";
  return v;
}

/**
 * Strip ALL HTML comments AND the `===META=== ... ===END_META===` block from
 * text. Use this at the render layer AFTER parsers have extracted any metadata
 * they need (avatar_types, persona, sub_angle, inspo_ad_ids) from comments.
 * Variant comment spellings can leak through react-markdown, so this regex-
 * strips every comment + meta block so the user never sees them in the chat
 * bubble OR the DocsPanel. Also collapses 3+ blank lines a stripped block can
 * leave behind.
 */
export function stripHtmlComments(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    // 1) Legacy `<!--...-->` HTML-comment marker convention.
    .replace(/<!--[\s\S]*?-->/g, "")
    // 2) New text-marker convention (`===META=== ... ===END_META===`).
    .replace(/===META===[\s\S]*?===END_META===\s*/gi, "")
    // Collapse 3+ blank lines down to two so stripped markers don't leave
    // gaping holes in the rendered prose.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripMetaForClient(input: string): string {
  if (!input || typeof input !== "string") return input;
  let out = input;
  out = out.replace(/^<!--VALIDATION_FAILED:[^>]*-->\s*\n?/, "");
  out = out.replace(/<!--ADS_RESULTS:[A-Za-z0-9+/=]*-->\s*/g, "");
  out = out.replace(
    /^[ \t]*(?:>[^\n]*(?:\n|$))+\s*/,
    (match) => {
      const looksLikeMimicry =
        /heads\s*up\b/i.test(match) ||
        /didn'?t\s+pass\s+validation/i.test(match) ||
        /withholding/i.test(match) ||
        /reply\s+["']?redo["']?/i.test(match) ||
        /only\s+delivered/i.test(match) ||
        /full\s+batch/i.test(match);
      return looksLikeMimicry ? "" : match;
    },
  );
  out = out.replace(/<script_skeleton>[\s\S]*?<\/script_skeleton>/gi, "");
  // Convert the skill-skeleton `**Script — <archetype> — <angle> — ~Nw**` heading
  // into a `**Concept: <angle>**` heading. skill.md says concept_name becomes the
  // visible title; the server strips the <script_skeleton> (which holds it), so we
  // recover the <angle> field (the snake_case slug just before the ~Nw token) here.
  // Without this the raw "Script — A4 — parasite_cleanse_protocol —" line leaked
  // into the title. Applies to Classic 60s + Classic 1-4 min.
  out = out.replace(/\*\*\s*Script\b[^\n]*?([a-z][a-z0-9_]+)[^\na-z0-9_]+~\d+w[^\n]*?\*\*/gi, "**Concept: $1**");
  // Strip the `===META=== ... ===END_META===` block (text-marker convention
  // introduced by `skills-vocab-and-length-polish`, 2026-05-26). Case-
  // insensitive + non-greedy so a single block — and any trailing whitespace —
  // is removed before the chat bubble or side panel ever sees it.
  out = out.replace(/===META===[\s\S]*?===END_META===\s*/gi, "");
  out = out.replace(/\*\*Meta\*\*[ \t]*\n(?:[ \t]*-[^\n]*(?:\n|$))+/gi, "");
  out = out.replace(/^[ \t]*Meta[ \t]*\n(?:[ \t]*-[^\n]*(?:\n|$))+/gim, "");
  // Format-05 (Classic UGC 1-4 min) emits `===META=== ... ===END_META===`
  // text markers (the 2026-05-26 replacement for the legacy `**Meta**` block —
  // HTML comments leak through some markdown parsers). Strip them so the
  // viewer only sees the spoken body + banner.
  out = out.replace(/===META===[\s\S]*?===END_META===\s*/g, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/* ========================================================================
 * Format detection (simplified for this repo).
 *
 * This repo only renders Classic (Format 00, P1/P2) and Comparison
 * (Format 01a/01b "Top-5") scripts. The reference repo's detectFormat also
 * distinguishes Format 02/03/04, but those parsers/components aren't present
 * here, so detectFormat is simplified to only distinguish "01" vs "00":
 * return "01" when the message contains an `{{image-card: ...}}` marker,
 * otherwise "00".
 * ====================================================================== */

export type DetectedFormat = "00" | "01" | "02" | "03" | "04";

export const IMAGE_CARD_RX = /\{\{\s*image-card\s*:/i;

export function detectFormat(text: string): DetectedFormat {
  if (!text || typeof text !== "string") return "00";
  if (IMAGE_CARD_RX.test(text)) return "01";
  // Format 02a/02b ("unique-intro"): a 3-section layout introduced by literal
  // headings. Require ≥2 of the 3 canonical headings so a stray "Product
  // Reveal" line in a Classic script can't trip the detector. (Formats 03/04
  // from the reference project aren't ported here.)
  const f2 = findFormat2Headings(text);
  const distinctF2 = new Set(f2.map((h) => h.heading.replace(/-/g, " ").toLowerCase())).size;
  if (distinctF2 >= 2) return "02";
  return "00";
}

/* ========================================================================
 * Format 01 helper — split a body into a sequence of plain-text parts and
 * inline image-card badge markers. Use this in the renderer when rendering
 * Format 01 — pipe each "text" part through react-markdown and render each
 * "image-card" / "image-card-end" as the <ImageCardBadge /> component.
 * ====================================================================== */

export type ImageCardSplitPart =
  | { type: "text"; value: string }
  | { type: "image-card"; variant: string }
  | { type: "image-card-end" };

/**
 * Trigger-phrase regex set for Format 01 (comparison Top-5). When ANY of
 * these sentences are present in the script, the image-card badge should
 * pop INLINE at the START of that sentence.
 */
const TRIGGER_PHRASE_PATTERNS: RegExp[] = [
  /\bI\s+ranked\s+the\s+top\s+\d+/i,
  /\bI\s+tested\s+the\s+top\s+\d+/i,
  /\bI\s+published\b[^.!?\n]*\btop\s+\d+/i,
  /\bI\s+dropped\b[^.!?\n]*\btop\s+\d+/i,
  /\btop\s+\d+\b[^.!?\n]*\b(?:tested|results|blog|ranking|breakdown)/i,
  // Any sentence containing "top 5"/"top 3" anywhere — catch-all.
  /\btop\s+(?:3|5)\b/i,
];

/** Find the start AND end index of the trigger sentence in `text`, OR
 *  null if no trigger sentence is present. The `start` is the first
 *  non-whitespace character of the sentence (where the START badge
 *  inserts). The `end` is the index AFTER the sentence's closing
 *  punctuation (where the END badge inserts). */
function findTriggerSentenceRange(
  text: string,
): { start: number; end: number } | null {
  if (!text) return null;
  const sentenceRx = /[^.!?\n]+[.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = sentenceRx.exec(text)) !== null) {
    const sentence = m[0];
    if (!sentence.trim()) continue;
    for (const rx of TRIGGER_PHRASE_PATTERNS) {
      if (rx.test(sentence)) {
        const leadingWs = sentence.length - sentence.trimStart().length;
        return {
          start: m.index + leadingWs,
          end: m.index + sentence.length,
        };
      }
    }
  }
  return null;
}

/**
 * Split text into a sequence of parts: plain text + image-card badges.
 * Honors the LLM's SOURCE positions for both markers. Replace each
 * `{{image-card: <variant>}}` / `{{image-card-end}}` token with a sentinel,
 * then split on sentinels. This preserves the marker's relative position to
 * the surrounding prose exactly.
 */
export function splitOnImageCard(text: string): ImageCardSplitPart[] {
  if (!text) return [{ type: "text", value: "" }];

  // 1. Capture variant from first start marker; default to "top-5".
  const startScanRx = /\{\{\s*image-card\s*:\s*([\w-]+)\s*\}\}/i;
  const variantMatch = text.match(startScanRx);
  const variant = variantMatch ? variantMatch[1] : "top-5";

  // 2. Replace both marker shapes with unique sentinel tokens. Order matters:
  //    handle the END shape first because its body is a substring of the
  //    START shape's body pattern (image-card vs image-card-end). Swallow a
  //    leading newline + trailing whitespace + trailing newline around each
  //    marker so on-own-line markers don't leave blank-line scars.
  const START_SENTINEL = "IMG_CARD_START";
  const END_SENTINEL = "IMG_CARD_END";
  const cleaned = text
    .replace(
      /(?:\n)?[ \t]*\{\{\s*image-card-end\s*\}\}[ \t]*(?:\n)?/gi,
      END_SENTINEL,
    )
    .replace(
      /(?:\n)?[ \t]*\{\{\s*image-card\s*:\s*[\w-]+\s*\}\}[ \t]*(?:\n)?/gi,
      START_SENTINEL,
    );

  // 3. No markers in source? Return text as a single part.
  if (!cleaned.includes(START_SENTINEL) && !cleaned.includes(END_SENTINEL)) {
    return [{ type: "text", value: cleaned }];
  }

  // 4. Walk the cleaned text, splitting on sentinel tokens. Each sentinel
  //    becomes a badge part; everything between sentinels is a text part.
  const out: ImageCardSplitPart[] = [];
  const sentinelRx = new RegExp(`(${START_SENTINEL}|${END_SENTINEL})`, "g");
  const segments = cleaned.split(sentinelRx);
  for (const seg of segments) {
    if (seg === START_SENTINEL) {
      out.push({ type: "image-card", variant });
    } else if (seg === END_SENTINEL) {
      out.push({ type: "image-card-end" });
    } else if (seg.length > 0) {
      out.push({ type: "text", value: seg });
    }
  }
  return out;
}

export function parseScriptDoc(text: string): ParsedDoc {
  if (!text || typeof text !== "string") {
    return {
      preface: "",
      scripts: [],
      byAngle: [],
      meta: {
        angleSummary: "",
        archetypes: [],
        format: "60-second talking-head UGC (P1 hands-free · P2 holding bottle)",
        beats: "P1 hands-free → P2 holding bottle",
        wordCountRange: "",
        // Awareness level isn't carried in the client-visible output, so leave
        // it blank rather than asserting a hardcoded "Problem-aware".
        awarenessLevel: "",
      },
    };
  }
  text = stripMetaForClient(text);
  let { preface, segments } = splitByConcept(text);
  if (segments.length === 0) {
    const p1Result = splitByP1Fallback(text);
    if (p1Result.segments.length > 0) {
      preface = p1Result.preface;
      segments = p1Result.segments;
    }
  }
  // Format-08: the server appends "Style: A-NQ[, A-STAGES…]" under the 🎬
  // banner — one entry per script, in delivery order. Lift it out of the
  // preface (the per-card chip replaces it; the merged-doc banner would
  // otherwise claim the first turn's style for every script) and keep the
  // codes to pin onto each script below. Matches archetype codes only, so a
  // prose "Style:" line is never stolen.
  const styleLineRx = /^\s*Style:\s*(A-[A-Z0-9]+(?:\s*,\s*A-[A-Z0-9]+)*)\s*$/im;
  let styles08: string[] = [];
  const styleMatch = preface.match(styleLineRx);
  if (styleMatch) {
    styles08 = styleMatch[1].toUpperCase().split(/\s*,\s*/).filter(Boolean);
    preface = preface.replace(styleLineRx, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  const scripts: ParsedScript[] = segments.map((s, i) => {
    const { angle, description } = splitAngleAndDescription(s.concept);
    // Optional "With hook" block, split off the TOP of the body before anything
    // else measures or renders it. No block => hookText "" and sBody === s.body,
    // i.e. every hook-off script parses exactly as it does today.
    const { hook: hookText, body: sBody } = extractLeadingHook(s.body);
    const { p1, p2, m1, m2 } = extractP1P2(sBody);
    // Format-08 (Classic UGC 4-18 min): HOOK / MODULE n / REVEAL segments.
    // Empty for every other format (extractHookModulesReveal requires the
    // full marker shape before it returns anything).
    const hmrSegments = extractHookModulesReveal(sBody);
    return {
      index: i,
      concept: s.concept,
      angle,
      angleLabel: prettyAngle(angle),
      angleCode: angleCode(angle),
      description,
      body: sBody,
      hook: hookText,
      p1,
      p2,
      m1,
      m2,
      segments: hmrSegments.length > 0 ? hmrSegments : undefined,
      // One style per script; a single-entry list covers every script of the
      // turn (the server pinned the whole turn to one archetype).
      style: styles08.length > 0 ? styles08[i] ?? styles08[styles08.length - 1] : undefined,
      // Word-count covers the whole spoken body, including M1/M2 when present.
      // For format-08 it sums the segment texts only — marker/title lines
      // never count as spoken words.
      wordCount:
        hmrSegments.length > 0
          ? hmrSegments.reduce((n, sg) => n + countWords(sg.text), 0)
          : countWords(`${p1} ${m1} ${m2} ${p2}`),
      avatarTypes: parseAvatarTypes(s.body),
      suggestedPersona: parseHiddenLabel(s.body, "persona"),
      suggestedSubAngle: parseHiddenLabel(s.body, "sub_angle"),
      inspiredByAdIds: parseInspoAdIds(s.body),
    };
  });
  // Comparison (Format 01a/01b "Top-5") fallback: when the model emitted
  // neither `**Concept: ...**` nor `**P1**` anchors but the (meta-stripped)
  // text DOES contain an `{{image-card: ...}}` marker, the message is a
  // single comparison prose block. Synthesize one ParsedScript so the chat
  // bubble shows "Scripts are ready in the side panel." and the DocsPanel
  // renders a proper card — same as Classic.
  if (scripts.length === 0 && IMAGE_CARD_RX.test(text)) {
    const compBody = cleanComparisonBody(text);
    const angle = inferAngleFromBody(compBody);
    // Title: a clean "Comparison Top 5 · ToF/BoF" label from the (stripped)
    // header when present, else the first real spoken sentence — never the raw
    // meta/header line.
    const label = comparisonLabel(text) || firstSentence(compBody);
    scripts.push({
      index: 0,
      concept: label || prettyAngle(angle),
      angle,
      angleLabel: prettyAngle(angle),
      angleCode: angleCode(angle),
      description: label,
      body: compBody,
      p1: "",
      p2: "",
      wordCount: countWords(compBody),
      avatarTypes: parseAvatarTypes(text),
      suggestedPersona: parseHiddenLabel(text, "persona"),
      suggestedSubAngle: parseHiddenLabel(text, "sub_angle"),
      inspiredByAdIds: parseInspoAdIds(text),
    });
    // The whole text became the script body; clear the preface so the panel
    // doesn't also render the same prose as a loose preface block.
    preface = "";
  }
  const byAngleMap = new Map<string, { angle: string; angleLabel: string; scripts: ParsedScript[] }>();
  for (const sc of scripts) {
    const key = sc.angle || "other";
    if (!byAngleMap.has(key)) {
      byAngleMap.set(key, { angle: sc.angle, angleLabel: sc.angleLabel, scripts: [] });
    }
    byAngleMap.get(key)!.scripts.push(sc);
  }
  const byAngle = Array.from(byAngleMap.values()).map((g) => ({
    angle: g.angle,
    angleLabel: g.angleLabel,
    count: g.scripts.length,
    scripts: g.scripts,
  }));
  const angleSummary = byAngle.map((g) => g.angleLabel).join(" · ");
  const archetypeSet = new Set<string>();
  for (const sc of scripts) {
    const m = sc.concept.match(/\bA[1-9]\b/);
    if (m) archetypeSet.add(m[0]);
  }
  const archetypes = Array.from(archetypeSet);
  const wcs = scripts.map((s) => s.wordCount).filter((w) => w > 0);
  let wordCountRange = "";
  if (wcs.length > 0) {
    const min = Math.min(...wcs);
    const max = Math.max(...wcs);
    wordCountRange = min === max ? `${min} words` : `${min}–${max} words`;
  }
  const { format, beats } = describeClassicFormat(scripts);
  const meta: ParsedDocMeta = {
    angleSummary,
    archetypes,
    format,
    beats,
    wordCountRange,
    // Awareness level isn't carried in the client-visible output, so leave it
    // blank rather than asserting a hardcoded "Problem-aware".
    awarenessLevel: "",
  };
  return { preface, scripts, byAngle, meta };
}

export function buildDocSummary(doc: ParsedDoc): string {
  const total = doc.scripts.length;
  if (total === 0) return "";
  if (doc.byAngle.length === 1) {
    const g = doc.byAngle[0];
    const noun = total === 1 ? "script" : "scripts";
    return `${total} ${noun} in ${g.angleLabel}`;
  }
  const parts = doc.byAngle.map((g) => `${g.count} in ${g.angleLabel}`);
  return `${parts.join(" · ")} · ${total} total`;
}

/** Check if a message content has a validation-failed marker */
export function hasValidationFailed(content: string): boolean {
  return /^<!--VALIDATION_FAILED:[^>]*-->/.test(content || "");
}

/* ========================================================================
 * Format 02a / 02b — unique-intro parser
 *
 * Output schema (per skill-library spec):
 *   The model emits three sections introduced by literal headings:
 *
 *     **Advanced Intro**
 *     <markdown body — ≤15w spoken>
 *     <optional **Visual:** sub-block with one or more `- label: value` rows>
 *
 *     **No-Product Body**
 *     <markdown body>
 *     <optional **Visual:** sub-block>
 *
 *     **Product Reveal**
 *     <markdown body>
 *     <optional **Visual:** sub-block>
 *
 * The parser is intentionally lenient — it accepts:
 *   - `**Advanced Intro**`, `## Advanced Intro`, or `Advanced Intro:` headings.
 *   - `**Visual:**` / `Visual notes:` / `Visual:` sub-headings.
 *   - Per-row labels in any of these flavors:
 *       - "Scenery: ..." / "**Scenery:** ..."
 *       - "Action: ..." / "Body part: ..." / "Continuity: ..."
 * Returns null if the 3-section shape can't be recovered (caller falls back
 * to plain Format-00 rendering).
 * ====================================================================== */

export type ParsedFormat2Script = {
  sections: ScriptSectionData[];
  /** Preface / anything before the first section heading. */
  preface: string;
};

const FORMAT_2_HEADINGS = [
  "Advanced Intro",
  "No-Product Body",
  "No Product Body",
  "Product Reveal",
] as const;

/** Match `**Heading**` or `## Heading` or `Heading:` on its own line. */
function buildHeadingRegex(heading: string): RegExp {
  // Escape regex specials in the heading.
  const esc = heading.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(
    `^[ \\t]*(?:\\*\\*\\s*${esc}\\s*\\*\\*|##+\\s*${esc}|${esc}\\s*:)[ \\t]*$`,
    "im",
  );
}

/** Find all the recognized Format-2 section headings + their positions in
 *  the text. Returns them in document order. */
function findFormat2Headings(text: string): Array<{ idx: number; len: number; heading: string }> {
  const out: Array<{ idx: number; len: number; heading: string }> = [];
  for (const h of FORMAT_2_HEADINGS) {
    const rx = buildHeadingRegex(h);
    const m = rx.exec(text);
    if (m) {
      out.push({ idx: m.index, len: m[0].length, heading: h });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

/** Extract visual-note key/value pairs out of a section body. Returns
 *  the cleaned-up spoken-script body (with the visual block removed) +
 *  the parsed notes. Visual block is anything starting with a heading
 *  like "**Visual:**", "Visual notes:", "Visual:", or "### Visual"
 *  (markdown H3 — common drift in production) — usually followed by
 *  `- key: value` rows. */
function extractVisualNotes(body: string): { body: string; visual: SectionVisualNotes } {
  // Accept four heading shapes:
  //   - **Visual:** / **Visual notes:** (bolded)
  //   - Visual: / Visual notes: (colon-suffixed)
  //   - ### Visual / ## Visual (markdown H2/H3) — this is the shape the
  //     production LLM has been emitting in the wild; the older parser
  //     missed it entirely and dumped the bullets into the spoken pane.
  const visualHeadingRx =
    /^[ \t]*(?:\*\*\s*(?:Visual(?:\s+notes?)?)\s*:?\s*\*\*|##+\s*(?:Visual(?:\s+notes?)?)\s*:?|(?:Visual(?:\s+notes?)?)\s*:)[ \t]*$/im;
  const m = body.match(visualHeadingRx);
  if (!m || m.index === undefined) {
    return { body: body.trim(), visual: {} };
  }
  const spoken = body.slice(0, m.index).trim();
  const visualBlock = body.slice(m.index + m[0].length).trim();
  // Parse key:value rows. Accept either "- key: value" or "key: value" or
  // "**key:** value" — keys are case-insensitive and normalized below.
  const visual: SectionVisualNotes = {};
  const lines = visualBlock.split(/\n+/);
  for (const raw of lines) {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    // Strip surrounding **bold** if present on the whole line. Two flavors:
    //   - "**Scenery:** value" — bold wraps key+colon
    //   - "**Scenery**: value" — bold wraps key only, colon outside
    const cleanLine = line
      .replace(/^\*\*([^*]+)\*\*/, "$1")
      .replace(/^([A-Za-z][A-Za-z \-]+?):\s*/, (_, k) => `${k}: `);
    const kv = cleanLine.match(/^([A-Za-z][A-Za-z \-]+?)\s*:\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const value = kv[2].trim();
    if (/^scenery$/.test(key)) visual.scenery = value;
    else if (/^action$/.test(key)) visual.action = value;
    else if (/^body[\s-]?part(?:s)?(?:\s+shown)?$/.test(key)) visual.bodyPart = value;
    else if (/^continuity(?:\s+reminder)?$/.test(key)) visual.continuity = value;
  }
  return { body: spoken, visual };
}

/** Split a spoken-prose block into its individual callout sentences for
 *  the Advanced Intro table. The Advanced Intro is a 3-callout pattern
 *  ("This is lymphatic congestion." × 3 OR three distinct mirror-symptom
 *  reads in 02b). We return an ordered array of trimmed sentences,
 *  filtering empty fragments. */
function splitAdvancedIntroSpoken(body: string): string[] {
  const trimmed = (body || "").trim();
  if (!trimmed) return [];
  // Strategy A — explicit bullets / numbered list.
  const bulletRows = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  if (bulletRows.length >= 2 && bulletRows.length <= 6) return bulletRows;
  // Strategy B — blank-line separated paragraphs (the production shape:
  // the LLM emits the 3 callouts on separate paragraphs).
  const paraRows = trimmed
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paraRows.length >= 2 && paraRows.length <= 6) return paraRows;
  // Strategy C — sentence split on `. ` / `! ` / `? `.
  const sentRows = trimmed
    .replace(/\.{3,}/g, "…")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentRows.length >= 2 && sentRows.length <= 6) return sentRows;
  // Final fallback — whole body as one row.
  return trimmed ? [trimmed] : [];
}

/** Visual sub-cue with optional sub-rows (when an Action line has
 *  per-callout segments like "on first line ..., on second line ...,
 *  on third line ..."). The Advanced Intro renderer pairs sub-rows with
 *  the corresponding spoken callout when row counts align. */
export type AdvancedIntroVisualPart = {
  /** "Scenery" | "Action" | "Body parts shown" | "Continuity" | other. */
  label: string;
  /** Full content as the LLM emitted it (used when sub-rows is empty). */
  content: string;
  /** Optional per-callout sub-segments. Filled when the content has
   *  "on first/second/third line" markers — used to pair with spoken
   *  callouts row-by-row. */
  subRows?: string[];
};

/** Pre-parsed structure for an Advanced Intro section. Lets the renderer
 *  pair spoken callouts with the matching action sub-cue without redoing
 *  the split inside the React tree. */
export type AdvancedIntroParsed = {
  /** Ordered list of spoken callouts (typically 3). */
  spokenLines: string[];
  /** Per-callout visual breakdowns (NEW SCHEMA — Liam directive 2026-05-26).
   *  When present, the renderer uses these for per-row visual cells.
   *  Each entry corresponds to one callout in spokenLines. */
  callouts?: AdvancedIntroCallout[];
  /** Visual notes split into labeled parts, each optionally sub-split into
   *  per-callout sub-cues. Used as fallback when `callouts` is absent. */
  visualParts: AdvancedIntroVisualPart[];
};

/** Per-callout visual breakdown (Liam directive 2026-05-26 round 3 — schema
 *  simplified from 5 fields to 4). Each field carries the LLM's description
 *  for THIS specific callout. The literal string "same as previous" is
 *  allowed in scenery/continuity (but not scene — every callout must have
 *  a unique narrative because each spoken label points at a different
 *  symptom/body-part).
 *
 *  Legacy callouts (pre-round-3) had separate `bodyParts` + `action` fields.
 *  Those are merged into the single `scene` field on the new schema, with
 *  fallback parsing kept so older saved scripts still render. */
export type AdvancedIntroCallout = {
  /** Spoken line for this callout. */
  spoken: string;
  /** Scenery description (the static set), OR the literal string "same as previous". */
  scenery: string;
  /** Scene narrative — full prose explaining client positioning, authority/camera
   *  action, visible body part + how framed, and timing. Always unique per callout. */
  scene: string;
  /** Continuity description, OR the literal string "same as previous". */
  continuity: string;
  /** LEGACY (pre-round-3): body parts shown. Kept for backward compat
   *  rendering of older saved scripts. */
  bodyParts?: string;
  /** LEGACY (pre-round-3): action. Kept for backward compat rendering. */
  action?: string;
};

/** Split an Action note like "on first line, presses fingers ...; on
 *  second line, lifts chin ...; on third line, ..." into the 3 sub-cues.
 *  Returns the original content as a single-element array when no
 *  per-line markers are present. */
function splitActionSubRows(content: string): string[] {
  if (!content) return [];
  // The LLM commonly uses ordinal markers ("on first/second/third line"
  // or "first beat / second beat / third beat") to time the action with
  // the spoken callouts. Split on these so the table can render the
  // matching cue in each row.
  const ordinalRx =
    /\bon\s+(?:the\s+)?(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(?:line|beat|read)\b/gi;
  const matches: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = ordinalRx.exec(content)) !== null) matches.push(m.index);
  if (matches.length < 2) return [content.trim()];
  const parts: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1] : content.length;
    let seg = content.slice(start, end).trim();
    // Trim trailing separators (`;` / `,` / `.`) so each sub-row is
    // a standalone sentence.
    seg = seg.replace(/[;,.\s]+$/, "");
    if (seg) parts.push(seg);
  }
  return parts.length > 0 ? parts : [content.trim()];
}

/** Parse `### Callout N` sub-blocks from the Advanced Intro section's raw
 *  body. Returns an array of per-callout {spoken, scenery, bodyParts,
 *  action, continuity} or null if no `### Callout` headers are found.
 *
 *  NEW SCHEMA (Liam directive 2026-05-26): the LLM emits per-callout blocks
 *  inside the `## Advanced Intro` section, replacing the legacy single
 *  `### Visual` block. Each block names ONE body part + its own scenery /
 *  action / continuity — fields can declare "same as previous" literally. */
function parseCalloutBlocks(rawSectionBody: string): AdvancedIntroCallout[] | null {
  if (!rawSectionBody) return null;
  // Find every `### Callout N` header. Accept the formats:
  //   `### Callout 1`, `### Callout 1:`, `### Callout 1 — Hair`, etc.
  const headerRx = /^[ \t]*#{2,4}\s*callout\s+(\d+)\b.*$/gim;
  const headers: Array<{ idx: number; len: number; n: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRx.exec(rawSectionBody)) !== null) {
    headers.push({ idx: m.index, len: m[0].length, n: parseInt(m[1], 10) });
  }
  if (headers.length < 2) return null;
  // Sort by ordinal so `### Callout 1` always comes first, etc.
  headers.sort((a, b) => a.n - b.n);
  const callouts: AdvancedIntroCallout[] = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].idx + headers[i].len;
    const end = i + 1 < headers.length ? headers[i + 1].idx : rawSectionBody.length;
    const block = rawSectionBody.slice(start, end);
    const pull = (rx: RegExp): string => {
      const hit = block.match(rx);
      return hit && hit[1] ? hit[1].trim().replace(/^[*_]+|[*_]+$/g, "").trim() : "";
    };
    // Each field accepts BOTH schemas:
    //   - round-3 (legacy):   `- Spoken: ...`  `- Scenery: ...`  `- Scene: ...`  `- Continuity: ...`
    //   - round-10 (dual-layer, current production):
    //       `- **Spoken — Words:** ...`            (also Speaker / Delivery sub-lines)
    //       `- **AI video prompt:** ...`           (the full scene narrative)
    //       `- **User summary:** ...`
    //       `- **Scenery (legacy decomposed):** ...`
    //       `- **Continuity (legacy decomposed):** ...`
    // The `[^:*\n]*` after each keyword swallows a parenthetical suffix like
    // "(legacy decomposed)" without crossing the colon, the asterisks, or the
    // line; the em/en/hyphen dash class handles the "Spoken — Words" sub-label.
    const bodyParts = pull(/^\s*[-*]?\s*\*{0,2}body\s*parts?(?:\s+shown)?\*{0,2}\s*:\s*(.+)$/im);
    const action = pull(/^\s*[-*]?\s*\*{0,2}action\*{0,2}\s*:\s*(.+)$/im);
    const userSummary = pull(/^\s*[-*]?\s*\*{0,2}\s*user\s*summary\s*\*{0,2}\s*:\s*(.+)$/im);
    // Spoken: prefer the round-10 "Spoken — Words" line; else the plain
    // "Spoken:" line. (Speaker / Delivery sub-lines are intentionally skipped —
    // they aren't the spoken copy.)
    const spoken =
      pull(/^\s*[-*]?\s*\*{0,2}\s*spoken\s*[—–-]\s*words\s*\*{0,2}\s*:\s*(.+)$/im) ||
      pull(/^\s*[-*]?\s*\*{0,2}\s*spoken\s*\*{0,2}\s*:\s*(.+)$/im);
    const scenery = pull(/^\s*[-*]?\s*\*{0,2}\s*scenery\b[^:*\n]*\*{0,2}\s*:\s*(.+)$/im);
    const continuity = pull(/^\s*[-*]?\s*\*{0,2}\s*continuity\b[^:*\n]*\*{0,2}\s*:\s*(.+)$/im);
    // Scene narrative: prefer the round-10 "AI video prompt", then a legacy
    // "Scene:" field, then synthesize from legacy bodyParts/action, then fall
    // back to the round-10 "User summary".
    let scene =
      pull(/^\s*[-*]?\s*\*{0,2}\s*ai\s*video\s*prompt\s*\*{0,2}\s*:\s*(.+)$/im) ||
      pull(/^\s*[-*]?\s*\*{0,2}\s*scene\b[^:*\n]*\*{0,2}\s*:\s*(.+)$/im);
    if (!scene && (bodyParts || action)) {
      scene = [action, bodyParts].filter(Boolean).join(" — ");
    }
    if (!scene && userSummary) scene = userSummary;
    callouts.push({
      spoken,
      scenery,
      scene,
      continuity,
      bodyParts: bodyParts || undefined,
      action: action || undefined,
    });
  }
  // Sanity check: at least one callout must have meaningful content
  // (avoid returning [] when the headers exist but content is unparseable).
  const hasContent = callouts.some(
    (c) => c.spoken || c.scenery || c.scene || c.bodyParts || c.action || c.continuity,
  );
  if (!hasContent) return null;
  return callouts;
}

/** Build the per-callout-pair view for the Advanced Intro renderer.
 *  Takes the section body + already-parsed visual notes and produces
 *  {spokenLines, visualParts} where each visualPart may carry sub-rows
 *  aligned with the spoken callouts. */
function buildAdvancedIntroParsed(
  body: string,
  visual: SectionVisualNotes,
  rawSectionBody?: string,
): AdvancedIntroParsed {
  // Try the new per-callout schema first.
  const callouts = rawSectionBody ? parseCalloutBlocks(rawSectionBody) : null;
  const spokenLines = callouts
    ? callouts.map((c) => c.spoken).filter(Boolean)
    : splitAdvancedIntroSpoken(body);
  const visualParts: AdvancedIntroVisualPart[] = [];
  if (visual.scenery) {
    visualParts.push({ label: "Scenery", content: visual.scenery });
  }
  if (visual.action) {
    const sub = splitActionSubRows(visual.action);
    visualParts.push({
      label: "Action",
      content: visual.action,
      subRows: sub.length > 1 ? sub : undefined,
    });
  }
  if (visual.bodyPart) {
    visualParts.push({ label: "Body parts shown", content: visual.bodyPart });
  }
  if (visual.continuity) {
    visualParts.push({ label: "Continuity", content: visual.continuity });
  }
  return {
    spokenLines: spokenLines.length > 0 ? spokenLines : splitAdvancedIntroSpoken(body),
    callouts: callouts ?? undefined,
    visualParts,
  };
}

/** Parse a Format 02a/02b script. Returns null if the 3-section shape
 *  can't be recovered — caller should fall back to Format-00 rendering. */
export function parseFormat2Script(text: string): ParsedFormat2Script | null {
  if (!text || typeof text !== "string") return null;
  // stripMetaForClient strips the Meta bullet block + leading heads-up
  // blockquote + script_skeleton wrappers; stripHtmlComments then nukes
  // any leftover `<!--avatar_types:doctor-->` / `<!-- persona: none -->`
  // sidecar markers so they can't leak into the rendered text.
  const cleaned = stripHtmlComments(stripMetaForClient(text));
  const headings = findFormat2Headings(cleaned);
  // Require at least 2 of the 3 canonical headings to consider this a
  // Format-2 script. Two-of-three handles models that abbreviate "No-Product
  // Body" → "Body" or skip "Advanced Intro" when the intro is implicit.
  // Deduplicate "No-Product Body" / "No Product Body" so we don't double-count.
  const distinctCount = new Set(
    headings.map((h) => h.heading.replace(/-/g, " ").toLowerCase()),
  ).size;
  if (distinctCount < 2) return null;
  const preface = cleaned.slice(0, headings[0].idx).trim();
  const sections: ScriptSectionData[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].idx + headings[i].len;
    const end = i + 1 < headings.length ? headings[i + 1].idx : cleaned.length;
    const raw = cleaned.slice(start, end).trim();
    const { body, visual } = extractVisualNotes(raw);
    const cleanedBody = stripHtmlComments(body);
    const cleanedVisual: SectionVisualNotes = {
      scenery: visual.scenery ? stripHtmlComments(visual.scenery) : undefined,
      action: visual.action ? stripHtmlComments(visual.action) : undefined,
      bodyPart: visual.bodyPart ? stripHtmlComments(visual.bodyPart) : undefined,
      continuity: visual.continuity ? stripHtmlComments(visual.continuity) : undefined,
    };
    const isAdvancedIntro = /^advanced\s+intro$/i.test(headings[i].heading.trim());
    sections.push({
      heading: headings[i].heading,
      body: cleanedBody,
      visual: cleanedVisual,
      // Pre-parse the Advanced Intro into spoken-callouts + per-label
      // visual parts (with optional per-callout sub-rows on Action). The
      // renderer uses this to pair each spoken callout with the matching
      // action cue row-by-row, instead of mirroring the whole visual
      // block on every row (the prior shape, which still works as a
      // fallback when this field is absent).
      advancedIntroParsed: isAdvancedIntro
        ? buildAdvancedIntroParsed(cleanedBody, cleanedVisual, raw)
        : undefined,
    });
  }
  return { sections, preface: stripHtmlComments(preface) };
}
