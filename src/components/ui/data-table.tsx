import * as React from 'react';
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  isLoading?: boolean;
  isAdDbTable?: boolean;
  onSearchChange?: (query: string) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 25,
  isLoading = false,
  isAdDbTable = false,
  onSearchChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [currentPageSize, setCurrentPageSize] = React.useState(pageSize);
  const [isPageSizeLoading, setIsPageSizeLoading] = React.useState(false);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize });
  const [searchInput, setSearchInput] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedInput = searchInput.trim();
      setGlobalFilter(trimmedInput);
      onSearchChange?.(trimmedInput);
      setPagination(p => ({ ...p, pageIndex: 0 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput, onSearchChange]);

  const filteredData = React.useMemo(() => {
    if (!globalFilter) return data;
    const query = globalFilter.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (col.id === 'actions') return false;
        const value = (row as any)[col.accessorKey || col.id];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [data, globalFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    state: { sorting, columnVisibility, pagination },
  });

  const totalPages = table.getPageCount();
  const currentPage = pagination.pageIndex + 1;
  const startIdx = pagination.pageIndex * pagination.pageSize + 1;
  const endIdx = Math.min(startIdx + pagination.pageSize - 1, filteredData.length);

  return (
    <div className="space-y-4 flex flex-col flex-1 min-h-0">
      {!isAdDbTable && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-xs"
          />
        </div>
      )}

      <div className="flex flex-col border rounded-lg overflow-hidden flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto" style={{ scrollbarGutter: 'stable', ...(isAdDbTable && { maxHeight: '500px' }) }}>
          <Table className="text-sm" isAdDbTable={isAdDbTable}>
            <TableHeader className="sticky top-0 z-20 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-border">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="whitespace-nowrap text-xs font-semibold text-muted-foreground px-4 py-3 bg-background"
                      style={{ width: `${header.getSize()}px`, minWidth: `${header.getSize()}px` }}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading || isPageSizeLoading ? (
                Array.from({ length: currentPageSize }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`} className="hover:bg-muted/30">
                    {columns.map((col, index) => {
                      const width = col.size || 120;
                      const isFirstColumn = index === 0;
                      return (
                        <TableCell key={`${i}-${col.id}`} className={`px-4 py-3 ${!isFirstColumn ? 'text-center' : ''}`} style={{ width: `${width}px`, minWidth: `${width}px` }}>
                          <div className="h-4 w-24 bg-slate-300 dark:bg-slate-600 animate-pulse rounded" />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="text-center py-16 text-muted-foreground text-sm">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex} className="hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="px-4 py-2.5 text-sm"
                          style={{ width: `${cell.column.columnDef.size || 120}px`, minWidth: `${cell.column.columnDef.size || 120}px` }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {filteredData.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-background gap-4 flex-shrink-0">
            <div className="flex items-center gap-4 flex-1">
              <div className="text-sm font-medium">
                <span className="text-foreground">Page {currentPage} of {totalPages}</span>
                <span className="text-muted-foreground ml-4">
                  ({startIdx}-{endIdx} of {filteredData.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page:</span>
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={(val) => {
                    setIsPageSizeLoading(true);
                    setPagination(p => ({ ...p, pageSize: Number(val) }));
                    setTimeout(() => setIsPageSizeLoading(false), 300);
                  }}
                >
                  <SelectTrigger className="w-16 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((size) => (
                      <SelectItem key={size} value={size.toString()} className="text-xs">{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="h-7 px-2.5 text-xs gap-1">
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded min-w-[40px] text-center">
                {currentPage}/{totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="h-7 px-2.5 text-xs gap-1">
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
