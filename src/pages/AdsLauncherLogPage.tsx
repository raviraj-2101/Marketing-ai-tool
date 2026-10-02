import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, launchApplovin, enableApplovin, getLaunchStatus, listActiveLaunchJobs, listQueueJobs, LaunchQueueJob, ApplovinLaunchResult, ApplovinEnableResult, LaunchPackage, LaunchPackageDetail, LaunchVariation } from "@/features/ads-launcher/lib/api";
import { useBrands } from "@/hooks/useBrands";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge } from "@/features/ads-launcher/components/StatusBadge";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { useToast } from "@/features/ads-launcher/components/Toast";
import { useLaunchPackageErrorHandler } from "@/features/ads-launcher/lib/mutationErrors";
import { fmtDateTime, fmtDateChip, fmtRelative as relativeAge } from "@/features/ads-launcher/lib/datetime";
import { brandChipClasses } from "@/features/ads-launcher/lib/brandColor";
import { usePrefs } from "@/features/ads-launcher/lib/prefs";

const STATUSES = [
  "All",
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
  "IN_PROCESS",
  "WITH_ISSUES",
] as const;
type StatusFilter = (typeof STATUSES)[number];

// ── Launch Queue panel ─────────────────────────────────────────────────────────
// Live view of what's queued / launching right now (+ recently done/failed), with
// status chips and a Mine/Everyone toggle. Polls every 2.5s. "Mine" matches the
// launcher email (launch_jobs.actor) against the signed-in user.
type QueueChip = "running" | "queued" | "done" | "failed";

function QueueStatus({ j, pct }: { j: LaunchQueueJob; pct: number | null }) {
  if (j.status === "running")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        launching{j.total ? ` ${j.completed ?? 0}/${j.total}` : ""}{pct != null ? ` · ${pct}%` : ""}
      </span>
    );
  if (j.status === "queued")
    return (
      <span className="inline-flex items-center gap-1 text-sky-700">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />queued
      </span>
    );
  if (j.status === "succeeded")
    return <span className="text-slate-500">✓ done{j.total ? ` ${j.completed ?? 0}/${j.total}` : ""}</span>;
  if (j.status === "partial")
    return <span className="text-amber-600">◐ partial {j.completed ?? 0}/{j.total ?? "?"}{j.failed ? ` · ${j.failed} failed` : ""}</span>;
  if (j.status === "failed") return <span className="text-rose-600">✕ failed</span>;
  if (j.status === "canceled") return <span className="text-slate-400">canceled</span>;
  return <span className="text-slate-500">{j.status}</span>;
}

function QueueRow({ j }: { j: LaunchQueueJob }) {
  const pct = j.total && j.total > 0 ? Math.round(((j.completed ?? 0) / j.total) * 100) : null;
  const platform = j.platform === "applovin" ? "AppLovin" : "Meta";
  const when = j.status === "queued" ? j.created_at : j.status === "running" ? j.started_at : j.finished_at;
  return (
    <li className="py-1.5 flex items-center gap-2 text-xs">
      <Link
        to={`/ads-launcher/log/${j.package_id}`}
        className="font-medium text-slate-800 hover:underline truncate max-w-[180px]"
        title={j.label}
      >
        {j.label}
      </Link>
      <span className="text-slate-300">·</span>
      <span className="text-slate-500">{platform}</span>
      {j.product_name && (
        <span className="text-slate-400 truncate max-w-[120px]" title={j.product_name}>· {j.product_name}</span>
      )}
      <span className="ml-auto flex items-center gap-2">
        <QueueStatus j={j} pct={pct} />
        {j.actor && (
          <span className="text-slate-400 truncate max-w-[130px]" title={j.actor}>{j.actor.split("@")[0]}</span>
        )}
        {when && (
          <span className="text-slate-300" title={fmtDateTime(when)}>{relativeAge(when)}</span>
        )}
      </span>
    </li>
  );
}

function LaunchQueuePanel() {
  const { user } = useAuth();
  const myEmail = user?.email ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [chip, setChip] = useState<QueueChip>("running");
  const [mine, setMine] = useState(true);

  const queue = useQuery({
    queryKey: ["launch-queue"],
    queryFn: listQueueJobs,
    refetchInterval: 2500,
  });
  const jobs: LaunchQueueJob[] = queue.data ?? [];

  const scoped = useMemo(
    () =>
      mine && myEmail
        ? jobs.filter((j) => (j.actor ?? "").toLowerCase() === myEmail.toLowerCase())
        : jobs,
    [jobs, mine, myEmail],
  );

  const buckets = useMemo(() => {
    const b = { running: [] as LaunchQueueJob[], queued: [] as LaunchQueueJob[], done: [] as LaunchQueueJob[], failed: [] as LaunchQueueJob[] };
    for (const j of scoped) {
      if (j.status === "running") b.running.push(j);
      else if (j.status === "queued") b.queued.push(j);
      else if (j.status === "succeeded" || j.status === "partial") b.done.push(j);
      else if (j.status === "failed" || j.status === "canceled") b.failed.push(j);
    }
    return b;
  }, [scoped]);

  const totalActive = buckets.running.length + buckets.queued.length;

  // Nothing active and nothing recent → keep the page clean.
  if (!queue.isLoading && jobs.length === 0) return null;

  const CHIPS: { key: QueueChip; label: string; dot: string }[] = [
    { key: "running", label: "Launching", dot: "bg-emerald-500" },
    { key: "queued", label: "Queued", dot: "bg-sky-500" },
    { key: "done", label: "Done", dot: "bg-slate-400" },
    { key: "failed", label: "Failed", dot: "bg-rose-500" },
  ];
  const shown = buckets[chip];

  return (
    <div className="al-card mb-4 border-l-4 border-l-emerald-400">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-semibold text-slate-900"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className={`inline-block transition-transform ${collapsed ? "" : "rotate-90"}`}>▸</span>
          Launch Queue
          {totalActive > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {totalActive} active
            </span>
          )}
        </button>
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs">
          <button
            type="button"
            className={`px-2 py-1 ${mine ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
            onClick={() => setMine(true)}
            disabled={!myEmail}
            title={myEmail ? `Only launches by ${myEmail}` : "Your sign-in email is unknown"}
          >
            Mine
          </button>
          <button
            type="button"
            className={`px-2 py-1 ${!mine ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
            onClick={() => setMine(false)}
          >
            Everyone
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {CHIPS.map((c) => {
              const n = buckets[c.key].length;
              const on = chip === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setChip(c.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {c.label}
                  <span className={`ml-0.5 ${on ? "text-white/80" : "text-slate-400"}`}>{n}</span>
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">
              No {chip === "running" ? "launching" : chip} launches{mine ? " of yours" : ""}.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((j) => (
                <QueueRow key={j.job_id} j={j} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function LogPage() {
  const { id } = useParams();
  return id ? <Detail id={id} /> : <List />;
}

type DateWindow = "24h" | "7d" | "30d" | "90d" | "all";
const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "all", label: "All time" },
];

function List() {
  // Cycle 384 — URL-as-saved-search. Every filter syncs to ?q=...&status=...
  // so operators can bookmark "Sarah's CL launches this week" by saving the
  // URL. Initial state hydrates from URL on mount; subsequent edits push
  // into URL with replace: true (no history spam).
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  // Cycle 140 — debounce the search input so we don't fire one /api/launches
  // request per keystroke. 250ms feels instant for paste/type but kills the
  // request waterfall when the operator drags-and-types a long ad-id.
  const [debouncedQ, setDebouncedQ] = useState(searchParams.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const initStatus = (searchParams.get("status") ?? "All") as StatusFilter;
  const [status, setStatus] = useState<StatusFilter>(
    STATUSES.includes(initStatus as any) ? initStatus : "All",
  );
  const [brandId, setBrandId] = useState(searchParams.get("brand_id") ?? "");
  const initSince = (searchParams.get("since") ?? "all") as DateWindow;
  const [since, setSince] = useState<DateWindow>(
    ["24h", "7d", "30d", "90d", "all"].includes(initSince) ? initSince : "all",
  );
  // Cycle 368 — by-uploader filter. Empty = all uploaders.
  const [uploader, setUploader] = useState(searchParams.get("uploader") ?? "");
  // Cycle 375 — show archived stale drafts opt-in. Default hidden so
  // the Log stays clean for daily ops.
  const [showArchived, setShowArchived] = useState(searchParams.get("archived") === "1");
  // Cycle 396 — trash view: show soft-deleted packages with restore CTA.
  const [showTrash, setShowTrash] = useState(searchParams.get("trash") === "1");
  // Cycle 454 — tag filter (single tag for now; URL serialized).
  const [tagFilter, setTagFilter] = useState(searchParams.get("tag") ?? "");
  // Cycle 420 — server-side sort. Whitelisted set; default newest-first.
  // Cycle 479 — fall back to the operator's saved preference when no
  // ?sort= URL param is present.
  const { prefs: opPrefs } = usePrefs();
  const initSort = searchParams.get("sort") ?? opPrefs.default_log_sort ?? "";
  const [sortKey, setSortKey] = useState<string>(
    ["", "ad_id", "name", "status", "variations"].includes(initSort) ? initSort : "",
  );
  // When the saved pref loads AFTER mount, apply it once if the URL
  // didn't override + the operator hasn't picked anything yet.
  const sortPrefAppliedRef = useRef(false);
  useEffect(() => {
    if (sortPrefAppliedRef.current) return;
    if (searchParams.get("sort")) { sortPrefAppliedRef.current = true; return; }
    if (sortKey !== "") { sortPrefAppliedRef.current = true; return; }
    const p = opPrefs.default_log_sort;
    if (p && ["ad_id", "name", "status", "variations"].includes(p)) {
      setSortKey(p);
      sortPrefAppliedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opPrefs.default_log_sort]);

  // Cycle 384 — push filter state into the URL. Tracked via stringified
  // signature to avoid loops; updates are replaceState so bookmark-spam
  // doesn't fill history.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedQ.trim()) next.set("q", debouncedQ.trim());
    if (status !== "All") next.set("status", status);
    if (brandId) next.set("brand_id", brandId);
    if (since !== "all") next.set("since", since);
    if (uploader) next.set("uploader", uploader);
    if (showArchived) next.set("archived", "1");
    if (showTrash) next.set("trash", "1");
    if (tagFilter) next.set("tag", tagFilter);
    if (sortKey) next.set("sort", sortKey);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status, brandId, since, uploader, showArchived, showTrash, tagFilter, sortKey]);
  const qc = useQueryClient();
  const toast = useToast();

  const { data: brands = [] } = useBrands();
  // Cycle 368 — distinct uploaders for the dropdown. Cached server-side.
  const { data: uploadersData } = useQuery({
    queryKey: ["uploaders"],
    queryFn: () => api.get<{ ok: boolean; uploaders: { created_by: string; n: number }[] }>("/api/launches/uploaders"),
    staleTime: 60_000,
  });
  const uploaders = uploadersData?.uploaders ?? [];
  // Cycle 454 — distinct tag list for the filter dropdown.
  const { data: tagsData } = useQuery({
    queryKey: ["launch-tags"],
    queryFn: () => api.get<{ ok: boolean; tags: { tag: string; n: number }[] }>("/api/launches/tags"),
    staleTime: 60_000,
  });
  const launchTags = tagsData?.tags ?? [];

  const params = new URLSearchParams();
  if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
  if (status !== "All") params.set("status", status);
  if (brandId) params.set("brand_id", brandId);
  if (since !== "all") params.set("since", since);
  if (uploader) params.set("created_by", uploader);
  if (showArchived) params.set("include_archived", "1");
  if (showTrash) params.set("include_deleted", "1");
  if (tagFilter) params.set("tag", tagFilter);
  if (sortKey) params.set("sort", sortKey);
  const queryString = params.toString();

  // Background launch jobs that are queued/running right now (across all packages). Lightweight
  // poll every 2.5s so the list can (a) live-refresh while a launch runs and (b) badge the row.
  const activeJobs = useQuery({
    queryKey: ["launch-jobs-active"],
    queryFn: listActiveLaunchJobs,
    refetchInterval: 2500,
  });
  const activeJobIds = useMemo(
    () => new Set((activeJobs.data ?? []).map((j: any) => j.package_id)),
    [activeJobs.data],
  );
  const { data: launchesData, isFetching } = useQuery({
    queryKey: ["launches", { q: debouncedQ.trim(), status, brandId, since, uploader, showArchived, showTrash, tagFilter, sortKey }],
    queryFn: () => api.get<{ ok: boolean; launches: LaunchPackage[] } | LaunchPackage[]>(`/api/launches${queryString ? `?${queryString}` : ""}`),
    // While any launch is running, keep the list fresh so status flips land without a manual reload.
    refetchInterval: () => (activeJobs.data?.length ? 2500 : false),
  });
  const launches = Array.isArray(launchesData) ? launchesData : (launchesData?.launches ?? []);

  // Cycle 279 — "/" focuses the search input from anywhere on /log.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      const input = document.querySelector<HTMLInputElement>('input[data-log-search="1"]');
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cycle 135 — counts per status bucket, with the same q + brandId filter
  // applied but WITHOUT the status filter. Shown on each pill so operators
  // can see what's hiding in each bucket before clicking.
  const countsQs = new URLSearchParams();
  if (debouncedQ.trim()) countsQs.set("q", debouncedQ.trim());
  if (brandId) countsQs.set("brand_id", brandId);
  if (since !== "all") countsQs.set("since", since);
  const { data: countsData } = useQuery({
    queryKey: ["launch-status-counts", { q: debouncedQ.trim(), brandId, since }],
    queryFn: () => api.get<{ ok: boolean; counts: Record<string, number> }>(
      `/api/launches/status-counts${countsQs.toString() ? `?${countsQs.toString()}` : ""}`,
    ),
  });
  const counts = countsData?.counts ?? {};

  // Cycle 130 — bulk-refresh Meta effective_status across every live
  // package. Clears the 10-min server cache for every meta_ad_id bound to
  // an Active/Paused/In Process/With Issues package, then invalidates
  // every per-package ad-links query in the React Query cache so the next
  // render of any detail page shows fresh data.
  const refreshAll = useMutation({
    mutationFn: () => api.post<{ ok: boolean; packages: number; ads: number; cleared: number }>(
      "/api/launches/refresh-all-statuses",
    ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["ad-links"] });
      qc.invalidateQueries({ queryKey: ["launches"] });
      if (r.ads === 0) {
        toast("info", "No live ads to refresh.");
      } else {
        toast("success", `Refreshed ${r.ads} ad${r.ads === 1 ? "" : "s"} across ${r.packages} package${r.packages === 1 ? "" : "s"}.`);
      }
    },
    onError: (e: any) => toast("error", e?.message ?? "Bulk refresh failed."),
  });

  const anyFilterActive = debouncedQ.trim() || status !== "All" || brandId || since !== "all" || uploader || showArchived || showTrash || tagFilter;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Launch Log</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => refreshAll.mutate()}
            disabled={refreshAll.isPending}
            // Cycle 237 — title shows the actual scope so operators know
            // what they're triggering before they click.
            title={`Force-refresh Meta effective_status for every Active/Paused/In Process/With Issues package (~${launches.filter((l) => ["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES"].includes(l.status)).length} live in current filter). Clears the 10-min server cache.`}
          >
            {refreshAll.isPending ? "Refreshing…" : "↻ Refresh all live statuses"}
          </button>
          {/* Cycle 217 — export the currently-filtered list as CSV.
              Useful for weekly status reports / pasting into Sheets. */}
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={launches.length === 0}
            title="Download the currently-filtered launches as CSV"
            aria-label={`Export ${launches.length} launch${launches.length === 1 ? "" : "es"} to CSV`}
            onClick={() => {
              const headers = ["ad_id", "name", "brand", "product", "funnel", "status", "meta_status", "variation_count", "lib_rejected", "created_by", "created_at"];
              const rows = launches.map((l) => [
                l.ad_id ?? "",
                l.name,
                l.brand_name ?? "",
                l.product_name ?? "",
                l.funnel ?? "",
                l.status,
                l.meta_upload_status ?? "",
                String(l.variation_count),
                String(l.lib_rejected_count ?? 0),
                l.created_by ?? "",
                l.created_at,
              ]);
              const escape = (s: string) =>
                /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              const csv = [headers, ...rows]
                .map((row) => row.map(escape).join(","))
                .join("\n");
              // Cycle 258 — UTF-8 BOM so Excel auto-detects encoding.
              const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `launches-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast("success", `Exported ${launches.length} launch${launches.length === 1 ? "" : "es"} to CSV.`);
            }}
          >
            ↓ CSV ({launches.length})
          </button>
          {anyFilterActive && (
            <button
              className="btn-secondary text-xs"
              title="Copy a shareable URL of the current filter set — paste into Slack / docs / bookmark bar"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast("success", "Copied view URL.");
                } catch {
                  toast("error", "Clipboard write failed.");
                }
              }}
            >
              Copy view URL
            </button>
          )}
          {anyFilterActive && (
            <button
              className="btn-secondary text-xs"
              onClick={() => {
                setQ("");
                setStatus("All");
                setBrandId("");
                setSince("all");
                setUploader("");
                setShowArchived(false);
                setShowTrash(false);
                setTagFilter("");
                setSortKey("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <LaunchQueuePanel />

      <div className="al-card mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-2">
          <input
            className="al-input"
            placeholder='Search by ad ID, package name, or campaign…  (press "/" to focus)'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-log-search="1"
          />
          <select className="al-input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {/* Cycle 368 — by-uploader dropdown. Counts surfaced so operators
              can see who's been busy. Email local-part displayed for
              compactness (full email in the title tooltip). */}
          <select
            className="al-input"
            value={uploader}
            onChange={(e) => setUploader(e.target.value)}
            title={uploader || "Filter launches by uploader"}
          >
            <option value="">All uploaders</option>
            {uploaders.map((u) => (
              <option key={u.created_by} value={u.created_by} title={u.created_by}>
                {u.created_by.split("@")[0]} ({u.n})
              </option>
            ))}
          </select>
        </div>
        {/* Cycle 420 — sort dropdown (default: newest first). */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sort</span>
          <select
            className="al-input text-xs md:max-w-xs"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
          >
            <option value="">Newest first (default)</option>
            <option value="ad_id">Ad ID (A→Z)</option>
            <option value="name">Name (A→Z)</option>
            <option value="status">Status</option>
            <option value="variations">Variations count</option>
          </select>
        </div>
        {/* Cycle 454 — tag chips. Single-select for now; chip count
            shown so operators see how many launches share a tag. Only
            render when there are tags in the system. */}
        {launchTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Tag</span>
            <button
              type="button"
              onClick={() => setTagFilter("")}
              className={`chip text-[10.5px] ${
                tagFilter === ""
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={tagFilter === ""}
            >
              All
            </button>
            {launchTags.slice(0, 12).map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => setTagFilter(t.tag)}
                className={`chip text-[10.5px] ${
                  tagFilter === t.tag
                    ? "bg-violet-500 text-white border-violet-500"
                    : "bg-white text-violet-700 border-violet-200 hover:bg-violet-50"
                }`}
                aria-pressed={tagFilter === t.tag}
              >
                {t.tag}
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{t.n}</span>
              </button>
            ))}
          </div>
        )}
        {/* Cycle 417 — quick brand pills for one-click filtering. The
            brands dropdown above still works for exact selection; these
            pills are for the operator who knows their go-to brand by
            heart. */}
        {brands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Brand</span>
            <button
              type="button"
              onClick={() => setBrandId("")}
              className={`chip text-[10.5px] ${
                brandId === ""
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={brandId === ""}
            >
              All
            </button>
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrandId(b.id)}
                className={`chip text-[10.5px] ${
                  brandId === b.id
                    ? "bg-brand-500 text-white border-brand-500"
                    : `${brandChipClasses(b.name)} hover:opacity-80`
                }`}
                aria-pressed={brandId === b.id}
                title={`${b.account_count ?? 0} accounts · ${b.launch_count ?? 0} launches`}
              >
                {b.name}
                {typeof b.launch_count === "number" && (
                  <span className={`ml-1.5 font-mono text-[10px] ${brandId === b.id ? "opacity-80" : "opacity-60"}`}>
                    {b.launch_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* Cycle 375 — toggle showing archived (stale-draft) packages.
            Cycle 396 — sibling toggle for the soft-deleted trash. */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Include archived
            <span className="text-slate-400">(stale drafts auto-archived after 30 days)</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrash}
              onChange={(e) => setShowTrash(e.target.checked)}
            />
            Show trash
            <span className="text-slate-400">(soft-deleted; 30 days until permanent purge)</span>
          </label>
        </div>
        {/* Cycle 139 — date-window quick presets. Default: All time. */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Window</span>
          {DATE_WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => setSince(w.value)}
              className={`chip text-[10.5px] ${
                since === w.value
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={since === w.value}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const n = counts[s];
            const isActive = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`chip capitalize ${
                  isActive
                    ? "bg-brand-500 text-white border-brand-500"
                    : n === 0
                      ? "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
                aria-pressed={isActive}
              >
                {s.toLowerCase().replace(/_/g, " ")}
                {typeof n === "number" && (
                  <span className={`ml-1.5 font-mono text-[10px] ${
                    isActive
                      ? "opacity-80"
                      : n === 0
                        ? "opacity-50"
                        : "text-slate-500"
                  }`}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <GroupedLaunchList launches={launches} anyFilterActive={Boolean(anyFilterActive)} showTrash={showTrash} activeJobIds={activeJobIds} />

      {isFetching && launches.length > 0 && (
        <div className="text-xs text-slate-400 mt-2 text-right">Refreshing…</div>
      )}
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirmAct = useConfirm();
  const toast = useToast();
  // Cycle 185 — hook moved to src/lib/mutationErrors.ts so nested
  // components (MetaLaunchCard, PlatformStatusCard) can share it.
  const handleMutationError = useLaunchPackageErrorHandler();
  const { data, isLoading } = useQuery({
    queryKey: ["launches", id],
    queryFn: () => api.get<LaunchPackageDetail>(`/api/launches/${id}`),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.put(`/api/launches/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["launches"] });
      qc.invalidateQueries({ queryKey: ["launches", id] });
    },
    onError: handleMutationError,
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/launches/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["launches"] });
      window.location.href = "/ads-launcher/log";
    },
    // Cycle 184 — apply C183 multi-tab grace to delete too. If the row
    // is already gone, the operator's "deletion intent" is effectively
    // satisfied; show toast + redirect, no scary error.
    onError: handleMutationError,
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!data) return <div className="p-8 text-slate-500">Not found.</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/ads-launcher/log" className="text-sm text-brand-600 hover:underline">
        ← Back to log
      </Link>
      {/* Cycle 319 — schedule banner. Shows when scheduled_for is set;
          remembers whether it's already fired (slate) or still queued (sky).
          Cycle 320 — adds Cancel button when not yet fired. */}
      {data.scheduled_for && (() => {
        const due = new Date(data.scheduled_for).getTime();
        const fired = !!data.scheduled_fired_at;
        const overdue = !fired && due < Date.now();
        const cls = fired
          ? "bg-slate-50 border-slate-200 text-slate-700"
          : overdue
            ? "bg-amber-50 border-amber-300 text-amber-900"
            : "bg-sky-50 border-sky-200 text-sky-900";
        return (
          <div className={`mt-2 rounded-lg border px-3 py-2 text-xs flex items-center gap-2 flex-wrap ${cls}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="font-semibold">
              {fired ? "Scheduled launch fired" : overdue ? "Scheduled launch overdue" : "Scheduled launch queued"}
            </span>
            <span className="font-mono">{new Date(data.scheduled_for).toLocaleString()}</span>
            {fired && data.scheduled_fired_at && (
              <span className="text-slate-500">· worker ran at {new Date(data.scheduled_fired_at).toLocaleTimeString()}</span>
            )}
            {!fired && (
              <div className="ml-auto flex items-center gap-1.5">
                {/* Cycle 428 — reschedule. Prompts for a new local
                    datetime; converts to UTC ISO and PUTs. Native
                    prompt() is intentional — keeps the rescheduling
                    flow zero-friction without a modal. */}
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                  onClick={async () => {
                    const current = data.scheduled_for ? new Date(data.scheduled_for) : new Date(Date.now() + 86400_000);
                    const off = current.getTimezoneOffset();
                    const localStr = new Date(current.getTime() - off * 60_000).toISOString().slice(0, 16);
                    const next = window.prompt(
                      "New schedule (YYYY-MM-DDTHH:MM, your local browser tz):",
                      localStr,
                    );
                    if (!next) return;
                    let iso: string;
                    try { iso = new Date(next).toISOString(); }
                    catch { window.alert("Couldn't parse that datetime."); return; }
                    try {
                      await api.put(`/api/launches/${id}/schedule`, { scheduled_for: iso });
                      qc.invalidateQueries({ queryKey: ["launches", id] });
                      qc.invalidateQueries({ queryKey: ["launches"] });
                    } catch (e: any) {
                      window.alert(e?.message ?? "Reschedule failed");
                    }
                  }}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={async () => {
                    if (!window.confirm("Cancel this scheduled launch? The package will sit Pending until you manually launch.")) return;
                    try {
                      await api.post(`/api/launches/${id}/cancel-schedule`);
                      qc.invalidateQueries({ queryKey: ["launches", id] });
                      qc.invalidateQueries({ queryKey: ["launches"] });
                    } catch (e: any) {
                      window.alert(e?.message ?? "Cancel failed");
                    }
                  }}
                >
                  Cancel schedule
                </button>
              </div>
            )}
          </div>
        );
      })()}
      <div className="flex items-center justify-between mt-2 mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900 truncate">{data.name}</h1>
          {/* Cycle 141 — surface the Ad ID as a copy-friendly chip next to
              the package name. Click to copy → toast confirms. Operators
              currently re-type Ad IDs into ClickUp / Slack from memory. */}
          {data.ad_id && <CopyableAdIdChip adId={data.ad_id} />}
          {/* Cycle 151 — package age. Operators kept asking "when did I
              create this?" to triage stale drafts vs fresh launches.
              Relative time with full timestamp on hover. */}
          <span
            className="text-[11px] text-slate-500"
            title={`Created ${fmtDateTime(data.created_at)}${data.created_by ? ` by ${data.created_by}` : ""}`}
          >
            {relativeAge(data.created_at)}
          </span>
          {/* Cycle 230 — quick variation-count + state summary on detail
              header. Mirrors the list-row signal so operators don't have
              to scroll to the AdLinksSection to see what state things
              are in. */}
          {data.variations.length > 0 && (
            <span className="text-[11px] text-slate-500 font-mono">
              {data.variations.length} ads
              {(data.launched_count ?? 0) > 0 && <span className="text-emerald-700"> · {data.launched_count} launched</span>}
              {(data.rejected_count ?? 0) > 0 && <span className="text-rose-700"> · {data.rejected_count} rejected</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* "Use as template" — opens the launcher hydrated from this
              package. Operator can keep the same Ad ID + tweak (different
              ad-set, different copy) or wipe the Ad ID for a fresh launch.
              This used to be a "Duplicate" button before the 2026-05-17
              spec pivot removed it; restored on operator request. */}
          <Link
            to={`/ads-launcher/launch?from=${id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
            title="Open the launcher with every field hydrated from this package — fastest way to re-launch with tweaks."
          >
            ⎘ Use as template
          </Link>
          {/* Cycle 256 — JSON export for backup / sharing exact state. */}
          <a
            href={`/api/launches/${id}/export`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            title="Download the full package + variations as JSON for backup or sharing."
            aria-label="Export this launch package as JSON"
            download
          >
            ↓ JSON
          </a>
          {/* Status reflects facts (computed from the per-platform upload status
              below). It is NOT user-editable — what shows here is whatever Meta
              and Applovin actually report. */}
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold border ${
              data.status === "ACTIVE"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : data.status === "DELETED"
                ? "bg-red-50 text-red-700 border-red-200"
                : data.status === "WITH_ISSUES"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : data.status === "IN_PROCESS"
                ? "bg-sky-50 text-sky-700 border-sky-200"
                : "bg-slate-50 text-slate-700 border-slate-200"
            }`}
            title="Status is a fact, not a user setting. It updates from the actual launch + per-platform upload status."
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {data.status}
          </span>
        </div>
      </div>

      {/* Cycle 254 — for Draft launches, surface a clear "this is read-
          only; open in launcher to edit" hint above the meta strip. */}
      {data.status === "Draft" && (
        <div className="al-card mb-4 border-l-4 border-l-sky-400 bg-sky-50/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-sky-900">
              <span className="font-semibold">This package is still a Draft.</span> The Log Detail view is read-only. Edit in the launcher; status will move out of Draft after Save.
            </div>
            <Link
              to={`/ads-launcher/launch?from=${id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-300 bg-white text-sky-700 hover:bg-sky-100"
            >
              Open in launcher →
            </Link>
          </div>
        </div>
      )}

      <div className="al-card mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Meta label="Brand" value={data.brand_name} />
          <Meta label="Product" value={data.product_name} />
          <Meta label="Funnel" value={data.funnel} />
          <Meta label="Account" value={data.account_name} />
          <Meta label="Audience Template" value={data.audience_template_name ?? data.audience_template} />
          <Meta label="Pixel" value={data.pixel_name} />
          <Meta label="FB Page" value={data.fb_page_name} />
          <Meta label="Instagram" value={data.ig_handle} />
          <Meta label="Creative Template" value={data.creative_template_name} />
          <Meta label="Type" value={data.asset_type} />
          <Meta label="Ads" value={String(data.variations.length)} />
          <Meta label="Created" value={fmtDateTime(data.created_at)} />
          <Meta label="By" value={data.created_by} />
          <Meta label="Frame.io" value={data.frameio_folder_url} link />
        </div>
      </div>

      <PlatformStatusCard packageId={id} pkg={data} variationCount={data.variations.length} />

      <MetaLaunchCard packageId={id} pkg={data} />

      <ApplovinLaunchCard packageId={id} pkg={data} />

      <div className="al-card mb-4">
        <h3 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-5" />
          </svg>
          Campaign &amp; Ad-Set
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Meta
            label="Campaign Mode"
            value={
              data.campaign_mode === "new_per_adset"
                ? "New per ad set"
                : data.campaign_mode === "existing_abo"
                ? "Existing ABO"
                : data.campaign_mode === "existing_cbo"
                ? "Existing CBO"
                : data.campaign_mode
            }
          />
          <Meta label="Campaign Name" value={data.campaign_name ?? data.existing_campaign_name} />
          <Meta label="Objective" value={data.campaign_objective} />
          <Meta label="Buying Type" value={data.buying_type} />
          <Meta label="Budget" value={data.budget_amount ? `${data.budget_amount} ${data.budget_type ?? ""}`.trim() : null} />
          <Meta label="Optimization" value={data.optimization_goal} />
          <Meta label="Attribution" value={data.attribution_setting} />
          <Meta label="Ad-Set Name" value={data.ad_set_name_override} />
          <Meta label="Placement Mode" value={data.placement_mode} />
          <Meta label="Manual Placements" value={data.manual_placements && data.manual_placements.length > 0 ? data.manual_placements.join(", ") : null} />
          <Meta label="Shared Copy" value={data.apply_to_all_ad_copy === false ? "Per-row overrides" : "Shared across all ads"} />
        </div>
      </div>

      <ClickUpStatusCard packageId={id} />

      <AuditLog packageId={id} />

      {data.variations.length === 0 ? (
        /* Cycle 228 — friendly empty state when a draft has no ad rows
           yet. Avoid the bare AdLinksSection panel rendering with zero
           items and looking broken. */
        <div className="al-card border-l-4 border-l-amber-400">
          <h3 className="font-semibold text-sm text-amber-900 mb-1">
            This package has no ad rows.
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            Open "Use as template" or the launcher to add variations. Empty drafts can be safely deleted from the launcher's draft restore prompt.
          </p>
          <Link to={`/ads-launcher/launch?from=${id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100">
            Open in launcher →
          </Link>
        </div>
      ) : (
        <AdLinksSection packageId={id} variations={data.variations} pkg={data} />
      )}
    </div>
  );
}

// ============================================================================
// Per-variation Meta + AdManage links
// ============================================================================

type AdLinksResponse = {
  variations: {
    variation_id: string;
    file_name: string;
    ad_name: string;
    position: number;
    adm_id: number | null;
    lib_status: string | null;
    meta_ad_ids: string[];
    meta_ad_library_urls: string[];
    ads_manager_urls: string[];
    admanage_manage_url: string | null;
    meta_effective_status: string | null;
    meta_status_last_polled: string | null;
    meta_status_error: string | null;
  }[];
  campaign_link: {
    name: string | null;
    status: string | null;
    ads_manager_url: string;
    adsets: {
      total: number;
      active: number;
      paused: number;
      items: { adset_id: string; name: string; status: string | null; ad_count: number | null; ads_manager_url: string }[];
    } | null;
  } | null;
};

// Cycle 227 — small icon-button on each variation row that toggles a
// rejection state. Operator can mark a specific ad as rejected (e.g.
// spotted in Meta after launch) without affecting other variations.
function VariationRejectButton({ packageId, variationId, rejected }: { packageId: string; variationId: string; rejected: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmAct = useConfirm();
  const handleErr = useLaunchPackageErrorHandler();
  const toggle = useMutation({
    mutationFn: (input: { error: string }) =>
      api.post(`/api/launches/${packageId}/mark-variation-rejected`, {
        variation_id: variationId,
        error: input.error,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
      qc.invalidateQueries({ queryKey: ["ad-links", packageId] });
    },
    onError: handleErr,
  });
  return (
    <button
      type="button"
      className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
        rejected
          ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
          : "bg-white text-slate-500 border-slate-200 hover:bg-rose-50 hover:text-rose-700"
      }`}
      title={rejected
        ? "Clear the operator-set rejection on this variation."
        : "Mark this variation as rejected without touching the others."}
      disabled={toggle.isPending}
      onClick={async () => {
        if (rejected) {
          toggle.mutate({ error: "" });
          toast("success", "Rejection cleared.");
          return;
        }
        const reason = window.prompt(
          "What's the rejection reason? (Operator note, optional)",
          "Policy violation",
        );
        if (reason === null) return;
        const ok = await confirmAct({
          title: "Mark this variation as rejected?",
          description: `Sets meta_launch_error on this row and clears its meta_ad_id. Won't affect other variations. Reason: ${reason || "(none)"}`,
          tone: "danger",
          confirmLabel: "Mark rejected",
        });
        if (!ok) return;
        toggle.mutate({ error: reason || "Rejected" });
        toast("success", "Variation marked rejected.");
      }}
    >
      {toggle.isPending ? "…" : rejected ? "✓ rejected" : "× reject"}
    </button>
  );
}

function AdLinksSection({ packageId, variations, pkg }: { packageId: string; variations: LaunchPackageDetail["variations"]; pkg?: LaunchPackageDetail | null }) {
  // Cycle 280 — operator-rejection bulk clear. Wired to the C277
  // server endpoint. Only visible when any variation has an
  // operator-set rejection.
  const operatorRejectionCount = variations.filter((v) =>
    typeof v.meta_launch_error === "string" && v.meta_launch_error.startsWith("[operator]"),
  ).length;
  const qc = useQueryClient();
  const { data: links } = useQuery({
    queryKey: ["ad-links", packageId],
    queryFn: () => api.get<AdLinksResponse>(`/api/launches/${packageId}/ad-links`),
    refetchInterval: 60_000, // refresh every 60s so live ad/adset status drifts in
  });
  const byVar = new Map((links?.variations ?? []).map((v) => [v.variation_id, v]));
  // Variations from the launch detail come without id keys in some shapes;
  // match by position as a fallback.
  const byPos = new Map((links?.variations ?? []).map((v) => [v.position, v]));

  // Force-refresh Meta effective_status for this package's variations.
  // Clears the 10-min cache server-side, then invalidates the React Query
  // cache so the UI re-renders with the fresh values.
  const refreshStatuses = useMutation({
    mutationFn: () => api.post<{ ok: boolean; cleared: number; ad_ids: string[] }>(`/api/launches/${packageId}/refresh-statuses`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad-links", packageId] }),
  });
  // Cycle 308 — "Enable in Meta" → POST /enable-meta which calls Graph
  // setAdStatus("ACTIVE") for every variation with a meta_ad_id.
  const enableMeta = useMutation({
    mutationFn: () => api.post<{
      ok: boolean;
      attempted: number;
      succeeded: number;
      failed: number;
      results: { variation_id: string; meta_ad_id: string; ad_name: string; ok: boolean; error?: string }[];
    }>(`/api/launches/${packageId}/enable-meta`),
    onSuccess: () => {
      // Force-refresh statuses so the badges flip ACTIVE in the UI.
      qc.invalidateQueries({ queryKey: ["ad-links", packageId] });
      refreshStatuses.mutate();
    },
  });
  // Are any ads currently NOT ACTIVE on Meta? Drives whether the button shows.
  const pausedOrPendingCount = (links?.variations ?? []).filter((v) =>
    v.meta_ad_ids.length > 0 && v.meta_effective_status && v.meta_effective_status !== "ACTIVE",
  ).length;
  // How many variations actually have a Meta ad_id we could poll status for?
  const matchedVariationCount = (links?.variations ?? []).filter((v) => v.meta_ad_ids.length > 0).length;
  // Cycle 136 — drift = variations whose library row currently shows Rejected
  // (or similar policy failure). Surfaces a top-of-detail banner so the
  // operator doesn't have to scan every variation row to spot a kill.
  const FAILED_LIB_STATUSES = new Set(["Rejected", "Disapproved", "Policy Violation"]);
  const driftVariations = (links?.variations ?? []).filter((v) => v.lib_status && FAILED_LIB_STATUSES.has(v.lib_status));

  return (
    <>
      {driftVariations.length > 0 && (
        <div className="al-card mb-4 border-l-4 border-l-rose-500 bg-rose-50/50">
          <h3 className="font-semibold text-sm text-rose-900 mb-1 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {driftVariations.length} of {links?.variations.length ?? 0} variation{driftVariations.length === 1 ? "" : "s"} rejected in Meta
          </h3>
          <p className="text-xs text-slate-700 mb-2">
            Library status flipped to <span className="font-mono">{Array.from(new Set(driftVariations.map((v) => v.lib_status))).join(" / ")}</span> after launch. Check each variation, replace + relaunch, or mark this package Rejected.
          </p>
          <ul className="text-[11px] font-mono space-y-0.5">
            {driftVariations.slice(0, 5).map((v) => (
              <li key={v.variation_id} className="truncate text-slate-700" title={v.file_name}>
                <span className="text-rose-700">{v.lib_status}</span> · {v.file_name}
              </li>
            ))}
            {driftVariations.length > 5 && (
              <li className="text-slate-500 italic">… {driftVariations.length - 5} more not shown</li>
            )}
          </ul>
        </div>
      )}
      {links?.campaign_link && (
        <div className="al-card mb-4">
          <h3 className="font-semibold text-sm text-slate-700 mb-2 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" /><path d="M9 3v18" />
            </svg>
            Bound Campaign
          </h3>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <a
              href={links.campaign_link.ads_manager_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 hover:underline truncate"
            >
              {links.campaign_link.name ?? "(unnamed campaign)"} ↗
            </a>
            {links.campaign_link.status && (
              <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                links.campaign_link.status === "ACTIVE"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}>{links.campaign_link.status}</span>
            )}
            <span className="text-[10px] text-slate-400 italic">live status from AdManage · refreshes every 60s</span>
          </div>
          {/* Ad-set summary */}
          {links.campaign_link.adsets && links.campaign_link.adsets.total > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                <span>Ad sets in this campaign</span>
                <span className="font-mono text-emerald-700">{links.campaign_link.adsets.active} active</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-500">{links.campaign_link.adsets.paused} paused</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-500">{links.campaign_link.adsets.total} total</span>
              </div>
              <div className="space-y-1">
                {links.campaign_link.adsets.items.slice(0, 6).map((a) => (
                  <div key={a.adset_id} className="flex items-center gap-2 text-[11px]">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      a.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-50 text-slate-600 border border-slate-200"
                    }`}>{a.status ?? "?"}</span>
                    <a className="text-brand-600 hover:underline truncate flex-1" href={a.ads_manager_url} target="_blank" rel="noopener noreferrer" title={a.name}>
                      {a.name}
                    </a>
                    {a.ad_count != null && (
                      <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{a.ad_count} ads</span>
                    )}
                  </div>
                ))}
                {links.campaign_link.adsets.total > 6 && (
                  <div className="text-[10px] text-slate-400 italic mt-1">
                    + {links.campaign_link.adsets.total - 6} more ad set{links.campaign_link.adsets.total - 6 === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="al-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Ad Variations
            <span className="text-[10px] font-mono text-slate-400 ml-1">{variations.length}</span>
          </h3>
          {matchedVariationCount > 0 && (
            <button
              type="button"
              disabled={refreshStatuses.isPending}
              onClick={() => refreshStatuses.mutate()}
              className="text-[10px] font-semibold px-2 py-1 rounded border bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              title={`Force a fresh Meta poll for the ${matchedVariationCount} variation${matchedVariationCount === 1 ? "" : "s"} that has a Meta ad ID. Bypasses the 10-min cache.`}
            >
              {refreshStatuses.isPending
                ? "Refreshing…"
                : refreshStatuses.data
                  ? `✓ refreshed ${refreshStatuses.data.cleared} status${refreshStatuses.data.cleared === 1 ? "" : "es"}`
                  : "↻ Refresh Meta statuses"}
            </button>
          )}
          {/* Cycle 308 — Enable in Meta button. Visible when ≥1 variation
              is paused or pending on Meta. Hidden when everything is
              already ACTIVE so the operator's eye isn't drawn to an
              already-resolved state. */}
          {pausedOrPendingCount > 0 && (
            <button
              type="button"
              disabled={enableMeta.isPending}
              onClick={() => {
                if (window.confirm(`Set ${pausedOrPendingCount} paused/pending ad${pausedOrPendingCount === 1 ? "" : "s"} to ACTIVE on Meta? This starts spending immediately.`)) {
                  enableMeta.mutate();
                }
              }}
              className="text-[10px] font-semibold px-2 py-1 rounded border bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50 inline-flex items-center gap-1.5"
              title={`Set status=ACTIVE on Meta for the ${pausedOrPendingCount} paused/pending variation${pausedOrPendingCount === 1 ? "" : "s"} of this package. Each ad is PATCHed via Graph; partial success is reported.`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {enableMeta.isPending
                ? "Enabling…"
                : enableMeta.data
                  ? `✓ ${enableMeta.data.succeeded}/${enableMeta.data.attempted} live`
                  : `Enable ${pausedOrPendingCount} on Meta`}
            </button>
          )}
          {/* Cycle 238 — per-package CSV export. Variation rows + bound
              meta_ad_ids + lib status. Useful for sending an ops report
              of "what's live for this launch". */}
          <button
            type="button"
            className="text-[10px] font-semibold px-2 py-1 rounded border bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            title="Download per-variation status + Meta ad IDs as CSV"
            onClick={() => {
              const headers = ["position", "ad_name", "file_name", "meta_ad_id", "lib_status", "meta_effective_status", "meta_launch_error"];
              const rows = variations.map((v, i) => {
                const link = (v.id ? byVar.get(v.id) : undefined) ?? byPos.get(i);
                return [
                  String(i + 1),
                  v.ad_name ?? "",
                  v.file_name,
                  link?.meta_ad_ids?.[0] ?? (v as any).meta_ad_id ?? "",
                  link?.lib_status ?? "",
                  link?.meta_effective_status ?? "",
                  v.meta_launch_error ?? "",
                ];
              });
              const esc = (s: string) =>
                /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
              // Cycle 258 — UTF-8 BOM so Excel auto-detects encoding.
              const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `variations-${packageId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            ↓ CSV
          </button>
          {/* Cycle 280 — bulk-clear operator-set rejections. Visible
              only when ≥1 exists. */}
          {operatorRejectionCount > 0 && (
            <button
              type="button"
              className="text-[10px] font-semibold px-2 py-1 rounded border bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
              title={`Clear ${operatorRejectionCount} operator-set rejection${operatorRejectionCount === 1 ? "" : "s"}. Real Meta launch errors are preserved.`}
              onClick={async () => {
                try {
                  await api.post<{ ok: boolean; cleared: number }>(
                    `/api/launches/${packageId}/clear-operator-rejections`,
                  );
                  qc.invalidateQueries({ queryKey: ["launches", packageId] });
                  qc.invalidateQueries({ queryKey: ["ad-links", packageId] });
                } catch {
                  // Toast handled upstream by api error path
                }
              }}
            >
              ↺ Clear {operatorRejectionCount} rejection{operatorRejectionCount === 1 ? "" : "s"}
            </button>
          )}
          {/* Cycle 259 — copy all launched Meta ad IDs as a space-
              separated list for pasting into Ads Manager search. */}
          {matchedVariationCount > 0 && (
            <button
              type="button"
              className="text-[10px] font-semibold px-2 py-1 rounded border bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              title="Copy all launched Meta ad IDs (space-separated) to clipboard. Paste into Ads Manager search to pull up just this batch."
              onClick={async () => {
                const allIds = (links?.variations ?? [])
                  .flatMap((v) => v.meta_ad_ids ?? [])
                  .filter(Boolean);
                const text = allIds.join(" ");
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  // ignore
                }
              }}
            >
              📋 Copy {matchedVariationCount} ad ID{matchedVariationCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
        {/* Cycle 313 — Enable-in-Meta partial-failure surfacing. Only renders
            when the operator clicked Enable and one or more per-ad PATCHes
            failed. Lets them see exactly which ads need attention without
            opening Ads Manager. */}
        {enableMeta.data && enableMeta.data.failed > 0 && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="text-xs font-semibold text-rose-900 mb-1">
              {enableMeta.data.failed} of {enableMeta.data.attempted} ad{enableMeta.data.attempted === 1 ? "" : "s"} couldn't be enabled
            </div>
            <ul className="text-[11px] font-mono space-y-1">
              {enableMeta.data.results.filter((r) => !r.ok).slice(0, 6).map((r) => (
                <li key={r.variation_id} className="text-rose-900">
                  <span className="font-semibold text-slate-800 truncate inline-block max-w-[16ch] align-bottom" title={r.ad_name}>{r.ad_name}</span>
                  <span className="text-slate-400 mx-1.5">→</span>
                  <span className="text-rose-700">{r.error ?? "unknown error"}</span>
                </li>
              ))}
              {enableMeta.data.results.filter((r) => !r.ok).length > 6 && (
                <li className="text-slate-500 italic">… {enableMeta.data.results.filter((r) => !r.ok).length - 6} more not shown</li>
              )}
            </ul>
          </div>
        )}
        {/* Cycle 336 — per-variation rows are now SUMMARY-by-default with
            an expand toggle. Summary shows: position, ad_name, status
            badge (Meta + lib), upload date, direct Ads Manager link.
            Expand reveals headline / description / primary text / dest URL. */}
        <div className="space-y-2">
          {variations.map((v, i) => (
            <VariationRow
              key={i}
              v={v}
              i={i}
              packageId={packageId}
              link={(v.id ? byVar.get(v.id) : undefined) ?? byPos.get(i)}
              packageMetaLaunchedAt={pkg?.meta_launched_at ?? null}
              packageApplovinLaunchedAt={pkg?.applovin_launched_at ?? null}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Cycle 336 — Condensed variation row.
 *
 * Summary line (always visible): #N · ad_name · Meta status badge ·
 * lib status · upload date · direct Ads Manager link · Expand button.
 * Expanded: headline / description / primary text / destination URL.
 *
 * Operator spec: "I don't need to see all of this detail … just see a
 * summary of each of them, along with a link directly to the ad manager."
 */
function VariationRow({
  v, i, packageId, link, packageMetaLaunchedAt,
}: {
  v: LaunchPackageDetail["variations"][number];
  i: number;
  packageId: string;
  link: AdLinksResponse["variations"][number] | undefined;
  packageMetaLaunchedAt: string | null;
  packageApplovinLaunchedAt: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const mid = link?.meta_ad_ids?.[0] ?? (v as any).meta_ad_id ?? null;
  const operatorRejected = typeof v.meta_launch_error === "string" && v.meta_launch_error.startsWith("[operator]");
  const isRejected = !!v.meta_launch_error;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 p-2.5 flex-wrap">
        <span className="shrink-0 w-6 h-6 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-[10px] font-bold inline-flex items-center justify-center font-mono">
          {i + 1}
        </span>
        <span className="font-semibold text-slate-900 truncate flex-1 min-w-0" title={v.file_name}>
          {v.ad_name || v.file_name || "(unnamed)"}
        </span>
        {/* Meta status — uses live effective_status when available, else falls back to rejected/launched/pending */}
        {link?.meta_effective_status ? (
          <MetaStatusBadge status={link.meta_effective_status} polled={link.meta_status_last_polled} error={link.meta_status_error} />
        ) : isRejected ? (
          <span
            className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${operatorRejected ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}
            title={v.meta_launch_error ?? ""}
          >
            {operatorRejected ? "Rejected (op)" : "Rejected"}
          </span>
        ) : mid ? (
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
            Launched
          </span>
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200">
            Pending
          </span>
        )}
        {/* Direct Ads Manager link — first one if multiple */}
        {link?.ads_manager_urls?.[0] && (
          <a
            href={link.ads_manager_urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-brand-700 hover:underline px-1.5 py-0.5 rounded border border-brand-100 bg-brand-50 shrink-0"
          >
            Ads Manager ↗
          </a>
        )}
        {/* Upload date (package-level, since per-variation upload time
            isn't tracked separately) */}
        {packageMetaLaunchedAt && (
          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap" title={`Uploaded ${fmtDateTime(packageMetaLaunchedAt)}`}>
            {fmtDateChip(packageMetaLaunchedAt)}
          </span>
        )}
        <button
          type="button"
          className="text-[10px] text-slate-500 hover:text-slate-900 px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50 shrink-0"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Hide" : "Details"}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 p-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[11px] bg-slate-50/40">
          <DetailField label="Ad name" value={v.ad_name} copy />
          <DetailField label="File" value={v.file_name} mono copy />
          {mid && (
            <DetailField label="Meta ad ID" value={mid} mono copy />
          )}
          {v.call_to_action && (
            <DetailField label="CTA" value={v.call_to_action} />
          )}
          <DetailField label="Destination" value={v.destination_url} mono link wide />
          <DetailField label="Headline" value={v.headline} />
          <DetailField label="Description" value={v.description} />
          <DetailField label="Primary text" value={v.primary_text} wide />
          {v.meta_launch_error && (
            <DetailField
              label={operatorRejected ? "Operator rejection" : "Meta launch error"}
              value={operatorRejected ? v.meta_launch_error.replace(/^\[operator\]\s*/, "") : v.meta_launch_error}
              wide
            />
          )}
          {/* Per-variation reject toggle stays inside the expanded panel —
              destructive action shouldn't live in the always-visible summary. */}
          {v.id && (
            <div className="md:col-span-2 pt-1">
              <VariationRejectButton packageId={packageId} variationId={v.id} rejected={!!v.meta_launch_error} />
            </div>
          )}
          {/* Extra links if present (Library / AdManage) */}
          {link && (link.meta_ad_library_urls.length > 0 || link.admanage_manage_url) && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
              {link.meta_ad_library_urls.map((u, k) => (
                <a key={`lib-${k}`} className="text-[10px] font-medium text-sky-700 hover:underline px-1.5 py-0.5 rounded border border-sky-100 bg-sky-50" href={u} target="_blank" rel="noopener noreferrer">
                  FB Library ↗
                </a>
              ))}
              {link.admanage_manage_url && (
                <a className="text-[10px] font-medium text-violet-700 hover:underline px-1.5 py-0.5 rounded border border-violet-100 bg-violet-50" href={link.admanage_manage_url} target="_blank" rel="noopener noreferrer">
                  AdManage ↗
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type AuditEntry = {
  id: string;
  actor: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

// ============================================================================
// ClickUp live status card
// ============================================================================

type ClickUpStatus = {
  ok: boolean;
  configured: boolean;
  reason?: string;
  task_id?: string;
  clickup_task_url?: string | null;
  name?: string | null;
  status?: string | null;
  status_color?: string | null;
  status_type?: string | null;
  list_name?: string | null;
  list_id?: string | null;
  folder_name?: string | null;
  space_name?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  assignees?: { id?: number; username?: string; email?: string; color?: string }[];
  url?: string | null;
  fetched_at?: string;
  upstream_error?: string;
};

function ClickUpStatusCard({ packageId }: { packageId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["clickup-status", packageId],
    queryFn: () => api.get<ClickUpStatus>(`/api/launches/${packageId}/clickup-status`),
    refetchInterval: 60_000,
    retry: 0,
  });

  if (isLoading || !data) return null;
  if (!data.clickup_task_url) return null; // package has no ClickUp link at all

  return (
    <div className="al-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          ClickUp Task
          {data.fetched_at && <span className="text-[10px] text-slate-400 italic font-normal">live · refreshes every 60s</span>}
        </h3>
        <a
          href={data.clickup_task_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
        >
          Open ↗
        </a>
      </div>

      {data.ok ? (
        <div className="space-y-2">
          {data.name && (
            <div className="text-base font-semibold text-slate-900">{data.name}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {data.status && (
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border"
                style={{
                  borderColor: data.status_color ?? "#cbd5e1",
                  color: data.status_color ?? "#475569",
                  backgroundColor: (data.status_color ?? "#cbd5e1") + "15",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.status_color ?? "#cbd5e1" }} />
                {data.status}
              </span>
            )}
            {data.list_name && (
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
                list · {data.list_name}
              </span>
            )}
            {data.space_name && (
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
                space · {data.space_name}
              </span>
            )}
            {data.folder_name && (
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
                folder · {data.folder_name}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] pt-1">
            <CuField label="Created" value={data.date_created} />
            <CuField label="Last update" value={data.date_updated} />
            <CuField label="Start" value={data.start_date} />
            <CuField label="Due" value={data.due_date} />
          </div>
          {data.assignees && data.assignees.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Assigned:</span>
              {data.assignees.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border"
                  style={{ borderColor: a.color ?? "#cbd5e1", color: a.color ?? "#475569", backgroundColor: (a.color ?? "#cbd5e1") + "15" }}
                >
                  {a.username ?? a.email ?? `user ${a.id}`}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[12px] text-slate-600 space-y-1">
          {!data.configured && data.reason === "no_token" && (
            <>
              <div className="text-amber-800">
                <span className="font-semibold">ClickUp not configured.</span> Set the <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">CLICKUP_API_TOKEN</code> env var on the server (personal token from https://app.clickup.com/settings/apps) to enable live status, list, dates, and assignees here.
              </div>
              <div className="text-slate-500 text-[11px]">
                Task ID parsed: <span className="font-mono">{data.task_id}</span>
              </div>
            </>
          )}
          {data.reason === "no_url" && <div>This launch package has no ClickUp task URL bound.</div>}
          {data.reason === "url_unparseable" && <div>Couldn't parse a task ID from the bound URL ({data.clickup_task_url}).</div>}
          {data.reason === "not_found" && (
            <div className="text-red-700">
              ClickUp couldn't find task <span className="font-mono">{data.task_id}</span>. {data.upstream_error}
            </div>
          )}
          {data.reason === "upstream_error" && (
            <div className="text-red-700">ClickUp API error: {data.upstream_error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function CuField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5">{label}</div>
      <div className="text-slate-700">
        {value ? fmtDateTime(value) : <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}

function AuditLog({ packageId }: { packageId: string }) {
  const { data: auditData, isLoading } = useQuery({
    queryKey: ["audit", packageId],
    queryFn: () => api.get<{ ok: boolean; entries: AuditEntry[] }>(`/api/launches/${packageId}/audit`),
    refetchInterval: 10_000,
  });
  const rows = auditData?.entries ?? [];
  if (isLoading) return null;
  if (rows.length === 0) return null;
  return (
    <div className="al-card mb-4">
      <h3 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Activity log
      </h3>
      <ol className="relative border-l border-slate-200 ml-2 space-y-3 pl-4">
        {rows.map((r) => {
          const dot =
            r.action === "platform_status_changed"
              ? "bg-emerald-500"
              : r.action === "status_changed"
              ? "bg-sky-500"
              : r.action === "deleted"
              ? "bg-red-500"
              : "bg-brand-500";
          return (
            <li key={r.id} className="text-xs relative">
              <span className={`absolute -left-[1.4rem] top-1 w-2.5 h-2.5 rounded-full ${dot} ring-4 ring-white`} />
              <div className="text-slate-900">
                <span className="font-semibold">{r.actor ?? "system"}</span>{" "}
                <span className="text-slate-600">{describe(r)}</span>
              </div>
              <div className="text-slate-400 text-[10px] mt-0.5">{fmtDateTime(r.created_at)}</div>
              {r.details && Object.keys(r.details).length > 0 && r.action !== "created" && (
                <div className="text-[10px] text-slate-500 font-mono mt-1 truncate">
                  {Object.entries(r.details)
                    .filter(([k]) => k !== "comment_preview")
                    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                    .join(" · ")}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function describe(r: AuditEntry): string {
  const d = r.details ?? {};
  switch (r.action) {
    case "created": return `created the launch (${(d as any).rows ?? 0} ad${(d as any).rows === 1 ? "" : "s"}).`;
    case "status_changed": return `changed package status to ${(d as any).to ?? "?"}.`;
    case "platform_status_changed":
      return `marked ${(d as any).platform?.toUpperCase()} as ${(d as any).status}.`;
    case "deleted": return "deleted the launch.";
    default: return r.action.replace(/_/g, " ") + ".";
  }
}

type Platform = "meta" | "applovin";
type PlatformStatus = "ACTIVE" | "PAUSED" | "WITH_ISSUES";

// The backend still stores/returns the legacy upload-status vocabulary
// (Pending/Live/Rejected). The UI now speaks the Meta-style ACTIVE/PAUSED/
// WITH_ISSUES vocabulary, so normalize at every read boundary. Accepts
// already-migrated values too, so it stays idempotent.
function normalizePlatformStatus(s: string | null | undefined): PlatformStatus | null {
  switch (s) {
    case "Live":
    case "ACTIVE":
      return "ACTIVE";
    case "Pending":
    case "PAUSED":
      return "PAUSED";
    case "Rejected":
    case "WITH_ISSUES":
      return "WITH_ISSUES";
    default:
      return null;
  }
}

/**
 * Read-only display of the EXACT Meta API payloads that would be sent for
 * this package, plus a side-by-side comparison against the known-good
 * Cleantra Lymph "CBO_Video_Test" config (Graph pull on 2026-05-18).
 *
 * Operator clicks "Verify launch payload" to inspect — no mutation. If
 * blockers exist, they're surfaced at the top so the operator fixes
 * them before clicking the actual Launch button.
 */
function LaunchReadinessPanel({ data }: { data: any }) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
      {data.blockers && data.blockers.length > 0 && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2">
          <div className="text-[11px] font-semibold text-rose-900 mb-1">
            {data.blockers.length} blocker{data.blockers.length === 1 ? "" : "s"} — fix these before launching:
          </div>
          <ul className="text-[11px] text-rose-800 list-disc pl-5">
            {data.blockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {data.proven_comparison && (
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
          <div className="text-[11px] font-semibold text-slate-700 mb-2">
            Comparison vs proven Cleantra Lymph config (CBO_Video_Test, pulled live from Graph)
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="font-semibold w-44">Field</th>
                <th className="font-semibold">Ours</th>
                <th className="font-semibold">Proven</th>
                <th className="font-semibold w-10 text-center">=</th>
              </tr>
            </thead>
            <tbody>
              {data.proven_comparison.map((row: any) => (
                <tr key={row.field} className={`border-t border-slate-100 ${row.match ? "" : "bg-amber-50/40"}`}>
                  <td className="py-1 font-mono text-slate-600">{row.field}</td>
                  <td className="py-1 font-mono text-slate-800 truncate max-w-xs">{JSON.stringify(row.ours)}</td>
                  <td className="py-1 font-mono text-slate-500 truncate max-w-xs">{JSON.stringify(row.proven)}</td>
                  <td className="py-1 text-center">{row.match ? "✓" : "✕"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
          <div className="text-[11px] font-semibold text-slate-700 mb-1.5">Campaign payload</div>
          <pre className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap break-words">{JSON.stringify(data.payloads.campaign, null, 2)}</pre>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
          <div className="text-[11px] font-semibold text-slate-700 mb-1.5">Ad-set payload</div>
          <pre className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap break-words">{JSON.stringify(data.payloads.adset, null, 2)}</pre>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
        <div className="text-[11px] font-semibold text-slate-700 mb-1.5">
          Ad payloads ({data.payloads.ads.length} variation{data.payloads.ads.length === 1 ? "" : "s"})
        </div>
        <pre className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap break-words max-h-96 overflow-auto">{JSON.stringify(data.payloads.ads.slice(0, 3), null, 2)}</pre>
        {data.payloads.ads.length > 3 && (
          <div className="text-[10px] text-slate-500 mt-1">…and {data.payloads.ads.length - 3} more (same shape)</div>
        )}
      </div>
    </div>
  );
}

/**
 * Push the package's variations to Meta in PAUSED status via
 * /api/launches/:id/launch-meta. Surfaces a per-variation result strip
 * and the preconditions the endpoint requires (existing adset, FB page,
 * IG account). Already-launched variations are skipped on the server,
 * so re-clicking the button is safe; it'll only top up the remaining ones.
 */
// Staleness guard for background launch jobs. A job can wedge in status:'running'/'queued'
// when the worker is redeployed / SIGKILLed before its terminal DB write — the row then sits
// stale until the ~30-min lease reaper rescues it. Treat an active job whose row hasn't been
// touched in >20s (≈8× the 2.5s poll tick — comfortably longer than a normal heartbeat gap)
// as stale, so the UI can warn instead of showing a confident, frozen "Launching…" spinner.
// Shared by MetaLaunchCard + ApplovinLaunchCard (identical logic — factored to avoid drift).
function getLaunchStaleness(data: { status?: string; updated_at?: string } | undefined): { isStale: boolean; ageMs: number | null } {
  const activeState = data?.status === "queued" || data?.status === "running";
  if (!activeState || !data?.updated_at) return { isStale: false, ageMs: null };
  const ageMs = Date.now() - new Date(data.updated_at).getTime();
  return { isStale: ageMs > 20000, ageMs };
}

function MetaLaunchCard({ packageId, pkg }: { packageId: string; pkg: LaunchPackageDetail }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  // Cycle 185 — multi-tab 404 grace inherited.
  const handleMutationError = useLaunchPackageErrorHandler();
  const [showReadiness, setShowReadiness] = useState(false);
  // Cycle 225 — bulk mark-launched manual UI state.
  const [showManual, setShowManual] = useState(false);
  const { data: readiness } = useQuery({
    queryKey: ["launch-readiness", packageId],
    queryFn: () => api.get<any>(`/api/launches/${packageId}/launch-readiness`),
    enabled: showReadiness,
  });
  // The launch endpoint now ENQUEUES a background job (202) — poll the job status for live
  // progress + the final result instead of trusting the POST body. Poll only while active.
  // Scoped to platform 'meta' so this card reflects ONLY the Meta launch (a package can
  // have a Meta job AND an AppLovin job active at once).
  const launchStatus = useQuery({
    queryKey: ["launch-status", packageId, "meta"],
    queryFn: () => getLaunchStatus(packageId, "meta"),
    refetchInterval: (q) => { const s = (q?.state?.data as any)?.status; return s === "queued" || s === "running" ? 2500 : false; },
  });
  const active = launchStatus.data?.status === "queued" || launchStatus.data?.status === "running";
  // Staleness guard — an active job whose row hasn't updated in >20s is likely a dead/redeploying
  // worker (see getLaunchStaleness). Poll keeps running; we just swap the confident spinner for a warning.
  const { isStale, ageMs } = getLaunchStaleness(launchStatus.data);
  const staleAgeSec = ageMs != null ? Math.round(ageMs / 1000) : null;
  // When the background job reaches a terminal state, refetch the package so per-row launched
  // state + the button label reflect the newly-created Meta ads.
  useEffect(() => {
    const s = launchStatus.data?.status;
    if (s === "succeeded" || s === "partial" || s === "failed" || s === "canceled") {
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
      qc.invalidateQueries({ queryKey: ["launches"] });
    }
  }, [launchStatus.data?.status]);
  // Final per-variation result comes from the poll (same results[] shape as the old sync body).
  const st = launchStatus.data?.status;
  const showResult = st === "succeeded" || st === "partial" || st === "failed";
  const lastResult: any = showResult ? launchStatus.data?.result : null;
  const launch = useMutation({
    mutationFn: () => api.post<any>(`/api/launches/${packageId}/launch-meta`),
    onSuccess: () => {
      // 202 { job_id, status } — not the final result. Kick the status poll + refresh the package.
      qc.invalidateQueries({ queryKey: ["launch-status", packageId, "meta"] });
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
    },
    onError: handleMutationError,
  });

  const ready = !!pkg.meta_account_id && !!pkg.fb_page_id && !!pkg.ig_account_id && !!(pkg as any).existing_adset_id;
  const missing: string[] = [];
  if (!pkg.meta_account_id) missing.push("Meta account");
  if (!pkg.fb_page_id) missing.push("FB Page");
  if (!pkg.ig_account_id) missing.push("Instagram");
  if (!(pkg as any).existing_adset_id) missing.push("Existing ad set (campaign-create flow not yet wired)");

  const errMsg = launch.error ? (launch.error as Error).message : null;

  return (
    <div className="al-card mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500">
              <path d="M5 12l5 5L20 7" />
            </svg>
            Launch to Meta
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Pushes each variation to the ad set as a <span className="font-mono">PAUSED</span> ad. Review in Ads Manager before activating. Already-launched rows are skipped on re-click.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowReadiness((v) => !v)}
            className="text-[11px] px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            title="Show the exact Meta API payloads that would be sent"
          >
            {showReadiness ? "Hide payload" : "Verify launch payload"}
          </button>
          {/* Cycle 225 — bulk mark-launched manually. For ops launched
              outside the tool. Toggle reveals the paste-in UI below. */}
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-[11px] px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            title="Paste Meta ad IDs to mark variations as launched outside the tool. Useful when you launched manually in Business Manager."
          >
            {showManual ? "Hide manual mark" : "Mark launched manually"}
          </button>
          <button
            type="button"
            onClick={async () => {
              // Cycle 129 Round 3 — confirm before launch.
              // The launch endpoint IS idempotent (re-clicks skip already-launched
              // variations via meta_ad_id check), but creating real Meta resources
              // is irreversible enough to warrant a friction step. Avoids
              // accidental launches from misclicks / muscle memory.
              const unlaunched = pkg.variations.filter((v: any) => !v.meta_ad_id).length;
              if (unlaunched === 0) return;
              const ok = await confirmAct({
                title: `Launch ${unlaunched} ad${unlaunched === 1 ? "" : "s"} to Meta?`,
                description: `Creates ${unlaunched} PAUSED ad${unlaunched === 1 ? "" : "s"} in Meta. ${(pkg as any).campaign_mode === "new_per_adset" ? "Will also create a new campaign + ad set." : "Goes into the existing ad set."} Review in Ads Manager before activating.`,
                confirmLabel: "Launch (paused)",
              });
              if (ok) launch.mutate();
            }}
            disabled={active || !ready || pkg.variations.filter((v: any) => !v.meta_ad_id).length === 0}
            className="btn-primary text-xs disabled:opacity-50"
            title={ready ? "Launch only variations that don't have a Meta ad ID yet. Already-launched rows are skipped server-side." : `Missing: ${missing.join(" · ")}`}
          >
            {(() => {
              // Cycle 187 — show "Launch N unlaunched" vs "All launched"
              // on the button label itself, so the operator knows from a
              // glance whether clicking will do anything.
              if (active) return "Launching in background…";
              const total = pkg.variations.length;
              const launched = pkg.variations.filter((v: any) => v.meta_ad_id).length;
              const unlaunched = total - launched;
              if (total === 0) return "Launch to Meta (no variations)";
              if (unlaunched === 0) return `All ${total} launched ✓`;
              if (launched === 0) return `Launch ${total} to Meta (paused)`;
              return `Launch ${unlaunched} unlaunched (${launched} already live)`;
            })()}
          </button>
        </div>
      </div>

      {showReadiness && readiness && (
        <LaunchReadinessPanel data={readiness} />
      )}

      {showManual && (
        <ManualMarkLaunchedPanel
          packageId={packageId}
          variations={pkg.variations}
          onDone={() => {
            setShowManual(false);
            qc.invalidateQueries({ queryKey: ["launches", packageId] });
            qc.invalidateQueries({ queryKey: ["launches"] });
            qc.invalidateQueries({ queryKey: ["ad-links", packageId] });
          }}
        />
      )}

      {!ready && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Can't launch yet — missing: <span className="font-semibold">{missing.join(" · ")}</span>
        </div>
      )}

      {/* Stale/wedged job — the row hasn't updated in >20s, so the worker may have been
          redeployed / killed before its terminal write. Warn instead of a confident spinner;
          the poll keeps running (the job may still finish or be rescued by the lease reaper). */}
      {active && isStale && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2">
          <span className="shrink-0" aria-hidden="true">⚠</span>
          <div className="min-w-0">
            <span className="font-semibold">Status unknown — the launch worker may be redeploying.</span>{" "}
            Do NOT re-launch blindly; verify in Ads Manager / Axon first.
            <div className="text-amber-800 mt-0.5">
              {launchStatus.data?.current_step && (
                <span>last step: <span className="font-medium">{launchStatus.data.current_step}</span> · </span>
              )}
              last update {staleAgeSec ?? "?"}s ago · <span className="font-mono">{launchStatus.data?.completed ?? 0}/{launchStatus.data?.total ?? "?"}</span> done
            </div>
          </div>
        </div>
      )}

      {active && !isStale && (
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500 animate-spin shrink-0">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="font-semibold">Launching in background…</span>
          <span className="font-mono">
            {launchStatus.data?.completed ?? 0}/{launchStatus.data?.total ?? "?"} done
            {launchStatus.data?.failed ? ` · ${launchStatus.data.failed} failed` : ""}
          </span>
          {launchStatus.data?.current_step && (
            <span className="text-sky-700 truncate">· {launchStatus.data.current_step}</span>
          )}
        </div>
      )}

      {errMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900 mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-semibold">Launch failed:</span> {errMsg}
          </div>
          {/* Cycle 175 — inline retry. Launch is idempotent (re-clicks
              skip already-launched rows) so a Retry doesn't risk
              duplicates. Faster than scrolling back up to the Launch
              button. */}
          <button
            type="button"
            onClick={() => launch.mutate()}
            disabled={launch.isPending}
            className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-60"
          >
            {launch.isPending ? "Retrying…" : "↻ Retry"}
          </button>
        </div>
      )}

      {lastResult && (lastResult.errors > 0) && (
        <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2.5 flex items-start gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-rose-900">
              {lastResult.launched > 0
                ? `Launch partial — ${lastResult.launched} succeeded, ${lastResult.errors} failed`
                : `Launch failed — ${lastResult.errors} error${lastResult.errors === 1 ? "" : "s"}`}
            </div>
            {(() => {
              const firstErr = lastResult.results.find((r) => r.status === "error")?.error;
              return firstErr ? (
                <div className="text-[11.5px] text-rose-800 mt-0.5 break-words">{firstErr}</div>
              ) : null;
            })()}
            <div className="text-[10.5px] text-rose-700/80 mt-1">
              No redirect — fix the issue and re-click <span className="font-mono">Launch</span> to retry only the failed variations.
            </div>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-slate-700 flex items-baseline justify-between gap-2 flex-wrap">
            <div>
              {/* Cycle 257 — clearer all-skipped state. */}
              {lastResult.launched === 0 && lastResult.errors === 0 && lastResult.results.length > 0 ? (
                <span className="font-semibold text-slate-600">
                  All {lastResult.results.length} variation{lastResult.results.length === 1 ? "" : "s"} skipped (already launched)
                </span>
              ) : (
                <>
                  <span className="font-semibold text-emerald-700">{lastResult.launched} launched</span>
                  {lastResult.errors > 0 && <span> · <span className="font-semibold text-rose-700">{lastResult.errors} errors</span></span>}
                </>
              )}
              <span className="text-slate-400"> · adset {lastResult.adset_id}</span>
              {typeof lastResult.total_ms === "number" && lastResult.total_ms > 0 && (
                <span className="text-slate-400 font-mono"> · {(lastResult.total_ms / 1000).toFixed(1)}s total</span>
              )}
              {/* Cycle 239 — paused-adset warning so operators don't
                  walk away thinking ads will deliver. */}
              {lastResult.adset_status_warning && (
                <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">
                  ⚠ {lastResult.adset_status_warning}
                </div>
              )}
            </div>
            {/* Cycle 219 — copy plain-text summary for ClickUp / Slack. */}
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50"
              title="Copy a plain-text launch summary"
              onClick={async () => {
                const lines: string[] = [];
                lines.push(`Meta launch · ${lastResult.launched} launched · ${lastResult.errors} errors · adset ${lastResult.adset_id}`);
                for (const r of lastResult.results) {
                  lines.push(`  #${r.position + 1} ${r.ad_name} → ${r.status}${r.meta_ad_id ? ` (${r.meta_ad_id})` : ""}${r.error ? ` — ${r.error}` : ""}${typeof r.elapsed_ms === "number" && r.elapsed_ms > 0 ? ` [${(r.elapsed_ms / 1000).toFixed(1)}s]` : ""}`);
                }
                try {
                  await navigator.clipboard.writeText(lines.join("\n"));
                } catch {
                  // ignore
                }
              }}
            >
              📋 Copy summary
            </button>
          </div>
          <ul className="space-y-1">
            {/* Cycle 218 — errors first so operator sees issues without
                scrolling past launched rows. Stable within each bucket
                (preserves position order). */}
            {[...lastResult.results].sort((a, b) => {
              const rank = (s: string) => (s === "error" ? 0 : s === "skipped" ? 2 : 1);
              return rank(a.status) - rank(b.status);
            }).map((r) => (
              <li
                key={r.variation_id}
                className={`text-[11px] flex items-baseline gap-2 px-2 py-1 rounded border ${
                  r.status === "launched"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : r.status === "skipped"
                    ? "bg-slate-50 border-slate-200 text-slate-600"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                <span className="font-mono w-6 shrink-0">#{r.position + 1}</span>
                <span className="font-semibold w-40 truncate shrink-0">{r.ad_name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider w-16 shrink-0">{r.status}</span>
                {typeof r.elapsed_ms === "number" && r.elapsed_ms > 0 && (
                  <span
                    className={`font-mono text-[10px] shrink-0 ${r.elapsed_ms > 15000 ? "text-amber-700" : "text-slate-400"}`}
                    title={`Wall-clock time for this variation's Frame.io ingest + Meta upload + creative + ad-create cycle.`}
                  >
                    {(r.elapsed_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {(() => {
                  // Cycle 189 — parse the [category] prefix from Cycle 188
                  // and render it as a colored pill before the raw message.
                  if (r.status !== "error" || !r.error) {
                    return <span className="min-w-0 truncate">{r.meta_ad_id ?? r.error ?? ""}</span>;
                  }
                  const m = r.error.match(/^\[([^\]]+)\]\s*(.*)$/);
                  const cat = m?.[1] ?? null;
                  const msg = m?.[2] ?? r.error;
                  const palette: Record<string, string> = {
                    "rate-limit": "bg-amber-100 text-amber-800 border-amber-200",
                    "policy": "bg-rose-100 text-rose-800 border-rose-200",
                    "token": "bg-violet-100 text-violet-800 border-violet-200",
                    "frame.io": "bg-sky-100 text-sky-800 border-sky-200",
                    "config": "bg-slate-100 text-slate-800 border-slate-200",
                    "network": "bg-orange-100 text-orange-800 border-orange-200",
                    "meta": "bg-rose-100 text-rose-700 border-rose-200",
                  };
                  return (
                    <>
                      {cat && (
                        <span
                          className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${palette[cat] ?? palette.meta}`}
                          title={
                            cat === "rate-limit" ? "Meta throttled us — wait a minute, then Retry."
                            : cat === "policy" ? "Meta's policy review rejected this ad. Replace the creative or rewrite the copy."
                            : cat === "token" ? "Auth issue — the System User token needs re-issuing in Business Manager."
                            : cat === "frame.io" ? "Frame.io asset issue — re-authorize Frame.io or replace the asset."
                            : cat === "config" ? "Pre-flight misconfig — usually a missing field or cross-account mismatch."
                            : cat === "network" ? "Network/transport issue — DNS, timeout, or socket hang up. Retry."
                            : "Generic Meta API error."
                          }
                        >
                          {cat}
                        </span>
                      )}
                      <span className="min-w-0 truncate">{msg}</span>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// AppLovin (Axon) real-launch card — SIBLING of MetaLaunchCard (Meta card is never modified).
// Mirrors its structure/visuals 1:1: confirm-gated launch, same results[] strip, error pills.
// Gated by AppLovin readiness reusing the key_status{configured, tested_ok} concept that
// PlatformStatusCard uses (sourced here from GET /api/launch-presets/applovin for the brand).
// The launch endpoint now ENQUEUES a background job (202) — so the old gateway-timeout
// compensation is gone; progress + the final result come from the launch-status poll below.
function ApplovinLaunchCard({ packageId, pkg }: { packageId: string; pkg: LaunchPackageDetail }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const toast = useToast();
  const handleMutationError = useLaunchPackageErrorHandler();
  const [lastEnableResult, setLastEnableResult] = useState<ApplovinEnableResult | null>(null);

  // The launch endpoint now ENQUEUES a background job (202) — poll the job status for live
  // progress + the final result instead of trusting the POST body. Poll only while active.
  // Scoped to platform 'applovin' so this card reflects ONLY the AppLovin launch (a package
  // can have a Meta job AND an AppLovin job active at once).
  const launchStatus = useQuery({
    queryKey: ["launch-status", packageId, "applovin"],
    queryFn: () => getLaunchStatus(packageId, "applovin"),
    refetchInterval: (q) => { const s = (q?.state?.data as any)?.status; return s === "queued" || s === "running" ? 2500 : false; },
  });
  const active = launchStatus.data?.status === "queued" || launchStatus.data?.status === "running";
  // Staleness guard — an active job whose row hasn't updated in >20s is likely a dead/redeploying
  // worker (see getLaunchStaleness). Poll keeps running; we just swap the confident spinner for a warning.
  const { isStale, ageMs } = getLaunchStaleness(launchStatus.data);
  const staleAgeSec = ageMs != null ? Math.round(ageMs / 1000) : null;
  // When the background job reaches a terminal state, refetch the package so per-row launched
  // state (applovin_creative_set_id) + the Enable button reflect the newly-created sets.
  useEffect(() => {
    const s = launchStatus.data?.status;
    if (s === "succeeded" || s === "partial" || s === "failed" || s === "canceled") {
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
      qc.invalidateQueries({ queryKey: ["launches"] });
    }
  }, [launchStatus.data?.status]);
  // Final per-variation result comes from the poll (same results[] shape as the old sync body).
  const st = launchStatus.data?.status;
  const showResult = st === "succeeded" || st === "partial" || st === "failed";
  const lastResult: ApplovinLaunchResult | null = showResult ? (launchStatus.data?.result ?? null) : null;

  // AppLovin readiness — mirrors PlatformStatusCard's key_status{configured, tested_ok}.
  // We read the per-brand AppLovin key config from the launch-presets endpoint and key off
  // the package's brand_id. Defensive: if the brand row isn't found, treat as not configured.
  const { data: applovinKeysData } = useQuery({
    queryKey: ["applovin-keys-all"],
    queryFn: () => api.get<{ ok?: boolean; brands?: any[] } | any[]>("/api/launch-presets/applovin"),
  });
  const keyStatus = useMemo(() => {
    const list: any[] = Array.isArray(applovinKeysData)
      ? applovinKeysData
      : (applovinKeysData?.brands ?? []);
    const row = pkg.brand_id ? list.find((b) => b?.brand_id === pkg.brand_id) : null;
    return {
      configured: !!(row && row.campaign_configured),
      tested_ok: row ? (row.last_tested_ok ?? null) : null,
    };
  }, [applovinKeysData, pkg.brand_id]);

  const launch = useMutation({
    mutationFn: () => launchApplovin(packageId),
    onSuccess: () => {
      // 202 { job_id, status } — not the final result. Kick the status poll + refresh the package.
      qc.invalidateQueries({ queryKey: ["launch-status", packageId, "applovin"] });
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
    },
    onError: handleMutationError,
  });

  // Enable → LIVE: flips this package's created (PAUSED) Axon creative set(s) to LIVE.
  // Separate action per spec — everything launches PAUSED first.
  const enable = useMutation({
    mutationFn: () => enableApplovin(packageId),
    onSuccess: (res) => {
      setLastEnableResult(res);
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
    },
    onError: handleMutationError,
  });

  // Ready when the brand's Axon campaign key is configured. (Whitelist/test-OK is surfaced
  // as a warning chip but does not hard-block — the backend runs a blocking /test pre-flight
  // and returns a graceful [whitelist] error if the brand isn't whitelisted.)
  const ready = keyStatus.configured;
  const missing: string[] = [];
  if (!pkg.brand_id) missing.push("Brand");
  if (!keyStatus.configured) missing.push("AppLovin campaign key (configure in brand keys)");

  // Enqueue error (the launch itself now runs in the background — see the launch-status poll).
  const errMsg = launch.error ? (launch.error as Error).message : null;
  const enableErrMsg = enable.error ? (enable.error as Error).message : null;
  const unlaunchedCount = pkg.variations.filter((v: any) => !v.applovin_creative_set_id).length;
  // Created (launched) creative sets and how many are still PAUSED (enable targets).
  const launchedSets = pkg.variations.filter((v: any) => v.applovin_creative_set_id);
  const pausableCount = launchedSets.filter((v: any) => v.applovin_status !== "LIVE").length;
  const hasLaunchedSets = launchedSets.length > 0;

  return (
    <div className="al-card mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500">
              <path d="M5 12l5 5L20 7" />
            </svg>
            Launch to AppLovin
            <span className="text-[10px] uppercase tracking-wider text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">Axon</span>
            {/* Readiness chip — same key_status concept as the Meta side / PlatformStatusCard. */}
            <span
              className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
                keyStatus.configured && keyStatus.tested_ok
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : keyStatus.configured
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
              title="AppLovin (Axon) key status for this package's brand"
            >
              {keyStatus.configured && keyStatus.tested_ok
                ? "ready · tested OK"
                : keyStatus.configured
                ? "key configured · not tested"
                : "key missing"}
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Creates each variation on Axon as a <span className="font-mono">PAUSED</span> campaign + creative set with a future start date — never spends on day one. Already-launched rows are skipped on re-click.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              if (unlaunchedCount === 0) return;
              const ok = await confirmAct({
                title: `Launch ${unlaunchedCount} ad${unlaunchedCount === 1 ? "" : "s"} to AppLovin?`,
                description: `Creates ${unlaunchedCount} PAUSED campaign/creative set${unlaunchedCount === 1 ? "" : "s"} on Axon. Review in the AXON dashboard before activating.`,
                confirmLabel: "Launch (paused)",
              });
              if (ok) launch.mutate();
            }}
            disabled={active || !ready || unlaunchedCount === 0}
            className="btn-primary text-xs disabled:opacity-50"
            title={ready ? "Launch only variations without an AppLovin creative set yet. Already-launched rows are skipped server-side." : `Missing: ${missing.join(" · ")}`}
          >
            {(() => {
              if (active) return "Launching in background…";
              const total = pkg.variations.length;
              const launched = pkg.variations.filter((v: any) => v.applovin_creative_set_id).length;
              const unlaunched = total - launched;
              if (total === 0) return "Launch to AppLovin (no variations)";
              if (unlaunched === 0) return `All ${total} launched ✓`;
              if (launched === 0) return `Launch ${total} to AppLovin (paused)`;
              return `Launch ${unlaunched} unlaunched (${launched} already live)`;
            })()}
          </button>
          {/* Enable → LIVE — separate action; flips the created PAUSED creative set(s) to LIVE. */}
          {hasLaunchedSets && (
            <button
              type="button"
              onClick={async () => {
                if (pausableCount === 0) return;
                const ok = await confirmAct({
                  title: `Enable ${pausableCount} creative set${pausableCount === 1 ? "" : "s"} → LIVE?`,
                  description: `Flips ${pausableCount} PAUSED Axon creative set${pausableCount === 1 ? "" : "s"} to LIVE. They will start delivering.`,
                  confirmLabel: "Enable → LIVE",
                });
                if (ok) enable.mutate();
              }}
              disabled={enable.isPending || pausableCount === 0}
              className="text-xs px-3 py-1.5 rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              title={pausableCount === 0 ? "All created creative sets are already LIVE" : "Flip the created (PAUSED) creative sets to LIVE"}
            >
              {enable.isPending
                ? "Enabling…"
                : pausableCount === 0
                ? "All LIVE ✓"
                : `Enable ${pausableCount} → LIVE`}
            </button>
          )}
        </div>
      </div>

      {enableErrMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900 mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-semibold">Enable failed:</span> {enableErrMsg}
          </div>
          <button
            type="button"
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
            className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-60"
          >
            {enable.isPending ? "Retrying…" : "↻ Retry"}
          </button>
        </div>
      )}

      {lastEnableResult && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-slate-700">
            <span className="font-semibold text-emerald-700">{lastEnableResult.enabled} enabled → LIVE</span>
            {lastEnableResult.errors > 0 && (
              <span> · <span className="font-semibold text-rose-700">{lastEnableResult.errors} errors</span></span>
            )}
          </div>
          <ul className="space-y-1">
            {lastEnableResult.results.map((r, idx) => (
              <li
                key={r.creative_set_id ?? r.variation_id ?? idx}
                className={`text-[11px] flex items-baseline gap-2 px-2 py-1 rounded border ${
                  r.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                <span className="font-semibold w-40 truncate shrink-0">{r.ad_name ?? r.creative_set_id ?? "creative set"}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider w-16 shrink-0">{r.ok ? (r.status ?? "LIVE") : "error"}</span>
                <span className="min-w-0 truncate">{r.ok ? (r.creative_set_id ?? "") : (r.error ?? "")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!ready && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Can't launch yet — missing: <span className="font-semibold">{missing.join(" · ")}</span>
        </div>
      )}

      {/* Stale/wedged job — the row hasn't updated in >20s, so the worker may have been
          redeployed / killed before its terminal write. Warn instead of a confident spinner;
          the poll keeps running (the job may still finish or be rescued by the lease reaper). */}
      {active && isStale && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2">
          <span className="shrink-0" aria-hidden="true">⚠</span>
          <div className="min-w-0">
            <span className="font-semibold">Status unknown — the launch worker may be redeploying.</span>{" "}
            Do NOT re-launch blindly; verify in Ads Manager / Axon first.
            <div className="text-amber-800 mt-0.5">
              {launchStatus.data?.current_step && (
                <span>last step: <span className="font-medium">{launchStatus.data.current_step}</span> · </span>
              )}
              last update {staleAgeSec ?? "?"}s ago · <span className="font-mono">{launchStatus.data?.completed ?? 0}/{launchStatus.data?.total ?? "?"}</span> done
            </div>
          </div>
        </div>
      )}

      {active && !isStale && (
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500 animate-spin shrink-0">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="font-semibold">Launching in background…</span>
          <span className="font-mono">
            {launchStatus.data?.completed ?? 0}/{launchStatus.data?.total ?? "?"} done
            {launchStatus.data?.failed ? ` · ${launchStatus.data.failed} failed` : ""}
          </span>
          {launchStatus.data?.current_step && (
            <span className="text-sky-700 truncate">· {launchStatus.data.current_step}</span>
          )}
        </div>
      )}

      {errMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900 mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-semibold">Launch failed:</span> {errMsg}
          </div>
          {/* Retry re-fires the launch mutation; the backend coalesces to the running job. */}
          <button
            type="button"
            onClick={() => launch.mutate()}
            disabled={launch.isPending}
            className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-60"
          >
            {launch.isPending ? "Retrying…" : "↻ Retry"}
          </button>
        </div>
      )}

      {lastResult && lastResult.errors > 0 && (() => {
        // launched > 0 = partial SUCCESS — most ads are safely PAUSED, so frame it as success
        // with the few that need attention called out (amber), not a red "failed" alarm.
        const partial = lastResult.launched > 0;
        const firstErr = lastResult.results.find((r) => r.status === "error")?.error;
        return (
          <div className={`mt-3 rounded-md border px-3 py-2.5 flex items-start gap-2.5 ${partial ? "border-amber-300 bg-amber-50" : "border-rose-300 bg-rose-50"}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-0.5 ${partial ? "text-amber-600" : "text-rose-600"}`}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className={`text-[12.5px] font-semibold ${partial ? "text-amber-900" : "text-rose-900"}`}>
                {partial
                  ? `${lastResult.launched} launched (PAUSED) · ${lastResult.errors} need${lastResult.errors === 1 ? "s" : ""} attention`
                  : `Launch failed — ${lastResult.errors} error${lastResult.errors === 1 ? "" : "s"}`}
              </div>
              {firstErr && (
                <div className={`text-[11.5px] mt-0.5 break-words ${partial ? "text-amber-800" : "text-rose-800"}`}>{firstErr}</div>
              )}
              <div className={`text-[10.5px] mt-1 ${partial ? "text-amber-700/80" : "text-rose-700/80"}`}>
                {partial ? (
                  <>The launched set{lastResult.launched === 1 ? " is" : "s are"} safe (PAUSED) — review below or in the Axon dashboard. Fix the flagged row{lastResult.errors === 1 ? "" : "s"} and re-click <span className="font-mono">Launch</span> to retry only those.</>
                ) : (
                  <>Nothing launched. Fix the issue and re-click <span className="font-mono">Launch</span> to retry.</>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {lastResult && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-slate-700 flex items-baseline justify-between gap-2 flex-wrap">
            <div>
              {lastResult.launched === 0 && lastResult.errors === 0 && lastResult.results.length > 0 ? (
                <span className="font-semibold text-slate-600">
                  All {lastResult.results.length} variation{lastResult.results.length === 1 ? "" : "s"} skipped (already launched)
                </span>
              ) : (
                <>
                  <span className="font-semibold text-emerald-700">{lastResult.launched} launched</span>
                  {lastResult.errors > 0 && <span> · <span className="font-semibold text-rose-700">{lastResult.errors} errors</span></span>}
                </>
              )}
              {lastResult.account_id && <span className="text-slate-400"> · account {lastResult.account_id}</span>}
              {typeof lastResult.total_ms === "number" && lastResult.total_ms > 0 && (
                <span className="text-slate-400 font-mono"> · {(lastResult.total_ms / 1000).toFixed(1)}s total</span>
              )}
            </div>
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50"
              title="Copy a plain-text launch summary"
              onClick={async () => {
                const lines: string[] = [];
                lines.push(`AppLovin launch · ${lastResult.launched} launched · ${lastResult.errors} errors${lastResult.account_id ? ` · account ${lastResult.account_id}` : ""}`);
                for (const r of lastResult.results) {
                  const okId = r.applovin_creative_set_id ?? r.applovin_asset_id;
                  lines.push(`  #${r.position + 1} ${r.ad_name} → ${r.status}${okId ? ` (${okId})` : ""}${r.error ? ` — ${r.error}` : ""}${typeof r.elapsed_ms === "number" && r.elapsed_ms > 0 ? ` [${(r.elapsed_ms / 1000).toFixed(1)}s]` : ""}`);
                }
                try {
                  await navigator.clipboard.writeText(lines.join("\n"));
                } catch {
                  // ignore
                }
              }}
            >
              📋 Copy summary
            </button>
          </div>
          <ul className="space-y-1">
            {[...lastResult.results].sort((a, b) => {
              const rank = (s: string) => (s === "error" ? 0 : s === "skipped" ? 2 : 1);
              return rank(a.status) - rank(b.status);
            }).map((r) => (
              <li
                key={r.variation_id}
                className={`text-[11px] flex items-baseline gap-2 px-2 py-1 rounded border ${
                  r.status === "launched"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : r.status === "skipped"
                    ? "bg-slate-50 border-slate-200 text-slate-600"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                <span className="font-mono w-6 shrink-0">#{r.position + 1}</span>
                <span className="font-semibold w-40 truncate shrink-0">{r.ad_name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider w-16 shrink-0">{r.status}</span>
                {typeof r.elapsed_ms === "number" && r.elapsed_ms > 0 && (
                  <span
                    className={`font-mono text-[10px] shrink-0 ${r.elapsed_ms > 15000 ? "text-amber-700" : "text-slate-400"}`}
                    title="Wall-clock time for this variation's Axon asset upload + campaign + creative-set cycle."
                  >
                    {(r.elapsed_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {(() => {
                  // Parse the [category] prefix and render it as a colored pill (mirrors the Meta
                  // card). AppLovin adds [whitelist] and [axon] categories.
                  const okId = r.applovin_creative_set_id ?? r.applovin_asset_id;
                  if (r.status !== "error" || !r.error) {
                    return <span className="min-w-0 truncate">{okId ?? r.error ?? ""}</span>;
                  }
                  const m = r.error.match(/^\[([^\]]+)\]\s*(.*)$/);
                  const cat = m?.[1] ?? null;
                  const msg = m?.[2] ?? r.error;
                  const palette: Record<string, string> = {
                    "whitelist": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
                    "rate-limit": "bg-amber-100 text-amber-800 border-amber-200",
                    "policy": "bg-rose-100 text-rose-800 border-rose-200",
                    "token": "bg-violet-100 text-violet-800 border-violet-200",
                    "frameio": "bg-sky-100 text-sky-800 border-sky-200",
                    "config": "bg-slate-100 text-slate-800 border-slate-200",
                    "network": "bg-orange-100 text-orange-800 border-orange-200",
                    "axon": "bg-rose-100 text-rose-700 border-rose-200",
                  };
                  return (
                    <>
                      {cat && (
                        <span
                          className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${palette[cat] ?? palette.axon}`}
                          title={
                            cat === "whitelist" ? "This brand isn't whitelisted for the Axon Campaign Mgmt API beta yet. Request whitelisting."
                            : cat === "rate-limit" ? "Axon throttled us — wait a minute, then Retry."
                            : cat === "policy" ? "Axon policy review rejected this creative. Replace it or rewrite the copy."
                            : cat === "token" ? "Auth issue — the brand's Axon campaign key is invalid or expired."
                            : cat === "frameio" ? "Frame.io asset issue — re-authorize Frame.io or replace the asset."
                            : cat === "config" ? "Pre-flight misconfig — usually a missing field (e.g. website URL or image)."
                            : cat === "network" ? "Network/transport issue — DNS, timeout, or socket hang up. Retry."
                            : "Generic Axon API error."
                          }
                        >
                          {cat}
                        </span>
                      )}
                      <span className="min-w-0 truncate">{msg}</span>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlatformStatusCard({ packageId, pkg, variationCount }: { packageId: string; pkg: LaunchPackageDetail; variationCount: number }) {
  const qc = useQueryClient();
  // Cycle 185 — multi-tab 404 grace inherited.
  const handleMutationError = useLaunchPackageErrorHandler();
  const [preview, setPreview] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (input: { platform: Platform; status: PlatformStatus; launched_count?: number; rejected_count?: number }) =>
      api.put<{ ok: boolean; would_post_to_clickup: string }>(`/api/launches/${packageId}/platform-status`, input),
    onSuccess: (res) => {
      setPreview(res.would_post_to_clickup);
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
      qc.invalidateQueries({ queryKey: ["launches"] });
    },
    onError: handleMutationError,
  });

  // Cycle 312 — one-click "mark Applovin launched" mirror of the Meta
  // mark-launched path. Operator launches in AXON dashboard, hits this
  // to keep the local status in sync. No automatic AXON API call yet.
  const markApplovin = useMutation({
    mutationFn: () => api.post<{ ok: boolean; applovin_upload_status: string; note: string; key_status: { configured: boolean; tested_ok: boolean | null } }>(`/api/launches/${packageId}/mark-applovin-launched`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["launches", packageId] });
      qc.invalidateQueries({ queryKey: ["launches"] });
    },
    onError: handleMutationError,
  });

  function setStatus(platform: Platform, status: PlatformStatus) {
    const total = variationCount;
    if (status === "ACTIVE") {
      update.mutate({ platform, status, launched_count: total, rejected_count: 0 });
    } else if (status === "WITH_ISSUES") {
      update.mutate({ platform, status, launched_count: 0, rejected_count: total });
    } else {
      update.mutate({ platform, status, launched_count: 0, rejected_count: 0 });
    }
  }

  return (
    <div className="al-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Upload Status · per platform
        </h3>
        <span className="text-[10px] text-amber-700 italic">
          Theoretical sync · no live ClickUp / DB writes
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlatformPicker
          label="Meta"
          status={normalizePlatformStatus(pkg.meta_upload_status)}
          launchedAt={pkg.meta_launched_at as string | null}
          onChange={(s) => setStatus("meta", s)}
        />
        <div>
          <PlatformPicker
            label="Applovin"
            status={normalizePlatformStatus(pkg.applovin_upload_status)}
            launchedAt={pkg.applovin_launched_at as string | null}
            onChange={(s) => setStatus("applovin", s)}
          />
          {/* Cycle 312 — mark-launched button for the AppLovin side.
              Mirrors Meta's mark-launched flow: operator runs the launch
              in AXON dashboard, hits this to update local state. */}
          {normalizePlatformStatus(pkg.applovin_upload_status) !== "ACTIVE" && (
            <button
              type="button"
              disabled={markApplovin.isPending}
              onClick={() => {
                if (window.confirm("Mark this package as launched on AppLovin? Use this after submitting the campaign in the AXON dashboard.")) {
                  markApplovin.mutate();
                }
              }}
              className="mt-2 w-full text-[11px] font-semibold px-2 py-1.5 rounded border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              {markApplovin.isPending
                ? "Marking…"
                : markApplovin.data
                  ? `✓ ${markApplovin.data.note}`
                  : "Mark launched on AppLovin →"}
            </button>
          )}
        </div>
      </div>
      {preview && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">
            Would auto-comment in ClickUp
          </div>
          <div className="text-xs font-mono text-slate-700 whitespace-pre-wrap">{preview}</div>
        </div>
      )}
    </div>
  );
}

function PlatformPicker({
  label,
  status,
  launchedAt,
}: {
  label: string;
  status: PlatformStatus | null;
  launchedAt: string | null;
  onChange?: (s: PlatformStatus) => void; // accepted for backwards-compat, never invoked
}) {
  // Status is ALWAYS a fact — derived from the actual upload outcome on Meta /
  // Applovin. No clickable controls. This card is display-only.
  const tone =
    status === "ACTIVE"
      ? { wrap: "border-emerald-200 bg-emerald-50/50", pill: "bg-emerald-500 text-white", icon: "polyline" }
      : status === "WITH_ISSUES"
      ? { wrap: "border-red-200 bg-red-50/50", pill: "bg-red-500 text-white", icon: "x" }
      : status === "PAUSED"
      ? { wrap: "border-slate-200 bg-white", pill: "bg-slate-100 text-slate-700 border border-slate-200", icon: "dot" }
      : { wrap: "border-slate-200 bg-white", pill: "bg-slate-50 text-slate-400 border border-slate-100", icon: "dot" };
  return (
    <div className={`rounded-lg border p-3 ${tone.wrap}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-[10px] text-slate-400 font-mono">
          {launchedAt ? `launched ${fmtDateChip(launchedAt)}` : "—"}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold ${tone.pill}`}>
          {tone.icon === "polyline" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : tone.icon === "x" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <span className="w-2 h-2 rounded-full bg-current opacity-60" />
          )}
          {status ?? "Not launched"}
        </span>
        <span className="text-[10px] text-slate-500 italic">Read-only · reflects the actual upload outcome.</span>
      </div>
    </div>
  );
}

// ============================================================================
// GroupedLaunchList — merges Meta + Applovin entries by ad_id into a single
// "batch" row. Each batch shows a unified status pill per platform, total
// rejected counts across both platforms, a ClickUp task link when present,
// and a "+ N batches" chip when more than one launch_package shares the ad_id.
// Launches without an ad_id stay as their own ungrouped rows.
// ============================================================================

type Batch = {
  key: string;
  ad_id: string | null;
  packages: LaunchPackage[];
  display: LaunchPackage; // representative — most recent in the group
  total_variations: number;
  total_rejected: number;
  // Cycle 296 — variations actually launched (rolled up across batch).
  total_launched: number;
  // Cycle 152 — count of variations bound to a library row whose status
  // is currently Rejected/Disapproved/Policy Violation. Rolled up across
  // every package in the batch.
  total_lib_rejected: number;
  meta_status: PlatformStatus | null;
  applovin_status: PlatformStatus | null;
  meta_launched_at: string | null;
  applovin_launched_at: string | null;
  clickup_task_url: string | null;
  oldest_at: string;
};

function rankStatus(s: "ACTIVE" | "WITH_ISSUES" | "PAUSED" | null | undefined): number {
  // Higher rank = "more committed" — Live trumps Rejected trumps Pending.
  if (s === "ACTIVE") return 3;
  if (s === "WITH_ISSUES") return 2;
  if (s === "PAUSED") return 1;
  return 0;
}

function GroupedLaunchList({ launches, anyFilterActive, showTrash, activeJobIds }: { launches: LaunchPackage[]; anyFilterActive: boolean; showTrash?: boolean; activeJobIds?: Set<string> }) {
  // Tracks which merged-batch rows are expanded to show child packages.
  // Keyed by Batch.key. Default = collapsed; operator clicks "+N more
  // batches" to drill in without leaving the Log.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Cycle 365 — row click opens a modal with per-ad detail + Meta
  // preview (operator's redesign brief). Deep-link to /log/<id> is still
  // available via the "Open full page" chip inside the modal.
  const [modalPkgId, setModalPkgId] = useState<string | null>(null);
  // Cycle 437 — keyboard navigation. J / K move the focused index up/
  // down through the visible packages; Enter opens the modal for the
  // focused row. Skipped while typing in an input/textarea/contenteditable
  // so the search box still works. -1 = nothing focused.
  const [focusIdx, setFocusIdx] = useState(-1);
  // Cycle 369 — bulk-select for bulk operations (delete first; retry
  // failed-only later). Selected package ids; cleared on filter change
  // by virtue of the launches prop changing identity.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const qcLocal = useQueryClient();
  const toastLocal = useToast();
  const confirmActLocal = useConfirm();
  function toggleSelected(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ ok: boolean; deleted: number }>("/api/launches/bulk-delete", { ids }),
    onSuccess: (r) => {
      qcLocal.invalidateQueries({ queryKey: ["launches"] });
      qcLocal.invalidateQueries({ queryKey: ["launch-status-counts"] });
      setSelectedIds(new Set());
      toastLocal("success", `Deleted ${r.deleted} package${r.deleted === 1 ? "" : "s"}.`);
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Bulk delete failed."),
  });
  // Cycle 419 — restore N from trash in one click.
  const bulkRestore = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ ok: boolean; restored: number }>("/api/launches/bulk-restore", { ids }),
    onSuccess: (r) => {
      qcLocal.invalidateQueries({ queryKey: ["launches"] });
      qcLocal.invalidateQueries({ queryKey: ["launch-status-counts"] });
      setSelectedIds(new Set());
      toastLocal("success", `Restored ${r.restored} package${r.restored === 1 ? "" : "s"}.`);
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Bulk restore failed."),
  });
  // Cycle 469 — bulk-tag (merge mode). Prompt for comma-separated tags.
  const bulkTag = useMutation({
    mutationFn: ({ ids, tags }: { ids: string[]; tags: string[] }) =>
      api.post<{ ok: boolean; updated: number }>("/api/launches/bulk-tag", { ids, tags, mode: "add" }),
    onSuccess: (r) => {
      qcLocal.invalidateQueries({ queryKey: ["launches"] });
      qcLocal.invalidateQueries({ queryKey: ["launch-tags"] });
      toastLocal("success", `Tagged ${r.updated} package${r.updated === 1 ? "" : "s"}.`);
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Bulk tag failed."),
  });
  // Cycle 435 — bulk-archive (less destructive than delete).
  const bulkArchive = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ ok: boolean; archived: number }>("/api/launches/bulk-archive", { ids }),
    onSuccess: (r) => {
      qcLocal.invalidateQueries({ queryKey: ["launches"] });
      qcLocal.invalidateQueries({ queryKey: ["launch-status-counts"] });
      setSelectedIds(new Set());
      toastLocal("success", `Archived ${r.archived} package${r.archived === 1 ? "" : "s"}.`);
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Bulk archive failed."),
  });
  // Cycle 396 — restore a soft-deleted package from the trash view.
  const restore = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean }>(`/api/launches/${id}/restore`, {}),
    onSuccess: () => {
      qcLocal.invalidateQueries({ queryKey: ["launches"] });
      qcLocal.invalidateQueries({ queryKey: ["launch-status-counts"] });
      toastLocal("success", "Restored from trash.");
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Restore failed."),
  });
  function toggleExpanded(key: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  const batches = useMemo<Batch[]>(() => {
    // Group by ad_id. Null/empty ad_id → unique-key per package so each stays a separate row.
    const byKey = new Map<string, LaunchPackage[]>();
    for (const l of launches) {
      const key = l.ad_id?.trim() ? `ad:${l.ad_id.trim()}` : `pkg:${l.id}`;
      const arr = byKey.get(key) ?? [];
      arr.push(l);
      byKey.set(key, arr);
    }
    const out: Batch[] = [];
    for (const [key, pkgs] of byKey) {
      // Sort newest first so display is the most-recent package.
      pkgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const display = pkgs[0];
      const ad_id = display.ad_id ?? null;
      const total_variations = pkgs.reduce((s, p) => s + (p.variation_count ?? 0), 0);
      const total_rejected = pkgs.reduce((s, p) => s + (p.rejected_count ?? 0), 0);
      const total_launched = pkgs.reduce((s, p) => s + (p.launched_count ?? 0), 0);
      // Cycle 152 — sum library-side rejections across the batch's packages.
      const total_lib_rejected = pkgs.reduce((s, p) => s + (p.lib_rejected_count ?? 0), 0);
      // Best status across the group per platform.
      const meta_status = pkgs.reduce<Batch["meta_status"]>(
        (best, p) => (rankStatus(p?.display?.meta_campaign_effective_status) > rankStatus(best) ? (p?.display?.meta_campaign_effective_status ?? null) : best),
        null,
      );
      const applovin_status = pkgs.reduce<Batch["applovin_status"]>(
        (best, p) => {
          const s = normalizePlatformStatus(p.applovin_upload_status);
          return rankStatus(s) > rankStatus(best) ? s : best;
        },
        null,
      );
      const meta_launched_at = pkgs.reduce<string | null>((m, p) => {
        if (!p.meta_launched_at) return m;
        if (!m) return p.meta_launched_at;
        return new Date(p.meta_launched_at) > new Date(m) ? p.meta_launched_at : m;
      }, null);
      const applovin_launched_at = pkgs.reduce<string | null>((m, p) => {
        if (!p.applovin_launched_at) return m;
        if (!m) return p.applovin_launched_at;
        return new Date(p.applovin_launched_at) > new Date(m) ? p.applovin_launched_at : m;
      }, null);
      const clickup_task_url = pkgs.find((p) => p.clickup_task_url)?.clickup_task_url ?? null;
      const oldest_at = pkgs.reduce<string>((acc, p) => (new Date(p.created_at) < new Date(acc) ? p.created_at : acc), display.created_at);
      out.push({
        key,
        ad_id,
        packages: pkgs,
        display,
        total_variations,
        total_rejected,
        total_launched,
        total_lib_rejected,
        meta_status,
        applovin_status,
        meta_launched_at,
        applovin_launched_at,
        clickup_task_url,
        oldest_at,
      });
    }
    // Sort batches by newest-display
    out.sort((a, b) => new Date(b.display.created_at).getTime() - new Date(a.display.created_at).getTime());
    return out;
  }, [launches]);

  // Cycle 437 — global J/K/Enter shortcuts. Skipped while typing in
  // an input/textarea/contenteditable. Hooks below MUST live before
  // the empty-state early return so hook order stays stable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      if (modalPkgId) return; // let the modal own keys when open
      if (batches.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min((i < 0 ? -1 : i) + 1, batches.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
      } else if (e.key === "Enter") {
        if (focusIdx >= 0 && focusIdx < batches.length) {
          e.preventDefault();
          setModalPkgId(batches[focusIdx].display.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [batches, modalPkgId, focusIdx]);

  // Cycle 369 — flatten the batches into the package ids the operator
  // can act on in bulk. Merged batches contribute every child package.
  // MUST live BEFORE the empty-state early return so hook order stays
  // stable across "0 launches" → "N launches" transitions (Cycle 396 fix).
  const allPkgIds = useMemo(
    () => batches.flatMap((b) => b.packages.map((p) => p.id)),
    [batches],
  );
  const allSelected = allPkgIds.length > 0 && allPkgIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  if (launches.length === 0) {
    return (
      <div className="al-card">
        <div className="text-sm text-slate-500 py-10 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <div className="font-medium text-slate-700">
            {anyFilterActive ? "No launches match these filters." : "No launches saved yet."}
          </div>
          {/* Cycle 144 — give the operator a concrete next step instead of
              a dead-end. Either ask them to relax filters, or hand them
              the /launch link if they genuinely have no launches yet. */}
          {anyFilterActive ? (
            <p className="text-xs text-slate-500">Try clearing filters or widening the date window.</p>
          ) : (
            <Link to="/ads-launcher/launch" className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100">
              Launch your first package →
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="al-card divide-y">
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-2 px-5 py-2 bg-brand-50 border-b border-brand-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-brand-900 font-medium">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={(e) => {
                setSelectedIds(e.target.checked ? new Set(allPkgIds) : new Set());
              }}
              aria-label={allSelected ? "Deselect all" : "Select all"}
              title={allSelected ? "Deselect all" : "Select all in current view"}
            />
            <span>{selectedIds.size} selected</span>
            <button
              type="button"
              className="text-brand-700 hover:underline ml-2"
              onClick={() => setSelectedIds(new Set())}
            >
              clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Cycle 419 — Restore button visible only when viewing
                trash (operator chose Show Trash). Restores the
                selected soft-deleted rows. */}
            {showTrash && (
              <button
                type="button"
                className="text-xs font-semibold px-2 py-1 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                disabled={bulkRestore.isPending}
                onClick={() => bulkRestore.mutate(Array.from(selectedIds))}
              >
                {bulkRestore.isPending ? "Restoring…" : `↺ Restore ${selectedIds.size}`}
              </button>
            )}
            {/* Cycle 469 — bulk-tag. Prompts for comma-separated tags
                merged into each selected package's existing tag list. */}
            <button
              type="button"
              className="text-xs font-semibold px-2 py-1 rounded border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              disabled={bulkTag.isPending}
              onClick={() => {
                const ids = Array.from(selectedIds);
                const raw = window.prompt(`Add tags to ${ids.length} package${ids.length === 1 ? "" : "s"} (comma-separated):`, "");
                if (!raw) return;
                const tags = Array.from(new Set(raw.split(",").map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 32))).slice(0, 20);
                if (tags.length === 0) return;
                bulkTag.mutate({ ids, tags });
              }}
            >
              {bulkTag.isPending ? "Tagging…" : `🏷  Tag ${selectedIds.size}`}
            </button>
            {/* Cycle 435 — bulk-archive: hides without deletion. */}
            <button
              type="button"
              className="text-xs font-semibold px-2 py-1 rounded border border-amber-200 bg-white text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              disabled={bulkArchive.isPending}
              title="Archive selected packages — hidden from default Log; surfaces under 'Include archived'. Non-destructive."
              onClick={async () => {
                const ids = Array.from(selectedIds);
                if (await confirmActLocal({
                  title: `Archive ${ids.length} package${ids.length === 1 ? "" : "s"}?`,
                  description: "Hides from the default Log; toggle 'Include archived' to bring them back. Non-destructive.",
                  tone: "default",
                  confirmLabel: `Archive ${ids.length}`,
                })) {
                  bulkArchive.mutate(ids);
                }
              }}
            >
              {bulkArchive.isPending ? "Archiving…" : `📦 Archive ${selectedIds.size}`}
            </button>
            <button
              type="button"
              className="text-xs font-semibold px-2 py-1 rounded border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={bulkDelete.isPending}
              onClick={async () => {
                const ids = Array.from(selectedIds);
                // Cycle 387 — typed-confirmation when >10 packages
                // selected. Browser prompt() blocks the click until the
                // operator types the exact count; small enough delta
                // for the common 2-3 row delete to stay fast, while
                // 50-row bulk-delete now requires intent. Cycle 390
                // backs the soft-delete trash so recovery is still
                // possible within 30 days.
                if (ids.length > 10) {
                  const expected = String(ids.length);
                  const typed = window.prompt(
                    `You're about to soft-delete ${ids.length} launch packages. Type the exact number (${expected}) to confirm. They'll move to the trash and auto-purge in 30 days.`,
                    "",
                  );
                  if (typed !== expected) return;
                  bulkDelete.mutate(ids);
                  return;
                }
                if (await confirmActLocal({
                  title: `Delete ${ids.length} launch package${ids.length === 1 ? "" : "s"}?`,
                  description: "Moves to trash; auto-purges in 30 days. Audit log retains the deletion entry.",
                  tone: "danger",
                  confirmLabel: `Delete ${ids.length}`,
                })) {
                  bulkDelete.mutate(ids);
                }
              }}
            >
              {bulkDelete.isPending ? "Deleting…" : `Delete ${selectedIds.size}`}
            </button>
          </div>
        </div>
      )}
      {batches.map((b, batchIdx) => {
        const edge =
          b.meta_status === "ACTIVE" || b.applovin_status === "ACTIVE"
            ? "before:bg-emerald-400"
            : b.meta_status === "WITH_ISSUES" && b.applovin_status === "WITH_ISSUES"
            ? "before:bg-red-400"
            : b.meta_status === "WITH_ISSUES" || b.applovin_status === "WITH_ISSUES"
            ? "before:bg-amber-400"
            : "before:bg-transparent";
        const isMerged = b.packages.length > 1;
        const isRowSelected = selectedIds.has(b.display.id);
        const isKbFocused = focusIdx === batchIdx;
        return (
          <div
            key={b.key}
            className={`relative py-3 -mx-5 px-5 transition-colors hover:bg-slate-50 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full ${edge} ${isRowSelected ? "bg-brand-50/30" : ""} ${isKbFocused ? "ring-1 ring-brand-400 bg-brand-50/40" : ""}`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalPkgId(b.display.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setModalPkgId(b.display.id);
                }
              }}
              className="flex items-start justify-between gap-3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
            >
              <div className="min-w-0 flex-1 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-2 shrink-0"
                  checked={isRowSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelected(b.display.id)}
                  aria-label={isRowSelected ? "Deselect package" : "Select package"}
                />
                <AssetGlyph type={b.display.asset_type} />
                <div className="min-w-0 flex-1">
                  {/* Cycle 335 — bold/large the high-importance row: Ad ID
                      (prominent brand pill), uploader (CS), big status. */}
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    {b.ad_id && (
                      <span className="text-sm font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-500 text-white shrink-0">
                        {b.ad_id}
                      </span>
                    )}
                    {/* CS / uploader chip — operator wants this surfaced
                        with weight, not buried in the subtitle. */}
                    {b.display.created_by && (
                      <span
                        className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider"
                        title={`Uploaded by ${b.display.created_by}`}
                      >
                        CS · {b.display.created_by.split("@")[0]}
                      </span>
                    )}
                    {/* Big status badge — operator's eye should hit this fast. */}
                    <StatusBadge status={b?.display?.meta_campaign_effective_status} />
                    {/* Live "launching" badge — a background launch job is running for a package in this batch. */}
                    {activeJobIds && b.packages.some((p) => activeJobIds.has(p.id)) && (
                      <span
                        className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-sky-50 text-sky-700 border-sky-200 inline-flex items-center gap-1 shrink-0"
                        title="A launch is running in the background for this package"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        Launching
                      </span>
                    )}
                    {isMerged && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpanded(b.key); }}
                        className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 shrink-0 hover:bg-violet-100 inline-flex items-center gap-1"
                        title={`${b.packages.length} launch batches share this Ad ID — click to ${expanded.has(b.key) ? "collapse" : "expand"}.`}
                      >
                        <span>{expanded.has(b.key) ? "▾" : "▸"}</span>
                        {b.packages.length} batches
                      </button>
                    )}
                  </div>
                  {/* Package name + brand/product — secondary, slate-700 */}
                  <div className="text-sm text-slate-800 truncate font-medium mt-0.5">
                    {b.display.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {[
                      b.display.brand_name,
                      b.display.product_name,
                      b.display.funnel,
                      fmtDateTime(b.display.created_at),
                      b.total_variations === 0 ? "empty draft" : `${b.total_variations} ad${b.total_variations === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                   
                    <PlatformPill
                      label="META"
                      status={b?.display?.meta_campaign_effective_status}
                      launchedAt={b?.meta_launched_at}
                    />
                    <PlatformPill
                      label="APPLOVIN"
                      status={b.applovin_status}
                      launchedAt={b.applovin_launched_at}
                    />
                    {/* Cycle 296 — "M of N launched" chip. Hidden until the
                        batch has been touched by a launch (any variation
                        launched or rejected) so brand-new drafts stay clean. */}
                    {(b.total_launched > 0 || b.total_rejected > 0) && b.total_variations > 0 && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          b.total_launched === b.total_variations
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                        title={`${b.total_launched} of ${b.total_variations} variation${b.total_variations === 1 ? "" : "s"} successfully launched${b.total_rejected ? ` · ${b.total_rejected} ${b?.display?.meta_campaign_effective_status ?? "—"}` : ""}`}
                      >
                        {b.total_launched}/{b.total_variations} {b?.display?.meta_campaign_effective_status ?? "—"}
                      </span>
                    )}
                    {b.total_rejected > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
                        {b.total_rejected} {b?.display?.meta_campaign_effective_status ?? "—"}
                      </span>
                    )}
                    {/* Cycle 152 — library-side rejection: a variation's
                        admanage_library row currently shows a policy
                        failure. Operator may not have updated the
                        package status yet, but the asset is dead in
                        Meta. Visually distinct from the operator-set
                        rejection chip above. */}
                    {b.total_lib_rejected > 0 && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1"
                        title={`${b.total_lib_rejected} variation${b.total_lib_rejected === 1 ? "" : "s"} bound to a library row currently showing Rejected / Disapproved / Policy Violation in Meta. Open the launch to confirm.`}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4M12 16h.01" />
                        </svg>
                        {b.total_lib_rejected} lib-rejected
                      </span>
                    )}
                    {b.clickup_task_url && (
                      <a
                        href={b.clickup_task_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-medium text-sky-700 hover:underline px-1.5 py-0.5 rounded border border-sky-100 bg-sky-50 inline-flex items-center gap-1"
                      >
                        ClickUp ↗
                      </a>
                    )}
                    {/* Cycle 462 — tag chips on the row itself so
                        operators can spot tagged launches at a glance
                        without clicking into the modal. Cap at 3
                        visible; rest collapses to "+N".
                        Cycle 490 — hovering any chip (or the +N overflow)
                        surfaces ALL tags in the tooltip so operators
                        don't need to click into the modal just to see
                        what's tagged. */}
                    {Array.isArray(b.display.tags) && b.display.tags.length > 0 && (() => {
                      const allTags = b.display.tags as string[];
                      const allTagsLabel = `Tags: ${allTags.join(", ")}`;
                      const hidden = allTags.slice(3);
                      return (
                        <>
                          {allTags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-violet-100 bg-violet-50 text-violet-700"
                              title={allTags.length > 1 ? allTagsLabel : `Tag: ${t}`}
                            >
                              {t}
                            </span>
                          ))}
                          {hidden.length > 0 && (
                            <span
                              className="text-[10px] text-slate-400 px-1 cursor-help"
                              title={`+${hidden.length} more: ${hidden.join(", ")}\n\n${allTagsLabel}`}
                            >
                              +{hidden.length}
                            </span>
                          )}
                        </>
                      );
                    })()}
                    {/* Cycle 318 — schedule chip. Visible when scheduled_for
                        is set. Sky when still-pending, slate when fired. */}
                    {b.display.scheduled_for && !b.display.scheduled_fired_at && (() => {
                      const due = new Date(b.display.scheduled_for).getTime();
                      const overdue = due < Date.now();
                      return (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                            overdue
                              ? "bg-amber-50 text-amber-900 border-amber-300"
                              : "bg-sky-50 text-sky-800 border-sky-200"
                          }`}
                          title={`Scheduled to fire at ${new Date(b.display.scheduled_for).toLocaleString()}. ${overdue ? "Due in the past — should fire on next worker tick." : ""}`}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          {overdue ? "due now" : "scheduled"}
                        </span>
                      );
                    })()}
                    {/* Cycle 396 — trash chip + restore button when
                        viewing soft-deleted rows. The whole row stays
                        clickable for the modal preview; the restore
                        button stopPropagation-s. */}
                    {b.display.deleted_at && (
                      <>
                        <span
                          className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                          title={`Soft-deleted ${new Date(b.display.deleted_at).toLocaleString()} — purges 30 days after this date`}
                        >
                          trashed
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); restore.mutate(b.display.id); }}
                          disabled={restore.isPending}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                          title="Restore from trash"
                        >
                          ↺ Restore
                        </button>
                      </>
                    )}
                    {/* Cycle 295 / 373 — Ads Manager deep-link visible
                        for ANY package with a known external account id,
                        not just launched ones. Operators want this for
                        research + comparison flows too (e.g. inspecting
                        the parent account before launching). */}
                    {b.display.meta_external_account_id && (
                      <a
                        href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${b.display.meta_external_account_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-medium text-indigo-700 hover:underline px-1.5 py-0.5 rounded border border-indigo-100 bg-indigo-50 inline-flex items-center gap-1"
                        title={`Open ad account act_${b.display.meta_external_account_id} in Meta Ads Manager`}
                      >
                        Ads Manager ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {/* Cycle 335 — status badge moved into the bold header row
                  above next to CS/AdID. This right-side slot stays for
                  layout balance (the click target wants flex children). */}
              <div className="shrink-0 ml-3" />
            </div>
            {/* Child packages of a merged batch — visible only when the
                operator clicked "▸ N batches" above. Each child is its own
                navigable Link to /log/<id>. */}
            {isMerged && expanded.has(b.key) && (
              <div className="mt-2 ml-12 border-l-2 border-violet-200 pl-3 space-y-1.5">
                {b.packages.map((p) => (
                  <Link
                    key={p.id}
                    to={`/ads-launcher/log/${p.id}`}
                    className="flex items-center justify-between gap-2 text-xs text-slate-700 hover:bg-violet-50 px-2 py-1 rounded"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-500">
                        {" · "}{fmtDateTime(p.created_at)}
                        {" · "}{p.variation_count} ad{p.variation_count === 1 ? "" : "s"}
                        {p.created_by ? ` · ${p.created_by.split("@")[0]}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <PlatformPill label="META" status={normalizePlatformStatus(p.meta_upload_status)} launchedAt={p.meta_launched_at} compact />
                      {p.applovin_upload_status && (
                        <PlatformPill label="APPLOVIN" status={normalizePlatformStatus(p.applovin_upload_status)} launchedAt={p.applovin_launched_at} compact />
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {modalPkgId && (
        <LogQuickModal pkgId={modalPkgId} onClose={() => setModalPkgId(null)} />
      )}
    </div>
  );
}

function LogQuickModal({ pkgId, onClose }: { pkgId: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["launches", pkgId],
    queryFn: () => api.get<LaunchPackageDetail>(`/api/launches/${pkgId}`),
  });
  // Escape to dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="al-card max-w-5xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && (
          <div className="text-sm text-slate-500 py-6 text-center">Loading…</div>
        )}
        {isError && (
          <div className="text-sm text-rose-700 py-6 text-center">
            Failed to load: {(error as any)?.message ?? "unknown error"}
          </div>
        )}
        {data && <ModalBody pkg={data} onClose={onClose} />}
      </div>
    </div>
  );
}

function ModalBody({ pkg, onClose }: { pkg: LaunchPackageDetail; onClose: () => void }) {
  // Cycle 411 — operator notes editor. Saves on blur. Optimistic +
  // toast on success. Refetches the package detail to keep the
  // canonical store in sync.
  const qcLocal = useQueryClient();
  const toastLocal = useToast();
  const [notes, setNotes] = useState<string>(pkg.operator_notes ?? "");
  const [savedNotes, setSavedNotes] = useState<string>(pkg.operator_notes ?? "");
  const saveNotes = useMutation({
    mutationFn: (next: string) =>
      api.put<{ ok: boolean }>(`/api/launches/${pkg.id}/notes`, { notes: next || null }),
    onSuccess: (_data, next) => {
      setSavedNotes(next);
      qcLocal.invalidateQueries({ queryKey: ["launches", pkg.id] });
      toastLocal("success", "Note saved.");
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Save failed."),
  });
  // Cycle 440 — tags editor: comma-separated input; save on blur.
  const initialTags = (pkg.tags ?? []).join(", ");
  const [tagsDraft, setTagsDraft] = useState<string>(initialTags);
  const [savedTags, setSavedTags] = useState<string>(initialTags);
  const saveTags = useMutation({
    mutationFn: (tags: string[]) =>
      api.put<{ ok: boolean }>(`/api/launches/${pkg.id}/tags`, { tags }),
    onSuccess: (_data, tags) => {
      setSavedTags(tags.join(", "));
      qcLocal.invalidateQueries({ queryKey: ["launches", pkg.id] });
      qcLocal.invalidateQueries({ queryKey: ["launches"] });
      toastLocal("success", "Tags saved.");
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Save failed."),
  });
  function parseTags(s: string): string[] {
    return Array.from(new Set(
      s.split(",").map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 32),
    )).slice(0, 20);
  }
  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {pkg.ad_id && (
              <span className="text-sm font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-500 text-white">
                {pkg.ad_id}
              </span>
            )}
            <StatusBadge status={pkg?.meta_campaign_effective_status} />
            <PlatformPill label="META" status={pkg?.meta_campaign_effective_status} launchedAt={pkg.meta_launched_at} />
            {pkg.applovin_upload_status && (
              <PlatformPill label="APPLOVIN" status={normalizePlatformStatus(pkg.applovin_upload_status)} launchedAt={pkg.applovin_launched_at} />
            )}
          </div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{pkg.name}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {[pkg.brand_name, pkg.product_name, pkg.funnel, fmtDateTime(pkg.created_at)]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Cycle 383 — Duplicate launch button in the modal. The
              underlying ?from=<id> flow already exists; this surface
              just makes it a one-click path from the row preview. */}
          {/* <Link
            to={`/launch?from=${pkg.id}`}
            className="text-[11px] font-medium text-indigo-700 hover:underline px-2 py-1 rounded border border-indigo-100 bg-indigo-50 inline-flex items-center gap-1"
            title="Open the launcher pre-filled with this package's settings (as a fresh draft)"
          >
            Duplicate ↗
          </Link> */}
          {/* Cycle 468 — drill into /dev audit filtered to this
              package. Useful for "who edited this launch and when". */}
          {/* <Link
            to={`/dev?audit_pkg=${pkg.id}`}
            className="text-[11px] font-medium text-slate-600 hover:underline px-2 py-1 rounded border border-slate-200 bg-white inline-flex items-center gap-1"
            title="Open /dev with the audit log filtered to this package"
          >
            Audit ↗
          </Link> */}
          {/* Cycle 442 — "Open full page" removed per operator: the
              modal is the complete view. Duplicate ↗ above is still
              available for the clone-as-draft path. */}
          <button
            className="btn-icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      {/* Cycle 411 — operator notes. Free-form sticky note for team
          handoff context. Saves on blur.
          Cycle 440 — tag editor alongside notes. Comma-separated.
          Cycle 489 — auto-collapse when empty. Empty sections render as a
          compact "+ add notes" / "+ add tags" placeholder so the modal
          header stays scannable; click expands to the full editor. */}
      <div className="mb-3 border-t border-slate-200 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <CollapsibleSection
          label="Notes"
          initiallyEmpty={!notes.trim()}
          placeholder="+ add notes"
          rightStatus={
            saveNotes.isPending ? "saving…"
            : notes !== savedNotes ? "unsaved changes"
            : null
          }
          rightStatusTone={notes !== savedNotes ? "amber" : "slate"}
        >
          <textarea
            className="al-input text-xs"
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== savedNotes) saveNotes.mutate(notes); }}
            placeholder="Sticky note for the team — context, gotchas, why this launch was paused, etc."
          />
        </CollapsibleSection>
        <CollapsibleSection
          label="Tags"
          initiallyEmpty={!tagsDraft.trim()}
          placeholder="+ add tags"
          labelSuffix="(comma-separated)"
          rightStatus={
            saveTags.isPending ? "saving…"
            : tagsDraft !== savedTags ? "unsaved"
            : null
          }
          rightStatusTone={tagsDraft !== savedTags ? "amber" : "slate"}
        >
          <input
            className="al-input text-xs"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            onBlur={() => { if (tagsDraft !== savedTags) saveTags.mutate(parseTags(tagsDraft)); }}
            placeholder="e.g. Q3 testing, winning angle, BFCM"
          />
          {(pkg.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(pkg.tags ?? []).map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">{t}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
      <ModalVariationTable variations={pkg.variations} packageId={pkg.id} />
    </>
  );
}

/**
 * Cycle 489 — collapsible header for empty modal sections. When the
 * content is empty on first render, show a compact "+ add X" button;
 * clicking expands to the wrapped form control. Once expanded the
 * section stays open — no auto-collapse on blur, so a user mid-typing
 * never has the editor yanked out from under them. Status text (saving…,
 * unsaved) sits inline on the label.
 *
 * Cycle 500 — when `initiallyEmpty` AND nothing has been typed yet, a
 * tiny "collapse" link in the label lets the operator who expanded the
 * section by mistake re-close it without saving content. Hidden when
 * the section was non-empty on first render (i.e. there's saved data),
 * because collapsing then would hide real content.
 */
function CollapsibleSection({
  label,
  labelSuffix,
  placeholder,
  initiallyEmpty,
  rightStatus,
  rightStatusTone = "slate",
  children,
}: {
  label: string;
  labelSuffix?: string;
  placeholder: string;
  initiallyEmpty: boolean;
  rightStatus?: string | null;
  rightStatusTone?: "slate" | "amber";
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(!initiallyEmpty);
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-left text-[11px] text-slate-400 italic hover:text-slate-600 hover:bg-slate-50 rounded px-2 py-2 border border-dashed border-slate-200 hover:border-slate-300 transition-colors"
        title={`Click to ${placeholder.replace(/^\+\s*/, "")}`}
      >
        {placeholder}
      </button>
    );
  }
  // Cycle 500 — collapse affordance is only safe when the section was
  // empty on first render (no saved data to hide) AND nothing is being
  // saved right now (don't yank an in-flight save under the user).
  const canCollapse = initiallyEmpty && rightStatus !== "saving…";
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
        {label}
        {rightStatus && (
          <span className={`normal-case font-normal ml-1.5 ${rightStatusTone === "amber" ? "text-amber-700" : "text-slate-400"}`}>
            {rightStatus}
          </span>
        )}
        {labelSuffix && <span className="text-slate-400 normal-case font-normal ml-1.5">{labelSuffix}</span>}
        {canCollapse && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="float-right normal-case font-normal text-[10px] text-slate-400 hover:text-slate-700"
            title="Collapse this section. Available because nothing's been saved yet."
          >
            collapse ✕
          </button>
        )}
      </label>
      {children}
    </div>
  );
}

function ModalVariationTable({ variations, packageId }: { variations: LaunchVariation[]; packageId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Cycle 413 — inline edit ad name. Tracks which row is being edited
  // + the local draft string; save on Enter or blur.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const qcLocal = useQueryClient();
  const toastLocal = useToast();
  const saveName = useMutation({
    mutationFn: ({ vid, name }: { vid: string; name: string }) =>
      api.put<{ ok: boolean }>(`/api/launches/${packageId}/variations/${vid}`, { ad_name: name }),
    onSuccess: () => {
      qcLocal.invalidateQueries({ queryKey: ["launches", packageId] });
      setEditingId(null);
      toastLocal("success", "Ad name updated.");
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Update failed."),
  });
  // Cycle 433 — generic copy-field edit (primary_text / headline /
  // description / destination_url / preview_url). Hits the same C413
  // PUT endpoint; the server already accepts all these keys.
  const saveField = useMutation({
    mutationFn: ({ vid, field, value }: { vid: string; field: string; value: string | null }) =>
      api.put<{ ok: boolean }>(`/api/launches/${packageId}/variations/${vid}`, { [field]: value }),
    onSuccess: (_d, vars) => {
      qcLocal.invalidateQueries({ queryKey: ["launches", packageId] });
      toastLocal("success", `${vars.field.replace(/_/g, " ")} updated.`);
    },
    onError: (e: any) => toastLocal("error", e?.message ?? "Update failed."),
  });
  if (!variations || variations.length === 0) {
    return (
      <div className="text-xs text-slate-500 py-6 text-center border-t border-slate-200 mt-3 pt-6">
        No ad variations in this package.
      </div>
    );
  }
  return (
    <div className="border-t border-slate-200 pt-3">
      {/* Cycle 442 — every row is clickable; expansion shows full ad
          details (copy, destination, preview) + the Meta preview
          iframe when launched. No more "Preview" cell — the whole row
          IS the expander. */}
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left font-semibold py-1.5 px-2 w-6"></th>
            <th className="text-left font-semibold py-1.5 px-2">Ad name</th>
            <th className="text-left font-semibold py-1.5 px-2">Filename</th>
            <th className="text-left font-semibold py-1.5 px-2">Meta status</th>
            <th className="text-left font-semibold py-1.5 px-2">Meta ad id</th>
            <th className="text-left font-semibold py-1.5 px-2">AppLovin status</th>
            <th className="text-left font-semibold py-1.5 px-2">AppLovin creative set</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {variations.map((v) => {
            const id = v.id ?? v.file_name;
            const live = !!v.meta_ad_id;
            const isOpen = openId === id;
            return (
              <Fragment key={id}>
                <tr
                  className="hover:bg-slate-50/60 cursor-pointer"
                  onClick={() => setOpenId(isOpen ? null : id)}
                >
                  <td className="py-1.5 px-2 align-top text-slate-400 font-mono text-[10px] select-none">
                    {isOpen ? "▾" : "▸"}
                  </td>
                  <td className="py-1.5 px-2 align-top font-medium text-slate-800 min-w-0 max-w-[24rem]">
                    {editingId === id && v.id ? (
                      <input
                        autoFocus
                        type="text"
                        className="al-input text-xs py-0.5 w-full"
                        value={draft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveName.mutate({ vid: v.id!, name: draft }); }
                          if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                        }}
                        onBlur={() => {
                          if (draft.trim() && draft !== v.ad_name) saveName.mutate({ vid: v.id!, name: draft });
                          else setEditingId(null);
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate" title={v.ad_name}>{v.ad_name}</span>
                        {v.id && !v.meta_ad_id && (
                          <button
                            type="button"
                            className="text-[10px] text-slate-400 hover:text-slate-700 underline shrink-0"
                            title="Edit ad name (only available before the ad has launched)"
                            onClick={(e) => { e.stopPropagation(); setEditingId(id); setDraft(v.ad_name); }}
                          >
                            edit
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2 align-top text-slate-500 font-mono min-w-0 max-w-[20rem] truncate" title={v.file_name}>{v.file_name}</td>
                  <td className="py-1.5 px-2 align-top">
                    {v.meta_ad_effective_status ? (
                      <span className="text-[10px] font-mono capitalize px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200">
                        {v.meta_ad_effective_status.toLowerCase().replace(/_/g, " ")}
                      </span>
                    ) : v.meta_launch_error ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">error</span>
                    ) : live ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVE</span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">PAUSED</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 align-top font-mono text-slate-600">{v.meta_ad_id ?? "—"}</td>
                  {/* AppLovin status — mirrors the Meta status cell. Launched = creative set exists. */}
                  <td className="py-1.5 px-2 align-top">
                    {(v as any).applovin_launch_error ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">error</span>
                    ) : (v as any).applovin_creative_set_id ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">PAUSED</span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 align-top font-mono text-slate-600">{(v as any).applovin_creative_set_id ?? "—"}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 bg-slate-50/70">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[11px] mb-3">
                        {/* Cycle 433 — every copy field is inline-
                            editable on not-yet-launched variations.
                            Launched ads stay read-only (reject +
                            relaunch is the path). */}
                        <EditableField
                          label="Headline"
                          value={v.headline ?? ""}
                          editable={!!v.id && !v.meta_ad_id}
                          onSave={(val) => saveField.mutate({ vid: v.id!, field: "headline", value: val || null })}
                        />
                        <EditableField
                          label="CTA"
                          value={v.call_to_action ?? ""}
                          editable={false}
                        />
                        <EditableField
                          label="Primary text"
                          value={v.primary_text ?? ""}
                          editable={!!v.id && !v.meta_ad_id}
                          wide
                          multiline
                          onSave={(val) => saveField.mutate({ vid: v.id!, field: "primary_text", value: val || null })}
                        />
                        <EditableField
                          label="Description"
                          value={v.description ?? ""}
                          editable={!!v.id && !v.meta_ad_id}
                          wide
                          onSave={(val) => saveField.mutate({ vid: v.id!, field: "description", value: val || null })}
                        />
                        <EditableField
                          label="Destination URL"
                          value={v.destination_url ?? ""}
                          editable={!!v.id && !v.meta_ad_id}
                          wide
                          mono
                          copy
                          onSave={(val) => saveField.mutate({ vid: v.id!, field: "destination_url", value: val || null })}
                        />
                        <EditableField
                          label="Preview URL (display)"
                          value={(v as any).preview_url ?? ""}
                          editable={!!v.id && !v.meta_ad_id}
                          wide
                          mono
                          copy
                          onSave={(val) => saveField.mutate({ vid: v.id!, field: "preview_url", value: val || null })}
                        />
                        {v.meta_ad_id && <DetailField label="Meta ad ID" value={v.meta_ad_id} mono copy />}
                        {/* AppLovin (Axon) launch ids — shown when populated. Mirrors the Meta ad ID field. */}
                        {(v as any).applovin_asset_id && <DetailField label="AppLovin asset ID" value={(v as any).applovin_asset_id} mono copy />}
                        {(v as any).applovin_campaign_id && <DetailField label="AppLovin campaign ID" value={(v as any).applovin_campaign_id} mono copy />}
                        {(v as any).applovin_creative_set_id && <DetailField label="AppLovin creative set ID" value={(v as any).applovin_creative_set_id} mono copy />}
                      </div>
                      {live && v.meta_ad_id && <MetaAdPreviewEmbed metaAdId={v.meta_ad_id} />}
                    </td>
                  </tr>
                )}
                {v.meta_launch_error && (
                  <tr>
                    <td colSpan={7} className="px-2 pb-2 text-[11px] text-rose-700 font-mono break-words">
                      {v.meta_launch_error}
                    </td>
                  </tr>
                )}
                {(v as any).applovin_launch_error && (
                  <tr>
                    <td colSpan={7} className="px-2 pb-2 text-[11px] text-rose-700 font-mono break-words">
                      AppLovin: {(v as any).applovin_launch_error}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PREVIEW_FORMATS = [
  "DESKTOP_FEED_STANDARD",
  "MOBILE_FEED_STANDARD",
  "INSTAGRAM_STANDARD",
  "INSTAGRAM_STORY",
  "INSTAGRAM_REELS",
  "FACEBOOK_REELS_MOBILE",
] as const;
type PreviewFormat = (typeof PREVIEW_FORMATS)[number];

function MetaAdPreviewEmbed({ metaAdId }: { metaAdId: string }) {
  const [format, setFormat] = useState<PreviewFormat>("DESKTOP_FEED_STANDARD");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ad-preview", metaAdId, format],
    queryFn: () => api.get<{ meta_ad_id: string; format: string; iframe_html: string | null; error: string | null }>(
      `/api/launches/ad-preview/${metaAdId}?format=${format}`,
    ),
    staleTime: 60_000,
  });
  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Placement</span>
        {PREVIEW_FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={`chip text-[10px] ${
              format === f
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
            aria-pressed={format === f}
          >
            {f.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>
      {isLoading && <div className="text-xs text-slate-500 py-4 text-center">Loading preview…</div>}
      {isError && <div className="text-xs text-rose-700 py-4 text-center">Failed: {(error as any)?.message ?? "unknown"}</div>}
      {data && data.error && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Meta: {data.error}
        </div>
      )}
      {data && data.iframe_html && (
        <div
          className="bg-white border border-slate-200 rounded overflow-hidden"
          dangerouslySetInnerHTML={{ __html: data.iframe_html }}
        />
      )}
    </div>
  );
}

function AssetGlyph({ type }: { type: string | null | undefined }) {
  // 28x28 rounded glyph keyed off asset_type. Subtle gradient + matching icon.
  const t = (type ?? "Video").toLowerCase();
  if (t.includes("image") || t === "static") {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-100 to-violet-50 border border-violet-200 grid place-items-center text-violet-600 shrink-0" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    );
  }
  if (t.includes("tsl") || t.includes("carousel")) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 grid place-items-center text-amber-600 shrink-0" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </div>
    );
  }
  // Default: Video
  return (
    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-100 to-brand-50 border border-brand-200 grid place-items-center text-brand-600 shrink-0" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function PlatformPill({
  label,
  status,
  launchedAt,
  compact,
}: {
  label: string;
  status: "ACTIVE" | "PAUSED" | "WITH_ISSUES" | null;
  compact?: boolean;
  launchedAt?: string | null;
}) {
  const tone =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "WITH_ISSUES"
      ? "bg-red-50 text-red-700 border-red-200"
      : status === "PAUSED"
      ? "bg-slate-50 text-slate-600 border-slate-200"
      : "bg-slate-50 text-slate-400 border-slate-100";
  const dot =
    status === "ACTIVE"
      ? "bg-emerald-500"
      : status === "WITH_ISSUES"
      ? "bg-red-500"
      : status === "PAUSED"
      ? "bg-slate-400"
      : "bg-slate-300";
  const launchedShort = launchedAt ? fmtDateChip(launchedAt) : null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${tone}`}
      title={launchedAt ? `${label} launched ${fmtDateTime(launchedAt)}` : undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="font-mono tracking-wider">{label}</span>
      <span className="opacity-60">·</span>
      <span>{status ?? "—"}</span>
      {launchedShort && status === "ACTIVE" && (
        <>
          <span className="opacity-50">·</span>
          <span className="opacity-80">{launchedShort}</span>
        </>
      )}
    </span>
  );
}

/**
 * Live per-variation Meta effective_status badge. Fed by /ad-links which
 * hits Graph (ads_read) with batched lookups + a 10-min cache. We map the
 * raw enum to user-friendly colors so the operator can see at a glance
 * which ads went LIVE vs got disapproved.
 */
function MetaStatusBadge({ status, polled, error }: { status: string | null; polled: string | null; error: string | null }) {
  if (!status && !error) return null;
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Meta · Live", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    IN_PROCESS: { label: "Meta · Processing", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    PENDING_REVIEW: { label: "Meta · In review", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    PREAPPROVED: { label: "Meta · Pre-approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    WITH_ISSUES: { label: "Meta · Issues", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    DISAPPROVED: { label: "Meta · Disapproved", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    PAUSED: { label: "Meta · Paused", cls: "bg-slate-50 text-slate-700 border-slate-200" },
    ADSET_PAUSED: { label: "Meta · Ad-set paused", cls: "bg-slate-50 text-slate-700 border-slate-200" },
    CAMPAIGN_PAUSED: { label: "Meta · Campaign paused", cls: "bg-slate-50 text-slate-700 border-slate-200" },
    ARCHIVED: { label: "Meta · Archived", cls: "bg-slate-50 text-slate-500 border-slate-200" },
    DELETED: { label: "Meta · Deleted", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  };
  const meta = status ? (map[status] ?? null) : null;
  const polledTooltip = polled ? `Polled ${fmtDateTime(polled)}` : "";
  if (error) {
    return (
      <span
        className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200"
        title={`${error}\n${polledTooltip}`}
      >
        Meta · err
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta?.cls ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
      title={`${status}\n${polledTooltip}`}
    >
      {meta?.label ?? `Meta · ${status}`}
    </span>
  );
}

function DetailField({
  label,
  value,
  mono,
  link,
  wide,
  copy,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  link?: boolean;
  wide?: boolean;
  // Cycle 382 — opt-in copy-to-clipboard button. We do NOT slap one on
  // every field by default (most are paragraph copy where clipboard is
  // noise); callers explicitly pass copy=true on ad_name / file_name /
  // meta_ad_id which are the high-value lookups.
  copy?: boolean;
}) {
  const toast = useToast();
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5 flex items-center gap-1.5">
        {label}
        {copy && value && (
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700 text-[10px] underline normal-case tracking-normal"
            title={`Copy ${label}`}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(value);
                toast("success", `Copied ${label.toLowerCase()}.`);
              } catch {
                toast("error", "Clipboard write failed.");
              }
            }}
          >
            copy
          </button>
        )}
      </div>
      <div className={`text-slate-700 break-words ${mono ? "font-mono text-[11px]" : ""}`}>
        {value ? (
          link && value.startsWith("http") ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

/**
 * Cycle 433 — editable variation field. Renders the value with an
 * "edit" link; click to swap to an input/textarea, save on blur or
 * Enter, cancel on Escape. When `editable` is false the component
 * degrades to a plain DetailField.
 */
function EditableField({
  label, value, editable, mono, wide, copy, multiline, onSave,
}: {
  label: string;
  value: string;
  editable: boolean;
  mono?: boolean;
  wide?: boolean;
  copy?: boolean;
  multiline?: boolean;
  onSave?: (next: string) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (!editable || !onSave) {
    return <DetailField label={label} value={value || null} mono={mono} wide={wide} copy={copy} link={mono} />;
  }
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5 flex items-center gap-1.5">
        {label}
        {!editing && (
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700 text-[10px] underline normal-case tracking-normal"
            onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(value); }}
          >
            edit
          </button>
        )}
        {copy && !editing && value && (
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700 text-[10px] underline normal-case tracking-normal"
            onClick={async (e) => {
              e.stopPropagation();
              try { await navigator.clipboard.writeText(value); toast("success", `Copied ${label.toLowerCase()}.`); }
              catch { toast("error", "Clipboard write failed."); }
            }}
          >
            copy
          </button>
        )}
      </div>
      {editing ? (
        multiline ? (
          <textarea
            autoFocus
            className="al-input text-xs"
            rows={3}
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setEditing(false); setDraft(value); }
              if ((e.key === "Enter" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); onSave(draft); setEditing(false); }
            }}
            onBlur={() => { if (draft !== value) onSave(draft); setEditing(false); }}
          />
        ) : (
          <input
            autoFocus
            type="text"
            className={`input text-xs ${mono ? "font-mono" : ""}`}
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onSave(draft); setEditing(false); }
              if (e.key === "Escape") { e.preventDefault(); setEditing(false); setDraft(value); }
            }}
            onBlur={() => { if (draft !== value) onSave(draft); setEditing(false); }}
          />
        )
      ) : (
        <div className={`text-slate-700 break-words ${mono ? "font-mono text-[11px]" : ""}`}>
          {value || <span className="text-slate-300">—</span>}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, link }: { label: string; value: string | null | undefined; link?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="font-medium text-slate-900 text-sm truncate">
        {value ? (
          link ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

/**
 * Cycle 225 — bulk mark-launched panel. For ops launched outside the
 * tool (operator pushed ads via Business Manager directly and wants to
 * backfill the in-tool status).
 *
 * UI: one row per variation showing position + ad_name + a meta_ad_id
 * input. Operator pastes IDs from Meta one-by-one (or pastes a multi-
 * line block where each line maps to the next empty row). On Save,
 * POSTs to /api/launches/:id/mark-launched.
 */
function ManualMarkLaunchedPanel({
  packageId,
  variations,
  onDone,
}: {
  packageId: string;
  variations: LaunchPackageDetail["variations"];
  onDone: () => void;
}) {
  const toast = useToast();
  const handleMutationError = useLaunchPackageErrorHandler();
  const [ids, setIds] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    // Variations from the detail endpoint always carry an id; the type
    // marks it optional only because the launcher creates draft rows
    // without one. Assert here so Record<string, string> stays typed.
    for (const v of variations) if (v.id) init[v.id] = (v as any).meta_ad_id ?? "";
    return init;
  });
  // Cycle 233 — Esc closes the panel (matches modal idiom).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDone();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  const mutate = useMutation({
    mutationFn: () => api.post<{ ok: boolean; updated: number }>(
      `/api/launches/${packageId}/mark-launched`,
      {
        assignments: Object.entries(ids)
          .map(([variation_id, meta_ad_id]) => ({ variation_id, meta_ad_id: meta_ad_id.trim() }))
          .filter((a) => a.meta_ad_id),
      },
    ),
    onSuccess: (r) => {
      toast("success", `Marked ${r.updated} variation${r.updated === 1 ? "" : "s"} as launched.`);
      onDone();
    },
    onError: handleMutationError,
  });
  // Multi-line paste handler: split on whitespace and fill the empty
  // rows in order.
  function bulkPaste(text: string) {
    const tokens = text.split(/[\s,]+/).filter((t) => /^\d{6,30}$/.test(t));
    if (tokens.length === 0) return;
    // Cycle 263 — dedupe tokens (operator might double-paste the same
    // ID block) AND skip any IDs already assigned to another row.
    const used = new Set(Object.values(ids).map((v) => v.trim()).filter(Boolean));
    const fresh: string[] = [];
    for (const t of tokens) {
      if (used.has(t)) continue;
      used.add(t);
      fresh.push(t);
    }
    setIds((prev) => {
      const next = { ...prev };
      let i = 0;
      for (const v of variations) {
        if (i >= fresh.length) break;
        const vid = v.id;
        if (!vid) continue;
        if (!next[vid]?.trim()) {
          next[vid] = fresh[i];
          i++;
        }
      }
      return next;
    });
  }
  const filled = Object.values(ids).filter((v) => v.trim()).length;
  // Cycle 264 — flag duplicate IDs typed across rows (catches operator
  // accidentally pasting the same Meta ID into two ad rows).
  const dupIds = (() => {
    const seen = new Map<string, number>();
    for (const v of Object.values(ids)) {
      const t = v.trim();
      if (!t) continue;
      seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  })();
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="text-[11px] font-semibold text-slate-700">
          Backfill from external launch · paste Meta ad IDs
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span>{filled} of {variations.length} filled</span>
          {/* Cycle 269 — dup-count chip to make the rejection state
              obvious from the header. */}
          {dupIds.size > 0 && (
            <span className="text-rose-700">· {dupIds.size} duplicate{dupIds.size === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-500">
        Use when ads were launched outside this tool (e.g. directly in Business Manager). Paste a block of IDs to fill empty rows in order, or type per-row. Each ID is the numeric Meta ad ID from Ads Manager. Already-set IDs aren't overwritten by bulk-paste.
      </p>
      <textarea
        className="al-input font-mono text-xs"
        rows={2}
        placeholder="Paste multi-line block of Meta ad IDs to fill empty rows…"
        onPaste={(e) => {
          // Only auto-handle on multi-line paste; single-line goes to row inputs.
          const text = e.clipboardData.getData("text");
          if (/[\s,]/.test(text)) {
            e.preventDefault();
            bulkPaste(text);
            // Cycle 266 — blur textarea so the operator can review the
            // populated rows without typing accidentally landing in the
            // textarea again.
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      <div className="space-y-1 max-h-72 overflow-auto">
        {variations.map((v, i) => {
          const vid = v.id;
          if (!vid) return null;
          return (
            <div key={vid} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-slate-500 shrink-0 w-6">#{i + 1}</span>
              <span className="font-medium text-slate-800 truncate flex-1" title={v.file_name}>
                {v.ad_name || v.file_name}
              </span>
              <input
                type="text"
                className={`input font-mono text-[10px] py-1 w-44 ${
                  ids[vid]?.trim() && dupIds.has(ids[vid].trim())
                    ? "border-rose-400 bg-rose-50"
                    : ""
                }`}
                placeholder="meta_ad_id"
                value={ids[vid] ?? ""}
                title={ids[vid]?.trim() && dupIds.has(ids[vid].trim())
                  ? "This ID is duplicated across multiple rows. Each variation needs a unique Meta ad ID."
                  : ""}
                onChange={(e) => {
                  // Cycle 232 — strip common prefix garbage operators paste
                  // (act_, fb-, leading whitespace, trailing punctuation).
                  const cleaned = e.target.value
                    .trim()
                    .replace(/^(act_|fb-|fb_)/i, "")
                    .replace(/[^\d]+$/, "");
                  setIds((prev) => ({ ...prev, [vid]: cleaned }));
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          className="text-[11px] px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          onClick={onDone}
        >
          Cancel
        </button>
        <button
          type="button"
          className="text-[11px] px-2.5 py-1 rounded bg-brand-500 text-white font-semibold disabled:opacity-50"
          disabled={mutate.isPending || filled === 0 || dupIds.size > 0}
          title={dupIds.size > 0 ? "Resolve duplicate IDs before saving" : ""}
          onClick={() => mutate.mutate()}
        >
          {mutate.isPending ? "Saving…" : `Mark ${filled} launched`}
        </button>
      </div>
    </div>
  );
}

/**
 * Cycle 141 — copy-to-clipboard Ad ID chip for the Log detail header.
 * Click → write `adId` to clipboard → flip the icon to a checkmark for
 * 1.5s → toast `Ad ID copied`. Falls back to text-selection on browsers
 * that don't expose navigator.clipboard (rare on HTTPS desktop).
 */
function CopyableAdIdChip({ adId }: { adId: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(adId);
      setCopied(true);
      toast("success", `Ad ID copied · ${adId}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("error", "Copy failed — select the chip text manually.");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono transition-colors ${
        copied
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-brand-50 text-brand-700 border-brand-100 hover:bg-brand-100"
      }`}
      title="Click to copy the Ad ID — paste back into ClickUp, Slack, or anywhere."
      aria-label={`Copy Ad ID ${adId}`}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span>{adId}</span>
    </button>
  );
}
