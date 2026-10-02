// Port of TSL-Generation-v2/client/src/lib/scriptMessage.ts
// Parses one assistant message into executive summary + clean body + word count.

import { stripInternalNotes } from "@/lib/stripInternalNotes";

export interface ScriptSummary {
  speaker?: string;
  pain?: string;
  rootCause?: string;
  discovery?: string;
  extremeScenario?: string;
  angle?: string;
  plot?: string;
}

export interface ParsedScriptMessage {
  isFullScript: boolean;
  summary: ScriptSummary;
  body: string;
  wordCount: number;
}

const FIELD_PATTERNS: Array<[keyof ScriptSummary, RegExp]> = [
  ["speaker", /\*\*Speaker:?\*\*\s*([^\n]+)/i],
  ["pain", /\*\*Main pain point:?\*\*\s*([\s\S]+?)(?=\n\s*-\s*\*\*|\n\n)/i],
  ["rootCause", /\*\*Root cause:?\*\*\s*([\s\S]+?)(?=\n\s*-\s*\*\*|\n\n)/i],
  ["discovery", /\*\*Discovery of root cause:?\*\*\s*([\s\S]+?)(?=\n\s*-\s*\*\*|\n\n)/i],
  ["extremeScenario", /\*\*Extreme scenario:?\*\*\s*([\s\S]+?)(?=\n\s*-\s*\*\*|\n\n)/i],
  ["angle", /\*\*Angle:?\*\*\s*([^\n]+)/i],
  ["plot", /\*\*Plot:?\*\*\s*([\s\S]+?)(?=\n\s*-\s*\*\*|\n\n)/i],
];

function trimToOneSentence(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const dot = t.indexOf(".", Math.min(60, max - 20));
  if (dot > 0 && dot < max) return t.slice(0, dot + 1);
  return t.slice(0, max).trim() + "…";
}

export function parseScriptMessage(raw: string | null | undefined): ParsedScriptMessage {
  const original = raw || "";
  const summary: ScriptSummary = {};

  const hasConfig = /\*\*TSL\s*CONFIG\*\*/i.test(original);
  for (const [key, pat] of FIELD_PATTERNS) {
    const m = original.match(pat);
    if (m && m[1]) summary[key] = trimToOneSentence(m[1]);
  }

  if (!summary.plot && (summary.pain || summary.extremeScenario)) {
    const pieces: string[] = [];
    if (summary.pain) pieces.push(summary.pain.replace(/\.$/, ""));
    if (summary.discovery) pieces.push(summary.discovery.replace(/\.$/, ""));
    if (summary.extremeScenario) pieces.push(summary.extremeScenario.replace(/\.$/, ""));
    if (pieces.length > 0) summary.plot = trimToOneSentence(pieces.join(" → "), 240);
  }

  const body = stripInternalNotes(original);
  const words = body.replace(/[*_`#]/g, "").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

  return { isFullScript: hasConfig || words.length > 150, summary, body, wordCount: words.length };
}
