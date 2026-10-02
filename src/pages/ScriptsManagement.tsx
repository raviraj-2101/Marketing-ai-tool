import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DataTable } from '@/components/ui/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollText, ExternalLink } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { useFilteredScripts, type Script } from '@/hooks/useScripts';

type Row = Record<string, unknown>;

function LinkCell({ value }: { value: unknown }) {
  if (!value || typeof value !== 'string') {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Link
    </a>
  );
}

const COLUMNS: ColumnDef<Row>[] = [
  {
    accessorKey: 'script_id',
    header: 'Script ID',
    size: 110,
    cell: ({ getValue }) => {
      const val = getValue();
      if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="font-mono font-semibold text-foreground">
          {String(val).padStart(6, '0')}
        </span>
      );
    },
  },
  {
    accessorKey: 'brand',
    header: 'Brand',
    size: 140,
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? <span>{String(val)}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'product',
    header: 'Product',
    size: 160,
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? <span>{String(val)}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'ad_id',
    header: 'Ad ID',
    size: 100,
    cell: ({ getValue }) => {
      const val = getValue();
      return val !== null && val !== undefined
        ? <span className="font-mono font-semibold">{String(val).padStart(6, '0')}</span>
        : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'creation_date',
    header: 'Creation Date',
    size: 140,
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? <span>{String(val)}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'clickup_link',
    header: 'ClickUp',
    size: 100,
    cell: ({ getValue }) => <LinkCell value={getValue()} />,
  },
  {
    accessorKey: 'g_drive_link',
    header: 'G Drive',
    size: 100,
    cell: ({ getValue }) => <LinkCell value={getValue()} />,
  },
  {
    accessorKey: 'framer_io_link',
    header: 'Framer',
    size: 100,
    cell: ({ getValue }) => <LinkCell value={getValue()} />,
  },
  {
    accessorKey: 'ad_brief_doc',
    header: 'Brief Doc',
    size: 110,
    cell: ({ getValue }) => <LinkCell value={getValue()} />,
  },
];

export default function ScriptsManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: scripts = [], isLoading } = useFilteredScripts(searchQuery);

  const rows = scripts as unknown as Row[];

  return (
    <DashboardLayout>
      <div className="p-6 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-shrink-0">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
            <ScrollText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Scripts
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse all ad scripts — read-only view
            </p>
          </div>
        </div>

        {/* Table Card */}
        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <CardContent className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
            <DataTable
              columns={COLUMNS}
              data={rows}
              isLoading={isLoading}
              pageSize={25}
              onSearchChange={setSearchQuery}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
