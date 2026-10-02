import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCsConfig } from "@/hooks/useCsConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MultiSelect } from "@/components/ui/multi-select";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, X, Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandOption { id: string; name: string; }

interface CsPaceRow {
  cs: string;
  newInEditing:      { count: number; points: number };
  approvedForLaunch: { count: number; points: number };
  launched:          { count: number; points: number };
}

const toDateStr = (d: Date) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const today       = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

// ─── Number cell ───────────────────────────────────────────────────────────────
function NumCell({ n, highlight }: { n: number; highlight?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-3 py-0.5 text-sm font-semibold min-w-[2.25rem]",
        n > 0
          ? highlight
            ? "bg-green-50 text-green-700 border border-green-100"
            : "bg-blue-50 text-blue-700 border border-blue-100"
          : "bg-muted text-muted-foreground"
      )}
    >
      {n}
    </span>
  );
}

// ─── Skeleton table ────────────────────────────────────────────────────────────
function SkeletonTable() {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 rounded bg-muted animate-pulse w-36" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10 ml-auto" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10" />
          <div className="h-6 rounded-full bg-muted animate-pulse w-10" />
        </div>
      ))}
    </div>
  );
}

// ─── Mobile skeleton ────────────────────────────────────────────────────────────
// Leaderboard-style placeholder rows — the wide table skeleton overflows a phone.
function SkeletonCards() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-t border-border/60 first:border-0">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="ml-auto h-4 w-7 rounded bg-muted animate-pulse" />
          <div className="h-4 w-7 rounded bg-muted animate-pulse" />
          <div className="h-6 w-9 rounded-full bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
const CSsPace = () => {
  const { getToken } = useAuth();
  const pipelineBase = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;

  // Map CS display name (cs_config.label) → email (cs_config.value) so each row
  // can show the CS's email beneath their name.
  const { data: csConfig = [] } = useCsConfig();
  const labelToEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of csConfig) {
      if (c.label && c.value) map[c.label.trim().toLowerCase()] = c.value;
    }
    return map;
  }, [csConfig]);

  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [csFilter,    setCsFilter]    = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(toDateStr(firstOfMonth));
  const [dateTo,   setDateTo]   = useState(toDateStr(today));
  // Edit Type toggle (same as CS KPIs): flips the numbers between the two edit
  // types. Self-Edited = AI/UGC tool ads (1 ad = 1 point); Editor-Edited = default.
  const [editType, setEditType] = useState<"Self-Edited" | "Editor-Edited">("Editor-Edited");

  const hasActiveFilters = brandFilter.length > 0 || csFilter.length > 0;

  // ── Brands ────────────────────────────────────────────────────────────────
  const { data: brands = [] } = useQuery<BrandOption[]>({
    queryKey: ["cs-pace-brands"],
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/brands`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch brands");
      return json.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  // ── CS options ──────────────────────────────────────────────────────────────
  const { data: csOptions = [] } = useQuery<string[]>({
    queryKey: ["cs-pace-cs-options"],
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/cs-editor-options`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch CS options");
      return json.data?.cs ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  // ── Main data ─────────────────────────────────────────────────────────────
  const payload = useMemo(() => {
    const body: Record<string, unknown> = { dateRange: { from: dateFrom, to: dateTo }, editType };
    if (brandFilter.length > 0) body.brands = brandFilter;
    if (csFilter.length > 0)    body.cs     = csFilter;
    return body;
  }, [brandFilter, csFilter, dateFrom, dateTo, editType]);

  const {
    data: rows = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<CsPaceRow[], Error>({
    queryKey: ["cs-pace-data", payload],
    queryFn: async () => {
      const res = await fetch(`${pipelineBase}/api/cs-pace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch CS pace data");
      return json.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  if (isError) toast.error(error?.message ?? "Failed to load CS pace data");

  // When specific CSs are selected, show a zero row for any of them the API
  // returned no data for, instead of dropping them from the table.
  const displayRows = useMemo(() => {
    if (csFilter.length === 0) return rows;
    const returned = new Set(rows.map((r) => r.cs?.trim().toLowerCase()));
    const zeroRows: CsPaceRow[] = csFilter
      .filter((name) => !returned.has(name.trim().toLowerCase()))
      .map((name) => ({
        cs: name,
        newInEditing:      { count: 0, points: 0 },
        approvedForLaunch: { count: 0, points: 0 },
        launched:          { count: 0, points: 0 },
      }));
    return [...rows, ...zeroRows].sort((a, b) => a.cs.localeCompare(b.cs));
  }, [rows, csFilter]);

  // ── Mobile leaderboard state ────────────────────────────────────────────────
  // The mobile view is one card listing everyone, sorted by Approved (a pace
  // leaderboard). A Points/Qty toggle picks the unit shown in the compact rows;
  // tapping a row opens the full Points + Quantity breakdown for that CS.
  const [mobileUnit, setMobileUnit] = useState<"points" | "count">("points");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const mobileRows = useMemo(
    () =>
      [...displayRows].sort(
        (a, b) => b.launched[mobileUnit] - a.launched[mobileUnit] || a.cs.localeCompare(b.cs)
      ),
    [displayRows, mobileUnit]
  );

  const clearFilters = () => {
    setBrandFilter([]);
    setCsFilter([]);
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        {/* Header */}
        <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              <h1 className="page-title">CSs Pace</h1>
              {isFetching && !isLoading && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="page-description">Points and quantity new in editing, approved for launch and launched per CS within the selected range</p>
          </div>

          {/* Edit Type toggle — flips counts/points between the two edit types */}
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

        {/* Filter panel */}
        <Card className="rounded-2xl mb-5">
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Brand</p>
                <MultiSelect
                  options={brands.map((b) => ({ value: b.name, label: b.name }))}
                  value={brandFilter}
                  onChange={setBrandFilter}
                  placeholder="All brands"
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">CS</p>
                <MultiSelect
                  options={csOptions.map((c) => ({ value: c, label: c }))}
                  value={csFilter}
                  onChange={setCsFilter}
                  placeholder="All CSs"
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Date Range</p>
                <DateRangePicker
                  initialDateFrom={dateFrom || undefined}
                  initialDateTo={dateTo || undefined}
                  onUpdate={({ range }) => {
                    setDateFrom(toDateStr(range.from));
                    setDateTo(toDateStr(range.to ?? range.from));
                  }}
                  align="start"
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

        {/* Table */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold">CS Performance</CardTitle>
              {/* Mobile unit toggle — the leaderboard rows show one unit at a time */}
              <SegmentedToggle
                className="md:hidden"
                size="sm"
                options={[
                  { value: "points", label: "Points" },
                  { value: "count", label: "Qty" },
                ]}
                value={mobileUnit}
                onChange={setMobileUnit}
              />
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 min-w-0">
            {isLoading ? (
              <>
                <div className="hidden md:block"><SkeletonTable /></div>
                <div className="md:hidden"><SkeletonCards /></div>
              </>
            ) : displayRows.length === 0 ? (
              <div className="py-14 text-center text-muted-foreground text-sm">
                No data for the selected filters and date range.
              </div>
            ) : (
              <>
              {/* Desktop table (>= md) — contained horizontal scroll on tablet */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60 lg:rounded-none lg:border-0">
                <table className="w-full text-sm border-collapse min-w-[720px]">
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        className="text-left py-3 pr-6 font-medium text-muted-foreground align-bottom border-b border-border"
                      >
                        CS
                      </th>
                      <th
                        colSpan={3}
                        className="text-center py-2 px-4 font-medium text-muted-foreground border-b border-border border-l border-border/60"
                      >
                        Points
                      </th>
                      <th
                        colSpan={3}
                        className="text-center py-2 px-4 font-medium text-muted-foreground border-b border-border border-l border-border/60"
                      >
                        Quantity
                      </th>
                    </tr>
                    <tr className="border-b border-border">
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground border-l border-border/60 whitespace-nowrap">
                        New in editing
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Approved for launch
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Launched
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground border-l border-border/60 whitespace-nowrap">
                        New in editing
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Approved for launch
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Launched
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => (
                      <tr
                        key={row.cs}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 pr-6">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{row.cs}</span>
                            {labelToEmail[row.cs?.trim().toLowerCase()] && (
                              <span className="text-xs text-muted-foreground">
                                {labelToEmail[row.cs.trim().toLowerCase()]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center border-l border-border/60">
                          <NumCell n={row.newInEditing.points} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <NumCell n={row.approvedForLaunch.points} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <NumCell n={row.launched.points} highlight />
                        </td>
                        <td className="py-3 px-4 text-center border-l border-border/60">
                          <NumCell n={row.newInEditing.count} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <NumCell n={row.approvedForLaunch.count} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <NumCell n={row.launched.count} highlight />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile comparison leaderboard (< md) — everyone sorted by Approved;
                  tap a row to expand the full Points + Quantity breakdown. */}
              <div className="md:hidden">
                {/* Column header */}
                <div className="grid grid-cols-[1fr_2.75rem_2.75rem_3rem] items-center gap-x-2 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5">CS</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1.5">Edit</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1.5">Appr</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 text-right py-1.5">Launch</span>
                </div>

                {mobileRows.map((row) => {
                  const open = expanded.has(row.cs);
                  const email = labelToEmail[row.cs?.trim().toLowerCase()];
                  return (
                    <div key={row.cs} className="border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.cs)}
                        className="w-full grid grid-cols-[1fr_2.75rem_2.75rem_3rem] items-center gap-x-2 px-1 py-2.5 text-left active:bg-muted/40"
                      >
                        <span className="flex items-center gap-1 min-w-0">
                          <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
                          <span className="text-sm font-medium text-foreground truncate">{row.cs}</span>
                        </span>
                        <span className="text-sm text-muted-foreground text-right tabular-nums">{row.newInEditing[mobileUnit]}</span>
                        <span className="text-sm text-muted-foreground text-right tabular-nums">{row.approvedForLaunch[mobileUnit]}</span>
                        <span className="flex justify-end"><NumCell n={row.launched[mobileUnit]} highlight /></span>
                      </button>

                      {open && (
                        <div className="px-1 pb-3">
                          {email && <p className="text-xs text-muted-foreground break-all mb-2 pl-5">{email}</p>}
                          <div className="rounded-lg border border-border px-3 py-1.5 grid grid-cols-[1fr_3rem_3rem] items-center gap-x-3">
                            <span />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1">Points</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1">Qty</span>

                            <span className="text-sm text-muted-foreground py-2 border-t border-border/60">New in editing</span>
                            <span className="text-sm font-semibold text-foreground text-right tabular-nums py-2 border-t border-border/60">{row.newInEditing.points}</span>
                            <span className="text-sm font-semibold text-muted-foreground text-right tabular-nums py-2 border-t border-border/60">{row.newInEditing.count}</span>

                            <span className="text-sm text-muted-foreground py-2 border-t border-border/60">Approved for launch</span>
                            <span className="text-sm font-semibold text-foreground text-right tabular-nums py-2 border-t border-border/60">{row.approvedForLaunch.points}</span>
                            <span className="text-sm font-semibold text-muted-foreground text-right tabular-nums py-2 border-t border-border/60">{row.approvedForLaunch.count}</span>

                            <span className="text-sm font-medium text-emerald-700 py-2 border-t border-border/60">Launched</span>
                            <span className="text-sm font-bold text-emerald-700 text-right tabular-nums py-2 border-t border-border/60">{row.launched.points}</span>
                            <span className="text-sm font-bold text-emerald-600 text-right tabular-nums py-2 border-t border-border/60">{row.launched.count}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CSsPace;
