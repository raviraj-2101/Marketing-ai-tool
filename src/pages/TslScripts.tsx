import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/lib/queryClient';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { ScrollText, Plus, ExternalLink, ChevronsUpDown } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { useTslScripts, type TslScript } from '@/hooks/useAdsDb';
import { useCsConfig, type CsConfig } from '@/hooks/useCsConfig';
import { useFilteredBrands } from '@/hooks/useFilteredBrands';
import { useAuth } from '@/hooks/useAuth';
import { CreateTslScriptDialog } from '@/components/ads/CreateTslScriptDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const isEmpty = (v: string | null | undefined) => !v || v === 'NULL';

function EditableTextCell({
  rowId,
  field,
  initialValue,
  onSave,
}: {
  rowId: string;
  field: string;
  initialValue: string | null;
  onSave: (args: { id: string; field: string; value: string }) => void;
}) {
  const [value, setValue] = useState(isEmpty(initialValue) ? '' : initialValue!);

  function handleBlur() {
    const original = isEmpty(initialValue) ? '' : initialValue!;
    if (value !== original) {
      onSave({ id: rowId, field, value });
    }
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
      className="h-7 text-xs"
      placeholder="text.."
    />
  );
}

function CsComboboxCell({
  rowId,
  currentValue,
  csOptions,
  onSave,
}: {
  rowId: string;
  currentValue: string | null;
  csOptions: CsConfig[];
  onSave: (args: { id: string; field: string; value: string }) => void;
}) {
  const [open, setOpen] = useState(false);

  function handleSelect(label: string) {
    onSave({ id: rowId, field: 'cs', value: label });
    setOpen(false);
  }

  const displayValue = isEmpty(currentValue) ? null : currentValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs px-1 py-0.5 rounded hover:bg-muted/60 w-full min-w-[110px] text-left">
          {displayValue
            ? <span>{displayValue}</span>
            : <span className="text-muted-foreground">Select CS</span>
          }
          <ChevronsUpDown className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search CS…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-2 text-center">No results.</CommandEmpty>
            <CommandGroup>
              {csOptions.map((cs) => (
                <CommandItem
                  key={cs.id}
                  value={cs.label || ''}
                  onSelect={handleSelect}
                  className="text-xs"
                >
                  {cs.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function TslScripts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBrandCode, setSelectedBrandCode] = useState<string>('');
  const { data: brands = [] } = useFilteredBrands();

  // Check if user is admin/dev/super admin
  const isAdmin = !!(
    user?.user_type?.some(t => ["Super Admin", "Admin", "Dev"].includes(t))
  );

  // Get brand codes to filter by:
  // - For admin/dev/super admin: show all TSL scripts (no filter) unless they select a brand
  // - For custom users: show all their assigned brands
  const brandCodesToFetch = isAdmin
    ? (selectedBrandCode ? [selectedBrandCode] : undefined)
    : brands.map(b => b.brand_code);

  // Only fetch data for custom users if they have assigned brands, or for admin users always
  const shouldFetchData = isAdmin ? true : brands.length > 0;

  const { data: allTslScripts = [], isLoading } = useTslScripts(brandCodesToFetch, shouldFetchData);
  const { data: csOptions = [] } = useCsConfig();

  // Non-admins see only their own scripts. tsl_scripts has no owner email column,
  // so ownership is the `cs` label — resolve the logged-in user's CS label from
  // their email (same roster the UGC log uses) and filter by it.
  const [myCsLabel, setMyCsLabel] = useState<string>('');
  useEffect(() => {
    if (!user?.email) return;
    fetch(`${API_BASE}/api/options/cs-owners`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        const me = (Array.isArray(rows) ? rows : []).find(
          (r) => String(r.email || '').toLowerCase() === user.email.toLowerCase(),
        );
        if (me?.label) setMyCsLabel(me.label);
      })
      .catch(() => {});
  }, [user?.email]);

  const tslScripts = useMemo(() => {
    if (isAdmin) return allTslScripts;
    return allTslScripts.filter(
      (s) => !!myCsLabel && String(s.cs || '').toLowerCase() === myCsLabel.toLowerCase(),
    );
  }, [allTslScripts, isAdmin, myCsLabel]);

  const { mutate: updateField } = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const { error } = await supabase
        .from('tsl_scripts')
        .update({ [field]: value })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tsl-scripts'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  const columns = useMemo(() => [
    {
      id: 'tsl_script_id',
      header: 'TSL Script ID',
      size: 150,
      cell: ({ row }: any) => (
        <span className="font-mono text-sm font-medium">{row.original.tsl_script_id}</span>
      ),
    },
    {
      id: 'brand_code',
      header: 'Brand',
      size: 90,
      cell: ({ row }: any) => (
        <span className="text-sm">{isEmpty(row.original.brand_code) ? '-' : row.original.brand_code}</span>
      ),
    },
    {
      id: 'product_code',
      header: 'Product',
      size: 100,
      cell: ({ row }: any) => (
        <span className="text-sm">{isEmpty(row.original.product_code) ? '-' : row.original.product_code}</span>
      ),
    },
    {
      id: 'core_id',
      header: 'Core ID',
      size: 80,
      cell: ({ row }: any) => (
        <span className="font-mono text-sm">{isEmpty(row.original.core_id) ? '-' : row.original.core_id}</span>
      ),
    },
    {
      id: 'variation',
      header: 'Variation',
      size: 80,
      cell: ({ row }: any) => (
        <span className="text-sm">{isEmpty(row.original.variation) ? '-' : row.original.variation}</span>
      ),
    },
    {
      id: 'gdoc_link',
      header: 'Script Link',
      size: 90,
      cell: ({ row }: any) => {
        const link = (row.original as TslScript).gdoc_link;
        if (!link) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Link
          </a>
        );
      },
    },
    {
      id: 'angle',
      header: 'Angle',
      size: 200,
      cell: ({ row }: any) => (
        <EditableTextCell
          rowId={row.original.id}
          field="angle"
          initialValue={row.original.angle}
          onSave={updateField}
        />
      ),
    },
    {
      id: 'summary',
      header: 'Summary',
      size: 200,
      cell: ({ row }: any) => (
        <EditableTextCell
          rowId={row.original.id}
          field="summary"
          initialValue={row.original.summary}
          onSave={updateField}
        />
      ),
    },
    {
      id: 'cs',
      header: 'CS',
      size: 140,
      cell: ({ row }: any) => (
        <CsComboboxCell
          rowId={row.original.id}
          currentValue={row.original.cs}
          csOptions={csOptions}
          onSave={updateField}
        />
      ),
    },
    {
      id: 'language',
      header: 'Language',
      size: 110,
      cell: ({ row }: any) => (
        <EditableTextCell
          rowId={row.original.id}
          field="language"
          initialValue={row.original.language}
          onSave={updateField}
        />
      ),
    },
    {
      id: 'variation_update',
      header: 'Variation',
      size: 100,
      cell: ({ row }: any) => (
        <EditableTextCell
          rowId={row.original.id}
          field="variation_update"
          initialValue={row.original.variation_update}
          onSave={updateField}
        />
      ),
    },
     {
      id: 'created_date',
      header: 'Created Date',
      size: 120,
      cell: ({ row }: any) => (
        <span className="text-sm">{isEmpty(row.original.created_date) ? '-' : row.original.created_date}</span>
      ),
    },
  ], [csOptions, updateField]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 flex flex-col h-full overflow-hidden min-w-0">
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-lg">
              <ScrollText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                TSL Scripts
              </h1>
              <p className="text-sm text-muted-foreground">Manage TSL script records</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedBrandCode || 'all'} onValueChange={(v) => setSelectedBrandCode(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(b => (
                  <SelectItem key={b.id} value={b.brand_code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setIsDialogOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Create TSL Script
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <DataTable columns={columns} data={tslScripts} isLoading={isLoading} />
        </div>
      </div>

      <CreateTslScriptDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </DashboardLayout>
  );
}
