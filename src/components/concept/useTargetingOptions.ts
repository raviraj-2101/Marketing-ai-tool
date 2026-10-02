// useTargetingOptions — shared Persona / Sub-angle / Main-pains option source +
// "Manage options" mutations, reading and writing the SAME custom_fields rows
// the AI UGC builder uses (CUSTOM_FIELD_IDS). This is what makes the TSL Concept
// form and the UGC concept step consistent end-to-end:
//   • reads product-scoped option labels from /api/options/* (image-builder server)
//   • mutates options via PUT /custom-fields/update (pipeline-node server)
// Both ultimately hit the one custom_fields table, so a value added in either
// tool shows up in the other. Mirrors src/pages/BatchCreator.tsx's logic.

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, pipelineApiRequest } from "@/lib/queryClient";
import { CUSTOM_FIELD_IDS, type TargetingFieldKey } from "@/lib/customFieldIds";

const OPTION_PATH: Record<TargetingFieldKey, string> = {
  persona: "/api/options/personas",
  sub_angle: "/api/options/sub-angles",
  pains: "/api/options/pains",
};
const FIELD_LABEL: Record<TargetingFieldKey, string> = {
  persona: "Persona",
  sub_angle: "Sub-angle",
  pains: "Main pains",
};

interface RawField {
  id: string;
  options: unknown[];
  is_option_product_level?: boolean;
}
type ProductOption = { label: string; product: string[] };

// productName is the human product name (e.g. "Lymphatic") that option.product[]
// is scoped by on writes; the /api/options/* read endpoints take the slug.
export function useTargetingOptions(productSlug: string, productName: string) {
  const queryClient = useQueryClient();
  const enabled = !!productSlug;

  const fetchOptions = (key: TargetingFieldKey) => async () =>
    (await apiRequest("GET", `${OPTION_PATH[key]}?product=${encodeURIComponent(productSlug)}`)).json();

  const personaQ = useQuery<string[]>({ queryKey: [OPTION_PATH.persona, productSlug], queryFn: fetchOptions("persona"), enabled });
  const subAngleQ = useQuery<string[]>({ queryKey: [OPTION_PATH.sub_angle, productSlug], queryFn: fetchOptions("sub_angle"), enabled });
  const painsQ = useQuery<string[]>({ queryKey: [OPTION_PATH.pains, productSlug], queryFn: fetchOptions("pains"), enabled });

  // Raw custom_fields rows (the full options arrays) needed to mutate correctly.
  const rawQ = useQuery<Record<TargetingFieldKey, RawField | null>>({
    queryKey: ["tsl-targeting-raw-fields"],
    queryFn: async () => {
      const keys = Object.keys(CUSTOM_FIELD_IDS) as TargetingFieldKey[];
      const entries = await Promise.all(
        keys.map(async (k) => {
          try {
            const r = await pipelineApiRequest("GET", `/custom-fields/get?id=${CUSTOM_FIELD_IDS[k]}`);
            const j = await r.json();
            const field = Array.isArray(j?.data) ? j.data[0] : (j?.data ?? null);
            return [k, (field as RawField) ?? null] as const;
          } catch {
            return [k, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<TargetingFieldKey, RawField | null>;
    },
  });

  const customFieldsUpdate = useCallback(async (fieldId: string, options: unknown[]) => {
    try {
      await pipelineApiRequest("PUT", "/custom-fields/update", { id: fieldId, options });
      return true;
    } catch {
      return false;
    }
  }, []);

  const invalidate = useCallback(
    (key: TargetingFieldKey) => {
      queryClient.invalidateQueries({ queryKey: [OPTION_PATH[key], productSlug] });
      queryClient.invalidateQueries({ queryKey: ["tsl-targeting-raw-fields"] });
    },
    [queryClient, productSlug],
  );

  const addOption = useCallback(
    async (key: TargetingFieldKey, label: string) => {
      const field = rawQ.data?.[key];
      if (!field) return;
      const trimmed = label.trim();
      if (!trimmed) return;
      let updated: unknown[];
      if (field.is_option_product_level && productName) {
        const current = (field.options as ProductOption[]) ?? [];
        const existing = current.find((o) => o.label === trimmed);
        updated = existing
          ? current.map((o) => (o.label === trimmed ? { ...o, product: Array.from(new Set([...o.product, productName])) } : o))
          : [...current, { label: trimmed, product: [productName] }];
      } else {
        const current = (field.options as string[]) ?? [];
        if (current.includes(trimmed)) return;
        updated = [...current, trimmed];
      }
      if (await customFieldsUpdate(field.id, updated)) invalidate(key);
    },
    [rawQ.data, productName, customFieldsUpdate, invalidate],
  );

  const renameOption = useCallback(
    async (key: TargetingFieldKey, oldLabel: string, newLabel: string) => {
      const field = rawQ.data?.[key];
      if (!field) return;
      const trimmed = newLabel.trim();
      if (!trimmed || trimmed === oldLabel) return;
      let updated: unknown[];
      if (field.is_option_product_level) {
        const current = (field.options as ProductOption[]) ?? [];
        updated = current.map((o) => (o.label === oldLabel ? { ...o, label: trimmed } : o));
      } else {
        const current = (field.options as string[]) ?? [];
        updated = current.map((o) => (o === oldLabel ? trimmed : o));
      }
      if (await customFieldsUpdate(field.id, updated)) invalidate(key);
    },
    [rawQ.data, customFieldsUpdate, invalidate],
  );

  const removeOption = useCallback(
    async (key: TargetingFieldKey, label: string) => {
      const field = rawQ.data?.[key];
      if (!field) return;
      let updated: unknown[];
      if (field.is_option_product_level && productName) {
        const current = (field.options as ProductOption[]) ?? [];
        updated = current
          .map((o) => (o.label === label ? { ...o, product: o.product.filter((p) => p !== productName) } : o))
          .filter((o) => o.product.length > 0);
      } else {
        const current = (field.options as string[]) ?? [];
        updated = current.filter((o) => o !== label);
      }
      if (await customFieldsUpdate(field.id, updated)) invalidate(key);
    },
    [rawQ.data, productName, customFieldsUpdate, invalidate],
  );

  // Manage dialog state (one dialog, parameterised by the open field).
  const [manageKey, setManageKey] = useState<TargetingFieldKey | null>(null);
  const openManage = useCallback((key: TargetingFieldKey) => setManageKey(key), []);
  const closeManage = useCallback(() => setManageKey(null), []);

  const manageInitialOptions = useMemo(() => {
    if (!manageKey) return [] as Array<{ label: string; value: string }>;
    const field = rawQ.data?.[manageKey];
    if (!field) return [];
    if (field.is_option_product_level && productName) {
      const rows = (field.options as ProductOption[]) ?? [];
      return rows.filter((o) => o.product?.includes(productName)).map((o) => ({ label: o.label, value: o.label }));
    }
    const flat = (field.options as string[]) ?? [];
    return flat.map((s) => ({ label: s, value: s }));
  }, [manageKey, rawQ.data, productName]);

  return {
    personaOptions: personaQ.data ?? [],
    subAngleOptions: subAngleQ.data ?? [],
    painsOptions: painsQ.data ?? [],
    canManage: enabled && !!rawQ.data,
    openManage,
    manage: {
      open: manageKey !== null,
      fieldName: manageKey ? FIELD_LABEL[manageKey] : "",
      initialOptions: manageInitialOptions,
      onClose: closeManage,
      onAdd: (label: string) => { if (manageKey) void addOption(manageKey, label); },
      onRemove: (label: string) => { if (manageKey) void removeOption(manageKey, label); },
      onRename: (oldLabel: string, newLabel: string) => { if (manageKey) void renameOption(manageKey, oldLabel, newLabel); },
    },
  };
}
