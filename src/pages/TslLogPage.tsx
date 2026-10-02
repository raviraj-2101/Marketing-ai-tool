import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  ListChecks,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Send,
  Sparkles,
  FolderOpen,
  FileText,
  Hash,
  CheckSquare,
  TrendingUp,
  Search as SearchIcon,
  Filter as FilterIcon,
  // Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { stripInternalNotes } from "@/lib/stripInternalNotes";
import { fmtLocal } from "@/lib/tslDatetime";
import { PIPELINE_API_BASE as API_BASE, pipelineQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TslBuild {
  id: string;
  userEmail: string;
  productSlug: string;
  conceptName: string;
  cs: string;
  funnel: string;
  tslScriptBody: string | null;
  // Supabase JSONB returns already-parsed arrays; TEXT returns strings.
  // Accept unknown and coerce at parse time.
  imagesJson: unknown;
  adIdsJson: unknown;
  adGroupsJson: unknown;
  adsPerAdSet: number;
  imagesPerAdset: number;
  pipelineStatus: string;
  pipelinePushEnabled: boolean;
  briefDocUrl: string | null;
  driveFolderUrl: string | null;
  clickupTaskUrl: string | null;
  angle: string | null;
  subAngle: string | null;
  createdAt: number;
  updatedAt: number;
}

interface TslAdGroup {
  adSetIndex: number;
  adId: string;
  imageUrls: string[];
  clickupUrl: string | null;
  driveFolderUrl: string | null;
  briefDocUrl: string | null;
  clickupStatus: string | null;
}

interface ImageEntry {
  url: string;
  category_id?: string;
  prompt?: string;
  variation_note?: string;
}

interface PerformanceSpend {
  spend: number;
  nc_revenue: number;
  nc_orders: number;
  nc_roas: number;
}

interface PerformanceAdRow {
  ad_id: string;
  status: string | null;
  launch_date_meta: string | null;
  launch_date_applovin: string | null;
  pipeline_status: string | null;
}

interface PerformancePayload {
  liveAdIds: string[];
  adRows: PerformanceAdRow[];
  totals: Record<string, PerformanceSpend>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prefixImageUrl(url: string): string {
  if (!url) return url;
  // Route Drive URLs through our backend proxy — Drive files are private and
  // <img> tags can't send auth headers, so direct drive.google.com URLs silently 403.
  if (url.includes("drive.google.com")) {
    try {
      const fileId = new URL(url).searchParams.get("id");
      if (fileId) return `${API_BASE}/api/tsl/drive-image/${fileId}`;
    } catch {}
  }
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`;
}

// Supabase JSONB columns come back as already-parsed objects; TEXT columns come
// back as strings. Handle both so neither path silently returns [].
function coerceArray(json: unknown): unknown[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (typeof json === 'string') {
    try { return JSON.parse(json); } catch { return []; }
  }
  return [];
}

function parseImages(json: unknown): ImageEntry[] {
  const arr = coerceArray(json);
  if (!arr.length) return [];
  return (arr as ImageEntry[]).map((e) => ({ ...e, url: prefixImageUrl(e.url) }));
}

function parseAdGroups(json: unknown): TslAdGroup[] {
  const arr = coerceArray(json);
  if (!arr.length) return [];
  return (arr as TslAdGroup[]).map((g) => ({
    ...g,
    imageUrls: Array.isArray(g.imageUrls) ? g.imageUrls.map(prefixImageUrl) : [],
  }));
}

function parseAdIds(json: unknown): string[] {
  const arr = coerceArray(json);
  return arr.map(String);
}

// "cleantra-lymphatic" → "Lymphatic", "cleantra-oregano-extract" → "Oregano Extract"
function formatProductSlug(slug: string): string {
  const parts = slug.split('-');
  if (parts.length <= 1) return slug;
  return parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function formatDollar(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "$0";
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function formatRoas(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  return `${v.toFixed(2)}x`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
      <Clock className="size-3" /> Pending
    </span>
  );
  if (status === "running") return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
      <Loader2 className="size-3 animate-spin" /> Generating
    </span>
  );
  if (status === "done") return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
      <CheckCircle2 className="size-3" /> Pushed
    </span>
  );
  if (status === "failed") return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
      <XCircle className="size-3" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">
      {status}
    </span>
  );
}

function MetaPill({ label, value }: { label?: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-0.5 text-[11px] tabular-nums">
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className="text-foreground/90 font-medium">{value}</span>
    </span>
  );
}

function AdGroupRow({ group, build, isFirst, marketingRow }: {
  group: TslAdGroup;
  build: TslBuild;
  isFirst: boolean;
  marketingRow?: PerformanceAdRow;
}) {
  const isDryRun = group.adId.startsWith("DRY-");
  return (
    <div className={"px-4 sm:px-5 py-4 " + (isFirst ? "" : "border-t border-border/30")}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex flex-col items-center shrink-0 gap-1">
          <div className="size-10 sm:size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono text-[11px] font-bold tabular-nums px-1">
            #{group.adSetIndex}
          </div>
          <span className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground">ad set</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-mono font-bold tabular-nums">
              <Hash className="size-3 text-muted-foreground" />
              {group.adId}
            </span>
            {isDryRun && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                dry-run
              </span>
            )}
            {marketingRow?.status && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                {marketingRow.status}
              </span>
            )}
            {marketingRow?.launch_date_meta && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Meta: {marketingRow.launch_date_meta}
              </span>
            )}
            {group.clickupStatus && !marketingRow?.status && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">
                ClickUp: {group.clickupStatus}
              </span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {group.imageUrls.length} image{group.imageUrls.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-3 text-[11.5px] flex-wrap">
            {group.clickupUrl && (
              <a href={group.clickupUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <CheckSquare className="size-3" /> ClickUp task
              </a>
            )}
            {group.driveFolderUrl && (
              <a href={group.driveFolderUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <FolderOpen className="size-3" /> Drive folder
              </a>
            )}
            {group.briefDocUrl && (
              <a href={group.briefDocUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <FileText className="size-3" /> Brief
              </a>
            )}
            {!group.clickupUrl && !group.driveFolderUrl && !group.briefDocUrl && (
              <span className="italic text-muted-foreground text-[11px]">
                No links yet — pipeline {build.pipelineStatus}.
              </span>
            )}
          </div>

          {group.imageUrls.length > 0 && (
            <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
              {group.imageUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  className="aspect-[4/5] rounded-md overflow-hidden border border-border/40 bg-muted/20">
                  <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BuildRow({ build, idx }: { build: TslBuild; idx: number }) {
  const [open, setOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  // const [fixingImages, setFixingImages] = useState(false); // (removed) — see "Fix images" button below
  // const queryClient = useQueryClient(); // (removed) — only used by the obsolete fixImages handler
  const images = useMemo(() => parseImages(build.imagesJson), [build.imagesJson]);
  const adGroups = useMemo(() => parseAdGroups(build.adGroupsJson), [build.adGroupsJson]);
  const adIds = useMemo(() => parseAdIds(build.adIdsJson), [build.adIdsJson]);
  const isLocalOnly = !build.pipelinePushEnabled;

  // const hasBrokenImages = useMemo(() => {
  //   if (build.pipelineStatus !== "pushed") return false;
  //   return adGroups.some((g) => g.imageUrls.length > 0);
  // }, [adGroups, build.pipelineStatus]);

  // const fixImages = async (e: React.MouseEvent) => {
  //   e.stopPropagation();
  //   setFixingImages(true);
  //   try {
  //     const token = localStorage.getItem("auth_jwt_token") || "";
  //     await fetch(`${API_BASE}/api/tsl/builds/${build.id}/fix-images`, {
  //       method: "POST",
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     await queryClient.invalidateQueries({ queryKey: ["/api/tsl/builds"] });
  //   } finally {
  //     setFixingImages(false);
  //   }
  // };

  // After a successful push, local generated files are deleted.
  // Prefer Drive URLs from adGroups (permanent) over imagesJson URLs (dead after push).
  const allImageUrls = useMemo(() => {
    if (adGroups.length > 0) return adGroups.flatMap((g) => g.imageUrls);
    return images.map((img) => img.url);
  }, [adGroups, images]);

  const previewImages = allImageUrls.slice(0, 4);
  const liveAdIdsCount = adIds.filter((id) => /^\d+$/.test(id)).length;

  const perfQ = useQuery<PerformancePayload>({
    queryKey: [`/api/tsl/builds/${build.id}/performance`],
    queryFn: pipelineQueryFn,
    enabled: open && liveAdIdsCount > 0,
    refetchInterval: open ? 5 * 60_000 : false,
    staleTime: 60_000,
  });

  const adRowByAdId = useMemo(() => {
    const m = new Map<string, PerformanceAdRow>();
    for (const r of perfQ.data?.adRows || []) m.set(r.ad_id, r);
    return m;
  }, [perfQ.data?.adRows]);

  return (
    <article className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <header
        className="px-4 sm:px-5 py-4 flex items-start gap-3 sm:gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="size-9 sm:size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-semibold tabular-nums">
          {idx}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-foreground truncate" title={build.conceptName}>
              {build.conceptName || "Untitled concept"}
            </span>
            <StatusPill status={build.pipelineStatus} />
            {isLocalOnly && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Local only
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3 opacity-50" />
              <span className="text-foreground/80 font-medium">{formatProductSlug(build.productSlug)}</span>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>CS: <span className="text-foreground/80">{build.cs}</span></span>
            {build.angle && (<><span className="text-muted-foreground/30">·</span><span>Angle: <span className="text-foreground/80">{build.angle}</span></span></>)}
            {build.subAngle && (<><span className="text-muted-foreground/30">·</span><span>Sub-angle: <span className="text-foreground/80">{build.subAngle}</span></span></>)}
            <span className="text-muted-foreground/30">·</span>
            <MetaPill value={`${allImageUrls.length} image${allImageUrls.length === 1 ? "" : "s"}`} />
            <MetaPill label="per AD SET" value={String(build.adsPerAdSet || build.imagesPerAdset)} />
            {adGroups.length > 0 && <MetaPill value={`${adGroups.length} ad set${adGroups.length === 1 ? "" : "s"}`} />}
            {adIds.length > 0 && <MetaPill value={`${adIds.length} ad ID${adIds.length === 1 ? "" : "s"}`} />}
          </div>

          {adIds.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mr-1">Ad IDs:</span>
              {adIds.slice(0, 8).map((id) => (
                <span key={id} className="inline-flex items-center font-mono bg-background border border-border px-1.5 py-0.5 rounded text-[10.5px] tabular-nums">
                  {id}
                </span>
              ))}
              {adIds.length > 8 && (
                <span className="text-[10.5px] text-muted-foreground">+{adIds.length - 8} more</span>
              )}
            </div>
          )}

          {liveAdIdsCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mr-1 inline-flex items-center gap-1">
                <TrendingUp className="size-3" /> Spend · ncROAS
              </span>
              {perfQ.isLoading ? (
                <span className="text-[10.5px] text-muted-foreground italic">loading…</span>
              ) : perfQ.isError ? (
                <span className="text-[10.5px] text-destructive">metrics unavailable</span>
              ) : (
                [1, 3, 7, 30].map((d) => {
                  const t = (perfQ.data?.totals[String(d)] || { spend: 0, nc_roas: 0 }) as PerformanceSpend;
                  const dim = t.spend === 0;
                  return (
                    <span key={d}
                      className={dim
                        ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-background/50 text-[10.5px] tabular-nums text-muted-foreground/70"
                        : "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/40 bg-primary/5 text-[10.5px] tabular-nums text-foreground"
                      }
                    >
                      <span className="font-semibold">{d === 1 ? "1d" : `${d}d`}</span>
                      <span>{formatDollar(t.spend)}</span>
                      <span className="text-muted-foreground/70">·</span>
                      <span>{formatRoas(t.nc_roas)}</span>
                    </span>
                  );
                })
              )}
            </div>
          )}

          {(build.briefDocUrl || build.driveFolderUrl || build.clickupTaskUrl) && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {build.clickupTaskUrl && (
                <a href={build.clickupTaskUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-background hover:border-primary/40 text-foreground text-[10.5px] transition-colors">
                  <CheckSquare className="size-3" /> ClickUp <ExternalLink className="size-2.5 opacity-50" />
                </a>
              )}
              {build.briefDocUrl && (
                <a href={build.briefDocUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-background hover:border-primary/40 text-foreground text-[10.5px] transition-colors">
                  <FileText className="size-3" /> Brief <ExternalLink className="size-2.5 opacity-50" />
                </a>
              )}
              {build.driveFolderUrl && (
                <a href={build.driveFolderUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-background hover:border-primary/40 text-foreground text-[10.5px] transition-colors">
                  <FolderOpen className="size-3" /> Drive <ExternalLink className="size-2.5 opacity-50" />
                </a>
              )}
            </div>
          )}

          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground/80">
              Pushed {fmtLocal(build.createdAt)}
            </span>
            {/* {hasBrokenImages && (
              <Button
                size="sm"
                variant="outline"
                className="h-5 px-2 text-[10.5px] gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                onClick={fixImages}
                disabled={fixingImages}
              >
                {fixingImages ? <Loader2 className="size-3 animate-spin" /> : <Wrench className="size-3" />}
                {fixingImages ? "Fixing…" : "Fix images"}
              </Button>
            )} */}
          </div>

          {(build.pipelineStatus === "pending" || build.pipelineStatus === "running") && previewImages.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground bg-muted/20 border border-border/40 rounded-lg px-3 py-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Pipeline {build.pipelineStatus}{build.pipelineStatus === "pending" ? " — queuing…" : " — generating…"}
            </div>
          )}

          {previewImages.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-1.5 max-w-xs sm:max-w-sm">
              {previewImages.map((url, i) => (
                <div key={i} className="aspect-[4/5] rounded-md overflow-hidden border border-border/40 bg-muted/20">
                  <img src={url} alt={`image-${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
              {allImageUrls.length > previewImages.length && (
                <div className="aspect-[4/5] rounded-md flex items-center justify-center bg-muted/20 border border-border/40 text-[11px] text-muted-foreground font-medium">
                  +{allImageUrls.length - previewImages.length}
                </div>
              )}
            </div>
          )}
        </div>

        <span className="size-7 sm:size-8 rounded-lg flex items-center justify-center text-muted-foreground shrink-0" aria-hidden>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </header>

      {open && (
        <div className="border-t border-border/30 bg-muted/10 divide-y divide-border/30">
          {build.tslScriptBody && (
            <div className="px-4 sm:px-5 py-4">
              <button type="button" onClick={() => setScriptOpen((v) => !v)}
                className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-tight hover:text-primary">
                {scriptOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                TSL script
                <span className="text-muted-foreground font-normal text-[11px] tabular-nums">
                  ({(stripInternalNotes(build.tslScriptBody).match(/\b[A-Za-z0-9]+\b/g) || []).length} words)
                </span>
              </button>
              {scriptOpen && (
                <div className="mt-3 prose prose-sm dark:prose-invert max-w-none bg-card border border-border rounded-lg p-4 max-h-[60vh] overflow-y-auto prose-p:leading-relaxed prose-headings:font-semibold prose-strong:text-foreground prose-strong:font-semibold prose-ul:my-2 prose-li:my-0.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {stripInternalNotes(build.tslScriptBody)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {adGroups.length > 0 && (
            <div className="bg-card/30">
              <div className="px-4 sm:px-5 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/30">
                Ad sets ({adGroups.length})
              </div>
              <div className="divide-y divide-border/30">
                {adGroups.map((g, i) => (
                  <AdGroupRow key={g.adId} group={g} build={build} isFirst={i === 0} marketingRow={adRowByAdId.get(g.adId)} />
                ))}
              </div>
            </div>
          )}

          {adGroups.length === 0 && adIds.length > 0 && (
            <div className="px-4 sm:px-5 py-4">
              <div className="text-muted-foreground mb-1.5 font-medium uppercase tracking-wide text-[10px]">Ad IDs ({adIds.length})</div>
              <div className="flex flex-wrap gap-1">
                {adIds.map((id) => (
                  <span key={id} className="font-mono bg-background border border-border px-2 py-0.5 rounded text-[11px]">{id}</span>
                ))}
              </div>
            </div>
          )}

          {adGroups.length === 0 && images.length > 0 && (
            <div className="px-4 sm:px-5 py-4">
              <div className="text-muted-foreground mb-2 font-medium uppercase tracking-wide text-[10px]">All images ({images.length})</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                {images.map((img, i) => (
                  <a key={i} href={img.url} target="_blank" rel="noreferrer"
                    className="aspect-[4/5] rounded-md overflow-hidden border border-border/40 bg-muted/20 block"
                    title={img.variation_note || ""}>
                    <img src={img.url} alt={img.variation_note || `image-${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {(build.briefDocUrl || build.driveFolderUrl || build.clickupTaskUrl) && (
            <div className="px-4 sm:px-5 py-3 flex items-center gap-2 flex-wrap text-[11.5px]">
              {build.clickupTaskUrl && (
                <a href={build.clickupTaskUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:border-primary/40 text-foreground transition-colors">
                  <CheckSquare className="size-3.5" /> ClickUp <ExternalLink className="size-3 opacity-50" />
                </a>
              )}
              {build.briefDocUrl && (
                <a href={build.briefDocUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:border-primary/40 text-foreground transition-colors">
                  <FileText className="size-3.5" /> Brief doc <ExternalLink className="size-3 opacity-50" />
                </a>
              )}
              {build.driveFolderUrl && (
                <a href={build.driveFolderUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:border-primary/40 text-foreground transition-colors">
                  <FolderOpen className="size-3.5" /> Drive <ExternalLink className="size-3 opacity-50" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TslLogPage() {
  const { buildId } = useParams<{ buildId?: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Only Admin / Super Admin / Dev see every build. Everyone else (CS, editors,
  // any custom role) sees only the builds they created — same isolation as the
  // UGC Video Build Log.
  const isAdmin = useMemo(
    () => (user?.user_type ?? []).some((t) => ["Admin", "Super Admin", "Dev"].includes(t)),
    [user],
  );
  const myEmail = (user?.email ?? "").toLowerCase();

  const buildsQ = useQuery<TslBuild[]>({
    queryKey: ["/api/tsl/builds"],
    queryFn: pipelineQueryFn,
    refetchInterval: (q) => {
      const list = q.state.data || [];
      const inFlight = list.some((b) => b.pipelineStatus === "pending" || b.pipelineStatus === "running");
      return inFlight ? 4000 : 6000;
    },
  });

  const [filterProduct, setFilterProduct] = useState("");
  const [filterCs, setFilterCs] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAngle, setFilterAngle] = useState("");
  const [filterSubAngle, setFilterSubAngle] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("ad_id") || "");

  const allBuilds = buildsQ.data || [];
  // Non-admins only ever see their own builds; scope the whole list up front so
  // the filter dropdowns and counts reflect only what they're allowed to see.
  const builds = useMemo(
    () => (isAdmin ? allBuilds : allBuilds.filter((b) => (b.userEmail ?? "").toLowerCase() === myEmail)),
    [allBuilds, isAdmin, myEmail],
  );

  const productOptions = useMemo(() => {
    const s = new Set<string>();
    for (const b of builds) if (b.productSlug) s.add(b.productSlug);
    return Array.from(s).sort();
  }, [builds]);

  const csOptions = useMemo(() => {
    const s = new Set<string>();
    for (const b of builds) if (b.cs) s.add(b.cs);
    return Array.from(s).sort();
  }, [builds]);

  const angleOptions = useMemo(() => {
    const s = new Set<string>();
    for (const b of builds) if (b.angle) s.add(b.angle);
    return Array.from(s).sort();
  }, [builds]);

  const subAngleOptions = useMemo(() => {
    const s = new Set<string>();
    for (const b of builds) if (b.subAngle) s.add(b.subAngle);
    return Array.from(s).sort();
  }, [builds]);

  const filteredBuilds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return builds.filter((b) => {
      if (filterProduct && b.productSlug !== filterProduct) return false;
      if (filterCs && b.cs !== filterCs) return false;
      if (filterStatus && b.pipelineStatus !== filterStatus) return false;
      if (filterAngle && b.angle !== filterAngle) return false;
      if (filterSubAngle && b.subAngle !== filterSubAngle) return false;
      if (!q) return true;
      if (b.conceptName?.toLowerCase().includes(q)) return true;
      if (b.productSlug?.toLowerCase().includes(q)) return true;
      const adIds = coerceArray(b.adIdsJson).map(String);
      if (adIds.some((id) => id.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [builds, filterProduct, filterCs, filterStatus, filterAngle, filterSubAngle, search]);

  // Deep-link: single-build view
  if (buildId) {
    const build = builds.find((b) => b.id === buildId);
    return (
      <DashboardLayout>
        <div className="h-full overflow-y-auto px-4 sm:px-6 py-6">
          <header className="flex items-center gap-3 mb-6 flex-wrap">
            <ListChecks className="size-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold">TSL Log</h1>
            <Link to="/tsl-builder/tsl-log" className="ml-auto text-xs text-primary hover:underline">
              ← all builds
            </Link>
          </header>
          <div className="max-w-4xl">
            {buildsQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading build…
              </div>
            ) : !build ? (
              <p className="text-sm text-muted-foreground">Build not found.</p>
            ) : (
              <BuildRow build={build} idx={1} />
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto px-4 sm:px-6 py-6">

        <header className="flex items-center gap-3 mb-4 flex-wrap">
          <ListChecks className="size-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold">TSL Log</h1>
          <span className="text-xs text-muted-foreground">
            {filteredBuilds.length === builds.length
              ? `${builds.length} build${builds.length === 1 ? "" : "s"}`
              : `${filteredBuilds.length} of ${builds.length}`}
          </span>
          {buildsQ.isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-auto" />}
        </header>

        {/* Filter bar — only shown once there's something to filter */}
        {builds.length > 0 && (
          <div className="mb-4 max-w-5xl bg-card border border-border rounded-lg p-3 flex items-center gap-2 flex-wrap">
            <FilterIcon className="size-3.5 text-muted-foreground shrink-0" />
            <div className="relative">
              <SearchIcon className="size-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search concept, ad ID…"
                className="pl-7 h-8 text-xs w-44 sm:w-56"
              />
            </div>
            <Select value={filterProduct || "_all"} onValueChange={(v) => setFilterProduct(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs w-36 sm:w-44">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All products</SelectItem>
                {productOptions.map((p) => (
                  <SelectItem key={p} value={p}>{formatProductSlug(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={filterCs || "_all"} onValueChange={(v) => setFilterCs(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-28 sm:w-32">
                  <SelectValue placeholder="All CS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All CS</SelectItem>
                  {csOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs w-28 sm:w-32">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All status</SelectItem>
                <SelectItem value="pushed">Pushed</SelectItem>
                <SelectItem value="pushing">Pushing</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAngle || "_all"} onValueChange={(v) => setFilterAngle(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs w-32 sm:w-40">
                <SelectValue placeholder="All angles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All angles</SelectItem>
                {angleOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSubAngle || "_all"} onValueChange={(v) => setFilterSubAngle(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs w-32 sm:w-40">
                <SelectValue placeholder="All sub-angles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All sub-angles</SelectItem>
                {subAngleOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterProduct || filterCs || filterStatus || filterAngle || filterSubAngle || search) && (
              <button type="button"
                onClick={() => { setFilterProduct(""); setFilterCs(""); setFilterStatus(""); setFilterAngle(""); setFilterSubAngle(""); setSearch(""); }}
                className="text-[11px] text-muted-foreground hover:text-foreground">
                clear
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!buildsQ.isLoading && builds.length === 0 && (
          <div className="max-w-lg bg-card border border-border rounded-lg p-5">
            <div className="text-sm font-medium mb-4 inline-flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" /> No concepts pushed yet
            </div>
            <ol className="space-y-3 text-sm text-muted-foreground">
              {[
                "Open a chat and pick a product.",
                "Write a TSL script with the 6-file skill.",
                "Open Develop this TSL, pick categories, generate images.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="size-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-semibold shrink-0">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-semibold shrink-0">4</span>
                <span className="flex items-center gap-1.5">
                  <Send className="size-3.5 text-primary" /> Push the concept — it lands here.
                </span>
              </li>
            </ol>
          </div>
        )}

        {/* No results after filtering */}
        {builds.length > 0 && filteredBuilds.length === 0 && (
          <div className="max-w-5xl bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">
              No builds match the current filters.{" "}
              <button type="button"
                onClick={() => { setFilterProduct(""); setFilterCs(""); setFilterStatus(""); setFilterAngle(""); setFilterSubAngle(""); setSearch(""); }}
                className="text-primary hover:underline">
                Clear filters
              </button>
            </p>
          </div>
        )}

        {/* Build list */}
        {filteredBuilds.length > 0 && (
          <div className="max-w-5xl space-y-3">
            {filteredBuilds.map((b, i) => (
              <BuildRow key={b.id} build={b} idx={i + 1} />
            ))}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
