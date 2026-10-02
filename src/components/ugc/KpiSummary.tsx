/**
 * KpiSummary — minimal performance card for the per-automation +
 * cross-tool dashboards.
 *
 * Shows total spend, NC-ROAS, and per-channel split (Meta vs AppLovin)
 * for a backend KPI endpoint that follows the AdIdsKpi shape from
 * marketingDb.ts.
 *
 * Date filter: shadcn date inputs feeding `from` and `to` query params.
 * Reads from URL hash so refreshes / shareable links keep the selection.
 *
 * Usage:
 *   <KpiSummary endpoint="/api/automations/:id/kpi" title="Performance" />
 *   <KpiSummary endpoint="/api/tool-performance" title="All ads through tool" />
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { DollarSign, TrendingUp, Target, Calendar } from "lucide-react";

interface ChannelKpi {
  spend: number;
  ncRevenue: number;
  ncOrders: number;
  ncRoas: number;
}
interface AdIdsKpi {
  adIdsRequested: number;
  adIdsWithData: number;
  total: ChannelKpi;
  meta: ChannelKpi;
  applovin: ChannelKpi;
}
interface KpiResponse {
  adIdCount: number;
  buildCount?: number;
  runs?: number;
  from: string | null;
  to: string | null;
  kpi: AdIdsKpi;
}

const fmtMoney = (n: number) =>
  n >= 1000
    ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`
    : `$${n.toFixed(0)}`;
const fmtRoas = (n: number) => (n > 0 ? `${n.toFixed(2)}x` : "—");
const todayIso = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
};

const PRESETS: Array<{ id: string; label: string; from: () => string; to: () => string }> = [
  { id: "7d",  label: "Last 7 days",   from: () => isoDaysAgo(7),  to: () => todayIso() },
  { id: "30d", label: "Last 30 days",  from: () => isoDaysAgo(30), to: () => todayIso() },
  { id: "90d", label: "Last 90 days",  from: () => isoDaysAgo(90), to: () => todayIso() },
  { id: "ytd", label: "Year to date",  from: () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10), to: () => todayIso() },
  { id: "all", label: "All time",      from: () => "", to: () => "" },
];

export function KpiSummary({ endpoint, title }: { endpoint: string; title: string }) {
  // Default to "Last 30 days" — that's the typical strategist window when
  // sizing an automation. "All time" is one click away.
  const [preset, setPreset] = useState<string>("30d");
  const presetCfg = useMemo(() => PRESETS.find((p) => p.id === preset) || PRESETS[1], [preset]);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const from = preset === "custom" ? customFrom : presetCfg.from();
  const to   = preset === "custom" ? customTo   : presetCfg.to();
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to)   qs.set("to", to);
  const url = qs.toString() ? `${endpoint}?${qs.toString()}` : endpoint;

  const { data, isLoading, error } = useQuery<KpiResponse>({
    queryKey: [`${API_BASE}${url}`],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    refetchInterval: 5 * 60 * 1000, // 5min — spend data refreshes nightly
    refetchOnWindowFocus: false,
  });

  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-4 mb-4">
      <header className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground/95">{title}</h2>
        <span className="text-[11px] text-muted-foreground">
          {data
            ? `${data.kpi.adIdsWithData} of ${data.kpi.adIdsRequested} ads have data` +
              (data.runs != null ? ` · ${data.runs} runs` : "") +
              (data.buildCount != null ? ` · ${data.buildCount} batches` : "")
            : isLoading ? "loading…" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-[11.5px]">
          <Calendar className="size-3 text-muted-foreground/70" />
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                preset === p.id
                  ? "bg-primary/15 text-primary border border-primary/40"
                  : "bg-muted/40 text-muted-foreground border border-border/40 hover:bg-muted/60"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset("custom")}
            className={`px-2 py-1 rounded-md font-medium transition-colors ${
              preset === "custom"
                ? "bg-primary/15 text-primary border border-primary/40"
                : "bg-muted/40 text-muted-foreground border border-border/40 hover:bg-muted/60"
            }`}
          >
            Custom
          </button>
          {preset === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]"
              />
              <span className="text-muted-foreground/60">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]"
              />
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          Couldn't load KPI data: {String((error as any)?.message || error)}
        </div>
      )}

      {/* 3-column total + 2-column per-channel split */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiBlock
          icon={<DollarSign className="size-3.5 text-emerald-400" />}
          label="Total spend"
          value={fmtMoney(data?.kpi.total.spend || 0)}
          sub={data ? `${data.kpi.total.ncOrders.toLocaleString()} NC orders` : ""}
          tone="emerald"
          highlight
        />
        <KpiBlock
          icon={<TrendingUp className="size-3.5 text-sky-400" />}
          label="NC revenue"
          value={fmtMoney(data?.kpi.total.ncRevenue || 0)}
          sub=""
          tone="sky"
        />
        <KpiBlock
          icon={<Target className="size-3.5 text-primary" />}
          label="NC-ROAS"
          value={fmtRoas(data?.kpi.total.ncRoas || 0)}
          sub=""
          tone="primary"
          highlight
        />
        <KpiBlock
          icon={<MetaIcon />}
          label="Meta"
          value={fmtMoney(data?.kpi.meta.spend || 0)}
          sub={data ? `${fmtRoas(data.kpi.meta.ncRoas)} NC-ROAS` : ""}
          tone="muted"
        />
        <KpiBlock
          icon={<ApplovinIcon />}
          label="AppLovin"
          value={fmtMoney(data?.kpi.applovin.spend || 0)}
          sub={data ? `${fmtRoas(data.kpi.applovin.ncRoas)} NC-ROAS` : ""}
          tone="muted"
        />
      </div>

      {data && data.kpi.adIdsWithData === 0 && (
        <div className="mt-3 text-[11.5px] text-muted-foreground/80 italic">
          No spend data for the {data.kpi.adIdsRequested === 0 ? "ad" : `${data.kpi.adIdsRequested} ad${data.kpi.adIdsRequested === 1 ? "" : "s"}`} in this window. Either the ads aren't live yet, or the date filter is too narrow.
        </div>
      )}
    </section>
  );
}

function KpiBlock({ icon, label, value, sub, tone, highlight }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  tone: "emerald" | "sky" | "primary" | "muted"; highlight?: boolean;
}) {
  const accent = {
    emerald: "border-emerald-500/30",
    sky:     "border-sky-500/30",
    primary: "border-primary/30",
    muted:   "border-border/40",
  }[tone];
  return (
    <div className={`rounded-md border ${accent} bg-background/40 p-2.5 flex flex-col gap-0.5`}>
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground/85">
        {icon}
        {label}
      </div>
      <div className={`text-[22px] font-bold tabular-nums tracking-tight leading-none ${highlight ? "text-foreground" : "text-foreground/85"}`}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
}

// Tiny inline brand icons so we don't pull in a 2nd icon library.
function MetaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-[#0a8df9]" aria-hidden>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5.4 13.4c-1.1 2.2-3.3 2.6-5.4-.6-2 3.2-4.3 2.8-5.4.6-1-2-.4-5.6 2-7.4 1.8-1.4 3.4-.6 4.4 1l-1.6 2.4c-.7-1-1.4-1.4-2.2-.6-1 1-1.4 3.2-.8 4.4.4.8 1.2.8 2-.6L13.6 11l1.8 3c.8 1.4 1.6 1.4 2 .6.6-1.2.2-3.4-.8-4.4-.8-.8-1.5-.4-2.2.6L12.8 8.4c1-1.6 2.6-2.4 4.4-1 2.4 1.8 3 5.4 2 7.4z"/>
    </svg>
  );
}
function ApplovinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-[#ff4040]" aria-hidden>
      <path d="M12 2L1 21h22L12 2zm0 5l7.6 13H4.4L12 7z"/>
    </svg>
  );
}
