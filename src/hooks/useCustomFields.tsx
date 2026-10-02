import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const PIPELINE_API_BASE_URL = import.meta.env.VITE_PIPELINE_API_BASE_URL as string;

export const FIELD_TYPES = ['text', 'number', 'dropdown', 'dropdown_text', 'user', 'date'] as const;
export type FieldType = typeof FIELD_TYPES[number];

export const CONTAINS_OPTIONS = [
  { parent: 'vid-form', child: 'vid-table' },
  { parent: 'tsl-form', child: 'tsl-table' },
  { parent: 'img-form', child: 'img-table' },
] as const;
export type ContainsValue = 'vid-form' | 'vid-table' | 'tsl-form' | 'tsl-table' | 'img-form' | 'img-table';

export interface StringOption {
  type: 'string';
  value: string;
}

export interface ObjectOption {
  label: string;
  value: string;
}

export interface ProductOption {
  label: string;
  product: string[];
}

export function isProductOptions(options: unknown[] | null | undefined): options is ProductOption[] {
  return Array.isArray(options) && options.length > 0 && typeof options[0] === 'object' && options[0] !== null && 'product' in (options[0] as object);
}

export interface CustomField {
  id: string;
  name: string;
  type: FieldType;
  options: string[] | ObjectOption[] | ProductOption[] | null;
  is_add_in_clickup: boolean;
  is_update_in_cron: boolean;
  clickup_id: string | null;
  ads_col_name: string | null;
  static_log_col_name: string | null;
  contains: ContainsValue[] | null;
  order: number | null;
  is_show_as_link: boolean | null;
  is_editable_fields: boolean | null;
  is_multi_select: boolean;
  is_option_product_level: boolean;
  created_at: string;
}

export interface CustomFieldCreatePayload {
  name: string;
  type: FieldType;
  options: string[] | ObjectOption[] | ProductOption[] | null;
  is_add_in_clickup: boolean;
  is_update_in_cron: boolean;
  clickup_id?: string | null;
  ads_col_name?: string | null;
  static_log_col_name?: string | null;
  contains?: ContainsValue[] | null;
  order?: number | null;
  is_show_as_link?: boolean;
  is_editable_fields?: boolean;
  is_multi_select?: boolean;
  is_option_product_level?: boolean;
}

export interface CustomFieldUpdatePayload {
  id: string;
  name?: string;
  type?: FieldType;
  options?: string[] | ObjectOption[] | ProductOption[] | null;
  is_add_in_clickup?: boolean;
  is_update_in_cron?: boolean;
  clickup_id?: string | null;
  ads_col_name?: string | null;
  static_log_col_name?: string | null;
  contains?: ContainsValue[] | null;
  order?: number | null;
  is_show_as_link?: boolean;
  is_editable_fields?: boolean;
  is_multi_select?: boolean;
  is_option_product_level?: boolean;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${PIPELINE_API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json;
}

export const useCustomFields = () =>
  useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      const json = await apiFetch('/custom-fields/get');
      return json.data as CustomField[];
    },
  });

export const useFilteredCustomFields = (isDev: boolean, enabled = true) =>
  useQuery({
    queryKey: ['custom-fields', isDev ? 'all' : 'filtered'],
    enabled,
    queryFn: async () => {
      const json = await apiFetch('/custom-fields/get');
      const all = json.data as CustomField[];
      if (isDev) return all;
      return all.filter(f => !f.is_add_in_clickup && (f.type === 'dropdown' || f.type === 'dropdown_text'));
    },
  });

export const useCreateCustomField = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomFieldCreatePayload) =>
      apiFetch('/custom-fields/create', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Custom field created');
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to create custom field');
    },
  });
};

export const useUpdateCustomField = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomFieldUpdatePayload) =>
      apiFetch('/custom-fields/update', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Custom field updated');
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to update custom field');
    },
  });
};
