// tslResult.ts
//
// Client-side helpers for the TSL generation contract. The server emits a
// `TslChatResult` JSON object as the chat-job result; that JSON string is what
// the assistant message's `content` carries (so it survives a page reload +
// DB round-trip). This module is the single place that turns a raw message
// `content` back into a typed `TslChatResult`, with a safe fallback for
// legacy / error / plain-prose messages that are NOT JSON.
//
// It also owns the canonical names + descriptions for the proven TSL SECTION
// STRUCTURES.

// ---------------------------------------------------------------------------
// Inline types (from shared/schema — not ported as a separate module)
// ---------------------------------------------------------------------------

export interface VerificationGate {
  id: "G1" | "G2" | "G3" | "G4";
  label: string;
  pass: boolean;
  detail?: string;
}

export interface VerificationTrace {
  gates: VerificationGate[];
  authority: { score: number; subscores: Record<string, number> };
  sections: { name: string; present: boolean }[];
  attempts: number;
}

export interface CoworkCheckpoint {
  id: "story" | "trigger-event" | "mechanism";
  question: string;
  draftFragment: string;
}

export interface TslChatResult {
  status: "done" | "checkpoint" | "answer";
  script?: string;
  trace?: VerificationTrace;
  checkpoint?: CoworkCheckpoint;
  answer?: string;
  revised?: boolean;
  revisionNote?: string;
}

/**
 * Did the model return a real TSL, or did it refuse / ask a clarifying question /
 * emit commentary instead of the script? A real TSL — even an aggressively
 * shortened one — is many hundreds of words and never talks ABOUT the task.
 */
export function isNonScriptResponse(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return true;
  // A real TSL is many hundreds of words; a refusal/note is always short.
  // Word-count baseline (>= 150 words) matches the backend's isNonScriptResponse
  // (source-faithful) so client + server classify refusals identically.
  if (text.trim().split(/\s+/).filter(Boolean).length < 150) return true;
  if (/\*\*[^*\n]+\*\*/.test(text)) return true; // **bold**
  if (/^\s*#{1,6}\s+\S/m.test(text)) return true; // markdown heading
  return /\b(i\s+can'?t\s+(make|do|add|apply|create|produce|fabricat\w*|generate|write|put|include|name|change|give\s+you|complete)\b|i\s+cannot\s+(make|do|add|apply|create|produce|fabricat\w*|generate|write|honor|complete)\b|as\s+requested\b|the\s+change\s+(asks|you|requests|would|breaks)\b|make\s+that\s+change\b|breaks?\s+(a|two|three|several|the)\s+(hard\s+)?rules?\b|\bhard\s+rules?\b|which\s+i\s+can'?t\s+do\b|stay\s+true\s+to\s+the\s+product\b|would\s+be\s+fabricat\w*|here\s+are\s+(the\s+|some\s+)?edits?\s+i\s+can\b|i\s+don'?t\s+have\s+(a|an|any)\s+(prior|current|existing)?\s*(script|tsl)\b|there'?s\s+no\s+(existing|prior|current)\s+(tsl|script)\b|if\s+you'?d\s+like,?\s+i\s+(can|could)\s+(write|build|create|make|put)\b|send\s+me\s+(the|an|your)\s+angle\b|i\s+couldn'?t\s+apply\s+that\s+edit\b|i\s+can\s+only\s+use\s+these\s+names\b)/i.test(text);
}

// ---------------------------------------------------------------------------
// Format metadata (the proven TSL SECTION STRUCTURES)
// ---------------------------------------------------------------------------

export type TslFormatMeta = {
  id: string;
  name: string;
  description: string;
};

export const TSL_FORMAT_META: Record<string, TslFormatMeta> = {
  "tsl-full-narrative-arc": {
    id: "tsl-full-narrative-arc",
    name: "Full Narrative Arc",
    description:
      "The full mini-movie: relationship build up front, emotional payoff at the close. The longest, most complete shell.",
  },
  "tsl-lean-linear": {
    id: "tsl-lean-linear",
    name: "Lean Linear",
    description:
      "Faster and mechanism-forward: no relationship build, an explicit early ask, a light emotional payoff.",
  },
  "tsl-stakes-first-cold-open": {
    id: "tsl-stakes-first-cold-open",
    name: "Stakes-First Cold-Open",
    description:
      "Death leads — a fatal stake up top, before the character, then the story backfills. (Needs a death in the angle.)",
  },
};

export function resolveFormatMeta(id: string): TslFormatMeta {
  const known = TSL_FORMAT_META[id];
  if (known) return known;
  const name = id
    .replace(/^tsl-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { id, name, description: "Proven TSL structure." };
}

export function formatName(id: string): string {
  return resolveFormatMeta(id).name;
}

// ---------------------------------------------------------------------------
// Parsing an assistant message into a TslChatResult
// ---------------------------------------------------------------------------

function isTslChatResult(v: unknown): v is TslChatResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.status === "done" || o.status === "checkpoint" || o.status === "answer"
  );
}

/**
 * Parse a raw assistant message `content` into a typed TslChatResult.
 *
 * The server emits the result as a JSON object. We accept both a bare JSON
 * object and a ```json fenced``` block (defensive). Anything that isn't a
 * recognizable TslChatResult is treated as a plain prose answer.
 */
export function parseTslResult(content: string | null | undefined): TslChatResult {
  const raw = (content ?? "").trim();
  if (!raw) return { status: "answer", answer: "" };

  // Try a fenced ```json ... ``` block first, then the bare string.
  const fence = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  const candidate = fence ? fence[1].trim() : raw;

  // Fast bail-out: only attempt JSON.parse when it actually looks like an object.
  if (candidate.startsWith("{")) {
    try {
      const parsed = JSON.parse(candidate);
      if (isTslChatResult(parsed)) return parsed as TslChatResult;
    } catch {
      // not JSON — fall through to plain-text handling
    }
  }

  // Plain prose (legacy / error / general-answer that wasn't wrapped).
  return { status: "answer", answer: raw };
}

/** True when an assistant message carries a finished, renderable TSL script. */
export function isFinishedTsl(content: string | null | undefined): boolean {
  const r = parseTslResult(content);
  return r.status === "done" && !!r.script && !isNonScriptResponse(r.script);
}

/** A short, human label for the chat bubble when a finished script lives in
 *  the side panel. */
export function bubbleSummaryFor(result: TslChatResult): string {
  if (result.status === "done") {
    const score = result.trace?.authority?.score;
    return score != null
      ? `Your TSL is ready in the panel — Authority ${score}/100.`
      : "Your TSL is ready in the side panel.";
  }
  if (result.status === "answer") return result.answer ?? "";
  return "";
}
