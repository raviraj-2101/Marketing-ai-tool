import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Loader2, Clock, AlertTriangle } from "lucide-react";

export interface AvatarJob {
  avatar_id: string;
  ok: boolean | null;
  error?: string | null;
  approval_status: string;
  // with/without
  heygen_video_id?: string | null;
  final_video_url?: string | null;
  // combination
  p1_heygen_video_id?: string | null;
  p2_heygen_video_id?: string | null;
  // Format-08 N-clip jobs use c1..cN slots; c1 presence = render in flight.
  c1_heygen_video_id?: string | null;
  merged_video_url?: string | null;
  merge_status?: string | null;
  // Set by the backend stall policy once auto-retry is exhausted.
  stalled?: boolean | null;
}

interface Props {
  job: AvatarJob;
  avatarName?: string;
  pushed?: boolean;
}

export function AvatarJobChip({ job, avatarName, pushed = false }: Props) {
  const label = avatarName ?? job.avatar_id.slice(0, 8);

  let icon: React.ReactNode;
  let tooltip: string;
  let color: string;

  const finalUrl = job.final_video_url ?? job.merged_video_url;
  const linkUrl = pushed ? null : finalUrl;

  if (job.ok === false || job.error) {
    icon = <XCircle className="h-3 w-3" />;
    tooltip = job.error ?? "Render failed";
    color = "bg-red-100 text-red-700 border-red-200";
  } else if (finalUrl) {
    icon = <CheckCircle2 className="h-3 w-3" />;
    tooltip = pushed ? "Pushed to pipeline — view in Frame.io" : "Video ready";
    color = "bg-green-100 text-green-700 border-green-200";
  } else if (job.stalled) {
    icon = <AlertTriangle className="h-3 w-3" />;
    tooltip = "Stalled — auto-retry exhausted. Use Regenerate to retry this clip.";
    color = "bg-orange-100 text-orange-700 border-orange-200";
  } else if (job.merge_status === "merging") {
    icon = <Loader2 className="h-3 w-3 animate-spin" />;
    tooltip = "Merging P1 + P2…";
    color = "bg-blue-100 text-blue-700 border-blue-200";
  } else if (job.heygen_video_id || job.p1_heygen_video_id || job.c1_heygen_video_id) {
    icon = <Loader2 className="h-3 w-3 animate-spin" />;
    tooltip = "HeyGen rendering…";
    color = "bg-amber-100 text-amber-700 border-amber-200";
  } else {
    icon = <Clock className="h-3 w-3" />;
    tooltip = "Queued";
    color = "bg-muted text-muted-foreground border-border";
  }

  const chip = (
    <a
      href={linkUrl ?? undefined}
      target={linkUrl ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color} ${linkUrl ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
    >
      {icon}
      {label}
    </a>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
