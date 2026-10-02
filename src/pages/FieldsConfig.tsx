import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, Plus, Pencil } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { CustomFieldDialog } from '@/components/fields-config/CustomFieldDialog';
import { useAuth } from '@/hooks/useAuth';
import { useFilteredBrands } from '@/hooks/useFilteredBrands';
import { supabase } from '@/integrations/supabase/client';
import {
  useFilteredCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  type CustomField,
  type ObjectOption,
  type ProductOption,
  type CustomFieldCreatePayload,
  type CustomFieldUpdatePayload,
} from '@/hooks/useCustomFields';

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

function OptionsCell({
  options,
  isProductLevel,
  selectedProductName,
}: {
  options: CustomField['options'];
  isProductLevel?: boolean;
  selectedProductName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!options || options.length === 0) return <span className="text-muted-foreground">—</span>;

  let displayOptions: Array<string | ObjectOption | ProductOption> = options as Array<string | ObjectOption | ProductOption>;

  if (isProductLevel) {
    if (!selectedProductName) {
      return <span className="text-xs text-muted-foreground italic">Select product to view</span>;
    }
    displayOptions = (options as ProductOption[]).filter((o) => o.product.includes(selectedProductName));
    if (displayOptions.length === 0) {
      return <span className="text-xs text-muted-foreground italic">No options for this product</span>;
    }
  }

  const chips = displayOptions.map((o) => {
    if (typeof o === 'string') return o;
    return (o as ObjectOption | ProductOption).label;
  });

  const visible = expanded ? chips : chips.slice(0, 3);
  const overflow = chips.length - 3;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((chip, i) => (
        <Badge key={i} variant="outline" className="text-xs font-normal">
          {chip}
        </Badge>
      ))}
      {overflow > 0 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="inline-flex">
          <Badge variant="secondary" className="text-xs font-normal cursor-pointer hover:bg-secondary/80">
            {expanded ? 'Show less' : `+${overflow} more`}
          </Badge>
        </button>
      )}
    </div>
  );
}

function BoolBadge({ value }: { value: boolean | null | undefined }) {
  return (
    <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
      {value ? 'Yes' : 'No'}
    </Badge>
  );
}

export default function FieldsConfig() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const { user } = useAuth();
  const isDev = user?.user_type?.includes("Dev") ?? false;

  const { data: brands = [], isLoading: brandsLoading } = useFilteredBrands();

  // Only fetch products after brand is selected
  const { data: brandProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'by-brand', selectedBrandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, brand_id')
        .eq('brand_id', selectedBrandId)
        .order('name');
      if (error) throw new Error(error.message);
      return (data || []) as Array<{ id: string; name: string; brand_id: string }>;
    },
    enabled: !!selectedBrandId,
  });

  const selectedProductName = brandProducts.find((p) => p.id === selectedProductId)?.name;
  const fieldsReady = !!(selectedBrandId && selectedProductId);
  const { data: fields, isLoading } = useFilteredCustomFields(isDev, fieldsReady);
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedProductId('');
  };

  const openCreate = () => {
    setSelectedField(null);
    setDialogOpen(true);
  };

  const openEdit = (field: CustomField) => {
    setSelectedField(field);
    setDialogOpen(true);
  };

  const handleSubmit = (payload: CustomFieldCreatePayload | CustomFieldUpdatePayload) => {
    if (selectedField) {
      updateField.mutate(payload as CustomFieldUpdatePayload, {
        onSuccess: () => setDialogOpen(false),
      });
    } else {
      createField.mutate(payload as CustomFieldCreatePayload, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const isLoading_ = selectedField ? updateField.isPending : createField.isPending;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold">Fields Config</h1>
              <p className="text-sm text-muted-foreground">Manage custom fields and their ClickUp mapping</p>
            </div>
          </div>
          {isDev && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Add Field
            </Button>
          )}
        </div>

        {/* Brand / Product selectors */}
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Brand</label>
            <Select value={selectedBrandId} onValueChange={handleBrandChange}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select Brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product</label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedBrandId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select Product" />
              </SelectTrigger>
              <SelectContent>
                {brandProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[calc(100vh-220px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="min-w-[200px]">Options</TableHead>
                    <TableHead className="whitespace-nowrap">In ClickUp</TableHead>
                    <TableHead className="whitespace-nowrap">Cron Sync</TableHead>
                    <TableHead className="whitespace-nowrap">Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : !fieldsReady ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Select a brand and product above to load fields.
                      </TableCell>
                    </TableRow>
                  ) : !fields || fields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No custom fields yet. Click <strong>Add Field</strong> to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...fields].sort((a, b) => {
                      if (a.order == null && b.order == null) return 0;
                      if (a.order == null) return 1;
                      if (b.order == null) return -1;
                      return a.order - b.order;
                    }).map((field) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium whitespace-nowrap">{field.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {field.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <OptionsCell
                            options={field.options}
                            isProductLevel={field.is_option_product_level}
                            selectedProductName={selectedProductName}
                          />
                        </TableCell>
                        <TableCell><BoolBadge value={field.is_add_in_clickup} /></TableCell>
                        <TableCell><BoolBadge value={field.is_update_in_cron} /></TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDate(field.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(field)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CustomFieldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={selectedField}
        onSubmit={handleSubmit}
        isLoading={isLoading_}
        products={brandProducts}
        selectedBrandId={selectedBrandId}
        selectedProductId={selectedProductId}
        selectedProductName={selectedProductName}
        isDev={isDev}
      />
    </DashboardLayout>
  );
}
