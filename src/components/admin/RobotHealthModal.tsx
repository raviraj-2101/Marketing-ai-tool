import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, Bot, Loader2, RefreshCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pipelineApiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ── Types (mirror GET /api/robot-health response — see shared contract §3) ──
type RobotState = "green" | "red" | "amber";

interface RobotChild {
  key: string;
  name: string;
  state: RobotState;
  reason: string;
  key_present: boolean;
}

interface Robot {
  key: string;
  name: string;
  schedule: string;
  state: RobotState;
  reason: string;
  last_run: string | null;
  last_status: string;
  log: string[];
  overdue: boolean;
  children?: RobotChild[];
}

interface RobotHealthResponse {
  summary: string;
  generated_at: string;
  robots: Robot[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// RED first, then amber, then green — the contract leaves sorting to the frontend.
const STATE_ORDER: Record<RobotState, number> = { red: 0, amber: 1, green: 2 };

const DOT_CLASS: Record<RobotState, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
};

// Robot-icon badge (a robot inside a red/amber/green circle) — one per robot row.
const ICON_BG_CLASS: Record<RobotState, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
};

const STATE_LABEL: Record<RobotState, string> = {
  green: "healthy",
  amber: "needs attention",
  red: "down",
};

function relativeLastRun(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  // e.g. "5h ago", "3d ago"
  return `${formatDistanceToNowStrict(d)} ago`;
}

function StatusDot({ state, className }: { state: RobotState; className?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full", DOT_CLASS[state], className)}
      aria-hidden="true"
    />
  );
}

// A robot icon inside a colored status circle — red = down, amber = warning,
// green = healthy. Pulses while red so a down robot is hard to miss.
function RobotStatusIcon({ state }: { state: RobotState }) {
  return (
    <span
      role="img"
      aria-label={`Robot ${STATE_LABEL[state]}`}
      title={`Robot ${STATE_LABEL[state]}`}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white/70 dark:ring-white/10",
        ICON_BG_CLASS[state],
        state === "red" && "animate-pulse",
      )}
    >
      <Bot className="h-5 w-5" />
    </span>
  );
}

export function RobotHealthModal({ open, onOpenChange }: Props) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<RobotHealthResponse>({
    queryKey: ["/api/robot-health"],
    queryFn: async () => {
      const res = await pipelineApiRequest("GET", "/api/robot-health");
      return res.json();
    },
    enabled: open, // only fetch when the modal is open
    refetchOnMount: "always", // refetch every time it opens
    staleTime: 0,
    retry: false,
  });

  const robots = [...(data?.robots ?? [])].sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>Robot Health</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCcw className={cn("h-3 w-3", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <DialogDescription>
            {isLoading
              ? "Checking the robots…"
              : data?.summary || "Status of every scheduled robot."}
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm">Loading robot health…</div>
          </div>
        )}

        {/* Error — honest, never a fake green */}
        {isError && !isLoading && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertTriangle className="h-4 w-4" />
              Couldn’t load robot health
            </div>
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-wrap break-words">
              {error instanceof Error ? error.message : "Unknown error"}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCcw className="mr-1 h-3 w-3" /> Try again
              </Button>
            </div>
          </div>
        )}

        {/* Data */}
        {!isLoading && !isError && data && (
          <div className="space-y-3 py-1">
            {robots.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No robots reported.
              </div>
            )}
            {robots.map((robot) => (
              <RobotCard key={robot.key} robot={robot} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RobotCard({ robot }: { robot: Robot }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <RobotStatusIcon state={robot.state} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="font-semibold leading-tight">{robot.name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{robot.schedule}</span>
              <span aria-hidden="true">·</span>
              <span>{relativeLastRun(robot.last_run)}</span>
            </div>
          </div>

          <div className="text-sm text-foreground/90">{robot.reason}</div>

          {robot.log && robot.log.length > 0 && (
            <ul className="space-y-0.5 pt-1 text-xs text-muted-foreground">
              {robot.log.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span aria-hidden="true">•</span>
                  <span className="break-words">{line}</span>
                </li>
              ))}
            </ul>
          )}

          {/* top_scripts_refresh children: LISTEN / SEE / WATCH */}
          {robot.children && robot.children.length > 0 && (
            <div className="mt-2 space-y-1.5 rounded-md border bg-muted/40 p-2">
              {robot.children.map((child) => (
                <div key={child.key} className="flex items-center gap-2 text-xs">
                  <StatusDot state={child.state} className="h-2.5 w-2.5" />
                  <span className="font-medium">{child.name}</span>
                  <span className="text-muted-foreground">— {child.reason}</span>
                  {!child.key_present && (
                    <Badge variant="destructive" className="ml-auto text-[10px] py-0">
                      key missing
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
