import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MultiSelect } from "@/components/ui/multi-select";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Kanban, X, Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandOption  { id: string; name: string; }
interface ProductOption { id: string; name: string; brand_id: string | null; }

interface PipelineData {
  pipeline: {
    ugcSourcing:      number;
    vidBriefSourcing: number;
    imgBriefSourcing: number;
    tslBriefSourcing: number;
    editingTotal:     number;
    inWork:           number;
    pendingReview:    number;
    inRevisions:      number;
    readyToLaunchTotal:           number;
    readyToLaunchToDo:            number;
    readyToLaunchPause:           number;
    readyToLaunchInWork:          number;
    readyToLaunchPendingApproval: number;
    readyToLaunchBlocked:         number;
    readyToLaunchRejected:        number;
    readyToLaunchComplete:        number;
  };
  launched: {
    meta:     { today: number; past7: number; past14: number; past30: number; custom?: number };
    applovin: { today: number; past7: number; past14: number; past30: number; custom?: number };
  };
}

const toDateStr = (d: Date) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// ─── Count badge ───────────────────────────────────────────────────────────────
function CountBadge({ n }: { n: number | undefined }) {
  if (n === undefined) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-3 py-0.5 text-sm font-semibold min-w-[2.25rem]",
        n > 0
          ? "bg-blue-50 text-blue-700 border border-blue-100"
          : "bg-muted text-muted-foreground"
      )}
    >
      {n}
    </span>
  );
}

// ─── Single pipeline row ───────────────────────────────────────────────────────
function PipelineRow({
  label,
  count,
  bold,
  sub,
}: {
  label: string;
  count: number | undefined;
  bold?: boolean;
  sub?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-1 py-3 border-b border-border/50 last:border-b-0",
        bold && "bg-muted/40 rounded-md px-3 -mx-1"
      )}
    >
      <span className={cn("text-sm text-foreground", bold && "font-semibold", sub && "text-muted-foreground")}>
        {label}
      </span>
      <CountBadge n={count} />
    </div>
  );
}

// ─── Sub-stage breakdown — each row carries a subtle proportional bar (relative to
// the largest sub-stage in the group): a distinctive, minimal alternative to a rail. ─
function SubStageGroup({ rows }: { rows: [string, number | undefined][] }) {
  const max = Math.max(1, ...rows.map(([, n]) => n ?? 0));
  return (
    <div className="ml-3 mt-2 mb-2 space-y-1">
      {rows.map(([label, count]) => (
        <div key={label} className="relative overflow-hidden rounded-md bg-muted/25">
          <div
            className="absolute inset-y-0 left-0 bg-blue-100/70"
            style={{ width: `${Math.round(((count ?? 0) / max) * 100)}%` }}
            aria-hidden
          />
          <div className="relative flex items-center justify-between px-3 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold text-blue-700 tabular-nums">{count ?? "—"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-1 py-3">
          <div className="h-4 rounded bg-muted animate-pulse w-40" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10" />
        </div>
      ))}
    </div>
  );
}

// ─── Launched column ───────────────────────────────────────────────────────────
function LaunchedColumn({
  title,
  icon,
  data,
  hasCustom,
}: {
  title: string;
  icon: React.ReactNode;
  data: { today: number; past7: number; past14: number; past30: number; custom?: number } | undefined;
  hasCustom: boolean;
}) {
  const rows: [string, number | undefined][] = [
    ["Today",        data?.today],
    ["Past 7 Days",  data?.past7],
    ["Past 14 Days", data?.past14],
    ["Past 30 Days", data?.past30],
  ];

  return (
    <div className="bg-muted/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="space-y-0">
        {rows.map(([label, count]) => (
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <CountBadge n={count} />
          </div>
        ))}
        {hasCustom && (
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Custom Range</span>
            <CountBadge n={data?.custom} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
const PipelineReport = () => {
  const { getToken } = useAuth();
  const pipelineBase = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [brandFilter,    setBrandFilter]    = useState<string[]>([]);
  const [productFilter,  setProductFilter]  = useState<string[]>([]);
  const [adTypeFilter,   setAdTypeFilter]   = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [csFilter,       setCsFilter]       = useState<string[]>([]);
  const [editorFilter,   setEditorFilter]   = useState<string[]>([]);
  const [angleFilter,    setAngleFilter]    = useState<string[]>([]);
  // Edit Type toggle — Editor-Edited (default) vs Self-Edited, like CS Pace / KPIs.
  const [editType, setEditType] = useState<"Editor-Edited" | "Self-Edited">("Editor-Edited");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");

  const hasActiveFilters =
    brandFilter.length > 0 || productFilter.length > 0 ||
    adTypeFilter !== "all" || platformFilter !== "all" ||
    csFilter.length > 0 || editorFilter.length > 0 || angleFilter.length > 0;

  // ── Metadata queries (brands, products, cs/editors) ───────────────────────
  const { data: brands = [] } = useQuery<BrandOption[]>({
    queryKey: ["pipeline-report-brands"],
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/brands`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch brands");
      return json.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const { data: allProducts = [] } = useQuery<ProductOption[]>({
    queryKey: ["pipeline-report-products"],
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/products`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch products");
      return json.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const selectedBrandIds = useMemo(() => {
    const nameSet = new Set(brandFilter);
    return brands.filter((b) => nameSet.has(b.name)).map((b) => b.id);
  }, [brands, brandFilter]);

  const filteredProducts = useMemo(() => {
    if (selectedBrandIds.length === 0) return allProducts;
    const idSet = new Set(selectedBrandIds);
    return allProducts.filter((p) => p.brand_id && idSet.has(p.brand_id));
  }, [allProducts, selectedBrandIds]);

  // Angle filter is product-specific — only available when exactly one product is selected
  const singleProductId = useMemo(() => {
    if (productFilter.length !== 1) return null;
    return allProducts.find((p) => p.name === productFilter[0])?.id ?? null;
  }, [productFilter, allProducts]);

  const { data: angleOptions = [] } = useQuery<{ id: string; name: string; sub_angle: string }[]>({
    queryKey: ["pipeline-report-angles", singleProductId],
    enabled: !!singleProductId,
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/cs-kpis/angles?productId=${singleProductId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch angles");
      return json.data?.angles ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const { data: csEditorOptions } = useQuery<{ cs: string[]; editors: string[] }>({
    queryKey: ["pipeline-report-cs-editors", selectedBrandIds[0] ?? null],
    queryFn: async () => {
      const url = new URL(`${pipelineBase}/api/cs-editor-options`);
      if (selectedBrandIds.length === 1) url.searchParams.set("brandId", selectedBrandIds[0]);
      const res  = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch CS/Editor options");
      return json.data;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const csList    = csEditorOptions?.cs      ?? [];
  const editorList = csEditorOptions?.editors ?? [];

  // ── Main pipeline data query ───────────────────────────────────────────────
  const payload = useMemo(() => {
    const body: Record<string, unknown> = {};
    if (brandFilter.length > 0)   body.brands   = brandFilter;
    if (productFilter.length > 0) body.products  = productFilter;
    if (adTypeFilter !== "all")   body.adType    = adTypeFilter;
    if (platformFilter !== "all") body.platform  = platformFilter;
    if (csFilter.length > 0)      body.cs        = csFilter;
    if (editorFilter.length > 0)  body.editors   = editorFilter;
    if (singleProductId && angleFilter.length > 0) body.angles = angleFilter;
    if (customStart && customEnd) {
      body.customDateRange = { from: customStart, to: customEnd };
    }
    body.editType = editType;
    return body;
  }, [brandFilter, productFilter, adTypeFilter, platformFilter, csFilter, editorFilter,
      singleProductId, angleFilter, customStart, customEnd, editType]);

  const {
    data: pipelineData,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<PipelineData, Error>({
    queryKey: ["pipeline-report-data", payload],
    queryFn: async () => {
      const res = await fetch(`${pipelineBase}/api/pipeline-dashboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch pipeline data");
      return {
        pipeline: {
          ugcSourcing:      json.pipeline.ugcSourcing,
          vidBriefSourcing: json.pipeline.vidBriefSourcing,
          imgBriefSourcing: json.pipeline.imgBriefSourcing,
          tslBriefSourcing: json.pipeline.tslBriefSourcing,
          editingTotal:     json.pipeline.editing?.total,
          inWork:           json.pipeline.editing?.inWork,
          pendingReview:    json.pipeline.editing?.pendingReview,
          inRevisions:      json.pipeline.editing?.inRevisions,
          readyToLaunchTotal:           json.pipeline.readyToLaunch?.total,
          readyToLaunchToDo:            json.pipeline.readyToLaunch?.toDo,
          readyToLaunchPause:           json.pipeline.readyToLaunch?.pause,
          readyToLaunchInWork:          json.pipeline.readyToLaunch?.inWork,
          readyToLaunchPendingApproval: json.pipeline.readyToLaunch?.pendingApproval,
          readyToLaunchBlocked:         json.pipeline.readyToLaunch?.blocked,
          readyToLaunchRejected:        json.pipeline.readyToLaunch?.rejected,
          readyToLaunchComplete:        json.pipeline.readyToLaunch?.complete,
        },
        launched: {
          meta: {
            today:  json.launched.meta?.today,
            past7:  json.launched.meta?.past7Days,
            past14: json.launched.meta?.past14Days,
            past30:  json.launched.meta?.past30Days,
            custom:  json.launched.meta?.customRange,
          },
          applovin: {
            today:  json.launched.applovin?.today,
            past7:  json.launched.applovin?.past7Days,
            past14: json.launched.applovin?.past14Days,
            past30: json.launched.applovin?.past30Days,
            custom: json.launched.applovin?.customRange,
          },
        },
      } as PipelineData;
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    // Keep previous data visible while a new fetch runs — avoids skeleton flash on filter changes
    placeholderData: (prev) => prev,
  });

  // Surface errors via toast without crashing the UI
  if (isError) toast.error(error?.message ?? "Failed to load pipeline data");

  const p = pipelineData?.pipeline;
  const l = pipelineData?.launched;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearFilters = () => {
    setBrandFilter([]);
    setProductFilter([]);
    setAdTypeFilter("all");
    setPlatformFilter("all");
    setCsFilter([]);
    setEditorFilter([]);
    setAngleFilter([]);
  };

  // ── Sourcing rows visibility ───────────────────────────────────────────────
  const show = (type: string) => adTypeFilter === "all" || adTypeFilter === type;

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        {/* Header */}
        <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Kanban className="w-6 h-6 text-primary" />
              <h1 className="page-title">Pipeline Report</h1>
              {isFetching && !isLoading && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="page-description">Live snapshot of ads across all pipeline stages</p>
          </div>

          {/* Edit Type toggle — Editor-Edited (default) vs Self-Edited */}
          <SegmentedToggle
            options={[
              { value: "Editor-Edited", label: "Editor-Edited" },
              { value: "Self-Edited", label: "Self-Edited" },
            ]}
            value={editType}
            onChange={setEditType}
            fullWidthOnMobile
            className="self-start"
          />
        </div>

        {/* ── Filter panel ─────────────────────────────────────────────────── */}
        <Card className="rounded-2xl mb-5">
          <CardContent className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Brand */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Brand</p>
                <MultiSelect
                  options={brands.map((b) => ({ value: b.name, label: b.name }))}
                  value={brandFilter}
                  onChange={(v) => {
                    setBrandFilter(v);
                    setProductFilter([]);
                    setAngleFilter([]);
                  }}
                  placeholder="All brands"
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>

              {/* Product */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Product</p>
                <MultiSelect
                  options={filteredProducts.map((p) => ({ value: p.name, label: p.name }))}
                  value={productFilter}
                  onChange={(v) => {
                    setProductFilter(v);
                    setAngleFilter([]);
                  }}
                  placeholder="All products"
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>

              {/* Angle — only when exactly one product is selected (angles are product-specific) */}
              {singleProductId && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Angle</p>
                  <MultiSelect
                    options={angleOptions.map((a) => ({ value: a.sub_angle, label: a.name }))}
                    value={angleFilter}
                    onChange={setAngleFilter}
                    placeholder="All angles"
                    className="h-9 rounded-lg border-border bg-muted text-sm"
                  />
                </div>
              )}

              {/* Ad Type */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Ad Type</p>
                <Select value={adTypeFilter} onValueChange={setAdTypeFilter}>
                  <SelectTrigger className="h-9 rounded-lg border-border bg-muted text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="VID">VID</SelectItem>
                    <SelectItem value="IMG">IMG</SelectItem>
                    <SelectItem value="TSL">TSL</SelectItem>
                    <SelectItem value="UGC">UGC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Platform */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Platform</p>
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="h-9 rounded-lg border-border bg-muted text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">No filter</SelectItem>
                    <SelectItem value="meta">Includes Meta</SelectItem>
                    <SelectItem value="applovin">Includes Applovin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* CS */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">CS</p>
                <MultiSelect
                  options={csList.map((c) => ({ value: c, label: c }))}
                  value={csFilter}
                  onChange={setCsFilter}
                  placeholder="All CSs"
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>

              {/* Editor */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Editor</p>
                <MultiSelect
                  options={editorList.map((e) => ({ value: e, label: e }))}
                  value={editorFilter}
                  onChange={setEditorFilter}
                  placeholder="All editors"
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end mt-3">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1 text-muted-foreground">
                  <X className="w-3 h-3" />
                  Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── Section 1: In Pipeline ──────────────────────────────────────── */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">In Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <SkeletonRows count={8} />
              ) : (
                <div>
                  {/* Sourcing rows — conditional on ad type filter */}
                  {show("UGC") && <PipelineRow label="UGC Sourcing"        count={p?.ugcSourcing} />}
                  {show("VID") && <PipelineRow label="VID Brief / Sourcing" count={p?.vidBriefSourcing} />}
                  {show("IMG") && <PipelineRow label="IMG Brief / Sourcing" count={p?.imgBriefSourcing} />}
                  {show("TSL") && <PipelineRow label="TSL Brief / Sourcing" count={p?.tslBriefSourcing} />}

                  {/* Editing parent */}
                  <PipelineRow label="Editing" count={p?.editingTotal} bold />
                  <SubStageGroup rows={[
                    ["IN WORK",        p?.inWork],
                    ["PENDING REVIEW", p?.pendingReview],
                    ["IN REVISIONS",   p?.inRevisions],
                  ]} />

                  {/* Ready to Launch parent */}
                  <PipelineRow label="Ready to Launch"  count={p?.readyToLaunchTotal} bold />
                  <SubStageGroup rows={[
                    ["TO DO",            p?.readyToLaunchToDo],
                    ["PAUSE",            p?.readyToLaunchPause],
                    ["IN WORK",          p?.readyToLaunchInWork],
                    ["PENDING APPROVAL", p?.readyToLaunchPendingApproval],
                    ["BLOCKED",          p?.readyToLaunchBlocked],
                    ["REJECTED",         p?.readyToLaunchRejected],
                    ["COMPLETE",         p?.readyToLaunchComplete],
                  ]} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 2: Launched ─────────────────────────────────────────── */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base font-semibold">Launched</CardTitle>
                <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
                  <DateRangePicker
                    initialDateFrom={customStart || undefined}
                    initialDateTo={customEnd || undefined}
                    onUpdate={({ range }) => {
                      setCustomStart(toDateStr(range.from));
                      setCustomEnd(toDateStr(range.to ?? range.from));
                    }}
                    align="end"
                    className="min-w-0 flex-1 sm:flex-none"
                  />
                  {customStart && customEnd && (
                    <button
                      onClick={() => { setCustomStart(""); setCustomEnd(""); }}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="Clear custom range"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                  <SkeletonRows count={5} />
                  <SkeletonRows count={5} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                  <LaunchedColumn
                    title="Meta"
                    icon={<Monitor className="w-4 h-4 text-blue-500" />}
                    data={l?.meta}
                    hasCustom={!!(customStart && customEnd)}
                  />
                  <LaunchedColumn
                    title="Applovin"
                    icon={<Smartphone className="w-4 h-4 text-orange-500" />}
                    data={l?.applovin}
                    hasCustom={!!(customStart && customEnd)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PipelineReport;
