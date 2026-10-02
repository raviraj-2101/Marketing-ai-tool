// DocsPanel.tsx
//
// Right-side "Docs"-style panel that surfaces the latest assistant message
// as a structured document — scripts grouped by angle, with per-doc summary,
// per-script concept name, P1/P2 sections, copy-everything and copy-per-script
// affordances, and a TSL-style live progress block during generation.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Copy, Check, X, FileText, Video, CheckSquare, Square, Clock, ExternalLink, ChevronRight, History, Sparkles, Loader2, CheckCircle2, XCircle, Clapperboard, Mic, Music } from "lucide-react";
import {
  parseScriptDoc,
  describeClassicFormat,
  parseFormat2Script,
  buildDocSummary,
  detectFormat,
  splitOnImageCard,
  stripHtmlComments,
  prettyAngle,
  type ParsedScript,
  type ParsedDoc,
  type ParsedFormat2Script,
  type DetectedFormat,
  type ScriptSegment,
} from "@/lib/parseScripts";
import { ScriptSection } from "./ScriptSection";
import { ImageCardBadge } from "@/components/ImageCardBadge";
import { isPixarStoryboard, parseFormat3Script, type ParsedFormat3Script } from "@/lib/parsePixar";
import { isAnimatedCharsStoryboard, parseAnimatedCharsScript, type ParsedAnimatedCharsScript } from "@/lib/parseAnimatedChars";
import { PixarScene } from "./PixarScene";
import { savePixarBuild } from "@/lib/pixarBuildSession";
import type { LocalMessage } from "@/lib/streamStore";
import { fmtCET, fmtCETTime } from "@/lib/datetime";
import { API_BASE } from "@/lib/queryClient";

type DocsPanelProps = {
  message: LocalMessage | undefined;
  allScriptedMessages?: LocalMessage[];
  open: boolean;
  onClose: () => void;
  productLabel?: string;
  productSlug?: string;
  /** Script format label (e.g. "Pixar-Style Video Ads (under 60s)") — handed to
   *  the pixar build session so new-video can stamp it as video_format. */
  videoFormat?: string;
  chatId?: string | null;
  /** Forwarded to the Advanced-Intro section of a Format-02 script, where it
   *  renders a "Regenerate intro" button. Undefined → button hidden. */
  onRegenerateIntro?: () => void;
  onBuildUgc?: (scripts: Array<{
    title: string;
    plain: string;
    concept: string;
    angle?: string;
    angleLabel?: string;
    angleCode?: string;
    description?: string;
    // Optional spoken hook (ClickUp 86caz3tkg) split off the top of the script.
    // Absent / "" for every hook-off script.
    hook?: string;
    p1?: string;
    p2?: string;
    // Format-05 (Classic UGC 1-4 min) middle beats. Empty / absent on 60s scripts.
    m1?: string;
    m2?: string;
    // Format-08 (Classic UGC 4-18 min) ordered HOOK / MODULE n / REVEAL
    // segments. Absent for every other format.
    segments?: ScriptSegment[];
    avatarTypes?: Array<"doctor" | "normal" | "natural_wellness" | "any">;
    suggestedPersona?: string;
    suggestedSubAngle?: string;
    inspiredByAdIds?: string[];
    // Format-02 ("Unique Intro") — the 3 spoken callout lines from the Advanced
    // Intro section. Prefill BatchCreator's 3 advanced-intro script fields.
    advanceScripts?: string[];
  }>) => void;
  /** Format-04 (Animated Characters) — opens the per-character image build
   *  workspace. Undefined → "Build Video" button hidden. */
  onBuildVideo?: () => void;
};

const STAGES: [number, string][] = [
  [0, "Thinking"],
  [4, "Reading the brief"],
  [12, "Picking archetypes"],
  [28, "Drafting concepts"],
  [50, "Writing the script"],
  [80, "Polishing & validating"],
  [120, "Almost there"],
];

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function scriptKey(s: ParsedScript): string {
  return `${s.angle || "x"}::${s.index}::${(s.concept || "").slice(0, 40)}`;
}

function scriptToPlain(s: ParsedScript): string {
  // Include the format-05 middle beats inline in the spoken body when present.
  // BatchCreator's chat-import path also reads the typed m1/m2 fields directly,
  // so the order here only matters for display + clipboard copy.
  const parts: string[] = [];
  if (s.segments && s.segments.length > 0) {
    // Format-08 (Classic UGC 4-18 min): join SEGMENT TEXTS ONLY. The
    // **HOOK** / **MODULE n** / **REVEAL** heading lines must never reach
    // the plain body — it's what HeyGen narrates, and the s.body fallback
    // below only de-bolds markers, which made the avatar literally say
    // "HOOK" / "MODULE 1" / "REVEAL".
    for (const sg of s.segments) {
      if (sg.text) parts.push(sg.text.trim());
    }
  } else {
    if (s.p1) parts.push(s.p1.trim());
    if (s.m1) parts.push(s.m1.trim());
    if (s.m2) parts.push(s.m2.trim());
    if (s.p2) parts.push(s.p2.trim());
  }
  const joined = parts.join("\n\n");
  return (joined || s.body || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1")
    .replace(/<script_skeleton>[\s\S]*?<\/script_skeleton>/gi, "")
    .replace(/\*\*Meta\*\*[\s\S]*?(?=\n\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Spoken-word count for a single segment's prose (format-08 cards). */
function segmentWordCount(s: string): number {
  return (s || "").split(/\s+/).filter(Boolean).length;
}

/* -------------------- Format 02 selection / build helpers -------------------- */

/** Synthetic selection key for the single Format-02 script in the panel. */
const FORMAT2_SEL_KEY = "__format2__";

/** Build the plain spoken-script text from a Format-2 parse — intro callouts
 *  (spoken lines only) + the No-Product Body + Product Reveal spoken copy.
 *  Used as the `plain` payload handed to the UGC builder. */
function format2ToPlain(parsed: ParsedFormat2Script): string {
  const blocks: string[] = [];
  for (const s of parsed.sections) {
    const ai = s.advancedIntroParsed;
    if (ai?.callouts && ai.callouts.length > 0) {
      const lines = ai.callouts.map((c) => c.spoken).filter(Boolean);
      if (lines.length) blocks.push(lines.join("\n"));
    } else if (ai?.spokenLines && ai.spokenLines.length > 0) {
      blocks.push(ai.spokenLines.join("\n"));
    } else if (s.body) {
      blocks.push(
        s.body
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/_+([^_]+)_+/g, "$1"),
      );
    }
  }
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Spoken copy of the first Format-2 section whose heading matches `rx`, with
 *  markdown emphasis stripped — mirrors the per-section strip in format2ToPlain.
 *  Returns "" when no such section exists. */
function format2SectionSpoken(parsed: ParsedFormat2Script, rx: RegExp): string {
  const sec = parsed.sections.find((s) => rx.test(s.heading.trim()));
  if (!sec?.body) return "";
  return sec.body
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Read a `key: value` line from the `===META=== ... ===END_META===` block of
 *  the ORIGINAL (unstripped) message text. Returns "" for missing/none/any. */
function readMetaBlockValue(raw: string, key: string): string {
  const block = raw.match(/===META===([\s\S]*?)===END_META===/i);
  if (!block) return "";
  const m = block[1].match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, "im"));
  if (!m) return "";
  const v = m[1].trim();
  if (!v || /^(none|any|n\/?a)$/i.test(v)) return "";
  return v;
}

/** Per-clip scenery/scene visuals carried to the builder so the "Generate
 *  Scene" pipeline can be driven from the script. p1–p3 are the Advanced Intro
 *  callouts (scenery + scene narrative); p4/p5 are the No-Product Body / Product
 *  Reveal sections (scenery only). */
export type PipelineScenes = {
  p1: { scenery: string; scene: string };
  p2: { scenery: string; scene: string };
  p3: { scenery: string; scene: string };
  p4: { scenery: string };
  p5: { scenery: string };
};

/** Assemble the UGC-builder payload for a Format-2 script. */
function buildFormat2Picked(
  rawText: string,
  parsed: ParsedFormat2Script,
): {
  title: string;
  plain: string;
  p1?: string;
  p2?: string;
  concept: string;
  suggestedSubAngle?: string;
  suggestedPersona?: string;
  avatarTypes?: Array<"doctor" | "normal" | "natural_wellness" | "any">;
  inspiredByAdIds?: string[];
  isUniqueIntro: boolean;
  advanceScripts: string[];
  pipelineScenes: PipelineScenes;
} {
  const intro = parsed.sections[0]?.advancedIntroParsed;
  const firstSpoken =
    intro?.callouts?.[0]?.spoken || intro?.spokenLines?.[0] || "";
  // The 3 spoken callout lines authored in the Advanced Intro section. Prefer
  // the per-callout `spoken` text; fall back to the flat `spokenLines`. Keep
  // only non-empty lines and pad/truncate to exactly 3 (slot 0/1/2 = Script
  // 1/2/3 in BatchCreator's advanced-intro fields).
  const advanceLines = (
    intro?.callouts?.map((c) => c.spoken) ?? intro?.spokenLines ?? []
  )
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const advanceScripts = [0, 1, 2].map((i) => advanceLines[i] ?? "");
  const subAngle = readMetaBlockValue(rawText, "sub_angle");
  const persona = readMetaBlockValue(rawText, "persona");
  const avatarTypes = readMetaBlockValue(rawText, "avatar_types")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ["doctor", "normal", "natural_wellness", "any"].includes(s)) as Array<
    "doctor" | "normal" | "natural_wellness" | "any"
  >;
  const inspiredByAdIds = readMetaBlockValue(rawText, "inspo_ad_ids")
    .split(/[,\s]+/)
    .map((s) => s.replace(/\D/g, "").slice(0, 6))
    .filter((s) => s.length > 0)
    .slice(0, 8);
  const label = (firstSpoken || subAngle || "Unique Intro").slice(0, 80);
  // Section → script-field mapping for Unique Intro. The Advanced Intro is NOT
  // a script field — its scene direction lives in the Advance Prompt block.
  // No-Product Body → P1 (without product); Product Reveal → P2 (with product).
  const noProductBody = format2SectionSpoken(parsed, /^no[\s-]?product\s+body$/i);
  const productReveal = format2SectionSpoken(parsed, /^product\s+reveal$/i);

  // Per-clip scenery/scene for the Generate Scene pipeline. p1–p3 come from the
  // Advanced Intro callouts; p4/p5 from the body sections' scenery note. Resolve
  // a "same as previous" / empty scenery back to the first callout's scenery so
  // the API always receives a concrete set description.
  const callouts = intro?.callouts ?? [];
  const sceneryPart =
    intro?.visualParts?.find((p) => /scener/i.test(p.label))?.content?.trim() ?? "";
  const firstScenery =
    (callouts[0]?.scenery ?? "").trim().replace(/^same as previous$/i, "") || sceneryPart;
  const calloutScenery = (i: number): string => {
    const raw = (callouts[i]?.scenery ?? "").trim();
    if (raw && !/^same as previous$/i.test(raw)) return raw;
    return firstScenery;
  };
  const calloutScene = (i: number): string =>
    (callouts[i]?.scene ?? "").trim() || (advanceLines[i] ?? "");
  const noProdSec = parsed.sections.find((s) => /^no[\s-]?product\s+body$/i.test(s.heading.trim()));
  const revealSec = parsed.sections.find((s) => /^product\s+reveal$/i.test(s.heading.trim()));
  const pipelineScenes: PipelineScenes = {
    p1: { scenery: calloutScenery(0), scene: calloutScene(0) },
    p2: { scenery: calloutScenery(1), scene: calloutScene(1) },
    p3: { scenery: calloutScenery(2), scene: calloutScene(2) },
    p4: { scenery: (noProdSec?.visual?.scenery ?? "").trim() || firstScenery },
    p5: { scenery: (revealSec?.visual?.scenery ?? "").trim() || firstScenery },
  };
  return {
    title: `Unique Intro — ${label}`,
    plain: format2ToPlain(parsed),
    p1: noProductBody || undefined,
    p2: productReveal || undefined,
    concept: firstSpoken || subAngle || "Unique Intro",
    suggestedSubAngle: subAngle || undefined,
    suggestedPersona: persona || undefined,
    avatarTypes: avatarTypes.length ? avatarTypes : undefined,
    inspiredByAdIds: inspiredByAdIds.length ? inspiredByAdIds : undefined,
    isUniqueIntro: true,
    advanceScripts,
    pipelineScenes,
  };
}

function stageFor(elapsedSec: number): string {
  let label = STAGES[0][1];
  for (const [t, l] of STAGES) {
    if (elapsedSec >= t) label = l;
  }
  return label;
}

function useElapsed(startedAt: number | undefined, finishedAt: number | undefined): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    if (finishedAt) {
      setTick(Math.floor((finishedAt - startedAt) / 1000));
      return;
    }
    const update = () => setTick(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);
  return tick;
}

/* ----------------------------- panel header ----------------------------- */

function PanelHeader({
  doc,
  generating,
  startedAt,
  finishedAt,
  onClose,
  onCopyAll,
  copiedAll,
}: {
  doc: ParsedDoc;
  generating: boolean;
  startedAt: number | undefined;
  finishedAt: number | undefined;
  onClose: () => void;
  onCopyAll: () => void;
  copiedAll: boolean;
}) {
  const elapsed = useElapsed(startedAt, finishedAt);
  const summary = buildDocSummary(doc);
  const total = doc.scripts.length;

  return (
    <div className="border-b border-border bg-card sticky top-0 z-10">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate" data-testid="docs-panel-title">
            {generating && total === 0 ? "Generating scripts…" : "Scripts doc"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {total > 0 && (
            <button
              onClick={onCopyAll}
              className="flex items-center justify-center gap-1 rounded-md border border-border bg-background hover:bg-muted px-2 py-1 text-xs font-medium transition-colors min-w-[5.5rem]"
              data-testid="docs-copy-all"
              aria-live="polite"
              title="Copy the entire doc with formatting"
            >
              {copiedAll ? (
                <>
                  <Check className="size-3 text-green-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Copy all</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="size-7 rounded-md hover:bg-muted flex items-center justify-center"
            data-testid="docs-panel-close"
            aria-label="Close docs panel"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {(summary || generating) && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {summary && <span data-testid="docs-summary">{summary}</span>}
          {(generating || (startedAt && finishedAt)) && (
            <span className="ml-auto inline-flex items-center gap-1.5 tabular-nums">
              {generating ? (
                <>
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  <span>{stageFor(elapsed)}…</span>
                </>
              ) : (
                <span>Generated</span>
              )}
              <span>· {formatDuration(elapsed * 1000)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- script section ---------------------------- */

function ShimmerLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-3 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer ${
            i === 0 ? "w-3/4" : i === 1 ? "w-full" : "w-5/6"
          }`}
        />
      ))}
    </div>
  );
}

/** Render a markdown string, but FIRST replace `{{image-card: <variant>}}` /
 *  `{{image-card-end}}` tokens with the inline <ImageCardBadge /> component.
 *  We split on the tokens so each badge is a real React element (not a raw
 *  HTML string that react-markdown would escape or re-interpret). Each text
 *  part is passed through ReactMarkdown independently; the badges sit between
 *  markdown blocks as inline spans. Used for Format 01 (comparison Top-5). */
function MarkdownWithImageCards({ text }: { text: string }) {
  const parts = useMemo(() => {
    // Strip HTML comments + meta block before splitting so a `<!-- ... -->`
    // marker can't leak into the rendered prose next to a trigger sentence.
    const clean = stripHtmlComments(text);
    return splitOnImageCard(clean);
  }, [text]);
  if (parts.length === 1 && parts[0].type === "text") {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts[0].value}</ReactMarkdown>
    );
  }
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "image-card") {
          return <ImageCardBadge key={i} variant={p.variant} mode="start" />;
        }
        if (p.type === "image-card-end") {
          return <ImageCardBadge key={i} mode="end" />;
        }
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {p.value}
          </ReactMarkdown>
        );
      })}
    </>
  );
}

function ScriptCard({
  script,
  numberInDoc,
  totalInDoc,
  conceptLabel,
  selected,
  onToggleSelect,
}: {
  script: ParsedScript;
  numberInDoc: number;
  totalInDoc: number;
  conceptLabel?: string;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const proseRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const copyScript = async () => {
    const proseEl = proseRef.current;
    if (!proseEl) return;
    const html = wrapInRichHtml(proseEl.innerHTML);
    // Format-08 (segments) keeps the labels in the clipboard copy — they're
    // for the human reader, not the avatar (scriptToPlain stays label-free).
    // Optional hook block leads the copy, mirroring the on-screen order. Empty
    // string when there is no hook → the copied text is unchanged.
    const hookPart = script.hook ? `HOOK\n${script.hook}\n\n` : "";
    const plain = script.segments && script.segments.length > 0
      ? `${script.concept}\n\n${hookPart}${script.segments
          .map((sg) => `${sg.label}${sg.title ? ` — ${sg.title}` : ""}\n${sg.text}`)
          .join("\n\n")}`.trim()
      : `${script.concept}\n\n${hookPart}P1\n${script.p1}${script.p2 ? `\n\nP2\n${script.p2}` : ""}`.trim();
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <article
      className={`rounded-lg border bg-background p-4 transition-colors ${
        selected ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
      }`}
      data-testid={`docs-script-${numberInDoc}`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          {onToggleSelect && (
            <button
              type="button"
              onClick={onToggleSelect}
              className={`mt-0.5 size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                selected ? "bg-primary border-primary" : "bg-card border-border hover:border-primary/60"
              }`}
              data-testid={`docs-script-checkbox-${numberInDoc}`}
              aria-label={selected ? "Deselect script" : "Select script"}
              title={selected ? "Deselect for UGC build" : "Select for UGC build"}
            >
              {selected && <Check className="size-3 text-primary-foreground" />}
            </button>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              <span>
                Script {numberInDoc} / {totalInDoc} · {script.angleLabel}
              </span>
              {script.style && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 text-primary px-2 py-[1px] text-[9.5px] font-semibold tracking-wide leading-4"
                  data-testid={`docs-script-style-${numberInDoc}`}
                  title="Server-assigned script style"
                >
                  <span className="size-1.5 rounded-full bg-primary/70" aria-hidden />
                  {script.style}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold mt-0.5 leading-snug" data-testid="docs-script-title">
              {conceptLabel || (() => {
                const prefix =
                  script.angleCode ||
                  (script.angleLabel && script.angleLabel !== "Other"
                    ? script.angleLabel
                    : "");
                const tail = script.description || script.concept;
                return prefix ? `${prefix} — ${tail}` : tail;
              })()}
            </h3>
          </div>
        </div>
        <button
          onClick={copyScript}
          className="shrink-0 flex items-center gap-1 rounded-md border border-border bg-card hover:bg-muted px-2 py-1 text-[11px] font-medium transition-colors"
          data-testid="docs-copy-script"
          title="Copy this script with formatting"
        >
          {copied ? (
            <>
              <Check className="size-3 text-green-600" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </header>

      <div ref={proseRef} className="space-y-4">
        {/* Optional spoken hook — its own block ABOVE the script, for every
            format branch below (P1/P2, format-08 segments, and the 06/07 body
            fallback). Rendered only when the writer produced one, so hook-off
            cards look exactly as they do today. This card is shared by BOTH the
            wide and the narrow panel (DocBody), so there is one copy to keep. */}
        {script.hook ? (
          <section
            className="rounded-md border border-border/60 bg-card/50 p-3"
            data-testid="docs-script-hook"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                Hook
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">Spoken first</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
                {segmentWordCount(script.hook)} words
              </span>
            </div>
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{script.hook}</p>
          </section>
        ) : null}
        {script.segments && script.segments.length > 0 ? (
          // Format-08 (Classic UGC 4-18 min): labeled HOOK / MODULE n / REVEAL
          // segment list — same presentation as the P1/M1/M2/P2 sections below.
          <>
            {script.segments.map((sg, sgIdx) => (
              <section
                key={`${sg.label}-${sgIdx}`}
                className="rounded-md border border-border/60 bg-card/50 p-3"
                data-testid={`docs-script-segment-${sgIdx}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                    {sg.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium truncate">
                    {sg.title || (sg.key === "reveal" ? "Holding product" : "Hands-free")}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
                    {segmentWordCount(sg.text)} words
                  </span>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{sg.text}</p>
              </section>
            ))}
          </>
        ) : script.p1 || script.p2 ? (
          <>
            {script.p1 && (
              <section
                className="rounded-md border border-border/60 bg-card/50 p-3"
                data-testid="docs-script-p1"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                    P1
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">Hands-free</span>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{script.p1}</p>
              </section>
            )}
            {script.m1 && (
              <section
                className="rounded-md border border-border/60 bg-card/50 p-3"
                data-testid="docs-script-m1"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                    M1
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">Middle beat</span>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{script.m1}</p>
              </section>
            )}
            {script.m2 && (
              <section
                className="rounded-md border border-border/60 bg-card/50 p-3"
                data-testid="docs-script-m2"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                    M2
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">Middle beat</span>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{script.m2}</p>
              </section>
            )}
            {script.p2 && (
              <section
                className="rounded-md border border-border/60 bg-card/50 p-3"
                data-testid="docs-script-p2"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                    P2
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">Holding product</span>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{script.p2}</p>
              </section>
            )}
          </>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:font-semibold">
            {detectFormat(script.body) === "01" ? (
              // Comparison (Format 01) body: walk the image-card markers so
              // `{{image-card: top-5}}` / `{{image-card-end}}` render as inline
              // badges instead of literal text.
              <MarkdownWithImageCards text={script.body} />
            ) : (
              // Classic (Format 00) body: unchanged plain-markdown path.
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{script.body}</ReactMarkdown>
            )}
          </div>
        )}
      </div>

      {script.wordCount > 0 && (
        <div className="mt-3 text-[10.5px] text-muted-foreground/70 tabular-nums">
          {script.wordCount} words
        </div>
      )}
    </article>
  );
}

/* --------------------------- TSL-style intro --------------------------- */

function DocIntro({ doc, productLabel, videoFormat }: { doc: ParsedDoc; productLabel: string | undefined; videoFormat?: string }) {
  if (doc.scripts.length === 0) return null;
  const total = doc.scripts.length;
  // No-Product formats (06/07) are ONE hands-free take — the product is never
  // shown, so the Classic "P1 hands-free · P2 holding bottle" descriptor is
  // wrong here. Override the Format / beats rows from the format label.
  const isNoProduct = /no-?product/i.test(videoFormat || "");
  const isPureTalk = /pure\s*talk/i.test(videoFormat || "");
  const formatValue = isNoProduct
    ? `${videoFormat} — single hands-free take, product never shown`
    : doc.meta.format;
  const beatsValue = isNoProduct
    ? (isPureTalk
        ? "single hands-free take · education only (no brand / offer / CTA)"
        : "single hands-free take · spoken brand + 50% off + CTA")
    : doc.meta.beats;
  const rows: { label: string; value: string }[] = [];
  if (productLabel) rows.push({ label: "Brand", value: productLabel });
  rows.push({ label: "Format", value: formatValue });
  if (doc.meta.angleSummary) rows.push({ label: "Angle", value: doc.meta.angleSummary });
  if (doc.meta.archetypes.length > 0) {
    rows.push({ label: "Archetype", value: doc.meta.archetypes.join(", ") });
  }
  rows.push({ label: "Scripts", value: `${total} · ${beatsValue}` });
  if (doc.meta.wordCountRange) rows.push({ label: "Word count", value: doc.meta.wordCountRange });
  if (doc.meta.awarenessLevel) rows.push({ label: "Awareness level", value: doc.meta.awarenessLevel });
  return (
    <section className="rounded-lg border border-border bg-background px-4 py-3.5" data-testid="docs-intro">
      <h2 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Brief
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        {rows.map((r) => (
          <Fragment key={r.label}>
            <dt className="text-muted-foreground font-medium">{r.label}</dt>
            <dd className="text-foreground">{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/* ----------------------- Format 02 body renderer ----------------------- */

/** "Brief" block for a Format-02 script — the same TSL-style metadata table
 *  Classic scripts get via DocIntro, populated from the parse + the
 *  `===META===` block (sub_angle / avatar_types / persona / inspo_ad_ids). */
function Format2Brief({
  parsed,
  rawText,
  productLabel,
}: {
  parsed: ParsedFormat2Script;
  rawText: string;
  productLabel?: string;
}) {
  const rows: { label: string; value: string }[] = [];
  if (productLabel) rows.push({ label: "Brand", value: productLabel });
  rows.push({ label: "Format", value: "Unique Intro (3-section)" });
  const subAngle = readMetaBlockValue(rawText, "sub_angle");
  if (subAngle) rows.push({ label: "Angle", value: prettyAngle(subAngle) });
  const avatars = readMetaBlockValue(rawText, "avatar_types");
  if (avatars) {
    rows.push({
      label: "Avatar",
      value: avatars.split(/[,\s]+/).filter(Boolean).join(", "),
    });
  }
  const persona = readMetaBlockValue(rawText, "persona");
  if (persona) rows.push({ label: "Persona", value: persona });
  rows.push({
    label: "Sections",
    value: `${parsed.sections.length} · Advanced Intro → Body → Reveal`,
  });
  const words = format2ToPlain(parsed).split(/\s+/).filter(Boolean).length;
  if (words > 0) rows.push({ label: "Word count", value: `${words} words` });
  const inspo = readMetaBlockValue(rawText, "inspo_ad_ids");
  if (inspo) {
    rows.push({
      label: "Inspiration",
      value: inspo.split(/[,\s]+/).filter(Boolean).join(", "),
    });
  }
  rows.push({ label: "Awareness level", value: "Problem-aware" });
  return (
    <section
      className="rounded-lg border border-border bg-background px-4 py-3.5"
      data-testid="docs-format-2-brief"
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Brief
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        {rows.map((r) => (
          <Fragment key={r.label}>
            <dt className="text-muted-foreground font-medium">{r.label}</dt>
            <dd className="text-foreground">{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/** Renders a Format 02a/02b ("unique-intro") script as 3 side-by-side
 *  sections (Advanced Intro / No-Product Body / Product Reveal). Falls
 *  back gracefully if the model emitted a partial structure. */
function Format2Body({
  parsed,
  rawText,
  productLabel,
  onRegenerateIntro,
}: {
  parsed: ParsedFormat2Script;
  rawText: string;
  productLabel?: string;
  /** Forwarded to every ScriptSection. ScriptSection only renders the
   *  "Regenerate intro" button inside its Advanced-Intro branch, so passing
   *  this to all sections is safe — non-intro sections silently ignore it. */
  onRegenerateIntro?: () => void;
}) {
  // Only render the preface block when it has real visible text — markdown
  // syntax / HTML comments / whitespace alone would otherwise paint an empty
  // bordered box above §1.
  const prefaceText = (parsed.preface || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[#>*_`~\-]/g, "")
    .trim();
  return (
    <div className="px-4 py-5 space-y-4">
      {/* <Format2Brief parsed={parsed} rawText={rawText} productLabel={productLabel} /> */}
      <header
        className="rounded-lg border border-border bg-background px-4 py-3"
        data-testid="docs-format-2-header"
      >
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
          Format 02 · Unique Intro
        </div>
        <div className="text-[12.5px] text-foreground/85 leading-snug">
          3-section script ({parsed.sections.length} section{parsed.sections.length === 1 ? "" : "s"} parsed)
          {productLabel ? ` · ${productLabel}` : ""}
        </div>
      </header>
      {prefaceText && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-[12.5px] leading-relaxed text-muted-foreground border border-border rounded-md bg-muted/30 px-3 py-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.preface}</ReactMarkdown>
        </div>
      )}
      {parsed.sections.map((s, i) => (
        <ScriptSection
          key={`${s.heading}-${i}`}
          section={s}
          index={i}
          onRegenerateIntro={onRegenerateIntro}
        />
      ))}
    </div>
  );
}

/* ------------------------------- doc body ------------------------------- */

function DocBody({
  doc,
  generating,
  productLabel,
  selectedScripts,
  onToggleScript,
  detectedFormat,
  rawText,
  onRegenerateIntro,
  videoFormat,
}: {
  doc: ParsedDoc;
  generating: boolean;
  productLabel?: string;
  selectedScripts?: Set<string>;
  onToggleScript?: (key: string) => void;
  detectedFormat: DetectedFormat;
  rawText: string;
  onRegenerateIntro?: () => void;
  videoFormat?: string;
}) {
  // Format-specific branch BEFORE the default Format-00 path. Parse the raw
  // text with the Format-02 parser; if it returns null we transparently fall
  // through to the Classic rendering below.
  if (!generating && detectedFormat === "02") {
    const parsed = parseFormat2Script(rawText);
    if (parsed && parsed.sections.length >= 2) {
      return (
        <Format2Body
          parsed={parsed}
          rawText={rawText}
          productLabel={productLabel}
          onRegenerateIntro={onRegenerateIntro}
        />
      );
    }
  }
  if (doc.scripts.length === 0 && generating) {
    return (
      <div className="px-4 py-6 space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="h-4 w-1/2 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer" />
            <ShimmerLines count={4} />
          </div>
        ))}
      </div>
    );
  }
  if (doc.scripts.length === 0 && !generating) {
    if (!doc.preface || !doc.preface.trim()) {
      return (
        <div className="px-6 py-10 text-center">
          <div className="text-[12px] text-muted-foreground/70 max-w-xs mx-auto leading-relaxed">
            No scripts in this chat yet. Once you ask for one, it'll appear here —
            and your build reports for this chat will stay pinned to the top.
          </div>
        </div>
      );
    }
    return (
      <div className="px-4 py-6">
        <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.preface}</ReactMarkdown>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 py-5 space-y-6">
      <DocIntro doc={doc} productLabel={productLabel} videoFormat={videoFormat} />
      {/* Format-05 duration banner (lives in the preface). Shown as its own line
          so it stays visible without hijacking the per-script title. */}
      {/Random duration/i.test(doc.preface || "") && (
        <div
          className="text-[12px] font-medium text-muted-foreground/90"
          data-testid="docs-duration-banner"
        >
          {doc.preface.replace(/\*\*/g, "").trim()}
        </div>
      )}
      {doc.byAngle.map((group) => (
        <section key={group.angle} data-testid={`docs-angle-section-${group.angle}`}>
          <header className="flex items-baseline justify-between mb-2 sticky top-0 bg-muted/40 backdrop-blur-sm rounded-md px-2.5 py-1.5">
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-foreground/80">
              {group.angleLabel}
            </h2>
            <span className="text-[10.5px] text-muted-foreground tabular-nums">
              {group.count} {group.count === 1 ? "script" : "scripts"}
            </span>
          </header>
          <div className="space-y-3">
            {group.scripts.map((sc) => {
              const key = scriptKey(sc);
              // Derive a clean display title from the preface (single-script docs only).
              // Strip markdown bold, "Script." prefix, word-count token (~155w), and trailing dot.
              // The format-05 duration banner lives in the preface but must NOT
              // become the title (the **Concept:** angle is the title). Render it
              // separately below instead.
              const prefaceIsBanner = /Random duration/i.test(doc.preface || "");
              const prefaceLabel = doc.scripts.length === 1 && doc.preface && !prefaceIsBanner
                ? doc.preface
                    .replace(/\*\*([^*]+)\*\*/g, "$1")
                    .replace(/^Script\.\s*/i, "")
                    .replace(/\s*~\d+w\.?/gi, "")
                    .replace(/\.\s*$/, "")
                    .trim() || undefined
                : undefined;
              return (
                <ScriptCard
                  key={key}
                  script={sc}
                  numberInDoc={sc.index + 1}
                  totalInDoc={doc.scripts.length}
                  conceptLabel={prefaceLabel}
                  selected={selectedScripts?.has(key)}
                  onToggleSelect={onToggleScript ? () => onToggleScript(key) : undefined}
                />
              );
            })}
          </div>
        </section>
      ))}
      {generating && (
        <div className="rounded-lg border border-dashed border-border bg-background p-4 space-y-3">
          <div className="text-[11px] text-muted-foreground">Writing the next script…</div>
          <ShimmerLines count={3} />
        </div>
      )}
    </div>
  );
}

/* --------------------------- formatting helpers --------------------------- */

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/`([^`]+)`/g, "$1");
}

function wrapInRichHtml(innerHtml: string): string {
  const cleaned = innerHtml.replace(/<span[^>]*animate-pulse[^>]*><\/span>/g, "");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; }
h1 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; }
h2 { font-size: 1.25em; font-weight: 700; margin: 1em 0 0.5em; }
h3 { font-size: 1.1em; font-weight: 700; margin: 1em 0 0.5em; }
p { margin: 0.6em 0; }
strong, b { font-weight: 700; }
em, i { font-style: italic; }
ul, ol { margin: 0.6em 0; padding-left: 1.6em; }
li { margin: 0.2em 0; }
blockquote { border-left: 3px solid #d4d4d8; padding-left: 0.8em; margin: 0.8em 0; color: #52525b; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f4f4f5; padding: 0.1em 0.3em; border-radius: 3px; }
hr { border: none; border-top: 1px solid #e4e4e7; margin: 1.2em 0; }
</style></head><body>${cleaned}</body></html>`;
}

function buildDocFullHtml(doc: ParsedDoc): { html: string; plain: string } {
  const summary = buildDocSummary(doc);
  const blocks: string[] = [];
  if (summary) blocks.push(`<h1>Scripts doc</h1><p><strong>${escapeHtml(summary)}</strong></p>`);
  for (const g of doc.byAngle) {
    blocks.push(`<h2>${escapeHtml(g.angleLabel)}</h2>`);
    for (const sc of g.scripts) {
      blocks.push(`<h3>${escapeHtml(sc.concept)}</h3>`);
      // Optional hook leads the doc copy, same order as the panel. No hook =>
      // nothing added, so hook-off docs copy exactly as before.
      if (sc.hook) blocks.push(`<p><strong>Hook</strong></p><p>${escapeHtml(sc.hook).replace(/\n/g, "<br/>")}</p>`);
      if (sc.p1 || sc.p2) {
        if (sc.p1) blocks.push(`<p><strong>P1</strong></p><p>${escapeHtml(sc.p1).replace(/\n/g, "<br/>")}</p>`);
        if (sc.p2) blocks.push(`<p><strong>P2</strong></p><p>${escapeHtml(sc.p2).replace(/\n/g, "<br/>")}</p>`);
      } else {
        blocks.push(mdToSimpleHtml(sc.body.replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s*\*?\*?\s*Meta\b[\s\S]*/i, "")));
      }
    }
  }
  const html = wrapInRichHtml(blocks.join("\n"));
  const plainBlocks: string[] = [];
  if (summary) plainBlocks.push(`Scripts doc — ${summary}\n`);
  for (const g of doc.byAngle) {
    plainBlocks.push(`\n=== ${g.angleLabel} (${g.count}) ===\n`);
    for (const sc of g.scripts) {
      plainBlocks.push(`\n--- Concept: ${sc.concept} ---\n`);
      if (sc.hook) plainBlocks.push(`\nHook\n\n${sc.hook}\n`);
      if (sc.p1 || sc.p2) {
        if (sc.p1) plainBlocks.push(`\nP1\n\n${sc.p1}\n`);
        if (sc.p2) plainBlocks.push(`\nP2\n\n${sc.p2}\n`);
      } else {
        const cleanBody = sc.body.replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s*\*?\*?\s*Meta\b[\s\S]*/i, "");
        plainBlocks.push(stripMarkdown(cleanBody));
      }
      plainBlocks.push("\n");
    }
  }
  return { html, plain: plainBlocks.join("\n") };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mdToSimpleHtml(md: string): string {
  const escaped = escapeHtml(md);
  const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const paras = withBold.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
  return paras.join("\n");
}

/* ----------------------- merge helper ----------------------- */

function buildMergedDoc(messages: LocalMessage[], fallback: LocalMessage | undefined): ParsedDoc {
  const sources = messages && messages.length > 0 ? messages : (fallback ? [fallback] : []);
  if (sources.length === 0) return parseScriptDoc("");
  if (sources.length === 1) return parseScriptDoc(sources[0].content || "");
  const allScripts: ParsedScript[] = [];
  let preface = "";
  for (const msg of sources) {
    const d = parseScriptDoc(msg.content || "");
    if (!preface && d.preface) preface = d.preface;
    for (const sc of d.scripts) {
      allScripts.push({ ...sc, index: allScripts.length });
    }
  }
  const byAngleMap = new Map<string, { angle: string; angleLabel: string; scripts: ParsedScript[] }>();
  for (const sc of allScripts) {
    const k = sc.angle || "other";
    if (!byAngleMap.has(k)) byAngleMap.set(k, { angle: sc.angle, angleLabel: sc.angleLabel, scripts: [] });
    byAngleMap.get(k)!.scripts.push(sc);
  }
  const byAngle = Array.from(byAngleMap.values()).map((g) => ({ ...g, count: g.scripts.length }));
  const angleSummary = byAngle.map((g) => g.angleLabel).join(" · ");
  const archetypeSet = new Set<string>();
  for (const sc of allScripts) { const m = sc.concept.match(/\bA[1-9]\b/); if (m) archetypeSet.add(m[0]); }
  const wcs = allScripts.map((s) => s.wordCount).filter((w) => w > 0);
  const wordCountRange = wcs.length === 0 ? "" : (() => {
    const mn = Math.min(...wcs), mx = Math.max(...wcs);
    return mn === mx ? `${mn} words` : `${mn}–${mx} words`;
  })();
  const { format, beats } = describeClassicFormat(allScripts);
  return {
    preface,
    scripts: allScripts,
    byAngle,
    meta: {
      angleSummary,
      archetypes: Array.from(archetypeSet),
      format,
      beats,
      wordCountRange,
      awarenessLevel: "",
    },
  };
}

/* --------------------------- main panel export --------------------------- */

// Format 03 — Pixar storyboard renderer (ported from the reference bench).
// Renders the meta header + scene cards (PixarScene). Replaces the classic
// scripts list in the side panel when the message is a Pixar storyboard.
function Format3Body({
  parsed,
  productLabel,
  headerLabel,
  onBuildUgc,
}: {
  parsed: ParsedFormat3Script;
  productLabel?: string;
  headerLabel?: string;
  onBuildUgc?: () => void;
}) {
  const metaRows: Array<{ label: string; value: string }> = [];
  // Full cast roster (Pixar law P17) — "Main character", "Character 1", … Each
  // entry already starts with "Name: …". When the roster is present it covers
  // the protagonist, so the standalone main_character row is omitted to avoid a
  // duplicate. Falls back to the legacy single main_character row otherwise.
  if (parsed.meta.characters && parsed.meta.characters.length > 0) {
    for (const c of parsed.meta.characters) metaRows.push({ label: c.label, value: c.value });
  } else if (parsed.meta.mainCharacter) {
    metaRows.push({ label: "Main character", value: parsed.meta.mainCharacter });
  }
  if (parsed.meta.mainPain) metaRows.push({ label: "Main pain", value: parsed.meta.mainPain });
  if (parsed.meta.chosenStorylinePattern)
    metaRows.push({ label: "Storyline pattern", value: parsed.meta.chosenStorylinePattern });
  const baseLabel = headerLabel ?? "Format 03 · Pixar-style video ads";
  return (
    <div className="px-4 py-5 space-y-4">
      {onBuildUgc && (
        <button
          type="button"
          onClick={onBuildUgc}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 text-[12.5px] font-semibold transition-opacity shadow-sm"
          data-testid="pixar-build-ugc"
          title="Open the Build UGC workspace for this storyboard"
        >
          <Clapperboard className="size-4" />
          Build UGC
        </button>
      )}
      <header
        className="rounded-lg border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card px-4 py-3"
        data-testid="docs-format-3-header"
      >
        <div className="text-[10px] uppercase tracking-wider font-semibold text-primary mb-1.5">
          {baseLabel} · {parsed.scenes.length} scene{parsed.scenes.length === 1 ? "" : "s"}
          {productLabel ? ` · ${productLabel}` : ""}
        </div>
        {metaRows.length === 0 ? (
          <p className="text-[11.5px] italic text-muted-foreground/70">
            (meta block missing — model didn't declare main_character / main_pain / storyline_pattern)
          </p>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            {metaRows.map((r) => (
              <Fragment key={r.label}>
                <dt className="text-muted-foreground font-medium">{r.label}</dt>
                <dd className="text-foreground/90">{r.value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </header>
      {parsed.preface && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-[12.5px] leading-relaxed text-muted-foreground border border-border rounded-md bg-muted/30 px-3 py-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.preface}</ReactMarkdown>
        </div>
      )}
      <div className="space-y-4">
        {parsed.scenes.map((sc) => (
          <PixarScene key={sc.sceneNumber} scene={sc} />
        ))}
      </div>
    </div>
  );
}

// Format 04 — Animated Characters. Per-role colour styling so the cast reads at
// a glance (villain / failed-solution / ingredient / symptom / brand). Returns
// full literal class strings so Tailwind's JIT picks them up.
function animatedRoleStyle(role?: string): { label: string; pill: string; accent: string } {
  const r = (role || "").toLowerCase().replace(/[_\s]+/g, "-");
  const label = role
    ? role.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Character";
  if (r.includes("villain"))
    return { label, pill: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30", accent: "border-l-rose-500/70" };
  if (r.includes("failed"))
    return { label, pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", accent: "border-l-amber-500/70" };
  if (r.includes("symptom"))
    return { label, pill: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30", accent: "border-l-violet-500/70" };
  if (r === "brand" || r.includes("brand"))
    return { label, pill: "bg-primary/15 text-primary border-primary/30", accent: "border-l-primary/70" };
  if (r.includes("ingredient") || r.includes("hero"))
    return { label, pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", accent: "border-l-emerald-500/70" };
  return { label, pill: "bg-muted text-muted-foreground border-border", accent: "border-l-border" };
}

// Renders one card per animated character: the spoken voice line (the hero —
// full width, quoted), the DERIVED Voice/Tone (from the character's role), then
// the character + description and the scene/visual. Stacked vertically so the
// script isn't crushed into a sliver inside the narrow side panel.
function AnimatedCharacterCard({
  ch,
  index,
}: {
  ch: ParsedAnimatedCharsScript["characters"][number];
  index: number;
}) {
  const idLabel = ch.characterId ?? index + 1;
  const role = animatedRoleStyle(ch.role);
  const hasNotes = !!(ch.characterConcept.trim() || ch.firstFramePrompt.trim() || ch.visual.trim());
  return (
    <article
      className={`rounded-xl border border-border border-l-[3px] ${role.accent} bg-background overflow-hidden shadow-sm`}
      data-testid={`animated-char-${idLabel}`}
    >
      <header className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/60 bg-muted/30">
        <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold tabular-nums size-5 leading-none">
          {idLabel}
        </span>
        {ch.role && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${role.pill}`}>
            {role.label}
          </span>
        )}
        {ch.durationS && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 tabular-nums">
            <Clock className="size-3" />
            {ch.durationS}s
          </span>
        )}
      </header>

      <div className="p-3.5 space-y-3">
        <div data-testid={`animated-char-${idLabel}-spoken`}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-1.5">
            Spoken line
          </div>
          {ch.spokenLine && ch.spokenLine.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none border-l-2 border-primary/30 pl-3 text-[14px] leading-relaxed font-medium text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{ch.spokenLine}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-[11.5px] italic text-muted-foreground/60">No spoken line supplied.</p>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
          <span className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
            <Mic className="size-3" />
            Voice
          </span>
          <span className="text-[12px] leading-snug text-foreground/85">{ch.voiceTone}</span>
        </div>

        {hasNotes && (
          <div className="border-t border-border/50 pt-3 space-y-2.5">
            {ch.characterConcept.trim() && (
              <div data-testid={`animated-char-${idLabel}-character`}>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-0.5">
                  Character
                </div>
                <p className="text-[12.5px] leading-snug text-foreground/90 whitespace-pre-wrap">{ch.characterConcept}</p>
              </div>
            )}
            {ch.firstFramePrompt.trim() && (
              <div data-testid={`animated-char-${idLabel}-first-frame`}>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-0.5">
                  First frame · image
                </div>
                <p className="text-[12.5px] leading-snug text-foreground/80 whitespace-pre-wrap">{ch.firstFramePrompt}</p>
              </div>
            )}
            {ch.visual.trim() && (
              <div data-testid={`animated-char-${idLabel}-visual`}>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-0.5">
                  Motion · video
                </div>
                <p className="text-[12.5px] leading-snug text-foreground/80 whitespace-pre-wrap">{ch.visual}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function FormatAnimatedBody({
  parsed,
  productLabel,
  headerLabel,
  onBuildVideo,
}: {
  parsed: ParsedAnimatedCharsScript;
  productLabel?: string;
  headerLabel?: string;
  onBuildVideo?: () => void;
}) {
  const baseLabel = headerLabel ?? "Animated Characters";
  const chips: Array<{ label: string; value: string }> = [];
  if (parsed.meta.chosenFramework) chips.push({ label: "Framework", value: parsed.meta.chosenFramework });
  if (parsed.meta.characterCount) chips.push({ label: "Cast", value: parsed.meta.characterCount });
  if (parsed.meta.estimatedSeconds) chips.push({ label: "~Sec", value: parsed.meta.estimatedSeconds });
  if (parsed.meta.totalSpokenWords) chips.push({ label: "Words", value: parsed.meta.totalSpokenWords });
  return (
    <div className="px-4 py-5 space-y-4">
      {onBuildVideo && (
        <button
          type="button"
          onClick={onBuildVideo}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 text-[12.5px] font-semibold transition-opacity shadow-sm"
          data-testid="docs-build-video"
          title="Open the Build Video workspace for this storyboard"
        >
          <Clapperboard className="size-4" />
          Build Video
        </button>
      )}
      <header
        className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card px-4 py-3.5"
        data-testid="docs-format-4-header"
      >
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-primary mb-2">
          <Sparkles className="size-3.5" />
          Format 04 · {baseLabel}
          <span className="text-muted-foreground font-medium normal-case tracking-normal">
            · {parsed.characters.length} character{parsed.characters.length === 1 ? "" : "s"}
            {productLabel ? ` · ${productLabel}` : ""}
          </span>
        </div>
        {parsed.meta.mainPain && (
          <p className="text-[13px] font-medium text-foreground/90 mb-2">{parsed.meta.mainPain}</p>
        )}
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5 text-[11px]"
              >
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-semibold text-foreground/90">{c.value}</span>
              </span>
            ))}
          </div>
        ) : (
          !parsed.meta.mainPain && (
            <p className="text-[11.5px] italic text-muted-foreground/70">
              (meta block missing — model didn't declare chosen_framework / main_pain / character_count)
            </p>
          )
        )}
      </header>

      <div
        className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5"
        data-testid="docs-format-4-music"
      >
        <Music className="size-3.5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
            Background music · sound
          </div>
          <p className="text-[12px] leading-snug text-foreground/85">{parsed.musicDirection}</p>
        </div>
      </div>

      {parsed.scriptPlan.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5" data-testid="docs-format-4-plan">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-2">
            Story arc
          </div>
          <ol className="space-y-1.5">
            {parsed.scriptPlan.map((p, i) => {
              const rs = animatedRoleStyle(p.role);
              return (
                <li key={p.characterId ?? i} className="flex items-start gap-2 text-[12px] leading-snug">
                  <span className="inline-flex items-center justify-center size-4 rounded bg-muted text-[10px] font-bold text-muted-foreground tabular-nums shrink-0 mt-0.5">
                    {p.characterId ?? i + 1}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-1.5 text-[9.5px] font-semibold uppercase tracking-wide shrink-0 mt-0.5 ${rs.pill}`}>
                    {rs.label}
                  </span>
                  <span className="text-foreground/85">
                    {p.identifier && <span className="font-medium">{p.identifier}</span>}
                    {p.setsUp ? (
                      <span className="text-muted-foreground">
                        {p.identifier ? " — " : ""}
                        {p.setsUp}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="space-y-3.5">
        {parsed.characters.map((ch, i) => (
          <AnimatedCharacterCard key={ch.characterId ?? i} ch={ch} index={i} />
        ))}
      </div>
    </div>
  );
}

export function DocsPanel({
  message,
  allScriptedMessages,
  open,
  onClose,
  productLabel,
  productSlug,
  videoFormat,
  chatId,
  onRegenerateIntro,
  onBuildUgc,
  onBuildVideo,
}: DocsPanelProps) {
  const navigate = useNavigate();
  const [copiedAll, setCopiedAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const doc = useMemo<ParsedDoc>(
    () => buildMergedDoc(allScriptedMessages || [], message),
    [allScriptedMessages, message],
  );
  const generating = !!message?.streaming;
  const rawText = message?.content || "";
  const detectedFormat = useMemo<DetectedFormat>(
    () => detectFormat(rawText),
    [rawText],
  );

  // Format 03 — Pixar storyboard. When the latest message is a Pixar
  // storyboard we render the dedicated scene-card view (Format3Body) instead
  // of the classic scripts list. Parsed only when not streaming so partial
  // YAML doesn't flicker mid-generation.
  const pixarParsed = useMemo<ParsedFormat3Script | null>(() => {
    const content = message?.content || "";
    if (generating || !isPixarStoryboard(content)) return null;
    return parseFormat3Script(content);
  }, [message?.content, generating]);
  // Format 04 — Animated Characters: checked BEFORE Pixar so a 04 storyboard
  // routes to its own card view and never falls through to the Pixar branch.
  const animatedParsed = useMemo<ParsedAnimatedCharsScript | null>(() => {
    const content = message?.content || "";
    if (generating || !isAnimatedCharsStoryboard(content)) return null;
    return parseAnimatedCharsScript(content);
  }, [message?.content, generating]);

  useEffect(() => {
    setSelected(new Set());
  }, [message?.id]);

  const allKeys = useMemo(() => doc.scripts.map(scriptKey), [doc.scripts]);
  const toggleScript = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === allKeys.length ? new Set() : new Set(allKeys)));
  };
  const buildSelected = () => {
    if (!onBuildUgc) return;
    const picked: Parameters<NonNullable<typeof onBuildUgc>>[0] = [];
    for (const sc of doc.scripts) {
      if (selected.has(scriptKey(sc))) {
        const plain = scriptToPlain(sc);
        if (plain.trim().length < 20) continue;
        picked.push({
          title: `${sc.angleCode || sc.angleLabel || "Script"} — ${(sc.description || sc.concept || "").slice(0, 80)}`,
          plain,
          concept: sc.concept || sc.description || "",
          angle: sc.angle,
          angleLabel: sc.angleLabel,
          angleCode: sc.angleCode,
          description: sc.description,
          // Optional spoken hook — "" / undefined for every hook-off script, in
          // which case BatchCreator leaves its hook fields at their OFF defaults.
          hook: sc.hook,
          p1: sc.p1,
          p2: sc.p2,
          // Format-05 middle beats — empty strings for 60s scripts (BatchCreator
          // treats undefined and "" the same way, so this is back-compat).
          m1: sc.m1,
          m2: sc.m2,
          // Format-08 ordered HOOK / MODULE n / REVEAL segments — undefined
          // for every other format.
          segments: sc.segments,
          avatarTypes: sc.avatarTypes,
          suggestedPersona: sc.suggestedPersona,
          suggestedSubAngle: sc.suggestedSubAngle,
          inspiredByAdIds: sc.inspiredByAdIds,
        });
      }
    }
    onBuildUgc(picked);
  };

  // Format-02 scripts yield 0 ParsedScripts, so they're surfaced as a single
  // selectable unit (the displayed script) with its own select-all + build.
  const format2 = useMemo<ParsedFormat2Script | null>(
    () => (detectedFormat === "02" ? parseFormat2Script(rawText) : null),
    [detectedFormat, rawText],
  );
  const isFormat2 = !!(format2 && format2.sections.length >= 2);
  const format2Selected = selected.has(FORMAT2_SEL_KEY);
  const toggleFormat2 = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(FORMAT2_SEL_KEY)) next.delete(FORMAT2_SEL_KEY);
      else next.add(FORMAT2_SEL_KEY);
      return next;
    });
  };
  const buildFormat2 = () => {
    if (!onBuildUgc || !format2 || !format2Selected) return;
    onBuildUgc([buildFormat2Picked(rawText, format2)]);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copyAll = async () => {
    if (doc.scripts.length === 0) return;
    const { html, plain } = buildDocFullHtml(doc);
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <aside
      className="flex flex-1 min-w-0 flex-col h-full bg-muted/20"
      data-testid="docs-panel"
      aria-label="Scripts doc"
    >
      <PanelHeader
        doc={doc}
        generating={generating}
        startedAt={message?.startedAt}
        finishedAt={message?.finishedAt}
        onClose={onClose}
        onCopyAll={copyAll}
        copiedAll={copiedAll}
      />
      {onBuildUgc && doc.scripts.length > 0 && (
        <SelectionToolbar
          totalScripts={doc.scripts.length}
          selectedCount={selected.size}
          onToggleAll={toggleAll}
          onBuild={buildSelected}
        />
      )}
      {onBuildUgc && doc.scripts.length === 0 && isFormat2 && (
        <SelectionToolbar
          totalScripts={1}
          selectedCount={format2Selected ? 1 : 0}
          onToggleAll={toggleFormat2}
          onBuild={buildFormat2}
        />
      )}
      {chatId && <BuildReportBar chatId={chatId} />}
      <div className="flex-1 overflow-y-auto" data-testid="docs-panel-body">
        {animatedParsed ? (
          <FormatAnimatedBody parsed={animatedParsed} productLabel={productLabel} onBuildVideo={onBuildVideo} />
        ) : pixarParsed ? (
          <Format3Body
            parsed={pixarParsed}
            productLabel={productLabel}
            onBuildUgc={() => {
              savePixarBuild({
                meta: pixarParsed.meta,
                scenes: pixarParsed.scenes,
                productLabel,
                productSlug,
                videoFormat,
                chatId,
              });
              navigate("/new-pixar-builder");
            }}
          />
        ) : (
          <DocBody
            doc={doc}
            generating={generating}
            productLabel={productLabel}
            selectedScripts={onBuildUgc ? selected : undefined}
            onToggleScript={onBuildUgc ? toggleScript : undefined}
            detectedFormat={detectedFormat}
            rawText={rawText}
            onRegenerateIntro={onRegenerateIntro}
            videoFormat={videoFormat}
          />
        )}
      </div>
    </aside>
  );
}

function SelectionToolbar({
  totalScripts, selectedCount, onToggleAll, onBuild,
}: {
  totalScripts: number;
  selectedCount: number;
  onToggleAll: () => void;
  onBuild: () => void;
}) {
  const allOn = selectedCount === totalScripts && totalScripts > 0;
  return (
    <div className="border-b border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleAll}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        data-testid="docs-toggle-all"
      >
        {allOn ? <CheckSquare className="size-3.5 text-primary" /> : <Square className="size-3.5" />}
        {allOn ? "Deselect all" : "Select all"}
      </button>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {selectedCount} / {totalScripts} selected
      </span>
      <button
        type="button"
        onClick={onBuild}
        disabled={selectedCount === 0}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 text-[11.5px] font-medium"
        data-testid="docs-build-ugc"
        title="Push selected scripts into the AI UGC builder"
      >
        <Video className="size-3.5" />
        Build {selectedCount > 0 ? `${selectedCount} script${selectedCount === 1 ? "" : "s"} ` : ""}as UGC ads
      </button>
    </div>
  );
}

function MessageHistoryBar({
  messages,
  selectedId,
  onSelect,
}: {
  messages: LocalMessage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const items = useMemo(() => {
    return messages.map((m, i) => {
      const doc = parseScriptDoc(m.content || "");
      const angleLabel =
        doc.byAngle[0]?.angleLabel
        || doc.scripts[0]?.angleLabel
        || "Scripts";
      const ts = m.finishedAt || m.startedAt;
      const tStr = ts ? fmtCETTime(ts) : "";
      return { id: m.id, idx: i + 1, angleLabel, scriptCount: doc.scripts.length, tStr };
    });
  }, [messages]);
  if (!messages.length) return null;
  const activeId = selectedId || messages[messages.length - 1].id;
  return (
    <div className="border-b border-border/40 bg-card/30 px-2 py-1.5 flex items-center gap-1 overflow-x-auto">
      <History className="size-3 text-muted-foreground/70 shrink-0 ml-1" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mr-1 shrink-0">
        Requests
      </span>
      <div className="flex items-center gap-1 overflow-x-auto">
        {items.map((it) => {
          const isActive = it.id === activeId;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className={`shrink-0 rounded-md px-2 py-1 text-[10.5px] font-medium border transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/50 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              title={`Request #${it.idx}${it.tStr ? ` · ${it.tStr}` : ""} · ${it.scriptCount} script${it.scriptCount === 1 ? "" : "s"}`}
            >
              <span className="tabular-nums">#{it.idx}</span>
              <span className="ml-1.5 text-muted-foreground/80 font-normal">{it.angleLabel}</span>
              <span className="ml-1.5 tabular-nums text-muted-foreground/60">{it.scriptCount}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ChatBuildRow = {
  id: string;
  concept: string | null;
  cs: string | null;
  funnel: string | null;
  status: "pending" | "running" | "completed" | "failed";
  scripts_json: string | null;
  avatar_ids_json: string | null;
  lineage_json: string | null;
  started_at: number;
  finished_at: number | null;
};

function BuildReportBar({ chatId }: { chatId: string }) {
  const navigate = useNavigate();
  const buildsQ = useQuery<ChatBuildRow[]>({
    queryKey: ["/api/ugc-builds", chatId],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_jwt_token") : null;
      const r = await fetch(`${API_BASE}/api/ugc-builds?chatId=${encodeURIComponent(chatId)}`, {
        headers: { Authorization: `Bearer ${token || ""}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const json = await r.json();
      return json.builds ?? [];
    },
    refetchInterval: (q) => {
      const rows = q?.state?.data as ChatBuildRow[] | undefined;
      if (!rows || rows.length === 0) return 8000;
      return rows.some((b) => b.status === "pending" || b.status === "running") ? 3500 : false;
    },
    refetchOnWindowFocus: true,
  });
  const builds = buildsQ.data || [];
  const latest = builds[0];
  const stats = useMemo(() => {
    if (!latest) return { ads: 0, videos: 0, ok: 0, pendingApproval: 0, launched: 0, rejected: 0 };
    const lineage = (() => {
      try { return JSON.parse(latest.lineage_json || "[]") as any[]; } catch { return [] as any[]; }
    })();
    const ads = lineage.length || (() => {
      try { return JSON.parse(latest.scripts_json || "[]").length; } catch { return 0; }
    })();
    let videos = 0, ok = 0;
    let pendingApproval = 0, launched = 0, rejected = 0;
    for (const l of lineage) {
      const jobs = l?.avatar_jobs || [];
      videos += jobs.length;
      ok += jobs.filter((j: any) => j.ok).length;
      const a = l?.approval_status;
      if (a === "pending_approval") pendingApproval++;
      else if (a === "launched") launched++;
      else if (a === "rejected") rejected++;
    }
    return { ads, videos, ok, pendingApproval, launched, rejected };
  }, [latest]);
  if (builds.length === 0 || !latest) return null;
  const isLive = latest.status === "running" || latest.status === "pending";
  return (
    <div className="border-b border-border/40 bg-gradient-to-br from-primary/10 via-card/40 to-card/20 px-3.5 py-2.5 relative overflow-hidden">
      <div className="absolute -top-12 -right-8 size-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="size-3 text-primary/80" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/90">Latest build report</span>
          <span className="text-[10.5px] text-muted-foreground/70 tabular-nums ml-auto">
            {fmtCETTime(latest.started_at)}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <BuildStatusBadge status={latest.status} prominent />
          <span className="text-[13px] font-semibold text-foreground tracking-tight truncate" title={latest.concept || "Untitled"}>
            {latest.concept || "Untitled"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] text-foreground/80 tabular-nums">
            <span className="font-semibold text-foreground">{stats.ads}</span> ad{stats.ads === 1 ? "" : "s"}
            <span className="text-muted-foreground/50 mx-1.5">·</span>
            <span className="font-semibold text-foreground">{stats.videos}</span> video{stats.videos === 1 ? "" : "s"}
            {isLive && stats.videos > 0 && (
              <>
                <span className="text-muted-foreground/50 mx-1.5">·</span>
                <span className="text-emerald-400 font-semibold tabular-nums">{stats.ok}/{stats.videos}</span> rendered
              </>
            )}
          </span>
          {stats.pendingApproval > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-300 px-1.5 py-0.5 text-[10.5px] font-semibold">
              {stats.pendingApproval} need{stats.pendingApproval === 1 ? "s" : ""} approval
            </span>
          )}
          {stats.launched > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 text-[10.5px] font-semibold">
              {stats.launched} launched
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate(`/ugc-builder/builds/${latest.id}`)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/15 hover:border-primary/60 text-primary px-2.5 py-1 text-[11px] font-semibold transition-colors"
            data-testid="docs-open-build-report"
          >
            {stats.pendingApproval > 0 ? "Review + approve" : "Open report"}
            <ExternalLink className="size-2.5" />
          </button>
        </div>
      </div>
      {builds.length > 1 && (
        <details className="mt-1.5">
          <summary className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground cursor-pointer">
            {builds.length - 1} earlier build{builds.length - 1 === 1 ? "" : "s"} for this chat
          </summary>
          <ul className="mt-1 space-y-0.5">
            {builds.slice(1, 6).map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-[10.5px]">
                <BuildStatusBadge status={b.status} compact />
                <span className="truncate text-muted-foreground" title={b.concept || ""}>{b.concept || "Untitled"}</span>
                <span className="ml-auto text-muted-foreground/60 tabular-nums">
                  {fmtCET(b.started_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/ugc-builder/builds/${b.id}`)}
                  className="text-primary/80 hover:text-primary text-[10px]"
                >
                  open
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function BuildStatusBadge({ status, compact, prominent }: { status: ChatBuildRow["status"]; compact?: boolean; prominent?: boolean }) {
  const m: Record<ChatBuildRow["status"], { cls: string; promCls: string; label: string; promLabel: string; icon: (p: { className?: string }) => JSX.Element }> = {
    pending:   {
      cls: "bg-muted text-muted-foreground",
      promCls: "border border-muted-foreground/30 bg-muted text-muted-foreground",
      label: "Queued", promLabel: "Queued",
      icon: ({ className }) => <Clock className={className || "size-2.5"} />,
    },
    running:   {
      cls: "bg-amber-500/15 text-amber-400",
      promCls: "border border-amber-400/40 bg-amber-500/15 text-amber-300",
      label: "Generating", promLabel: "Generating",
      icon: ({ className }) => <Loader2 className={`${className || "size-2.5"} animate-spin`} />,
    },
    completed: {
      cls: "bg-emerald-500/15 text-emerald-400",
      promCls: "border border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
      label: "Done", promLabel: "Generated",
      icon: ({ className }) => <CheckCircle2 className={className || "size-2.5"} />,
    },
    failed:    {
      cls: "bg-destructive/15 text-destructive",
      promCls: "border border-destructive/40 bg-destructive/15 text-destructive",
      label: "Failed", promLabel: "Failed",
      icon: ({ className }) => <XCircle className={className || "size-2.5"} />,
    },
  };
  const e = m[status] || m.pending;
  if (prominent) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${e.promCls}`}>
        <e.icon className="size-3" />
        {e.promLabel}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${e.cls}`}>
      <e.icon className="size-2.5" />
      {compact ? null : e.label}
    </span>
  );
}

/* ------------------------------ mobile sheet ----------------------------- */

export function DocsPanelMobile({
  message,
  allScriptedMessages,
  open,
  onClose,
  productLabel,
  productSlug,
  videoFormat,
  chatId,
  onRegenerateIntro,
  onBuildUgc,
  onBuildVideo,
}: DocsPanelProps) {
  const navigate = useNavigate();
  const [copiedAll, setCopiedAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const doc = useMemo<ParsedDoc>(
    () => buildMergedDoc(allScriptedMessages || [], message),
    [allScriptedMessages, message],
  );
  const generating = !!message?.streaming;
  const pixarParsed = useMemo<ParsedFormat3Script | null>(() => {
    const content = message?.content || "";
    if (generating || !isPixarStoryboard(content)) return null;
    return parseFormat3Script(content);
  }, [message?.content, generating]);
  // Format 04 — Animated Characters: checked BEFORE Pixar so a 04 storyboard
  // routes to its own card view and never falls through to the Pixar branch.
  const animatedParsed = useMemo<ParsedAnimatedCharsScript | null>(() => {
    const content = message?.content || "";
    if (generating || !isAnimatedCharsStoryboard(content)) return null;
    return parseAnimatedCharsScript(content);
  }, [message?.content, generating]);
  const rawText = message?.content || "";
  const detectedFormat = useMemo<DetectedFormat>(
    () => detectFormat(rawText),
    [rawText],
  );
  useEffect(() => { setSelected(new Set()); }, [message?.id]);
  const allKeys = useMemo(() => doc.scripts.map(scriptKey), [doc.scripts]);
  const toggleScript = (key: string) => setSelected((p) => {
    const n = new Set(p);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const toggleAll = () => setSelected((p) => (p.size === allKeys.length ? new Set() : new Set(allKeys)));
  const buildSelected = () => {
    if (!onBuildUgc) return;
    const picked: Parameters<NonNullable<typeof onBuildUgc>>[0] = [];
    for (const sc of doc.scripts) {
      if (selected.has(scriptKey(sc))) {
        const plain = scriptToPlain(sc);
        if (plain.trim().length < 20) continue;
        picked.push({
          title: `${sc.angleCode || sc.angleLabel || "Script"} — ${(sc.description || sc.concept || "").slice(0, 80)}`,
          plain,
          concept: sc.concept || sc.description || "",
          angle: sc.angle,
          angleLabel: sc.angleLabel,
          angleCode: sc.angleCode,
          description: sc.description,
          // Optional spoken hook — "" / undefined for every hook-off script, in
          // which case BatchCreator leaves its hook fields at their OFF defaults.
          hook: sc.hook,
          p1: sc.p1,
          p2: sc.p2,
          // Format-05 middle beats — empty strings for 60s scripts (BatchCreator
          // treats undefined and "" the same way, so this is back-compat).
          m1: sc.m1,
          m2: sc.m2,
          // Format-08 ordered HOOK / MODULE n / REVEAL segments — undefined
          // for every other format.
          segments: sc.segments,
          avatarTypes: sc.avatarTypes,
          suggestedPersona: sc.suggestedPersona,
          suggestedSubAngle: sc.suggestedSubAngle,
          inspiredByAdIds: sc.inspiredByAdIds,
        });
      }
    }
    onBuildUgc(picked);
  };

  // Format-02 single-unit selection (mirrors the desktop panel).
  const format2 = useMemo<ParsedFormat2Script | null>(
    () => (detectedFormat === "02" ? parseFormat2Script(rawText) : null),
    [detectedFormat, rawText],
  );
  const isFormat2 = !!(format2 && format2.sections.length >= 2);
  const format2Selected = selected.has(FORMAT2_SEL_KEY);
  const toggleFormat2 = () => setSelected((p) => {
    const n = new Set(p);
    if (n.has(FORMAT2_SEL_KEY)) n.delete(FORMAT2_SEL_KEY);
    else n.add(FORMAT2_SEL_KEY);
    return n;
  });
  const buildFormat2 = () => {
    if (!onBuildUgc || !format2 || !format2Selected) return;
    onBuildUgc([buildFormat2Picked(rawText, format2)]);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copyAll = async () => {
    if (doc.scripts.length === 0) return;
    const { html, plain } = buildDocFullHtml(doc);
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-background flex flex-col"
      data-testid="docs-panel-mobile"
      role="dialog"
      aria-modal="true"
      aria-label="Scripts doc"
    >
      <PanelHeader
        doc={doc}
        generating={generating}
        startedAt={message?.startedAt}
        finishedAt={message?.finishedAt}
        onClose={onClose}
        onCopyAll={copyAll}
        copiedAll={copiedAll}
      />
      {onBuildUgc && doc.scripts.length > 0 && (
        <SelectionToolbar
          totalScripts={doc.scripts.length}
          selectedCount={selected.size}
          onToggleAll={toggleAll}
          onBuild={buildSelected}
        />
      )}
      {onBuildUgc && doc.scripts.length === 0 && isFormat2 && (
        <SelectionToolbar
          totalScripts={1}
          selectedCount={format2Selected ? 1 : 0}
          onToggleAll={toggleFormat2}
          onBuild={buildFormat2}
        />
      )}
      {chatId && <BuildReportBar chatId={chatId} />}
      <div className="flex-1 overflow-y-auto" data-testid="docs-panel-mobile-body">
        {animatedParsed ? (
          <FormatAnimatedBody parsed={animatedParsed} productLabel={productLabel} onBuildVideo={onBuildVideo} />
        ) : pixarParsed ? (
          <Format3Body
            parsed={pixarParsed}
            productLabel={productLabel}
            onBuildUgc={() => {
              savePixarBuild({
                meta: pixarParsed.meta,
                scenes: pixarParsed.scenes,
                productLabel,
                productSlug,
                videoFormat,
                chatId,
              });
              navigate("/new-pixar-builder");
            }}
          />
        ) : (
          <DocBody
            doc={doc}
            generating={generating}
            productLabel={productLabel}
            selectedScripts={onBuildUgc ? selected : undefined}
            onToggleScript={onBuildUgc ? toggleScript : undefined}
            detectedFormat={detectedFormat}
            rawText={rawText}
            onRegenerateIntro={onRegenerateIntro}
            videoFormat={videoFormat}
          />
        )}
      </div>
    </div>
  );
}
