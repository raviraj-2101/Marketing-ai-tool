// PromptBuilderChat.tsx — verify-only chat for UGC Automations.
//
// The operator types a custom automation prompt and this chat PREVIEWS the exact
// live ads the automation RUN will pull (one headless Anthropic turn with a
// run-identical adsCtx, ads tool OFFERED not forced). It NEVER generates scripts
// and may ask at most ONE clarifying question. On "Confirm & save prompt" the
// verbatim verified text is lifted back into the modal via onConfirm — this
// component does NOT persist anything itself.
//
// Composes the IMPORTABLE leaves (parseAdsResults, AdCard, stripMetaForClient)
// and COPIES the inline-private AutoGrowTextarea / ThinkingState / formatDuration
// from ScriptChat.tsx (importing them would force editing the byte-unchanged
// ScriptChat.tsx — precedent: TslChatPage.tsx).
import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";
import { parseAdsResults, type AdsResult, type AdRow } from "@/lib/parseAds";
import { stripMetaForClient } from "@/lib/parseScripts";
import { AdCard } from "./AdCard";
import { startPromptBuilderChat, cancelPromptBuilderChat } from "@/lib/promptBuilderStreamChat";
// DORMANT: consolidatePromptRequest (AI prompt-merge) removed by design 2026-06-30 — the draft
// stores the operator's last refined prompt verbatim. Re-add it to the import above to revive.

// Prose styling copied verbatim from ScriptChat.tsx (~l.1397) for bubble parity.
const PROSE_CLASSNAME =
  "prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_li+li]:mt-3 [&_p+ol]:mt-4 [&_p+ul]:mt-4 [&_ol]:mb-2 [&_ul]:mb-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-words [&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto [&_p]:break-words";

// Page size for the previewed-ads grid. 6 (3 rows × 2 cols) makes pagination
// visible and useful at 10 ads (→ 2 pages) without being too sparse.
const ADS_PAGE_SIZE = 6;

export interface PromptBuilderChatProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  product: string;
  productLabel?: string;
  initialPrompt?: string;
  onConfirm: (payload: { promptText: string; ads: AdRow[]; query: Record<string, unknown> | null }) => void;
}

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  startedAt?: number;
};

export function PromptBuilderChat(props: PromptBuilderChatProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(props.initialPrompt ?? "");
  const [streaming, setStreaming] = useState(false);
  // const [consolidating, setConsolidating] = useState(false); // DORMANT: AI consolidate removed (see handleConfirm)
  const aborterRef = useRef<{ abort: () => void } | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Non-reactive refs so the auto-send effect can read current values without
  // being in its dependency array (avoids closure-stale and loop risks).
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const streamingRef = useRef(false);
  streamingRef.current = streaming;
  // Tracks whether we've already auto-fired the initial prompt for the current
  // fresh session. Reset on product change. Prevents re-fire on every render.
  const autoSentRef = useRef(false);

  // Reset the conversation ONLY when the product changes — the previewed ads
  // belong to the old product, so a genuine product switch starts fresh
  // (mirrors the parent clearing verified/frozen on product change). Closing +
  // reopening the dialog for the SAME product PRESERVES the conversation +
  // previewed ads (the parent keeps this component mounted; `open` only toggles
  // visibility), so the operator can step away and come back to their work.
  useEffect(() => {
    setMsgs([]);
    setStreaming(false);
    jobIdRef.current = null;
    setInput(props.initialPrompt ?? "");
    autoSentRef.current = false; // new product = new session; allow auto-send again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.product]);

  // On open, (re)seed the composer with the current prompt ONLY when the chat
  // is fresh (no prior turns) — never clobber an in-progress/restored chat.
  useEffect(() => {
    if (props.open && msgs.length === 0) {
      setInput(props.initialPrompt ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  // AUTO-SEND the initialPrompt on a genuinely fresh open (dialog just opened,
  // no prior messages, not already streaming). Uses refs to read current state
  // without making msgs/streaming reactive deps (which would cause re-fires).
  // autoSentRef gates exactly one send per fresh session; reset on product change.
  useEffect(() => {
    if (!props.open) return;
    if (autoSentRef.current) return;            // already sent this session
    if (msgsRef.current.length > 0) return;     // restored/prior conversation
    if (streamingRef.current) return;           // already streaming
    const prompt = props.initialPrompt?.trim();
    if (!prompt) return;                        // nothing to send
    autoSentRef.current = true;
    send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.initialPrompt]);

  // Keep the latest turn in view as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // VET FIX #2 — Confirm is enabled ONLY when the LATEST completed (non-streaming)
  // assistant turn carries a preview marker (parseAdsResults != null: true for the
  // ads preview AND the synthetic ads_referenced:false marker; false for a bare
  // clarifying-question / model-declined turn). The saved prompt is the COMPLETE
  // user message that produced that marker-bearing turn — never a fragment.
  // Also captures the previewed ads + applied query so the modal can freeze them.
  const verifiedPayload = useMemo<{ promptText: string; ads: AdRow[]; query: Record<string, unknown> | null } | null>(() => {
    let lastAssistantIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && !msgs[i].streaming) { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx === -1) return null;
    const adsResult = parseAdsResults(msgs[lastAssistantIdx].content);
    if (adsResult == null) return null;
    for (let j = lastAssistantIdx - 1; j >= 0; j--) {
      if (msgs[j].role === "user") {
        return { promptText: msgs[j].content, ads: adsResult.ads, query: adsResult.query };
      }
    }
    return null;
  }, [msgs]);

  function send(text: string) {
    const sent = text.trim();
    if (!sent || streaming) return;
    const uid = crypto.randomUUID();
    const aid = crypto.randomUUID();
    setMsgs((p) => [
      ...p,
      { id: uid, role: "user", content: sent },
      { id: aid, role: "assistant", content: "", streaming: true, startedAt: Date.now() },
    ]);
    setStreaming(true);
    setInput("");
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    aborterRef.current = startPromptBuilderChat(
      { user_id: props.userId, product: props.product, message: sent, history },
      {
        onMeta: ({ jobId }) => { jobIdRef.current = jobId; },
        onDelta: (full) => setMsgs((p) => p.map((m) => (m.id === aid ? { ...m, content: full } : m))),
        onDone: () => {
          setStreaming(false);
          setMsgs((p) => p.map((m) => (m.id === aid ? { ...m, streaming: false } : m)));
        },
        onError: (err) => {
          setStreaming(false);
          // GAP #5: distinct "ads backend unavailable" text surfaces here.
          setMsgs((p) => p.map((m) => (m.id === aid ? { ...m, streaming: false, content: `⚠️ ${err}` } : m)));
        },
        onCancelled: () => {
          setStreaming(false);
          setMsgs((p) => p.map((m) => (m.id === aid ? { ...m, streaming: false } : m)));
        },
      },
    );
  }

  function stop() {
    aborterRef.current?.abort();
    if (jobIdRef.current) void cancelPromptBuilderChat(jobIdRef.current);
    setStreaming(false);
    setMsgs((p) => p.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  }

  function handleConfirm() {
    if (!verifiedPayload) return;
    // Store the operator's LAST refined prompt verbatim (verifiedPayload.promptText) + the
    // verified ads + query. No AI rewrite. The backend freeze path keeps the stored prompt
    // ads-referencing (ensureAdsReferencing) so the FROZEN run replays its saved ads.
    props.onConfirm(verifiedPayload);

    // --- DORMANT: AI "consolidate" (merge the multi-turn chat into ONE prompt). Removed by
    // --- design (Sagar 2026-06-30). To revive: re-add the consolidatePromptRequest import,
    // --- the `consolidating` state + the button spinner, mark this fn `async`, and restore:
    // setConsolidating(true);
    // try {
    //   const { prompt } = await consolidatePromptRequest({
    //     user_id: props.userId,
    //     product: props.product,
    //     history: msgs.map((m) => ({ role: m.role, content: m.content })),
    //     ads: verifiedPayload.ads,
    //     query: verifiedPayload.query,
    //   });
    //   props.onConfirm({
    //     promptText: (prompt && prompt.trim()) ? prompt : verifiedPayload.promptText,
    //     ads: verifiedPayload.ads,
    //     query: verifiedPayload.query,
    //   });
    // } catch {
    //   props.onConfirm(verifiedPayload);
    // } finally {
    //   setConsolidating(false);
    // }
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => { if (!v) props.onClose(); }}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
          <DialogTitle className="text-[15px] font-semibold tracking-tight">
            Verify prompt{props.productLabel ? ` — ${props.productLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto outline-none">
          {msgs.length === 0 && (
            <div className="px-6 py-5">
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground space-y-1">
                <p>This previews the <strong>exact live ads</strong> your automation run will pull for this prompt — it never generates scripts.</p>
                <p>Type the prompt below and send to verify. <strong>Confirm &amp; save</strong> unlocks once a preview returns.</p>
              </div>
            </div>
          )}

          <div className="px-6 py-4 space-y-6">
            {msgs.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex gap-3 justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
                      {m.content}
                    </div>
                  </div>
                );
              }
              const ads = parseAdsResults(m.content);
              return (
                <div key={m.id} className="flex gap-3 justify-start">
                  <div className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-sm font-semibold mt-0.5">
                    A
                  </div>
                  <div className="relative px-4 py-3 rounded-2xl bg-card border border-border/50 w-full min-w-0">
                    {m.streaming && !m.content ? (
                      <ThinkingState startedAt={m.startedAt} />
                    ) : (
                      <div className={PROSE_CLASSNAME}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {stripMetaForClient(m.content)}
                        </ReactMarkdown>
                      </div>
                    )}
                    {ads && <AppliedFiltersChips query={ads.query} />}
                    {ads && ads.count > 0 && <PreviewAdsPanel result={ads} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom: composer + action row — single border-t separating from messages */}
        <div className="shrink-0 border-t border-border bg-background px-6 pt-3 pb-4 space-y-3">
          {/* Composer card — TSL-style rounded container with floating send button */}
          <div className="relative rounded-2xl border bg-card shadow-sm focus-within:shadow-md transition-all duration-150 border-input focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
            <AutoGrowTextarea
              value={input}
              onChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder={
                streaming
                  ? "Thinking… (send unlocks once the reply finishes)"
                  : 'e.g. "top 5 winning bloating-angle ads last 30 days"  (Enter to send)'
              }
              disabled={streaming}
              className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[52px] max-h-[30vh] pr-14 pl-4 py-3.5 text-[14px] leading-relaxed placeholder:text-muted-foreground/70 outline-none"
              data-testid="prompt-builder-input"
            />
            <div className="absolute bottom-2 right-2 z-10">
              {streaming ? (
                <Button
                  type="button"
                  size="icon"
                  variant="default"
                  className="size-9 rounded-full shadow-sm hover:scale-[1.03] active:scale-95 transition-transform"
                  onClick={stop}
                  aria-label="Stop"
                  title="Stop"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="size-9 rounded-full shadow-sm enabled:ring-2 enabled:ring-primary/25 hover:scale-[1.03] active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                  onClick={() => send(input)}
                  disabled={!input.trim()}
                  aria-label="Send"
                  title="Send · Enter"
                  data-testid="prompt-builder-send"
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Action row: tip text on left, Close + Confirm on right */}
          <div className="flex items-center justify-between gap-2">
            {/* VET FIX #2 helper: re-state the FULL standalone prompt, not a fragment. */}
            <p className="text-[11px] text-muted-foreground/80 flex-1 min-w-0">
              Tip: reply to clarifying questions by re-stating your <strong>full prompt</strong> as
              one self-contained instruction — the run uses this prompt standalone.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
              <Button
                size="sm"
                disabled={!verifiedPayload || streaming /* || consolidating (dormant) */}
                onClick={handleConfirm}
                data-testid="prompt-builder-confirm"
              >
                Confirm &amp; save prompt
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── coerce ────────────────────────────────────────────────────────────────────
// query is Record<string,unknown> (parseAds.ts stays byte-unchanged), so defend.
// Array → "a, b"; skip undefined/null/'' / empty-array.
function coerce(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const j = v.map((x) => String(x)).filter((s) => s !== "").join(", ");
    return j || null;
  }
  const s = String(v);
  return s ? s : null;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/70">{label}:</span>
      {value}
    </span>
  );
}

// ── isDefaultWindow ──────────────────────────────────────────────────────────
// Returns true when the metric window looks like the backend's unspecified default
// (trailing ~30 days ending today). Used to show a transparency hint so the
// operator isn't confused by "why 30 days when I didn't ask for it".
function isDefaultWindow(query: Record<string, unknown> | null): boolean {
  if (!query) return false;
  const ev = query.eventDate as { startDate?: string; endDate?: string } | undefined;
  const filters = (query.filters ?? {}) as Record<string, unknown>;
  if (!ev?.startDate || !ev?.endDate) return false;
  if (filters.launchDate) return false; // explicit launch window set → not the default
  const days = Math.round((Date.parse(ev.endDate) - Date.parse(ev.startDate)) / 86400000);
  const endIsToday = ev.endDate === new Date().toISOString().slice(0, 10);
  return endIsToday && days >= 28 && days <= 31; // ~30-day trailing default
}

// ── AppliedFiltersChips ─────────────────────────────────────────────────────
// Reads the REAL key paths off parseAdsResults(content).query (=== executeAdsQuery
// `applied`, re-keyed to `query`). Banners ride inside query (gap#1 / gap#2).
function AppliedFiltersChips({ query }: { query: Record<string, unknown> | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (query || {}) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (q.filters || {}) as any;

  const isFallback = !!q.fallback_to_static;        // GAP #1 — 0 live ads
  const isNoAds = q.ads_referenced === false;       // GAP #2 — synthetic marker

  const chips: Array<{ label: string; value: string }> = [];
  const push = (label: string, v: unknown) => {
    const c = coerce(v);
    if (c !== null) chips.push({ label, value: c });
  };

  // For the gap#2 synthetic "no live ads" marker the query carries no applied
  // filters — show ONLY the blue banner, no chips (no misleading "both" platform).
  if (!isNoAds) {
    // TOP-LEVEL on query (NOT under .filters).
    if (q.eventDate && (q.eventDate.startDate || q.eventDate.endDate)) {
      push("Window", `${q.eventDate.startDate ?? "—"} → ${q.eventDate.endDate ?? "—"}`);
    }
    push("Products", q.products);
    push("Brands", q.brands);
    if (q.sort && (q.sort.key || q.sort.dir)) {
      push("Sort", `${q.sort.key ?? ""} ${q.sort.dir ?? ""}`.trim());
    }
    if (q.limit !== undefined && q.limit !== null) push("Top", String(q.limit));
    if (q.spend_range && (q.spend_range.spendMin != null || q.spend_range.spendMax != null)) {
      push("Spend", `$${q.spend_range.spendMin ?? 0}–$${q.spend_range.spendMax ?? "∞"}`);
    }

    // NESTED under query.filters. An ABSENT platform key means BOTH channels —
    // there is no 'all' value.
    if (f.platform === undefined || f.platform === null || f.platform === "") {
      chips.push({ label: "Platform", value: "Meta + AppLovin (both)" });
    } else {
      push("Platform", f.platform);
    }
    if (f.launchDate && (f.launchDate.startDate || f.launchDate.endDate)) {
      push("Launched", `${f.launchDate.startDate ?? "—"} → ${f.launchDate.endDate ?? "—"}`);
    }
    if (f.minRoas !== undefined && f.minRoas !== null) chips.push({ label: "ROAS ≥", value: String(f.minRoas) });
    push("Angles", f.angles);
    push("Format", f.format);
    push("Funnels", f.funnels);
    push("CTA", f.ctaThemes);
    push("Ad types", f.adTypes);
    push("Root causes", f.rootCauses);
    push("Pain points", f.mainPainPoints);
    push("IT/NN", f.itOrNn);
    push("CS", f.cs);
    push("Editor", f.editor);
    push("Search", f.search);
    push("Ad id", f.adId);
    push("Script id", f.scriptId);
    push("Ad name", f.adName);
    push("Edit type", f.editType);
  }

  return (
    <div className="mt-2 space-y-2">
      {isFallback ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          This prompt matches <strong>0 live ads</strong> — the run will fall back to the product top-30 static inspo.
        </div>
      ) : isNoAds ? (
        <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[12px] text-blue-700 dark:text-blue-300">
          No live ads will be pulled — the run will generate from the product config.
        </div>
      ) : null}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => <Chip key={`${c.label}-${i}`} label={c.label} value={c.value} />)}
        </div>
      )}
      {!isNoAds && isDefaultWindow(query) && (
        <p className="text-[11px] text-muted-foreground mt-1">
          No date range in your prompt → defaulting to the last 30 days. Add e.g. &ldquo;last 6 months&rdquo; to widen.
        </p>
      )}
    </div>
  );
}

// ── isPlayableAdUrl ─────────────────────────────────────────────────────────
// Mirrors AdCard's internal isPlayableUrl so PreviewAdsPanel can clear
// ad_image_url for HTML5 playable assets, forcing AdCard into its iframe branch.
// (AdCard's version is private; we duplicate the check here rather than edit it.)
function isPlayableAdUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return /\.(raw|html?)$/i.test(new URL(url).pathname); }
  catch { return /\.(raw|html?)(\?|#|$)/i.test(url); }
}

// ── PreviewAdsPanel ─────────────────────────────────────────────────────────
// AdCard WITHOUT onIterate so the "Iterate this angle" button never appears
// (this is verify-only). Does NOT use AdsPanel (which forces onIterate).
// Paginated: renders ADS_PAGE_SIZE cards at a time with prev/next controls,
// mirroring AdsSourced in UgcAutomationRunDetail.tsx.
function PreviewAdsPanel({ result }: { result: AdsResult }) {
  const [page, setPage] = useState(0);
  const total = result.ads.length;
  const matched = result.total_matched;
  const pageCount = Math.max(1, Math.ceil(total / ADS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * ADS_PAGE_SIZE;
  const pageAds = result.ads.slice(start, start + ADS_PAGE_SIZE);

  const countLabel =
    matched != null && matched > total
      ? `Showing ${start + 1}–${Math.min(start + ADS_PAGE_SIZE, total)} of ${total} (${matched} matched)`
      : total <= ADS_PAGE_SIZE
      ? `${total} live ad${total === 1 ? "" : "s"}`
      : `Showing ${start + 1}–${Math.min(start + ADS_PAGE_SIZE, total)} of ${total} ads`;

  return (
    <div className="mt-3 space-y-2">
      <div className="text-[11px] text-muted-foreground">{countLabel}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {pageAds.map((ad, i) => {
          // For AppLovin playable ads (ad_video_url = .raw/.html), clear
          // ad_image_url so AdCard falls through to the iframe branch instead
          // of showing the static thumbnail. Never edits AdCard itself.
          const displayAd = isPlayableAdUrl(ad.ad_video_url) ? { ...ad, ad_image_url: null } : ad;
          return <AdCard key={`${ad.ad_id ?? "ad"}-${start + i}`} ad={displayAd} />;
        })}
      </div>
      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ThinkingState (copied from ScriptChat.tsx ~l.1609) ──────────────────────
function ThinkingState({ startedAt }: { startedAt?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const stage =
    elapsed < 4 ? "Thinking"
    : elapsed < 12 ? "Reading the prompt"
    : elapsed < 28 ? "Querying live ads"
    : elapsed < 50 ? "Applying filters"
    : elapsed < 80 ? "Compiling the preview"
    : "Almost there";

  return (
    <div className="space-y-3 py-1 min-w-[260px]" data-testid="thinking-state">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex gap-1">
          <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.32s]" />
          <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.16s]" />
          <span className="size-1.5 rounded-full bg-primary animate-bounce" />
        </span>
        <span className="font-medium text-foreground/80">{stage}…</span>
        <span className="ml-auto tabular-nums text-muted-foreground/70">
          {formatDuration(elapsed * 1000)}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-progress-sweep" />
      </div>
      <div className="space-y-1.5 pt-0.5">
        <div className="h-2.5 w-3/4 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer" />
        <div className="h-2.5 w-full rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer [animation-delay:-0.5s]" />
        <div className="h-2.5 w-5/6 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer [animation-delay:-1s]" />
      </div>
    </div>
  );
}

// ── formatDuration (copied from ScriptChat.tsx ~l.1649) ─────────────────────
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── AutoGrowTextarea (copied from ScriptChat.tsx ~l.1712) ───────────────────
const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}>(function AutoGrowTextarea(props, externalRef) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(externalRef, () => internalRef.current as HTMLTextAreaElement);
  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [props.value]);
  return (
    <textarea
      ref={internalRef}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={props.onKeyDown}
      placeholder={props.placeholder}
      disabled={props.disabled}
      className={`w-full block outline-none ${props.className || ""}`}
      data-testid={props["data-testid"]}
      rows={1}
    />
  );
});
