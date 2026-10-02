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
import { Loader2, X, Activity, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveAs } from "file-saver";

interface BrandOption { id: string; name: string; }

interface EditorPaceRow {
  editor: string;
  /** Resolved from the brand editor roster by the API; may be absent on client-seeded zero rows. */
  email?: string | null;
  /** When the editor was added to the platform (ISO timestamp), for the Excel export. */
  addedAt?: string | null;
  delivered: { count: number; points: number };
  approved: { count: number; points: number };
}

const toDateStr = (d: Date) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Timestamps come back as ISO strings (`2026-07-14T09:12:33+00:00`). Slice the
// UTC date part rather than parsing to a Date — going through the local timezone
// would shift the join date a day for editors onboarded near midnight.
const toDayStr = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : "");

// ─── Excel export shape + palette (ARGB) ───────────────────────────────────────
const BLUE   = "FF1D4ED8"; // header row fill
const PURPLE = "FF7C3AED"; // rows for editors who joined within the selected range
const WHITE  = "FFFFFFFF";
const GREY   = "FF64748B";
const LEGEND_LABEL = "Joined in range";

const COLUMNS = [
  { header: "Editor",                      width: 26 },
  { header: "Email",                       width: 32 },
  { header: "Added to Platform",           width: 20 },
  { header: "Points Delivered for Review", width: 17 },
  { header: "Points Approved",             width: 14 },
  { header: "Qty Delivered for Review",    width: 15 },
  { header: "Qty Approved",                width: 13 },
];

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
          <div className="h-6 w-9 rounded-full bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
const EditorsPace = () => {
  const { getToken } = useAuth();
  const pipelineBase = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;

  // Map editor display name (cs_config.label) → email (cs_config.value) so each
  // row can show the editor's email beneath their name.
  const { data: csConfig = [] } = useCsConfig();
  const labelToEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of csConfig) {
      if (c.label && c.value) map[c.label.trim().toLowerCase()] = c.value;
    }
    return map;
  }, [csConfig]);

  const [brandFilter,  setBrandFilter]  = useState<string[]>([]);
  const [editorFilter, setEditorFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(toDateStr(firstOfMonth));
  const [dateTo,   setDateTo]   = useState(toDateStr(today));
  const [isExporting, setIsExporting] = useState(false);

  const hasActiveFilters = brandFilter.length > 0 || editorFilter.length > 0;

  // ── Brands ────────────────────────────────────────────────────────────────
  const { data: brands = [] } = useQuery<BrandOption[]>({
    queryKey: ["editors-pace-brands"],
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/brands`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch brands");
      return json.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  // ── Editor options ────────────────────────────────────────────────────────
  const { data: editorOptions = [] } = useQuery<string[]>({
    queryKey: ["editors-pace-editor-options"],
    queryFn: async () => {
      const res  = await fetch(`${pipelineBase}/api/cs-editor-options`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch editor options");
      return json.data?.editors ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  // ── Main data ─────────────────────────────────────────────────────────────
  const payload = useMemo(() => {
    const body: Record<string, unknown> = { dateRange: { from: dateFrom, to: dateTo } };
    if (brandFilter.length > 0)  body.brands  = brandFilter;
    if (editorFilter.length > 0) body.editors = editorFilter;
    return body;
  }, [brandFilter, editorFilter, dateFrom, dateTo]);

  const {
    data: rows = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<EditorPaceRow[], Error>({
    queryKey: ["editors-pace-data", payload],
    queryFn: async () => {
      const res = await fetch(`${pipelineBase}/api/editors-pace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to fetch editors pace data");
      return json.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  if (isError) toast.error(error?.message ?? "Failed to load editors pace data");

  // When specific editors are selected, show a zero row for any of them the API
  // returned no data for, instead of dropping them from the table.
  const displayRows = useMemo(() => {
    if (editorFilter.length === 0) return rows;
    const returned = new Set(rows.map((r) => r.editor?.trim().toLowerCase()));
    const zeroRows: EditorPaceRow[] = editorFilter
      .filter((name) => !returned.has(name.trim().toLowerCase()))
      .map((name) => ({
        editor: name,
        delivered: { count: 0, points: 0 },
        approved:  { count: 0, points: 0 },
      }));
    return [...rows, ...zeroRows].sort((a, b) => a.editor.localeCompare(b.editor));
  }, [rows, editorFilter]);

  // ── Mobile leaderboard state ────────────────────────────────────────────────
  // The mobile view is one card listing every editor, sorted by Approved (a pace
  // leaderboard). A Points/Qty toggle picks the unit shown in the compact rows;
  // tapping a row opens the full Points + Quantity breakdown for that editor.
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
        (a, b) => b.approved[mobileUnit] - a.approved[mobileUnit] || a.editor.localeCompare(b.editor)
      ),
    [displayRows, mobileUnit]
  );

  const clearFilters = () => {
    setBrandFilter([]);
    setEditorFilter([]);
  };

  // ── Excel export ────────────────────────────────────────────────────────────
  // Exports exactly what the filters currently select — the rows are already in
  // memory, so no refetch is needed. "Added to Platform" comes from the API
  // (users.created_at, falling back to the editor's cs_config row).
  //
  // Built with exceljs rather than the `xlsx` used elsewhere: the community
  // build of xlsx accepts cell styles and silently discards them (fills are a
  // SheetJS Pro feature), so the blue header and purple joined-in-range rows
  // would never reach the file.
  const handleExport = async () => {
    if (displayRows.length === 0) {
      toast.info("No data to export.");
      return;
    }
    setIsExporting(true);
    try {
      // Loaded on demand: exceljs is ~940kB and only this button needs it, so a
      // static import would put it on every page load of the whole app.
      const ExcelJS = (await import("exceljs")).default;

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Editors Pace");

      ws.columns = COLUMNS.map((c) => ({ width: c.width }));

      // Title + legend. Doubles as provenance: the sheet records the range it
      // was pulled for, so a forwarded file can't be mistaken for another period.
      ws.addRow([`Editors Pace — ${dateFrom} to ${dateTo}`]).font = { bold: true, size: 14 };

      const legend = ws.addRow([
        LEGEND_LABEL,
        `= editor was added to the platform between ${dateFrom} and ${dateTo}`,
      ]);
      legend.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
      legend.getCell(1).font = { bold: true, color: { argb: WHITE } };
      legend.getCell(2).font = { italic: true, color: { argb: GREY } };

      ws.addRow([]); // spacer

      const headerRow = ws.addRow(COLUMNS.map((c) => c.header));
      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
        cell.font = { bold: true, color: { argb: WHITE } };
        cell.alignment = { vertical: "middle", wrapText: true };
      });

      for (const row of displayRows) {
        const added = toDayStr(row.addedAt);
        // "Joined in range" — both are YYYY-MM-DD, so lexicographic compare is
        // a correct date compare and needs no timezone handling.
        const joinedInRange = !!added && added >= dateFrom && added <= dateTo;

        const r = ws.addRow([
          row.editor,
          row.email || labelToEmail[row.editor?.trim().toLowerCase()] || "",
          added,
          row.delivered.points,
          row.approved.points,
          row.delivered.count,
          row.approved.count,
        ]);

        if (joinedInRange) {
          r.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
            cell.font = { color: { argb: WHITE } };
          });
        }
      }

      // Keep the header visible over 70+ rows, and let the recipient sort/filter.
      ws.views = [{ state: "frozen", ySplit: headerRow.number }];
      ws.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to:   { row: headerRow.number + displayRows.length, column: COLUMNS.length },
      };

      const buf = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `editors-pace_${dateFrom}_${dateTo}.xlsx`,
      );
      toast.success(`Exported ${displayRows.length} editors.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        {/* Header */}
        <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              <h1 className="page-title">Editors Pace</h1>
              {isFetching && !isLoading && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="page-description">Points and quantity delivered and approved per editor within the selected range</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            // Gate on isFetching, NOT isLoading: `placeholderData: (prev) => prev` keeps
            // the query "success" while a filter change refetches, so isLoading stays
            // false and the button would happily export the PREVIOUS range's rows into a
            // file named for the NEW one.
            disabled={isFetching || isExporting || displayRows.length === 0}
            className="gap-2 h-9 px-3 sm:px-4 text-sm font-medium shrink-0 self-start sm:self-auto"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{isExporting ? "Exporting…" : "Export to Excel"}</span>
            <span className="sm:hidden">{isExporting ? "…" : "Export"}</span>
          </Button>
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
                <p className="text-xs font-medium text-muted-foreground">Editor</p>
                <MultiSelect
                  options={editorOptions.map((e) => ({ value: e, label: e }))}
                  value={editorFilter}
                  onChange={setEditorFilter}
                  placeholder="All editors"
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
              <CardTitle className="text-base font-semibold">Editor Performance</CardTitle>
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
                <table className="w-full text-sm border-collapse min-w-[640px]">
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        className="text-left py-3 pr-6 font-medium text-muted-foreground align-bottom border-b border-border"
                      >
                        Editor
                      </th>
                      <th
                        colSpan={2}
                        className="text-center py-2 px-4 font-medium text-muted-foreground border-b border-border border-l border-border/60"
                      >
                        Points
                      </th>
                      <th
                        colSpan={2}
                        className="text-center py-2 px-4 font-medium text-muted-foreground border-b border-border border-l border-border/60"
                      >
                        Quantity
                      </th>
                    </tr>
                    <tr className="border-b border-border">
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground border-l border-border/60 whitespace-nowrap">
                        Delivered for Review
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Approved
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground border-l border-border/60 whitespace-nowrap">
                        Delivered for Review
                      </th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Approved
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => (
                      <tr
                        key={row.editor}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 pr-6">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{row.editor}</span>
                            {labelToEmail[row.editor?.trim().toLowerCase()] && (
                              <span className="text-xs text-muted-foreground">
                                {labelToEmail[row.editor.trim().toLowerCase()]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center border-l border-border/60">
                          <NumCell n={row.delivered.points} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <NumCell n={row.approved.points} highlight />
                        </td>
                        <td className="py-3 px-4 text-center border-l border-border/60">
                          <NumCell n={row.delivered.count} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <NumCell n={row.approved.count} highlight />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile comparison leaderboard (< md) — every editor sorted by Approved;
                  tap a row to expand the full Points + Quantity breakdown. */}
              <div className="md:hidden">
                {/* Column header */}
                <div className="grid grid-cols-[1fr_2.75rem_3rem] items-center gap-x-2 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5">Editor</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1.5">Deliv</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 text-right py-1.5">Appr</span>
                </div>

                {mobileRows.map((row) => {
                  const open = expanded.has(row.editor);
                  const email = labelToEmail[row.editor?.trim().toLowerCase()];
                  return (
                    <div key={row.editor} className="border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.editor)}
                        className="w-full grid grid-cols-[1fr_2.75rem_3rem] items-center gap-x-2 px-1 py-2.5 text-left active:bg-muted/40"
                      >
                        <span className="flex items-center gap-1 min-w-0">
                          <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
                          <span className="text-sm font-medium text-foreground truncate">{row.editor}</span>
                        </span>
                        <span className="text-sm text-muted-foreground text-right tabular-nums">{row.delivered[mobileUnit]}</span>
                        <span className="flex justify-end"><NumCell n={row.approved[mobileUnit]} highlight /></span>
                      </button>

                      {open && (
                        <div className="px-1 pb-3">
                          {email && <p className="text-xs text-muted-foreground break-all mb-2 pl-5">{email}</p>}
                          <div className="rounded-lg border border-border px-3 py-1.5 grid grid-cols-[1fr_3rem_3rem] items-center gap-x-3">
                            <span />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1">Points</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right py-1">Qty</span>

                            <span className="text-sm text-muted-foreground py-2 border-t border-border/60">Delivered for Review</span>
                            <span className="text-sm font-semibold text-foreground text-right tabular-nums py-2 border-t border-border/60">{row.delivered.points}</span>
                            <span className="text-sm font-semibold text-muted-foreground text-right tabular-nums py-2 border-t border-border/60">{row.delivered.count}</span>

                            <span className="text-sm font-medium text-emerald-700 py-2 border-t border-border/60">Approved</span>
                            <span className="text-sm font-bold text-emerald-700 text-right tabular-nums py-2 border-t border-border/60">{row.approved.points}</span>
                            <span className="text-sm font-bold text-emerald-600 text-right tabular-nums py-2 border-t border-border/60">{row.approved.count}</span>
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

export default EditorsPace;
