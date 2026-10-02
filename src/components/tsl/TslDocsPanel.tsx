// TslDocsPanel.tsx
//
// TSL right-rail panel. Renders a single finished TSL generation with the
// Copy-ready script block and a history bar letting the user flip between
// earlier finished generations in the same chat.
//
// Two exports: <TslDocsPanel/> (desktop right-rail, lg:flex) and
// <TslDocsPanelMobile/> (full-screen sheet on <lg).
//
// Note: Push-to-Development button is added in T9 (a later task).

import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { X, FileText, Loader2, History, ArrowRightToLine } from "lucide-react";
import type { LocalMessage } from "@/lib/tslStreamStore";
import { parseTslResult, isFinishedTsl, isNonScriptResponse } from "@/lib/tslResult";
import { TslScriptBlock } from "@/components/tsl/TslScriptBlock";
import { Button } from "@/components/ui/button";

// Authority-score tone (mirrors the Script Bank badge scheme) — surfaced so the
// user can gauge the generated TSL's quality at a glance.
function authorityTone(score: number): "elite" | "strong" | "ok" | "weak" {
  if (score >= 90) return "elite";
  if (score >= 80) return "strong";
  if (score >= 65) return "ok";
  return "weak";
}
const AUTH_TONE_CLASS: Record<string, string> = {
  elite: "bg-emerald-600 text-white dark:bg-emerald-500",
  strong: "bg-primary text-primary-foreground",
  ok: "bg-amber-500 text-white",
  weak: "bg-muted text-muted-foreground",
};

type TslDocsPanelProps = {
  /** The active assistant message to render (may be undefined). */
  message: LocalMessage | undefined;
  /** All assistant messages in the chat that carry a finished TSL. Drives the
   *  history bar so older generations aren't clobbered by a newer one. */
  finishedMessages?: LocalMessage[];
  /** Controlled selector for which finished message is active. */
  selectedMessageId?: string | null;
  /** Notify the parent when the user clicks a history pill. */
  onSelectMessage?: (messageId: string) => void;
  open: boolean;
  onClose: () => void;
  /** Display label for the product, shown in the panel header. */
  productLabel?: string;
};

// ---------------------------------------------------------------------------
// Shared inner content (used by both desktop + mobile shells)
// ---------------------------------------------------------------------------

function PanelHeader({
  productLabel,
  generating,
  onClose,
  onPushToDevelopment,
  canPush,
  authorityScore,
}: {
  productLabel?: string;
  generating: boolean;
  onClose: () => void;
  onPushToDevelopment?: () => void;
  canPush?: boolean;
  authorityScore?: number | null;
}) {
  return (
    <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 bg-card/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="size-4 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-tight truncate">
            Final TSL
          </div>
          {productLabel && (
            <div className="text-[11px] text-muted-foreground truncate">{productLabel}</div>
          )}
        </div>
        {typeof authorityScore === "number" && (
          <span
            className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${AUTH_TONE_CLASS[authorityTone(authorityScore)]}`}
            title={
              authorityScore >= 80
                ? "Passed the authority gate (≥80)"
                : "Best of up to 6 attempts — below the 80 bar"
            }
            data-testid="authority-score-badge"
          >
            Authority {authorityScore}/100
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {canPush && onPushToDevelopment && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onPushToDevelopment}
            className="h-7 px-2.5 text-[12px] gap-1.5"
            data-testid="button-push-to-development"
          >
            <ArrowRightToLine className="size-3.5" />
            Push to Development
          </Button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
          aria-label="Close panel"
          data-testid="button-close-docs"
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  );
}

// Build the hover tooltip for a history pill: the authority score plus the
// per-lever subscore breakdown (so the user can see WHY one beats another).
function authorityTitle(
  genNum: number,
  score: number | undefined,
  subscores?: Record<string, number>,
): string {
  if (typeof score !== "number") return `Generation ${genNum}`;
  const head = `Generation ${genNum} · Authority ${score}/100`;
  if (!subscores || Object.keys(subscores).length === 0) return head;
  const lines = Object.entries(subscores)
    .map(([k, v]) => `  ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
  return `${head}\n${lines}`;
}

function HistoryBar({
  messages,
  selectedId,
  onSelect,
}: {
  messages: LocalMessage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Per-generation authority score + subscores, parsed from each message's
  // result envelope. Drives the per-pill score label and the "best" highlight.
  const authority = useMemo(
    () =>
      messages.map((m) => parseTslResult(m.content).trace?.authority),
    [messages],
  );
  // The single best generation (highest score; ties resolve to the latest).
  // Only meaningful when more than one generation actually carries a score.
  const bestIndex = useMemo(() => {
    let best = -1;
    let bestScore = -Infinity;
    let scored = 0;
    authority.forEach((a, i) => {
      if (typeof a?.score === "number") {
        scored++;
        if (a.score >= bestScore) {
          bestScore = a.score;
          best = i;
        }
      }
    });
    return scored > 1 ? best : -1;
  }, [authority]);

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-muted/20 overflow-x-auto shrink-0">
      <History className="size-3.5 text-muted-foreground/70 shrink-0" />
      {messages.map((m, i) => {
        const active = m.id === selectedId;
        const score = authority[i]?.score;
        const isBest = i === bestIndex;
        const pillClass = active
          ? `bg-primary text-primary-foreground${isBest ? " ring-2 ring-emerald-400/70" : ""}`
          : isBest
            ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
            : "bg-card border border-card-border text-muted-foreground hover:text-foreground";
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${pillClass}`}
            data-testid={`history-pill-${i}`}
            title={authorityTitle(i + 1, score, authority[i]?.subscores)}
          >
            <span>#{i + 1}</span>
            {typeof score === "number" && (
              <span className="tabular-nums opacity-80">· {score}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <Loader2 className="size-6 text-primary animate-spin" />
      <div className="text-[13px] font-medium text-foreground">Still tightening…</div>
      <p className="text-[12px] text-muted-foreground max-w-[260px] leading-relaxed">
        Building section-by-section against the format, then scoring it on the
        authority rubric. Only a winner gets surfaced.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
      <FileText className="size-7 text-muted-foreground/40" />
      <div className="text-[13px] font-medium text-foreground">No script yet</div>
      <p className="text-[12px] text-muted-foreground max-w-[260px] leading-relaxed">
        Generate a TSL from an angle and it'll appear here — copy-ready and
        Meta-formatted.
      </p>
    </div>
  );
}

function PanelBody({
  message,
  generating,
}: {
  message: LocalMessage | undefined;
  generating: boolean;
}) {
  const result = useMemo(() => parseTslResult(message?.content || ""), [message?.content]);

  if (generating) return <GeneratingState />;

  // Only a finished generation renders the script. Checkpoints, plain
  // answers, AND any `done` whose "script" is really a refusal/note live inline in
  // the chat — never in this panel.
  if (result.status !== "done" || !result.script || isNonScriptResponse(result.script)) {
    return <EmptyState />;
  }

  // The verification trace is intentionally NOT shown to the user —
  // the panel surfaces only the finished, copy-ready TSL.
  return (
    <div className="p-4 space-y-4" data-testid="docs-panel-content">
      <TslScriptBlock script={result.script} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop right-rail
// ---------------------------------------------------------------------------

export function TslDocsPanel({
  message,
  finishedMessages,
  selectedMessageId,
  onSelectMessage,
  open,
  onClose,
  productLabel,
}: TslDocsPanelProps) {
  const generating = !!message?.streaming;
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();

  const result = useMemo(() => parseTslResult(message?.content || ""), [message?.content]);
  const canPush = !!chatId && isFinishedTsl(message?.content);
  const authorityScore = isFinishedTsl(message?.content)
    ? result.trace?.authority?.score ?? null
    : null;

  function handlePushToDevelopment() {
    if (!chatId || !result.script) return;
    try {
      localStorage.setItem("tsl-v2:script-override:" + chatId, result.script);
    } catch (e) {
      toast.error("Could not hand off the script — storage blocked.");
      return;
    }
    navigate("/tsl-builder/develop/" + chatId);
  }

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      className="hidden lg:flex flex-col h-full shrink-0 border-l border-border bg-muted/20 animate-slide-in-right motion-reduce:animate-none w-[38vw] xl:w-[42vw] min-w-[420px] max-w-[760px]"
      data-testid="docs-panel"
      aria-label="Final TSL panel"
    >
      <PanelHeader
        productLabel={productLabel}
        generating={generating}
        onClose={onClose}
        onPushToDevelopment={handlePushToDevelopment}
        canPush={canPush}
        authorityScore={authorityScore}
      />
      {finishedMessages && finishedMessages.length > 1 && (
        <HistoryBar
          messages={finishedMessages}
          selectedId={selectedMessageId ?? message?.id ?? null}
          onSelect={(id) => onSelectMessage?.(id)}
        />
      )}
      <div className="flex-1 overflow-y-auto" data-testid="docs-panel-body">
        <PanelBody message={message} generating={generating} />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile full-screen sheet
// ---------------------------------------------------------------------------

export function TslDocsPanelMobile({
  message,
  finishedMessages,
  selectedMessageId,
  onSelectMessage,
  open,
  onClose,
  productLabel,
}: TslDocsPanelProps) {
  const generating = !!message?.streaming;
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();

  const result = useMemo(() => parseTslResult(message?.content || ""), [message?.content]);
  const canPush = !!chatId && isFinishedTsl(message?.content);
  const authorityScore = isFinishedTsl(message?.content)
    ? result.trace?.authority?.score ?? null
    : null;

  function handlePushToDevelopment() {
    if (!chatId || !result.script) return;
    try {
      localStorage.setItem("tsl-v2:script-override:" + chatId, result.script);
    } catch (e) {
      toast.error("Could not hand off the script — storage blocked.");
      return;
    }
    navigate("/tsl-builder/develop/" + chatId);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 flex flex-col bg-background animate-slide-in-right motion-reduce:animate-none"
      data-testid="docs-panel-mobile"
      role="dialog"
      aria-modal="true"
    >
      <PanelHeader
        productLabel={productLabel}
        generating={generating}
        onClose={onClose}
        onPushToDevelopment={handlePushToDevelopment}
        canPush={canPush}
        authorityScore={authorityScore}
      />
      {finishedMessages && finishedMessages.length > 1 && (
        <HistoryBar
          messages={finishedMessages}
          selectedId={selectedMessageId ?? message?.id ?? null}
          onSelect={(id) => onSelectMessage?.(id)}
        />
      )}
      <div className="flex-1 overflow-y-auto">
        <PanelBody message={message} generating={generating} />
      </div>
    </div>
  );
}

// Re-export for any caller that wants the finished-detector.
export { isFinishedTsl };
