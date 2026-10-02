import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { LineageCard, type LineageEntry } from "@/components/ugc/LineageCard";
import {
  Loader2, ChevronLeft, Bot, CheckCircle2, XCircle, Circle,
  Sparkles, ChevronDown, ChevronUp, Rocket, Megaphone, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseAdsResults, type AdsResult } from "@/lib/parseAds";
import { stripMetaForClient } from "@/lib/parseScripts";
import { AdCard } from "@/components/ugc/AdCard";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

interface VideoSummary {
  total: number; queued: number; render: number; merging: number;
  ready: number; failed: number; stalled: number; done: number;
}

// One generated script straight from run.scripts_json (written at script-gen time,
// before any render). p1/p2 may be empty strings depending on the format; script_md
// is always present, script_plain is the clean text.
interface ScriptItem {
  ad_id: string;
  script_md: string;
  script_plain: string;
  p1: string;
  p2: string;
  brief_doc_md: string;
  avatars_requested: number;
}

interface Run {
  id: string;
  automation_id: string;
  user_id: string;
  status: "pending" | "generating_scripts" | "rendering" | "merging"
        | "running" | "completed" | "partial" | "failed" | "stalled" | "cancelled";
  videos_summary?: VideoSummary;
  thought_process: string | null;
  inspo_summary: string | null;
  lineage_json: LineageEntry[] | null;
  // Generated script text, independent of lineage/videos. Present as soon as scripts
  // are generated (and the only script source in the scripts-only test mode where
  // lineage_json stays empty because rendering is skipped).
  scripts_json: ScriptItem[] | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  // Ads-driven custom-prompt run telemetry. snake_case names = the exact columns
  // the backend writes on ugc_automation_runs. All null when not an ads-driven run.
  ads_query_applied: Record<string, unknown> | null;
  ad_ids_pulled: string[] | null;
  ads_count: number | null;
  fallback_reason: string | null;
  custom_prompt: string | null;
}

interface Automation {
  id: string;
  name: string;
  product: string;
  mode: "NN" | "IT";
  angle: string | null;
  persona: string | null;
  pain_points: string[] | null;
  avatar_type: string;
  cs_owner: string;
}

function fmtDuration(startIso: string, endIso: string | null): string {
  const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime();
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }: { status: Run["status"] }) {
  const map: Record<Run["status"], { cls: string; label: string; icon: React.ReactNode }> = {
    pending:            { cls: "bg-secondary text-secondary-foreground", label: "Pending",          icon: <Circle className="h-3 w-3" /> },
    generating_scripts: { cls: "bg-blue-500/15 text-blue-700",           label: "Generating scripts",icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    rendering:          { cls: "bg-blue-500/15 text-blue-700",           label: "Rendering",         icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    merging:            { cls: "bg-purple-500/15 text-purple-700",       label: "Merging",           icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    running:            { cls: "bg-amber-500/15 text-amber-700",         label: "Running",           icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed:          { cls: "bg-emerald-500/15 text-emerald-700",     label: "Completed",         icon: <CheckCircle2 className="h-3 w-3" /> },
    partial:            { cls: "bg-amber-500/15 text-amber-700",         label: "Partial",           icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:             { cls: "bg-destructive/15 text-destructive",     label: "Failed",            icon: <XCircle className="h-3 w-3" /> },
    stalled:            { cls: "bg-orange-500/15 text-orange-700",       label: "Stalled",           icon: <XCircle className="h-3 w-3" /> },
    cancelled:          { cls: "bg-secondary text-secondary-foreground", label: "Cancelled",         icon: <Circle className="h-3 w-3" /> },
  };
  const e = map[status] ?? map.cancelled;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${e.cls}`}>
      {e.icon}{e.label}
    </span>
  );
}

function StatBox({ label, value, tone, text }: { label: string; value: string | number; tone?: "ok" | "bad"; text?: boolean }) {
  const cls = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : "";
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`mt-0.5 font-semibold ${text ? "text-sm" : "text-lg"} ${cls}`}>{String(value)}</div>
    </div>
  );
}

function ThoughtProcess({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted text-left">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium">Thought process</span>
        <span className="text-xs text-muted-foreground ml-2">why this batch</span>
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-muted-foreground leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function InspoSummary({ text, fallback }: { text: string; fallback?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted text-left">
        <span className="text-sm font-medium">{fallback ? "Default inspo (fallback)" : "Inspo summary"}</span>
        <span className="text-xs text-muted-foreground ml-2">
          {fallback ? "default product top-30 — live-ads filters matched nothing" : "top performers fed to the model"}
        </span>
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">{stripMetaForClient(text)}</pre>
        </div>
      )}
    </div>
  );
}

// Render the sourced ads PAGINATED (25/page). "All ads" runs can return hundreds, and
// each AdCard mounts an image/video/iframe preview — rendering them all at once chokes
// the page. The full set is already in memory (parsed from the run row); we just render
// one page of cards at a time. Controls only appear when there's more than one page.
const ADS_PAGE_SIZE = 25;
function AdsSourced({ ads }: { ads: AdsResult }) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(0);
  const total = ads.ads.length;
  const pageCount = Math.max(1, Math.ceil(total / ADS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1); // guard if the set shrinks (polling)
  const start = safePage * ADS_PAGE_SIZE;
  const pageAds = ads.ads.slice(start, start + ADS_PAGE_SIZE);
  const subtitle = ads.total_matched != null && ads.total_matched > ads.count
    ? `${ads.count} of ${ads.total_matched} matched`
    : `${ads.count}`;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted text-left">
        <Megaphone className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium">Ads sourced for this run</span>
        <span className="text-xs text-muted-foreground ml-2">{subtitle}</span>
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {pageAds.map((a, i) => (
              <AdCard key={`${a.ad_id ?? "ad"}-${start + i}`} ad={a} />
            ))}
          </div>
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Showing {start + 1}–{Math.min(start + ADS_PAGE_SIZE, total)} of {total}
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
                <span className="text-xs tabular-nums text-muted-foreground">{safePage + 1} / {pageCount}</span>
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
      )}
    </div>
  );
}

// The operator's verbatim custom prompt (automation.prompt_guide) that drove the run.
function CustomPrompt({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted text-left">
        <span className="text-sm font-medium">Custom prompt</span>
        <span className="text-xs text-muted-foreground ml-2">operator's request for this run</span>
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">{text}</pre>
        </div>
      )}
    </div>
  );
}

// One generated script as a collapsible card — ad_id heading + the script body.
// Prefers labeled P1/P2 blocks when both parts exist, else the clean plain text.
function ScriptCard({ script }: { script: ScriptItem }) {
  const [open, setOpen] = useState(true);
  const hasP1P2 = !!script.p1?.trim() && !!script.p2?.trim();
  const body = script.script_plain?.trim() || script.script_md?.trim() || "(no script text)";
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted text-left">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium font-mono">{script.ad_id || "script"}</span>
        {script.avatars_requested ? (
          <span className="text-xs text-muted-foreground ml-2">
            {script.avatars_requested} avatar{script.avatars_requested === 1 ? "" : "s"} requested
          </span>
        ) : null}
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3 space-y-3">
          {hasP1P2 ? (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">P1</div>
                <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{script.p1}</pre>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">P2</div>
                <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{script.p2}</pre>
              </div>
            </>
          ) : (
            <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{body}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// The generated scripts straight from run.scripts_json — shown independent of
// lineage/videos so the operator can read the script BEFORE render (and in the
// scripts-only test mode where no render lineage is ever created).
function GeneratedScripts({ scripts }: { scripts: ScriptItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        {scripts.length} generated script{scripts.length === 1 ? "" : "s"}
      </h2>
      {scripts.map((s, i) => (
        <ScriptCard key={`${s.ad_id || "script"}-${i}`} script={s} />
      ))}
    </section>
  );
}

// Diagnostic: the live-ads filters the model actually applied + the ad IDs it
// pulled (with the count). Renders EVEN on a 0-ad miss so the run stops failing
// silently — the empty ID list is the visible signal the filters matched nothing.
function AdsQueryApplied({
  query, adIds, count,
}: { query: Record<string, unknown> | null; adIds: string[] | null; count: number | null }) {
  const [open, setOpen] = useState(true);
  const ids = adIds ?? [];
  const countLabel = count != null ? `${count} ad${count === 1 ? "" : "s"} pulled` : "—";
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted text-left">
        <Megaphone className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium">Ads query applied</span>
        <span className="text-xs text-muted-foreground ml-2">{countLabel}</span>
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3 space-y-3">
          {query && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Filters the model applied</div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono bg-muted/40 rounded-md px-2.5 py-2 overflow-x-auto">{JSON.stringify(query, null, 2)}</pre>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Ad IDs pulled{count != null ? ` (${count})` : ""}
            </div>
            {ids.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {ids.map((id) => (
                  <span key={String(id)} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono text-foreground">{String(id)}</span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No live ads matched these filters.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UgcAutomationRunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [run, setRun]             = useState<Run | null>(null);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushingAll, setPushingAll] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async (silent = false) => {
    if (!runId || !user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/automation-runs/${runId}?user_id=${user.id}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRun(data);
    } catch (err: any) {
      if (!silent) toast({ title: "Failed to load run", description: err.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [runId, user?.id, toast]);

  const triggerRefresh = useCallback(async () => {
    if (!runId || !user?.id) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/automation-runs/${runId}/refresh-videos?user_id=${user.id}`,
        { method: "POST" },
      );
      if (res.ok) {
        const updated = await res.json();
        if (updated?.id) setRun(updated);
      }
    } catch { /* best-effort; the next fetchRun picks up resolved urls */ }
  }, [runId, user?.id]);

  const fetchAutomation = useCallback(async (automationId: string) => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/automations?user_id=${user.id}`);
      if (!res.ok) return;
      const { automations } = await res.json();
      const found = (automations ?? []).find((a: Automation) => a.id === automationId);
      if (found) setAutomation(found);
    } catch { /* silent */ }
  }, [user?.id]);

  // Push generated ads into the pipeline (Frame.io + ClickUp + ads DB). Mirrors
  // the manual log's Approve action; admin-triggered. Per-entry and whole-run.
  const handlePush = useCallback(async (generationId: string) => {
    if (!runId || !user?.id) return;
    setPushingId(generationId);
    try {
      const res = await fetch(
        `${API_BASE}/api/automation-runs/${runId}/lineage/${generationId}/push-pipeline?user_id=${user.id}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cs_email: user.email }) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `${res.status}`);
      if (data.run?.id) setRun(data.run);
      const r = (data.results ?? [])[0];
      if (r && r.ok === false) {
        toast({ title: "Couldn't push ad", description: r.error, variant: "destructive" });
      } else {
        toast({ title: "Pushed to pipeline", description: "Submitting to Frame.io + ClickUp — status updates here shortly." });
      }
    } catch (err: any) {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    } finally {
      setPushingId(null);
    }
  }, [runId, user?.id, toast]);

  const handlePushAll = useCallback(async () => {
    if (!runId || !user?.id) return;
    setPushingAll(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/automation-runs/${runId}/push-pipeline?user_id=${user.id}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cs_email: user.email }) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `${res.status}`);
      if (data.run?.id) setRun(data.run);
      const results = data.results ?? [];
      const pushed = results.filter((x: any) => x.ok && !x.skipped).length;
      const failed = results.filter((x: any) => x.ok === false);
      if (pushed > 0) {
        toast({ title: `Pushed ${pushed} ad${pushed === 1 ? "" : "s"} to pipeline`, description: failed.length ? `${failed.length} couldn't be pushed yet.` : "Submitting to Frame.io + ClickUp." });
      } else if (failed.length) {
        toast({ title: "Nothing pushed", description: failed[0].error, variant: "destructive" });
      } else {
        toast({ title: "Nothing to push", description: "No ready ads remaining (already pushed or still rendering)." });
      }
    } catch (err: any) {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    } finally {
      setPushingAll(false);
    }
  }, [runId, user?.id, toast]);

  useEffect(() => { fetchRun(); }, [fetchRun]);

  useEffect(() => {
    if (run?.automation_id && !automation) {
      fetchAutomation(run.automation_id);
    }
  }, [run?.automation_id, automation, fetchAutomation]);

  // Videos keep resolving after the run itself is "completed" (scripts done,
  // HeyGen renders still in flight), so poll while the run is active OR any
  // avatar job still lacks a final_video_url.
  const hasInflightVideos = useMemo(() => {
    const lineage = run?.lineage_json ?? [];
    // A job is still resolving until it has a playable URL (single final_video_url
    // OR the merged combination URL) or an error.
    return lineage.some((e: any) =>
      (e.avatar_jobs ?? []).some((j: any) => !j.final_video_url && !j.merged_video_url && !j.error),
    );
  }, [run?.lineage_json]);

  // A push is in flight while any entry is "submitting" — the BE's startRunPolling
  // flips it to done/launched (or failed) in the background. Without polling on
  // this, the page would freeze on "Submitting…" until a manual reload.
  const hasPipelineInflight = useMemo(() => {
    const lineage = run?.lineage_json ?? [];
    return lineage.some((e: any) => e.pipeline_status === "submitting");
  }, [run?.lineage_json]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!run) return;
    const inFlightStatus = ["pending", "generating_scripts", "rendering", "merging", "running"].includes(run.status);
    const active = inFlightStatus || hasInflightVideos || hasPipelineInflight;
    if (!active) return;
    pollRef.current = setInterval(async () => {
      // Only the video resolver needs the refresh POST; a submitting push just
      // needs a re-fetch to pick up the BE's status flip.
      if (hasInflightVideos) await triggerRefresh();
      fetchRun(true);
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [run?.status, hasInflightVideos, hasPipelineInflight, fetchRun, triggerRefresh]);

  // Prefer the backend's classifier-derived summary (ready = truly playable). Fall
  // back to the old ok-flag count only if the summary isn't present (legacy rows).
  const stats = useMemo(() => {
    const lineage = run?.lineage_json ?? [];
    const s = run?.videos_summary;
    if (s) {
      return { scripts: lineage.length, videosOk: s.ready, videosFail: s.failed + s.stalled, inFlight: s.queued + s.render + s.merging };
    }
    let videosOk = 0, videosFail = 0;
    for (const entry of lineage) {
      for (const job of entry.avatar_jobs ?? []) {
        if (job.ok) videosOk++; else videosFail++;
      }
    }
    return { scripts: lineage.length, videosOk, videosFail, inFlight: 0 };
  }, [run?.lineage_json, run?.videos_summary]);

  // How many entries are ready to push (rendered, not yet pushed/rejected) —
  // drives the "Push all" button visibility/count.
  const pushableCount = useMemo(() => {
    const lineage = run?.lineage_json ?? [];
    return lineage.filter((e: any) => {
      // Parity with the per-ad gate: needs ≥1 explicitly-approved render that
      // produced a video, and the ad isn't already pushed/rejected.
      const approvedReady = (e.avatar_jobs ?? []).some(
        (j: any) => j.approval_status === "approved" && (j.final_video_url || j.merged_video_url),
      );
      const done = e.pipeline_status === "done" || e.pipeline_status === "submitting";
      const rejected = e.approval_status === "rejected";
      return approvedReady && !done && !rejected;
    }).length;
  }, [run?.lineage_json]);

  // Ads pulled for an ads-driven run, decoded from the inspo marker (reuses the
  // chat's parser) → rendered with the same AdCards as the UGC builder.
  const ads = useMemo(() => parseAdsResults(run?.inspo_summary), [run?.inspo_summary]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !run) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <XCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-medium mb-1">Run not found</h3>
          <p className="text-sm text-muted-foreground mb-5">This run doesn't exist or you don't have access to it.</p>
          <button onClick={() => navigate("/ugc-builder/automations")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to Automations
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const lineage: LineageEntry[] = run.lineage_json ?? [];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <button onClick={() => navigate("/ugc-builder/automations")} className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /><Bot className="h-3.5 w-3.5" /> Automations
          </button>
          <span>/</span>
          <span className="truncate max-w-[200px]">{automation?.name ?? run.automation_id.slice(0, 8)}</span>
          <span>/</span>
          <span className="font-mono">{run.id.slice(0, 8)}</span>
        </div>

        {/* Status + header */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <StatusPill status={run.status} />
              <span className="text-sm font-medium">Production log</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              Started {fmtDate(run.started_at)} · {fmtDuration(run.started_at, run.finished_at)}
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3">
            <StatBox label="Scripts"     value={stats.scripts} />
            <StatBox label="Videos ready" value={stats.videosOk}  tone={stats.videosOk > 0 ? "ok" : undefined} />
            <StatBox label="Rendering"   value={stats.inFlight} />
            <StatBox label="Failed"      value={stats.videosFail} tone={stats.videosFail > 0 ? "bad" : undefined} />
            <StatBox label="Mode"        value={automation?.mode ?? "—"} text />
          </div>

          {/* Metadata chips */}
          {automation && (
            <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {automation.angle   && <span>angle: <span className="text-foreground">{automation.angle}</span></span>}
              {automation.persona && <span>persona: <span className="text-foreground">{automation.persona}</span></span>}
              {automation.pain_points?.length ? <span>pains: <span className="text-foreground">{automation.pain_points.join(" · ")}</span></span> : null}
              <span>CS: <span className="text-foreground">{automation.cs_owner}</span></span>
            </div>
          )}
        </div>

        {/* Error */}
        {run.error && (
          <div className="border border-destructive/40 bg-destructive/5 rounded-md px-3 py-2 text-sm text-destructive">
            {run.error}
          </div>
        )}

        {/* Fallback warning — the live-ads query yielded nothing, so scripts were
            written from the static product default instead of the requested filters.
            Surfaces what used to be a silent miss. Only on the ads-driven path. */}
        {run.fallback_reason && (
          <div className="border border-amber-500/40 bg-amber-500/5 rounded-md px-3 py-2 text-sm text-amber-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {run.fallback_reason === "no_ads_query_attempted"
                ? "No live ads query was made — used the default product top-30"
                : run.fallback_reason === "ads_query_failed"
                ? "The live ads query FAILED — used the default product top-30. See the error in the applied-query panel"
                : run.fallback_reason === "live_query_returned_zero"
                ? "Filters matched no live ads — wrote scripts from the default product top-30 instead"
                : "Filters yielded no live ads — scripts were written from the default product top-30 instead"}
              {" "}(reason: <span className="font-mono">{run.fallback_reason}</span>).
            </span>
          </div>
        )}

        {/* Operator's custom prompt that drove this run */}
        {run.custom_prompt && <CustomPrompt text={run.custom_prompt} />}

        {/* Thought process */}
        {run.thought_process && <ThoughtProcess text={run.thought_process} />}

        {/* Generated scripts — read straight from run.scripts_json, independent of
            lineage/videos. Renders whenever scripts exist (incl. the scripts-only
            test mode where no render lineage is created), and BEFORE the lineage
            section so the script text is visible first. */}
        {run.scripts_json && run.scripts_json.length > 0 && (
          <GeneratedScripts scripts={run.scripts_json} />
        )}

        {/* Scripts / lineage */}
        {lineage.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {lineage.length} script{lineage.length === 1 ? "" : "s"} generated
              </h2>
              {pushableCount > 0 && (
                <Button size="sm" onClick={handlePushAll} disabled={pushingAll} title="Push every ready ad into the pipeline">
                  {pushingAll ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Pushing…</>
                  ) : (
                    <><Rocket className="h-3 w-3 mr-1" /> Push all to pipeline ({pushableCount})</>
                  )}
                </Button>
              )}
            </div>
            {lineage.map((entry) => (
              <LineageCard
                key={entry.generation_id}
                entry={entry}
                buildId={run.id}
                onApprove={() => {}}
                onReject={() => {}}
                onRegenerate={() => {}}
                onUpdated={async () => { await triggerRefresh(); fetchRun(true); }}
                approving={false}
                apiBasePath="/api/automation-runs"
                query={user?.id ? `?user_id=${user.id}` : ""}
                runMode
                driveProxyBase="/api/automation-runs/drive-video"
                onPush={handlePush}
                pushingId={pushingId}
              />
            ))}
          </section>
        ) : (run.status === "pending" || run.status === "running") ? (
          <div className="border border-border rounded-lg px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Generating scripts and queueing video renders… can take 30s–3 min.
          </div>
        ) : null}

        {/* Live ads this run iterated on — collapsible accordion, same card UI as the builder.
            Placed AFTER the generated scripts/videos per the run-page flow. */}
        {ads && ads.ads.length > 0 && <AdsSourced ads={ads} />}

        {/* Ads query applied — the filters the model used + the ad IDs it pulled, from
            the persisted run columns. Renders even on a 0-ad miss so the silent
            fallback is visible. Shown whenever an ads query was attempted. */}
        {(run.ads_query_applied || run.ads_count != null) && (
          <AdsQueryApplied
            query={run.ads_query_applied}
            adIds={run.ad_ids_pulled}
            count={run.ads_count}
          />
        )}

        {/* Inspo summary — kept for ALL runs (old flow preserved). For ads runs the
            cards above are an addition; this still shows the readable inspo text. On a
            fallback run it's the default top-30, so relabel it (don't claim it's the
            live top performers fed to the model). */}
        {run.inspo_summary && <InspoSummary text={run.inspo_summary} fallback={!!run.fallback_reason} />}
      </div>
    </DashboardLayout>
  );
}
