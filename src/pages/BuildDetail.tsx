import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronLeft, MessageSquare, CheckCircle2, XCircle, Loader2, Circle, Video,
  ExternalLink, FileText, Sparkles, Cloud, Clipboard, Copy, Check, Zap, ShieldAlert, ListChecks,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fmtCET } from "@/lib/datetime";
import { DashboardLayout } from "@/components/DashboardLayout";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

type Build = {
  id: string;
  user_email: string;
  chat_id: string | null;
  product: string;
  concept: string | null;
  cs: string;
  funnel: string;
  status: "pending" | "running" | "completed" | "failed";
  scripts_json: string;
  avatar_ids_json: string;
  results_json: string | null;
  lineage_json: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
};

export type Lineage = {
  generation_id: string;
  script_title: string;
  concept: string;
  persona?: string | null;
  sub_angle?: string | null;
  /** CS (Creative Strategist) label — "Agentic" for automation runs,
   *  human name for chat-side builds. Shown as a chip in the card header. */
  cs?: string | null;
  /** "IT" for iterations (script_id reused from parent ad), "NN" for new
   *  scripts. Drives both the ClickUp task name template (CS.<cs>_<IT/NN>)
   *  and a visible chip in the card header. */
  it_or_nn?: "IT" | "NN" | null;
  /** Markdown preview of the brief doc body — what the auto-created Google
   *  Doc would carry. Surfaced as a collapsible section in the card. */
  brief_doc_preview?: string | null;
  /** Two-phase workflow state. Pending batches show the approve button;
   *  approved/launched batches show the live AdsDB links and hide the
   *  button; rejected batches show a faded card. */
  approval_status?: "pending_approval" | "approved" | "launched" | "rejected" | null;
  /** "with" / "without" / "combination" — drives the mode chip. */
  mode?: "with" | "without" | "combination" | null;
  word_count?: number | null;
  duration_estimate_sec?: number | null;
  ad_id: string | null;
  script_id: number | null;
  pipeline_job_id: string | null;
  pipeline_status: "pending" | "rendering" | "uploading" | "submitting" | "done" | "failed" | "skipped";
  status_detail: string | null;
  clickup_task_id: string | null;
  clickup_url: string | null;
  brief_doc_url: string | null;
  g_drive_link: string | null;
  framer_io_link: string | null;
  avatar_jobs: Array<{
    avatar_id: string;
    heygen_video_id: string | null;
    heygen_log_id: string | null;
    ok: boolean;
    error: string | null;
  }>;
  inspo?: Array<{
    ad_id: string;
    concept: string;
    clickup_url?: string;
    brief_doc_url?: string;
    preview_url?: string;
  }>;
};

export type PipelineStatus = { pipelinePushEnabled: boolean; cs: string };

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function BuildDetailPage() {
  const { buildId } = useParams<{ buildId: string }>();
  const { email } = useAuth();

  const { data: build, error: buildError } = useQuery<Build>({
    queryKey: [`${API_BASE}/api/ugc-builds/${buildId}`],
    enabled: !!buildId,
    refetchInterval: (q) => {
      const r = q?.state?.data as Build | undefined;
      if (!r) return 2000;
      return r.status === "pending" || r.status === "running" ? 2000 : false;
    },
    // Bad / cleaned-up ids should fail fast rather than poll a 404 forever.
    retry: false,
  });
  const { data: pipelineStatus } = useQuery<PipelineStatus>({
    queryKey: ["/api/pipeline/status"],
  });

  const lineage: Lineage[] = useMemo(() => {
    if (!build?.lineage_json) return [];
    try { return JSON.parse(build.lineage_json); } catch { return []; }
  }, [build?.lineage_json]);

  const stats = useMemo(() => {
    let videos = 0, ok = 0;
    let ads = 0;
    for (const l of lineage) {
      // Defensive: a malformed lineage row could be missing avatar_jobs or
      // have it as null. Don't crash the whole page over it.
      const jobs = Array.isArray(l?.avatar_jobs) ? l.avatar_jobs : [];
      videos += jobs.length;
      ok += jobs.filter((j) => j && j.ok).length;
      if (l?.ad_id) ads++;
    }
    const total = videos;
    return { scripts: lineage.length, total, ok, failed: total - ok, ads };
  }, [lineage]);

  if (!buildId) return <div className="p-8">Missing build id.</div>;

  return (
    <DashboardLayout>
      <div className="h-full w-full flex flex-col bg-background">
        <header className="border-b border-border bg-card/40 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
            <a href="/ugc-builder/log" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted">
              <ChevronLeft className="size-4" />
              <ListChecks className="size-4" />
              Back to log
            </a>
            <span className="text-muted-foreground/30 mx-1">/</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Video className="size-4 text-primary" /> UGC build
            </span>
            <span className="text-sm font-mono text-muted-foreground ml-2">{buildId.slice(0, 8)}</span>
            {pipelineStatus && <PipelineModeBadge status={pipelineStatus} />}
            <div className="ml-auto text-xs text-muted-foreground hidden sm:inline">{email}</div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
          {!build && !buildError && (
            <div className="text-sm text-muted-foreground"><Loader2 className="inline size-3 animate-spin" /> Loading build…</div>
          )}
          {!build && buildError && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 max-w-xl mx-auto text-center">
              <XCircle className="size-8 mx-auto text-destructive/70 mb-3" />
              <h3 className="text-base font-medium mb-1">Couldn't load this build</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {String((buildError as any)?.message || buildError).includes("404")
                  ? "This build id doesn't exist (or was created from a different account)."
                  : `Server error: ${String((buildError as any)?.message || buildError)}`}
              </p>
              <a
                href="/ugc-builder/log"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-muted px-3 py-1.5 text-sm font-medium"
              >
                <ChevronLeft className="size-3.5" />
                Back to log
              </a>
            </div>
          )}
          {build && (
            <>
              <SummaryCard build={build} stats={stats} />
              {build.error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {build.error}
                </div>
              )}
              {lineage.length === 0 && build.status === "running" && (
                <div className="rounded-xl border border-border bg-card/60 p-6 flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Preparing scripts — this batch is just starting. The cards below will fill in as each render lands.
                </div>
              )}
              <section className="space-y-3">
                {lineage.map((l, i) => (
                  <LineageCard
                    key={l.generation_id}
                    idx={i + 1}
                    lineage={l}
                    pushEnabled={!!pipelineStatus?.pipelinePushEnabled}
                    buildId={build.id}
                  />
                ))}
              </section>
            </>
          )}
        </main>
      </div>
    </DashboardLayout>
  );
}

export function PipelineModeBadge({ status }: { status: PipelineStatus }) {
  if (status.pipelinePushEnabled) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-2 py-0.5 text-[10px] font-medium" title="Pipeline push enabled — real ad_ids are being created in the marketing DB">
        <Zap className="size-2.5" /> live pipeline
      </span>
    );
  }
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-0.5 text-[10px] font-medium" title="Pipeline push disabled — videos render but no ad_ids are created in the marketing DB. Flip PIPELINE_PUSH_ENABLED on the server once Agentic is configured in cs_config.">
      <ShieldAlert className="size-2.5" /> dry run
    </span>
  );
}

function SummaryCard({
  build, stats,
}: { build: Build; stats: { scripts: number; total: number; ok: number; failed: number; ads: number } }) {
  const duration = build.finished_at ? build.finished_at - build.started_at : Date.now() - build.started_at;
  return (
    <section className="relative rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <div className="absolute -top-16 -right-16 size-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 size-40 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />
      <header className="relative flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <StatusPill status={build.status} />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">Build report</span>
            <span className="text-[14.5px] font-semibold tracking-tight truncate" title={build.concept || "Untitled"}>
              {build.concept || "Untitled"}
            </span>
          </div>
        </div>
        <div className="text-[10.5px] text-muted-foreground tabular-nums text-right shrink-0">
          <div>Started {fmtCET(build.started_at)}</div>
          {build.finished_at && <div>Duration · {fmtDuration(duration)}</div>}
        </div>
      </header>
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">
        <Stat label="Ads" value={stats.scripts} tone={stats.scripts > 0 ? "primary" : "neutral"} />
        <Stat label="Videos" value={`${stats.ok}/${stats.total}`} tone={stats.ok === stats.total && stats.total > 0 ? "ok" : stats.failed ? "bad" : "neutral"} />
        <Stat label="Ad IDs" value={stats.ads} tone={stats.ads ? "ok" : "neutral"} />
        <Stat label="Product" value={build.product} text small />
      </div>
      <div className="relative px-5 py-2.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/30">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground/70 uppercase tracking-wider text-[9.5px]">Funnel</span>
          <span className="text-foreground/90 font-medium">{build.funnel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground/70 uppercase tracking-wider text-[9.5px]">CS</span>
          <span className="text-foreground/90 font-medium">{build.cs}</span>
        </span>
      </div>
    </section>
  );
}

function Stat({ label, value, tone, text, small }: { label: string; value: any; tone?: "ok" | "bad" | "neutral" | "primary"; text?: boolean; small?: boolean }) {
  const cls =
    tone === "ok" ? "text-emerald-400"
    : tone === "bad" ? "text-destructive"
    : tone === "primary" ? "text-primary"
    : "";
  return (
    <div className="bg-card px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">{label}</div>
      <div className={`mt-0.5 tabular-nums ${text ? "text-sm" : "text-lg"} ${small ? "text-xs" : ""} font-semibold ${cls}`}>{String(value)}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Build["status"] }) {
  const m: Record<Build["status"], { cls: string; label: string; icon: JSX.Element }> = {
    pending:   { cls: "bg-muted text-muted-foreground", label: "Pending", icon: <Circle className="size-3" /> },
    running:   { cls: "bg-amber-500/15 text-amber-300", label: "Running", icon: <Loader2 className="size-3 animate-spin" /> },
    completed: { cls: "bg-emerald-500/15 text-emerald-300", label: "Completed", icon: <CheckCircle2 className="size-3" /> },
    failed:    { cls: "bg-destructive/15 text-destructive", label: "Failed", icon: <XCircle className="size-3" /> },
  };
  const e = m[status] || m.pending;
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${e.cls}`}>{e.icon}{e.label}</span>;
}

/* ──────────────────────────────────────────────────────────────────────
 * AdStatusPill — inlined from ugc-videos-v2/client/src/pages/log.tsx
 * (resolveAdStatus + AdStatusPill). Kept here so this page is self-
 * contained without needing a separate log.tsx in ai-static-generator.
 * ────────────────────────────────────────────────────────────────────── */

type AdStatusDef = {
  kind: string;
  label: string;
  dot: string;
  text: string;
  pill: string;
};

function resolveAdStatus(ad: Lineage): AdStatusDef {
  const jobs = Array.isArray(ad.avatar_jobs) ? ad.avatar_jobs : [];
  const isCombo = ad.mode === "combination";
  const stillRendering = jobs.some((j: any) => {
    if (!j || j.error) return false;
    if (isCombo) {
      const submitted = !!(j.p1_heygen_video_id && j.p2_heygen_video_id);
      const terminal = j.merge_status === "done" || j.merge_status === "failed" || !!j.merged_video_url;
      return submitted && !terminal;
    }
    return j.heygen_video_id && j.ok && !j.final_video_url;
  });
  const ppl = (ad as any).pipeline_platforms || null;
  const metaState: string | null = ppl?.meta || null;
  const alState: string | null = ppl?.applovin || null;

  if (ad.approval_status === "rejected") {
    return {
      kind: "rejected", label: "Rejected",
      dot: "bg-destructive", text: "text-destructive/80",
      pill: "bg-destructive/15 border-destructive/40 text-destructive",
    };
  }
  const intended = (ad as any).intended_platforms || (ad as any).intended_platform || null;
  const wantMeta = intended ? /meta|both/i.test(String(intended)) : true;
  const wantAl   = intended ? /applovin|both/i.test(String(intended)) : true;
  const metaDone = metaState === "launched";
  const alDone   = alState === "launched";
  const launchedCount = (wantMeta && metaDone ? 1 : 0) + (wantAl && alDone ? 1 : 0);
  const intendedCount = (wantMeta ? 1 : 0) + (wantAl ? 1 : 0);
  if (intendedCount > 0 && launchedCount === intendedCount) {
    return {
      kind: "launched-both", label: "Fully Launched",
      dot: "bg-emerald-400", text: "text-emerald-300",
      pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300",
    };
  }
  if (metaDone && !alDone && wantAl) {
    return {
      kind: "launched-meta-only", label: "Partially Launched · Meta live, Applovin pending",
      dot: "bg-emerald-400", text: "text-emerald-300",
      pill: "bg-emerald-500/10 border-emerald-500/35 text-emerald-300/95",
    };
  }
  if (alDone && !metaDone && wantMeta) {
    return {
      kind: "launched-applovin-only", label: "Partially Launched · Applovin live, Meta pending",
      dot: "bg-emerald-400", text: "text-emerald-300",
      pill: "bg-emerald-500/10 border-emerald-500/35 text-emerald-300/95",
    };
  }
  if (ad.approval_status === "launched") {
    return {
      kind: "launched", label: "Ready to Launch",
      dot: "bg-emerald-400", text: "text-emerald-300/90",
      pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300",
    };
  }
  if (stillRendering) {
    return {
      kind: "generating", label: "Generating",
      dot: "bg-sky-400 animate-pulse", text: "text-sky-300",
      pill: "bg-sky-500/15 border-sky-500/45 text-sky-300",
    };
  }
  if (ad.approval_status === "pending_approval") {
    return {
      kind: "pending", label: "Pending approval",
      dot: "bg-amber-400", text: "text-amber-300/90",
      pill: "bg-amber-500/15 border-amber-500/45 text-amber-300",
    };
  }
  if (ad.approval_status === "approved") {
    if (ad.pipeline_status === "skipped") {
      return {
        kind: "dry", label: "Dry-run · approved",
        dot: "bg-muted-foreground/40", text: "text-muted-foreground/70",
        pill: "bg-muted/50 border-border/60 text-muted-foreground",
      };
    }
    if (ad.pipeline_status === "done") {
      return {
        kind: "launched", label: "Ready to Launch",
        dot: "bg-emerald-400", text: "text-emerald-300/90",
        pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300",
      };
    }
    if (ad.pipeline_status === "failed") {
      return {
        kind: "failed", label: "Push failed",
        dot: "bg-destructive", text: "text-destructive/80",
        pill: "bg-destructive/15 border-destructive/40 text-destructive",
      };
    }
    return {
      kind: "pushed", label: "Pushed · awaiting platforms",
      dot: "bg-sky-400 animate-pulse", text: "text-sky-300",
      pill: "bg-sky-500/15 border-sky-500/45 text-sky-300",
    };
  }
  switch (ad.pipeline_status) {
    case "rendering":
    case "uploading":
    case "submitting":
      return {
        kind: "rendering", label: "Rendering",
        dot: "bg-sky-400 animate-pulse", text: "text-sky-300/90",
        pill: "bg-sky-500/15 border-sky-500/45 text-sky-300",
      };
    case "done":
      return {
        kind: "done", label: "Ad created",
        dot: "bg-emerald-400", text: "text-emerald-300/90",
        pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300",
      };
    case "failed":
      return {
        kind: "failed", label: "Failed",
        dot: "bg-destructive", text: "text-destructive/80",
        pill: "bg-destructive/15 border-destructive/40 text-destructive",
      };
    case "skipped":
      return {
        kind: "dry", label: "Dry run",
        dot: "bg-muted-foreground/40", text: "text-muted-foreground/70",
        pill: "bg-muted/50 border-border/60 text-muted-foreground",
      };
    default:
      return {
        kind: "queued", label: "Queued",
        dot: "bg-muted-foreground/40", text: "text-muted-foreground/70",
        pill: "bg-muted/50 border-border/60 text-muted-foreground",
      };
  }
}

export function AdStatusPill({ ad, size = "md" }: { ad: Lineage; size?: "sm" | "md" | "lg" }) {
  const s = resolveAdStatus(ad);
  const sizeCls = size === "lg"
    ? "px-3 py-1.5 text-[12.5px] gap-2"
    : size === "sm"
    ? "px-2 py-0.5 text-[10.5px] gap-1"
    : "px-2.5 py-1 text-[11.5px] gap-1.5";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-tight uppercase ${sizeCls} ${s.pill}`}
      title={s.label}
    >
      <span className={`size-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * The new piece — one card per script in the batch, showing the full
 * lineage (ad_id, generation_id, ClickUp / brief / Drive / Frame.io
 * links, every render's status, and the inspo that informed the script).
 * ────────────────────────────────────────────────────────────────────── */

export function LineageCard({ idx, lineage, pushEnabled, buildId }: { idx: number; lineage: Lineage; pushEnabled: boolean; buildId?: string }) {
  // Defensive — old lineage rows or rows from a runner that crashed midway
  // may be missing avatar_jobs / inspo. Treat them as empty so the card
  // still renders rather than throwing on .filter / .length / .map.
  const avatarJobs = Array.isArray(lineage?.avatar_jobs) ? lineage.avatar_jobs : [];
  const inspo = Array.isArray(lineage?.inspo) ? lineage.inspo : [];
  const okCount = avatarJobs.filter((j) => j && j.ok).length;
  const totalCount = avatarJobs.length;
  return (
    <article className="rounded-xl border border-border bg-card/70 overflow-hidden">
      <header className="px-4 py-3 flex items-start gap-3 border-b border-border/40 flex-wrap">
        <div className="text-[10px] font-mono tabular-nums text-muted-foreground/70 mt-1 w-8 shrink-0">
          {String(idx).padStart(2, "0")}
        </div>
        <FileText className="size-4 text-primary mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate" title={lineage.script_title}>{lineage.script_title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{lineage.concept}</div>
          {(lineage.persona || lineage.sub_angle || lineage.cs || lineage.it_or_nn) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
              {lineage.cs && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-rose-300 font-medium" title="Creative Strategist on this ad (flows into ClickUp / Drive / brief names)">
                  CS · {lineage.cs}
                </span>
              )}
              {lineage.it_or_nn && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${lineage.it_or_nn === "IT" ? "border-amber-400/40 bg-amber-500/10 text-amber-300" : "border-blue-400/40 bg-blue-500/10 text-blue-300"}`} title={lineage.it_or_nn === "IT" ? "Iteration — reuses parent ad's script_id" : "New script — fresh script_id"}>
                  {lineage.it_or_nn === "IT" ? "iteration" : "new script"}
                </span>
              )}
              {lineage.persona && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-violet-300 font-medium">
                  persona · {lineage.persona}
                </span>
              )}
              {lineage.sub_angle && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/10 px-1.5 py-0.5 text-sky-300 font-medium">
                  sub-angle · {lineage.sub_angle}
                </span>
              )}
              {lineage.mode && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300 font-medium" title="Video mode chosen in the creator">
                  {lineage.mode === "combination" ? "without + with product" : `${lineage.mode} product`}
                </span>
              )}
              {typeof lineage.duration_estimate_sec === "number" && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${lineage.duration_estimate_sec > 60 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/50 bg-muted/30 text-muted-foreground"}`} title={`~${lineage.duration_estimate_sec}s at 170 WPM`}>
                  {lineage.word_count}w · ~{lineage.duration_estimate_sec}s
                </span>
              )}
              {lineage.approval_status && (
                <ApprovalStatusChip status={lineage.approval_status} />
              )}
            </div>
          )}
        </div>
        {/* Big per-AD status pill — same component the main log uses.
            Distinguishes Generating / Pending approval / Pushed / Launched
            on Meta / Launched on Applovin / Launched both. */}
        <AdStatusPill ad={lineage as any} size="md" />
        <PipelineStatusPill status={lineage.pipeline_status} />
        <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
          {okCount}/{totalCount} renders
        </span>
      </header>

      {lineage.approval_status === "pending_approval" && buildId && (
        <ApprovalRow buildId={buildId} generationId={lineage.generation_id} renderedOk={okCount} renderedTotal={totalCount} />
      )}

      <IdRow lineage={lineage} pushEnabled={pushEnabled} />

      <LinksRow lineage={lineage} />

      {lineage.status_detail && (
        <div className="px-4 py-2 text-[11px] text-amber-400 border-t border-border/30">
          {lineage.status_detail}
        </div>
      )}

      {lineage.brief_doc_preview && (
        <details className="border-t border-border/30">
          <summary className="cursor-pointer px-4 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 flex items-center gap-2">
            <FileText className="size-3 text-primary" />
            Brief doc preview
            <span className="ml-1 text-muted-foreground/60 normal-case font-normal">— what gets uploaded to {lineage.brief_doc_url ? "Drive" : "the auto-created doc"} when live</span>
          </summary>
          {/* Brief scroll fix (Liam: "I'm unable to scroll down to see the
              entire script"). 320px was too short and the inner scroll
              wasn't obvious. Switched to 70vh + visible scrollbar so the
              user can read the full script on any viewport. */}
          <div className="px-4 py-3 prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed bg-muted/10 border-t border-border/20 max-h-[70vh] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-border [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-[14px] [&_h1]:font-semibold [&_h2]:text-[12.5px] [&_h2]:font-semibold [&_p]:my-1.5 [&_strong]:font-semibold [&_strong]:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{lineage.brief_doc_preview}</ReactMarkdown>
          </div>
        </details>
      )}

      {avatarJobs.length > 0 && (
        <details className="border-t border-border/30" open={totalCount <= 3}>
          <summary className="cursor-pointer px-4 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 flex items-center gap-2">
            <Video className="size-3" />
            HeyGen renders ({okCount}/{totalCount})
          </summary>
          <ul className="divide-y divide-border/30">
            {avatarJobs.map((j: any, i) => {
              const mergedUrl: string | null = j?.merged_video_url || j?.final_video_url || null;
              return (
                <li key={`${j?.avatar_id || i}-${i}`} className="px-4 py-3 flex flex-col gap-2 text-[12px]">
                  <div className="flex items-center gap-3">
                    {j?.ok ? <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" /> : <XCircle className="size-3.5 text-destructive shrink-0" />}
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{(j?.avatar_id || "—").slice(0, 24)}…</span>
                    {j?.heygen_video_id && <CopyChip label="heygen_video_id" value={j.heygen_video_id} />}
                    {j?.p1_heygen_video_id && <CopyChip label="p1" value={j.p1_heygen_video_id} />}
                    {j?.p2_heygen_video_id && <CopyChip label="p2" value={j.p2_heygen_video_id} />}
                    {j?.merge_status && (
                      <span className={`text-[10px] uppercase tracking-wide font-semibold ${
                        j.merge_status === "done" ? "text-emerald-400" : j.merge_status === "failed" ? "text-destructive" : "text-sky-300"
                      }`}>
                        merge · {j.merge_status}
                      </span>
                    )}
                    {j?.error && <span className="text-destructive text-[11px] truncate">{j.error}</span>}
                  </div>
                  {/* Liam's spec: "I'm still unable to view the actual video
                      generated in the automations." Inline video player
                      shows up as soon as the merge produces a final URL. */}
                  {mergedUrl && (
                    <div className="rounded-md border border-border/50 bg-black/40 overflow-hidden max-w-xs">
                      <video
                        src={mergedUrl}
                        controls
                        preload="metadata"
                        playsInline
                        className="w-full aspect-[9/16] object-cover bg-black"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {inspo.length > 0 && (
        <details className="border-t border-border/30">
          <summary className="cursor-pointer px-4 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 flex items-center gap-2">
            <Sparkles className="size-3 text-amber-400" />
            Inspo — {inspo.length} bank ad{inspo.length === 1 ? "" : "s"} informed this script
          </summary>
          <ul className="px-4 py-2 space-y-1.5 text-[11.5px]">
            {inspo.map((x, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-muted-foreground">ad_id {x.ad_id}</span>
                <span className="truncate text-foreground">{x.concept}</span>
                {x.preview_url && <ExternalA href={x.preview_url} icon={<Video className="size-3" />}>preview</ExternalA>}
                {x.clickup_url && <ExternalA href={x.clickup_url} icon={<Clipboard className="size-3" />}>ClickUp</ExternalA>}
                {x.brief_doc_url && <ExternalA href={x.brief_doc_url} icon={<FileText className="size-3" />}>brief</ExternalA>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function IdRow({ lineage, pushEnabled }: { lineage: Lineage; pushEnabled: boolean }) {
  const items: Array<{ label: string; value: string | null; mono?: boolean; tone?: "primary" | "muted" }> = [
    { label: "Ad ID",         value: lineage.ad_id, mono: true, tone: lineage.ad_id && !lineage.ad_id.startsWith("DRY-") ? "primary" : "muted" },
    { label: "Generation ID", value: lineage.generation_id.slice(0, 8), mono: true },
    { label: "Script ID",     value: lineage.script_id ? String(lineage.script_id) : (pushEnabled ? null : "—"), mono: true },
    { label: "Pipeline job",  value: lineage.pipeline_job_id ? lineage.pipeline_job_id.slice(0, 8) : null, mono: true },
  ];
  return (
    <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] border-b border-border/30 bg-muted/10">
      {items.filter((x) => x.value !== null).map((x) => (
        <div key={x.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider text-[9.5px]">{x.label}</span>
          <span className={`${x.mono ? "font-mono" : ""} ${x.tone === "primary" ? "text-primary font-semibold" : "text-foreground"} tabular-nums`}>
            {x.value}
          </span>
          {x.value && <CopyBtn value={x.value!} />}
        </div>
      ))}
    </div>
  );
}

function LinksRow({ lineage }: { lineage: Lineage }) {
  const links: Array<{ label: string; url: string | null; icon: JSX.Element }> = [
    { label: "Preview ad",  url: lineage.ad_id && !lineage.ad_id.startsWith("DRY-") ? `https://marketing.acentecom.com/#/ads-performance?ad=${encodeURIComponent(lineage.ad_id)}` : null, icon: <Video className="size-3" /> },
    { label: "ClickUp task", url: lineage.clickup_url, icon: <Clipboard className="size-3" /> },
    { label: "Brief doc",   url: lineage.brief_doc_url, icon: <FileText className="size-3" /> },
    { label: "Drive folder", url: lineage.g_drive_link, icon: <Cloud className="size-3" /> },
    { label: "Frame.io",    url: lineage.framer_io_link, icon: <Video className="size-3" /> },
  ];
  const present = links.filter((l) => l.url);
  if (!present.length) return null;
  return (
    <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-border/30">
      {present.map((l) => (
        <ExternalA key={l.label} href={l.url!} icon={l.icon}>{l.label}</ExternalA>
      ))}
    </div>
  );
}

function ExternalA({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card hover:bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/90 transition-colors"
    >
      {icon}
      <span>{children}</span>
      <ExternalLink className="size-2.5 text-muted-foreground/70" />
    </a>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* */ }
  };
  return (
    <button onClick={copy} className="opacity-50 hover:opacity-100 transition-opacity" title="Copy">
      {copied ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
    </button>
  );
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* */ }
  };
  return (
    <button onClick={copy} className="inline-flex items-center gap-1 rounded border border-border/40 bg-muted/30 hover:bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground" title={`Copy ${label}`}>
      {copied ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
      <span>{value.slice(0, 12)}…</span>
    </button>
  );
}

function ApprovalStatusChip({ status }: { status: NonNullable<Lineage["approval_status"]> }) {
  const m: Record<NonNullable<Lineage["approval_status"]>, { cls: string; label: string }> = {
    pending_approval: { cls: "border-amber-400/40 bg-amber-500/10 text-amber-300", label: "Pending approval" },
    approved:         { cls: "border-sky-400/40 bg-sky-500/10 text-sky-300", label: "Pushing to AdsDB…" },
    launched:         { cls: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300", label: "Launched" },
    rejected:         { cls: "border-destructive/40 bg-destructive/10 text-destructive", label: "Rejected" },
  };
  const e = m[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.cls}`}>
      {e.label}
    </span>
  );
}

function ApprovalRow({ buildId, generationId, renderedOk, renderedTotal }: { buildId: string; generationId: string; renderedOk: number; renderedTotal: number }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const qc = useQueryClient();
  const callPatch = async (path: "approve" | "reject") => {
    setBusy(path);
    try {
      const r = await fetch(`${API_BASE}/api/ugc-builds/${buildId}/lineage/${generationId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({} as any));
        throw new Error(data?.message || `${r.status}`);
      }
      // Immediately re-fetch this build so the approval pill flips in the
      // UI without waiting for the polling interval (or for the user to
      // navigate away and back). Also invalidates the chat-side build
      // report bar that lists all builds for the chatId.
      qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds/${buildId}`] });
      qc.invalidateQueries({ queryKey: ["/api/ugc-builds"] });
    } catch (err: any) {
      console.error(`${path} failed:`, err);
    } finally {
      setBusy(null);
    }
  };
  const canPush = renderedOk > 0;
  return (
    <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-t border-border/30 bg-amber-500/5">
      <ShieldAlert className="size-3.5 text-amber-400 shrink-0" />
      <span className="text-[11.5px] text-muted-foreground">
        Review the {renderedOk}/{renderedTotal} HeyGen renders below, then approve to push this ad into AdsDB
        (creates the ad_id, ClickUp task, Drive folder, brief doc).
      </span>
      <div className="ml-auto inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => callPatch("reject")}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 px-2.5 py-1 text-[11px] font-medium transition-colors"
          data-testid={`approve-reject-${generationId}`}
        >
          {busy === "reject" ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
          Reject
        </button>
        <button
          type="button"
          disabled={busy !== null || !canPush}
          onClick={() => callPatch("approve")}
          title={canPush ? "Push this ad to Ready to Launch" : "Wait for at least one HeyGen render to land"}
          className="inline-flex items-center gap-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid={`approve-go-${generationId}`}
        >
          {busy === "approve" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          Push to Ready to Launch
        </button>
      </div>
    </div>
  );
}

function PipelineStatusPill({ status }: { status: Lineage["pipeline_status"] }) {
  const m: Record<Lineage["pipeline_status"], { cls: string; label: string }> = {
    pending:    { cls: "bg-muted/40 text-muted-foreground", label: "queued" },
    rendering:  { cls: "bg-sky-500/15 text-sky-300", label: "rendering" },
    uploading:  { cls: "bg-sky-500/15 text-sky-300", label: "uploading" },
    submitting: { cls: "bg-amber-500/15 text-amber-300", label: "submitting" },
    done:       { cls: "bg-emerald-500/15 text-emerald-300", label: "ad created" },
    failed:     { cls: "bg-destructive/15 text-destructive", label: "failed" },
    skipped:    { cls: "bg-muted/40 text-muted-foreground", label: "dry-run" },
  };
  const e = m[status] || m.pending;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${e.cls}`}>{e.label}</span>;
}
