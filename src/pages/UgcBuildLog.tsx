/**
 * /ugc-builder/log — Generated video-ads log.
 *
 * Ported from ugc-videos-v2/client/src/pages/log.tsx.
 * Adaptations: Wouter → React Router, /api/ → ${API_BASE}/api/, remove auth headers.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ListChecks, Video, ChevronDown, ChevronUp, ChevronRight, ExternalLink, Sparkles, Loader2,
  CheckCircle2, XCircle, Circle, Clock, Copy, Check, FileText, Cloud, Clipboard,
  Trash2, RefreshCw, RotateCcw, Send, AlertTriangle, ShieldAlert, Plus,
  MessageSquare, ThumbsUp, ThumbsDown, Lock, Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { fmtCET } from "@/lib/datetime";
import { DashboardLayout } from "@/components/DashboardLayout";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type AvatarJob = {
  avatar_id: string;
  heygen_video_id: string | null;
  heygen_log_id: string | null;
  ok: boolean;
  error: string | null;
  final_video_url?: string | null;
  approval_status?: "pending" | "approved" | "rejected";
  heygen_started_at?: number | null;
  heygen_finished_at?: number | null;
  p1_heygen_video_id?: string | null;
  p1_final_video_url?: string | null;
  p2_heygen_video_id?: string | null;
  p2_final_video_url?: string | null;
  merged_video_url?: string | null;
  merge_status?: "pending" | "merging" | "done" | "failed";
};

type Lineage = {
  generation_id: string;
  script_title: string;
  concept: string;
  persona?: string | null;
  sub_angle?: string | null;
  main_pains?: string[] | null;
  cs?: string | null;
  it_or_nn?: "IT" | "NN" | null;
  ad_id: string | null;
  script_id: number | null;
  pipeline_status: "pending" | "rendering" | "uploading" | "submitting" | "done" | "failed" | "skipped";
  pipeline_job_id: string | null;
  status_detail: string | null;
  clickup_task_id: string | null;
  clickup_url: string | null;
  brief_doc_url: string | null;
  g_drive_link: string | null;
  framer_io_link: string | null;
  avatar_jobs: AvatarJob[];
  approval_status?: "pending_approval" | "approved" | "launched" | "rejected" | null;
  mode?: "with" | "without" | "combination" | null;
  word_count?: number | null;
  duration_estimate_sec?: number | null;
  brief_doc_preview?: string | null;
  variation_number?: number | null;
  source?: "chat" | "manual" | null;
  funnel?: string | null;
  pipeline_platforms?: { meta?: string; applovin?: string } | null;
};

type AvatarOption = {
  id: string;
  name: string;
  voice_name: string | null;
  image_url: string | null;
};

type Build = {
  id: string;
  user_email: string;
  chat_id: string | null;
  product: string;
  concept: string | null;
  cs: string;
  funnel: string;
  status: "pending" | "running" | "completed" | "failed";
  phase: "live" | "pending_approval";
  scripts_json: string;
  avatar_ids_json: string;
  results_json: string | null;
  lineage_json: string | null;
  persona?: string | null;
  sub_angle?: string | null;
  main_pains_json?: string | null;
  intended_platform?: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

const AvatarLookupContext = createContext<Map<string, AvatarOption>>(new Map());
const ProductNameContext = createContext<Map<string, string>>(new Map());

function useProductName(slug: string): string {
  const m = useContext(ProductNameContext);
  return m.get(slug) || slug;
}

type LogFilter = "all" | "pending" | "ready" | "launched" | "rejected" | "generating";

export default function LogPage() {
  const { email } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<LogFilter>("all");
  const [filterText, setFilterText] = useState<string>("");
  const [filterField, setFilterField] = useState<"any" | "cs" | "product" | "batch" | "ad">("any");
  const [sourceFilter, setSourceFilter] = useState<"all" | "agentic" | "human">("all");
  const buildsQ = useQuery<Build[]>({
    queryKey: [`${API_BASE}/api/ugc-builds`],
    queryFn: async () => {
      const r = await apiRequest("GET", `${API_BASE}/api/ugc-builds`);
      const data = await r.json();
      return data.builds ?? data ?? [];
    },
    refetchInterval: (q) => {
      const rows = q?.state?.data as Build[] | undefined;
      if (!rows || rows.length === 0) return false;
      return rows.some((b) => b.status === "pending" || b.status === "running") ? 4000 : false;
    },
    refetchOnWindowFocus: true,
  });
  const allBuilds = buildsQ.data || [];
  const buckets = useMemo(() => {
    const b: Record<LogFilter, number> = {
      all: allBuilds.length, pending: 0, ready: 0, launched: 0, rejected: 0, generating: 0,
    };
    for (const build of allBuilds) {
      let lineage: any[] = [];
      try { lineage = JSON.parse(build.lineage_json || "[]"); } catch { /* */ }
      let hasPending = false, hasReady = false, hasLaunched = false, hasRejected = false, hasGenerating = false;
      for (const row of lineage) {
        const a = row?.approval_status;
        if (a === "pending_approval") hasPending = true;
        else if (a === "launched") hasReady = true;
        else if (a === "rejected") hasRejected = true;
        const ppl = row?.pipeline_platforms || {};
        if (ppl.meta === "launched" || ppl.applovin === "launched") hasLaunched = true;
        const jobs = Array.isArray(row?.avatar_jobs) ? row.avatar_jobs : [];
        const isCombo = row?.mode === "combination";
        if (jobs.some((j: any) => {
          if (!j || j.error) return false;
          if (isCombo) return !!(j.p1_heygen_video_id && j.p2_heygen_video_id) && !(j.merged_video_url || j.merge_status === "done");
          return j.heygen_video_id && j.ok && !j.final_video_url;
        })) hasGenerating = true;
      }
      if (hasGenerating) b.generating++;
      if (hasPending) b.pending++;
      if (hasReady) b.ready++;
      if (hasLaunched) b.launched++;
      if (hasRejected) b.rejected++;
    }
    return b;
  }, [allBuilds]);
  const builds = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const matchText = (build: any, row?: any): boolean => {
      if (!q) return true;
      const cs = String(row?.cs || build.cs || "").toLowerCase();
      const product = String(build.product || "").toLowerCase();
      const batchId = String(build.id || "").toLowerCase();
      const adId = String(row?.ad_id || "").toLowerCase();
      const title = String(row?.script_title || row?.concept || "").toLowerCase();
      switch (filterField) {
        case "cs":      return cs.includes(q);
        case "product": return product.includes(q);
        case "batch":   return batchId.includes(q);
        case "ad":      return adId.includes(q) || title.includes(q);
        default:        return cs.includes(q) || product.includes(q) || batchId.includes(q) || adId.includes(q) || title.includes(q);
      }
    };
    const lineageHasAnyMatchingStatus = (row: any): boolean => {
      if (filter === "all") return true;
      if (filter === "pending"   && row?.approval_status === "pending_approval") return true;
      if (filter === "ready"     && row?.approval_status === "launched") return true;
      if (filter === "rejected"  && row?.approval_status === "rejected") return true;
      if (filter === "launched") {
        const ppl = row?.pipeline_platforms || {};
        if (ppl.meta === "launched" || ppl.applovin === "launched") return true;
      }
      if (filter === "generating") {
        const jobs = Array.isArray(row?.avatar_jobs) ? row.avatar_jobs : [];
        const isCombo = row?.mode === "combination";
        if (jobs.some((j: any) => {
          if (!j || j.error) return false;
          if (isCombo) return !!(j.p1_heygen_video_id && j.p2_heygen_video_id) && !(j.merged_video_url || j.merge_status === "done");
          return j.heygen_video_id && j.ok && !j.final_video_url;
        })) return true;
      }
      return false;
    };
    const sourceMatch = (build: any, row?: any): boolean => {
      if (sourceFilter === "all") return true;
      const cs = String(row?.cs || build.cs || "").toLowerCase();
      const isAgentic = cs === "agentic";
      return sourceFilter === "agentic" ? isAgentic : !isAgentic;
    };
    return allBuilds.filter((build) => {
      let lineage: any[] = [];
      try { lineage = JSON.parse(build.lineage_json || "[]"); } catch { return false; }
      if (!sourceMatch(build) && !lineage.some((r) => sourceMatch(build, r))) return false;
      const buildMatch = matchText(build);
      const someRowMatches = lineage.some((row: any) =>
        matchText(build, row) && lineageHasAnyMatchingStatus(row) && sourceMatch(build, row),
      );
      return someRowMatches || (buildMatch && lineage.some((r) => lineageHasAnyMatchingStatus(r) && sourceMatch(build, r)));
    });
  }, [allBuilds, filter, filterText, filterField, sourceFilter]);

  const avatarsQ = useQuery<AvatarOption[]>({
    queryKey: [`${API_BASE}/api/options/avatars`, "all-for-log"],
    queryFn: async () => {
      const r = await apiRequest("GET", `${API_BASE}/api/options/avatars?type=mix`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const productsQ = useQuery<Array<{ id: string; name: string }>>({
    queryKey: [`${API_BASE}/api/products`],
    queryFn: async () => {
      const r = await apiRequest("GET", `${API_BASE}/api/products`);
      const data = await r.json();
      return data.products ?? data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
  const productNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQ.data || []) m.set(p.id, p.name);
    return m;
  }, [productsQ.data]);
  const avatarLookup = useMemo(() => {
    const map = new Map<string, AvatarOption>();
    for (const a of avatarsQ.data || []) map.set(a.id, a);
    return map;
  }, [avatarsQ.data]);

  const buildIdsNeedingRefresh = useMemo(() => {
    const ids: string[] = [];
    for (const b of builds) {
      let lineage: Lineage[] = [];
      try { lineage = JSON.parse(b.lineage_json || "[]"); } catch { /* */ }
      const pending = lineage.some((ln) => {
        const isCombo = ln.mode === "combination";
        return (ln.avatar_jobs || []).some((j) => {
          if (j?.error) return false;
          if (isCombo) {
            const submitted = !!(j?.p1_heygen_video_id && j?.p2_heygen_video_id);
            const mergeTerminal = j?.merge_status === "done" || j?.merge_status === "failed" || !!j?.merged_video_url;
            return submitted && !mergeTerminal;
          }
          return j?.heygen_video_id && j?.ok && !j?.final_video_url;
        });
      });
      if (pending) ids.push(b.id);
    }
    return ids;
  }, [builds]);
  useEffect(() => {
    if (buildIdsNeedingRefresh.length === 0) return;
    let cancelled = false;
    const refreshOnce = async () => {
      for (const id of buildIdsNeedingRefresh) {
        if (cancelled) return;
        try {
          const r = await apiRequest("POST", `${API_BASE}/api/ugc-builds/${id}/refresh-videos`);
          await r.json().catch(() => ({}));
        } catch { /* swallow — next tick retries */ }
      }
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds`] });
      }
    };
    refreshOnce();
    const t = setInterval(refreshOnce, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [buildIdsNeedingRefresh.join("|")]);

  const stats = useMemo(() => {
    let ads = 0, videosOk = 0, videosTotal = 0;
    let pendingApproval = 0, launched = 0, rejected = 0;
    for (const b of builds) {
      let lineage: Lineage[] = [];
      try { lineage = JSON.parse(b.lineage_json || "[]"); } catch { /* */ }
      for (const l of lineage) {
        ads++;
        for (const j of l.avatar_jobs || []) {
          videosTotal++;
          if (j.ok) videosOk++;
        }
        const a = l.approval_status;
        if (a === "pending_approval") pendingApproval++;
        else if (a === "launched") launched++;
        else if (a === "rejected") rejected++;
      }
    }
    return { batches: builds.length, ads, videosOk, videosTotal, pendingApproval, launched, rejected };
  }, [builds]);

  return (
    <DashboardLayout>
    <AvatarLookupContext.Provider value={avatarLookup}>
    <ProductNameContext.Provider value={productNames}>
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 pt-10 pb-12 space-y-7">
          <header className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Acentecom · UGC Log
              </div>
              <h1 className="text-[42px] sm:text-[48px] font-bold tracking-tight leading-[1.05] text-foreground">
                Welcome back,{" "}
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  {(email || "").split("@")[0] || "Liam"}.
                </span>
              </h1>
            </div>
            <a
              href="/ugc-builder/batch-creator"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 text-[14px] font-semibold shadow-[0_0_24px_rgba(99,102,241,0.35)] transition"
            >
              <Plus className="size-4" />
              Launch new batch
              <span className="ml-1 -mr-1 opacity-70">→</span>
            </a>
          </header>

          <MetricStrip stats={stats} loading={buildsQ.isLoading} fetching={buildsQ.isFetching} />

          {!buildsQ.isLoading && allBuilds.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pb-1">
              <select
                value={filterField}
                onChange={(e) => setFilterField(e.target.value as any)}
                className="h-8 rounded-md border border-border/70 bg-card px-2 text-[11.5px] font-medium text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40"
                data-testid="log-filter-field"
                title="Pick which field to text-filter against"
              >
                <option value="any">Any field</option>
                <option value="cs">CS</option>
                <option value="product">Product</option>
                <option value="batch">Batch ID</option>
                <option value="ad">Ad ID / title</option>
              </select>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder={filterField === "any" ? "Filter by CS, product, batch ID, or ad ID…" : `Filter by ${filterField}…`}
                className="h-8 flex-1 min-w-[200px] max-w-[420px] rounded-md border border-border/70 bg-background px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/65 focus:outline-none focus:ring-1 focus:ring-primary/40"
                data-testid="log-filter-text"
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => { setFilterText(""); setFilterField("any"); }}
                  className="h-8 rounded-md border border-border/70 bg-muted/30 hover:bg-muted/50 px-2 text-[11.5px] font-medium text-muted-foreground"
                  data-testid="log-filter-clear"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {!buildsQ.isLoading && allBuilds.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { id: "all" as const,        label: "All",            tone: "bg-primary/15 text-primary border-primary/40" },
                { id: "pending" as const,    label: "Pending approval", tone: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
                { id: "generating" as const, label: "Generating",     tone: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
                { id: "ready" as const,      label: "Ready to Launch",tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
                { id: "launched" as const,   label: "Launched",       tone: "bg-emerald-500/25 text-emerald-200 border-emerald-500/55" },
                { id: "rejected" as const,   label: "Rejected",       tone: "bg-destructive/15 text-destructive border-destructive/40" },
              ]).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                    filter === f.id ? f.tone + " ring-1 ring-white/20" : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
                  }`}
                  data-testid={`log-filter-${f.id}`}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{buckets[f.id]}</span>
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-border/60" aria-hidden />
              {([
                { id: "all" as const,     label: "All sources" },
                { id: "agentic" as const, label: "Agentic" },
                { id: "human" as const,   label: "Human" },
              ]).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSourceFilter(s.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                    sourceFilter === s.id
                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/40 ring-1 ring-white/20"
                      : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
                  }`}
                  data-testid={`log-source-filter-${s.id}`}
                  title={s.id === "agentic"
                    ? "Show only automation-generated batches"
                    : s.id === "human"
                      ? "Show only batches authored by a human CS (Claude / Liam / etc.)"
                      : "Show batches from any source"}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {!buildsQ.isLoading && builds.length > 0 && (
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold tracking-tight">Batches</h2>
              <span className="text-[11.5px] text-muted-foreground tabular-nums">
                {builds.length} {builds.length === 1 ? "batch" : "batches"}{filter !== "all" ? ` (filtered)` : ""}
              </span>
            </div>
          )}
          {buildsQ.isLoading && (
            <div className="rounded-2xl border border-border/70 bg-card shadow-sm px-6 py-12 text-center text-[12.5px] text-muted-foreground">
              <Loader2 className="size-5 mx-auto animate-spin mb-2" />
              Loading batches…
            </div>
          )}
          {!buildsQ.isLoading && builds.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/85 bg-card shadow-sm px-8 py-16 text-center">
              <div className="size-12 mx-auto rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Video className="size-5" />
              </div>
              <h3 className="text-[15px] font-semibold mb-1.5">No batches yet</h3>
              <p className="text-[13px] text-muted-foreground max-w-md mx-auto mb-5">
                Every ad you generate from <span className="text-foreground">Generate Video Ads</span>{" "}
                or push from a chat lands here, grouped by batch.
              </p>
              <a
                href="/ugc-builder/batch-creator"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-[13px] font-semibold shadow-sm"
              >
                <Plus className="size-4" />
                Create your first batch
              </a>
            </div>
          )}
          {builds.map((b) => (
            <BatchRow key={b.id} build={b} />
          ))}
        </div>
      </main>
    </div>
    </ProductNameContext.Provider>
    </AvatarLookupContext.Provider>
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stats strip
// ─────────────────────────────────────────────────────────────────────────

function MetricStrip({ stats, loading, fetching }: {
  stats: { batches: number; ads: number; videosOk: number; videosTotal: number; pendingApproval: number; launched: number; rejected: number };
  loading: boolean;
  fetching: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Batches" value={stats.batches} accent="emerald" loading={loading} />
        <MetricCard label="Ads" value={stats.ads} accent="indigo" loading={loading} />
        <MetricCard label="Videos rendered" value={`${stats.videosOk}/${stats.videosTotal}`} accent="violet" loading={loading} />
        <MetricCard
          label="Pending approval"
          value={stats.pendingApproval}
          accent={stats.pendingApproval > 0 ? "amber" : "cyan"}
          sub={stats.launched ? `${stats.launched} launched` : "0 rejected"}
          loading={loading}
        />
      </div>
      <div className="flex items-center gap-3 text-[12.5px] flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-1">
          <Check className="size-3" />
          {stats.videosOk}/{stats.videosTotal} renders ready
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 text-muted-foreground px-3 py-1">
          {stats.batches} {stats.batches === 1 ? "batch" : "batches"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 text-muted-foreground px-3 py-1">
          {stats.launched} launched
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 text-muted-foreground px-3 py-1">
          <span className={`size-1.5 rounded-full ${fetching ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/50"}`} />
          {fetching ? "Refreshing" : "Live"}
        </span>
      </div>
    </section>
  );
}

function MetricCard({
  label, value, accent = "indigo", sub, loading,
}: {
  label: string;
  value: number | string;
  accent?: "emerald" | "indigo" | "violet" | "cyan" | "amber";
  sub?: string;
  loading?: boolean;
}) {
  const accentMap = {
    emerald: { glow: "from-emerald-500/25", ring: "ring-emerald-500/20", eyebrow: "text-emerald-300/80" },
    indigo:  { glow: "from-indigo-500/30",  ring: "ring-indigo-500/20",  eyebrow: "text-indigo-300/80" },
    violet:  { glow: "from-violet-500/30",  ring: "ring-violet-500/20",  eyebrow: "text-violet-300/80" },
    cyan:    { glow: "from-cyan-500/25",    ring: "ring-cyan-500/20",    eyebrow: "text-cyan-300/80" },
    amber:   { glow: "from-amber-500/25",   ring: "ring-amber-500/20",   eyebrow: "text-amber-300/80" },
  }[accent];
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-card ring-1 ${accentMap.ring} px-6 py-5 min-h-[150px] flex flex-col justify-between`}>
      <div
        className={`pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-gradient-radial ${accentMap.glow} to-transparent blur-2xl opacity-90`}
        style={{ background: `radial-gradient(circle at center, hsl(var(--${
          accent === "emerald" ? "chart-1" :
          accent === "indigo" ? "chart-2" :
          accent === "violet" ? "chart-3" :
          accent === "cyan" ? "chart-4" : "chart-5"
        }) / 0.30), transparent 70%)` }}
      />
      <div className={`relative text-[11px] uppercase tracking-[0.16em] font-semibold ${accentMap.eyebrow}`}>
        {label}
      </div>
      {loading ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground/70 relative" />
      ) : (
        <div className="relative">
          <div className="text-[44px] font-bold tabular-nums tracking-tight leading-none text-foreground">
            {value}
          </div>
          {sub && (
            <div className="mt-2 text-[12px] text-muted-foreground tabular-nums">
              {sub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Batch row
// ─────────────────────────────────────────────────────────────────────────

function BatchRow({ build }: { build: Build }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [bulkPushing, setBulkPushing] = useState(false);
  const productName = useProductName(build.product);
  const lineage = useMemo<Lineage[]>(() => {
    try { return JSON.parse(build.lineage_json || "[]"); } catch { return []; }
  }, [build.lineage_json]);
  const counts = useMemo(() => {
    let pending = 0, launched = 0, rejected = 0, pushReady = 0;
    for (const l of lineage) {
      const a = l.approval_status;
      if (a === "pending_approval") {
        pending++;
        const jobs = Array.isArray(l.avatar_jobs) ? l.avatar_jobs : [];
        if (jobs.some((j) => j?.ok && j?.approval_status === "approved")) pushReady++;
      } else if (a === "launched") launched++;
      else if (a === "rejected") rejected++;
    }
    return { total: lineage.length, pending, launched, rejected, pushReady };
  }, [lineage]);

  const batchRenderState = useMemo(() => {
    let total = 0, terminal = 0, errored = 0;
    for (const l of lineage) {
      const isCombo = l.mode === "combination";
      for (const j of l.avatar_jobs || []) {
        total++;
        if (j?.error) { errored++; terminal++; continue; }
        const done = isCombo
          ? (!!j?.merged_video_url || j?.merge_status === "done" || j?.merge_status === "failed")
          : !!(j?.heygen_video_id && j?.final_video_url);
        if (done) terminal++;
      }
    }
    const rendering = total > 0 && terminal < total;
    return { rendering, allDone: total > 0 && terminal === total, anyError: errored > 0, pendingCount: total - terminal, totalRenders: total };
  }, [lineage]);

  const onPushAll = async () => {
    if (bulkPushing || counts.pushReady === 0) return;
    setBulkPushing(true);
    try {
      const r = await apiRequest("POST", `${API_BASE}/api/ugc-builds/${build.id}/approve-all-pending`);
      await r.json().catch(() => ({}));
      qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds`] });
    } catch (err) {
      console.error("approve-all-pending failed:", err);
    } finally {
      setBulkPushing(false);
    }
  };

  return (
    <article className="rounded-xl bg-card ring-1 ring-border shadow-sm overflow-hidden">
      <header
        className="px-6 py-5 flex items-center gap-5 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        data-testid={`batch-toggle-${build.id}`}
      >
        <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Video className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[16px] font-semibold tracking-tight text-foreground truncate" title={build.concept || ""}>
              {build.concept || "Untitled batch"}
            </span>
            <CopyBadge label="Batch" value={build.id} accent="primary" compact />
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-[12px] font-semibold tracking-tight text-primary" title={`Creative strategist: ${build.cs}`}>
              CS · {build.cs}
            </span>
            <span className="text-foreground/85 font-semibold truncate" title={build.product}>{productName}</span>
            <span className="text-muted-foreground/65 shrink-0">·</span>
            <span className="shrink-0">{build.funnel}</span>
            {(build as any).intended_platform && (
              <>
                <span className="text-muted-foreground/65 shrink-0">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11.5px] text-sky-300" title="Intended launch platforms">
                  <span className="font-bold uppercase tracking-wide text-sky-200/90 text-[10.5px]">Intended</span>
                  <span className="font-semibold">{(() => {
                    const v = String((build as any).intended_platform).toLowerCase();
                    if (v === "both") return "Meta + Applovin";
                    if (v === "meta") return "Meta only";
                    if (v === "applovin") return "Applovin only";
                    return v;
                  })()}</span>
                </span>
              </>
            )}
            {(build as any).persona && (
              <>
                <span className="text-muted-foreground/65 shrink-0">·</span>
                <span className="text-foreground/75 truncate">{(build as any).persona}</span>
              </>
            )}
            <span className="text-muted-foreground/65 shrink-0 hidden md:inline">·</span>
            <span className="tabular-nums shrink-0 hidden md:inline">{fmtCET(build.started_at)}</span>
          </div>
        </div>
        <div className="hidden md:flex items-stretch gap-6 text-right shrink-0">
          {counts.pending > 0 && <KpiCell value={counts.pending} label="Pending" tone="amber" />}
          {counts.rejected > 0 && <KpiCell value={counts.rejected} label="Rejected" tone="destructive" />}
        </div>
        <span className="md:hidden inline-flex items-baseline gap-1 text-[13px] tabular-nums shrink-0">
          {counts.pending > 0 && (
            <>
              <span className="font-semibold text-amber-600">{counts.pending}</span>
              <span className="text-muted-foreground/65">/</span>
            </>
          )}
          <span className="text-muted-foreground">{counts.total}</span>
        </span>
        <span className="text-muted-foreground/75 shrink-0" aria-hidden="true">
          {open ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </span>
      </header>

      {open && (
        <div className="border-t border-border/85 bg-muted/10 divide-y divide-border/30">
          {build.status === "running" && lineage.length === 0 && (
            <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-6 text-center text-[12px] text-muted-foreground m-4">
              <Loader2 className="size-4 mx-auto animate-spin mb-1.5" />
              Generating scripts and queuing renders…
            </div>
          )}
          {build.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive m-4">
              {build.error}
            </div>
          )}
          {counts.pushReady > 0 && (
            <div className="px-5 py-2.5 flex items-center gap-3 bg-primary/5 border-b border-primary/15">
              <Send className="size-3.5 text-primary shrink-0" />
              <span className="text-[11.5px] text-foreground/90">
                <span className="font-semibold">{counts.pushReady}</span>
                <span className="text-muted-foreground"> of {counts.pending} pending ad{counts.pending === 1 ? "" : "s"} ready to launch — push them in parallel.</span>
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPushAll(); }}
                disabled={bulkPushing}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid={`batch-push-all-${build.id}`}
              >
                {bulkPushing ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3.5" />}
                {bulkPushing ? `Pushing ${counts.pushReady}…` : `Push ${counts.pushReady} ad${counts.pushReady === 1 ? "" : "s"} to Pipeline`}
              </button>
            </div>
          )}
          {lineage.map((l, i) => (
            <AdRow key={l.generation_id} build={build} ad={l} idx={i + 1} />
          ))}
        </div>
      )}
    </article>
  );
}

function friendlyHeygenError(raw: string | null | undefined): string {
  if (!raw) return "Render failed";
  const s = String(raw);
  if (/429|rate_limit/i.test(s)) return "Rate limited — try Regenerate in a minute";
  if (/404/.test(s) && /avatar/i.test(s)) return "Avatar not found in HeyGen — pick a different one";
  if (/quota|insufficient/i.test(s)) return "HeyGen quota — top up the account";
  if (/invalid.*script|content.*policy|safety/i.test(s)) return "HeyGen rejected the script — try wording it differently";
  if (/timeout|timed out/i.test(s)) return "Timed out reaching HeyGen — Regenerate to retry";
  if (/network|fetch failed|ECONNREFUSED/i.test(s)) return "Network error reaching HeyGen — Regenerate to retry";
  const cleaned = s.replace(/\{.*\}/s, "").trim().slice(0, 120);
  return cleaned || "Render failed";
}

function LazyVideo({ src }: { src: string }) {
  const containerRef = useState<HTMLDivElement | null>(null);
  const ref = containerRef[0];
  const setRef = containerRef[1];
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref || visible || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setVisible(true); io.disconnect(); break; }
      }
    }, { rootMargin: "200px 0px" });
    io.observe(ref);
    return () => io.disconnect();
  }, [ref, visible]);
  return (
    <div ref={setRef} className="w-full h-full">
      <video src={src} controls preload={visible ? "auto" : "none"} playsInline className="w-full h-full object-cover bg-black" />
    </div>
  );
}

function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function KpiCell({ value, label, tone }: { value: number; label: string; tone: "amber" | "emerald" | "destructive" | "muted" }) {
  const valueCls = { amber: "text-amber-600", emerald: "text-emerald-600", destructive: "text-destructive", muted: "text-foreground/70" }[tone];
  return (
    <div className="flex flex-col items-end justify-center min-w-[56px]">
      <span className={`text-[18px] font-semibold tabular-nums leading-none ${valueCls}`}>{value}</span>
      <span className="mt-1 text-[10.5px] uppercase tracking-wider font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function BatchStatusDot({ status }: { status: Build["status"] }) {
  if (status === "running" || status === "pending") return <Loader2 className="size-3.5 text-amber-400 animate-spin shrink-0" />;
  if (status === "failed") return <XCircle className="size-3.5 text-destructive shrink-0" />;
  return <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />;
}

function BatchStatusBadge({ build, renderState, counts }: {
  build: Build;
  renderState: { rendering: boolean; allDone: boolean; anyError: boolean; pendingCount: number; totalRenders: number };
  counts: { total: number; pending: number; launched: number; rejected: number; pushReady: number };
}) {
  if (build.status === "failed") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
      <XCircle className="size-3" />Failed
    </span>
  );
  if (renderState.rendering) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider" title={`${renderState.pendingCount} of ${renderState.totalRenders} renders still generating`}>
      <Loader2 className="size-3 animate-spin" />
      Generating · {renderState.totalRenders - renderState.pendingCount}/{renderState.totalRenders}
    </span>
  );
  if (counts.pending > 0) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
      <ShieldAlert className="size-3" />Pending review
    </span>
  );
  if (counts.launched > 0) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
      <CheckCircle2 className="size-3" />Launched
    </span>
  );
  if (counts.rejected > 0 && counts.rejected === counts.total) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
      <XCircle className="size-3" />Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
      <CheckCircle2 className="size-3" />Ready
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ad row
// ─────────────────────────────────────────────────────────────────────────

function AdRow({ build, ad, idx }: { build: Build; ad: Lineage; idx: number }) {
  const qc = useQueryClient();
  const productName = useProductName(build.product);
  const [busy, setBusy] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(false);
  const isPending = ad.approval_status === "pending_approval";
  const isLaunched = ad.approval_status === "launched";
  const isRejected = ad.approval_status === "rejected";
  const avatarJobs = Array.isArray(ad.avatar_jobs) ? ad.avatar_jobs : [];
  const okCount = avatarJobs.filter((j) => j?.ok).length;
  const totalCount = avatarJobs.length;
  const approvedCount = avatarJobs.filter((j) => j?.approval_status === "approved").length;
  const isCombo = ad.mode === "combination";
  const isJobTerminal = (j: AvatarJob): boolean => {
    if (j?.error) return true;
    if (isCombo) return !!j?.merged_video_url || j?.merge_status === "done" || j?.merge_status === "failed";
    return !!(j?.heygen_video_id && j?.final_video_url);
  };
  const settledCount = avatarJobs.filter(isJobTerminal).length;
  const rendersDone = totalCount > 0 && settledCount === totalCount;

  const buildStartedMs = (build.started_at || 0) * (build.started_at && build.started_at < 1e12 ? 1000 : 1);
  const startedStamps = avatarJobs.map((j: any) => (typeof j?.heygen_started_at === "number" ? j.heygen_started_at : null)).filter((t): t is number => t !== null);
  const finishedStamps = avatarJobs.map((j: any) => (typeof j?.heygen_finished_at === "number" ? j.heygen_finished_at : null)).filter((t): t is number => t !== null);
  const renderStartMs = startedStamps.length > 0 ? Math.min(...startedStamps) : buildStartedMs;
  const allFinished = rendersDone && finishedStamps.length === avatarJobs.length && avatarJobs.length > 0;
  const renderEndMs = allFinished ? Math.max(...finishedStamps) : null;
  const buildSettled = build.status === "completed" || build.status === "failed";
  const showLive = !rendersDone;
  const now = useTickingNow(showLive);
  const MAX_LIVE_MS = 30 * 60 * 1000;
  let elapsedMs: number | null = null;
  if (renderEndMs && renderStartMs && renderEndMs > renderStartMs) {
    elapsedMs = renderEndMs - renderStartMs;
  } else if (rendersDone && buildSettled && build.finished_at) {
    const endedAtMs = build.finished_at * (build.finished_at < 1e12 ? 1000 : 1);
    if (endedAtMs > buildStartedMs) elapsedMs = endedAtMs - buildStartedMs;
  } else if (showLive && renderStartMs) {
    const raw = now - renderStartMs;
    elapsedMs = raw > 0 && raw <= MAX_LIVE_MS ? raw : null;
  }
  const durationLabel = formatDuration(elapsedMs);
  const isDone = !showLive;

  const callAvatarApproval = async (avatarId: string, status: "approved" | "rejected" | "pending") => {
    setBusy(`approval:${avatarId}`);
    try {
      const r = await apiRequest("POST", `${API_BASE}/api/ugc-builds/${build.id}/lineage/${ad.generation_id}/avatars/${avatarId}/approval`, { status });
      await r.json().catch(() => ({}));
      qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds`] });
    } catch (err) {
      console.error("avatar approval failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const callAvatarBulk = async (status: "approved" | "rejected" | "pending") => {
    setBusy(status === "approved" ? "bulk-approve" : `bulk-${status}`);
    try {
      const r = await apiRequest("POST", `${API_BASE}/api/ugc-builds/${build.id}/lineage/${ad.generation_id}/avatars/bulk-approval`, { status });
      await r.json().catch(() => ({}));
      qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds`] });
    } catch (err) {
      console.error("bulk approval failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const callAction = async (kind: "approve" | "reject" | "undo-reject" | "regenerate" | "delete-avatar" | "regenerate-all", payload?: any) => {
    setBusy(kind);
    try {
      const url =
        kind === "approve" || kind === "reject" || kind === "undo-reject"
          ? `${API_BASE}/api/ugc-builds/${build.id}/lineage/${ad.generation_id}/${kind}`
          : kind === "regenerate-all"
          ? `${API_BASE}/api/ugc-builds/${build.id}/lineage/${ad.generation_id}/regenerate`
          : kind === "regenerate"
          ? `${API_BASE}/api/ugc-builds/${build.id}/lineage/${ad.generation_id}/avatars/${payload?.avatarId}/regenerate`
          : `${API_BASE}/api/ugc-builds/${build.id}/lineage/${ad.generation_id}/avatars/${payload?.avatarId}`;
      const method = kind === "delete-avatar" ? "DELETE" : "POST";
      const r = await apiRequest(method, url, payload || {});
      const body = await r.json().catch(() => ({}));
      if (kind === "regenerate-all" && Array.isArray((body as any)?.results)) {
        const fails = (body as any).results.filter((x: any) => !x.ok);
        if (fails.length) {
          window.alert(
            `${fails.length} of ${(body as any).results.length} regenerations failed.\n\n` +
              fails.map((f: any) => `  • ${(f.avatar_id || "").slice(0, 8)}: ${f.error || "unknown"}`).join("\n"),
          );
        }
      }
      qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds`] });
    } catch (err: any) {
      console.error(`${kind} failed:`, err);
      window.alert(`${kind} failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={`bg-transparent overflow-hidden ${isRejected ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors text-left group"
        data-testid={`ad-toggle-${ad.generation_id}`}
        aria-expanded={expanded}
      >
        <AdStatusDot ad={ad} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-medium tracking-tight text-foreground truncate" title={ad.script_title}>
              {ad.concept || ad.script_title}
            </span>
            <AdStatusPill ad={ad} size="md" />
            {typeof ad.variation_number === "number" && ad.variation_number > 0 && (
              <span className="shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground/70 bg-muted/30 border border-border/70 rounded px-1 py-0" title={`Variation v${ad.variation_number}`}>
                v{ad.variation_number}
              </span>
            )}
            <CopyBadge
              label="Ad"
              value={`${build.id.slice(0, 8)}.${idx}-${(ad.script_title || ad.concept || "").slice(0, 20).replace(/\s+/g, "_")}`}
              accent="muted"
              compact
            />
            <CopyBadge label="Gen" value={ad.generation_id} accent="muted" compact />
            {ad.source === "chat" && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-medium text-primary" title="This ad's script was authored in chat">
                <MessageSquare className="size-2.5" />
                Imported from chat
              </span>
            )}
            {ad.ad_id && !ad.ad_id.startsWith("DRY-") && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ad.ad_id!).catch(() => {}); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(ad.ad_id!).catch(() => {}); } }}
                className="shrink-0 text-[10.5px] font-mono text-muted-foreground/75 tabular-nums hover:text-foreground transition-colors cursor-pointer"
                title={`Copy Ad ID ${ad.ad_id}`}
              >
                {ad.ad_id}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/70 truncate">
            <span className="truncate text-foreground/70 font-medium" title={build.product}>{productName}</span>
            {ad.mode && (
              <>
                <span className="text-muted-foreground/25 shrink-0">·</span>
                <span className="truncate">{ad.mode === "combination" ? "without + with" : `${ad.mode} product`}</span>
              </>
            )}
            {typeof ad.duration_estimate_sec === "number" && (
              <>
                <span className="text-muted-foreground/25 shrink-0">·</span>
                <span className={`shrink-0 tabular-nums ${ad.duration_estimate_sec > 60 ? "text-destructive/80" : ""}`}>~{ad.duration_estimate_sec}s</span>
              </>
            )}
            {ad.cs && (<><span className="text-muted-foreground/25 shrink-0">·</span><span className="truncate">{ad.cs}</span></>)}
            {ad.persona && (<><span className="text-muted-foreground/25 shrink-0">·</span><span className="truncate text-violet-300/80">{ad.persona}</span></>)}
            {ad.sub_angle && (<><span className="text-muted-foreground/25 shrink-0">·</span><span className="truncate text-sky-300/80">{ad.sub_angle}</span></>)}
            {totalCount > 0 && (<><span className="text-muted-foreground/25 shrink-0">·</span><span className="shrink-0 tabular-nums">{totalCount} {totalCount === 1 ? "avatar" : "avatars"}</span></>)}
            {typeof ad.duration_estimate_sec !== "number" && (() => {
              const txt = (ad.brief_doc_preview || "").trim();
              const wc = (txt.match(/\b\w+\b/g) || []).length;
              if (wc < 20) return null;
              const sec = Math.round((wc / 170) * 60);
              return (<><span className="text-muted-foreground/25 shrink-0">·</span><span className={`shrink-0 tabular-nums ${sec > 60 ? "text-destructive/80" : ""}`}>~{sec}s</span></>);
            })()}
          </div>
        </div>
        <ChevronRight className={`size-4 text-muted-foreground/65 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} />
      </button>

      {!expanded ? null : (<>
      {isRejected && (
        <div className="px-6 py-3 flex items-center gap-3 border-t border-destructive/30 bg-destructive/[0.07]">
          <Trash2 className="size-3.5 text-destructive shrink-0" />
          <span className="text-[12px] text-foreground/85 flex-1">
            This ad was rejected.{" "}
            {ad.status_detail && ad.status_detail !== "Rejected." && (
              <span className="text-muted-foreground italic">({ad.status_detail})</span>
            )}
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => callAction("undo-reject")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card hover:bg-muted px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid={`undo-reject-${ad.generation_id}`}
          >
            {busy === "undo-reject" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Undo reject
          </button>
        </div>
      )}

      {isLaunched && (() => {
        const ppl = (ad as any).pipeline_platforms || {};
        const launchTs = (ad as any).launched_at || (ad as any).heygen_finished_at || build.finished_at;
        const fmtDate = (ts: number | null | undefined) =>
          ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
        const platforms = [
          { id: "meta",     name: "Meta",     state: ppl.meta     ?? (ad.pipeline_status === "done" ? "launched" : null) },
          { id: "applovin", name: "Applovin", state: ppl.applovin ?? null },
        ];
        const mockMetric = (adId: string, kind: "spend" | "roas"): number => {
          let h = 0;
          for (let i = 0; i < adId.length; i++) h = ((h << 5) - h + adId.charCodeAt(i)) | 0;
          h = Math.abs(h);
          if (kind === "spend") return ((h % 1900) + 100);
          return ((h % 350) + 50) / 100;
        };
        return (
          <div className="px-6 py-3 border-t border-emerald-500/30 bg-emerald-500/[0.06] space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-emerald-300">
              <Send className="size-3" />
              Ready to Launch · ClickUp + platforms
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[11.5px]">
              {ad.ad_id && (<div className="flex items-center gap-1.5"><span className="text-muted-foreground">Ad ID</span><span className="font-mono tabular-nums text-foreground/90">{ad.ad_id}</span></div>)}
              {ad.clickup_url && (
                <a href={ad.clickup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <Clipboard className="size-3" />
                  ClickUp task <ExternalLink className="size-2.5 opacity-70" />
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {platforms.map((p) => {
                const isLaunchedP = p.state === "launched";
                const spend = isLaunchedP ? mockMetric(ad.ad_id || ad.generation_id, "spend") : 0;
                const roas  = isLaunchedP ? mockMetric(ad.ad_id || ad.generation_id, "roas") : 0;
                return (
                  <div key={p.id} className={`rounded-lg border px-3 py-2 ${isLaunchedP ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/60 bg-muted/20"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[12px] font-bold text-foreground/95">{p.name}</span>
                      <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${isLaunchedP ? "text-emerald-300" : "text-muted-foreground"}`}>{isLaunchedP ? "Launched" : "Pending"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-muted-foreground">Upload</span>
                      <span className="tabular-nums text-foreground/90">{isLaunchedP ? fmtDate(launchTs) : "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] mt-0.5">
                      <span className="text-muted-foreground">Spend</span>
                      <span className="tabular-nums text-foreground/90">${spend.toFixed(0)}</span>
                      <span className="text-muted-foreground/65">·</span>
                      <span className="text-muted-foreground">NC-ROAS</span>
                      <span className={`tabular-nums font-semibold ${roas >= 2.0 ? "text-emerald-300" : roas >= 1.0 ? "text-foreground/90" : "text-amber-300"}`}>{roas.toFixed(2)}x</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/70 italic">
              Spend + NC-ROAS shown above are mocked. Live values land here once the dev integration is wired up.
            </p>
          </div>
        );
      })()}

      {ad.script_id && (
        <div className="px-6 pb-1 pt-3 flex items-center gap-1.5 flex-wrap text-[10.5px] border-t border-border/20">
          <CopyBadge label="Script" value={String(ad.script_id)} accent="muted" />
        </div>
      )}

      <PreLaunchSettings
        buildId={build.id}
        generationId={ad.generation_id}
        product={build.product}
        cs={ad.cs || build.cs || "Agentic"}
        funnel={(ad.funnel || build.funnel || "Onbrand") as "Onbrand" | "Comparison" | "TSL"}
        persona={ad.persona ?? null}
        subAngle={ad.sub_angle ?? null}
        mainPains={ad.main_pains ?? null}
        locked={!isPending}
      />

      {ad.status_detail && (
        <div className="px-6 py-2.5 text-[12px] text-amber-600 dark:text-amber-300 border-b border-border/85 bg-amber-500/5">
          {ad.status_detail}
        </div>
      )}

      <LinksRow ad={ad} />

      {avatarJobs.length > 0 && (
        <div className="px-6 py-4 border-t border-border/85 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/80 flex-wrap">
              <Video className="size-3" />
              HeyGen renders
              <span className="tabular-nums text-muted-foreground/75">({okCount}/{totalCount})</span>
              {durationLabel && (
                <span className={`inline-flex items-center gap-1 normal-case tracking-normal font-medium ${isDone ? "text-muted-foreground/70" : "text-amber-300/90"}`} title={isDone ? "Total render time" : "Live — counting since batch started"}>
                  <Clock className={`size-3 ${isDone ? "" : "animate-pulse"}`} />
                  {isDone ? `took ${durationLabel}` : `${durationLabel} elapsed`}
                </span>
              )}
              {approvedCount > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 normal-case tracking-normal text-emerald-300/90 font-medium">
                  <Check className="size-3" />{approvedCount} approved
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(isPending || !isRejected) && okCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => callAvatarBulk("approved")}
                    disabled={busy !== null || approvedCount === okCount || !rendersDone}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                      rendersDone && approvedCount === 0
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 shadow-[0_0_0_3px_rgba(16,185,129,0.08)] animate-[pulse_2.4s_ease-in-out_infinite]"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90 hover:bg-emerald-500/15"
                    }`}
                    title="Mark every successful render as approved"
                    data-testid={`ad-approve-all-${ad.generation_id}`}
                  >
                    {busy === "bulk-approve" ? <Loader2 className="size-3 animate-spin" /> : <ThumbsUp className="size-3" />}
                    {approvedCount === 0 ? "Approve all renders" : "Approve all"}
                  </button>
                  {approvedCount > 0 && (
                    <button type="button" onClick={() => callAvatarBulk("pending")} disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-md border border-border/85 bg-card hover:bg-muted px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      title="Clear approvals so you can review again">Reset</button>
                  )}
                </>
              )}
              {isPending && (
                <button type="button" onClick={() => callAction("regenerate-all")} disabled={busy !== null}
                  className="inline-flex items-center gap-1 rounded-md border border-border/85 bg-card hover:bg-muted px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  title="Re-render every avatar for this ad">
                  {busy === "regenerate-all" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                  Regenerate all
                </button>
              )}
            </div>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {avatarJobs.map((j, i) => (
              <AvatarTile
                key={`${j.avatar_id}-${i}`}
                job={j}
                disabled={isLaunched || isRejected || busy !== null}
                renderReady={isJobTerminal(j) && !j?.error}
                onRegenerate={() => callAction("regenerate", { avatarId: j.avatar_id })}
                onDelete={() => callAction("delete-avatar", { avatarId: j.avatar_id })}
                onApprovalChange={(status) => callAvatarApproval(j.avatar_id, status)}
                busyKind={busy}
                variationId={`${build.id.slice(0, 8)}.${idx}.${i + 1}`}
              />
            ))}
          </ul>
        </div>
      )}

      {ad.brief_doc_preview && (
        <details className="border-t border-border/85" onToggle={(e) => setShowBrief((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer px-6 py-2.5 text-[11.5px] font-medium text-muted-foreground hover:bg-muted/40 flex items-center gap-2">
            <FileText className="size-3 text-primary" />
            Brief doc preview
            <span className="text-muted-foreground/75 normal-case font-normal">— what the auto-created Drive doc will contain</span>
          </summary>
          {showBrief && (
            <div className="px-6 py-4 prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed bg-muted/10 border-t border-border/20 max-h-[70vh] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-border [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-[14px] [&_h1]:font-semibold [&_h2]:text-[12.5px] [&_h2]:font-semibold [&_p]:my-1.5 [&_strong]:font-semibold [&_strong]:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{ad.brief_doc_preview}</ReactMarkdown>
            </div>
          )}
        </details>
      )}

      {isPending && (
        <div className="px-6 py-3.5 flex items-center gap-3 flex-wrap border-t border-border/85 bg-amber-500/5">
          <ShieldAlert className="size-3.5 text-amber-500 shrink-0" />
          <span className="text-[12px] text-muted-foreground">
            {!rendersDone
              ? `Waiting for ${totalCount - settledCount} render${totalCount - settledCount === 1 ? "" : "s"} to finish…`
              : approvedCount === 0
              ? "Approve at least one render to enable push-to-launch."
              : "Looks good — push the approved renders when ready."}
          </span>
          {rendersDone && approvedCount > 0 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => callAction("approve")}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-2 text-[12.5px] font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid={`log-approve-${ad.generation_id}`}
            >
              {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Push {approvedCount}/{okCount} to Ready to Launch
            </button>
          )}
        </div>
      )}
      {isPending && (
        <div className="px-6 py-2.5 border-t border-border/20 bg-muted/10 flex items-center justify-end">
          <button type="button" disabled={busy !== null} onClick={() => callAction("reject")}
            className="inline-flex items-center gap-1 rounded-md text-[11px] text-muted-foreground/70 hover:text-destructive hover:bg-destructive/5 px-2 py-1 transition-colors disabled:opacity-40"
            data-testid={`log-reject-${ad.generation_id}`}>
            {busy === "reject" ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
            Reject this ad
          </button>
        </div>
      )}
      {!isPending && !isLaunched && !isRejected &&
       ad.approval_status === "approved" &&
       ad.pipeline_status === "skipped" && rendersDone && (
        <div className="px-6 py-3.5 flex items-center gap-3 flex-wrap border-t border-border/85 bg-amber-500/[0.07]">
          <ShieldAlert className="size-3.5 text-amber-500 shrink-0" />
          <span className="text-[12px] text-muted-foreground">
            Dry-run preview only — this ad was auto-approved but the pipeline push was skipped. Push now to send it to Ready to Launch.
          </span>
          <button type="button" disabled={busy !== null} onClick={() => callAction("approve")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-2 text-[12.5px] font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid={`log-push-skipped-${ad.generation_id}`}>
            {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Push to pipeline
          </button>
        </div>
      )}
      </>)}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Per-avatar tile
// ─────────────────────────────────────────────────────────────────────────

function AvatarTile({
  job, disabled, renderReady, onRegenerate, onDelete, onApprovalChange, busyKind, variationId,
}: {
  job: AvatarJob;
  disabled: boolean;
  renderReady: boolean;
  onRegenerate: () => void;
  onDelete: () => void;
  onApprovalChange: (status: "approved" | "rejected" | "pending") => void;
  busyKind: string | null;
  variationId: string;
}) {
  const videoSrc = job.final_video_url || null;
  const lookup = useContext(AvatarLookupContext);
  const avatar = lookup.get(job.avatar_id);
  const displayName = avatar?.name || `${job.avatar_id.slice(0, 10)}…`;
  const approved = job.approval_status === "approved";
  const rejected = job.approval_status === "rejected";
  const approvalBusy = busyKind === `approval:${job.avatar_id}`;
  const borderCls = approved
    ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
    : rejected ? "border-destructive/50 opacity-60"
    : job.ok ? "border-border/85"
    : "border-destructive/30";
  return (
    <li className={`rounded-lg border bg-background/60 overflow-hidden group transition-all ${borderCls}`}>
      <div className="relative aspect-[9/16] bg-muted/30 flex items-center justify-center">
        {videoSrc ? (
          <LazyVideo src={videoSrc} />
        ) : job.ok ? (
          <div className="text-[10.5px] text-muted-foreground italic">Rendering…</div>
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <XCircle className="size-4 text-destructive/70" />
            <div className="text-[9.5px] text-destructive line-clamp-3" title={job.error || "Render failed"}>
              {friendlyHeygenError(job.error)}
            </div>
          </div>
        )}
        {(approved || rejected) && (
          <div className={`absolute top-1.5 left-1.5 size-5 rounded-full flex items-center justify-center backdrop-blur-sm ${approved ? "bg-emerald-500/90 text-white" : "bg-destructive/90 text-white"}`} title={approved ? "Approved" : "Rejected"}>
            {approved ? <Check className="size-3" /> : <XCircle className="size-3" />}
          </div>
        )}
        {!disabled && (
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button type="button" onClick={onRegenerate} disabled={!!busyKind}
              className="size-6 rounded-md bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm" title="Regenerate this video only">
              {busyKind === "regenerate" ? <Loader2 className="size-2.5 animate-spin" /> : <RotateCcw className="size-2.5" />}
            </button>
            <button type="button" onClick={onDelete} disabled={!!busyKind}
              className="size-6 rounded-md bg-black/60 hover:bg-destructive/80 text-white flex items-center justify-center backdrop-blur-sm" title="Remove this avatar">
              {busyKind === "delete-avatar" ? <Loader2 className="size-2.5 animate-spin" /> : <Trash2 className="size-2.5" />}
            </button>
          </div>
        )}
      </div>
      <div className="px-2 pt-1.5 pb-0.5 flex items-center gap-1">
        <CopyBadge label="V" value={variationId} accent="muted" compact />
      </div>
      <div className="px-2 pt-1 pb-2 flex items-center gap-1.5 text-[10px]">
        <span className="font-medium text-foreground/90 truncate flex-1" title={`${avatar?.name || job.avatar_id}${avatar?.voice_name ? ` · ${avatar.voice_name}` : ""}`}>
          {displayName}
        </span>
        {!disabled && job.ok && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button"
              onClick={() => onApprovalChange(approved ? "pending" : "approved")}
              disabled={approvalBusy || !renderReady}
              aria-label={approved ? "Un-approve" : renderReady ? "Approve" : "Render in progress"}
              className={`h-7 px-2 rounded-md inline-flex items-center justify-center gap-1 text-[10px] font-semibold transition-colors border ${
                approved ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                : !rejected ? "border-emerald-500/30 text-emerald-400/90 hover:bg-emerald-500/15 animate-[pulse_2.4s_ease-in-out_infinite]"
                : "border-border/70 text-muted-foreground/75 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10"
              } disabled:opacity-40`}
              title={approved ? "Approved — click to un-approve" : renderReady ? "Approve this render" : "Render still in progress"}
              data-testid={`avatar-approve-${job.avatar_id}`}>
              {approvalBusy ? <Loader2 className="size-3 animate-spin" /> : <ThumbsUp className="size-3" />}
              <span>{approved ? "Approved" : "Approve"}</span>
            </button>
            <button type="button"
              onClick={() => onApprovalChange(rejected ? "pending" : "rejected")}
              disabled={approvalBusy}
              aria-label={rejected ? "Un-reject" : "Reject"}
              className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors border ${
                rejected ? "bg-destructive/20 border-destructive/40 text-destructive hover:bg-destructive/30"
                : "border-border/70 text-muted-foreground/75 hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10"
              } disabled:opacity-40`}
              title={rejected ? "Rejected — click to un-reject" : "Reject this render"}
              data-testid={`avatar-reject-${job.avatar_id}`}>
              <ThumbsDown className="size-3" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function CopyBadge({ label, value, accent, compact }: { label: string; value: string; accent: "primary" | "muted"; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const cls = accent === "primary"
    ? "border-primary/40 bg-primary/10 text-primary"
    : "border-border/70 bg-muted/30 text-muted-foreground";
  const display = compact ? value.slice(0, 8) : value;
  return (
    <button type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
      }}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0 text-[10px] font-mono font-semibold transition-colors hover:opacity-80 ${cls}`}
      title={`Copy ${label}: ${value}`}>
      <span className="text-muted-foreground/75 uppercase tracking-wider text-[8.5px] not-italic font-sans">{label}</span>
      <span className="tabular-nums">{display}</span>
      {copied ? <Check className="size-2 text-emerald-400" /> : <Copy className="size-2 opacity-50" />}
    </button>
  );
}

type AdStatusKind =
  | "rejected" | "launched" | "pending" | "pushing" | "rendering"
  | "queued" | "failed" | "dry" | "done" | "generating"
  | "launched-both" | "launched-meta-only" | "launched-applovin-only" | "pushed";
type AdStatusDef = {
  kind: AdStatusKind;
  label: string;
  dot: string;
  text: string;
  pill: string;
};

function resolveAdStatus(ad: Lineage): AdStatusDef {
  const jobs = Array.isArray(ad.avatar_jobs) ? ad.avatar_jobs : [];
  const isCombo = ad.mode === "combination";
  const stillRendering = jobs.some((j) => {
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

  if (ad.approval_status === "rejected") return { kind: "rejected", label: "Rejected", dot: "bg-destructive", text: "text-destructive/80", pill: "bg-destructive/15 border-destructive/40 text-destructive" };

  const intended = (ad as any).intended_platforms || (ad as any).intended_platform || null;
  const wantMeta = intended ? /meta|both/i.test(String(intended)) : true;
  const wantAl   = intended ? /applovin|both/i.test(String(intended)) : true;
  const metaDone = metaState === "launched";
  const alDone   = alState === "launched";
  const launchedCount = (wantMeta && metaDone ? 1 : 0) + (wantAl && alDone ? 1 : 0);
  const intendedCount = (wantMeta ? 1 : 0) + (wantAl ? 1 : 0);
  if (intendedCount > 0 && launchedCount === intendedCount) return { kind: "launched-both", label: "Fully Launched", dot: "bg-emerald-400", text: "text-emerald-300", pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" };
  if (metaDone && !alDone && wantAl) return { kind: "launched-meta-only", label: "Partially Launched · Meta live, Applovin pending", dot: "bg-emerald-400", text: "text-emerald-300", pill: "bg-emerald-500/10 border-emerald-500/35 text-emerald-300/95" };
  if (alDone && !metaDone && wantMeta) return { kind: "launched-applovin-only", label: "Partially Launched · Applovin live, Meta pending", dot: "bg-emerald-400", text: "text-emerald-300", pill: "bg-emerald-500/10 border-emerald-500/35 text-emerald-300/95" };
  if (ad.approval_status === "launched") return { kind: "launched", label: "Ready to Launch", dot: "bg-emerald-400", text: "text-emerald-300/90", pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" };
  if (stillRendering) return { kind: "generating", label: "Generating", dot: "bg-sky-400 animate-pulse", text: "text-sky-300", pill: "bg-sky-500/15 border-sky-500/45 text-sky-300" };
  if (ad.approval_status === "pending_approval") return { kind: "pending", label: "Pending approval", dot: "bg-amber-400", text: "text-amber-300/90", pill: "bg-amber-500/15 border-amber-500/45 text-amber-300" };
  if (ad.approval_status === "approved") {
    if (ad.pipeline_status === "skipped") return { kind: "dry", label: "Dry-run · approved", dot: "bg-muted-foreground/40", text: "text-muted-foreground/70", pill: "bg-muted/50 border-border/60 text-muted-foreground" };
    if (ad.pipeline_status === "done") return { kind: "launched", label: "Ready to Launch", dot: "bg-emerald-400", text: "text-emerald-300/90", pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" };
    if (ad.pipeline_status === "failed") return { kind: "failed", label: "Push failed", dot: "bg-destructive", text: "text-destructive/80", pill: "bg-destructive/15 border-destructive/40 text-destructive" };
    return { kind: "pushed", label: "Pushed · awaiting platforms", dot: "bg-sky-400 animate-pulse", text: "text-sky-300", pill: "bg-sky-500/15 border-sky-500/45 text-sky-300" };
  }
  switch (ad.pipeline_status) {
    case "rendering": case "uploading": case "submitting":
      return { kind: "rendering", label: "Rendering", dot: "bg-sky-400 animate-pulse", text: "text-sky-300/90", pill: "bg-sky-500/15 border-sky-500/45 text-sky-300" };
    case "done": return { kind: "done", label: "Ad created", dot: "bg-emerald-400", text: "text-emerald-300/90", pill: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" };
    case "failed": return { kind: "failed", label: "Failed", dot: "bg-destructive", text: "text-destructive/80", pill: "bg-destructive/15 border-destructive/40 text-destructive" };
    case "skipped": return { kind: "dry", label: "Dry run", dot: "bg-muted-foreground/40", text: "text-muted-foreground/70", pill: "bg-muted/50 border-border/60 text-muted-foreground" };
    default: return { kind: "queued", label: "Queued", dot: "bg-muted-foreground/40", text: "text-muted-foreground/70", pill: "bg-muted/50 border-border/60 text-muted-foreground" };
  }
}

export function AdStatusPill({ ad, size = "md" }: { ad: Lineage; size?: "sm" | "md" | "lg" }) {
  const s = resolveAdStatus(ad);
  const sizeCls = size === "lg" ? "px-3 py-1.5 text-[12.5px] gap-2" : size === "sm" ? "px-2 py-0.5 text-[10.5px] gap-1" : "px-2.5 py-1 text-[11.5px] gap-1.5";
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold tracking-tight uppercase ${sizeCls} ${s.pill}`} title={s.label}>
      <span className={`size-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

function AdStatusDot({ ad }: { ad: Lineage }) {
  const s = resolveAdStatus(ad);
  return <span className={`size-2 rounded-full shrink-0 ${s.dot} ring-2 ring-card`} aria-label={s.label} title={s.label} />;
}

function AdStatusLabel({ ad }: { ad: Lineage }) {
  const s = resolveAdStatus(ad);
  return <span className={`shrink-0 text-[11px] font-medium tracking-tight ${s.text}`}>{s.label}</span>;
}

function PreLaunchSettings({
  buildId, generationId, product, cs, funnel, persona, subAngle, mainPains, locked,
}: {
  buildId: string; generationId: string; product: string; cs: string;
  funnel: "Onbrand" | "Comparison" | "TSL"; persona: string | null;
  subAngle: string | null; mainPains: string[] | null; locked: boolean;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const csOwnersQ = useQuery<Array<{ label: string; email: string }>>({
    queryKey: [`${API_BASE}/api/options/cs-owners`],
    queryFn: async () => { const r = await apiRequest("GET", `${API_BASE}/api/options/cs-owners`); return r.json(); },
    staleTime: 10 * 60 * 1000,
    enabled: !locked,
  });
  const personasQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/personas`, product],
    queryFn: async () => { const r = await apiRequest("GET", `${API_BASE}/api/options/personas?product=${encodeURIComponent(product)}`); return r.json(); },
    staleTime: 5 * 60 * 1000, enabled: !locked && !!product,
  });
  const subAnglesQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/sub-angles`, product],
    queryFn: async () => { const r = await apiRequest("GET", `${API_BASE}/api/options/sub-angles?product=${encodeURIComponent(product)}`); return r.json(); },
    staleTime: 5 * 60 * 1000, enabled: !locked && !!product,
  });
  const painsQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/pains`, product],
    queryFn: async () => { const r = await apiRequest("GET", `${API_BASE}/api/options/pains?product=${encodeURIComponent(product)}`); return r.json(); },
    staleTime: 5 * 60 * 1000, enabled: !locked && !!product,
  });
  const csOptions = useMemo(() => {
    const labels = (csOwnersQ.data || []).map((c) => c.label).filter(Boolean);
    const base = ["Agentic", ...labels];
    if (cs && !base.includes(cs)) base.push(cs);
    return Array.from(new Set(base));
  }, [csOwnersQ.data, cs]);

  const patch = async (k: string, body: Record<string, any>) => {
    setPending(k);
    try {
      await apiRequest("POST", `${API_BASE}/api/ugc-builds/${buildId}/lineage/${generationId}/patch`, body);
      qc.invalidateQueries({ queryKey: [`${API_BASE}/api/ugc-builds`] });
    } catch (err) { console.error("patch failed:", err); }
    finally { setPending(null); }
  };

  const togglePain = (p: string) => {
    const cur = mainPains || [];
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    patch("main_pains", { mainPains: next });
  };

  if (locked) {
    return (
      <div className="px-5 py-3 border-t border-border/85 bg-muted/10 space-y-2">
        <div className="flex items-center gap-2 text-[10.5px]">
          <Lock className="size-3 text-muted-foreground/70" />
          <span className="uppercase tracking-wider font-semibold text-muted-foreground/80">Final · locked</span>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5 text-[11.5px]">
          <Field label="Product" value={product} />
          <Field label="CS" value={cs} />
          <Field label="Funnel" value={funnel} />
          <Field label="Persona" value={persona || "None"} muted={!persona} />
          <Field label="Sub-angle" value={subAngle || "None"} muted={!subAngle} />
        </dl>
        {(mainPains?.length || 0) > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Pains</span>
            {mainPains!.map((p) => (
              <span key={p} className="inline-flex items-center rounded-full border border-border/80 bg-card px-2 py-0.5 text-[10.5px] text-foreground/90">{p}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-3 border-t border-border/85 bg-primary/[0.03] space-y-3">
      <div className="flex items-center gap-2">
        <Edit3 className="size-3 text-primary" />
        <span className="text-[10.5px] uppercase tracking-wider font-semibold text-foreground/80">Pre-launch edits</span>
        <span className="text-[10.5px] text-muted-foreground/75 italic">Locked once the ad is pushed to launch</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label="Product" value={product} muted />
        <EditCell label="CS" busy={pending === "cs"}>
          <select value={cs} disabled={pending === "cs"} onChange={(e) => patch("cs", { cs: e.target.value })}
            className="w-full h-8 px-2 rounded-md border border-border/85 bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-40">
            {csOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </EditCell>
        <EditCell label="Funnel" busy={pending === "funnel"}>
          <select value={funnel} disabled={pending === "funnel"} onChange={(e) => patch("funnel", { funnel: e.target.value })}
            className="w-full h-8 px-2 rounded-md border border-border/85 bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-40">
            <option value="Onbrand">Onbrand</option>
            <option value="Comparison">Comparison</option>
            <option value="TSL">TSL</option>
          </select>
        </EditCell>
        <EditCell label="Persona" busy={pending === "persona"}>
          <select value={persona || ""} disabled={pending === "persona"} onChange={(e) => patch("persona", { persona: e.target.value || null })}
            className="w-full h-8 px-2 rounded-md border border-border/85 bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-40">
            <option value="">None</option>
            <option value="__none__">None — no persona</option>
            {(personasQ.data || []).filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
            {persona && persona !== "__none__" && !(personasQ.data || []).includes(persona) && <option value={persona}>{persona}</option>}
          </select>
        </EditCell>
        <EditCell label="Sub-angle" busy={pending === "sub_angle"}>
          <select value={subAngle || ""} disabled={pending === "sub_angle"} onChange={(e) => patch("sub_angle", { subAngle: e.target.value || null })}
            className="w-full h-8 px-2 rounded-md border border-border/85 bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-40">
            <option value="">None</option>
            <option value="__none__">None — no sub-angle</option>
            {(subAnglesQ.data || []).filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
            {subAngle && subAngle !== "__none__" && !(subAnglesQ.data || []).includes(subAngle) && <option value={subAngle}>{subAngle}</option>}
          </select>
        </EditCell>
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1.5 flex items-center gap-1.5">
          Main pains
          {pending === "main_pains" && <Loader2 className="size-2.5 animate-spin" />}
        </div>
        {painsQ.data && painsQ.data.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {painsQ.data.filter(Boolean).map((p) => {
              const active = (mainPains || []).includes(p);
              return (
                <button key={p} type="button" onClick={() => togglePain(p)} disabled={pending === "main_pains"}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/80 bg-card hover:bg-muted text-muted-foreground"
                  } disabled:opacity-40`}>
                  {p}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">No pain library entries for {product}.</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</div>
      <div className={`text-[12px] truncate ${muted ? "text-muted-foreground/70" : "text-foreground font-medium"}`} title={value}>{value || "—"}</div>
    </div>
  );
}

function EditCell({ label, busy, children }: { label: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold flex items-center gap-1">
        {label}
        {busy && <Loader2 className="size-2.5 animate-spin" />}
      </div>
      {children}
    </div>
  );
}

function LinksRow({ ad }: { ad: Lineage }) {
  const isDry = ad.pipeline_status === "skipped" || (!!ad.clickup_task_id && /^DRY-/i.test(ad.clickup_task_id)) || !ad.ad_id;
  const links: Array<{ label: string; url: string | null; icon: JSX.Element }> = isDry ? [] : [
    { label: "ClickUp",   url: ad.clickup_url,   icon: <Clipboard className="size-3" /> },
    { label: "Brief doc", url: ad.brief_doc_url, icon: <FileText  className="size-3" /> },
    { label: "Drive",     url: ad.g_drive_link,  icon: <Cloud     className="size-3" /> },
    { label: "Frame.io",  url: ad.framer_io_link,icon: <Video     className="size-3" /> },
  ];
  const present = links.filter((l) => l.url);
  if (isDry) return null;
  if (!present.length && !ad.clickup_task_id) return null;
  return (
    <div className="px-6 py-2.5 flex flex-wrap items-center gap-1.5 border-b border-border/85">
      {present.map((l) => (
        <a key={l.label} href={l.url!} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-card hover:bg-muted px-2 py-0.5 text-[10.5px] font-medium text-foreground/90 transition-colors">
          {l.icon}
          <span>{l.label}</span>
          <ExternalLink className="size-2.5 text-muted-foreground/70" />
        </a>
      ))}
      {ad.clickup_task_id && <ClickupStatusChip taskId={ad.clickup_task_id} />}
    </div>
  );
}

function ClickupStatusChip({ taskId }: { taskId: string }) {
  const isDry = /^DRY-/i.test(taskId);
  const q = useQuery<{ configured: boolean; task: any | null }>({
    queryKey: [`${API_BASE}/api/clickup/task`, taskId],
    queryFn: async () => (await apiRequest("GET", `${API_BASE}/api/clickup/task/${encodeURIComponent(taskId)}`)).json(),
    enabled: !isDry,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });
  if (isDry) return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground" title={`Dry-run placeholder — no real ClickUp task (id ${taskId})`}>
      <Clock className="size-2.5" />Dry-run
    </span>
  );
  if (q.isLoading) return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground/85">
      <Loader2 className="size-2.5 animate-spin" />ClickUp…
    </span>
  );
  if (q.error) return (
    <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-[10.5px] font-medium text-destructive/85" title={String((q.error as any)?.message || q.error)}>
      <XCircle className="size-2.5" />ClickUp · error
    </span>
  );
  if (q.data && q.data.configured === false) return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground/85" title="Server is missing CLICKUP_API_TOKEN">
      <Clipboard className="size-2.5" />ClickUp · token missing
    </span>
  );
  if (q.data && q.data.task == null) return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground/85">
      <Clipboard className="size-2.5" />Task missing
    </span>
  );
  const t = q.data?.task;
  if (!t) return null;
  const swatch = t.status_color || "#94a3b8";
  return (
    <a href={t.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card hover:bg-muted px-2 py-0.5 text-[10.5px] font-medium text-foreground/90 transition-colors"
      title={`${t.name}\nList: ${t.list_name}${t.folder_name ? `\nFolder: ${t.folder_name}` : ""}\nStatus: ${t.status}`}>
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: swatch }} />
      <span className="truncate max-w-[140px]" title={t.list_name}>{t.list_name || "ClickUp"}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="capitalize">{t.status}</span>
      <ExternalLink className="size-2.5 text-muted-foreground/70" />
    </a>
  );
}
