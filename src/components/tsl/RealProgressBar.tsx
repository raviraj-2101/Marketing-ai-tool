// Real progress bar driven by the SSE stream — width comes from done/total, not
// a wall-clock timer. The elapsed counter is real wall-clock time since the
// generation request started. The remaining estimate is recomputed from the
// average per-image duration so far, so it adapts as the run gets faster or
// slower; it's only shown once at least one prompt has finished.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export interface RealProgressBarProps {
  /** undefined = not running. */
  progress: { done: number; succeeded: number; total: number; startedAt: number } | null;
  /** What the user is generating with — shown next to the label. */
  modelLabel: string;
  /** Header text shown to the left of the elapsed counter. */
  label: string;
  testId?: string;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function RealProgressBar({ progress, modelLabel, label, testId }: RealProgressBarProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!progress) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [progress]);

  if (!progress) return null;
  const { done, succeeded, total, startedAt } = progress;
  const elapsed = now - startedAt;
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  const fillPct = Math.max(2, ratio * 100);
  const avgPer = done > 0 ? elapsed / done : 0;
  const remaining = avgPer > 0 ? avgPer * (total - done) : 0;
  const rejected = Math.max(0, done - succeeded);

  return (
    <div className="bg-card border border-primary/30 rounded-lg p-3 shadow-sm space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span>{label}</span>
          <span className="text-[11.5px] text-muted-foreground">· {modelLabel}</span>
        </div>
        <div className="text-[11.5px] tabular-nums text-muted-foreground">
          {done}/{total} done · {fmt(elapsed)}
          {done > 0 && done < total && (
            <span className="ml-1">· ~{fmt(remaining)} left</span>
          )}
          {rejected > 0 && (
            <span className="ml-1 text-amber-500" title="Rejected by the model — bar still counts them">
              · {rejected} rejected
            </span>
          )}
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/80 to-primary rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
