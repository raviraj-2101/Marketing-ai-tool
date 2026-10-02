import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/features/ads-launcher/lib/api";
import { useToast } from "@/features/ads-launcher/components/Toast";
import { ListSkeleton } from "@/features/ads-launcher/components/ListShells";

type LibraryItem = {
  adm_id: number;
  filename: string;
  url: string;
  thumbnail_url: string | null;
  mime_type: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  ai_name: string | null;
  transcript: string | null;
  smart_tags: string[] | null;
  uploaded_by: string | null;
  status: string | null;
  source: string | null;
  date_added: string | null;
  adm_account_id: string | null;
  adm_account_ad_id: string | null;
  meta_ad_ids: string[] | null;
};

type Facets = {
  ok: boolean;
  statuses: { status: string; n: number }[];
  uploaders: { uploaded_by: string; n: number }[];
  tags?: { tag: string; n: number }[];
};

export default function LibraryPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Cycle 379 — filter by AdManage status + uploader. Both are exact-
  // match against the mirror data. Empty = no filter.
  const [statusFilter, setStatusFilter] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  // Cycle 430 / 425 — smart-tag chip + date range filter.
  const [tagFilter, setTagFilter] = useState("");
  const [since, setSince] = useState<"all" | "24h" | "7d" | "30d" | "90d">("all");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const toast = useToast();
  // Backend returns the facets at the TOP LEVEL: { ok, statuses, uploaders, tags }
  // (see pipeline-node admanageLibraryController.getFacets). Reading `.facets`
  // off the response yielded undefined and silently hid every filter chip.
  const { data: facets } = useQuery({
    queryKey: ["admanage-library-facets"],
    queryFn: () => api.get<Facets>("/api/admanage/library/facets"),
    staleTime: 60_000,
  });
  const queryString = (() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    if (statusFilter) p.set("status", statusFilter);
    if (uploaderFilter) p.set("uploaded_by", uploaderFilter);
    if (tagFilter) p.set("tag", tagFilter);
    if (since !== "all") p.set("since", since);
    const s = p.toString();
    return s ? `?${s}` : "";
  })();
  const { data, isLoading } = useQuery({
    queryKey: ["admanage-library", debouncedQ, statusFilter, uploaderFilter, tagFilter, since],
    queryFn: () => api.get<{ ok: boolean; items: LibraryItem[]; count: number; limit: number }>(
      `/api/admanage/library${queryString}`,
    ),
  });
  const items = data?.items ?? [];
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AdManage Library</h1>
          <p className="text-xs text-slate-500 mt-1">
            Search the mirrored AdManage asset library by filename, AI name, or transcript text. Click a row to copy the filename for use in the launcher.
          </p>
        </div>
      </div>
      <div className="al-card mb-4 space-y-3">
        <input
          className="al-input"
          placeholder="Search by filename, AI name, or transcript…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {/* Cycle 379 — status filter chips + uploader dropdown. */}
        {facets && facets.statuses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Status</span>
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className={`chip text-[10.5px] ${
                statusFilter === ""
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={statusFilter === ""}
            >
              All
            </button>
            {facets.statuses.map((s) => (
              <button
                key={s.status}
                type="button"
                onClick={() => setStatusFilter(s.status)}
                className={`chip text-[10.5px] ${
                  statusFilter === s.status
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
                aria-pressed={statusFilter === s.status}
              >
                {s.status}
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{s.n}</span>
              </button>
            ))}
          </div>
        )}
        {facets && facets.uploaders.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Uploader</span>
            <select
              className="al-input md:max-w-xs"
              value={uploaderFilter}
              onChange={(e) => setUploaderFilter(e.target.value)}
            >
              <option value="">All uploaders</option>
              {facets.uploaders.map((u) => (
                <option key={u.uploaded_by} value={u.uploaded_by}>
                  {u.uploaded_by.split("@")[0]} ({u.n})
                </option>
              ))}
            </select>
            {(statusFilter || uploaderFilter || q || tagFilter || since !== "all") && (
              <button
                type="button"
                className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                onClick={() => { setQ(""); setStatusFilter(""); setUploaderFilter(""); setTagFilter(""); setSince("all"); }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {/* Cycle 425 — date_added range. */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Added</span>
          {(["all", "24h", "7d", "30d", "90d"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSince(s)}
              className={`chip text-[10.5px] ${
                since === s
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={since === s}
            >
              {s === "all" ? "All" : s === "24h" ? "Last 24h" : `Last ${s}`}
            </button>
          ))}
        </div>
        {/* Cycle 430 — top smart_tags as one-click chips. Limited to
            the 30 most frequent to keep the row scannable. */}
        {facets?.tags && facets.tags.length > 0 && (
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
            {facets.tags.slice(0, 12).map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => setTagFilter(t.tag)}
                className={`chip text-[10.5px] ${
                  tagFilter === t.tag
                    ? "bg-violet-500 text-white border-violet-500"
                    : "bg-white text-violet-700 border-violet-200 hover:bg-violet-50"
                }`}
              >
                {t.tag}
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{t.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="al-card"><ListSkeleton rows={5} /></div>
      ) : items.length === 0 ? (
        <div className="al-card">
          <div className="text-sm text-slate-500 py-10 text-center">
            {debouncedQ ? `No assets match "${debouncedQ}".` : "Library is empty — wait for the next AdManage sync, or refine your search."}
          </div>
        </div>
      ) : (
        <div className="al-card divide-y">
          {items.map((item) => (
            <LibraryRow key={item.adm_id} item={item} onCopy={async () => {
              try {
                await navigator.clipboard.writeText(item.filename);
                toast("success", `Copied: ${item.filename.slice(0, 60)}${item.filename.length > 60 ? "…" : ""}`);
              } catch {
                toast("error", "Clipboard write failed — copy manually from the row.");
              }
            }} />
          ))}
          {data && data.count >= data.limit && (
            <div className="text-[11px] text-slate-500 py-2 text-center">
              Showing first {data.limit} matches. Refine your search to narrow further.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryRow({ item, onCopy }: { item: LibraryItem; onCopy: () => void }) {
  const dim = item.width && item.height ? `${item.width}×${item.height}` : null;
  const dur = item.duration_sec ? `${Math.round(item.duration_sec)}s` : null;
  const sizeKb = item.size_bytes ? `${Math.round(item.size_bytes / 1024)} KB` : null;
  const tags = Array.isArray(item.smart_tags) ? item.smart_tags : [];
  // Cycle 470 — thumbnail click opens a full-size lightbox preview.
  // stopPropagation so the row-click copy-filename doesn't also fire.
  const [lightbox, setLightbox] = useState(false);
  return (
    <div className="py-3 flex items-start gap-3 hover:bg-slate-50 cursor-pointer transition-colors -mx-5 px-5" onClick={onCopy}>
      <div
        className="shrink-0 w-20 h-20 rounded bg-slate-100 grid place-items-center overflow-hidden cursor-zoom-in"
        onClick={(e) => { if (item.thumbnail_url || item.url) { e.stopPropagation(); setLightbox(true); } }}
        title={item.thumbnail_url || item.url ? "Click to preview at full size" : ""}
      >
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[9px] text-slate-400">no thumb</span>
        )}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
          role="dialog"
          aria-label={`Preview of ${item.filename}`}
        >
          {/* Image or video — switch on mime. Sized to viewport. */}
          {item.mime_type?.startsWith("video/") ? (
            <video src={item.url} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={item.url} alt={item.filename} className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono text-slate-900 truncate" title={item.filename}>{item.filename}</span>
          {item.status && (
            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              item.status === "Launched" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : item.status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}>{item.status}</span>
          )}
        </div>
        {item.ai_name && (
          <div className="text-[11px] text-slate-700 mt-0.5"><span className="text-slate-400 mr-1">AI:</span>{item.ai_name}</div>
        )}
        {item.transcript && (
          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={item.transcript}>
            <span className="text-slate-400 mr-1">Transcript:</span>{item.transcript}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {[dur, dim, sizeKb, item.uploaded_by, item.source]
            .filter(Boolean)
            .map((v, i) => (
              <span key={i} className="text-[10px] font-mono text-slate-500">{v as string}</span>
            ))}
          {tags.slice(0, 6).map((t) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">{t}</span>
          ))}
          {tags.length > 6 && <span className="text-[9px] text-slate-400">+{tags.length - 6}</span>}
        </div>
        {/* Cycle 392 — Meta Ad Library deep-link(s). Each launched ad
            from this asset has a numeric meta_ad_id. We expose them as
            public Ads Library URLs so operators can inspect the actual
            running ad without leaving the browser. Cap at 3 surfaced;
            full list still in JSON. */}
        {Array.isArray(item.meta_ad_ids) && item.meta_ad_ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Meta Ad Library:</span>
            {item.meta_ad_ids.slice(0, 3).map((mid) => (
              <a
                key={mid}
                href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(mid)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                title={`Open Meta Ad Library entry for ${mid}`}
              >
                {mid} ↗
              </a>
            ))}
            {item.meta_ad_ids.length > 3 && (
              <span className="text-[9px] text-slate-400">+{item.meta_ad_ids.length - 3} more</span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 self-start flex flex-col gap-1">
        {/* Cycle 380 — Use in launch deep-link. Opens /launch with the
            filename pre-pasted into the manual-name list so the operator
            can hit "Load files" without retyping. stopPropagation so the
            row-click copy-to-clipboard doesn't also fire. */}
        <Link
          to={`/ads-launcher/launch?prefill_filename=${encodeURIComponent(item.filename)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] font-semibold text-brand-700 hover:underline px-2 py-1 rounded border border-brand-200 bg-brand-50 hover:bg-brand-100 text-center"
          title="Open the launcher with this filename pre-filled in the manual-name list"
        >
          Use in launch ↗
        </Link>
        {/* Cycle 426 — direct CDN download link. The `download`
            attribute hints the browser to download instead of navigate;
            origin policy may still open in a tab for cross-origin URLs,
            but operators get a one-click path either way. */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          download={item.filename}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] font-semibold text-slate-700 hover:underline px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-center"
          title="Download the original asset from AdManage CDN"
        >
          Download ↓
        </a>
      </div>
    </div>
  );
}
