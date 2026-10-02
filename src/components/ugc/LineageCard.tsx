import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AvatarJobChip, type AvatarJob } from "./AvatarJobChip";
import { AvatarVideoTile } from "./AvatarVideoTile";
import { PreLaunchPatch } from "./PreLaunchPatch";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
  RefreshCw,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronUp,
  Rocket,
  FileVideo,
  Database,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

export interface LineageEntry {
  generation_id: string;
  script_title: string;
  mode: "with" | "without" | "combination";
  cs: string;
  funnel: string;
  persona?: string;
  sub_angle?: string;
  main_pains?: string[];
  pipeline_status: "skipped" | "pending" | "rendering" | "submitting" | "done" | "failed";
  approval_status: "pending_approval" | "approved" | "launched" | "rejected";
  ad_id?: string | null;
  script_id?: string | null;
  clickup_url?: string | null;
  g_drive_link?: string | null;
  framer_io_link?: string | null;
  brief_doc_url?: string | null;
  avatar_jobs: AvatarJob[];
}

interface Props {
  entry: LineageEntry;
  buildId: string;
  onApprove: (generationId: string) => void;
  onReject: (generationId: string) => void;
  onRegenerate: (generationId: string) => void;
  onUpdated: () => void;
  approving: boolean;
  /** Endpoint family for per-avatar actions. Defaults to manual-build
   *  endpoints; automation runs pass "/api/automation-runs". */
  apiBasePath?: string;
  /** Query appended to per-avatar calls (e.g. "?user_id=..."). */
  query?: string;
  /** Automation run mode: hides the manual approve / reject / patch actions and
   *  surfaces the automation "Push to pipeline" action instead. */
  runMode?: boolean;
  /** BE proxy base for streaming private Drive videos (automation run-detail). */
  driveProxyBase?: string;
  /** Automation run mode: push this entry's rendered ads into the pipeline
   *  (Frame.io + ClickUp + ads DB) — the automation equivalent of Approve. */
  onPush?: (generationId: string) => void;
  /** generation_id currently being pushed (shows a spinner on that card). */
  pushingId?: string | null;
}

const MODE_LABEL: Record<string, string> = {
  with: "With product",
  without: "Without product",
  combination: "Combination",
};

const PIPELINE_COLOR: Record<string, string> = {
  skipped: "secondary",
  pending: "secondary",
  rendering: "outline",
  submitting: "outline",
  done: "default",
  failed: "destructive",
};

export function LineageCard({
  entry, buildId, onApprove, onReject, onRegenerate, onUpdated, approving,
  apiBasePath = "/api/ugc-builds", query = "", runMode = false, driveProxyBase,
  onPush, pushingId = null,
}: Props) {
  const [showRenders, setShowRenders] = useState(false);
  const [showPatch, setShowPatch] = useState(false);
  const [cardBusy, setCardBusy] = useState<string | null>(null); // run-mode action in flight

  const rendered = entry.avatar_jobs.filter((j) => j.final_video_url || j.merged_video_url);
  const hasVideos = rendered.length > 0;
  const hasErrors = entry.avatar_jobs.some((j) => j.ok === false);
  const isDone = entry.pipeline_status === "done";
  const isSubmitting = entry.pipeline_status === "submitting";
  const isRejected = entry.approval_status === "rejected";
  const isLaunched = entry.approval_status === "launched";
  // In automation run mode only regenerate is wired; the approval/patch actions
  // belong to the manual pipeline and are hidden.
  const canApprove = !runMode && hasVideos && !isDone && !isSubmitting && !isRejected;
  const canReject = !runMode && !isDone && !isRejected;
  // Manual "Regenerate all" stays manual-only; run mode gets its own (below).
  const canRegenerate = !runMode && hasErrors;
  const canPatch = !runMode && !isLaunched;
  const isPushing = pushingId === entry.generation_id;

  // Run-mode review gate (parity with the client /log). Push only the renders the
  // operator explicitly approved, and only once EVERY render has settled
  // (has a video or errored) so a half-baked ad can't be pushed.
  const realJobs = entry.avatar_jobs.filter((j) => j.avatar_id !== "videos-skipped");
  const okCount = rendered.length; // renders that produced a playable video
  const approvedCount = rendered.filter((j) => (j as any).approval_status === "approved").length;
  const rendersDone = realJobs.length > 0 && realJobs.every((j) => j.final_video_url || j.merged_video_url || j.error);
  const canPush = runMode && !!onPush && approvedCount > 0 && rendersDone && !isDone && !isSubmitting && !isRejected;
  const showApproveHint = runMode && rendersDone && okCount > 0 && approvedCount === 0 && !isDone && !isSubmitting && !isRejected;
  const canReviewRun = runMode && !isDone && !isSubmitting && !isLaunched;

  // Run-mode card actions (approve-all / reject / undo) — self-fetch against the
  // automation endpoints, then refresh via onUpdated.
  async function runAction(key: string, path: string, body?: unknown) {
    setCardBusy(key);
    try {
      const res = await fetch(`${API_BASE}${apiBasePath}/${buildId}/lineage/${entry.generation_id}${path}${query}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message ?? b.error ?? `${res.status}`);
      }
      onUpdated();
    } catch {
      onUpdated(); // refresh anyway so state reflects reality
    } finally {
      setCardBusy(null);
    }
  }

  return (
    <Card className={`border ${isRejected ? "border-destructive/40 opacity-70" : "border-border"}`}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="font-medium text-sm leading-tight truncate">{entry.script_title}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">{MODE_LABEL[entry.mode] ?? entry.mode}</Badge>
              <Badge variant="outline" className="text-xs">{entry.funnel}</Badge>
              <Badge variant={PIPELINE_COLOR[entry.pipeline_status] as any} className="text-xs capitalize">
                {entry.pipeline_status}
              </Badge>
              {isRejected && <Badge variant="destructive" className="text-xs">Rejected</Badge>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canPatch && (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit metadata" onClick={() => setShowPatch((v) => !v)}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {canRegenerate && (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Regenerate all renders" onClick={() => onRegenerate(entry.generation_id)}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
            {canReject && (
              <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onReject(entry.generation_id)}>
                <XCircle className="h-3 w-3 mr-1" /> Reject
              </Button>
            )}
            {canApprove && (
              <Button size="sm" onClick={() => onApprove(entry.generation_id)} disabled={approving}>
                {approving ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Approving…</>
                ) : (
                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Approve</>
                )}
              </Button>
            )}
            {/* Run-mode review controls (parity with the client /log). */}
            {canReviewRun && !isRejected && hasVideos && approvedCount < rendered.length && (
              <Button
                size="sm" variant="outline" className="h-7"
                disabled={cardBusy !== null}
                title="Approve every render in this ad"
                onClick={() => runAction("approveAll", "/avatars/bulk-approval", { status: "approved" })}
              >
                {cardBusy === "approveAll" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Approve all
              </Button>
            )}
            {canReviewRun && !isRejected && approvedCount > 0 && (
              <Button
                size="sm" variant="ghost" className="h-7 text-muted-foreground"
                disabled={cardBusy !== null}
                title="Clear approvals so you can review again from scratch"
                onClick={() => runAction("reset", "/avatars/bulk-approval", { status: "pending" })}
              >
                {cardBusy === "reset" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Reset
              </Button>
            )}
            {canReviewRun && !isRejected && hasVideos && (
              <Button
                size="sm" variant="ghost" className="h-7 text-muted-foreground"
                disabled={cardBusy !== null}
                title="Re-render every avatar for this ad (uses fresh HeyGen credits)"
                onClick={() => runAction("regenAll", "/regenerate")}
              >
                {cardBusy === "regenAll" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                Regenerate all
              </Button>
            )}
            {canReviewRun && !isRejected && (
              <Button
                size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={cardBusy !== null}
                title="Reject this ad"
                onClick={() => runAction("reject", "/reject")}
              >
                {cardBusy === "reject" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                Reject
              </Button>
            )}
            {runMode && isRejected && !isDone && (
              <Button
                size="sm" variant="outline" className="h-7"
                disabled={cardBusy !== null}
                title="Undo reject — back to pending"
                onClick={() => runAction("undo", "/undo-reject")}
              >
                {cardBusy === "undo" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                Undo reject
              </Button>
            )}
            {canPush && (
              <Button size="sm" onClick={() => onPush!(entry.generation_id)} disabled={isPushing} title={`Push the ${approvedCount} approved render${approvedCount === 1 ? "" : "s"} (of ${okCount}) into the pipeline (Frame.io + ClickUp)`}>
                {isPushing ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Pushing…</>
                ) : (
                  <><Rocket className="h-3 w-3 mr-1" /> Push {approvedCount}/{okCount} to Ready to Launch</>
                )}
              </Button>
            )}
            {showApproveHint && (
              <span className="text-[11px] text-muted-foreground">Approve at least one render to push</span>
            )}
            {runMode && isSubmitting && (
              <Badge variant="outline" className="shrink-0 inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Submitting…
              </Badge>
            )}
            {isDone && <Badge className="shrink-0 bg-green-600 text-white">Launched</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {showPatch && (
          <PreLaunchPatch
            buildId={buildId}
            generationId={entry.generation_id}
            defaults={{ cs: entry.cs, funnel: entry.funnel, persona: entry.persona, sub_angle: entry.sub_angle, main_pains: entry.main_pains }}
            onSaved={() => { setShowPatch(false); onUpdated(); }}
            onCancel={() => setShowPatch(false)}
          />
        )}

        <div className="flex flex-wrap gap-1">
          {entry.avatar_jobs.map((j) => (
            <AvatarJobChip key={j.avatar_id} job={j} pushed={isDone || isLaunched || isSubmitting} />
          ))}
        </div>

        {entry.avatar_jobs.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs text-muted-foreground px-1"
            onClick={() => setShowRenders((v) => !v)}
          >
            {showRenders ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            {showRenders ? "Hide" : "Show"} renders ({entry.avatar_jobs.length})
          </Button>
        )}

        {showRenders && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {entry.avatar_jobs.map((j) => (
              <AvatarVideoTile
                key={j.avatar_id}
                job={j}
                buildId={buildId}
                generationId={entry.generation_id}
                onUpdated={onUpdated}
                apiBasePath={apiBasePath}
                query={query}
                // Both manual + run mode now show per-render approve/disapprove,
                // regenerate (single) and delete — full parity with the client /log.
                hideApproveDelete={false}
                driveProxyBase={driveProxyBase}
                // Once a push starts (submitting) the pipeline moves the merged
                // file to Frame.io and deletes the Drive source, so the proxy
                // 500s — stop attempting playback and show the launched placeholder.
                pushed={isDone || isLaunched || isSubmitting}
                submitting={isSubmitting}
              />
            ))}
          </div>
        )}

        {isDone && (
          <div className="space-y-1.5">
            {/* Row 1 — identity badges (Ad # + Generation ID) */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {entry.ad_id && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-bold text-foreground">
                  Ad ID {entry.ad_id}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono font-bold text-foreground"
                title="Generation ID — the Video Build Log groups by this"
              >
                Generation ID {entry.generation_id}
              </span>
            </div>
            {/* Row 2 — verification + external links */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {entry.ad_id && (
                <Link
                  to={`/ugc-builder/video-build-log?q=${encodeURIComponent(entry.ad_id)}`}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  title="Find this ad in the Video Build Log"
                >
                  <FileVideo className="h-3 w-3" /> Video Build Log
                </Link>
              )}
              {entry.ad_id && (
                <Link
                  to={`/ads-management/ads-db?ad_id=${encodeURIComponent(entry.ad_id)}`}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  title="Find this ad in the Ads DB"
                >
                  <Database className="h-3 w-3" /> Ads DB
                </Link>
              )}
              {entry.clickup_url && (
                <a href={entry.clickup_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" /> ClickUp
                </a>
              )}
              {entry.g_drive_link && (
                <a href={entry.g_drive_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Drive
                </a>
              )}
              {entry.framer_io_link && (
                <a href={entry.framer_io_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Frame.io
                </a>
              )}
              {entry.brief_doc_url && (
                <a href={entry.brief_doc_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Script doc
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
