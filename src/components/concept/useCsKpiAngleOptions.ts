// useCsKpiAngleOptions — Angle + Sub-angle option source + "Manage" CRUD backed by
// the CS-KPIs config (cs_kpi_angles / cs_kpi_sub_angles) — the SAME source the
// Angle / Sub-angle <SoftSelect> dropdowns in TslMetadataPage read from, so adding
// or removing here shows up in those dropdowns (one source of truth across tools).
//
//   • resolves the product UUID from the slug via /api/ugc/products (image-builder)
//   • lists / adds / deletes Angles      via /api/cs-kpis/angles            (pipeline-node)
//   • lists / adds / deletes Sub-angles  via /api/cs-kpis/sub-angles?…&angleId= (pipeline-node)
//
// The cs-kpis endpoints have only add + delete (no rename), so neither Manage dialog
// offers a rename. Backend enforces requireKpiEditor (Admin/SuperAdmin/Dev); the UI
// additionally gates the buttons on admin (see TslMetadataPage). Mirrors the shape of
// useTargetingOptions.ts.

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, pipelineApiRequest } from "@/lib/queryClient";

interface KpiAngle { id: string; name: string; angle_key?: string }
interface KpiSub { id: string; name: string; sub_angle_key?: string }
type Option = { label: string; value: string };

export function useCsKpiAngleOptions(productSlug: string) {
  const queryClient = useQueryClient();

  // ── product slug → UUID ─────────────────────────────────────────────────────
  // The page only knows the slug ("cleantra-lymphatic"); cs-kpis is keyed by the
  // product UUID. /api/ugc/products maps one to the other (id === slug → product_id).
  const productIdQ = useQuery<string>({
    queryKey: ["cs-kpi-product-uuid", productSlug],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/ugc/products");
      const body = await r.json();
      const list: Array<{ id: string; name?: string; product_id?: string }> =
        Array.isArray(body) ? body : (body.products ?? []);
      return list.find((p) => p.id === productSlug)?.product_id ?? "";
    },
    enabled: !!productSlug,
  });
  const productId = productIdQ.data ?? "";
  const ready = !!productId;

  // ── Angles list ─────────────────────────────────────────────────────────────
  const anglesQ = useQuery<KpiAngle[]>({
    queryKey: ["cs-kpi-angles", productSlug],
    queryFn: async () => {
      const r = await pipelineApiRequest(
        "GET",
        `/api/cs-kpis/angles?productId=${encodeURIComponent(productId)}`,
      );
      const j = await r.json();
      return (j?.data?.angles ?? []) as KpiAngle[];
    },
    enabled: ready,
  });
  const angles = anglesQ.data ?? [];

  // ── Sub-angles list, scoped to the angle picked inside the sub-angle dialog ──
  const [selectedAngleId, setSelectedAngleId] = useState<string>("");
  const subsQ = useQuery<KpiSub[]>({
    queryKey: ["cs-kpi-subs", productSlug, selectedAngleId],
    queryFn: async () => {
      const r = await pipelineApiRequest(
        "GET",
        `/api/cs-kpis/sub-angles?productId=${encodeURIComponent(productId)}&angleId=${encodeURIComponent(selectedAngleId)}`,
      );
      const j = await r.json();
      return (j?.data?.subs ?? []) as KpiSub[];
    },
    enabled: ready && !!selectedAngleId,
  });
  const subs = subsQ.data ?? [];

  // ── Refresh BOTH page dropdowns + the hook's own lists after any mutation ────
  // The page's Angle dropdown reads ["ib-angles", slug] and the Sub-angle dropdown
  // reads ["ib-sub-angle-details", slug] (both off the image-builder, which serves
  // the same CS-KPIs config). useTargetingOptions also keeps a ["/api/options/sub-
  // angles", slug] query — invalidate all of them plus our own cs-kpis lists.
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/options/sub-angles", productSlug] });
    queryClient.invalidateQueries({ queryKey: ["ib-sub-angle-details", productSlug] });
    queryClient.invalidateQueries({ queryKey: ["ib-angles", productSlug] });
    queryClient.invalidateQueries({ queryKey: ["cs-kpi-angles", productSlug] });
    queryClient.invalidateQueries({ queryKey: ["cs-kpi-subs", productSlug] });
  }, [queryClient, productSlug]);

  // ── Angle CRUD ──────────────────────────────────────────────────────────────
  const addAngle = useCallback(async (label: string) => {
    const name = label.trim();
    if (!ready || !name) return;
    await pipelineApiRequest("POST", "/api/cs-kpis/angles", { productId, name, angle_key: name });
    invalidate();
  }, [ready, productId, invalidate]);

  // ManageOptionsDialog hands back the LABEL on remove — map it to the angle id.
  const removeAngle = useCallback(async (label: string) => {
    const hit = angles.find((a) => a.name === label);
    if (!ready || !hit) return;
    await pipelineApiRequest("DELETE", `/api/cs-kpis/angles/${encodeURIComponent(hit.id)}`);
    invalidate();
  }, [ready, angles, invalidate]);

  // ── Sub-angle CRUD (scoped to the selected parent angle) ────────────────────
  const addSub = useCallback(async (label: string) => {
    const name = label.trim();
    if (!ready || !selectedAngleId || !name) return;
    await pipelineApiRequest("POST", "/api/cs-kpis/sub-angles", {
      productId, angleId: selectedAngleId, name, sub_angle: name,
    });
    invalidate();
  }, [ready, productId, selectedAngleId, invalidate]);

  const removeSub = useCallback(async (label: string) => {
    const hit = subs.find((s) => s.name === label);
    if (!ready || !hit) return;
    await pipelineApiRequest("DELETE", `/api/cs-kpis/sub-angles/${encodeURIComponent(hit.id)}`);
    invalidate();
  }, [ready, subs, invalidate]);

  // ── Dialog open state ───────────────────────────────────────────────────────
  const [angleOpen, setAngleOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  const angleOptions = useMemo<Option[]>(
    () => angles.map((a) => ({ label: a.name, value: a.id })),
    [angles],
  );
  const subOptions = useMemo<Option[]>(
    () => subs.map((s) => ({ label: s.name, value: s.id })),
    [subs],
  );
  const parentAngles = useMemo(
    () => angles.map((a) => ({ id: a.id, name: a.name })),
    [angles],
  );

  return {
    // Only "manage-able" once the angles list has actually loaded — otherwise the
    // dialogs would open against an empty list (the reused ManageOptionsDialog
    // captures its options on open and the sub-angle parent picker needs the
    // angles present). Empty result (new product, no angles) still enables.
    canManage: ready && anglesQ.isSuccess,
    angleManage: {
      open: angleOpen,
      fieldName: "Angle",
      options: angleOptions,
      onOpen: () => setAngleOpen(true),
      onClose: () => setAngleOpen(false),
      onAdd: (label: string) => { void addAngle(label); },
      onRemove: (label: string) => { void removeAngle(label); },
    },
    subAngleManage: {
      open: subOpen,
      parentAngles,
      selectedAngleId,
      setSelectedAngleId,
      options: subOptions,
      onOpen: () => setSubOpen(true),
      onClose: () => setSubOpen(false),
      onAdd: (label: string) => { void addSub(label); },
      onRemove: (label: string) => { void removeSub(label); },
    },
  };
}
