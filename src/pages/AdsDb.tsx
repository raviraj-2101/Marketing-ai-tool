import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE } from '@/lib/queryClient';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AdsAgGrid } from '@/components/ads/AdsAgGrid';
import { Button } from '@/components/ui/button';
import { Database, Image, FileText, Video, Plus, ExternalLink, Filter, Repeat2, Loader2 } from 'lucide-react';
import { useAdsDbFields, useAdsData, useAdsAdIds, useAdsStatusDistinct, useTslScripts, useVideoScripts, getColumnsForTab, getFormFieldsForTab, type TabKey, type AdsField, type AdsDataFilters } from '@/hooks/useAdsDb';
import { createAdsAgGridColumns, ManageOptionsDialog, normalizeDropdownOptions, DropdownCellEditor } from '@/hooks/useAdsAgGridColumns';
import type { ColDef, ICellRendererParams, CellValueChangedEvent } from 'ag-grid-community';
import { AddAdDialog } from '@/components/ads/AddAdDialog';
import { IterateTslImagesDialog } from '@/components/ads/IterateTslImagesDialog';
import { useToast } from '@/hooks/use-toast';
import { findMissingRequiredFields } from '@/lib/requiredAdFields';
import { useFilteredBrands } from '@/hooks/useFilteredBrands';
import { useProducts } from '@/hooks/useProducts';
import { useCsConfig } from '@/hooks/useCsConfig';
import { useOtherConfig } from '@/hooks/useOtherConfig';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Check, ChevronDown } from 'lucide-react';
import { getCurrentAndNextYearWeekCodes } from '@/utils/weekCodeGenerator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

const TAB_CONFIG: Record<TabKey, { label: string; color: string; borderColor: string; bgColor: string; icon: React.ReactNode }> = {
  'img-table': { label: 'IMG', color: 'text-blue-600',   borderColor: 'border-blue-500',   bgColor: 'bg-blue-100 text-blue-700',    icon: <Image    className="h-5 w-5" /> },
  'tsl-table': { label: 'TSL', color: 'text-indigo-600', borderColor: 'border-indigo-500', bgColor: 'bg-indigo-100 text-indigo-700', icon: <FileText className="h-5 w-5" /> },
  'vid-table': { label: 'VID', color: 'text-blue-600',   borderColor: 'border-blue-500',   bgColor: 'bg-blue-100 text-blue-700',    icon: <Video    className="h-5 w-5" /> },
};

const adTypeMap: Record<TabKey, string> = {
  'vid-table': 'VID',
  'img-table': 'IMG',
  'tsl-table': 'TSL',
};

const tableNameMap: Record<TabKey, 'ads' | 'statics_logs'> = {
  'vid-table': 'ads',
  'tsl-table': 'statics_logs',
  'img-table': 'statics_logs',
};

function convertToSnakeCase(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '_');
}

function getLabelFromDropdownOptions(options: unknown, selectedValue: unknown): string {
  // Since the SelectItem value is now the label, just return the selected value as-is
  return String(selectedValue);
}

async function updateAdField(ad_id: number, columnName: string, value: unknown, tab: TabKey, field?: AdsField): Promise<{ ok: boolean; message?: string; missingFields?: string[] }> {
  const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
  if (!baseUrl) {
    console.error('VITE_PIPELINE_API_BASE_URL not set');
    return { ok: false, message: 'API base URL not configured' };
  }

  // VID → /update-ad (PUT), TSL/IMG → /api/update-ad (POST)
  const endpoint = tab === 'vid-table' ? '/update-ad' : '/api/update-ad';
  const method = tab === 'vid-table' ? 'PUT' : 'POST';

  try {
    let payload;
    if (tab === 'vid-table') {
      payload = [{
        ad_id,
        columnName: convertToSnakeCase(columnName),
        value,
      }];
    } else {
      // For TSL/IMG: include field metadata for dynamic handling
      payload = [{
        id: ad_id,
        columnName: convertToSnakeCase(columnName),
        value,
      }];
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Surface the backend's structured error (e.g. the required-fields guard
      // returns { error, missingFields }) so the caller can toast it.
      let message = `Update failed (${response.status})`;
      let missingFields: string[] | undefined;
      try {
        const body = await response.clone().json();
        if (body?.error) message = body.error;
        if (Array.isArray(body?.missingFields)) missingFields = body.missingFields as string[];
      } catch {
        try { message = (await response.text()) || message; } catch { /* ignore */ }
      }
      console.error(`API error: ${response.status}`, message);
      return { ok: false, message, missingFields };
    }
    return { ok: true };
  } catch (error) {
    console.error('Failed to update ad field:', error);
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' };
  }
}

// Readable "blocked from Editing" toast — the missing fields render as wrapped
// chips instead of one long comma-separated run-on.
function buildEditingBlockedToast(missing: string[]) {
  return {
    title: <span className="text-red-600">Cannot move to Editing</span>,
    description: (
      <div className="mt-1.5 space-y-2">
        <p className="text-foreground/70">
          Fill the required field{missing.length === 1 ? '' : 's'} below first{' '}
          <span className="text-foreground/50">({missing.length})</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {missing.map((f) => (
            <span
              key={f}
              className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-medium leading-5 text-white"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    ),
    variant: 'default' as const,
  };
}

export default function AdsDb() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  // const canEdit = !(user?.user_type && user.user_type.length > 0 && user.user_type.every((t) => t === 'Custom'));
  const canEdit = true;
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey | ''>('');
  const activeTabKey = activeTab as TabKey;
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isIterateDialogOpen, setIsIterateDialogOpen] = useState(false);

  // Optional filters
  const [launchMeta, setLaunchMeta] = useState<'Yes' | 'No' | ''>('');
  const [launchApplovin, setLaunchApplovin] = useState<'Yes' | 'No' | ''>('');
  const [selectedAdId, setSelectedAdId] = useState<string>('');
  const [adIdSearch, setAdIdSearch] = useState<string>('');
  const [adIdVisible, setAdIdVisible] = useState(10);
  const [adIdOpen, setAdIdOpen] = useState(false);
  const [selectedCs, setSelectedCs] = useState<string>('');
  const [conceptNameSearch, setConceptNameSearch] = useState<string>('');
  const [conceptNameInput, setConceptNameInput] = useState<string>('');
  const [selectedBatchWeek, setSelectedBatchWeek] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [selectedAngle, setSelectedAngle] = useState<string>('');
  // TSL-tab Angle / Sub-angle filters (statics_logs.sub_angle / sub_angle_detail).
  // Kept separate from the VID `selectedAngle` because TSL options are plain
  // strings from the canonical angle endpoint, not the custom-field option list.
  const [selectedTslAngle, setSelectedTslAngle] = useState<string>('');
  const [selectedTslSubAngle, setSelectedTslSubAngle] = useState<string>('');
  const [isAdIdLoading, setIsAdIdLoading] = useState(false);
  const [adIdSearchInput, setAdIdSearchInput] = useState<string>('');

  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [manageDialogFieldId, setManageDialogFieldId] = useState<string | null>(null);
  const [managePointsDialogOpen, setManagePointsDialogOpen] = useState(false);
  // New filters: Platform, Script ID, Editor
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [scriptIdSearchInput, setScriptIdSearchInput] = useState('');
  const [scriptIdSearch, setScriptIdSearch] = useState('');
  const [scriptIdVisible, setScriptIdVisible] = useState(10);
  const [scriptIdOpen, setScriptIdOpen] = useState(false);
  const [isScriptIdLoading, setIsScriptIdLoading] = useState(false);
  const [selectedEditor, setSelectedEditor] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedEditType, setSelectedEditType] = useState<'Self-Edited' | 'Editor-Edited' | ''>('');

  const { data: allFields = [], isLoading: fieldsLoading } = useAdsDbFields();
  const { data: tslScripts = [], isLoading: tslScriptsLoading } = useTslScripts();
  const { data: brands = [], isLoading: brandsLoading } = useFilteredBrands();
  const { products = [], isLoading: productsLoading } = useProducts();
  const { data: allCsConfig = [] } = useCsConfig();
  const { data: pointsConfigOptions = [] } = useOtherConfig();

  const pointsOptions = useMemo(
    () => {
      const options = pointsConfigOptions.map((v) => ({ label: v, value: v }));
      console.log('[AdsDb] pointsConfigOptions:', pointsConfigOptions);
      console.log('[AdsDb] pointsOptions:', options, 'length:', options.length);
      return options;
    },
    [pointsConfigOptions]
  );

  // Derive selected entities and filter products
  const selectedBrand = brands.find(b => b.id === selectedBrandId);
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const filteredProducts = products.filter(p => p.brand_id === selectedBrandId);

  // Deep-link: /ads-management/ads-db?ad_id=<id> focuses the page on one ad. The
  // grid is gated on brand+product+tab, so we resolve those from the ads row
  // (best-effort) and pre-fill the ad-id filter. If resolution fails, the ad-id
  // filter is still set and the user just picks brand/product.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const adIdParam = searchParams.get('ad_id');
    if (!adIdParam) return;
    if (brandsLoading || productsLoading) return; // wait for brand/product lists
    deepLinkApplied.current = true;
    const parsed = parseInt(adIdParam, 10);
    const adIdStr = Number.isFinite(parsed) ? String(parsed) : adIdParam;
    setSelectedAdId(adIdStr);
    setAdIdSearchInput(adIdStr);
    setAdIdSearch(adIdStr);
    (async () => {
      try {
        const { data } = await supabase
          .from('ads')
          .select('brand, product, ad_type')
          .eq('ad_id', Number.isFinite(parsed) ? parsed : adIdParam)
          .maybeSingle();
        if (!data) return;
        const adType = String((data as { ad_type?: string }).ad_type || '').toUpperCase();
        setActiveTab(adType === 'IMG' ? 'img-table' : adType === 'TSL' ? 'tsl-table' : 'vid-table');
        const prodVal = (data as { product?: string }).product;
        const brandVal = (data as { brand?: string }).brand;
        const prod = products.find(p => p.name === prodVal || p.product_code === prodVal);
        if (prod) {
          setSelectedBrandId(String(prod.brand_id));
          setSelectedProductId(String(prod.id));
        } else {
          const br = brands.find(b => b.name === brandVal || b.brand_code === brandVal);
          if (br) setSelectedBrandId(String(br.id));
        }
      } catch {
        /* best-effort — the ad-id filter remains pre-filled */
      }
    })();
  }, [searchParams, brandsLoading, productsLoading, products, brands]);

  const { data: allScriptIds = [] } = useVideoScripts(
    activeTab === 'vid-table' ? selectedProduct?.product_code : undefined,
    activeTab === 'vid-table' ? selectedProduct?.name : undefined
  );

  // Debounce Ad ID search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setAdIdSearch(adIdSearchInput);
      setAdIdVisible(10);
    }, 300);
    return () => clearTimeout(timer);
  }, [adIdSearchInput]);

  // Debounce Concept Name search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setConceptNameSearch(conceptNameInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [conceptNameInput]);

  // Debounce Script ID search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setScriptIdSearch(scriptIdSearchInput);
      setScriptIdVisible(10);
    }, 300);
    return () => clearTimeout(timer);
  }, [scriptIdSearchInput]);

  // Batch Week codes
  const weekCodes = useMemo(() => getCurrentAndNextYearWeekCodes(), []);

  // CS options filtered by brand (same logic as AddAdDialog)
  const getCsConfigForBrand = (brand: typeof selectedBrand) => {
    if (!brand) return [];
    const mainAndSecondaryEmails = [...(brand.main_cs || []), ...(brand.secondary_cs || [])];
    return mainAndSecondaryEmails.length > 0
      ? allCsConfig.filter(cs =>
          mainAndSecondaryEmails.some(email => cs.value?.toLowerCase().trim() === email.toLowerCase().trim())
        )
      : [];
  };

  const csOptionsForBrand = useMemo(
    () => getCsConfigForBrand(selectedBrand),
    [selectedBrand, allCsConfig]
  );

  // Format options from custom fields
  const formatOptions = useMemo(() => {
    const formatField = allFields.find(f => f.name?.toLowerCase() === 'ad format');
    if (!formatField || !formatField.options) return [];
    const opts = formatField.options as unknown;
    return Array.isArray(opts) ? opts.map((opt: unknown) => typeof opt === 'string' ? { label: opt, value: opt } : (opt as { label: string; value: string })) : [];
  }, [allFields]);

  // Angle options from custom fields
  const angleOptions = useMemo(() => {
    const angleField = allFields.find(f => f.name?.toLowerCase() === 'angle');
    if (!angleField || !angleField.options) return [];
    const opts = angleField.options as unknown;
    if (!Array.isArray(opts)) return [];
    let filtered = opts;
    if (angleField.is_option_product_level && selectedProduct?.name) {
      filtered = opts.filter((opt: unknown) => {
        if (typeof opt === 'object' && opt !== null && 'product' in opt) {
          return (opt as { product: string[] }).product.includes(selectedProduct!.name);
        }
        return true;
      });
    }
    return filtered.map((opt: unknown) => {
      if (typeof opt === 'string') return { label: opt, value: opt };
      const o = opt as { label: string; value?: string };
      return { label: o.label, value: o.value ?? o.label };
    });
  }, [allFields, selectedProduct]);

  // Platform options from custom fields
  const platformOptions = useMemo(() => {
    const field = allFields.find(f => f.name?.toLowerCase().includes('intended platform'));
    if (!field?.options) return [];
    const opts = field.options as unknown;
    return Array.isArray(opts)
      ? opts.map((opt: unknown) => typeof opt === 'string' ? { label: opt, value: opt } : (opt as { label: string; value: string }))
      : [];
  }, [allFields]);

  // Platform column name (ads vs statics_logs)
  const platformColumnName = useMemo(() => {
    const field = allFields.find(f => f.name?.toLowerCase().includes('intended platform'));
    return activeTab && tableNameMap[activeTabKey] === 'statics_logs'
      ? (field?.static_log_col_name ?? 'intended_chanel')
      : (field?.ads_col_name ?? 'intended_platform');
  }, [allFields, activeTab, activeTabKey]);

  // Stage options from custom fields (name "Stage")
  const stageOptions = useMemo(() => {
    const field = allFields.find(f => f.name?.toLowerCase() === 'stage');
    if (!field?.options) return [];
    const opts = field.options as unknown;
    return Array.isArray(opts)
      ? opts.map((opt: unknown) => typeof opt === 'string' ? { label: opt, value: opt } : (opt as { label: string; value: string }))
      : [];
  }, [allFields]);

  // Stage column name (ads vs statics_logs)
  const stageColumnName = useMemo(() => {
    const field = allFields.find(f => f.name?.toLowerCase() === 'stage');
    return activeTab && tableNameMap[activeTabKey] === 'statics_logs'
      ? (field?.static_log_col_name ?? 'stage')
      : (field?.ads_col_name ?? 'stage');
  }, [allFields, activeTab, activeTabKey]);

  // Status column name (ads vs statics_logs)
  const statusColumnName = useMemo(() => {
    const field = allFields.find(f => f.name?.toLowerCase() === 'status');
    return activeTab && tableNameMap[activeTabKey] === 'statics_logs'
      ? (field?.static_log_col_name ?? 'clickup_task_status')
      : (field?.ads_col_name ?? 'status');
  }, [allFields, activeTab, activeTabKey]);

  // Editor options for selected brand
  const editorOptionsForBrand = useMemo(() => {
    if (!selectedBrand) return [];
    const emails = [...(selectedBrand.main_editor || []), ...(selectedBrand.secondary_editor || [])];
    return emails.length > 0
      ? allCsConfig.filter(cs => emails.some(e => cs.value?.toLowerCase().trim() === e.toLowerCase().trim()))
      : [];
  }, [selectedBrand, allCsConfig]);

  const userOptionsMap = useMemo(() => {
    const map: Record<string, { label: string; value: string }[]> = {};
    const toOptions = (items: { label?: string | null; value?: string | null }[]) =>
      items.filter(c => c.label).map(c => ({ label: c.label!, value: c.label! }));
    allFields.forEach((f) => {
      if (f.type !== 'user') return;
      const name = f.name.toLowerCase();
      if (name.includes('editor')) map[f.id] = toOptions(editorOptionsForBrand);
      else if (name.includes('cs')) map[f.id] = toOptions(csOptionsForBrand);
    });
    return map;
  }, [allFields, csOptionsForBrand, editorOptionsForBrand]);

  // Script ID options for lazy-loading dropdown
  const scriptIdOptions = useMemo(() => {
    const seen = new Set<string>();
    return allScriptIds
      .map(r => String(r.script_id || '').padStart(6, '0'))
      .filter(id => { if (id === '000000' || seen.has(id)) return false; seen.add(id); return true; })
      .sort();
  }, [allScriptIds]);

  const filteredScriptIds = useMemo(() =>
    scriptIdOptions.filter(id => id.includes(scriptIdSearch.trim())),
  [scriptIdOptions, scriptIdSearch]);

  const visibleScriptIds = useMemo(() => filteredScriptIds.slice(0, scriptIdVisible), [filteredScriptIds, scriptIdVisible]);
  const hasMoreScriptIds = useMemo(() => scriptIdVisible < filteredScriptIds.length, [scriptIdVisible, filteredScriptIds.length]);

  // Show Additional Filters when Brand, Product, and Ad Type (tab) are selected
  const filtersReady = !!(selectedBrandId && selectedProductId && activeTab);

  // Get column names for format and angle fields
  const formatColumnName = useMemo(() => {
    const formatField = allFields.find(f => f.name?.toLowerCase() === 'ad format');
    return activeTab && tableNameMap[activeTabKey] === 'statics_logs' ? formatField?.static_log_col_name : formatField?.ads_col_name;
  }, [allFields, activeTab, activeTabKey]);

  const angleColumnName = useMemo(() => {
    const angleField = allFields.find(f => f.name?.toLowerCase() === 'angle');
    return activeTab && tableNameMap[activeTabKey] === 'statics_logs' ? angleField?.static_log_col_name : angleField?.ads_col_name;
  }, [allFields, activeTab, activeTabKey]);

  // TSL tab Angle / Sub-angle option lists — pulled from the one canonical
  // source (CS KPIs ∪ ads bank) so they match every other tool's dropdowns.
  const tslOptionsProductQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (selectedProduct?.product_code) p.set('product', selectedProduct.product_code);
    if (selectedProduct?.name) p.set('productName', selectedProduct.name);
    return p.toString();
  }, [selectedProduct]);

  const { data: tslAngleOptions = [] } = useQuery<string[]>({
    queryKey: ['tsl-angle-options', tslOptionsProductQuery],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/options/angles?${tslOptionsProductQuery}`);
      const j = r.ok ? await r.json() : [];
      return Array.isArray(j) ? j.filter(Boolean) : [];
    },
    enabled: activeTabKey === 'tsl-table' && !!selectedProduct?.name,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tslSubAngleOptions = [] } = useQuery<string[]>({
    queryKey: ['tsl-sub-angle-options', tslOptionsProductQuery],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/options/sub-angle-details?${tslOptionsProductQuery}`);
      const j = r.ok ? await r.json() : [];
      return Array.isArray(j) ? j.filter(Boolean) : [];
    },
    enabled: activeTabKey === 'tsl-table' && !!selectedProduct?.name,
    staleTime: 5 * 60 * 1000,
  });

  // Resolve filter labels for server-side queries
  const csLabel = selectedCs ? csOptionsForBrand.find((cs) => cs.value === selectedCs)?.label : undefined;
  const formatLabel = selectedFormat ? formatOptions.find((f) => f.value === selectedFormat)?.label : undefined;
  const angleLabel = selectedAngle ? angleOptions.find((a) => a.value === selectedAngle)?.label : undefined;
  const platformLabel = selectedPlatform ? platformOptions.find((p) => p.value === selectedPlatform)?.label : undefined;
  const editorLabel = selectedEditor
    ? editorOptionsForBrand.find(cs => cs.value === selectedEditor)?.label
    : undefined;
  const stageLabel = selectedStage ? stageOptions.find((s) => s.value === selectedStage)?.label : undefined;

  // Status filter options — distinct status values that live in the data (dynamic, NOT from
  // custom_fields; the Status custom field has no synced options). Inconsistent duplicate
  // spellings (e.g. "to do" / "todo") are merged into one option; `variants` holds every raw
  // spelling so selecting it filters them all. Declared BEFORE useAdsData so the selected
  // variants can feed the server-side .in filter below.
  const { data: statusOptions = [] } = useAdsStatusDistinct(
    activeTab ? adTypeMap[activeTabKey] : undefined,
    activeTab ? tableNameMap[activeTabKey] : 'ads',
    selectedBrand?.name,
    selectedBrand?.brand_code,
    selectedProduct?.name,
    selectedProduct?.product_code,
    statusColumnName,
    filtersReady,
  );
  const selectedStatusVariants = useMemo(
    () => (selectedStatus ? statusOptions.find((o) => o.value === selectedStatus)?.variants : undefined),
    [selectedStatus, statusOptions]
  );

  const {
    data: adsData,
    isLoading: rowsLoading,
  } = useAdsData(
    allFields,
    activeTab ? adTypeMap[activeTabKey] : undefined,
    activeTab ? tableNameMap[activeTabKey] : 'ads',
    selectedBrand?.name,
    selectedBrand?.brand_code,
    selectedProduct?.name,
    selectedProduct?.product_code,
    {
      adId: selectedAdId ? parseInt(selectedAdId, 10) : undefined,
      cs: csLabel,
      conceptName: conceptNameSearch || undefined,
      batchWeek: selectedBatchWeek || undefined,
      formatCol: selectedFormat ? formatColumnName : undefined,
      formatVal: formatLabel,
      angleCol: activeTabKey === 'tsl-table'
        ? (selectedTslAngle ? 'sub_angle' : undefined)
        : (selectedAngle ? angleColumnName : undefined),
      angleVal: activeTabKey === 'tsl-table' ? (selectedTslAngle || undefined) : angleLabel,
      subAngleCol: activeTabKey === 'tsl-table' && selectedTslSubAngle ? 'sub_angle_detail' : undefined,
      subAngleVal: activeTabKey === 'tsl-table' ? (selectedTslSubAngle || undefined) : undefined,
      launchMeta: launchMeta || undefined,
      launchApplovin: launchApplovin || undefined,
      platformCol: selectedPlatform ? platformColumnName : undefined,
      platformVal: platformLabel,
      scriptId: activeTab === 'vid-table' && selectedScriptId ? parseInt(selectedScriptId, 10) : undefined,
      editor: editorLabel,
      stageCol: selectedStage ? stageColumnName : undefined,
      stageVal: stageLabel,
      statusCol: selectedStatus ? statusColumnName : undefined,
      statusVals: selectedStatusVariants,
      editType: selectedEditType || undefined,
    },
    page,
    pageSize,
  );

  const rows = adsData?.rows ?? [];
  const totalCount = adsData?.totalCount ?? 0;

  const { data: allAdIds = [] } = useAdsAdIds(
    activeTab ? adTypeMap[activeTabKey] : undefined,
    activeTab ? tableNameMap[activeTabKey] : 'ads',
    selectedBrand?.name,
    selectedBrand?.brand_code,
    selectedProduct?.name,
    selectedProduct?.product_code,
  );

  // Reset every secondary filter (angle, cs, format, …) — shared by brand/product change.
  const resetSecondaryFilters = () => {
    setPage(1);
    setSelectedAdId('');
    setSelectedCs('');
    setConceptNameSearch('');
    setSelectedBatchWeek('');
    setLaunchMeta('');
    setLaunchApplovin('');
    setSelectedFormat('');
    setSelectedAngle('');
    setSelectedTslAngle('');
    setSelectedTslSubAngle('');
    setSelectedPlatform('');
    setSelectedScriptId('');
    setSelectedEditor('');
    setSelectedStage('');
    setSelectedStatus('');
    setSelectedEditType('');
  };

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedProductId('');
    resetSecondaryFilters();
  };

  // Switching product also clears the per-product filters (e.g. an angle from the old product).
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    resetSecondaryFilters();
  };

  const clearAllFilters = () => {
    handleBrandChange('');
    setSelectedProductId('');
    setActiveTab('');
    setSelectedAdId('');
    setAdIdSearch('');
    setAdIdVisible(10);
    setSelectedCs('');
    setConceptNameSearch('');
    setSelectedBatchWeek('');
    setLaunchMeta('');
    setLaunchApplovin('');
    setSelectedFormat('');
    setSelectedAngle('');
    setSelectedTslAngle('');
    setSelectedTslSubAngle('');
    setSelectedPlatform('');
    setSelectedScriptId('');
    setSelectedEditor('');
    setSelectedStage('');
    setSelectedStatus('');
    setSelectedEditType('');
  };

  const handleAddFieldOption = useCallback(async (fieldId: string, label: string) => {
    const field = allFields.find((f) => f.id === fieldId);
    if (!field) return;

    const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
    if (!baseUrl) return;

    let updatedOptions: unknown[];

    if (field.is_option_product_level && selectedProduct?.name) {
      const current = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      const existing = current.find((o) => o.label === label);
      if (existing) {
        // Option already exists — add this product to it
        updatedOptions = current.map((o) =>
          o.label === label
            ? { ...o, product: Array.from(new Set([...o.product, selectedProduct!.name])) }
            : o,
        );
      } else {
        updatedOptions = [...current, { label, product: [selectedProduct.name] }];
      }
    } else {
      const current = (field.options as string[]) ?? [];
      if (current.includes(label)) return;
      updatedOptions = [...current, label];
    }

    try {
      await fetch(`${baseUrl}/custom-fields/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fieldId, options: updatedOptions }),
      });
      queryClient.invalidateQueries({ queryKey: ['ads-db-fields'] });
    } catch (err) {
      console.error('[handleAddFieldOption] Failed:', err);
    }
  }, [allFields, selectedProduct, queryClient]);

  const handleOpenManageOptions = useCallback((fieldId: string) => {
    const field = allFields.find((f) => f.id === fieldId);
    if (field?.name === 'Points') {
      setManagePointsDialogOpen(true);
    } else {
      setManageDialogFieldId(fieldId);
      setManageDialogOpen(true);
    }
  }, [allFields]);

  const handleRenameFieldOption = useCallback(async (fieldId: string, oldLabel: string, newLabel: string) => {
    const field = allFields.find((f) => f.id === fieldId);
    if (!field) return;

    const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
    if (!baseUrl) return;

    let updatedOptions: unknown[];

    if (field.is_option_product_level) {
      const current = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      updatedOptions = current.map((o) =>
        o.label === oldLabel ? { ...o, label: newLabel } : o,
      );
    } else {
      const current = (field.options as string[]) ?? [];
      updatedOptions = current.map((o) => (o === oldLabel ? newLabel : o));
    }

    try {
      await fetch(`${baseUrl}/custom-fields/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fieldId, options: updatedOptions }),
      });
      queryClient.invalidateQueries({ queryKey: ['ads-db-fields'] });
    } catch (err) {
      console.error('[handleRenameFieldOption] Failed:', err);
    }
  }, [allFields, queryClient]);

  const handleRemoveFieldOption = useCallback(async (fieldId: string, label: string) => {
    const field = allFields.find((f) => f.id === fieldId);
    if (!field) return;

    const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
    if (!baseUrl) return;

    let updatedOptions: unknown[];

    if (field.is_option_product_level && selectedProduct?.name) {
      const current = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      updatedOptions = current
        .map((o) =>
          o.label === label
            ? { ...o, product: o.product.filter((p) => p !== selectedProduct!.name) }
            : o,
        )
        .filter((o) => o.product.length > 0);
    } else {
      const current = (field.options as string[]) ?? [];
      updatedOptions = current.filter((o) => o !== label);
    }

    try {
      await fetch(`${baseUrl}/custom-fields/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fieldId, options: updatedOptions }),
      });
      queryClient.invalidateQueries({ queryKey: ['ads-db-fields'] });
    } catch (err) {
      console.error('[handleRemoveFieldOption] Failed:', err);
    }
  }, [allFields, selectedProduct, queryClient]);

  const handleAddPointsOption = useCallback(async (label: string) => {
    const current = pointsConfigOptions ?? [];
    if (current.includes(label)) return;
    const updated = [...current, label];
    try {
      const { error } = await supabase
        .from('other_config' as any)
        .update({ points_config: updated })
        .eq('name', 'product_wise_config');
      if (error) throw error;
      queryClient.setQueryData(['other-config'], updated);
    } catch (err) {
      console.error('[handleAddPointsOption] Failed:', err);
    }
  }, [pointsConfigOptions, queryClient]);

  const handleRemovePointsOption = useCallback(async (label: string) => {
    const current = pointsConfigOptions ?? [];
    const updated = current.filter((o) => o !== label);
    try {
      const { error } = await supabase
        .from('other_config' as any)
        .update({ points_config: updated })
        .eq('name', 'product_wise_config');
      if (error) throw error;
      queryClient.setQueryData(['other-config'], updated);
    } catch (err) {
      console.error('[handleRemovePointsOption] Failed:', err);
    }
  }, [pointsConfigOptions, queryClient]);

  const handleRenamePointsOption = useCallback(async (oldLabel: string, newLabel: string) => {
    const current = pointsConfigOptions ?? [];
    const updated = current.map((o) => (o === oldLabel ? newLabel : o));
    try {
      const { error } = await supabase
        .from('other_config' as any)
        .update({ points_config: updated })
        .eq('name', 'product_wise_config');
      if (error) throw error;
      queryClient.setQueryData(['other-config'], updated);
    } catch (err) {
      console.error('[handleRenamePointsOption] Failed:', err);
    }
  }, [pointsConfigOptions, queryClient]);

  const handleCellValueChanged = useCallback(async (params: CellValueChangedEvent) => {
    const rowData = params.data as any;
    const colKey = params.colDef.field as string;
    const colId = params.colDef.colId as string;
    const newValue = params.newValue;
    const oldValue = params.oldValue;

    console.log('[handleCellValueChanged] ✅ FIRED! colKey:', colKey, 'colId:', colId, 'newValue:', newValue);

    if (!colKey || !activeTab) {
      console.log('[handleCellValueChanged] returning early - no colKey or activeTab');
      return;
    }

    // Handle Points column (VID tab only) — write directly to ads table
    if (colKey === 'points' && activeTabKey === 'vid-table') {
      console.log('[handleCellValueChanged] ===== POINTS COLUMN =====');
      console.log('[handleCellValueChanged] newValue:', newValue, 'type:', typeof newValue);
      const ad_id = Number(rowData.ad_id);
      const numericValue = newValue ? (isNaN(Number(newValue)) ? null : Number(newValue)) : null;
      console.log('[handleCellValueChanged] ad_id:', ad_id, 'numericValue:', numericValue);

      console.log('[handleCellValueChanged] sending update to Supabase...');
      supabase
        .from('ads' as any)
        .update({ points: numericValue })
        .eq('ad_id', ad_id)
        .then(({ error, data }) => {
          if (error) {
            console.error('[handleCellValueChanged] ❌ Points update error:', error);
          } else {
            console.log('[handleCellValueChanged] ✅ Points updated successfully, data:', data);
            console.log('[handleCellValueChanged] invalidating ads-data query...');
            // Refresh the grid data after save
            setTimeout(() => {
              queryClient.invalidateQueries({
                queryKey: ['ads-data', adTypeMap[activeTabKey], tableNameMap[activeTabKey], selectedBrand?.name, selectedBrand?.brand_code, selectedProduct?.name, selectedProduct?.product_code]
              });
            }, 100);
          }
        });
      return;
    }

    const colNameKey = tableNameMap[activeTabKey] === 'statics_logs' ? 'static_log_col_name' : 'ads_col_name';
    const field = allFields.find((f) => f[colNameKey as keyof AdsField] === colKey);

    console.log('[handleCellValueChanged] found field:', field?.name);
    if (!field) {
      console.log('[handleCellValueChanged] field not found in allFields');
      return;
    }

    const ad_id = Number(rowData.ad_id);
    let valueToSend = newValue;
    if ((field.type === 'dropdown' || field.type === 'dropdown_text') && field.options) {
      valueToSend = getLabelFromDropdownOptions(field.options, newValue);
    }

    // ── Editing-stage gate (VID only): block until required fields are set ──
    // Advisory pre-check for instant UX; the backend re-validates authoritatively.
    if (
      tableNameMap[activeTabKey] === 'ads' &&
      colKey === stageColumnName &&
      String(valueToSend).trim().toLowerCase() === 'editing'
    ) {
      const missing = findMissingRequiredFields(rowData as Record<string, unknown>);
      if (missing.length > 0) {
        toast(buildEditingBlockedToast(missing));
        params.node.setDataValue(colKey, oldValue); // revert the grid cell
        return;
      }
    }

    console.log('[handleCellValueChanged] calling updateAdField with:', { ad_id, fieldName: field.name, valueToSend });
    try {
      const result = await updateAdField(ad_id, field.name, valueToSend, activeTabKey, field);
      if (result && !result.ok) {
        // Backend rejected — if it's the required-fields guard, show the same
        // chip toast; otherwise a plain error. Then roll the cell back.
        toast(
          result.missingFields?.length
            ? buildEditingBlockedToast(result.missingFields)
            : { title: 'Update failed', description: result.message ?? 'Could not update the field.', variant: 'destructive' as const },
        );
        params.node.setDataValue(colKey, oldValue);
      }
    } finally {
      console.log('[handleCellValueChanged] invalidating query');
      queryClient.invalidateQueries({
        queryKey: ['ads-data', adTypeMap[activeTabKey], tableNameMap[activeTabKey], selectedBrand?.name, selectedBrand?.brand_code, selectedProduct?.name, selectedProduct?.product_code]
      });
    }
  }, [activeTab, activeTabKey, allFields, selectedBrand, selectedProduct, queryClient, stageColumnName, toast]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      'img-table': 0,
      'tsl-table': 0,
      'vid-table': 0,
    };
    allFields.forEach((f) => {
      f.contains?.forEach((tab) => {
        if (tab in counts) counts[tab as TabKey]++;
      });
    });
    return counts;
  }, [allFields]);

  const tabs: TabKey[] = ['vid-table', 'tsl-table', 'img-table'];

  // Memoized brand and product lookup maps for performance
  const brandLookup = useMemo(() => {
    const map = new Map<string, { code: string }>();
    brands.forEach(b => {
      map.set(b.name.toLowerCase(), { code: b.brand_code });
      map.set(b.brand_code?.toLowerCase() || '', { code: b.brand_code });
    });
    return map;
  }, [brands]);

  const productLookup = useMemo(() => {
    const map = new Map<string, { code: string }>();
    products.forEach(p => {
      map.set(p.name.toLowerCase(), { code: p.product_code });
      map.set(p.product_code?.toLowerCase() || '', { code: p.product_code });
    });
    return map;
  }, [products]);

  // Create AG Grid ColDef[] dynamically based on selected tab
  const getColumnsForActiveTab = useMemo((): ColDef[] => {
    if (!activeTab) return [];
    const fields = getColumnsForTab(allFields, activeTabKey);
    let baseColumns = fields.length === 0 ? [] : createAdsAgGridColumns(fields, tableNameMap[activeTabKey], tslScripts, selectedProduct?.name, handleOpenManageOptions, canEdit, userOptionsMap);

    // Override Points column for VID tab to add dropdown
    if (activeTabKey === 'vid-table') {
      console.log('[getColumnsForActiveTab] VID tab - looking for Points column');
      console.log('[getColumnsForActiveTab] All columns fields:', baseColumns.map(c => c.field).join(', '));

      let pointsColumnFound = false;
      baseColumns = baseColumns.map((col) => {
        // Try both 'points' and looking for a column with headerName containing 'points'
        const isPointsCol = col.field === 'points' || (col.headerName && col.headerName.toLowerCase().includes('points'));

        if (!isPointsCol) return col;

        pointsColumnFound = true;
        console.log('[getColumnsForActiveTab] 🎯 Found Points column! field:', col.field, 'headerName:', col.headerName);

        return {
          ...col,
          cellEditor: DropdownCellEditor,
          cellEditorParams: (params: any) => {
            const handlePointsSelect = (newValue: string) => {
              console.log('[getColumnsForActiveTab] Points selected:', { ad_id: params.data.ad_id, newValue });
              const ad_id = Number(params.data.ad_id);

              // Call the same updateAdField API that other columns use
              console.log('[getColumnsForActiveTab] Calling updateAdField API for Points');
              updateAdField(ad_id, 'Points', newValue, activeTabKey);

              // Refresh the grid
              setTimeout(() => {
                queryClient.invalidateQueries({
                  queryKey: ['ads-data', adTypeMap[activeTabKey], tableNameMap[activeTabKey], selectedBrand?.name, selectedBrand?.brand_code, selectedProduct?.name, selectedProduct?.product_code]
                });
              }, 500);
            };

            return {
              options: pointsOptions,
              canAddOptions: canEdit,
              onOpenManageOptions: () => setManagePointsDialogOpen(true),
              onSelectValue: handlePointsSelect,
            };
          },
          cellEditorPopup: true,
        };
      });

      if (!pointsColumnFound) {
        console.log('[getColumnsForActiveTab] ❌ Points column NOT found!');
      }
    }

    // Add computed columns for VID, TSL, and IMG tabs (after all required data is loaded)
    if (!brandsLoading && !productsLoading && brands.length > 0 && products.length > 0) {
      const adSetNameColumn: ColDef = {
        colId: 'ad_set_name',
        headerName: 'Ad Set Name',
        width: 350,
        minWidth: 350,
        cellRenderer: (params: ICellRendererParams) => {
          const data = params.data as any;
          const brandName = tableNameMap[activeTabKey] === 'statics_logs' ? data.brand_name : data.brand;
          const productName = tableNameMap[activeTabKey] === 'statics_logs' ? data.product_name : data.product;
          const batch_week = tableNameMap[activeTabKey] === 'statics_logs' ? data.week : data.batch_week;
          const brandCode = brandLookup.get(String(brandName || '').toLowerCase())?.code || 'BrandCode';
          const productCode = productLookup.get(String(productName || '').toLowerCase())?.code || 'ProductCode';
          const batchWeekCode = batch_week || 'batchWeekCode';
          const angle = data.sub_angle || 'Angle';
          const conceptName = data.concept_name || 'ConceptName';
          const funnel = data.funnel || 'Funnel';
          const cs = data.cs || 'CS';
          const language = data.language || 'Language';
          const creationMethod = data.creation_method || 'CreationMethod';
          let result = '';
          if (activeTabKey === 'vid-table') {
            const adId = data.ad_id ? String(data.ad_id).padStart(6, '0') : 'ad_id';
            const scriptId = data.script_id ? String(data.script_id).padStart(6, '0') : 'scriptId';
            result = `${adId}_${scriptId}_${brandCode}_${productCode}_${batchWeekCode}_${angle}_${conceptName}_${data.ad_type || 'AdType'}_${data.ad_format || 'AdFormat'}_${funnel}_CS.${cs}_${data.it_or_nn || 'IT.NN'}_${language}`;
          } else if (activeTabKey === 'img-table') {
            const adId = data.ad_id ? String(data.ad_id).padStart(6, '0') : 'ad_id';
            result = `${adId}_NONE_${brandCode}_${productCode}_${batchWeekCode}_${conceptName}_IMG_${creationMethod}_${funnel}_CS.${cs}_${language}`;
          } else if (activeTabKey === 'tsl-table') {
            const adId = data.ad_id ? String(data.ad_id).padStart(6, '0') : 'ad_id';
            result = `${adId}_${data.tsl_script_id || 'NONE'}_${brandCode}_${productCode}_${batchWeekCode}_${conceptName}_TSL_${creationMethod}_${funnel}_CS.${cs}_${language}`;
          }
          return <span style={{ fontFamily: 'monospace', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result}</span>;
        },
      };

      const adNameTemplateColumn: ColDef = {
        colId: 'ad_name_template',
        headerName: 'Ad Name Template',
        width: 380,
        minWidth: 380,
        cellRenderer: (params: ICellRendererParams) => {
          const data = params.data as any;
          const brandName = tableNameMap[activeTabKey] === 'statics_logs' ? data.brand_name : data.brand;
          const productName = tableNameMap[activeTabKey] === 'statics_logs' ? data.product_name : data.product;
          const batch_week = tableNameMap[activeTabKey] === 'statics_logs' ? data.week : data.batch_week;
          const brandCode = brandLookup.get(String(brandName || '').toLowerCase())?.code || 'BrandCode';
          const productCode = productLookup.get(String(productName || '').toLowerCase())?.code || 'ProductCode';
          const batchWeekCode = batch_week || 'batchWeekCode';
          const angle = data.sub_angle || 'Angle';
          const conceptName = data.concept_name || 'ConceptName';
          const funnel = data.funnel || 'Funnel';
          const cs = data.cs || 'CS';
          const language = data.language || 'Language';
          const creationMethod = data.creation_method || 'CreationMethod';
          let result = '';
          if (activeTabKey === 'vid-table') {
            const adId = data.ad_id ? String(data.ad_id).padStart(6, '0') : 'ad_id';
            const scriptId = data.script_id ? String(data.script_id).padStart(6, '0') : 'scriptId';
            const variationsCount = data.ss_count || 'VariationsCount';
            result = `${adId}_${scriptId}_${brandCode}_${productCode}_${batchWeekCode}_${angle}_${conceptName}_SS[${variationsCount}]_${data.ad_type || 'AdType'}_${data.ad_format || 'AdFormat'}_${funnel}_CS.${cs}_${data.it_or_nn || 'IT.NN'}_${language}`;
          } else if (activeTabKey === 'img-table') {
            const adId = data.ad_id ? String(data.ad_id).padStart(6, '0') : 'ad_id';
            result = `${adId}_NONE_${brandCode}_${productCode}_${batchWeekCode}_${conceptName}_IMG_${creationMethod}_${funnel}_CS.${cs}_${language}`;
          } else if (activeTabKey === 'tsl-table') {
            const adId = data.ad_id ? String(data.ad_id).padStart(6, '0') : 'ad_id';
            result = `${adId}_${data.tsl_script_id || 'NONE'}_${brandCode}_${productCode}_${batchWeekCode}_${conceptName}_TSL_${creationMethod}_${funnel}_CS.${cs}_${language}`;
          }
          return <span style={{ fontFamily: 'monospace', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result}</span>;
        },
      };

      // For TSL tab, replace TSL Script Link column with gdoc_link from tsl_scripts
      if (activeTabKey === 'tsl-table') {
        const filteredColumns = baseColumns.filter((col: any) =>
          col.headerName !== 'TSL Script Link'
          // Drop any config-driven Angle/Sub-angle columns; we render our own
          // computed ones below so they always show regardless of fields-config.
          && col.field !== 'sub_angle'
          && col.field !== 'sub_angle_detail'
        );

        const angleColumn: ColDef = {
          colId: 'tsl_angle',
          headerName: 'Angle',
          width: 150,
          minWidth: 120,
          cellRenderer: (params: ICellRendererParams) => {
            const v = (params.data as any).sub_angle;
            return v ? <span>{v}</span> : <span className="text-muted-foreground">—</span>;
          },
        };

        const subAngleColumn: ColDef = {
          colId: 'tsl_sub_angle',
          headerName: 'Sub-angle',
          width: 150,
          minWidth: 120,
          cellRenderer: (params: ICellRendererParams) => {
            const v = (params.data as any).sub_angle_detail;
            return v ? <span>{v}</span> : <span className="text-muted-foreground">—</span>;
          },
        };

        const tslScriptLinkColumn: ColDef = {
          colId: 'tsl_script_link',
          headerName: 'TSL Script Link',
          width: 120,
          minWidth: 120,
          cellRenderer: (params: ICellRendererParams) => {
            const tslScriptId = (params.data as any).tsl_script_id;
            const tslScript = tslScripts.find((s: any) => String(s.tsl_script_id) === String(tslScriptId));
            const gdocLink = tslScript?.gdoc_link;
            if (!gdocLink) return <span className="text-muted-foreground">—</span>;
            return (
              <a href={gdocLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Link
              </a>
            );
          },
        };

        const scriptIdColumn: ColDef = {
          colId: 'script_id_tsl',
          headerName: 'Core ID',
          width: 120,
          minWidth: 120,
          cellRenderer: (params: ICellRendererParams) => {
            const tslScriptId = (params.data as any).tsl_script_id;
            const tslScript = tslScripts.find((s: any) => String(s.tsl_script_id) === String(tslScriptId));
            const coreId = tslScript?.core_id;
            return coreId
              ? <span style={{ fontFamily: 'monospace' }}>{coreId}</span>
              : <span className="text-muted-foreground">—</span>;
          },
        };

        const scriptVariationColumn: ColDef = {
          colId: 'script_variation',
          headerName: 'Script Variation',
          width: 140,
          minWidth: 140,
          cellRenderer: (params: ICellRendererParams) => {
            const tslScriptId = (params.data as any).tsl_script_id;
            const tslScript = tslScripts.find((s: any) => String(s.tsl_script_id) === String(tslScriptId));
            const variation = tslScript?.variation;
            return variation
              ? <span>{variation}</span>
              : <span className="text-muted-foreground">—</span>;
          },
        };

        return [...filteredColumns, angleColumn, subAngleColumn, tslScriptLinkColumn, scriptIdColumn, scriptVariationColumn, adSetNameColumn, adNameTemplateColumn];
      }

      return [...baseColumns, adSetNameColumn, adNameTemplateColumn];
    }

    return baseColumns;
  }, [allFields, activeTab, tableNameMap, tslScripts, brandLookup, productLookup, brandsLoading, productsLoading, activeTabKey, selectedProduct, handleOpenManageOptions, canEdit, pointsOptions, userOptionsMap]);

  const displayRows = useMemo(() => rows as Record<string, unknown>[], [rows]);

  const adIdOptions = useMemo(() => {
    const seen = new Set<string>();
    let filtered = allAdIds;

    if (activeTab === 'tsl-table') {
      filtered = allAdIds.filter(r => {
        const driveLink = r.image_generation_drive_link;
        return driveLink && String(driveLink).trim().length > 0;
      });
    }

    return filtered
      .map(r => String(r.ad_id || '').padStart(6, '0'))
      .filter(id => { if (id === '000000' || seen.has(id)) return false; seen.add(id); return true; })
      .sort();
  }, [allAdIds, activeTab]);

  // Ad ID lazy-loading handlers
  const handleAdIdScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && !isAdIdLoading && hasMoreAdIds) {
      setIsAdIdLoading(true);
      setTimeout(() => {
        setAdIdVisible(v => v + 10);
        setIsAdIdLoading(false);
      }, 200);
    }
  };

  const handleAdIdWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.scrollTop += e.deltaY;
    handleAdIdScroll(e as unknown as React.UIEvent<HTMLDivElement>);
  };

  // Script ID lazy-loading handlers
  const handleScriptIdScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && !isScriptIdLoading && hasMoreScriptIds) {
      setIsScriptIdLoading(true);
      setTimeout(() => {
        setScriptIdVisible(v => v + 10);
        setIsScriptIdLoading(false);
      }, 200);
    }
  };

  const handleScriptIdWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.scrollTop += e.deltaY;
    handleScriptIdScroll(e as unknown as React.UIEvent<HTMLDivElement>);
  };

  // Filtered and visible Ad IDs for lazy-loading
  const filteredAdIds = useMemo(() => {
    return adIdOptions.filter(id => id.includes(adIdSearch.trim()));
  }, [adIdOptions, adIdSearch]);

  const visibleAdIds = useMemo(() => {
    return filteredAdIds.slice(0, adIdVisible);
  }, [filteredAdIds, adIdVisible]);

  const hasMoreAdIds = useMemo(() => {
    return adIdVisible < filteredAdIds.length;
  }, [adIdVisible, filteredAdIds.length]);


  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 flex flex-col min-w-0 h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Ads DB
              </h1>
            </div>
          </div>
        </div>

        {/* Filter bar - Brand and Product selection */}
        <div className="space-y-3 flex-shrink-0 pb-2">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Brand Filter */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Brand</label>
                <Select value={selectedBrandId} onValueChange={handleBrandChange}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Filter */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product</label>
                <Select value={selectedProductId} onValueChange={handleProductChange} disabled={!selectedBrandId}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select Product" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(selectedBrandId || selectedProductId || selectedAdId || selectedCs || conceptNameSearch || selectedBatchWeek || launchMeta || launchApplovin || selectedFormat || selectedAngle || selectedTslAngle || selectedTslSubAngle || selectedPlatform || selectedScriptId || selectedEditor || selectedStage || selectedStatus || selectedEditType) && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="h-10"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Optional Filters */}
        {filtersReady && (
          <div className="flex-shrink-0 pb-2">
            <Accordion type="single" collapsible defaultValue="filters" className="w-full">
              <AccordionItem value="filters" className="border border-slate-200 rounded-lg">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 rounded-t-lg bg-gradient-to-r from-slate-50 to-slate-100/50">
                  <h3 className="text-sm font-semibold text-slate-700">Additional Filters</h3>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-4 border-t border-slate-200">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* Launched on Meta */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Launched on Meta</label>
                  <Select value={launchMeta || 'all'} onValueChange={(v) => { setLaunchMeta(v === 'all' ? '' : (v as 'Yes' | 'No' | '')); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Launched on Applovin */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Launched on Applovin</label>
                  <Select value={launchApplovin || 'all'} onValueChange={(v) => { setLaunchApplovin(v === 'all' ? '' : (v as 'Yes' | 'No' | '')); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Ad ID Searchable */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Ad ID</label>
                  <Popover open={adIdOpen} onOpenChange={(open) => {
                    setAdIdOpen(open);
                    if (!open) {
                      setAdIdSearchInput('');
                      setAdIdSearch('');
                    }
                  }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 justify-between text-sm" size="sm">
                        <span className="truncate text-xs">{selectedAdId || 'All'}</span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-0">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search..."
                          value={adIdSearchInput}
                          onValueChange={setAdIdSearchInput}
                          className="text-sm"
                        />
                        <CommandList onScroll={handleAdIdScroll} onWheel={handleAdIdWheel} className="max-h-52 overflow-y-auto flex flex-col">
                          <CommandEmpty className="text-xs">No ads found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem onSelect={() => {
                              setSelectedAdId('');
                              setPage(1);
                              setAdIdOpen(false);
                            }} className="cursor-pointer text-sm">
                              All
                              {selectedAdId === '' && <Check className="ml-auto h-4 w-4" />}
                            </CommandItem>
                            {visibleAdIds.map(id => (
                              <CommandItem key={id} onSelect={() => {
                                setSelectedAdId(id);
                                setPage(1);
                                setAdIdOpen(false);
                              }} className="cursor-pointer text-sm">
                                {id}
                                {selectedAdId === id && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          {(hasMoreAdIds || adIdSearchInput !== adIdSearch) && (
                            <div className="py-2 text-center text-xs text-muted-foreground border-t">
                              {adIdSearchInput !== adIdSearch ? (
                                <div className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>Searching...</span>
                                </div>
                              ) : isAdIdLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>Loading...</span>
                                </div>
                              ) : (
                                <span>Scroll for more ({filteredAdIds.length - adIdVisible} remaining)</span>
                              )}
                            </div>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* CS Searchable */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">CS</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 justify-between text-sm" size="sm" disabled={!selectedBrand}>
                        <span className="truncate text-xs">{selectedCs ? csOptionsForBrand.find(cs => cs.value === selectedCs)?.label || selectedCs : 'All'}</span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-0">
                      <Command>
                        <CommandInput placeholder="Search CS..." className="text-sm" />
                        <CommandList>
                          <CommandEmpty className="text-xs">No CS found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem onSelect={() => { setSelectedCs(''); setPage(1); }} className="cursor-pointer text-xs">
                              <span className="truncate">All</span>
                              {selectedCs === '' && <Check className="ml-auto h-4 w-4" />}
                            </CommandItem>
                            {csOptionsForBrand.map(cs => (
                              <CommandItem key={cs.value} onSelect={() => { setSelectedCs(cs.value); setPage(1); }} className="cursor-pointer text-xs">
                                <span className="truncate">{cs.label}</span>
                                {selectedCs === cs.value && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Concept Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Concept</label>
                  <Input type="text" placeholder="Contains..." value={conceptNameInput} onChange={(e) => { setConceptNameInput(e.target.value); setPage(1); }} className="h-9 text-sm placeholder:text-xs" />
                </div>

                {/* Batch Week */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Batch Week</label>
                  <Select value={selectedBatchWeek || 'all'} onValueChange={(v) => { setSelectedBatchWeek(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {weekCodes.map(week => (
                        <SelectItem key={week.code} value={week.code} className="text-sm">
                          {week.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Format Searchable - VID tab only */}
                {activeTab === 'vid-table' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600">Format</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-sm" size="sm">
                          <span className="truncate text-xs">{selectedFormat ? formatOptions.find(fmt => fmt.value === selectedFormat)?.label || selectedFormat : 'All'}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-0">
                        <Command>
                          <CommandInput placeholder="Search..." className="text-sm" />
                          <CommandList>
                            <CommandEmpty className="text-xs">No formats found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem onSelect={() => { setSelectedFormat(''); setPage(1); }} className="cursor-pointer text-sm">
                                <span className="truncate">All</span>
                                {selectedFormat === '' && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                              {formatOptions.map(fmt => (
                                <CommandItem key={fmt.value} onSelect={() => { setSelectedFormat(fmt.value); setPage(1); }} className="cursor-pointer text-sm">
                                  <span className="truncate">{fmt.label}</span>
                                  {selectedFormat === fmt.value && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Angle Searchable - VID tab only */}
                {activeTab === 'vid-table' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600">Angle</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-sm" size="sm">
                          <span className="truncate text-xs">{selectedAngle ? angleOptions.find(angle => angle.value === selectedAngle)?.label || selectedAngle : 'All'}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-0">
                        <Command>
                          <CommandInput placeholder="Search..." className="text-sm" />
                          <CommandList>
                            <CommandEmpty className="text-xs">No angles found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem onSelect={() => { setSelectedAngle(''); setPage(1); }} className="cursor-pointer text-sm">
                                <span className="truncate">All</span>
                                {selectedAngle === '' && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                              {angleOptions.map(angle => (
                                <CommandItem key={angle.value} onSelect={() => { setSelectedAngle(angle.value); setPage(1); }} className="cursor-pointer text-sm">
                                  <span className="truncate">{angle.label}</span>
                                  {selectedAngle === angle.value && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Angle - TSL tab only (statics_logs.sub_angle) */}
                {activeTab === 'tsl-table' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600">Angle</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-sm" size="sm">
                          <span className="truncate text-xs">{selectedTslAngle || 'All'}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-0">
                        <Command>
                          <CommandInput placeholder="Search..." className="text-sm" />
                          <CommandList>
                            <CommandEmpty className="text-xs">No angles found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem onSelect={() => { setSelectedTslAngle(''); setPage(1); }} className="cursor-pointer text-sm">
                                <span className="truncate">All</span>
                                {selectedTslAngle === '' && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                              {tslAngleOptions.map(angle => (
                                <CommandItem key={angle} onSelect={() => { setSelectedTslAngle(angle); setPage(1); }} className="cursor-pointer text-sm">
                                  <span className="truncate">{angle}</span>
                                  {selectedTslAngle === angle && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Sub-angle - TSL tab only (statics_logs.sub_angle_detail) */}
                {activeTab === 'tsl-table' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600">Sub-angle</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-sm" size="sm">
                          <span className="truncate text-xs">{selectedTslSubAngle || 'All'}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-0">
                        <Command>
                          <CommandInput placeholder="Search..." className="text-sm" />
                          <CommandList>
                            <CommandEmpty className="text-xs">No sub-angles found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem onSelect={() => { setSelectedTslSubAngle(''); setPage(1); }} className="cursor-pointer text-sm">
                                <span className="truncate">All</span>
                                {selectedTslSubAngle === '' && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                              {tslSubAngleOptions.map(sa => (
                                <CommandItem key={sa} onSelect={() => { setSelectedTslSubAngle(sa); setPage(1); }} className="cursor-pointer text-sm">
                                  <span className="truncate">{sa}</span>
                                  {selectedTslSubAngle === sa && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Platform - all tabs */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Platform</label>
                  <Select value={selectedPlatform || 'all'} onValueChange={(v) => { setSelectedPlatform(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {platformOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Stage - all tabs */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Stage</label>
                  <Select value={selectedStage || 'all'} onValueChange={(v) => { setSelectedStage(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {stageOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status - all tabs (options are distinct live values, not custom_fields) */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Status</label>
                  <Select value={selectedStatus || 'all'} onValueChange={(v) => { setSelectedStatus(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Edit Type - all tabs */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Edit Type</label>
                  <Select value={selectedEditType || 'all'} onValueChange={(v) => { setSelectedEditType(v === 'all' ? '' : (v as 'Self-Edited' | 'Editor-Edited')); setPage(1); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Self-Edited">Self-Edited</SelectItem>
                      <SelectItem value="Editor-Edited">Editor-Edited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Script ID Searchable - VID tab only */}
                {activeTab === 'vid-table' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600">Script ID</label>
                    <Popover open={scriptIdOpen} onOpenChange={(open) => {
                      setScriptIdOpen(open);
                      if (!open) {
                        setScriptIdSearchInput('');
                        setScriptIdSearch('');
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-sm" size="sm">
                          <span className="truncate text-xs">{selectedScriptId || 'All'}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-0">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search..."
                            value={scriptIdSearchInput}
                            onValueChange={setScriptIdSearchInput}
                            className="text-sm"
                          />
                          <CommandList onScroll={handleScriptIdScroll} onWheel={handleScriptIdWheel} className="max-h-52 overflow-y-auto flex flex-col">
                            <CommandEmpty className="text-xs">No scripts found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem onSelect={() => {
                                setSelectedScriptId('');
                                setPage(1);
                                setScriptIdOpen(false);
                              }} className="cursor-pointer text-sm">
                                All
                                {selectedScriptId === '' && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                              {visibleScriptIds.map(id => (
                                <CommandItem key={id} onSelect={() => {
                                  setSelectedScriptId(id);
                                  setPage(1);
                                  setScriptIdOpen(false);
                                }} className="cursor-pointer text-sm">
                                  {id}
                                  {selectedScriptId === id && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            {(hasMoreScriptIds || scriptIdSearchInput !== scriptIdSearch) && (
                              <div className="py-2 text-center text-xs text-muted-foreground border-t">
                                {scriptIdSearchInput !== scriptIdSearch ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Searching...</span>
                                  </div>
                                ) : isScriptIdLoading ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Loading...</span>
                                  </div>
                                ) : (
                                  <span>Scroll for more ({filteredScriptIds.length - scriptIdVisible} remaining)</span>
                                )}
                              </div>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Editor - VID tab only */}
                {activeTab === 'vid-table' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-600">Editor</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-sm" size="sm" disabled={!selectedBrand}>
                          <span className="truncate text-xs">{selectedEditor ? editorOptionsForBrand.find(cs => cs.value === selectedEditor)?.label || selectedEditor : 'All'}</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-0">
                        <Command>
                          <CommandInput placeholder="Search Editor..." className="text-sm" />
                          <CommandList>
                            <CommandEmpty className="text-xs">No editors found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem onSelect={() => { setSelectedEditor(''); setPage(1); }} className="cursor-pointer text-xs">
                                <span className="truncate">All</span>
                                {selectedEditor === '' && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                              {editorOptionsForBrand.map(editor => (
                                <CommandItem key={editor.value} onSelect={() => { setSelectedEditor(editor.value); setPage(1); }} className="cursor-pointer text-xs">
                                  <span className="truncate">{editor.label}</span>
                                  {selectedEditor === editor.value && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {/* Tabs and Content - scrollable area */}
        <div className="flex flex-col space-y-2">
          {/* Ad Type Label */}
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ad Type</label>

          <Tabs value={activeTab} onValueChange={(v) => {
            if (selectedProductId) {
              setIsTabSwitching(true);
              setActiveTab(v as TabKey);
              setPage(1);
              // Clear all Additional Filters when switching tabs
              setLaunchMeta('');
              setLaunchApplovin('');
              setSelectedAdId('');
              setAdIdSearch('');
              setAdIdVisible(10);
              setSelectedCs('');
              setConceptNameSearch('');
              setConceptNameInput('');
              setSelectedBatchWeek('');
              setSelectedFormat('');
              setSelectedAngle('');
              setSelectedTslAngle('');
              setSelectedTslSubAngle('');
              setSelectedPlatform('');
              setSelectedScriptId('');
              setSelectedEditor('');
              setSelectedStage('');
              setSelectedStatus('');
              setTimeout(() => setIsTabSwitching(false), 300);
            }
          }} className="flex flex-col">
            <div className={`flex items-center justify-between border-b border-border flex-shrink-0 ${!selectedProductId ? 'opacity-50 pointer-events-none' : ''}`}>
              <TabsList className="flex gap-2 bg-transparent p-0 h-auto justify-start">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    disabled={!selectedProductId}
                    className={`relative px-4 py-3 rounded-none border-b-2 transition-all gap-2 font-medium ${
                      !selectedProductId
                        ? 'cursor-not-allowed opacity-50 border-b-2 border-transparent'
                        : activeTab === tab
                          ? `border-b-2 ${TAB_CONFIG[tab].borderColor} bg-muted/30`
                          : 'border-b-2 border-transparent hover:bg-muted/20'
                    }`}
                  >
                    {TAB_CONFIG[tab].icon}
                    <span>{TAB_CONFIG[tab].label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

            <div className="flex items-center gap-2">
              {activeTab === 'tsl-table' && (
                <Button
                  variant="outline"
                  onClick={() => setIsIterateDialogOpen(true)}
                  className="gap-2 flex-shrink-0"
                  size="sm"
                >
                  <Repeat2 className="h-4 w-4" />
                  Iterate on TSL Images
                </Button>
              )}
              {activeTab && (
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="gap-2 flex-shrink-0 mr-1"
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  {activeTab === 'vid-table' ? 'Add Video Ad' : activeTab === 'tsl-table' ? 'Add TSL Ad' : 'Add IMG Ad'}
                </Button>
              )}
            </div>
          </div>

          {tabs.map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-6 min-w-0 overflow-x-hidden">
              {!filtersReady ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                  <Filter className="h-10 w-10 opacity-30" />
                  <p className="text-base font-medium">Select Brand, Product, and Ad Type to view ads</p>
                </div>
              ) : (
                <AdsAgGrid
                  colDefs={getColumnsForActiveTab}
                  rowData={displayRows}
                  isLoading={fieldsLoading || rowsLoading || isTabSwitching || tslScriptsLoading || brandsLoading || productsLoading}
                  onCellValueChanged={handleCellValueChanged}
                  page={page}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
              )}
            </TabsContent>
          ))}
          </Tabs>
        </div>
      </div>

      {activeTab && (
        <AddAdDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          tab={activeTab as TabKey}
          fields={getFormFieldsForTab(allFields, activeTab as TabKey)}
          tslScripts={tslScripts}
          defaultBrandId={selectedBrandId}
          defaultProductId={selectedProductId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['ads-data', adTypeMap[activeTabKey], tableNameMap[activeTabKey], selectedBrand?.name, selectedBrand?.brand_code, selectedProduct?.name, selectedProduct?.product_code] });
          }}
          onManageFieldOptions={{
            onAdd: handleAddFieldOption,
            onRemove: handleRemoveFieldOption,
            onRename: handleRenameFieldOption,
          }}
        />
      )}

      {activeTab === 'tsl-table' && (
        <IterateTslImagesDialog
          open={isIterateDialogOpen}
          onOpenChange={setIsIterateDialogOpen}
          adIdOptions={adIdOptions}
          tslScripts={tslScripts}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['ads-data', adTypeMap[activeTabKey], tableNameMap[activeTabKey], selectedBrand?.name, selectedBrand?.brand_code, selectedProduct?.name, selectedProduct?.product_code] });
          }}
        />
      )}
      {(() => {
        const field = manageDialogFieldId ? allFields.find((f) => f.id === manageDialogFieldId) : null;
        if (!field) return null;
        const initialOptions = normalizeDropdownOptions(
          (field.options ?? []) as unknown[],
          !!field.is_option_product_level,
          selectedProduct?.name,
        );
        return (
          <ManageOptionsDialog
            open={manageDialogOpen}
            onClose={() => setManageDialogOpen(false)}
            fieldName={field.name}
            initialOptions={initialOptions}
            onAdd={(label) => handleAddFieldOption(field.id, label)}
            onRemove={(label) => handleRemoveFieldOption(field.id, label)}
            onRename={(oldLabel, newLabel) => handleRenameFieldOption(field.id, oldLabel, newLabel)}
            canEdit={canEdit}
          />
        );
      })()}
      <ManageOptionsDialog
        open={managePointsDialogOpen}
        onClose={() => setManagePointsDialogOpen(false)}
        fieldName="Points"
        initialOptions={pointsOptions}
        onAdd={handleAddPointsOption}
        onRemove={handleRemovePointsOption}
        onRename={handleRenamePointsOption}
        canEdit={canEdit}
      />
    </DashboardLayout>
  );
}
