import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw, Trash2, Loader2 } from "lucide-react";
import type { AvatarJob } from "./AvatarJobChip";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

interface Props {
  job: AvatarJob;
  avatarName?: string;
  buildId: string;
  generationId: string;
  onUpdated: () => void;
  apiBasePath?: string;
  query?: string;
  hideApproveDelete?: boolean;
  hideApprove?: boolean;
  hideRegenerate?: boolean;
  hideDelete?: boolean;
  pushed?: boolean;
  submitting?: boolean;
  driveProxyBase?: string;
}

function driveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([-\w]{20,})/) || url.match(/[?&]id=([-\w]{20,})/);
  return m ? m[1] : null;
}

function VideoStatus({ job }: { job: AvatarJob }) {
  const hasVideo = job.final_video_url || job.merged_video_url;
  if (job.ok === false) return <Badge variant="destructive" className="text-xs">Failed</Badge>;
  if (hasVideo) return <Badge className="text-xs bg-green-600 text-white">Ready</Badge>;
  if (job.ok === true) return <Badge variant="outline" className="text-xs animate-pulse">Rendering…</Badge>;
  return <Badge variant="secondary" className="text-xs">Queued</Badge>;
}

export function AvatarVideoTile({
  job, avatarName, buildId, generationId, onUpdated,
  apiBasePath = "/api/ugc-builds", query = "", hideApproveDelete = false, driveProxyBase,
  hideApprove, hideRegenerate, hideDelete, pushed = false, submitting = false,
}: Props) {
  const showApprove    = !(hideApprove ?? hideApproveDelete);
  const showRegenerate = !(hideRegenerate ?? hideApproveDelete);
  const showDelete     = !(hideDelete ?? hideApproveDelete);
  const rawUrl = job.final_video_url || job.merged_video_url || null;
  
  const fid = driveProxyBase && rawUrl && rawUrl.includes("drive.google.com") ? driveFileId(rawUrl) : null;
  const videoUrl = pushed ? null : (fid ? `${API_BASE}/api/automation-runs/${buildId}/drive-video/${fid}${query}` : rawUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !videoUrl) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [videoUrl]);

  async function call(method: string, path: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}${apiBasePath}/${buildId}/lineage/${generationId}${path}${query}`, { method });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `${res.status}`);
      }
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function setApproval(status: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `${API_BASE}${apiBasePath}/${buildId}/lineage/${generationId}/avatars/${job.avatar_id}/approval${query}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `${res.status}`);
      }
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  const approvalStatus = (job as any).approval_status as string | undefined;

  return (
    <div ref={containerRef} className="border border-border rounded-lg overflow-hidden bg-card flex flex-col">
      <div className="bg-muted aspect-[9/16] relative flex items-center justify-center">
        {pushed ? (
          submitting ? (
            <div className="px-3 text-center space-y-1">
              <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
              <p className="text-[11px] font-medium text-foreground">Submitting to pipeline…</p>
              <p className="text-[10px] text-muted-foreground leading-snug">Uploading the merged video to Frame.io — the link appears here once it finishes.</p>
            </div>
          ) : (
            <div className="px-3 text-center space-y-1">
              <CheckCircle2 className="h-5 w-5 mx-auto text-green-600" />
              <p className="text-[11px] font-medium text-foreground">Pushed to pipeline</p>
              <p className="text-[10px] text-muted-foreground leading-snug">The merged video moved to Frame.io — open the Frame.io link below to view it.</p>
            </div>
          )
        ) : videoUrl ? (
          inView ? (
            <video
              className="absolute inset-0 w-full h-full object-cover"
              controls
              preload="metadata"
              src={videoUrl}
            />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )
        ) : (
          <span className="text-xs text-muted-foreground">No video</span>
        )}
      </div>

      <div className="px-2 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-medium truncate">{avatarName ?? job.avatar_id.slice(0, 8)}</p>
          <VideoStatus job={job} />
        </div>

        <div className="flex gap-1">
          {showApprove && (
            <>
              <Button
                size="icon"
                variant={approvalStatus === "approved" ? "default" : "outline"}
                className="h-6 w-6"
                disabled={busy}
                title="Approve this render"
                onClick={() => setApproval(approvalStatus === "approved" ? "pending" : "approved")}
              >
                <CheckCircle2 className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant={approvalStatus === "rejected" ? "destructive" : "outline"}
                className="h-6 w-6"
                disabled={busy}
                title="Disapprove this render"
                onClick={() => setApproval(approvalStatus === "rejected" ? "pending" : "rejected")}
              >
                <XCircle className="h-3 w-3" />
              </Button>
            </>
          )}
          {showRegenerate && (
            <Button
              size="icon"
              variant="outline"
              className="h-6 w-6"
              disabled={busy}
              title="Regenerate this render"
              onClick={() => call("POST", `/avatars/${job.avatar_id}/regenerate`)}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          )}
          {showDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
              disabled={busy}
              title="Remove this render"
              onClick={() => call("DELETE", `/avatars/${job.avatar_id}`)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
