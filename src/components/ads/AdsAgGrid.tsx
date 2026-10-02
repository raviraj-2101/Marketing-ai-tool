import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { ColDef, ColGroupDef, GridReadyEvent, CellValueChangedEvent, SortChangedEvent, GetRowIdParams, CellMouseOverEvent, ModelUpdatedEvent, FirstDataRenderedEvent } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';

// Map AG Grid v35 theme params to project CSS variables.
const projectTheme = themeQuartz.withParams({
  backgroundColor: 'hsl(var(--background))',
  foregroundColor: 'hsl(var(--foreground))',
  chromeBackgroundColor: 'hsl(var(--muted))',
  headerBackgroundColor: 'hsl(var(--muted))',
  borderColor: 'hsl(var(--border))',
  rowBorder: true,
  oddRowBackgroundColor: 'hsl(var(--background))',
  rowHoverColor: 'hsl(var(--muted))',
  selectedRowBackgroundColor: 'hsl(var(--accent))',
  accentColor: 'hsl(var(--primary))',
  fontFamily: 'inherit',
  fontSize: 13,
  cellHorizontalPadding: 16,
});

const HEADER_HEIGHT = 40;
const EMPTY_HEIGHT = 120;

interface AdsAgGridProps {
  colDefs: (ColDef | ColGroupDef)[];
  rowData: Record<string, unknown>[];
  isLoading?: boolean;
  onCellValueChanged?: (params: CellValueChangedEvent) => void;
  onSortChanged?: (event: SortChangedEvent) => void;
  getRowId?: (params: GetRowIdParams<Record<string, unknown>>) => string;
  rowHeight?: number;
  gridHeight?: number;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pinnedBottomRow?: Record<string, unknown>;
}

export function AdsAgGrid({
  colDefs,
  rowData,
  isLoading,
  onCellValueChanged,
  onSortChanged,
  getRowId,
  rowHeight = 42,
  gridHeight = 520,
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pinnedBottomRow,
}: AdsAgGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const [copyCell, setCopyCell] = useState<{ value: string; top: number; right: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverButtonRef = useRef(false);
  const [dynamicHeight, setDynamicHeight] = useState(gridHeight);

  const recalcHeight = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    const displayedRows = api.getDisplayedRowCount();

    if (displayedRows === 0) {
      setDynamicHeight(EMPTY_HEIGHT);
      return;
    }

    const pinnedRowExtra = pinnedBottomRow ? 42 : 0;
    const computed = displayedRows * rowHeight + HEADER_HEIGHT * 2.5 + pinnedRowExtra;
    setDynamicHeight(Math.min(computed, gridHeight));
  }, [gridHeight, rowHeight, pinnedBottomRow]);

  const onGridReady = useCallback((_params: GridReadyEvent) => {}, []);

  const onFirstDataRendered = useCallback((_params: FirstDataRenderedEvent) => {
    recalcHeight();
  }, [recalcHeight]);

  const onModelUpdated = useCallback((_params: ModelUpdatedEvent) => {
    recalcHeight();
  }, [recalcHeight]);

  const handleSortChanged = useCallback((event: SortChangedEvent) => {
    onSortChanged?.(event);
    recalcHeight();
  }, [onSortChanged, recalcHeight]);

  useEffect(() => {
    if (!isLoading && rowData.length === 0) {
      setDynamicHeight(EMPTY_HEIGHT);
    }
  }, [isLoading, rowData.length]);

  const handleCellMouseOver = useCallback((params: CellMouseOverEvent) => {
    const cellEl = (params.event?.target as HTMLElement)?.closest('.ag-cell') as HTMLElement | null;
    if (!cellEl) return;
    const anchor = cellEl.querySelector('a[href]') as HTMLAnchorElement | null;
    const text = anchor ? anchor.href : cellEl.innerText?.trim();
    if (!text || text === '—') return;
    const rect = cellEl.getBoundingClientRect();
    setCopyCell({ value: text, top: rect.top, right: window.innerWidth - rect.right });
    setCopied(false);
  }, []);

  const handleCellMouseOut = useCallback(() => {
    if (!isOverButtonRef.current) {
      setCopyCell(null);
      setCopied(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!copyCell) return;
    await navigator.clipboard.writeText(copyCell.value);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      if (!isOverButtonRef.current) setCopyCell(null);
    }, 1500);
  }, [copyCell]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalCount);

  const handlePageSizeChange = useCallback((value: string) => {
    onPageSizeChange(Number(value));
  }, [onPageSizeChange]);

  const defaultGetRowId = useCallback((params: GetRowIdParams<Record<string, unknown>>) => {
    return String(params.data.id ?? params.data.ad_id ?? '');
  }, []);

  const pinnedBottomRowData = useMemo(
    () => (pinnedBottomRow ? [pinnedBottomRow] : undefined),
    [pinnedBottomRow],
  );

  const pinnedRowStyle = useCallback((params: { node: { rowPinned?: string | null } }) => {
    if (params.node.rowPinned === 'bottom') {
      return { fontWeight: '600', background: 'hsl(var(--muted))' };
    }
    return undefined;
  }, []);

  const pinnedRowHeight = useCallback((params: { node: { rowPinned?: string | null } }) => {
    if (params.node.rowPinned === 'bottom') return 42;
    return rowHeight;
  }, [rowHeight]);

  const processedColDefs = useMemo(() => {
    const processDef = (col: ColDef | ColGroupDef): ColDef | ColGroupDef => {
      if ('children' in col) {
        return { ...col, children: (col as ColGroupDef).children.map(processDef) };
      }
      const leaf = { ...(col as ColDef) };

      // Suppress "—" and empty fallbacks in valueFormatters for the pinned totals row
      leaf.pinnedRowValueFormatter = (p: { value: unknown }) => {
        if (p.value == null || p.value === '' || p.value === '—') return '';
        return String(p.value);
      };

      // Suppress cellRenderers in the pinned row (they check for null and render "—")
      if (leaf.cellRenderer) {
        const orig = leaf.cellRenderer as (p: unknown) => unknown;
        leaf.cellRenderer = (params: { node: { rowPinned?: string | null } }) => {
          if (params.node.rowPinned === 'bottom') return null;
          return orig(params);
        };
      }

      return leaf;
    };
    return colDefs.map(processDef);
  }, [colDefs]);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
    suppressHeaderMenuButton: true,
    suppressMovable: true,
    cellStyle: { display: 'flex', alignItems: 'center', overflow: 'hidden' },
  }), []);

  return (
    <div className="flex flex-col border border-border rounded-lg w-full max-w-full overflow-hidden">
      {/* Grid area */}
      <div style={{ height: `${isLoading ? gridHeight : dynamicHeight}px` }}>
        {isLoading ? (
          <div className="p-4 space-y-2 h-full bg-background">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : rowData.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg bg-background text-muted-foreground text-sm" style={{ height: `${EMPTY_HEIGHT}px` }}>
            No records found
          </div>
        ) : (
          <AgGridReact
            ref={gridRef}
            theme={projectTheme}
            rowData={rowData}
            columnDefs={processedColDefs}
            getRowId={getRowId ?? defaultGetRowId}
            onGridReady={onGridReady}
            onCellValueChanged={onCellValueChanged}
            onSortChanged={handleSortChanged}
            onFirstDataRendered={onFirstDataRendered}
            onModelUpdated={onModelUpdated}
            rowHeight={rowHeight}
            onCellMouseOver={handleCellMouseOver}
            onCellMouseOut={handleCellMouseOut}
            headerHeight={HEADER_HEIGHT}
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            suppressMovableColumns
            suppressMultiSort
            animateRows={false}
            defaultColDef={defaultColDef}
            pinnedBottomRowData={pinnedBottomRowData}
            getRowStyle={pinnedRowStyle}
            getRowHeight={pinnedRowHeight}
          />
        )}
      </div>

      {/* Floating copy button on cell hover */}
      {copyCell && (
        <button
          style={{ position: 'fixed', top: copyCell.top + 6, right: copyCell.right + 6, zIndex: 9999 }}
          className={`flex items-center justify-center w-6 h-6 rounded shadow-md border transition-colors ${
            copied
              ? 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary'
              : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary'
          }`}
          onMouseEnter={() => { isOverButtonRef.current = true; }}
          onMouseLeave={() => {
            isOverButtonRef.current = false;
            if (!copied) setCopyCell(null);
          }}
          onClick={handleCopy}
          title="Copy cell value"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      )}

      {/* Pagination footer */}
      {!isLoading && rowData.length !== 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-border bg-background gap-3 sm:gap-4 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-1">
            <div className="text-sm font-medium">
              <span className="text-foreground">Page {page} of {totalPages}</span>
              <span className="text-muted-foreground ml-4">
                ({startRow}–{endRow} of {totalCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Rows per page:</span>
              <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="w-16 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((s) => (
                    <SelectItem key={s} value={s.toString()} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded min-w-[40px] text-center">
              {page}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-7 px-2.5 text-xs gap-1"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
