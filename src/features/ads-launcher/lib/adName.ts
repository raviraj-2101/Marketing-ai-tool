const NOISE_TOKENS = new Set([
  "vid",
  "video",
  "copy",
  "draft",
  "final",
  "final2",
  "v1",
  "v2",
  "v3",
  "edit",
  "nn",
  "en",
  "us",
  "uk",
]);

const FUNNEL_WORDS = new Set(["onbrand", "comparison", "onb", "comp"]);

const ASPECT_RE = /^(?:9x16|4x5|1x1|9_16|4_5|1_1|9by16|4by5|1by1)$/i;

export type ParsedAdName = {
  iteration: string | null;
  variant: string | null;
  aspect: string | null;
  creator: string | null;
  conceptHint: string | null;
};

const SS_RE = /^SS\d+$/i;
const CTA_RE = /^CTA\d+$/i;
const ITERATION_PHRASE_RE = /iteration\s*#?\s*(\d+)/i;
const CREATOR_RE = /^[A-Z]{1,3}\.[A-Z][A-Za-z0-9]+$/;

function tokenize(filename: string): string[] {
  const stem = filename.replace(/\.[a-z0-9]{1,5}$/i, "");
  return stem
    .split(/[_\s\-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseAdName(filename: string, codeTokens: Set<string> = new Set()): ParsedAdName {
  const tokens = tokenize(filename);
  let iteration: string | null = null;
  let variant: string | null = null;
  let aspect: string | null = null;
  let creator: string | null = null;
  let conceptHint: string | null = null;

  const itM = filename.match(ITERATION_PHRASE_RE);
  if (itM) iteration = itM[1];

  const conceptWords: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    if (SS_RE.test(t) || CTA_RE.test(t)) {
      if (!variant) variant = t.toUpperCase();
      continue;
    }
    if (ASPECT_RE.test(t)) {
      if (!aspect) aspect = t.replace(/_/g, "x").replace(/by/i, "x").toLowerCase();
      continue;
    }
    if (CREATOR_RE.test(t)) {
      if (!creator) creator = t;
      continue;
    }
    if (NOISE_TOKENS.has(lower) || FUNNEL_WORDS.has(lower)) continue;
    if (codeTokens.has(lower)) continue;
    if (/^iteration$/i.test(t) || /^#?\d+$/.test(t)) continue;
    if (/^Y\d{2}W\d{2}$/i.test(t)) continue;
    if (/^\d{4,}$/.test(t)) continue;
    if (i < 6 && /^\d/.test(t)) continue;

    conceptWords.push(t);
    if (conceptWords.length >= 3) break;
  }
  if (conceptWords.length > 0) conceptHint = conceptWords.join(" ");

  return { iteration, variant, aspect, creator, conceptHint };
}

export function smartAdName(filename: string, code: string | null): string {
  const codeTokens = new Set(
    (code ?? "")
      .split(/[_\s\-·]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );
  const parsed = parseAdName(filename, codeTokens);
  const parts: string[] = [];
  if (code) parts.push(code);
  if (parsed.iteration) parts.push(`iter${parsed.iteration}`);
  if (parsed.variant) parts.push(parsed.variant);
  if (parsed.aspect) parts.push(parsed.aspect);
  if (parsed.conceptHint) parts.push(parsed.conceptHint);
  if (parsed.creator) parts.push(parsed.creator);
  if (parts.length <= (code ? 1 : 0)) {
    const stem = filename
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[_\s]+/g, " ")
      .trim();
    return code ? `${code} · ${stem}` : stem;
  }
  return parts.join(" · ");
}
