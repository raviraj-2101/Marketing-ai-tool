import { useState, type ReactNode } from "react";
import { ExternalLink, FileText, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import type { AdRow } from "@/lib/parseAds";

const fmtMoney = (n: number) => `$${Math.round(Number(n ?? 0)).toLocaleString()}`;
const fmtRoas = (n: number) => Number(n ?? 0).toFixed(2);
const roasTone = (n: number) =>
  n >= 2
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
    : n >= 1
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300";

// AppLovin "winner" assets can be HTML5 playables (interactive ad units), not video —
// they arrive as a `.raw`/`.html` URL served as text/html, so a <video>/<img> renders
// blank. Detect them so we can embed in an <iframe> instead (mirrors AdsPerformance.tsx).
function isPlayableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /\.(raw|html?)$/.test(new URL(url).pathname.toLowerCase());
  } catch {
    return /\.(raw|html?)(\?|#|$)/i.test(url);
  }
}

function Chip({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <span className="rounded-full border border-card-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-sm tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

export function AdCard({ ad, onIterate }: { ad: AdRow; onIterate?: (ad: AdRow) => void }) {
  const [showScript, setShowScript] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const scriptAvailable = !!ad.script && ad.script_source !== "brief_doc_unavailable";
  const title = ad.concept_name || ad.ad_name || `Ad ${ad.ad_id}`;

  // Real preview only — image when present, else the ad video's first frame
  // (native <video> renders it without CORS, unlike canvas extraction). When
  // neither exists we render nothing instead of an empty placeholder box.
  const showImg = !!ad.ad_image_url && !imgFailed;
  const showVideo = !showImg && !!ad.ad_video_url;
  const isPlayable = showVideo && isPlayableUrl(ad.ad_video_url);
  const mediaUrl = showImg ? ad.ad_image_url! : showVideo ? ad.ad_video_url! : null;

  return (
    <div className="space-y-3 rounded-xl border border-card-border bg-card p-3.5 transition-shadow hover:shadow-sm">
      {/* Header: preview (if any) + identity + ROAS */}
      <div className="flex gap-3">
        {mediaUrl && (
          <button
            type="button"
            onClick={() => window.open(mediaUrl, "_blank", "noopener,noreferrer")}
            title="Open ad creative"
            aria-label="Open ad creative"
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-card-border bg-muted"
          >
            {showImg ? (
              <img
                src={ad.ad_image_url!}
                alt=""
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : isPlayable ? (
              // HTML5 playable (AppLovin .raw/.html) — a <video> renders blank, so embed
              // the playable in an <iframe> scaled to cover the 64×64 cell. pointer-events
              // are off so the parent button keeps owning click-to-open.
              <iframe
                src={ad.ad_video_url!}
                title="Playable ad preview"
                tabIndex={-1}
                scrolling="no"
                loading="lazy"
                sandbox="allow-scripts"
                style={{
                  width: 320,
                  height: 480,
                  border: 0,
                  transform: `scale(${64 / 320})`,
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
                className="bg-white"
              />
            ) : (
              <video
                src={ad.ad_video_url!}
                className="h-full w-full object-cover"
                preload="metadata"
                muted
                playsInline
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
              <ExternalLink className="size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
            </span>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-semibold leading-snug" title={title}>
              {title}
            </h4>
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${roasTone(ad.ncROAS)}`}
            >
              {fmtRoas(ad.ncROAS)}× ROAS
            </span>
          </div>
          {/* Identity line — lets the user verify exactly which ad this is */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {ad.ad_name && ad.ad_name !== title && (
              <span className="max-w-[60%] truncate" title={ad.ad_name}>
                {ad.ad_name}
              </span>
            )}
            <span className="select-all rounded bg-muted px-1 py-px font-mono text-[10px] text-foreground/70">
              #{ad.ad_id}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip>{ad.sub_angle}</Chip>
            <Chip>{ad.ad_format}</Chip>
            <Chip>{ad.funnel}</Chip>
            <Chip>{ad.channel}</Chip>
            <Chip>{ad.it_or_nn}</Chip>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <Metric label="Spend" value={fmtMoney(ad.spend)} strong />
        <Metric label="Revenue" value={fmtMoney(ad.ncRevenue)} />
        <Metric label="Orders" value={String(ad.orders ?? 0)} />
        <Metric label="Launched" value={ad.launch_date ? ad.launch_date.slice(0, 10) : "—"} />
      </div>

      {/* Links */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {ad.ad_source_link && (
          <a href={ad.ad_source_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="size-3" /> View ad
          </a>
        )}
        {ad.clickup_link && (
          <a href={ad.clickup_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="size-3" /> ClickUp
          </a>
        )}
        {ad.brief && (
          <a href={ad.brief} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="size-3" /> Brief
          </a>
        )}
      </div>

      {/* Script toggle + primary iterate action */}
      <div className="flex items-center justify-between gap-2 border-t border-card-border pt-2.5">
        <button
          type="button"
          onClick={() => setShowScript((s) => !s)}
          disabled={!scriptAvailable}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {scriptAvailable ? (showScript ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : null}
          {scriptAvailable ? "View script" : "Script unavailable"}
        </button>
        {onIterate && (
          <button
            type="button"
            onClick={() => onIterate(ad)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
          >
            <RotateCcw className="size-3.5" /> Iterate this angle
          </button>
        )}
      </div>
      {showScript && scriptAvailable && (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2.5 text-[12px] leading-relaxed">
          {ad.script}
        </pre>
      )}
    </div>
  );
}
