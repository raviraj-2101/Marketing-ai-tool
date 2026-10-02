import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "sonner";
import { DollarSign, Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import type { ColDef, GetRowIdParams } from "ag-grid-community";
import { AdsAgGrid } from "@/components/ads/AdsAgGrid";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BonusRow {
  brand: string;
  person: string;
  spend: number;
  bonus: number;
  ads?: number;
}

interface TotalsByPersonRow {
  person: string;
  spend: number;
  bonus: number;
}

interface BonusesData {
  csRows: BonusRow[];
  editorRows: BonusRow[];
  csTotalsByPerson: TotalsByPersonRow[];
  editorTotalsByPerson: TotalsByPersonRow[];
  grand: {
    csSpend: number;
    csBonus: number;
    editorSpend: number;
    editorBonus: number;
  };
}

// Exact strings must match DB `brands.name` / `acquisition_metrics.brand`
// (verified against prod): note BlueForce's capital F and CELMOR all-caps.
const ALL_BRANDS = ["Cleantra", "Ledisa", "Nervalley", "BlueForce", "CELMOR"] as const;

// Money formatted like $#,##0.00 (e.g. $136,738.00)
const currency = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// yyyy-mm-dd from a local Date (matches AdsPerformance's toDateStr helper)
const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// ─── Reusable money column + a small grid section wrapper ─────────────────────

const moneyCol = (field: string, headerName: string): ColDef => ({
  field,
  headerName,
  flex: 1,
  minWidth: 120,
  valueFormatter: (p) => currency(Number(p.value ?? 0)),
});

function BonusSection({
  title,
  colDefs,
  rowData,
  isLoading,
  pinnedBottomRow,
  getRowId,
  emptyLabel,
}: {
  title: string;
  colDefs: ColDef[];
  rowData: Record<string, unknown>[];
  isLoading: boolean;
  pinnedBottomRow?: Record<string, unknown>;
  getRowId?: (params: GetRowIdParams<Record<string, unknown>>) => string;
  emptyLabel: string;
}) {
  return (
    <div className="shrink-0 bg-card border border-border rounded-2xl shadow-sm">
      <div className="px-5 pt-4 pb-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="px-5 pb-5">
        {!isLoading && rowData.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-border bg-background text-muted-foreground text-sm h-[120px]">
            {emptyLabel}
          </div>
        ) : (
          <AdsAgGrid
            colDefs={colDefs}
            rowData={rowData}
            isLoading={isLoading}
            getRowId={getRowId}
            pinnedBottomRow={rowData.length > 0 ? pinnedBottomRow : undefined}
            gridHeight={520}
            page={1}
            pageSize={rowData.length || 1}
            totalCount={rowData.length}
            onPageChange={() => {}}
            onPageSizeChange={() => {}}
          />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BonusesPage = () => {
  const { getToken } = useAuth();

  const _today = new Date();
  const _monthStart = toDateStr(new Date(_today.getFullYear(), _today.getMonth(), 1));
  const _todayStr = toDateStr(_today);

  // Timeframe = the spend window. Default: 1st of current month → today.
  const [timeframeStart, setTimeframeStart] = useState(_monthStart);
  const [timeframeEnd, setTimeframeEnd] = useState(_todayStr);

  // Launch date window. Default: 2026-04-01 → today.
  const [launchStart, setLaunchStart] = useState("2026-04-01");
  const [launchEnd, setLaunchEnd] = useState(_todayStr);

  // Brands — both selected by default.
  const [brands, setBrands] = useState<string[]>([...ALL_BRANDS]);

  // Rates.
  const [csRate, setCsRate] = useState("0.35");
  const [editorRate, setEditorRate] = useState("0.2");

  const toggleBrand = (brand: string, checked: boolean) => {
    setBrands((prev) => (checked ? [...new Set([...prev, brand])] : prev.filter((b) => b !== brand)));
  };

  const pipelineBase = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;

  const csRateNum = Number(csRate);
  const editorRateNum = Number(editorRate);

  const bonusesQuery = useQuery({
    queryKey: [
      "bonuses",
      brands,
      timeframeStart,
      timeframeEnd,
      launchStart,
      launchEnd,
      csRateNum,
      editorRateNum,
    ],
    queryFn: async () => {
      const res = await fetch(`${pipelineBase}/api/bonuses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          brands,
          eventDate: { startDate: timeframeStart, endDate: timeframeEnd },
          launchDate: { startDate: launchStart, endDate: launchEnd },
          csRate: csRateNum,
          editorRate: editorRateNum,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Failed to fetch bonuses.");
      }
      return json.data as BonusesData;
    },
    enabled: Boolean(timeframeStart && timeframeEnd && brands.length > 0),
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previous) => previous,
  });

  const data = bonusesQuery.data;
  const isLoading = bonusesQuery.isFetching;

  // ── Column defs ──
  const bonusColDefs: ColDef[] = useMemo(
    () => [
      { field: "brand", headerName: "Brand", flex: 1, minWidth: 120 },
      { field: "person", headerName: "Person", flex: 1.4, minWidth: 140 },
      moneyCol("spend", "Spend"),
      moneyCol("bonus", "Bonus"),
    ],
    [],
  );

  const perPersonColDefs: ColDef[] = useMemo(
    () => [
      { field: "person", headerName: "Person", flex: 1.4, minWidth: 140 },
      { field: "role", headerName: "Role", flex: 1, minWidth: 110 },
      moneyCol("spend", "Spend"),
      moneyCol("bonus", "Bonus"),
    ],
    [],
  );

  // ── Row data ──
  const csRows = useMemo(
    () => (data?.csRows ?? []).map((r, i) => ({ ...r, _rowId: `cs-${i}` })),
    [data?.csRows],
  );
  const editorRows = useMemo(
    () => (data?.editorRows ?? []).map((r, i) => ({ ...r, _rowId: `ed-${i}` })),
    [data?.editorRows],
  );
  const perPersonRows = useMemo(() => {
    const cs = (data?.csTotalsByPerson ?? []).map((r, i) => ({ ...r, role: "CS", _rowId: `pp-cs-${i}` }));
    const ed = (data?.editorTotalsByPerson ?? []).map((r, i) => ({ ...r, role: "Editor", _rowId: `pp-ed-${i}` }));
    return [...cs, ...ed];
  }, [data?.csTotalsByPerson, data?.editorTotalsByPerson]);

  const getRowId = (params: GetRowIdParams<Record<string, unknown>>) => String(params.data._rowId ?? "");

  // ── Pinned foot totals ──
  const csTotalsRow = useMemo(() => {
    if (!data) return undefined;
    return { brand: "Total", person: "", spend: data.grand.csSpend, bonus: data.grand.csBonus };
  }, [data]);

  const editorTotalsRow = useMemo(() => {
    if (!data) return undefined;
    return { brand: "Total", person: "", spend: data.grand.editorSpend, bonus: data.grand.editorBonus };
  }, [data]);

  const perPersonTotalsRow = useMemo(() => {
    if (!data) return undefined;
    return {
      person: "Total",
      role: "",
      spend: data.grand.csSpend + data.grand.editorSpend,
      bonus: data.grand.csBonus + data.grand.editorBonus,
    };
  }, [data]);

  // ── Export ──
  // Everything the page shows is already in memory (the API returns the whole set,
  // the grids are not paginated), so this needs no extra request.
  //
  // Layout: a Summary tab (per-person totals across all brands) followed by one tab
  // per brand, each opening with the window + rates the numbers were produced with —
  // an exported file is read weeks later, detached from the filters that made it.
  const hasRows = csRows.length > 0 || editorRows.length > 0 || perPersonRows.length > 0;

  const handleExport = () => {
    if (!data) return;

    // Money as real numbers, not "$1,234.00" strings, so the cells stay summable.
    const money = (n: number) => Number((n ?? 0).toFixed(2));

    type Cell = string | number;
    const blank: Cell[] = [];

    // The filter context, repeated on every tab so no tab can be read out of context.
    const contextRows = (): Cell[][] => [
      ["Spend window", `${timeframeStart} - ${timeframeEnd}`],
      ["Launch date", `${launchStart} - ${launchEnd}`],
      ["CS rate", csRateNum],
      ["Editor rate", editorRateNum],
    ];

    // One CS/Editor block: heading, header row, the people, then its own total.
    const bonusBlock = (heading: string, rows: BonusRow[], rate: number): Cell[][] => {
      if (rows.length === 0) return [[heading], ["No ads in this window"]];
      const spend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
      const bonus = rows.reduce((s, r) => s + (r.bonus ?? 0), 0);
      return [
        [heading],
        ["Person", "Spend", "Rate", "Bonus"],
        ...rows.map((r): Cell[] => [r.person ?? "", money(r.spend), rate, money(r.bonus)]),
        ["Total", money(spend), "", money(bonus)],
      ];
    };

    const addSheet = (wb: XLSX.WorkBook, name: string, aoa: Cell[][]) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 16 }];
      // Excel caps tab names at 31 chars and rejects : \ / ? * [ ]
      XLSX.utils.book_append_sheet(wb, ws, name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31));
    };

    try {
      const wb = XLSX.utils.book_new();

      // ── Summary tab ──
      addSheet(wb, "Summary", [
        ["Bonuses - Summary"],
        blank,
        ...contextRows(),
        ["Brands", brands.join(", ")],
        blank,
        ["TOTALS PER PERSON (ALL BRANDS)"],
        ["Person", "Role", "Spend", "Bonus"],
        ...perPersonRows.map((r): Cell[] => [r.person ?? "", r.role ?? "", money(r.spend), money(r.bonus)]),
        [
          "Total",
          "",
          money(data.grand.csSpend + data.grand.editorSpend),
          money(data.grand.csBonus + data.grand.editorBonus),
        ],
        blank,
        ["GRAND TOTALS", "Spend", "Bonus"],
        ["CS", money(data.grand.csSpend), money(data.grand.csBonus)],
        ["Editors", money(data.grand.editorSpend), money(data.grand.editorBonus)],
      ]);

      // ── One tab per brand ──
      // Driven by the brands that actually returned rows, kept in ALL_BRANDS order so
      // the tab order is stable between exports.
      const brandsWithData = ALL_BRANDS.filter((b) =>
        [...(data.csRows ?? []), ...(data.editorRows ?? [])].some((r) => r.brand === b),
      );

      for (const brand of brandsWithData) {
        addSheet(wb, brand, [
          [`Bonuses - ${brand}`],
          blank,
          ...contextRows(),
          blank,
          ...bonusBlock("CS BONUSES", (data.csRows ?? []).filter((r) => r.brand === brand), csRateNum),
          blank,
          ...bonusBlock(
            "EDITOR BONUSES",
            (data.editorRows ?? []).filter((r) => r.brand === brand),
            editorRateNum,
          ),
        ]);
      }

      XLSX.writeFile(wb, `bonuses_${timeframeStart}_${timeframeEnd}.xlsx`);
      toast.success("Exported.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    }
  };

  return (
    <DashboardLayout>
      <div className="md:h-[calc(100vh-3.5rem)] w-full max-w-full overflow-x-hidden md:overflow-y-auto flex flex-col gap-4 px-4 md:px-6 pt-6 pb-4 bg-background">

        {/* Page header */}
        <div className="shrink-0 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Bonuses</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                CS &amp; editor bonuses by spend across brands
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">Loading…</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isLoading || !hasRows}
              className="gap-2 h-9 px-3 sm:px-4 text-sm font-medium shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export to Excel</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>
        </div>

        {/* Controls panel */}
        <div className="shrink-0 bg-card border border-border rounded-2xl shadow-sm">
          <div className="px-5 pt-4 pb-3">
            <p className="text-sm font-semibold text-foreground">Filters</p>
          </div>

          <div className="px-5 pb-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-3">

              {/* Timeframe (spend window) */}
              <div className="flex flex-col gap-1 col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Timeframe (Spend Window)</p>
                <DateRangePicker
                  initialDateFrom={timeframeStart}
                  initialDateTo={timeframeEnd}
                  onUpdate={({ range }) => {
                    setTimeframeStart(toDateStr(range.from));
                    setTimeframeEnd(toDateStr(range.to ?? range.from));
                  }}
                  align="start"
                />
              </div>

              {/* Launch Date */}
              <div className="flex flex-col gap-1 col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Launch Date</p>
                <DateRangePicker
                  initialDateFrom={launchStart}
                  initialDateTo={launchEnd}
                  onUpdate={({ range }) => {
                    setLaunchStart(toDateStr(range.from));
                    setLaunchEnd(toDateStr(range.to ?? range.from));
                  }}
                  align="start"
                />
              </div>

              {/* Brands */}
              <div className="flex flex-col gap-1 col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Brand</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-9">
                  {ALL_BRANDS.map((brand) => (
                    <label key={brand} className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={brands.includes(brand)}
                        onCheckedChange={(c) => toggleBrand(brand, c === true)}
                      />
                      <span className="text-sm text-foreground">{brand}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* CS rate */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">CS rate %</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={csRate}
                  onChange={(e) => setCsRate(e.target.value)}
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>

              {/* Editor rate */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Editor rate %</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editorRate}
                  onChange={(e) => setEditorRate(e.target.value)}
                  className="h-9 rounded-lg border-border bg-muted text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error state */}
        {bonusesQuery.error && (
          <div className="shrink-0 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {bonusesQuery.error instanceof Error ? bonusesQuery.error.message : "Failed to fetch bonuses."}
          </div>
        )}

        {/* Section 1: CS Bonuses */}
        <BonusSection
          title="CS Bonuses"
          colDefs={bonusColDefs}
          rowData={csRows}
          isLoading={isLoading}
          pinnedBottomRow={csTotalsRow}
          getRowId={getRowId}
          emptyLabel="No ads in this window"
        />

        {/* Section 2: Editor Bonuses */}
        <BonusSection
          title="Editor Bonuses"
          colDefs={bonusColDefs}
          rowData={editorRows}
          isLoading={isLoading}
          pinnedBottomRow={editorTotalsRow}
          getRowId={getRowId}
          emptyLabel="No ads in this window"
        />

        {/* Section 3: Totals per person (all brands) */}
        <BonusSection
          title="Totals per person (all brands)"
          colDefs={perPersonColDefs}
          rowData={perPersonRows}
          isLoading={isLoading}
          pinnedBottomRow={perPersonTotalsRow}
          getRowId={getRowId}
          emptyLabel="No ads in this window"
        />
      </div>
    </DashboardLayout>
  );
};

export default BonusesPage;
