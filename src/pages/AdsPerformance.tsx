import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelect } from "@/components/ui/multi-select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  ChevronDown,
  Eye,
  ExternalLink,
  BarChart2,
  Loader2,
  X,
  SlidersHorizontal,
  Download,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import type { ColDef, ColGroupDef, ICellRendererParams, GetRowIdParams } from 'ag-grid-community';
import { AdsAgGrid } from '@/components/ads/AdsAgGrid';

interface ApiAdRow {
  channel: string;
  campaignName: string;
  adsetName: string;
  adName: string;
  adImageURL: string | null;
  adVideoURL: string | null;
  eventDate: string;
  product: string;
  spend: number;
  ncRevenue: number;
  ncROAS: number;
  ncOrders: number;
  ncCPA: number;
  ncAOV: number;
  OCPC: number;
  OCTR: number;
  ncCVR: number;
  clicks: number;
  outClicks: number;
  impressions: number;
  orders: number;
  newCustomers: number;
  CPM: number;
  nvPct: number;
  ad_id: number;
  fb_ad_id?: string | null;
  script_id: string;
  launch_date_meta: string | null;
  launch_date_applovin: string | null;
  cs: string;
  concept_name: string;
  editor: string;
  ad_format: string;
  funnel: string;
  cta: string;
  sub_angle?: string | null;
  sub_angle_detail?: string | null;
  it_or_nn: string;
  clickup_link: string | null;
  root_cause?: string | null;
  main_pain_point?: string | null;
  ad_type?: string | null;
  brief?: string | null;
  points?: string | null;
  edit_type?: string | null;
  notes?: string | null;
  breakdown_url?: string | null;
  breakdown_ready?: boolean;
  creative_set_id?: string | null;
  metaROAS?: number | null;
  metaCPA?: number | null;
  metaCPC?: number | null;
  metaCPCOut?: number | null;
  metaCTR?: number | null;
  metaConvRate?: number | null;
  metaSpend?: number | null;
  applovinROAS?: number | null;
  applovinCPA?: number | null;
  applovinCPC?: number | null;
  applovinCTR?: number | null;
  applovinConvRate?: number | null;
  applovinSpend?: number | null;
  todaySpend?: number | null;
  todayNcROAS?: number | null;
  yesterdaySpend?: number | null;
  yesterdayNcROAS?: number | null;
  "2daysAgoSpend"?: number | null;
  "2daysAgoNcROAS"?: number | null;
  "3daysAgoSpend"?: number | null;
  "3daysAgoNcROAS"?: number | null;
  "4daysAgoSpend"?: number | null;
  "4daysAgoNcROAS"?: number | null;
}

interface AdTotals {
  spend: number;
  ncRevenue: number;
  ncROAS: number;
  ncCPA: number;
  ncAOV: number;
  OCPC: number;
  OCTR: number;
  ncCVR: number;
  clicks: number;
  orders: number;
  CPM: number;
  nvPct: number;
  metaROAS?: number | null;
  metaCPA?: number | null;
  metaCPC?: number | null;
  metaCPCOut?: number | null;
  metaCTR?: number | null;
  metaConvRate?: number | null;
  metaSpend?: number | null;
  applovinROAS?: number | null;
  applovinCPA?: number | null;
  applovinCPC?: number | null;
  applovinCTR?: number | null;
  applovinConvRate?: number | null;
  applovinSpend?: number | null;
}

interface BrandOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
  brand_id: string | null;
}

const FUNNEL_STYLES: Record<string, string> = {
  Comparison: "bg-blue-50 text-blue-700 border border-blue-100",
  Onbrand:    "bg-emerald-50 text-emerald-700 border border-emerald-100",
  TSL:        "bg-purple-50 text-purple-700 border border-purple-100",
  Adv:        "bg-rose-50 text-rose-700 border border-rose-100",
};

const CTA_STYLES: Record<string, string> = {
  quiz: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  shop: "bg-amber-50 text-amber-700 border border-amber-100",
};

const PLATFORM_STYLES: Record<string, string> = {
  Facebook:  "bg-blue-50 text-blue-700 border border-blue-100",
  Applovin:  "bg-orange-50 text-orange-700 border border-orange-100",
};

const fmt = {
  currency: (n: number) =>
    `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  pct:  (n: number) => `${(n ?? 0).toFixed(2)}%`,
  x:    (n: number) => `${(n ?? 0).toFixed(2)}x`,
  int:  (n: number) => (n ?? 0).toLocaleString("en-US"),
};

// One displayed field: [label, value, optional color class].
type AdField = [string, string, string?, string?]; // [label, value, colorClass?, href?]

// Only allow http(s) links as hrefs — blocks javascript:/data: URI XSS.
// Trims first so values with stray leading/trailing whitespace (common in notes) still resolve.
const safeUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : null;
};

// Card/sheet title: ad name → creative set → campaign → fallback.
// Treats "", whitespace and the "—" placeholder as "not available" (Applovin ads
// often have no ad name; Meta usually has all three).
function adDisplayName(row: ApiAdRow, fallback = "—"): string {
  const pick = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    // Treat empty or dash-only placeholders ("-", "–", "—", "--") as "not available".
    return s && !/^[-–—]+$/.test(s) ? s : "";
  };
  return pick(row.adName) || pick(row.adsetName) || pick(row.campaignName) || fallback;
}

// Full performance metric list for an ad — matches the desktop "Performance" column group.
function adPerfMetrics(row: ApiAdRow): AdField[] {
  const m: AdField[] = [
    ["Spend", fmt.currency(row.spend ?? 0)],
    ["Revenue", fmt.currency(row.ncRevenue ?? 0)],
    ["ncROAS", fmt.int(row.ncROAS ?? 0), roasColor(row.ncROAS ?? 0)],
    ["ncCPA", fmt.currency(row.ncCPA ?? 0)],
    ["ncAOV", fmt.currency(row.ncAOV ?? 0)],
    ["CPC (Out)", fmt.currency(row.OCPC ?? 0)],
    ["CTR (Out)", fmt.pct(row.OCTR ?? 0)],
    ["ncCVR", fmt.pct(row.ncCVR ?? 0)],
    ["Clicks", fmt.int(row.clicks ?? 0)],
    ["Purchases", fmt.int(row.orders ?? 0)],
    ["CPM", fmt.currency(row.CPM ?? 0)],
    ["NV%", fmt.pct(row.nvPct ?? 0)],
    ["Hook Rate", "—"],
    ["Hold Rate", "—"],
  ];
  return m;
}

// Every table field for an ad, grouped exactly like the desktop column groups.
function adDetailSections(row: ApiAdRow): { title: string; rows: AdField[] }[] {
  const r = row as ApiAdRow & Record<string, unknown>;
  const dash = (v: unknown): string => (v == null || v === "" ? "—" : String(v));
  const launch = row.launch_date_meta || row.launch_date_applovin || "—";
  const adSourceUrl = safeUrl(r.ad_source_link);
  const clickupUrl = safeUrl(row.clickup_link);
  const briefUrl = safeUrl(row.brief);
  const notesUrl = safeUrl(row.notes);
  const adInfo: AdField[] = [
    ["Launch Date", dash(launch)],
    ["Platform", dash(row.channel)],
    ["Ad ID", dash(row.ad_id)],
    ["Concept Name", dash(row.concept_name)],
    ["Ad Format", dash(row.ad_format)],
    ["Angle", dash(row.sub_angle)],
    ["Sub-Angle", dash(row.sub_angle_detail)],
    ["CTA", dash(row.cta)],
  ];
  const additional: AdField[] = [
    ["Campaign Name", dash(row.campaignName)],
    ["Creative Set", dash(row.adsetName)],
    ["Ad Name", dash(row.adName)],
    ["Ad Type", dash(row.ad_type)],
    ["Funnel", dash(row.funnel)],
    ["Script ID", dash(row.script_id)],
    ["CS", dash(row.cs)],
    ["Editor", dash(row.editor)],
    ["Root Cause", dash(row.root_cause)],
    ["Main Pains", dash(row.main_pain_point)],
    ["IT/NN", dash(row.it_or_nn)],
    ["Ad Length", dash(r.ad_length)],
    ["Ad Source Link", adSourceUrl ? "Open" : "—", undefined, adSourceUrl ?? undefined],
    ["ClickUp", clickupUrl ? "Open" : "—", undefined, clickupUrl ?? undefined],
    ["Points", dash(row.points)],
    ["Brief", briefUrl ? "Open" : "—", undefined, briefUrl ?? undefined],
    ["Notes", notesUrl ? "Open" : dash(row.notes), undefined, notesUrl ?? undefined],
  ];
  return [
    { title: "Ad Info", rows: adInfo },
    { title: "Performance", rows: adPerfMetrics(row) },
    { title: "Additional Info", rows: additional },
  ];
}

// Trend rows (Today → 4 days ago) of Spend + ncROAS — matches the desktop "Trends" group.
function adTrends(row: ApiAdRow): { label: string; spend: string; roas: string; roasColor?: string }[] {
  const mk = (label: string, s: number | null | undefined, ro: number | null | undefined) => ({
    label,
    spend: s != null ? fmt.currency(s) : "—",
    roas: ro != null ? fmt.int(ro) : "—",
    roasColor: ro != null ? roasColor(ro) : undefined,
  });
  return [
    mk("Today", row.todaySpend, row.todayNcROAS),
    mk("Yesterday", row.yesterdaySpend, row.yesterdayNcROAS),
    mk("2 days ago", row["2daysAgoSpend"], row["2daysAgoNcROAS"]),
    mk("3 days ago", row["3daysAgoSpend"], row["3daysAgoNcROAS"]),
    mk("4 days ago", row["4daysAgoSpend"], row["4daysAgoNcROAS"]),
  ];
}

// Long-text fields render stacked (label above, value on its own full-width line).
const BLOCK_FIELDS = new Set(["Campaign Name", "Creative Set", "Ad Name", "Notes"]);

function FieldGroup({ rows }: { rows: AdField[] }) {
  return (
    <div className="rounded-lg border border-border divide-y divide-border/60">
      {rows.map(([label, value, color, href]) =>
        href ? (
          // Link field — open in a new tab as a button (never shows the raw URL).
          <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-muted shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {value}
            </a>
          </div>
        ) : BLOCK_FIELDS.has(label) ? (
          <div key={label} className="px-3 py-2">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className={cn("text-sm font-medium break-words whitespace-pre-wrap", color ?? "text-foreground")}>{value}</p>
          </div>
        ) : (
          <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
            <span className={cn("text-sm text-right font-medium break-words flex-1 min-w-0", color ?? "text-foreground")}>{value}</span>
          </div>
        )
      )}
    </div>
  );
}

// Ad Info + Performance + Additional Info — the full table fields, used by both
// the mobile card and the detail sheet so the card matches the desktop table.
function AdFieldSections({ row }: { row: ApiAdRow }) {
  return (
    <>
      {adDetailSections(row).map((sec) => (
        <div key={sec.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{sec.title}</p>
          {sec.title === "Performance" ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border px-3 py-2.5">
              {sec.rows.map(([label, value, color], i, arr) => (
                <div key={label} className={cn("flex items-center justify-between", i < arr.length - 2 && "border-b border-border/50 pb-1")}>
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={cn("text-sm font-semibold", color ?? "text-foreground")}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <FieldGroup rows={sec.rows} />
          )}
        </div>
      ))}
    </>
  );
}

// Card field whose long value (campaign / creative set names) truncates to one line,
// with a chevron toggle to reveal the full name. The toggle only shows when it overflows.
function TruncatableField({ label, value }: { label: string; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflows(el.scrollWidth > el.clientWidth + 1);
  }, [value, expanded]);
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-start gap-1.5">
        <p
          ref={ref}
          className={cn("text-sm font-medium text-foreground min-w-0 flex-1", expanded ? "break-words" : "truncate")}
        >
          {value || "—"}
        </p>
        {(overflows || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Show less" : "Show full name"}
            className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
    </div>
  );
}

function roasColor(v: number) {
  if (v >= 2) return "text-emerald-600 font-semibold";
  if (v < 1)  return "text-red-500 font-semibold";
  return "text-amber-600";
}

// ─── Video thumbnail: parallel canvas extraction (3 concurrent) ──────────────
// Up to 5 videos load at a time; same URL is deduplicated; results persist in
// sessionStorage so filter changes don't re-extract already-seen URLs.

const _thumbCache = new Map<string, string>();
const _thumbPending = new Map<string, Set<(r: string | null) => void>>();
const _thumbQueue: string[] = [];
const _THUMB_CONCURRENCY = 5;
let _thumbActiveCount = 0;
const _SK = 'vthumb_';

// ─── Meta live-preview iframe src cache (keyed by fb_ad_id) ───────────────────
// Resolved iframe `src` (or the sentinel 'error') per fb_ad_id, so scrolling the
// virtualized grid never refetches an already-seen ad. `_metaInflight` dedupes
// concurrent requests for the same id (e.g. two cells for the same ad).
const _metaSrcCache = new Map<string, string | 'error'>();
const _metaInflight = new Map<string, Promise<string>>();

function _sGet(url: string): string | null {
  try { return sessionStorage.getItem(_SK + url); } catch { return null; }
}
function _sSet(url: string, dataUrl: string) {
  try { sessionStorage.setItem(_SK + url, dataUrl); } catch (_e) { /* quota exceeded — ignore */ }
}

function _requestThumb(url: string, cb: (r: string | null) => void) {
  if (_thumbCache.has(url)) { cb(_thumbCache.get(url)!); return; }
  const stored = _sGet(url);
  if (stored) { _thumbCache.set(url, stored); cb(stored); return; }
  if (_thumbPending.has(url)) { _thumbPending.get(url)!.add(cb); return; }
  _thumbPending.set(url, new Set([cb]));
  const enqueue = () => {
    _thumbQueue.push(url);
    if (_thumbActiveCount < _THUMB_CONCURRENCY) _drainThumbQueue();
  };
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(enqueue, { timeout: 2000 });
  } else {
    enqueue();
  }
}

function _drainThumbQueue() {
  while (_thumbActiveCount < _THUMB_CONCURRENCY && _thumbQueue.length > 0) {
    _thumbActiveCount++;
    const url = _thumbQueue.shift()!;
    _extractFrame(url).then(dataUrl => {
      if (dataUrl) { _thumbCache.set(url, dataUrl); _sSet(url, dataUrl); }
      const waiters = _thumbPending.get(url);
      _thumbPending.delete(url);
      waiters?.forEach(cb => cb(dataUrl));
      _thumbActiveCount--;
      _drainThumbQueue();
    });
  }
}

function _extractFrame(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 15000);

    video.onloadedmetadata = () => {
      video.currentTime = 0; // frame 0 is always available immediately after metadata loads
    };

    video.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 96; c.height = 96;
        c.getContext('2d')!.drawImage(video, 0, 0, 96, 96);
        finish(c.toDataURL('image/jpeg', 0.8));
      } catch {
        finish(null); // SecurityError: CDN doesn't send CORS headers → play icon fallback
      }
    };

    video.onerror = () => finish(null);
    video.src = url;
  });
}

// AppLovin "winner" assets can be HTML5 playables (interactive ad units), not video.
// They arrive as a `.raw`/`.html` URL served as text/html — so <video>/<img> render blank.
// They must be embedded in an <iframe> instead. Detect by file extension on the path.
function isPlayableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(raw|html?)$/.test(path);
  } catch {
    return /\.(raw|html?)(\?|#|$)/i.test(url);
  }
}

// Live preview tile for a playable ad: renders the HTML5 playable in a small,
// non-interactive <iframe> scaled down to fill the 48×48 cell (cover-crop from
// the top). Laid out at a phone design size then CSS-scaled so the playable
// renders as authored. pointer-events:none so the parent's hover/click overlay
// still owns interaction; `loading="lazy"` + ag-grid row virtualization keep
// only visible playables loaded.
function PlayableThumb({ url }: { url: string }) {
  const DESIGN_W = 320;
  const DESIGN_H = 480;
  const scale = 48 / DESIGN_W; // fill width; overflow-hidden crops the height
  return (
    <div className="w-12 h-12 rounded-md border border-border overflow-hidden bg-white relative" title="Playable ad">
      <iframe
        src={url}
        title="Playable preview"
        tabIndex={-1}
        scrolling="no"
        loading="lazy"
        sandbox="allow-scripts"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// Fetch (once per fb_ad_id) the Meta ad-preview iframe and extract its `src`.
// Uses the same POST /api/ads/meta-preview endpoint/headers/body as the eye-modal.
// Cache-first → inflight-dedupe → network; stores the resolved src (or 'error')
// in `_metaSrcCache`. Mirrors the modal's iframe-src extraction (match src="…"
// then unescape &amp; → &).
function _fetchMetaSrc(fbAdId: string, getToken: () => string | null): Promise<string> {
  const cached = _metaSrcCache.get(fbAdId);
  if (cached !== undefined) {
    return cached === 'error' ? Promise.reject(new Error('meta-preview-error')) : Promise.resolve(cached);
  }
  const inflight = _metaInflight.get(fbAdId);
  if (inflight) return inflight;

  const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
  const p = (async () => {
    const r = await fetch(`${baseUrl}/api/ads/meta-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ fb_ad_id: fbAdId }),
    });
    const json = await r.json();
    if (!json.success || !json.iframeHtml) throw new Error(json.error || 'Preview unavailable');
    const srcMatch = String(json.iframeHtml).match(/src="([^"]+)"/);
    const src = (srcMatch?.[1] ?? '').replace(/&amp;/g, '&');
    if (!src) throw new Error('No iframe src in preview');
    return src;
  })();

  _metaInflight.set(fbAdId, p);
  return p.then(
    (src) => { _metaSrcCache.set(fbAdId, src); _metaInflight.delete(fbAdId); return src; },
    (err) => { _metaSrcCache.set(fbAdId, 'error'); _metaInflight.delete(fbAdId); throw err; },
  );
}

// Live Meta ad-preview tile. Mirrors PlayableThumb (scales a Meta /previews iframe
// into the 48×48 cell), but the src is fetched lazily from /api/ads/meta-preview by
// fb_ad_id. An IntersectionObserver defers the fetch until the tile is near the
// viewport so fast scrolling / offscreen pinned-column cells don't storm the API;
// results are cached module-wide by fb_ad_id. On failure it falls back to the still
// image, else "—". pointer-events:none so the parent hover/click overlay owns
// interaction.
function MetaThumb({ fbAdId, fallbackImg }: { fbAdId: string; fallbackImg?: string | null }) {
  const { getToken } = useAuth();
  const boxRef = useRef<HTMLDivElement | null>(null);
  // null = pending/loading, 'error' = failed, any other string = iframe src.
  const [src, setSrc] = useState<string | null | 'error'>(() => {
    const cached = _metaSrcCache.get(fbAdId);
    return cached === undefined ? null : cached;
  });

  useEffect(() => {
    // Already resolved (cache hit) — reflect it and skip the observer/fetch.
    if (_metaSrcCache.has(fbAdId)) { setSrc(_metaSrcCache.get(fbAdId)!); return; }
    const el = boxRef.current;
    let live = true;
    let obs: IntersectionObserver | null = null;

    const start = () => {
      _fetchMetaSrc(fbAdId, getToken)
        .then((s) => { if (live) setSrc(s); })
        .catch(() => { if (live) setSrc('error'); });
    };

    if (!el || typeof IntersectionObserver === 'undefined') {
      start(); // no observer support (or no node yet) → fetch immediately
      return () => { live = false; };
    }

    obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obs?.disconnect();
            start();
            break;
          }
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => { live = false; obs?.disconnect(); };
  }, [fbAdId, getToken]);

  const DESIGN_W = 320;
  const DESIGN_H = 570; // MOBILE_FEED_STANDARD portrait ratio; overflow-hidden crops height
  const scale = 48 / DESIGN_W; // fill width; overflow-hidden crops the height

  return (
    <div
      ref={boxRef}
      className="w-12 h-12 rounded-md border border-border overflow-hidden bg-white relative"
      title="Meta ad preview"
    >
      {src === null ? (
        <div className="w-12 h-12 bg-gray-400 animate-pulse" />
      ) : src === 'error' ? (
        fallbackImg ? (
          <img
            src={fallbackImg}
            alt="Ad preview"
            className="w-12 h-12 object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className="flex items-center justify-center w-12 h-12 text-muted-foreground text-xs">—</span>
        )
      ) : (
        <iframe
          src={src}
          title="Meta preview"
          tabIndex={-1}
          scrolling="no"
          loading="lazy"
          // Facebook's /previews embed needs same-origin access to render (the
          // full-size modal at ~line 2795 runs it with no sandbox at all). Without
          // allow-same-origin the FB preview script blanks. Keep it otherwise
          // locked down; pointer-events:none below makes it non-interactive.
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

// inert=true: visual-only (no click/overlay) — used when a parent wrapper owns hover/click.
// inert=false (default): standalone cell with its own click-to-open and ExternalLink overlay.
function VideoThumb({ videoUrl, inert = false }: { videoUrl: string; inert?: boolean }) {
  const [thumb, setThumb] = useState<string | null | 'pending'>(() => {
    if (_thumbCache.has(videoUrl)) return _thumbCache.get(videoUrl)!;
    const stored = _sGet(videoUrl);
    if (stored) { _thumbCache.set(videoUrl, stored); return stored; }
    return 'pending';
  });

  useEffect(() => {
    if (_thumbCache.has(videoUrl)) { setThumb(_thumbCache.get(videoUrl)!); return; }
    let live = true;
    _requestThumb(videoUrl, r => { if (live) setThumb(r); });
    return () => { live = false; };
  }, [videoUrl]);

  const open = () => window.open(videoUrl, '_blank', 'noopener,noreferrer');

  if (thumb === 'pending') {
    return <div className="w-12 h-12 rounded-md bg-gray-400 border border-border animate-pulse" />;
  }

  if (!thumb) {
    // Canvas extraction failed (CORS block or timeout — e.g. AppLovin's CDN).
    // Fall back to a native <video> first-frame, which renders without CORS.
    if (inert) {
      return (
        <video
          src={videoUrl}
          className="w-12 h-12 object-cover rounded-md border border-border"
          preload="metadata"
          muted
          playsInline
        />
      );
    }
    return (
      <div className="relative group w-12 h-12 cursor-pointer" onClick={open} title="Open video">
        <video
          src={videoUrl}
          className="w-12 h-12 object-cover rounded-md border border-border"
          preload="metadata"
          muted
          playsInline
        />
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 group-hover:bg-black/45 transition-colors">
          <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </div>
      </div>
    );
  }

  // Canvas frame extracted successfully
  if (inert) {
    return <img src={thumb} alt="Video preview" className="w-12 h-12 object-cover rounded-md border border-border" loading="lazy" />;
  }
  return (
    <div className="relative group w-12 h-12 cursor-pointer" onClick={open}>
      <img src={thumb} alt="Video preview" className="w-12 h-12 object-cover rounded-md border border-border" loading="lazy" />
      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-gray-400 group-hover:bg-black/45 transition-colors">
        <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
      </div>
    </div>
  );
}

function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  isMissingOption,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  isMissingOption?: (value: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filtered = options.filter((opt) => opt.toLowerCase().includes(normalizedSearch));
  const hasExactMatch = normalizedSearch
    ? options.some((opt) => opt.toLowerCase() === normalizedSearch)
    : false;

  const missingOpts = isMissingOption ? filtered.filter(isMissingOption) : [];
  const normalOpts  = isMissingOption ? filtered.filter((o) => !isMissingOption(o)) : filtered;
  const hasMissingOpts = missingOpts.length > 0;
  const hasNormalOpts  = normalOpts.length > 0;

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearchValue("");
  };

  const isMobile = useIsMobile();

  const triggerButton = (
    <Button
      variant="outline"
      className="h-9 w-full justify-between rounded-lg border-border bg-muted text-sm"
    >
      <span className={value ? "text-foreground" : "text-muted-foreground"}>
        {value || placeholder}
      </span>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-2 shrink-0" />
    </Button>
  );

  const commandBody = (
    <Command>
      <CommandInput
        placeholder={searchPlaceholder}
        value={searchValue}
        onValueChange={setSearchValue}
      />
      <CommandList className={cn(isMobile && "max-h-[55vh]")}>
        <CommandGroup>
          {value ? (
            <CommandItem
              onSelect={() => handleSelect("")}
              className={cn((!hasMissingOpts && hasNormalOpts) && "border-b border-gray-200", "cursor-pointer", isMobile && "py-2.5 text-base")}
            >
              Clear selection
            </CommandItem>
          ) : null}
          {normalizedSearch && !hasExactMatch ? (
            <CommandItem onSelect={() => handleSelect(searchValue.trim())} className={cn(isMobile && "py-2.5 text-base")}>
              Use "{searchValue.trim()}"
            </CommandItem>
          ) : null}
          {hasMissingOpts &&
            missingOpts.map((opt) => (
              <CommandItem
                key={`missing-${opt}`}
                onSelect={() => handleSelect(opt)}
                className={cn(
                  hasNormalOpts && "border-b border-gray-200",
                  "cursor-pointer",
                  isMobile && "py-2.5 text-base"
                )}
              >
                {opt}
              </CommandItem>
            ))
          }
        </CommandGroup>
        {filtered.length === 0 ? (
          <CommandEmpty>No options found.</CommandEmpty>
        ) : hasNormalOpts ? (
          <CommandGroup>
            {normalOpts.map((opt) => (
              <CommandItem key={opt} onSelect={() => handleSelect(opt)} className={cn(isMobile && "py-2.5 text-base")}>
                {opt}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );

  // Mobile: a bottom sheet so the searchable list is full-width, properly sized and tappable.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearchValue(""); }}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-auto max-h-[80vh] p-0 rounded-t-2xl flex flex-col gap-0"
          // Avoid auto-focusing the search field (and popping the mobile keyboard) on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-4 pt-4 pb-2 text-left">
            <SheetTitle className="text-base">{placeholder}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden border-t border-border">{commandBody}</div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: unchanged popover.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        {commandBody}
      </PopoverContent>
    </Popover>
  );
}

const localDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);

const EVENT_DATE_FLOOR  = localDate(2026, 2, 1);   // 2026-02-01 — first `eventDate` in the ads dataset
const LAUNCH_DATE_FLOOR = localDate(2025, 8, 11);  // 2025-08-11 — first ad launch date

const AdsPerformance = () => {
  const { getToken, user } = useAuth();

  const _today        = new Date();
  const toLocalDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
  };
  const _defaultStart = toLocalDateStr(new Date(_today.getFullYear(), _today.getMonth(), 1));
  const _defaultEnd   = _today.toISOString().split("T")[0];

  const canExport = user?.roles?.some((r) => ["Super Admin", "Admin", "Dev"].includes(r)) ||
                   user?.user_type?.some((t) => ["Super Admin", "Admin", "Dev"].includes(t));

  type PreviewState =
    | { kind: 'image'; url: string }
    | { kind: 'video'; url: string }
    | { kind: 'playable'; url: string }
    | { kind: 'meta'; status: 'loading' }
    | { kind: 'meta'; status: 'ready'; iframeHtml: string }
    | { kind: 'meta'; status: 'error'; message: string };
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [detailRow, setDetailRow] = useState<ApiAdRow | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  // Bumped every time a playable popup opens, so the popup iframe gets a fresh
  // mount + a cache-busted src — forcing the playable to re-load and replay
  // from the start each open (rather than resuming a prior/blank instance).
  const [playableNonce, setPlayableNonce] = useState(0);
  const isEditor = user?.custom_role_types?.some(
    (t) => t === "Editor" || t.endsWith("Editor")
  ) ?? false;

  const [gridHeight, setGridHeight] = useState(() => Math.max(1000, window.innerHeight - 200));

  useEffect(() => {
    const handler = () => setGridHeight(Math.max(1000, window.innerHeight - 200));
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const [isExporting,    setIsExporting]    = useState(false);
  const [brandFilter,    setBrandFilter]    = useState<string[]>([]);
  const [productFilter,  setProductFilter]  = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [search,         setSearch]         = useState("");
  const [page,           setPage]           = useState(1);
  const [pageSize,       setPageSize]       = useState(25);

  const [timeframeStart,  setTimeframeStart]  = useState(_defaultStart);
  const [timeframeEnd,    setTimeframeEnd]    = useState(_defaultEnd);
  const [launchStart,     setLaunchStart]     = useState("");
  const [launchEnd,       setLaunchEnd]       = useState("");
  const [adIdFilter,      setAdIdFilter]      = useState("");
  const [scriptIdFilter,  setScriptIdFilter]  = useState("");
  const [adNameFilter,    setAdNameFilter]    = useState("");
  const [formatFilter,    setFormatFilter]    = useState<string[]>([]);
  const [itNnFilter,      setItNnFilter]      = useState("all");
  const [csFilter,        setCsFilter]        = useState("");
  const [editorFilter,    setEditorFilter]    = useState("");
  const [rootCauseFilter, setRootCauseFilter] = useState<string[]>([]);
  const [mainPainFilter,  setMainPainFilter]  = useState<string[]>([]);
  const [ctaFilter,       setCtaFilter]       = useState<string[]>([]);
  const [angleFilter,     setAngleFilter]     = useState<string[]>([]);
  const [funnelFilter,    setFunnelFilter]    = useState<string[]>([]);
  const [adTypeFilter,    setAdTypeFilter]    = useState<string[]>([]);
  const [editTypeFilter,  setEditTypeFilter]  = useState("all");
  const [minRoas,         setMinRoas]         = useState("");
  const [showAdvanced,    setShowAdvanced]    = useState(false);

  const filtersPayload = useMemo(() => {
    const minRoasTrimmed = minRoas.trim();
    const minRoasValue = minRoasTrimmed ? Number(minRoasTrimmed) : undefined;

    return {
      platform: platformFilter !== "all" ? platformFilter : undefined,
      search: search.trim() || undefined,
      launchDate: (launchStart || launchEnd) ? {
        startDate: launchStart || undefined,
        endDate: launchEnd || undefined,
      } : undefined,
      adId: adIdFilter.trim() || undefined,
      scriptId: scriptIdFilter.trim() || undefined,
      adName: adNameFilter.trim() || undefined,
      format: formatFilter.length > 0 ? formatFilter : undefined,
      itOrNn: itNnFilter !== "all" ? itNnFilter : undefined,
      cs: csFilter.trim() || undefined,
      editor: editorFilter.trim() || undefined,
      rootCauses: rootCauseFilter.length > 0 ? rootCauseFilter : undefined,
      mainPainPoints: mainPainFilter.length > 0 ? mainPainFilter : undefined,
      ctaThemes: ctaFilter.length > 0 ? ctaFilter : undefined,
      angles: angleFilter.length > 0 ? angleFilter : undefined,
      funnels: funnelFilter.length > 0 ? funnelFilter : undefined,
      adTypes: adTypeFilter.length > 0 ? adTypeFilter : undefined,
      editType: editTypeFilter !== "all" ? editTypeFilter : undefined,
      minRoas: minRoasValue !== undefined && Number.isFinite(minRoasValue) ? minRoasValue : undefined,
    };
  }, [
    platformFilter,
    search,
    launchStart,
    launchEnd,
    adIdFilter,
    scriptIdFilter,
    adNameFilter,
    formatFilter,
    itNnFilter,
    csFilter,
    editorFilter,
    rootCauseFilter,
    mainPainFilter,
    ctaFilter,
    angleFilter,
    funnelFilter,
    adTypeFilter,
    editTypeFilter,
    minRoas,
  ]);

  const pipelineBase = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;

  const { data: brands = [] } = useQuery({
    queryKey: ["ads-perf-brands"],
    queryFn: async () => {
      // scope=all — Ads Performance shows EVERY brand in the Brand filter (Task
      // 86car1ybp), unlike other pages which call /api/brands without this param
      // and keep the user's own brands only.
      const res = await fetch(`${pipelineBase}/api/brands?scope=all`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch brands");
      return (json.data ?? []) as BrandOption[];
    },
    refetchOnWindowFocus: false,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["ads-perf-products"],
    queryFn: async () => {
      // scope=all — Ads Performance lists products for EVERY brand (Task
      // 86car1ybp), matching the all-brands Brand filter above. Other pages call
      // /api/products without this param and keep the user's own products only.
      const res = await fetch(`${pipelineBase}/api/products?scope=all`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch products");
      return (json.data ?? []) as ProductOption[];
    },
    refetchOnWindowFocus: false,
  });

  const filteredProducts = useMemo(() => {
    if (brandFilter.length === 0) return products;
    const brandIds = new Set(
      brands.filter((b) => brandFilter.includes(b.name)).map((b) => b.id)
    );
    return products.filter((p) => p.brand_id && brandIds.has(p.brand_id));
  }, [brandFilter, brands, products]);

  // True when the user has explicitly selected every available option — treat as "no filter"
  // to avoid excluding ads whose brand/product column is null or has a slight name mismatch.
  const isAllBrandsSelected = brands.length > 0 && brandFilter.length >= brands.length;
  const isAllProductsSelected = filteredProducts.length > 0 && productFilter.length >= filteredProducts.length;

  useEffect(() => {
    if (brandFilter.length === 0) return;
    if (productFilter.length === 0) return;
    const validNames = new Set(filteredProducts.map((p) => p.name));
    const validSelection = productFilter.filter((p) => validNames.has(p));
    if (validSelection.length !== productFilter.length) setProductFilter(validSelection);
  }, [brandFilter, filteredProducts, productFilter]);

  // Disabled (per request): selecting a Product no longer auto-selects its Brand —
  // matches Pipeline Report's behavior. Uncomment the block below to restore it.
  // const brandFilterRef = useRef(brandFilter);
  // brandFilterRef.current = brandFilter;
  //
  // useEffect(() => {
  //   if (brandFilterRef.current.length > 0 || productFilter.length === 0 || products.length === 0) return;
  //   const brandIds = new Set(
  //     productFilter
  //       .map((pName) => products.find((p) => p.name === pName)?.brand_id)
  //       .filter((id): id is string => Boolean(id))
  //   );
  //   if (brandIds.size === 1) {
  //     const brand = brands.find((b) => b.id === [...brandIds][0]);
  //     if (brand) setBrandFilter([brand.name]);
  //   }
  //   // brandFilter intentionally read via ref — effect should only fire when productFilter changes
  // }, [productFilter, products, brands]);

  useEffect(() => {
    const mainEl = document.querySelector('main') as HTMLElement | null;
    if (mainEl) {
      mainEl.style.minWidth = '0';
      mainEl.style.overflowX = 'hidden';
    }
    return () => {
      if (mainEl) {
        mainEl.style.minWidth = '';
        mainEl.style.overflowX = '';
      }
    };
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const payload: Record<string, unknown> = {
        eventDate: { startDate: timeframeStart, endDate: timeframeEnd },
        filters: filtersPayload,
        pagination: { exportAll: true },
      };
      if (brandFilter.length > 0 && !isAllBrandsSelected) payload.brands = brandFilter;
      if (productFilter.length > 0 && !isAllProductsSelected) payload.products = productFilter;

      const pipelineBaseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
      const res = await fetch(`${pipelineBaseUrl}/api/ads-performance-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Export failed");

      const rows: ApiAdRow[] = json.data ?? [];
      if (rows.length === 0) { toast.info("No data to export."); return; }

      const sheetRows = rows.map((r) => ({
        "Preview":        r.adVideoURL || r.adImageURL || "",
        "Platform":       r.channel ?? "",
        "Ad ID":          r.ad_id ?? "",
        "Script ID":      r.script_id ?? "",
        "Launch Date":    r.launch_date_meta || r.launch_date_applovin || "",
        "Campaign Name":  r.campaignName ?? "",
        "Creative Set":   r.adsetName ?? "",
        "Ad Name":        r.adName ?? "",
        "Concept Name":   r.concept_name ?? "",
        "CS":             r.cs ?? "",
        "Editor":         r.editor ?? "",
        "Edit Type":      r.edit_type ?? "",
        "Format":         r.ad_format ?? "",
        "Funnel":         r.funnel ?? "",
        "CTA":            r.cta ?? "",
        "IT/NN":          r.it_or_nn ?? "",
        "Ad Length":      "",
        "Ad Source Link": "",
        "ClickUp":        r.clickup_link ?? "",
        "Points":         "",
        "Brief":          "",
        "Spend":          Number((r.spend ?? 0).toFixed(2)),
        "Revenue":        Number((r.ncRevenue ?? 0).toFixed(2)),
        "ncROAS":         Number((r.ncROAS ?? 0).toFixed(2)),
        "ncCPA":          Number((r.ncCPA ?? 0).toFixed(2)),
        "ncAOV":          Number((r.ncAOV ?? 0).toFixed(2)),
        "CPC (Out)":      Number((r.OCPC ?? 0).toFixed(2)),
        "CTR (Out)":      Number((r.OCTR ?? 0).toFixed(2)),
        "ncCVR":          Number((r.ncCVR ?? 0).toFixed(2)),
        "Clicks":         r.clicks ?? 0,
        "Purchases":      r.orders ?? 0,
        "CPM":            Number((r.CPM ?? 0).toFixed(2)),
        "Hook Rate":      "",
        "Hold Rate":      "",
        "Notes":          "",
      }));

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ads Performance");
      const fileName = `ads-performance_${timeframeStart}_${timeframeEnd}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Exported ${rows.length} rows.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const adsQuery = useQuery({
    queryKey: [
      "ads-performance",
      brandFilter,
      productFilter,
      timeframeStart,
      timeframeEnd,
      filtersPayload,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const payload: Record<string, unknown> = {
        eventDate: { startDate: timeframeStart, endDate: timeframeEnd },
        filters: filtersPayload,
        pagination: { page, pageSize },
      };

      if (brandFilter.length > 0 && !isAllBrandsSelected) payload.brands = brandFilter;
      if (productFilter.length > 0 && !isAllProductsSelected) payload.products = productFilter;

      const pipelineBaseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
      const res = await fetch(`${pipelineBaseUrl}/api/ads-performance-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Failed to fetch ads performance data.");
      }

      return json as {
        data: ApiAdRow[];
        total: number;
        totals?: AdTotals;
        options?: {
          adIds?: string[];
          scriptIds?: string[];
          formats?: string[];
          cs?: string[];
          editors?: string[];
          rootCauses?: string[];
          mainPainPoints?: string[];
        };
        message?: string;
      };
    },
    enabled: Boolean(timeframeStart && timeframeEnd),
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previous) => previous,
  });

  const apiData  = useMemo(
    () => (adsQuery.data?.data ?? []).map((row, i) => ({ ...row, _rowId: `row-${i}` })),
    [adsQuery.data?.data],
  );
  const apiTotal = adsQuery.data?.total ?? 0;
  const isFetching = adsQuery.isFetching;

  const pinnedTotalsRow = useMemo(() => {
    const t = adsQuery.data?.totals;
    if (!t) return undefined;
    return {
      _isPinnedTotals: true,
      concept_name: 'Total',
      metaSpend:     t.metaSpend,
      applovinSpend: t.applovinSpend,
      spend:     t.spend,
      ncRevenue: t.ncRevenue,
      ncROAS:    t.ncROAS,
      ncCPA:     t.ncCPA,
      ncAOV:     t.ncAOV,
      OCPC:      t.OCPC,
      OCTR:      t.OCTR,
      ncCVR:     t.ncCVR,
      clicks:    t.clicks,
      orders:    t.orders,
      CPM:       t.CPM,
      nvPct:     t.nvPct,
      metaROAS:     t.metaROAS,
      metaCPA:      t.metaCPA,
      metaCPC:      t.metaCPC,
      metaCPCOut:   t.metaCPCOut,
      metaCTR:      t.metaCTR,
      metaConvRate: t.metaConvRate,
      applovinROAS:     t.applovinROAS,
      applovinCPA:      t.applovinCPA,
      applovinCPC:      t.applovinCPC,
      applovinCTR:      t.applovinCTR,
      applovinConvRate: t.applovinConvRate,
    } as Record<string, unknown>;
  }, [adsQuery.data?.totals]);

  useEffect(() => {
    if (adsQuery.error) {
      toast.error(adsQuery.error instanceof Error ? adsQuery.error.message : "Failed to fetch ads performance data.");
    }
  }, [adsQuery.error]);

  const adOptionsQuery = useQuery({
    queryKey: [
      "ad-options",
      brandFilter,
      productFilter,
      platformFilter,
      formatFilter,
      itNnFilter,
      csFilter,
      editorFilter,
      rootCauseFilter,
      mainPainFilter,
      funnelFilter,
      adTypeFilter,
    ],
    queryFn: async () => {
     const pipelineBaseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
     const res = await fetch(`${pipelineBaseUrl}/api/ad-options`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          brands: brandFilter.length > 0 && !isAllBrandsSelected ? brandFilter : undefined,
          products: productFilter.length > 0 && !isAllProductsSelected ? productFilter : undefined,
          platform: platformFilter !== "all" ? platformFilter : undefined,
          format: formatFilter.length > 0 ? formatFilter : undefined,
          itOrNn: itNnFilter !== "all" ? itNnFilter : undefined,
          mainPains: mainPainFilter.length > 0 ? mainPainFilter : undefined,
          cs: csFilter.trim() || undefined,
          editor: editorFilter.trim() || undefined,
          rootCauses: rootCauseFilter.length > 0 ? rootCauseFilter : undefined,
          funnels: funnelFilter.length > 0 ? funnelFilter : undefined,
          adTypes: adTypeFilter.length > 0 ? adTypeFilter : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Failed to fetch ad options.");
      }
      return (json.data ?? { adIds: [], scriptIds: [], funnels: [], adTypes: [] }) as {
        adIds: string[];
        scriptIds: string[];
        funnels?: string[];
        adTypes?: string[];
      };
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 60 * 1000,
  });

  const uniqueAdIds     = useMemo(() => {
    const fromApi = adOptionsQuery.data?.adIds ?? [];
    return fromApi.length > 0 ? fromApi : [...new Set(apiData.map((r) => String(r.ad_id)).filter(Boolean))].sort();
  }, [adOptionsQuery.data?.adIds, apiData]);

  const uniqueScriptIds = useMemo(() => {
    const fromApi = adOptionsQuery.data?.scriptIds ?? [];
    return fromApi.length > 0 ? fromApi : [...new Set(apiData.map((r) => r.script_id).filter(Boolean))].sort();
  }, [adOptionsQuery.data?.scriptIds, apiData]);

  const { data: customFieldOptions } = useQuery({
    queryKey: ["custom-field-options", productFilter],
    queryFn: async () => {
      const pipelineBaseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
      const params = productFilter.length > 0
        ? `?products=${productFilter.map(encodeURIComponent).join(',')}`
        : '';
      const res = await fetch(`${pipelineBaseUrl}/api/custom-field-options${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Failed to fetch custom field options.");
      }
      return json.data as {
        ad_format: { label: string; value: string }[];
        root_cause: { label: string; value: string }[];
        main_pain_point: { label: string; value: string }[];
        funnel: { label: string; value: string }[];
        ad_type: { label: string; value: string }[];
        cta: { label: string; value: string }[];
        angle: { label: string; value: string }[];
      };
    },
    refetchOnWindowFocus: false,
  });

  const selectedBrandId = useMemo(() => {
    if (brandFilter.length !== 1) return null;
    return brands.find((b) => b.name === brandFilter[0])?.id ?? null;
  }, [brands, brandFilter]);

  const { data: csEditorOptions } = useQuery({
    queryKey: ["ads-cs-editor-options", selectedBrandId],
    queryFn: async () => {
      const pipelineBaseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
      const url = new URL(`${pipelineBaseUrl}/api/cs-editor-options`);
      if (selectedBrandId) url.searchParams.set("brandId", selectedBrandId);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Failed to fetch CS/Editor options.");
      }
      return json.data as { cs: string[]; editors: string[] };
    },
    refetchOnWindowFocus: false,
  });

  const uniqueFormats    = useMemo(
    () => [...new Set(apiData.map((r) => r.ad_format).filter(Boolean))].sort(),
    [apiData]
  );
  const uniqueCS      = csEditorOptions?.cs ?? [];
  const uniqueEditors = csEditorOptions?.editors ?? [];
  const uniqueRootCauses = useMemo(
    () => [...new Set(apiData.map((r) => r.root_cause).filter(Boolean))].sort() as string[],
    [apiData]
  );
  const uniqueMainPains  = useMemo(
    () => [...new Set(apiData.map((r) => r.main_pain_point).filter(Boolean))].sort() as string[],
    [apiData]
  );
  const uniqueCtas       = useMemo(
    () => [...new Set(apiData.map((r) => r.cta).filter(Boolean))].sort() as string[],
    [apiData]
  );
  const uniqueAngles     = useMemo(
    () => [...new Set(apiData.map((r) => r.sub_angle).filter(Boolean))].sort() as string[],
    [apiData]
  );

  const funnelOptions = useMemo(() => {
    const fromApi = customFieldOptions?.funnel ?? [];
    const labels = fromApi.length > 0
      ? Array.from(new Set(fromApi.map((opt) => opt.label).filter(Boolean)))
      : (adOptionsQuery.data?.funnels ?? []);
    return labels.map((v) => ({ value: v, label: v }));
  }, [customFieldOptions?.funnel, adOptionsQuery.data?.funnels]);

  const adTypeOptions = useMemo(() => {
    const fromApi = customFieldOptions?.ad_type ?? [];
    const labels = fromApi.length > 0
      ? Array.from(new Set(fromApi.map((opt) => opt.label).filter(Boolean)))
      : (adOptionsQuery.data?.adTypes ?? []);
    return labels.map((v) => ({ value: v, label: v }));
  }, [customFieldOptions?.ad_type, adOptionsQuery.data?.adTypes]);

  const productSelectOptions = useMemo(
    () => filteredProducts.map((p) => ({ value: p.name, label: p.name })),
    [filteredProducts]
  );

  const formatOptionLabels = useMemo(() => {
    const fromApi = customFieldOptions?.ad_format ?? [];
    if (fromApi.length > 0) {
      return Array.from(new Set(fromApi.map((opt) => opt.label).filter(Boolean)));
    }
    return uniqueFormats;
  }, [customFieldOptions?.ad_format, uniqueFormats]);

  const formatOptions = useMemo(
    () => formatOptionLabels.map((value) => ({ value, label: value })),
    [formatOptionLabels]
  );

  const rootCauseOptions = useMemo(() => {
    const fromApi = customFieldOptions?.root_cause ?? [];
    if (fromApi.length > 0) return fromApi;
    return uniqueRootCauses.map((value) => ({ value, label: value }));
  }, [customFieldOptions?.root_cause, uniqueRootCauses]);

  const mainPainOptions = useMemo(() => {
    const fromApi = customFieldOptions?.main_pain_point ?? [];
    if (fromApi.length > 0) return fromApi;
    return uniqueMainPains.map((value) => ({ value, label: value }));
  }, [customFieldOptions?.main_pain_point, uniqueMainPains]);

  const ctaOptions = useMemo(() => {
    const fromApi = customFieldOptions?.cta ?? [];
    if (fromApi.length > 0) return fromApi;
    return uniqueCtas.map((value) => ({ value, label: value }));
  }, [customFieldOptions?.cta, uniqueCtas]);

  const angleOptions = useMemo(() => {
    const fromApi = customFieldOptions?.angle ?? [];
    if (fromApi.length > 0) return fromApi;
    return uniqueAngles.map((value) => ({ value, label: value }));
  }, [customFieldOptions?.angle, uniqueAngles]);

  const clearFilters = () => {
    setBrandFilter([]);
    setProductFilter([]);
    setSearch("");
    setPlatformFilter("all");
    setTimeframeStart(_defaultStart); setTimeframeEnd(_defaultEnd);
    setLaunchStart(""); setLaunchEnd("");
    setAdIdFilter(""); setScriptIdFilter(""); setAdNameFilter("");
    setFormatFilter([]); setItNnFilter("all");
    setCsFilter(""); setEditorFilter("");
    setRootCauseFilter([]); setMainPainFilter([]);
    setCtaFilter([]); setAngleFilter([]);
    setFunnelFilter([]); setAdTypeFilter([]);
    setEditTypeFilter("all");
    setMinRoas("");
  };

  const hasActiveFilters =
    brandFilter.length > 0 || productFilter.length > 0 ||
    search || platformFilter !== "all" ||
    timeframeStart || timeframeEnd || launchStart || launchEnd ||
    adIdFilter || scriptIdFilter || adNameFilter ||
    formatFilter.length > 0 || itNnFilter !== "all" ||
    csFilter || editorFilter ||
    rootCauseFilter.length > 0 || mainPainFilter.length > 0 ||
    ctaFilter.length > 0 || angleFilter.length > 0 ||
    funnelFilter.length > 0 || adTypeFilter.length > 0 ||
    editTypeFilter !== "all" || minRoas;

  useEffect(() => {
    setPage(1);
  }, [filtersPayload, pageSize, brandFilter, productFilter, timeframeStart, timeframeEnd, funnelFilter, adTypeFilter]);

  const getRowIdFn = useCallback((params: GetRowIdParams<Record<string, unknown>>) => {
    return params.data._rowId as string;
  }, []);

  // ── AG Grid column definitions ───────────────────────────────────────────
  const perfColumns = useMemo((): (ColDef | ColGroupDef)[] => [
    {
      headerName: 'AD INFO',
      marryChildren: true,
      children: [
        {
          colId: 'launch_date',
          headerName: 'Launch Date',
          pinned: 'left' as const,
          lockPinned: true,
          width: 110,
          minWidth: 90,
          sortable: false,
          valueGetter: (p) => {
            const row = p.data as ApiAdRow;
            return row?.launch_date_meta || row?.launch_date_applovin || '—';
          },
        },
        {
          colId: 'preview',
          headerName: 'Preview',
          pinned: 'left' as const,
          lockPinned: true,
          width: 84,
          minWidth: 68,
          sortable: false,
          cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
          cellRenderer: (params: ICellRendererParams) => {
            const row = params.data as ApiAdRow;
            const hasImage   = !!row?.adImageURL;
            const isVideoAd  = !!row?.adVideoURL;
            const isPlayable = isVideoAd && isPlayableUrl(row?.adVideoURL);
            const isMeta     = row?.channel === 'Meta';

            const validFb = !!row?.fb_ad_id && /^\d{6,}$/.test(String(row.fb_ad_id));
            const isRealVideoFile = isVideoAd && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(row.adVideoURL || ''));
            // Use the live Meta preview iframe when: Meta ad, valid numeric fb_ad_id, and there is
            // NO already-playable asset (not an AppLovin .raw/.html playable, not a real hosted video file).
            const useMetaIframe = isMeta && validFb && !isPlayable && !isRealVideoFile;

            if (!isVideoAd && !hasImage && !useMetaIframe)
              return <span className="text-muted-foreground text-xs">—</span>;

            // Thumbnail priority: adVideoURL FIRST (playable tile for AppLovin HTML5
            // playables, else canvas-extracted video frame), and only fall back to the
            // adImageURL <img> when there is no video. inert=true → no click/overlay on
            // VideoThumb; parent wrapper owns interaction.
            const thumbnailEl = useMetaIframe ? (
              <MetaThumb fbAdId={String(row.fb_ad_id)} fallbackImg={row.adImageURL} />
            ) : isVideoAd ? (
              isPlayable ? (
                <PlayableThumb url={row.adVideoURL!} />
              ) : (
                <VideoThumb videoUrl={row.adVideoURL!} inert />
              )
            ) : (
              <img
                src={row.adImageURL!}
                alt="Ad preview"
                className="w-12 h-12 object-cover rounded-md border border-border"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                loading="lazy"
              />
            );

            // Meta Graph API iframe modal (shared by real-video Meta rows and the new
            // useMetaIframe rows). Same fetch block as before, just hoisted so both
            // eye-click paths reuse it.
            const openMetaModal = () => {
              setPreviewState({ kind: 'meta', status: 'loading' });
              const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
              fetch(`${baseUrl}/api/ads/meta-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ fb_ad_id: row.fb_ad_id }),
              })
                .then((r) => r.json())
                .then((json) => {
                  if (json.success) {
                    setIframeLoading(true);
                    setPreviewState({ kind: 'meta', status: 'ready', iframeHtml: json.iframeHtml });
                  } else {
                    setPreviewState({ kind: 'meta', status: 'error', message: json.error || 'Preview unavailable' });
                  }
                })
                .catch(() => setPreviewState({ kind: 'meta', status: 'error', message: 'Network error' }));
            };

            const handleEyeClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (isPlayable) {
                setIframeLoading(true);
                setPlayableNonce((n) => n + 1);
                setPreviewState({ kind: 'playable', url: row.adVideoURL! });
              } else if (useMetaIframe) {
                // Live Meta preview cell → open the full Meta iframe modal.
                openMetaModal();
              } else if (isVideoAd) {
                // Video ad — Meta uses Graph API iframe, AppLovin plays inline
                if (isMeta && row.fb_ad_id) {
                  openMetaModal();
                } else {
                  setPreviewState({ kind: 'video', url: row.adVideoURL! });
                }
              } else {
                // Image-only ad
                setPreviewState({ kind: 'image', url: row.adImageURL! });
              }
            };

            const handleExternalClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              // useMetaIframe rows may have no direct asset URL (Meta preview is iframe-only) —
              // fall back to the eye/modal instead of opening "null".
              const extUrl = isVideoAd ? row.adVideoURL : row.adImageURL;
              if (extUrl) {
                window.open(extUrl, '_blank', 'noopener,noreferrer');
              } else if (useMetaIframe) {
                openMetaModal();
              }
            };

            // Hide eye for Meta video ads with no fb_ad_id (no preview available)
            const showEye = !(isVideoAd && isMeta && !row.fb_ad_id);

            return (
              <div className="relative group w-12 h-12">
                {thumbnailEl}
                <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-black/0 group-hover:bg-black/45 transition-colors">
                  {showEye && (
                    <button
                      type="button"
                      onClick={handleEyeClick}
                      className="text-white opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4 drop-shadow" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExternalClick}
                    className="text-white opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4 drop-shadow" />
                  </button>
                </div>
              </div>
            );
          },
        },
        {
          colId: 'channel',
          headerName: 'Platform',
          field: 'channel',
          pinned: 'left' as const,
          lockPinned: true,
          width: 110,
          minWidth: 90,
          cellRenderer: (params: ICellRendererParams) => {
            const channel = String(params.value || '—');
            return (
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                PLATFORM_STYLES[channel] ?? 'bg-muted text-muted-foreground border border-border',
              )}>
                {channel}
              </span>
            );
          },
        },
        {
          colId: 'ad_id',
          headerName: 'Ad ID',
          field: 'ad_id',
          pinned: 'left' as const,
          lockPinned: true,
          width: 90,
          minWidth: 70,
          cellRenderer: (params: ICellRendererParams) => (
            <span className="font-mono text-xs text-muted-foreground">{params.value ?? '—'}</span>
          ),
        },
        {
          colId: 'concept_name',
          headerName: 'Concept Name',
          field: 'concept_name',
          pinned: 'left' as const,
          lockPinned: true,
          width: 150,
          minWidth: 100,
          tooltipField: 'concept_name',
          valueFormatter: (p) => p.value || '—',
        },
        {
          colId: 'ad_format',
          headerName: 'Ad Format',
          field: 'ad_format',
          pinned: 'left' as const,
          lockPinned: true,
          width: 100,
          minWidth: 80,
          valueFormatter: (p) => p.value || '—',
        },
        {
          colId: 'sub_angle',
          headerName: 'Angle',
          field: 'sub_angle',
          pinned: 'left' as const,
          lockPinned: true,
          width: 130,
          minWidth: 90,
          sortable: false,
          valueFormatter: (p) => p.value || '—',
        },
        {
          colId: 'sub_angle_detail',
          headerName: 'Sub-Angle',
          field: 'sub_angle_detail',
          pinned: 'left' as const,
          lockPinned: true,
          width: 130,
          minWidth: 90,
          sortable: false,
          valueFormatter: (p) => p.value || '—',
        },
        {
          colId: 'cta',
          headerName: 'CTA',
          field: 'cta',
          pinned: 'left' as const,
          lockPinned: true,
          width: 90,
          minWidth: 70,
          sortable: false,
          // Read-only here — CTA is edited only on the Ads DB page.
          cellRenderer: (params: ICellRendererParams) => {
            const cta = params.value as string;
            if (!cta) return <span className="text-muted-foreground text-xs">—</span>;
            return (
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold', CTA_STYLES[cta] ?? 'bg-muted text-muted-foreground')}>
                {cta}
              </span>
            );
          },
        },
      ],
    },
    {
      headerName: 'Performance',
      marryChildren: true,
      children: [
        { colId: 'spend',     headerName: 'Spend',     field: 'spend',     width: 105, minWidth: 80, valueFormatter: (p) => fmt.currency(p.value ?? 0) },
        { colId: 'ncRevenue', headerName: 'Revenue',   field: 'ncRevenue', width: 105, minWidth: 80, valueFormatter: (p) => fmt.currency(p.value ?? 0) },
        {
          colId: 'ncROAS',
          headerName: 'ncROAS',
          field: 'ncROAS',
          width: 90,
          minWidth: 70,
          hide: isEditor,
          cellRenderer: (params: ICellRendererParams) => (
            <span className={roasColor(params.value ?? 0)}>{fmt.int(params.value ?? 0)}</span>
          ),
        },
        { colId: 'ncCPA',  headerName: 'ncCPA',     field: 'ncCPA',  width: 100, minWidth: 80, valueFormatter: (p) => fmt.currency(p.value ?? 0) },
        { colId: 'ncAOV',  headerName: 'ncAOV',     field: 'ncAOV',  width: 100, minWidth: 80, hide: isEditor, valueFormatter: (p) => fmt.currency(p.value ?? 0) },
        { colId: 'OCPC',   headerName: 'CPC (Out)', field: 'OCPC',   width: 100, minWidth: 80, valueFormatter: (p) => fmt.currency(p.value ?? 0) },
        { colId: 'OCTR',   headerName: 'CTR (Out)', field: 'OCTR',   width: 95,  minWidth: 75, valueFormatter: (p) => fmt.pct(p.value ?? 0) },
        { colId: 'ncCVR',  headerName: 'ncCVR',     field: 'ncCVR',  width: 85,  minWidth: 70, valueFormatter: (p) => fmt.pct(p.value ?? 0) },
        { colId: 'clicks', headerName: 'Clicks',    field: 'clicks', width: 80,  minWidth: 60, valueFormatter: (p) => fmt.int(p.value ?? 0) },
        { colId: 'orders', headerName: 'Purchases', field: 'orders', width: 95,  minWidth: 70, valueFormatter: (p) => fmt.int(p.value ?? 0) },
        { colId: 'CPM',    headerName: 'CPM',       field: 'CPM',    width: 95,  minWidth: 70, valueFormatter: (p) => fmt.currency(p.value ?? 0) },
        { colId: 'nvPct',  headerName: 'NV%',       field: 'nvPct',  width: 85,  minWidth: 70, valueFormatter: (p) => fmt.pct(p.value ?? 0) },
        { colId: 'hook_rate', headerName: 'Hook Rate', width: 95, minWidth: 70, sortable: false, valueGetter: () => '—' },
        { colId: 'hold_rate', headerName: 'Hold Rate', width: 95, minWidth: 70, sortable: false, valueGetter: () => '—' },
      ],
    },
    {
      headerName: 'Additional Info',
      marryChildren: true,
      children: [
        { colId: 'campaignName', headerName: 'Campaign Name', field: 'campaignName', width: 160, minWidth: 100, tooltipField: 'campaignName', valueFormatter: (p) => p.value || '—' },
        { colId: 'adsetName',    headerName: 'Creative Set',  field: 'adsetName',    width: 130, minWidth: 90,  tooltipField: 'adsetName',    valueFormatter: (p) => p.value || '—' },
        { colId: 'adName',       headerName: 'Ad Name',       field: 'adName',       width: 150, minWidth: 100, tooltipField: 'adName',       valueFormatter: (p) => p.value || '—' },
        { colId: 'ad_type',      headerName: 'Ad Type',       field: 'ad_type',      width: 90,  minWidth: 70,  sortable: false, valueFormatter: (p) => p.value || '—' },
        {
          colId: 'funnel',
          headerName: 'Funnel',
          field: 'funnel',
          width: 110,
          minWidth: 80,
          cellRenderer: (params: ICellRendererParams) => {
            const funnel = params.value as string;
            if (!funnel) return <span className="text-muted-foreground text-xs">—</span>;
            return (
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold', FUNNEL_STYLES[funnel] ?? 'bg-muted text-muted-foreground')}>
                {funnel}
              </span>
            );
          },
        },
        {
          colId: 'script_id',
          headerName: 'Script ID',
          field: 'script_id',
          width: 100,
          minWidth: 80,
          cellRenderer: (params: ICellRendererParams) => (
            <span className="font-mono text-xs text-muted-foreground">{params.value || '—'}</span>
          ),
        },
        { colId: 'cs',         headerName: 'CS',         field: 'cs',         width: 100, minWidth: 70, valueFormatter: (p) => p.value || '—' },
        { colId: 'editor',     headerName: 'Editor',     field: 'editor',     width: 100, minWidth: 70, valueFormatter: (p) => p.value || '—' },
        { colId: 'root_cause', headerName: 'Root Cause', field: 'root_cause', width: 130, minWidth: 90, sortable: false, valueFormatter: (p) => p.value || '—' },
        { colId: 'main_pain_point', headerName: 'Main Pains', field: 'main_pain_point', width: 130, minWidth: 90, sortable: false, valueFormatter: (p) => p.value || '—' },
        {
          colId: 'it_or_nn',
          headerName: 'IT/NN',
          field: 'it_or_nn',
          width: 80,
          minWidth: 60,
          cellRenderer: (params: ICellRendererParams) => {
            const val = params.value as string;
            if (!val) return <span className="text-muted-foreground text-xs">—</span>;
            return <Badge variant={val === 'IT' ? 'default' : 'secondary'} className="text-xs">{val}</Badge>;
          },
        },
        {
          colId: 'edit_type',
          headerName: 'Edit Type',
          field: 'edit_type',
          width: 120,
          minWidth: 90,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) => {
            const val = params.value as string;
            if (!val) return <span className="text-muted-foreground text-xs">—</span>;
            return <Badge variant={val === 'Self-Edited' ? 'default' : 'secondary'} className="text-xs">{val}</Badge>;
          },
        },
        { colId: 'ad_length',
          headerName: 'Ad Length',
          field: 'ad_length',
          width: 95,  
          minWidth: 70, 
          sortable: false, 
          cellRenderer: (params: ICellRendererParams) => {
            const val = params.value as string;
            if (!val) return <span className="text-muted-foreground text-xs">—</span>;
            return <Badge variant={val === 'IT' ? 'default' : 'secondary'} className="text-xs">{val}</Badge>;
          }
        },
        { colId: 'ad_source',
          headerName: 'Ad Source Link',
          field: 'ad_source_link',
          width: 130,
          minWidth: 90,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) => {
            const link = params.value as string;
            if (!link) return <span className="text-muted-foreground text-xs">—</span>;
            return (
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" />Source
              </a>
            );
          },
        },
        {
          colId: 'clickup_link',
          headerName: 'ClickUp',
          field: 'clickup_link',
          width: 90,
          minWidth: 70,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) => {
            const link = params.value as string;
            if (!link) return <span className="text-muted-foreground text-xs">—</span>;
            return (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" />Task
              </a>
            );
          },
        },
        {
          colId: 'points',
          headerName: 'Points',
          field: 'points',
          width: 80,
          minWidth: 60,
          sortable: false,
          valueFormatter: (p) => (p.value != null && p.value !== '') ? String(p.value) : '—',
        },
        {
          colId: 'brief',
          headerName: 'Brief',
          field: 'brief',
          width: 100,
          minWidth: 70,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) => {
            const link = params.value as string;
            if (!link) return <span className="text-muted-foreground text-xs">—</span>;
            return (
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" />Brief
              </a>
            );
          },
        },
        {
          colId: 'breakdown',
          headerName: 'Ad Analyzer Breakdown',
          field: 'breakdown_ready',
          width: 170,
          minWidth: 130,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) => {
            const row = params.data as ApiAdRow;
            const ready = !!row?.breakdown_ready;
            if (!ready) {
              return (
                <span className="text-muted-foreground text-xs" title="No breakdown yet (not launched or still processing)">
                  —
                </span>
              );
            }
            const onDownload = async () => {
              try {
                if (!row.breakdown_url) throw new Error('No breakdown available');
                const res = await fetch(row.breakdown_url);
                if (!res.ok) throw new Error(`Download failed (${res.status})`);
                const blob = await res.blob();
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objectUrl;
                const base = (row.adName || row.adsetName || 'ad-analyzer-breakdown')
                  .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
                a.download = `${base}.md`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Download failed');
              }
            };
            const onReanalyze = async () => {
              const isApplovin = row.channel === 'Applovin';
              const body = isApplovin
                ? { creativeSetId: row.creative_set_id }
                : { metaAdId: row.fb_ad_id };
              if (!body.creativeSetId && !body.metaAdId) {
                toast.error('No ID available for re-analysis');
                return;
              }
              const toastId = toast.loading('Queuing re-analysis...');
              try {
                const res = await fetch(`${pipelineBase}/api/ads/breakdown/reanalyze`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                  body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(`Re-analyze failed (${res.status})`);
                toast.success('Re-analysis started — ready in ~2 min', { id: toastId });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Re-analyze failed', { id: toastId });
              }
            };
            return (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDownload}
                  title="Download Ad Analyzer Breakdown"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  <Download className="w-3.5 h-3.5" />Breakdown
                </button>
                <button
                  type="button"
                  onClick={onReanalyze}
                  title="Force re-analyze"
                  className="text-muted-foreground hover:text-indigo-600 transition-colors">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </span>
            );
          },
        },
        {
          colId: 'notes',
          headerName: 'Notes',
          field: 'notes',
          width: 80,
          minWidth: 60,
          sortable: false,
          valueFormatter: (p) => (p.value != null && p.value !== '') ? String(p.value) : '—',
        },
      ],
    },
    {
      headerName: 'Trends',
      marryChildren: true,
      children: [
        {
          colId: 'todaySpend',
          headerName: 'Today Spend',
          field: 'todaySpend',
          width: 115,
          minWidth: 85,
          sortable: false,
          valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—',
        },
        {
          colId: 'todayNcROAS',
          headerName: 'Today ncROAS',
          field: 'todayNcROAS',
          width: 120,
          minWidth: 90,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.int(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
        {
          colId: 'yesterdaySpend',
          headerName: 'Yesterday Spend',
          field: 'yesterdaySpend',
          width: 130,
          minWidth: 95,
          sortable: false,
          valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—',
        },
        {
          colId: 'yesterdayNcROAS',
          headerName: 'Yesterday ncROAS',
          field: 'yesterdayNcROAS',
          width: 140,
          minWidth: 100,
          sortable: false,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.int(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
        {
          colId: '2daysAgoSpend',
          headerName: '2 Days Ago Spend',
          width: 140,
          minWidth: 100,
          sortable: false,
          valueGetter: (p) => (p.data as ApiAdRow)?.['2daysAgoSpend'] ?? null,
          valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—',
        },
        {
          colId: '2daysAgoNcROAS',
          headerName: '2 Days Ago ncROAS',
          width: 150,
          minWidth: 110,
          sortable: false,
          valueGetter: (p) => (p.data as ApiAdRow)?.['2daysAgoNcROAS'] ?? null,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.int(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
        {
          colId: '3daysAgoSpend',
          headerName: '3 Days Ago Spend',
          width: 140,
          minWidth: 100,
          sortable: false,
          valueGetter: (p) => (p.data as ApiAdRow)?.['3daysAgoSpend'] ?? null,
          valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—',
        },
        {
          colId: '3daysAgoNcROAS',
          headerName: '3 Days Ago ncROAS',
          width: 150,
          minWidth: 110,
          sortable: false,
          valueGetter: (p) => (p.data as ApiAdRow)?.['3daysAgoNcROAS'] ?? null,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.int(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
        {
          colId: '4daysAgoSpend',
          headerName: '4 Days Ago Spend',
          width: 140,
          minWidth: 100,
          sortable: false,
          valueGetter: (p) => (p.data as ApiAdRow)?.['4daysAgoSpend'] ?? null,
          valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—',
        },
        {
          colId: '4daysAgoNcROAS',
          headerName: '4 Days Ago ncROAS',
          width: 150,
          minWidth: 110,
          sortable: false,
          valueGetter: (p) => (p.data as ApiAdRow)?.['4daysAgoNcROAS'] ?? null,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.int(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
      ],
    },
    {
      headerName: 'Meta Platform Metrics',
      marryChildren: true,
      children: [
        { colId: 'metaSpend', headerName: 'Spend', field: 'metaSpend', width: 105, minWidth: 80, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        {
          colId: 'metaROAS',
          headerName: 'ROAS',
          field: 'metaROAS',
          width: 90,
          minWidth: 70,
          hide: isEditor,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.x(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
        { colId: 'metaCPA',      headerName: 'CPA',        field: 'metaCPA',      width: 90,  minWidth: 70, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        { colId: 'metaCPC',      headerName: 'CPC',        field: 'metaCPC',      width: 85,  minWidth: 65, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        { colId: 'metaCPCOut',   headerName: 'CPC (out)',  field: 'metaCPCOut',   width: 95,  minWidth: 70, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        { colId: 'metaCTR',      headerName: 'CTR',        field: 'metaCTR',      width: 85,  minWidth: 65, valueFormatter: (p) => p.value != null ? fmt.pct(p.value) : '—' },
        { colId: 'metaConvRate', headerName: 'Conv. Rate', field: 'metaConvRate', width: 100, minWidth: 80, valueFormatter: (p) => p.value != null ? fmt.pct(p.value) : '—' },
      ],
    },
    {
      headerName: 'AppLovin Platform Metrics',
      marryChildren: true,
      children: [
        { colId: 'applovinSpend', headerName: 'Spend', field: 'applovinSpend', width: 105, minWidth: 80, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        {
          colId: 'applovinROAS',
          headerName: 'ROAS',
          field: 'applovinROAS',
          width: 90,
          minWidth: 70,
          hide: isEditor,
          cellRenderer: (params: ICellRendererParams) =>
            params.value != null
              ? <span className={roasColor(params.value)}>{fmt.x(params.value)}</span>
              : <span className="text-muted-foreground text-xs">—</span>,
        },
        { colId: 'applovinCPA',      headerName: 'CPA',        field: 'applovinCPA',      width: 90,  minWidth: 70, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        { colId: 'applovinCPC',      headerName: 'CPC',        field: 'applovinCPC',      width: 85,  minWidth: 65, valueFormatter: (p) => p.value != null ? fmt.currency(p.value) : '—' },
        { colId: 'applovinCTR',      headerName: 'CTR',        field: 'applovinCTR',      width: 85,  minWidth: 65, valueFormatter: (p) => p.value != null ? fmt.pct(p.value) : '—' },
        { colId: 'applovinConvRate', headerName: 'Conv. Rate', field: 'applovinConvRate', width: 100, minWidth: 80, valueFormatter: (p) => p.value != null ? fmt.pct(p.value) : '—' },
      ],
    },
  ], [isEditor, setPreviewState, getToken]);

  // ── Render ───────────────────────────────────────────────────────────────
  // Open the ad preview modal from a mobile card (mirrors the grid's Preview eye action).
  const openAdPreview = useCallback((row: ApiAdRow) => {
    const isVideoAd = !!row.adVideoURL;
    const isPlayable = !row.adImageURL && isPlayableUrl(row.adVideoURL);
    const isMeta = row.channel === 'Meta';
    if (isPlayable) {
      setIframeLoading(true);
      setPlayableNonce((n) => n + 1);
      setPreviewState({ kind: 'playable', url: row.adVideoURL! });
    } else if (isVideoAd) {
      if (isMeta && row.fb_ad_id) {
        setPreviewState({ kind: 'meta', status: 'loading' });
        const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;
        fetch(`${baseUrl}/api/ads/meta-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ fb_ad_id: row.fb_ad_id }),
        })
          .then((r) => r.json())
          .then((json) => {
            if (json.success) {
              setIframeLoading(true);
              setPreviewState({ kind: 'meta', status: 'ready', iframeHtml: json.iframeHtml });
            } else {
              setPreviewState({ kind: 'meta', status: 'error', message: json.error || 'Preview unavailable' });
            }
          })
          .catch(() => setPreviewState({ kind: 'meta', status: 'error', message: 'Network error' }));
      } else {
        setPreviewState({ kind: 'video', url: row.adVideoURL! });
      }
    } else if (row.adImageURL) {
      setPreviewState({ kind: 'image', url: row.adImageURL! });
    }
  }, [getToken]);

  return (
    <DashboardLayout>
      <div className="md:h-[calc(100vh-3.5rem)] w-full max-w-full overflow-x-hidden md:overflow-y-auto flex flex-col gap-4 px-4 md:px-6 pt-6 pb-4 bg-background">

        {/* Page header */}
        <div className="shrink-0 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Ads Performance</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Track and analyse ad performance across platforms</p>
            </div>
          </div>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting || apiData.length === 0}
              className="gap-2 h-9 px-3 sm:px-4 text-sm font-medium shrink-0"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{isExporting ? "Exporting…" : "Export to Excel"}</span>
              <span className="sm:hidden">{isExporting ? "…" : "Export"}</span>
            </Button>
          )}
        </div>

        {/* Filter panel */}
        <div className="shrink-0 bg-card border border-border rounded-2xl shadow-sm">

          {/* Panel header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <p className="text-sm font-semibold text-foreground">Filters</p>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              title={showAdvanced ? "Hide advanced filters" : "Show advanced filters"}
              className={cn(
                "p-1.5 rounded-lg border transition-colors",
                showAdvanced
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-4 space-y-4">

          {/* ── Row 1: Brand + Product + Timeframe + Platform ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-3">

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Brand</p>
              <MultiSelect
                options={brands.map((b) => ({ value: b.name, label: b.name }))}
                value={brandFilter}
                onChange={setBrandFilter}
                placeholder="All Brands"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Product</p>
              <MultiSelect
                options={productSelectOptions}
                value={productFilter}
                onChange={setProductFilter}
                placeholder="All Products"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Platform</p>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-muted text-sm">
                  <SelectValue placeholder="All Platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both</SelectItem>
                  <SelectItem value="Meta">Meta</SelectItem>
                  <SelectItem value="Applovin">Applovin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Timeframe (Event Date)</p>
              <DateRangePicker
                initialDateFrom={timeframeStart}
                initialDateTo={timeframeEnd}
                minDate={EVENT_DATE_FLOOR}
                onUpdate={({ range }) => {
                  const toDateStr = (d: Date) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const dd = String(d.getDate()).padStart(2, "0");
                    return `${y}-${m}-${dd}`;
                  };
                  setTimeframeStart(toDateStr(range.from));
                  setTimeframeEnd(toDateStr(range.to ?? range.from));
                }}
                align="end"
              />
            </div>
          </div>

          {/* Collapsible advanced filters */}
          <div
            className="overflow-hidden -mx-1"
            style={{
              display: "grid",
              gridTemplateRows: showAdvanced ? "1fr" : "0fr",
              opacity: showAdvanced ? 1 : 0,
              transition: "grid-template-rows 300ms ease, opacity 250ms ease",
            }}
          >
          <div className="min-h-0 space-y-4 px-1 py-1">

          {/* ── Row 2: IT/NN + Format + Min ROAS + Launch Date ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-3">

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">IT / NN</p>
              <Select value={itNnFilter} onValueChange={setItNnFilter}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-muted text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                  <SelectItem value="NN">NN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Edit Type</p>
              <Select value={editTypeFilter} onValueChange={setEditTypeFilter}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-muted text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Self-Edited">Self-Edited</SelectItem>
                  <SelectItem value="Editor-Edited">Editor-Edited</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Format</p>
              <MultiSelect
                options={formatOptions}
                value={formatFilter}
                onChange={setFormatFilter}
                placeholder="All Formats"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Min ROAS</p>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={minRoas}
                onChange={(e) => setMinRoas(e.target.value)}
                placeholder="e.g. 2.0"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Launch Date</p>
              <DateRangePicker
                initialDateFrom={launchStart || undefined}
                initialDateTo={launchEnd || undefined}
                minDate={LAUNCH_DATE_FLOOR}
                onUpdate={({ range }) => {
                  const toDateStr = (d: Date) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const dd = String(d.getDate()).padStart(2, "0");
                    return `${y}-${m}-${dd}`;
                  };
                  setLaunchStart(toDateStr(range.from));
                  setLaunchEnd(toDateStr(range.to ?? range.from));
                }}
                align="end"
              />
            </div>
          </div>

          {/* ── Row 3: Searchable inputs ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-3">

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Ad ID</p>
              <SearchSelect
                value={adIdFilter}
                options={uniqueAdIds}
                onChange={setAdIdFilter}
                placeholder="Type or select…"
                searchPlaceholder="Search ad IDs..."
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Script ID</p>
              <SearchSelect
                value={scriptIdFilter}
                options={uniqueScriptIds}
                onChange={setScriptIdFilter}
                placeholder="Type or select…"
                searchPlaceholder="Search script IDs..."
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">CS</p>
              <SearchSelect
                value={csFilter}
                options={uniqueCS}
                onChange={setCsFilter}
                placeholder="Type or select…"
                searchPlaceholder="Search CS..."
                isMissingOption={(v) => v.toLowerCase() === "missing" || v === "—"}
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Editor</p>
              <SearchSelect
                value={editorFilter}
                options={uniqueEditors}
                onChange={setEditorFilter}
                placeholder="Type or select…"
                searchPlaceholder="Search editors..."
                isMissingOption={(v) => v.toLowerCase() === "missing" || v === "—"}
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Ad Name</p>
              <Input
                value={adNameFilter}
                onChange={(e) => setAdNameFilter(e.target.value)}
                placeholder="Search ad / creative set…"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>
          </div>

          {/* ── Row 4: Multi-select ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Root Cause</p>
              <MultiSelect
                options={rootCauseOptions}
                value={rootCauseFilter}
                onChange={setRootCauseFilter}
                placeholder="All"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Main Pain Point</p>
              <MultiSelect
                options={mainPainOptions}
                value={mainPainFilter}
                onChange={setMainPainFilter}
                placeholder="All"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">CTA</p>
              <MultiSelect
                options={ctaOptions}
                value={ctaFilter}
                onChange={setCtaFilter}
                placeholder="All"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Angle</p>
              <MultiSelect
                options={angleOptions}
                value={angleFilter}
                onChange={setAngleFilter}
                placeholder="All"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Funnel</p>
              <MultiSelect
                options={funnelOptions}
                value={funnelFilter}
                onChange={setFunnelFilter}
                placeholder="All Funnels"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Ad Type</p>
              <MultiSelect
                options={adTypeOptions}
                value={adTypeFilter}
                onChange={setAdTypeFilter}
                placeholder="All Types"
                className="h-9 rounded-lg border-border bg-muted text-sm"
              />
            </div>
          </div>

          </div>
          </div>
          </div>

          {/* Clear Filters footer — always visible */}
          <div className="px-5 py-3 flex justify-end border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-3 h-3" /> Clear filters
            </Button>
          </div>
        </div>

        {/* AG Grid table — desktop only */}
        <div className="hidden md:block">
          <AdsAgGrid
            colDefs={perfColumns}
            rowData={apiData as unknown as Record<string, unknown>[]}
            isLoading={isFetching}
            getRowId={getRowIdFn}
            rowHeight={70}
            gridHeight={gridHeight}
            page={page}
            pageSize={pageSize}
            totalCount={apiTotal}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            pinnedBottomRow={pinnedTotalsRow}
          />
        </div>

        {/* Mobile card list — phones (key numbers readable, no horizontal scroll) */}
        <div className="md:hidden flex flex-col gap-3 pb-2">
          {isFetching ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
            ))
          ) : apiData.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No records found
            </div>
          ) : (
            apiData.map((row) => {
              const hasThumb = !!row.adImageURL || !!row.adVideoURL;
              return (
                <div key={row._rowId} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openAdPreview(row)}
                      disabled={!hasThumb}
                      title={hasThumb ? "Preview ad" : undefined}
                      className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center disabled:cursor-default"
                    >
                      {row.adImageURL ? (
                        <img
                          src={row.adImageURL}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : isPlayableUrl(row.adVideoURL) ? (
                        <PlayableThumb url={row.adVideoURL!} />
                      ) : row.adVideoURL ? (
                        <VideoThumb videoUrl={row.adVideoURL} inert />
                      ) : (
                        <BarChart2 className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{adDisplayName(row)}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {row.channel && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">{row.channel}</Badge>
                        )}
                        {row.ad_id != null && <span className="text-[10px] text-muted-foreground">#{row.ad_id}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <TruncatableField label="Campaign Name" value={row.campaignName || ""} />
                    <TruncatableField label="Creative Set" value={row.adsetName || ""} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                    {adPerfMetrics(row).map(([label, value, color], i, arr) => (
                      <div key={label} className={cn("flex items-center justify-between", i < arr.length - 2 && "border-b border-border/50 pb-1")}>
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className={cn("text-sm font-semibold", color ?? "text-foreground")}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailRow(row)}
                    className="mt-3 w-full h-9 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                  >
                    View details
                  </button>
                </div>
              );
            })
          )}

          {/* Mobile pagination — mirrors the desktop footer (page info, rows-per-page, prev/next) */}
          {apiData.length > 0 && (() => {
            const totalPages = Math.max(1, Math.ceil(apiTotal / pageSize));
            return (
              <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground flex items-center gap-2">
                    Page {page} of {totalPages}
                    {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {apiTotal === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, apiTotal)} of {apiTotal}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-9 flex-1" disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground px-2 py-1.5 bg-muted rounded-md min-w-[48px] text-center">{page}/{totalPages}</span>
                  <Button variant="outline" size="sm" className="h-9 flex-1" disabled={page >= totalPages || isFetching} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                  <span className="text-xs text-muted-foreground">Rows per page</span>
                  <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((s) => (
                        <SelectItem key={s} value={s.toString()} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })()}
        </div>

      </div>

      {/* Ad record detail (mobile) — full table fields for one ad */}
      <Sheet open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailRow(null); }}>
        <SheetContent side="bottom" className="h-auto max-h-[92vh] overflow-y-auto rounded-t-2xl p-0">
          {detailRow && (() => {
            const hasThumb = !!detailRow.adImageURL || !!detailRow.adVideoURL;
            // Links (Ad source / ClickUp / Brief / Notes) live in the Additional Info section
            // below, matching the desktop table; the header only carries the creative preview.
            const resources = [
              hasThumb && { label: "Preview ad", onClick: () => openAdPreview(detailRow) },
            ].filter(Boolean) as { label: string; href?: string; onClick?: () => void }[];
            return (
              <div className="flex flex-col">
                <SheetHeader className="px-4 pt-4 pb-3 text-left border-b border-border space-y-0">
                  <div className="flex items-start gap-3 pr-6">
                    <button
                      type="button"
                      onClick={() => hasThumb && openAdPreview(detailRow)}
                      disabled={!hasThumb}
                      title={hasThumb ? "Preview ad" : undefined}
                      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center disabled:cursor-default"
                    >
                      {detailRow.adImageURL ? (
                        <img src={detailRow.adImageURL} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : isPlayableUrl(detailRow.adVideoURL) ? (
                        <PlayableThumb url={detailRow.adVideoURL!} />
                      ) : detailRow.adVideoURL ? (
                        <VideoThumb videoUrl={detailRow.adVideoURL} inert />
                      ) : (
                        <BarChart2 className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="text-base font-semibold leading-snug line-clamp-2 break-words">{adDisplayName(detailRow, "Ad details")}</SheetTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {detailRow.channel && <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">{detailRow.channel}</Badge>}
                        {detailRow.ad_id != null && <span className="text-[10px] text-muted-foreground">#{detailRow.ad_id}</span>}
                      </div>
                    </div>
                  </div>
                  {resources.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-3">
                      {resources.map((res) => res.href ? (
                        <a
                          key={res.label}
                          href={res.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {res.label}
                        </a>
                      ) : (
                        <button
                          key={res.label}
                          type="button"
                          onClick={res.onClick}
                          className="inline-flex items-center h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          {res.label}
                        </button>
                      ))}
                    </div>
                  )}
                </SheetHeader>

                <div className="px-4 py-3 space-y-4">
                  <AdFieldSections row={detailRow} />

                  {/* Trends */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Trends</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1.5 bg-muted/50 text-[11px] font-medium text-muted-foreground">
                        <span>Period</span>
                        <span className="text-right">Spend</span>
                        <span className="text-right">ncROAS</span>
                      </div>
                      {adTrends(detailRow).map((t) => (
                        <div key={t.label} className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 border-t border-border/60 text-sm">
                          <span className="text-muted-foreground">{t.label}</span>
                          <span className="text-right text-foreground">{t.spend}</span>
                          <span className={cn("text-right font-medium", t.roasColor ?? "text-foreground")}>{t.roas}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Ad preview modal */}
      <Dialog open={!!previewState} onOpenChange={(open) => { if (!open) { setPreviewState(null); setIframeLoading(false); } }}>
        <DialogContent className="max-w-3xl w-full p-3 bg-zinc-950 border-zinc-800 rounded-xl overflow-hidden [&>button]:text-white [&>button]:bg-blue-600 [&>button]:rounded-md [&>button]:opacity-100 [&>button:hover]:bg-blue-700">
          {previewState?.kind === 'image' && (
            <img
              src={previewState.url}
              alt="Ad preview"
              className="w-full max-h-[80vh] object-contain rounded-md"
              loading="lazy"
            />
          )}
          {previewState?.kind === 'video' && (
            <video
              src={previewState.url}
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded-md bg-black"
            />
          )}
          {previewState?.kind === 'playable' && (
            <div className="relative w-full" style={{ height: '80vh' }}>
              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 text-white bg-zinc-950 rounded-md z-10">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Loading playable…</span>
                </div>
              )}
              {/* key (with nonce) forces a brand-new iframe each open, and the
                  cache-busted src re-fetches + replays the playable from the
                  start instead of resuming a prior/blank instance. */}
              <iframe
                key={`${previewState.url}#${playableNonce}`}
                src={`${previewState.url}${previewState.url.includes('?') ? '&' : '?'}_replay=${playableNonce}`}
                className="w-full h-full rounded-md border-0 bg-white"
                sandbox="allow-scripts allow-pointer-lock"
                allowFullScreen
                title="Playable Ad Preview"
                onLoad={() => setIframeLoading(false)}
              />
            </div>
          )}
          {previewState?.kind === 'meta' && previewState.status === 'loading' && (
            <div className="flex items-center justify-center h-64 gap-3 text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Loading Meta preview...</span>
            </div>
          )}
          {previewState?.kind === 'meta' && previewState.status === 'ready' && (() => {
            const srcMatch = previewState.iframeHtml.match(/src="([^"]+)"/);
            const iframeSrc = (srcMatch?.[1] ?? '').replace(/&amp;/g, '&');
            return (
              <div className="relative w-full" style={{ height: '80vh' }}>
                {iframeLoading && (
                  <div className="absolute inset-0 flex items-center justify-center gap-3 text-white bg-zinc-950 rounded-md z-10">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-sm">Loading Meta preview...</span>
                  </div>
                )}
                <iframe
                  src={iframeSrc}
                  className="w-full h-full rounded-md border-0"
                  allowFullScreen
                  title="Meta Ad Preview"
                  onLoad={() => setIframeLoading(false)}
                />
              </div>
            );
          })()}
          {previewState?.kind === 'meta' && previewState.status === 'error' && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-white">
              <p className="text-red-400 text-sm">{previewState.message}</p>
              <button
                type="button"
                className="px-4 py-2 bg-zinc-800 rounded-md text-sm hover:bg-zinc-700"
                onClick={() => setPreviewState(null)}
              >
                Close
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdsPerformance;
