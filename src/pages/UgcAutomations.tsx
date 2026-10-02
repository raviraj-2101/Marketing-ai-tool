import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Plus, Play, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  RefreshCw, ArrowRight, Pencil, CalendarClock, Clapperboard, Users, Megaphone, Sparkles, Zap,
  type LucideIcon,
} from "lucide-react";
import { CreateAutomationModal } from "@/components/ugc/CreateAutomationModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;
const POLL_MS  = 5000;
const AUTOMATIONS_PER_PAGE = 8;
const RECENT_RUNS_PER_PAGE = 12;

function cadenceLabel(min: number): string {
  const d = Math.round((min || 0) / 1440);
  if (d <= 0) return "—";
  if (d === 1) return "Daily";
  if (d === 7) return "Weekly";
  return `Every ${d}d`;
}

// The list reads avatar_types (the multi-select); "mix" is shown only when ALL
// three archetypes are selected. Falls back to the legacy single avatar_type
// for rows created before the multi-select feature.
function avatarTypeDisplay(auto: Automation): string {
  const types = Array.isArray(auto.avatar_types) && auto.avatar_types.length ? auto.avatar_types : null;
  if (!types) return auto.avatar_type || "mix";
  if (types.length >= 3) return "mix";
  return types.join(", ");
}

// Compact platform label for the row pills.
function platformLabel(p: string | null): string {
  return p === "meta" ? "Meta" : p === "applovin" ? "Applovin" : "Meta + Applovin";
}

// A small, clean stat pill used in the automation rows.
function Pill({ icon: Icon, children, subtle }: { icon?: LucideIcon; children: ReactNode; subtle?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight ${
        subtle ? "border-border/40 text-muted-foreground" : "border-border/60 bg-muted/50 text-foreground/80"
      }`}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 opacity-60" />}
      {children}
    </span>
  );
}

/** Page-number range with ellipses (1 … 4 5 6 … 20). */
function pageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  if (current > 3) out.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) out.push(p);
  if (current < total - 2) out.push("…");
  out.push(total);
  return out;
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1 pt-1">
      <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pageRange(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1.5 text-xs text-muted-foreground">…</span>
        ) : (
          <Button
            key={p}
            size="icon"
            variant={p === page ? "default" : "outline"}
            className="h-8 w-8 text-xs tabular-nums"
            onClick={() => onPage(p)}
          >
            {p}
          </Button>
        ),
      )}
      <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface Automation {
  id: string;
  name: string;
  mode: "NN" | "IT";
  product: string;
  angle: string | null;
  persona: string | null;
  sub_angle: string | null;
  pain_points: string[] | null;
  avatar_type: string;
  avatar_types: string[] | null;
  avatar_pool: string[] | null;
  prompt_guide: string | null;
  intended_platform: string | null;
  length_scope: string | null;
  video_mode: string | null;
  static_bar_enabled: boolean | null;
  static_bar_bg_color: string | null;
  static_bar_text_color: string | null;
  static_bar_duration_sec: number | null;
  scripts_per_run: number;
  avatars_per_script: number;
  cs_owner: string;
  interval_minutes: number;
  enabled: boolean;
  draft: boolean;
  saved_at: string | null;
  created_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface VideoSummary {
  total: number; queued: number; render: number; merging: number;
  ready: number; failed: number; stalled: number; done: number;
}

interface Run {
  id: string;
  automation_id: string;
  status: "pending" | "generating_scripts" | "rendering" | "merging"
        | "running" | "completed" | "partial" | "failed" | "stalled" | "cancelled";
  videos_summary?: VideoSummary;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

// Runs that are still working (drive the live poll + animated dot).
const ACTIVE_RUN_STATUSES = new Set([
  "pending", "generating_scripts", "rendering", "merging", "running",
]);

const STATUS_DOT: Record<string, string> = {
  pending:            "bg-yellow-400 animate-pulse",
  generating_scripts: "bg-blue-400 animate-pulse",
  rendering:          "bg-blue-400 animate-pulse",
  merging:            "bg-purple-400 animate-pulse",
  running:            "bg-blue-400 animate-pulse",
  completed:          "bg-green-500",
  partial:            "bg-amber-500",
  failed:             "bg-red-500",
  stalled:            "bg-orange-500",
  cancelled:          "bg-gray-400",
};

// Subtle per-status badge colors (bg/text/border) so each state is recognizable
// at a glance — mirrors the Video Build Log status palette.
const STATUS_BADGE_CLASS: Record<string, string> = {
  pending:            "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  generating_scripts: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  rendering:          "bg-blue-500/10 text-blue-600 border-blue-500/20",
  merging:            "bg-purple-500/10 text-purple-600 border-purple-500/20",
  running:            "bg-blue-500/10 text-blue-600 border-blue-500/20",
  completed:          "bg-green-500/10 text-green-600 border-green-500/20",
  partial:            "bg-amber-500/10 text-amber-600 border-amber-500/20",
  failed:             "bg-red-500/10 text-red-600 border-red-500/20",
  stalled:            "bg-orange-500/10 text-orange-600 border-orange-500/20",
  cancelled:          "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

// "rendering" → "Rendering"; "generating_scripts" → "Generating scripts".
function statusLabel(r: Run): string {
  const base = r.status.replace(/_/g, " ");
  if ((r.status === "rendering" || r.status === "merging") && r.videos_summary?.total) {
    return `${base} ${r.videos_summary.done}/${r.videos_summary.total}`;
  }
  if (r.status === "partial" && r.videos_summary?.total) {
    return `partial ${r.videos_summary.ready}/${r.videos_summary.total}`;
  }
  return base;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Human duration between two ISO timestamps ("42s", "2m 14s", "1h 5m").
function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Right-aligned timing label for a run: when it started + how long it took / live state.
function runTiming(r: Run): string {
  const when = fmtDate(r.started_at);
  if (r.finished_at) {
    const d = formatDuration(r.started_at, r.finished_at);
    return d ? `${when} · took ${d}` : when;
  }
  if (r.status === "running") return `${when} · running…`;
  if (r.status === "pending") return `${when} · queued`;
  return when;
}

function AutomationRow({
  auto,
  runs,
  onToggle,
  onDelete,
  onRun,
  onOpenRun,
  onEdit,
  onActivate,
}: {
  auto: Automation;
  runs: Run[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  onOpenRun: (runId: string) => void;
  onEdit: (auto: Automation) => void;
  onActivate: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const myRuns = runs.filter((r) => r.automation_id === auto.id);
  const lastRuns = myRuns.slice(0, 8);
  // Most-recent run for this automation → drives the inline status chip in the
  // footer (live "rendering 3/8" when active, or the last outcome with its color).
  const latestRun = myRuns.length
    ? [...myRuns].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
    : null;

  return (
    <Card className="border border-border transition-colors hover:border-border/80">
      <CardContent className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 leading-none">{auto.mode}</Badge>
              <span className="text-sm font-semibold truncate">{auto.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">{auto.product}</span>
              {!auto.enabled && !auto.draft && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
              {auto.draft && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                  {auto.saved_at ? "Draft · saved" : "Draft"}
                </Badge>
              )}
            </div>

            {/* Targeting subtitle — only when present */}
            {(auto.angle || auto.persona || auto.sub_angle) && (
              <p className="text-xs text-muted-foreground truncate">
                {[auto.angle, auto.persona, auto.sub_angle].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Config — clean stat pills */}
            <div className="flex flex-wrap gap-1.5">
              <Pill icon={CalendarClock}>{cadenceLabel(auto.interval_minutes)}</Pill>
              <Pill icon={Clapperboard}>{`${auto.scripts_per_run} script${auto.scripts_per_run === 1 ? "" : "s"} · ${auto.avatars_per_script} avatar${auto.avatars_per_script === 1 ? "" : "s"}`}</Pill>
              <Pill icon={Users}>{avatarTypeDisplay(auto)}</Pill>
              <Pill icon={Megaphone}>{platformLabel(auto.intended_platform)}</Pill>
              <Pill icon={Sparkles} subtle>{`CS · ${auto.cs_owner}`}</Pill>
            </div>

            {/* Footer — latest run status (live/colored) + schedule */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
              {latestRun && (
                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium capitalize ${STATUS_BADGE_CLASS[latestRun.status] ?? "bg-gray-500/10 text-gray-600 border-gray-500/20"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[latestRun.status] ?? "bg-gray-400"}`} />
                  {statusLabel(latestRun)}
                </span>
              )}
              <span className="text-muted-foreground">
                Last run {fmtDate(auto.last_run_at)} · Next {auto.enabled ? fmtDate(auto.next_run_at) : "paused"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {auto.draft && (
              <Button
                size="sm"
                variant="default"
                className="h-8 gap-1 px-2.5 text-xs"
                title="Activate this automation"
                onClick={() => onActivate(auto.id)}
              >
                <Zap className="h-3.5 w-3.5" />
                Activate
              </Button>
            )}
            {/* Draft rows are not yet schedulable: hide the enabled toggle and
                the manual-run ▶ — a draft is started via Activate only (matches
                the backend draft guards in claimDueAutomation/toggleEnabled/
                manualRun). Non-draft rows are unchanged. */}
            {!auto.draft && (
              <Switch checked={auto.enabled} onCheckedChange={(v) => onToggle(auto.id, v)} title={auto.enabled ? "Enabled" : "Paused"} />
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => onEdit(auto)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!auto.draft && (
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Run now" onClick={() => onRun(auto.id)}>
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => onDelete(auto.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
              title="Show runs"
            >
              {myRuns.length} {myRuns.length === 1 ? "run" : "runs"}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Runs — clickable rows that open the run detail page */}
        {expanded && (
          <div className="mt-3 border-t border-border pt-3">
            {lastRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No runs yet — hit ▶ to run it now.</p>
            ) : (
              <div className="space-y-0.5">
                {lastRuns.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpenRun(r.id)}
                    className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 transition-colors group"
                    title="Open run details"
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[r.status] ?? "bg-gray-400"}`} />
                    <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_BADGE_CLASS[r.status] ?? "bg-gray-500/10 text-gray-600 border-gray-500/20"}`}>{statusLabel(r)}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(r.started_at)}</span>
                    {r.error && <span className="text-xs text-destructive truncate max-w-[200px]">{r.error}</span>}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{r.id.slice(0, 8)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                  </button>
                ))}
                {myRuns.length > lastRuns.length && (
                  <p className="px-2 pt-1 text-[10.5px] text-muted-foreground">Showing latest {lastRuns.length} of {myRuns.length} runs.</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function UgcAutomations() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const navigate  = useNavigate();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs,        setRuns]        = useState<Run[]>([]);
  const [products,    setProducts]    = useState<{ id: string; name: string }[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [productFilter, setProductFilter] = useState("__all__");
  const [statusFilter, setStatusFilter]   = useState("__all__"); // __all__ | active | paused
  const [showCreate,  setShowCreate]  = useState(false);
  const [editing,     setEditing]     = useState<Automation | null>(null);
  const [autoPage,    setAutoPage]    = useState(1);
  const [runsPage,    setRunsPage]    = useState(1);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    try {
      const [autRes, runRes] = await Promise.all([
        fetch(`${API_BASE}/api/automations?user_id=${user.id}`),
        fetch(`${API_BASE}/api/automation-runs?user_id=${user.id}`),
      ]);
      if (autRes.ok) { const d = await autRes.json(); setAutomations(d.automations ?? []); }
      if (runRes.ok) { const d = await runRes.json(); setRuns(d.runs ?? []); }
    } catch { /* silent */ }
    finally { if (!silent) setLoading(false); }
  }, [user?.id]);

  // Fetch product list
  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API_BASE}/api/ugc/products`).then((r) => r.ok ? r.json() : {}).then((d) => {
      if (Array.isArray(d.products)) setProducts(d.products.map((p: any) => ({
        id:   p.id ?? p.slug ?? String(p),
        name: p.name ?? p.id ?? p.slug ?? String(p),
      })));
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const hasActive = runs.some((r) => ACTIVE_RUN_STATUSES.has(r.status));
    if (!hasActive) return;
    pollRef.current = setInterval(() => fetchAll(true), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runs, fetchAll]);

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const res = await fetch(`${API_BASE}/api/automations/${id}?user_id=${user!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, enabled } : a));
    } catch (err: any) {
      toast({ title: "Failed to toggle", description: err.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/automations/${id}?user_id=${user!.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message ?? `${res.status}`);
      }
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "Automation deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleRun(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/automations/${id}/run?user_id=${user!.id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.runId) {
        navigate(`/ugc-builder/automations/runs/${data.runId}`);
        return;
      }
      if (!res.ok) throw new Error(data.message ?? `${res.status}`);
      toast({ title: "Run started" });
      navigate(`/ugc-builder/automations/runs/${data.runId}`);
    } catch (err: any) {
      toast({ title: "Run failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleActivate(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/automations/${id}/activate?user_id=${user!.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? b.message ?? `HTTP ${res.status}`);
      }
      await fetchAll(true);
      toast({ title: "Automation activated" });
    } catch (err: any) {
      toast({ title: "Activate failed", description: err.message, variant: "destructive" });
    }
  }

  // Distinct products that actually have automations, for the product filter dropdown.
  const productOptions = useMemo(() => {
    const slugs = Array.from(new Set(automations.map((a) => a.product).filter(Boolean)));
    const nameOf = (slug: string) => products.find((p) => p.id === slug)?.name ?? slug;
    return slugs.map((slug) => ({ slug, name: nameOf(slug) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [automations, products]);

  const filtered = automations.filter((a) => {
    if (productFilter !== "__all__" && a.product !== productFilter) return false;
    if (statusFilter === "active" && !a.enabled) return false;
    if (statusFilter === "paused" && a.enabled)  return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [a.name, a.product, a.angle, a.persona].some((v) => v?.toLowerCase().includes(q));
  });

  // Any filter change → back to page 1 so results aren't hidden on a stale page.
  useEffect(() => { setAutoPage(1); }, [search, productFilter, statusFilter]);

  // Paginated automations list.
  const autoTotalPages = Math.max(1, Math.ceil(filtered.length / AUTOMATIONS_PER_PAGE));
  const autoPageSafe = Math.min(autoPage, autoTotalPages);
  const pagedAutomations = filtered.slice((autoPageSafe - 1) * AUTOMATIONS_PER_PAGE, autoPageSafe * AUTOMATIONS_PER_PAGE);

  // Recent runs across all automations, newest first — paginated.
  const sortedRuns = [...runs].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const runsTotalPages = Math.max(1, Math.ceil(sortedRuns.length / RECENT_RUNS_PER_PAGE));
  const runsPageSafe = Math.min(runsPage, runsTotalPages);
  const pagedRuns = sortedRuns.slice((runsPageSafe - 1) * RECENT_RUNS_PER_PAGE, runsPageSafe * RECENT_RUNS_PER_PAGE);

  const openRun = (runId: string) => navigate(`/ugc-builder/automations/runs/${runId}`);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Automations</h1>
            <p className="text-sm text-muted-foreground">Recurring loops that auto-generate scripts + HeyGen videos.</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> New automation
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 sm:w-40 shrink-0">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-9 sm:w-56 shrink-0">
              <SelectValue placeholder="All products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All products</SelectItem>
              {productOptions.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, product, angle, persona…"
            className="h-9 flex-1 sm:min-w-[12rem]"
          />
        </div>

        <div className="text-xs text-muted-foreground mb-3">
          Showing {filtered.length} of {automations.length} automation{automations.length === 1 ? "" : "s"}
          {filtered.length !== automations.length ? " (filtered)" : ""}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {(search || productFilter !== "__all__") ? "No automations match your filters." : "No automations yet. Create one above."}
          </p>
        ) : (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} automation{filtered.length === 1 ? "" : "s"}{(search || productFilter !== "__all__") ? " (filtered)" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {pagedAutomations.map((a) => (
                <AutomationRow
                  key={a.id}
                  auto={a}
                  runs={runs}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onRun={handleRun}
                  onOpenRun={openRun}
                  onEdit={setEditing}
                  onActivate={handleActivate}
                />
              ))}
            </div>
            <div className="mt-3">
              <Pager page={autoPageSafe} totalPages={autoTotalPages} onPage={setAutoPage} />
            </div>
          </div>
        )}

        {sortedRuns.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold">Recent runs</h2>
              <span className="text-xs text-muted-foreground tabular-nums">({sortedRuns.length})</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => fetchAll(true)} title="Refresh">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pagedRuns.map((r) => {
                const auto = automations.find((a) => a.id === r.automation_id);
                return (
                  <button
                    key={r.id}
                    onClick={() => openRun(r.id)}
                    className="flex flex-col gap-1 text-left border border-border rounded-lg px-3 py-2.5 hover:border-primary/40 hover:bg-muted/40 transition-colors group"
                    title="Open run details"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[r.status] ?? "bg-gray-400"}`} />
                      <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_BADGE_CLASS[r.status] ?? "bg-gray-500/10 text-gray-600 border-gray-500/20"}`}>{statusLabel(r)}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </div>
                    <p className="text-xs font-semibold truncate">{auto?.name ?? "Automation"}</p>
                    {auto?.product && <p className="text-[10px] font-mono text-muted-foreground truncate">{auto.product}</p>}
                    <p className="text-[11px] text-muted-foreground tabular-nums">{runTiming(r)}</p>
                    {r.error && <p className="text-[11px] text-destructive/90 line-clamp-2">↳ {r.error}</p>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <Pager page={runsPageSafe} totalPages={runsTotalPages} onPage={setRunsPage} />
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateAutomationModal
          open={showCreate}
          products={products}
          userId={user!.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => { fetchAll(true); toast({ title: "Automation created" }); }}
        />
      )}

      {editing && (
        <CreateAutomationModal
          key={editing.id}
          open={!!editing}
          products={products}
          userId={user!.id}
          automation={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); fetchAll(true); toast({ title: "Automation updated" }); }}
        />
      )}
    </DashboardLayout>
  );
}
