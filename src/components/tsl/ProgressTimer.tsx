// ProgressTimer.tsx — animated progress indicator with elapsed-time counter.
// Used during analyze + image-gen operations.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export interface ProgressTimerProps {
  active: boolean;
  estimatedMs: number;
  label: string;
  testId?: string;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}m ${rest.toString().padStart(2, "0")}s`;
}

export function ProgressTimer({ active, estimatedMs, label, testId }: ProgressTimerProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) return;
    setElapsedMs(0);
    const interval = setInterval(() => {
      setElapsedMs((prev) => prev + 200);
    }, 200);
    return () => clearInterval(interval);
  }, [active]);

  if (!active && elapsedMs === 0) return null;

  const ratio = Math.min(elapsedMs / Math.max(1, estimatedMs), 1);
  const fillPct = 5 + ratio * 85;

  return (
    <div className="bg-card border border-primary/30 rounded-lg p-3 shadow-sm space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span>{label}</span>
        </div>
        <div className="text-[11.5px] tabular-nums text-muted-foreground">
          {formatElapsed(elapsedMs)}
          {elapsedMs > estimatedMs && (
            <span className="ml-1 text-amber-500" title="Taking longer than expected — still working">
              · over estimate
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
