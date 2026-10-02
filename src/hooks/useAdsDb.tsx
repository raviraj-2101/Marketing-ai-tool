import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TabKey = 'img-table' | 'tsl-table' | 'vid-table';

export interface AdsField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'dropdown' | 'user' | 'date';
  options: string[] | { label: string; value: string }[] | { label: string; product: string[] }[] | null;
  ads_col_name: string | null;
  static_log_col_name: string | null;
  contains: string[] | null;
  is_add_in_clickup?: boolean;
  is_show_as_link?: boolean;
  is_editable_fields?: boolean;
  is_multi_select?: boolean;
  is_option_product_level?: boolean;
  width?: number;
  order?: number;
}

export const useAdsDbFields = () =>
  useQuery({
    queryKey: ['ads-db-fields'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_fields')
        .select('id, name, type, options, ads_col_name, static_log_col_name, contains, is_add_in_clickup, is_show_as_link, is_editable_fields, is_multi_select, is_option_product_level, width, order')
        .order('order', { ascending: true });

      if (error) throw new Error(error.message);
      return (data || []).map((row) => ({
        id: row.id,
        name: row.name || '',
        type: (row.type || 'text') as AdsField['type'],
        options: row.options as AdsField['options'],
        ads_col_name: row.ads_col_name,
        static_log_col_name: row.static_log_col_name,
        contains: (row.contains as string[] | null) || [],
        is_add_in_clickup: row.is_add_in_clickup === true,
        is_show_as_link: row.is_show_as_link || false,
        is_editable_fields: row.is_editable_fields !== false,
        is_multi_select: row.is_multi_select === true,
        is_option_product_level: row.is_option_product_level === true,
        width: row.width || 120,
        order: row.order || 0,
      })) as AdsField[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export interface AdsDataFilters {
  adId?: string | number;
  cs?: string;
  conceptName?: string;
  batchWeek?: string;
  formatCol?: string;
  formatVal?: string;
  angleCol?: string;
  angleVal?: string;
  subAngleCol?: string;
  subAngleVal?: string;
  launchMeta?: 'Yes' | 'No';
  launchApplovin?: 'Yes' | 'No';
  platformCol?: string;
  platformVal?: string;
  scriptId?: number;
  editor?: string;
  stageCol?: string;
  stageVal?: string;
  statusCol?: string;
  statusVals?: string[];
  editType?: 'Self-Edited' | 'Editor-Edited';
}

export const useAdsAdIds = (
  adType?: string,
  tableName: 'ads' | 'statics_logs' = 'ads',
  brandName?: string,
  brandCode?: string,
  productName?: string,
  productCode?: string,
) =>
  useQuery({
    queryKey: ['ads-ad-ids', adType, tableName, brandName, brandCode, productName, productCode],
    queryFn: async () => {
      const selectCols = tableName === 'statics_logs'
        ? 'ad_id, image_generation_drive_link'
        : 'ad_id';

      let query = supabase
        .from(tableName as any)
        .select(selectCols)
        .order('ad_id', { ascending: true });

      if (adType) query = query.eq('ad_type', adType);

      if (brandName || brandCode) {
        if (tableName === 'statics_logs') {
          if (brandName && brandCode) {
            query = query.or(`brand_name.eq.${brandName},brand_name.eq.${brandCode}`);
          } else if (brandName) {
            query = query.eq('brand_name', brandName);
          } else if (brandCode) {
            query = query.eq('brand_name', brandCode);
          }
        } else {
          if (brandName && brandCode) {
            query = query.or(`brand.eq.${brandName},brand.eq.${brandCode}`);
          } else if (brandName) {
            query = query.eq('brand', brandName);
          } else if (brandCode) {
            query = query.eq('brand', brandCode);
          }
        }
      }

      if (productName || productCode) {
        if (tableName === 'statics_logs') {
          if (productName && productCode) {
            query = query.or(`product_name.eq.${productName},product_name.eq.${productCode}`);
          } else if (productName) {
            query = query.eq('product_name', productName);
          } else if (productCode) {
            query = query.eq('product_name', productCode);
          }
        } else {
          if (productName && productCode) {
            query = query.or(`product.eq.${productName},product.eq.${productCode}`);
          } else if (productName) {
            query = query.eq('product', productName);
          } else if (productCode) {
            query = query.eq('product', productCode);
          }
        }
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []) as Array<{ ad_id: number | string; image_generation_drive_link?: string | null }>;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!adType && (!!brandName || !!brandCode) && (!!productName || !!productCode),
  });

// Distinct status values actually present in the data (dynamic dropdown source).
// Modeled on useAdsAdIds: same ad_type/brand/product scoping, but selects the
// status column, drops nulls, and returns a sorted distinct { label, value } list
// where label === value === the raw status string (the filter does an exact .eq).
export const useAdsStatusDistinct = (
  adType?: string,
  tableName: 'ads' | 'statics_logs' = 'ads',
  brandName?: string,
  brandCode?: string,
  productName?: string,
  productCode?: string,
  statusCol?: string,
  enabled: boolean = true,
) =>
  useQuery({
    queryKey: ['ads-status-distinct', adType, tableName, brandName, brandCode, productName, productCode, statusCol],
    queryFn: async () => {
      let query = supabase
        .from(tableName as any)
        .select(statusCol as string)
        .not(statusCol as string, 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (adType) query = query.eq('ad_type', adType);

      if (brandName || brandCode) {
        if (tableName === 'statics_logs') {
          if (brandName && brandCode) {
            query = query.or(`brand_name.eq.${brandName},brand_name.eq.${brandCode}`);
          } else if (brandName) {
            query = query.eq('brand_name', brandName);
          } else if (brandCode) {
            query = query.eq('brand_name', brandCode);
          }
        } else {
          if (brandName && brandCode) {
            query = query.or(`brand.eq.${brandName},brand.eq.${brandCode}`);
          } else if (brandName) {
            query = query.eq('brand', brandName);
          } else if (brandCode) {
            query = query.eq('brand', brandCode);
          }
        }
      }

      if (productName || productCode) {
        if (tableName === 'statics_logs') {
          if (productName && productCode) {
            query = query.or(`product_name.eq.${productName},product_name.eq.${productCode}`);
          } else if (productName) {
            query = query.eq('product_name', productName);
          } else if (productCode) {
            query = query.eq('product_name', productCode);
          }
        } else {
          if (productName && productCode) {
            query = query.or(`product.eq.${productName},product.eq.${productCode}`);
          } else if (productName) {
            query = query.eq('product', productName);
          } else if (productCode) {
            query = query.eq('product', productCode);
          }
        }
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Group raw distinct values by a normalized key (lowercase, spaces ignored) so
      // inconsistently-stored duplicates like "to do" / "todo" collapse into ONE option
      // that filters BOTH raw spellings. value = normalized key; label = the most common
      // (then most-readable) raw spelling; variants = every raw spelling in the group.
      const groups = new Map<string, { variants: string[]; count: Record<string, number> }>();
      (data || []).forEach((row: any) => {
        const raw = statusCol ? row?.[statusCol] : undefined;
        const v = raw == null ? '' : String(raw).trim();
        if (!v) return;
        const key = v.toLowerCase().replace(/\s+/g, '');
        let g = groups.get(key);
        if (!g) { g = { variants: [], count: {} }; groups.set(key, g); }
        if (g.count[v] === undefined) { g.count[v] = 0; g.variants.push(v); }
        g.count[v]++;
      });
      const options = Array.from(groups.entries()).map(([key, g]) => {
        const label = g.variants.slice().sort((a, b) =>
          (g.count[b] - g.count[a]) ||
          ((b.includes(' ') ? 1 : 0) - (a.includes(' ') ? 1 : 0)) ||
          a.localeCompare(b)
        )[0];
        return { label, value: key, variants: g.variants };
      });
      options.sort((a, b) => a.label.localeCompare(b.label));
      return options;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && !!tableName && !!statusCol && (!!brandName || !!brandCode) && (!!productName || !!productCode),
  });

export const useAdsData = (
  fields: AdsField[],
  adType?: string,
  tableName: 'ads' | 'statics_logs' = 'ads',
  brandName?: string,
  brandCode?: string,
  productName?: string,
  productCode?: string,
  filters: AdsDataFilters = {},
  page: number = 1,
  pageSize: number = 25,
) =>
  useQuery({
    queryKey: ['ads-data', adType, tableName, brandName, brandCode, productName, productCode, filters, page, pageSize],
    queryFn: async () => {
      const colSet = new Set(['id', 'ad_id']);
      const colNameKey = tableName === 'statics_logs' ? 'static_log_col_name' : 'ads_col_name';
      fields.forEach((f) => f[colNameKey as keyof AdsField] && colSet.add(f[colNameKey as keyof AdsField] as string));

      // Always include tsl_script_id for statics_logs table
      if (tableName === 'statics_logs') {
        colSet.add('tsl_script_id');
        colSet.add('creation_method');
        colSet.add('brand_name');
        colSet.add('product_name');
        colSet.add('week');
        colSet.add('intended_chanel');
        colSet.add('launch_date_meta');
        colSet.add('launch_date_applovin');
        colSet.add('image_generation_drive_link');
        // Angle (sub_angle) + Sub-angle (sub_angle_detail) for the TSL tab.
        colSet.add('sub_angle');
        colSet.add('sub_angle_detail');
      }

      // Always include brand and product columns for filtering on ads table
      if (tableName === 'ads') {
        colSet.add('brand');
        colSet.add('product');
        colSet.add('intended_platform');
        colSet.add('launch_date_meta');
        colSet.add('launch_date_applovin');
        colSet.add('cs');
        colSet.add('concept_name');
        colSet.add('batch_week');
      }

      // Edit Type is shown + filterable on both tabs (column exists on ads and
      // statics_logs); ensure it is always selected even if not yet mapped via custom_fields.
      colSet.add('edit_type');

      const selectStr = [...colSet].join(', ');

      let query = supabase
        .from(tableName as any)
        .select(selectStr, { count: 'exact' })
        .order('created_at', { ascending: false });

      // Both tables filter by ad_type column (values: VID, TSL, IMG)
      if (adType) {
        query = query.eq('ad_type', adType);
      }

      // Filter by brand name or code based on table type
      if (brandName || brandCode) {
        if (tableName === 'statics_logs') {
          if (brandName && brandCode) {
            query = query.or(`brand_name.eq.${brandName},brand_name.eq.${brandCode}`);
          } else if (brandName) {
            query = query.eq('brand_name', brandName);
          } else if (brandCode) {
            query = query.eq('brand_name', brandCode);
          }
        } else {
          if (brandName && brandCode) {
            query = query.or(`brand.eq.${brandName},brand.eq.${brandCode}`);
          } else if (brandName) {
            query = query.eq('brand', brandName);
          } else if (brandCode) {
            query = query.eq('brand', brandCode);
          }
        }
      }

      // Filter by product name or code based on table type
      if (productName || productCode) {
        if (tableName === 'statics_logs') {
          if (productName && productCode) {
            query = query.or(`product_name.eq.${productName},product_name.eq.${productCode}`);
          } else if (productName) {
            query = query.eq('product_name', productName);
          } else if (productCode) {
            query = query.eq('product_name', productCode);
          }
        } else {
          if (productName && productCode) {
            query = query.or(`product.eq.${productName},product.eq.${productCode}`);
          } else if (productName) {
            query = query.eq('product', productName);
          } else if (productCode) {
            query = query.eq('product', productCode);
          }
        }
      }

      // Server-side optional filters
      const { adId, cs, conceptName, batchWeek, formatCol, formatVal, angleCol, angleVal, subAngleCol, subAngleVal, launchMeta, launchApplovin, platformCol, platformVal, scriptId, editor, stageCol, stageVal, statusCol, statusVals, editType } = filters;

      if (adId) query = query.eq('ad_id', adId);
      if (cs) query = query.ilike('cs', cs);
      if (conceptName) query = query.ilike('concept_name', `%${conceptName}%`);
      if (batchWeek) {
        const weekCol = tableName === 'statics_logs' ? 'week' : 'batch_week';
        query = query.eq(weekCol, batchWeek);
      }
      if (formatCol && formatVal) query = query.eq(formatCol, formatVal);
      if (angleCol && angleVal) {
        const escapedVal = angleVal.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.or(
          `${angleCol}.eq."${angleVal}",` +
          `${angleCol}.ilike."${escapedVal},%",` +
          `${angleCol}.ilike."%,${escapedVal},%",` +
          `${angleCol}.ilike."%,${escapedVal}"`
        );
      }
      if (subAngleCol && subAngleVal) {
        const escapedVal = subAngleVal.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.or(
          `${subAngleCol}.eq."${subAngleVal}",` +
          `${subAngleCol}.ilike."${escapedVal},%",` +
          `${subAngleCol}.ilike."%,${escapedVal},%",` +
          `${subAngleCol}.ilike."%,${escapedVal}"`
        );
      }
      if (platformCol && platformVal) query = query.eq(platformCol, platformVal);
      if (stageCol && stageVal) query = query.eq(stageCol, stageVal);
      if (statusCol && statusVals && statusVals.length) query = query.in(statusCol, statusVals);
      if (scriptId) query = query.eq('script_id', scriptId);
      if (editor) query = query.ilike('editor', editor);
      if (editType) query = query.eq('edit_type', editType);

      // Launch Meta: filter by platform + launch_date_meta
      if (launchMeta) {
        const platformCol = tableName === 'statics_logs' ? 'intended_chanel' : 'intended_platform';
        query = query.or(`${platformCol}.eq.Meta,${platformCol}.eq.Both`);
        if (launchMeta === 'Yes') {
          query = query.not('launch_date_meta', 'is', null);
        } else if (launchMeta === 'No') {
          query = query.is('launch_date_meta', null);
        }
      }

      // Launch Applovin: filter by platform + launch_date_applovin
      if (launchApplovin) {
        const platformCol = tableName === 'statics_logs' ? 'intended_chanel' : 'intended_platform';
        const platformFilter = `${platformCol}.eq.Applovin,${platformCol}.eq.Both`;

        if (launchApplovin === 'Yes') {
          query = query.or(`${platformFilter}`).not('launch_date_applovin', 'is', null);
        } else if (launchApplovin === 'No') {
          query = query.or(`${platformFilter}`).is('launch_date_applovin', null);
        }
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      return {
        rows: (data || []) as Record<string, unknown>[],
        totalCount: count ?? 0,
      };
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!adType && fields.length > 0 && (!!brandName || !!brandCode) && (!!productName || !!productCode),
  });

export const getColumnsForTab = (fields: AdsField[], tab: TabKey): AdsField[] =>
  fields.filter((f) => {
    if (!f.contains || !Array.isArray(f.contains)) return false;
    // Convert contains array to strings in case they're mixed types
    return f.contains.some((item) => String(item) === tab);
  });

const FORM_CONTAINER_MAP: Record<TabKey, string> = {
  'vid-table': 'vid-form',
  'tsl-table': 'tsl-form',
  'img-table': 'img-form',
};

export const getFormFieldsForTab = (fields: AdsField[], tab: TabKey): AdsField[] => {
  const BULK_FIELDS = ['root cause', 'funnel', 'cta', 'persona', 'angle','awareness lvl'];
  return fields.filter((f) => {
    if (!f.contains || !Array.isArray(f.contains)) return false;
    const hasForm = f.contains.some((item) => String(item) === FORM_CONTAINER_MAP[tab]);
    
    // Explicitly include bulk fields for vid-form if they belong to vid-table
    if (tab === 'vid-table' && !hasForm) {
      const nameLower = f.name.toLowerCase().trim();
      const isBulkField = BULK_FIELDS.some(bf => nameLower === bf);
      if (isBulkField && f.contains.some((item) => String(item) === 'vid-table')) {
        return true;
      }
    }
    
    return hasForm;
  });
};

export interface TslScript {
  id: string;
  tsl_script_id: string;
  gdoc_link?: string | null;
  gfolder_link?: string | null;
  core_id?: string | null;
  variation?: string | null;
  brand_code?: string | null;
  product_code?: string | null;
  created_date?: string | null;
  angle?: string | null;
  summary?: string | null;
  cs?: string | null;
  language?: string | null;
  variation_update?: string | null;
}

export const useTslScripts = (brandCodes?: string[], enabled: boolean = true) =>
  useQuery({
    queryKey: ['tsl-scripts', brandCodes ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('tsl_scripts')
        .select('id, tsl_script_id, gdoc_link, gfolder_link, core_id, variation, brand_code, product_code, created_date, angle, summary, cs, language, variation_update')
        .order('created_at', { ascending: false });

      if (brandCodes && brandCodes.length > 0) {
        query = query.in('brand_code', brandCodes);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);
      const nn = (v: string | null) => (!v || v === 'NULL') ? null : v;
      return (data || []).map((row) => ({
        id: row.id,
        tsl_script_id: row.tsl_script_id || '',
        gdoc_link: nn(row.gdoc_link),
        gfolder_link: nn(row.gfolder_link),
        core_id: nn(row.core_id),
        variation: nn(row.variation),
        brand_code: nn(row.brand_code),
        product_code: nn(row.product_code),
        created_date: nn(row.created_date),
        angle: nn(row.angle),
        summary: nn(row.summary),
        cs: nn(row.cs),
        language: nn(row.language),
        variation_update: nn(row.variation_update),
      })) as TslScript[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled,
  });

export interface VideoScript {
  id: string;
  script_id: string;
}

export const useVideoScripts = (productCode?: string, productName?: string) =>
  useQuery({
    queryKey: ['video-scripts', productCode, productName],
    queryFn: async () => {
      let query = supabase
        .from('scripts')
        .select('id, script_id, product', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filter by product code or name if provided
      if (productCode || productName) {
        if (productCode && productName) {
          query = query.or(`product.eq.${productCode},product.eq.${productName}`);
        } else if (productCode) {
          query = query.eq('product', productCode);
        } else if (productName) {
          query = query.eq('product', productName);
        }
      }

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);
      console.log('[useVideoScripts] Fetched scripts:', { count, dataLength: data?.length, productCode, productName });
      return (data || []).map((row) => ({
        id: row.id,
        script_id: row.script_id || '',
        product: row.product || '',
      })) as (VideoScript & { product: string })[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: true, // Always enable to fetch all scripts or filtered scripts
  });
