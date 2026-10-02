import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { LineageEntry } from "./LineageCard";

interface Props {
  buildStatus: string;
  lineage: LineageEntry[];
  onApproveAll: () => void;
  onRefresh: () => void;
  approvingAll: boolean;
  refreshing: boolean;
}

export function BuildStatusBanner({ buildStatus, lineage, onApproveAll, onRefresh, approvingAll, refreshing }: Props) {
  const done = lineage.filter((l) => l.pipeline_status === "done").length;
  const failed = lineage.filter((l) => l.pipeline_status === "failed").length;
  const pending = lineage.filter(
    (l) => l.pipeline_status !== "done" && l.pipeline_status !== "failed"
  ).length;

  const hasApprovable = lineage.some(
    (l) =>
      l.pipeline_status !== "done" &&
      l.pipeline_status !== "submitting" &&
      l.avatar_jobs.some((j) => j.final_video_url || j.merged_video_url)
  );

  const isBuilding = buildStatus === "running" || buildStatus === "pending";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3 mb-4">
      <div className="flex items-center gap-3">
        {isBuilding && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">{buildStatus}</Badge>
          {done > 0 && <Badge className="bg-green-600 text-white">Done {done}</Badge>}
          {pending > 0 && <Badge variant="secondary">Pending {pending}</Badge>}
          {failed > 0 && <Badge variant="destructive">Failed {failed}</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} type="button">
          <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {hasApprovable && (
          <Button size="sm" onClick={onApproveAll} disabled={approvingAll} type="button">
            {approvingAll ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Approving…</>
            ) : (
              <><CheckCircle2 className="h-3 w-3 mr-1" /> Approve All</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
