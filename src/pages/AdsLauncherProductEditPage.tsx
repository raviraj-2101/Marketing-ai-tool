/**
 * Full-page product editor. Replaces the previous Products tab modal so the
 * extensive per-product configuration (destination URLs, creative templates,
 * funnel codes, default copy) can live on a single dedicated route instead
 * of being crammed into a popup.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  Brand,
  CHAR_LIMITS,
  CTA_OPTIONS,
  CreativeTemplate,
  DestinationUrl,
  FUNNELS,
  PLATFORMS,
  Product,
} from "@/features/ads-launcher/lib/api";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrands } from "@/hooks/useBrands";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function ProductEditPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: brands = [], isLoading: brandsLoading } = useBrands();
  const { products = [], isLoading: productsLoading } = useProducts();
  const product = useMemo(() => products.find((p) => p.id === id) ?? null, [products, id]);

  const [form, setForm] = useState<Partial<Product>>(() =>
    isNew
      ? {
          name: "",
          brand_id: brands[0]?.id ?? "",
          default_headline: "",
          default_primary_text: "",
          default_description: "",
          default_call_to_action: "Shop now",
          comparison_code: "",
          onbrand_code: "",
        }
      : product ?? {}
  );
  // Re-sync form when the product loads from the network for the first time
  // (initial state runs before the products query resolves).
  useMemo(() => {
    if (!isNew && product) setForm(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const save = useMutation({
    mutationFn: async (p: Partial<Product>) => {
      if (p.id) {
        const { error } = await supabase
          .from("products")
          .update({
            brand_id: p.brand_id,
            name: p.name,
            onbrand_code: p.onbrand_code,
            comparison_code: p.comparison_code,
            top_5_comparison_image: p.top_5_comparison_image,
            default_headline: p.default_headline,
            default_primary_text: p.default_primary_text,
            default_description: p.default_description,
            default_call_to_action: p.default_call_to_action,
            default_destination_url: p.default_destination_url,
            meta_destination_onbrand: p.meta_destination_onbrand,
            meta_destination_comparison: p.meta_destination_comparison,
            applovin_destination_onbrand: p.applovin_destination_onbrand,
            applovin_destination_comparison: p.applovin_destination_comparison,
          })
          .eq("id", p.id);
        if (error) throw error;
        return { id: p.id };
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({
            brand_id: p.brand_id,
            name: p.name,
            product_code: "",
            onbrand_code: p.onbrand_code,
            comparison_code: p.comparison_code,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Product saved successfully" });
      if (isNew && res?.id) {
        nav(`/ads-launcher/products/${res.id}`, { replace: true });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to save product", description: error.message, variant: "destructive" });
    },
  });

  const [uploadingImg, setUploadingImg] = useState(false);
  const handleTop5Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `top5-comparison/${id && id !== "new" ? id : "new"}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("brand-logos")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("brand-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, top_5_comparison_image: data.publicUrl }));
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImg(false);
      e.target.value = "";
    }
  };

  if (!isNew && products.length > 0 && !product) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="al-card">
          <div className="text-sm text-slate-500">Product not found.</div>
          <Link to="/ads-launcher/products" className="text-sm text-brand-600 hover:underline mt-3 inline-block">
            ← Back to Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/ads-launcher/products" className="text-xs text-brand-600 hover:underline">
        ← Back to Products
      </Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {isNew ? "New Product" : product?.name ?? "Edit Product"}
        </h1>
        <div className="flex items-center gap-2">
          <button className="btn-primary" disabled={save.isPending || !(form.name && form.brand_id) || brandsLoading || productsLoading} onClick={() => save.mutate(form)}>
            {save.isPending ? "Saving…" : isNew ? "Create product" : "Save changes"}
          </button>
        </div>
      </div>

      {(brandsLoading || productsLoading) && (
        <div className="al-card border-blue-200 bg-blue-50 mb-4">
          <div className="flex items-center gap-3 p-4">
            <div className="h-5 w-5 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-blue-700">Loading {brandsLoading && "brands"}{brandsLoading && productsLoading && " and "}{productsLoading && "products"}…</span>
          </div>
        </div>
      )}

      {/* Section 1: identity + naming codes */}
      <section className="al-card mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Identity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Brand" required>
            <Select value={form.brand_id ?? ""} onValueChange={(value) => setForm({ ...form, brand_id: value })}>
              <SelectTrigger className="al-input">
                <SelectValue placeholder="— select —" />
              </SelectTrigger>
              <SelectContent>
                {brands.length === 0 ? (
                  <SelectItem value="__no_match__" disabled>
                    No brands available
                  </SelectItem>
                ) : (
                  brands.map((b: Brand) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Product Name" required>
            <input className="al-input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Onbrand Code">
            <input
              className="al-input font-mono text-xs"
              placeholder="CL_OREG_ONB"
              value={form.onbrand_code ?? ""}
              onChange={(e) => setForm({ ...form, onbrand_code: e.target.value })}
            />
          </Field>
          <Field label="Comparison Code">
            <input
              className="al-input font-mono text-xs"
              placeholder="CL_OREG_COMP"
              value={form.comparison_code ?? ""}
              onChange={(e) => setForm({ ...form, comparison_code: e.target.value })}
            />
          </Field>
          <Field label="Top 5 Comparison Image">
            <div className="space-y-2">
              {form.top_5_comparison_image && (
                <img
                  src={form.top_5_comparison_image}
                  alt="Top 5 comparison"
                  className="h-24 rounded border border-slate-200 object-contain bg-slate-50"
                />
              )}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingImg}
                onChange={handleTop5Upload}
                className="al-input text-xs"
              />
              <input
                className="al-input text-xs"
                placeholder="…or paste an image URL: https://…/top5-comparison.png"
                value={form.top_5_comparison_image ?? ""}
                onChange={(e) => setForm({ ...form, top_5_comparison_image: e.target.value })}
              />
              {uploadingImg && <span className="text-xs text-slate-500">Uploading…</span>}
            </div>
          </Field>
        </div>
      </section>

      {/* Section 2: default copy removed (2026-05-18). Copy now lives ONLY
          on Creative Templates per funnel — the brand-default fields here
          duplicated that surface and confused operators about which one the
          launcher actually consumes. The columns stay on the products row
          for backward compat but the UI no longer exposes them. */}

      {/* Section 3: destination URLs scoped to this product */}
      {!isNew && product && (
        <DestinationUrlsSection productId={product.id} productName={product.name} />
      )}

      {/* Section 4: creative templates scoped to this product */}
      {!isNew && product && (
        <CreativeTemplatesSection productId={product.id} productName={product.name} />
      )}

      {isNew && (
        <div className="al-card border-slate-200 bg-slate-50/40 mb-4">
          <div className="text-xs text-slate-500">Save the product first — then destination URLs and creative templates can be configured below.</div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Destination URLs (inline section)
// ============================================================================

function DestinationUrlsSection({ productId, productName }: { productId: string; productName: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["destinations", productId],
    queryFn: () => api.get<DestinationUrl[]>(`/api/destinations?product_id=${productId}`),
  });
  const [editing, setEditing] = useState<Partial<DestinationUrl> | null>(null);

  const save = useMutation({
    mutationFn: (d: Partial<DestinationUrl>) =>
      d.id ? api.put(`/api/destinations/${d.id}`, d) : api.post("/api/destinations", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["destinations", productId] });
      qc.invalidateQueries({ queryKey: ["destinations-all"] });
      qc.invalidateQueries({ queryKey: ["destinations"] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/destinations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["destinations", productId] });
      qc.invalidateQueries({ queryKey: ["destinations-all"] });
    },
  });

  // Group by funnel
  const grouped = useMemo(() => {
    const out: Record<string, DestinationUrl[]> = {};
    for (const d of destinations) {
      (out[d.funnel] ||= []).push(d);
    }
    return out;
  }, [destinations]);

  return (
    <section className="al-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Destination URLs</h2>
        <button
          className="btn-secondary text-xs"
          onClick={() =>
            setEditing({
              product_id: productId,
              funnel: "",
              platform: "Meta",
              name: "",
              url: "",
              is_default: false,
            })
          }
        >
          + Add URL
        </button>
      </div>
      {isLoading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : destinations.length === 0 ? (
        <div className="text-xs text-slate-500">
          No destination URLs configured yet for {productName}. Add at least one default per funnel + platform so the launcher can auto-resolve on Ad-ID import.
        </div>
      ) : (
        <div className="space-y-3">
          {(FUNNELS as readonly string[]).map((f) => {
            const rows = grouped[f];
            if (!rows || rows.length === 0) return null;
            return (
              <div key={f}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{f}</div>
                <div className="space-y-1.5">
                  {rows.map((d) => (
                    <div key={d.id} className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-brand-200 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                            {d.platform}
                          </span>
                          <span className="font-medium text-sm text-slate-900">{d.name}</span>
                          {d.is_default && (
                            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                              default
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono break-all mt-0.5" title={d.url}>
                          {d.url}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button className="btn-icon hover:!text-brand-600" title="Edit" aria-label={`Edit destination ${d.name}`} onClick={() => setEditing(d)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                          title="Delete"
                          aria-label={`Delete destination ${d.name}`}
                          onClick={async () => {
                            if (await confirmAct({ title: `Delete "${d.name}"?`, tone: "danger", confirmLabel: "Delete" })) del.mutate(d.id);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <DestinationEditor
          // Force remount whenever the operator switches editing target so
          // the local `isDefault` / `name` / `url` state resets to the new
          // row's values. Without this `key`, useState initial values from
          // the previous row leak through and the "Default" checkbox shows
          // stale state, which made the checkbox feel like it wasn't applying.
          key={editing.id ?? "new"}
          form={editing}
          onCancel={() => setEditing(null)}
          onSave={(d) => save.mutate(d)}
          saving={save.isPending}
          error={save.error ? (save.error as Error).message : null}
        />
      )}
    </section>
  );
}

function DestinationEditor({ form, onCancel, onSave, saving, error }: { form: Partial<DestinationUrl>; onCancel: () => void; onSave: (d: Partial<DestinationUrl>) => void; saving: boolean; error?: string | null }) {
  const [name, setName] = useState(form.name ?? "");
  const [url, setUrl] = useState(form.url ?? "");
  const [funnel, setFunnel] = useState<any>(form.funnel ?? "");
  const [platform, setPlatform] = useState<any>(form.platform ?? "Meta");
  const [isDefault, setIsDefault] = useState(form.is_default ?? false);
  // Normalize the URL the operator typed before we let them save. Bare
  // hostnames like "www.c.com" get an https:// prefix so the Create button
  // doesn't silently stay disabled with no explanation. We still require a
  // real host (something.something) to avoid creating destinations that
  // Meta will reject at launch.
  function normalizeUrl(raw: string): string {
    const t = raw.trim();
    if (!t) return "";
    if (/^https?:\/\//i.test(t)) return t;
    return `https://${t}`;
  }
  const normalized = normalizeUrl(url);
  const hasHost = /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(normalized);
  const valid = !!name.trim() && hasHost && !!funnel;
  return (
    // Cycle 129 Round 4 — backdrop no longer dismisses on click. Operator
    // would lose all typed input on accidental outside-click. Cancel button
    // is the only way out now.
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="al-card max-w-xl w-full">
        <h3 className="font-semibold text-slate-900 text-base mb-4">{form.id ? "Edit destination URL" : "New destination URL"}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="al-label">Funnel</label>
              <select className="al-input" value={funnel} onChange={(e) => setFunnel(e.target.value)}>
                <option value="" disabled>— Select funnel —</option>
                {FUNNELS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="al-label">Platform</label>
              <select className="al-input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="al-label">Name</label>
            <input className="al-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cleantra Lymph · Onbrand" autoFocus />
          </div>
          <div>
            <label className="al-label">URL</label>
            <textarea className="al-input font-mono text-xs" rows={4} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…?ad_id={{ad.id}}&adset_id={{adset.id}}&campaign_id={{campaign.id}}" />
            {url.trim() && !hasHost && (
              <div className="text-[11px] text-amber-700 mt-1">
                Needs a host like <span className="font-mono">example.com</span>. {normalized && normalized !== url.trim() ? `Will be saved as ${normalized}` : ""}
              </div>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-slate-300" />
            Default for {platform} · {funnel}
          </label>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 text-rose-900 text-xs px-3 py-2">
            <span className="font-semibold">Save failed:</span> {error}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-200">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!valid || saving}
            onClick={() => onSave({ ...form, name: name.trim(), url: normalized, funnel, platform, is_default: isDefault })}
          >
            {saving ? "Saving…" : form.id ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Creative Templates (inline section) — only for Onbrand / Comparison / Adv
// TSL has no creative templates (per user spec).
// ============================================================================

function CreativeTemplatesSection({ productId, productName }: { productId: string; productName: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["creative-templates", productId],
    queryFn: () => api.get<CreativeTemplate[]>(`/api/creative-templates?product_id=${productId}`),
  });
  const [editing, setEditing] = useState<Partial<CreativeTemplate> | null>(null);

  const save = useMutation({
    mutationFn: (t: Partial<CreativeTemplate>) =>
      t.id ? api.put(`/api/creative-templates/${t.id}`, t) : api.post("/api/creative-templates", t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creative-templates", productId] });
      qc.invalidateQueries({ queryKey: ["creative-templates"] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/creative-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creative-templates", productId] });
      qc.invalidateQueries({ queryKey: ["creative-templates"] });
    },
  });

  // Allowed funnels for templates: TSL is excluded per user spec.
  const TEMPLATE_FUNNELS = FUNNELS.filter((f) => f !== "TSL");
  const grouped = useMemo(() => {
    const out: Record<string, CreativeTemplate[]> = {};
    for (const t of templates) {
      const f = t.funnel ?? "Onbrand";
      (out[f] ||= []).push(t);
    }
    return out;
  }, [templates]);

  return (
    <section className="al-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Creative Templates</h2>
        <button
          className="btn-secondary text-xs"
          onClick={() =>
            setEditing({
              product_id: productId,
              name: "",
              asset_type: "Video",
              funnel: "Onbrand",
              call_to_action: "Shop now",
              primary_text: "",
              headline: "",
              description: "",
              is_default: false,
            })
          }
        >
          + Add template
        </button>
      </div>
      <div className="text-[11px] text-slate-500 mb-3">
        Onbrand · Comparison · Adv. TSL launches don't use creative templates — copy comes per-row.
      </div>
      {isLoading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="text-xs text-slate-500">
          No creative templates yet for {productName}.
        </div>
      ) : (
        <div className="space-y-3">
          {TEMPLATE_FUNNELS.map((f) => {
            const rows = grouped[f];
            if (!rows || rows.length === 0) return null;
            return (
              <div key={f}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{f}</div>
                <div className="space-y-1.5">
                  {rows.map((t) => (
                    <div key={t.id} className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-brand-200 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-slate-900">{t.name}</span>
                          {(t as any).is_default && (
                            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                              default
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                          {t.call_to_action} · {t.headline ?? ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button className="btn-icon hover:!text-brand-600" title="Edit" aria-label={`Edit creative ${t.name}`} onClick={() => setEditing(t)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                          title="Delete"
                          aria-label={`Delete creative ${t.name}`}
                          onClick={async () => {
                            if (await confirmAct({ title: `Delete "${t.name}"?`, tone: "danger", confirmLabel: "Delete" })) del.mutate(t.id);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <CreativeEditor
          // Same fix as DestinationEditor (Cycle 125) — force remount on
          // editing-row switch so local useState initial values don't leak
          // through from the previously-open row.
          key={(editing as any).id ?? "new"}
          form={editing}
          onCancel={() => setEditing(null)}
          onSave={(t) => save.mutate(t)}
          saving={save.isPending}
          error={save.error ? (save.error as Error).message : null}
        />
      )}
    </section>
  );
}

function CreativeEditor({ form, onCancel, onSave, saving, error }: { form: Partial<CreativeTemplate>; onCancel: () => void; onSave: (t: Partial<CreativeTemplate>) => void; saving: boolean; error?: string | null }) {
  const TEMPLATE_FUNNELS = FUNNELS.filter((f) => f !== "TSL");
  const [name, setName] = useState(form.name ?? "");
  const [funnel, setFunnel] = useState<any>(form.funnel ?? "Onbrand");
  const [cta, setCta] = useState(form.call_to_action ?? "Shop now");
  const [headline, setHeadline] = useState(form.headline ?? "");
  const [description, setDescription] = useState(form.description ?? "");
  const [primary, setPrimary] = useState(form.primary_text ?? "");
  const [isDefault, setIsDefault] = useState((form as any).is_default ?? false);
  const valid = name.trim().length > 0;
  return (
    // Cycle 129 Round 4 — backdrop dismissal disabled; only Cancel button
    // closes. Operators were losing typed copy on accidental outside-click.
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="al-card max-w-2xl w-full max-h-[90vh] overflow-auto">
        <h3 className="font-semibold text-slate-900 text-base mb-4">{form.id ? "Edit creative template" : "New creative template"}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="al-label">Funnel</label>
              <select className="al-input" value={funnel} onChange={(e) => setFunnel(e.target.value)}>
                {TEMPLATE_FUNNELS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="al-label">CTA</label>
              <select className="al-input" value={cta ?? "Shop now"} onChange={(e) => setCta(e.target.value)}>
                {CTA_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="al-label">Name</label>
            <input className="al-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brand Funnel — Lymph" autoFocus />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="al-label">Headline</label>
              <input className="al-input" maxLength={CHAR_LIMITS.headline} value={headline ?? ""} onChange={(e) => setHeadline(e.target.value)} />
            </div>
            <div>
              <label className="al-label">Description</label>
              <input className="al-input" maxLength={CHAR_LIMITS.description} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="al-label">Primary Text</label>
            <textarea className="al-input" rows={3} maxLength={CHAR_LIMITS.primary_text} value={primary ?? ""} onChange={(e) => setPrimary(e.target.value)} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-slate-300" />
            Default for {funnel} {" "}
            <span className="text-xs text-slate-400">(auto-selected on Ad-ID import)</span>
          </label>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 text-rose-900 text-xs px-3 py-2">
            <span className="font-semibold">Save failed:</span> {error}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-200">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!valid || saving}
            onClick={() => onSave({ ...form, name: name.trim(), funnel, call_to_action: cta, headline, description, primary_text: primary, is_default: isDefault } as any)}
          >
            {saving ? "Saving…" : form.id ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="al-label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
