import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, CHAR_LIMITS, CTA_OPTIONS, Product } from "@/features/ads-launcher/lib/api";
import { useBrands } from "@/hooks/useBrands";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ListSkeleton, Plus } from "@/features/ads-launcher/components/ListShells";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute } from "@/lib/routeAccess";

type Form = Partial<Product>;

const emptyForm: Form = {
  name: "",
  brand_id: "",
  default_headline: "",
  default_primary_text: "",
  default_description: "",
  default_call_to_action: "Shop now",
  default_destination_url: "",
  comparison_code: "",
  onbrand_code: "",
  meta_destination_onbrand: "",
  meta_destination_comparison: "",
  applovin_destination_onbrand: "",
  applovin_destination_comparison: "",
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirmAct = useConfirm();
  const { user } = useAuth();
  // Only surface "Add Product" to users who have the product module granted.
  // expandAliases:false → the brands-products hub does NOT imply "can add";
  // custom users need the product module explicitly (so Add is effectively
  // Admin/Super Admin/Dev only, while custom users can still browse).
  const canAddProduct = canAccessRoute(user, "/ads-launcher/products", { expandAliases: false });
  // Cycle 461 — show trash toggle for soft-deleted products.
  const [showTrash, setShowTrash] = useState(false);
  const { products = [], isLoading: productsLoading } = useProducts();
  const filteredProducts = showTrash
    ? products.filter((p: any) => p.deleted_at)
    : products.filter((p: any) => !p.deleted_at);

  // Fetch destinations for all products
  const { data: destinationsData = [] } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => api.get<any[]>("/api/destinations"),
  });
  const destinations = Array.isArray(destinationsData) ? destinationsData : destinationsData?.data ?? [];

  // Map destinations by product_id for quick lookup
  const destinationsByProductId = destinations.reduce((acc: Record<string, any[]>, d: any) => {
    if (!acc[d.product_id]) acc[d.product_id] = [];
    acc[d.product_id].push(d);
    return acc;
  }, {});

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Product restored successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to restore product", description: error.message, variant: "destructive" });
    },
  });
  const { data: brands = [] } = useBrands();

  const [editing, setEditing] = useState<Form | null>(null);

  const save = useMutation({
    mutationFn: async (p: Form) => {
      if (p.id) {
        const { error } = await supabase
          .from("products")
          .update({
            name: p.name,
            default_destination_url: p.default_destination_url,
          })
          .eq("id", p.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
      toast({ title: "Product updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update product", description: error.message, variant: "destructive" });
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Product moved to trash" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete product", description: error.message, variant: "destructive" });
    },
  });

  // Group products by brand
  const grouped = filteredProducts.reduce<Record<string, any[]>>((acc, p: any) => {
    const key = p.brands?.name ?? "Unbranded";
    (acc[key] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrash}
              onChange={(e) => setShowTrash(e.target.checked)}
            />
            Show trash
          </label>
          {canAddProduct && (
            <button
              className="btn-primary"
              disabled={brands.length === 0}
              onClick={() => nav("/ads-launcher/products/new")}
            >
              + Add Product
            </button>
          )}
        </div>
      </div>

      {brands.length === 0 && (
        <div className="al-card border-amber-200 bg-amber-50 mb-4">
          <EmptyState
            title="Brands come first"
            description="Products belong to a brand. Add a brand before you can add a product."
            cta={{ label: "Go to Brands →", to: "/ads-launcher/brands" }}
          />
        </div>
      )}

      {brands.length > 0 && productsLoading && (
        <div className="al-card">
          <ListSkeleton rows={4} />
        </div>
      )}

      {brands.length > 0 && !productsLoading && filteredProducts.length === 0 && (
        <div className="al-card">
          <EmptyState
            icon={<Plus />}
            title="Add your first product"
            description="Products carry the funnel codes (e.g. CL_OREG_ONB) and destination URLs used at launch time."
            cta={{ label: "+ Add product", onClick: () => nav("/ads-launcher/products/new") }}
          />
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([brand, list]) => (
          <div key={brand} className="al-card">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">{brand}</div>
            <div className="divide-y">
              {list.map((p) => (
                <div key={p.id} className={`py-3 flex items-start justify-between gap-4 ${(p as any).deleted_at ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {/* Cycle 466 — inline product name edit. Double-
                          click swaps to input; Enter/blur saves. */}
                      <InlineProductName product={p} onSave={(name) => save.mutate({ ...p, name })} />
                      {(p as any).deleted_at && (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          trashed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      {p.onbrand_code && `ONB: ${p.onbrand_code}`}
                      {p.comparison_code && `${p.onbrand_code ? " · " : ""}COMP: ${p.comparison_code}`}
                    </div>
                    {destinationsByProductId[p.id]?.[0]?.url ? (
                      <div className="text-xs text-slate-400 mt-1 truncate">
                        {destinationsByProductId[p.id][0].funnel} → {destinationsByProductId[p.id][0].url.length > 60
                          ? `${destinationsByProductId[p.id][0].url.slice(0, 60)}…`
                          : destinationsByProductId[p.id][0].url
                        }
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {(p as any).deleted_at ? (
                      <button
                        type="button"
                        className="text-xs font-semibold px-2 py-1 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(p.id)}
                      >
                        ↺ Restore
                      </button>
                    ) : (
                      <>
                        <Link className="btn-secondary" to={`/ads-launcher/products/${p.id}`}>Edit</Link>
                        <button className="btn-danger" onClick={async () => { if (await confirmAct({ title: `Delete "${p.name}"?`, description: "Moves to trash. Restore from 'Show trash'.", tone: "danger", confirmLabel: "Delete product" })) del.mutate(p.id); }}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2 className="text-lg font-bold mb-4">{editing.id ? "Edit" : "Add"} Product</h2>
          <div className="space-y-3">
            <Field label="Brand" required>
              <Select value={editing.brand_id ?? ""} onValueChange={(value) => setEditing({ ...editing, brand_id: value })}>
                <SelectTrigger className="al-input">
                  <SelectValue placeholder="— select —" />
                </SelectTrigger>
                <SelectContent>
                  {brands.length === 0 ? (
                    <SelectItem value="__no_match__" disabled>
                      No brands found
                    </SelectItem>
                  ) : (
                    brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Product Name" required>
              <input className="al-input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Comparison Code">
                <input className="al-input font-mono text-xs" placeholder="CL_OREG_COMP" value={editing.comparison_code ?? ""} onChange={(e) => setEditing({ ...editing, comparison_code: e.target.value })} />
              </Field>
              <Field label="Onbrand Code">
                <input className="al-input font-mono text-xs" placeholder="CL_OREG_ONB" value={editing.onbrand_code ?? ""} onChange={(e) => setEditing({ ...editing, onbrand_code: e.target.value })} />
              </Field>
            </div>

            <div className="border-t pt-3">
              <div className="al-label">Meta Destinations</div>
              <div className="space-y-2">
                <Field label="Onbrand">
                  <input className="al-input text-xs" placeholder="https://…?ad_id={{ad.id}}…" value={editing.meta_destination_onbrand ?? ""} onChange={(e) => setEditing({ ...editing, meta_destination_onbrand: e.target.value })} />
                </Field>
                <Field label="Comparison">
                  <input className="al-input text-xs" placeholder="https://…?ad_id={{ad.id}}…" value={editing.meta_destination_comparison ?? ""} onChange={(e) => setEditing({ ...editing, meta_destination_comparison: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="al-label">Applovin Destinations</div>
              <div className="space-y-2">
                <Field label="Onbrand">
                  <input className="al-input text-xs" value={editing.applovin_destination_onbrand ?? ""} onChange={(e) => setEditing({ ...editing, applovin_destination_onbrand: e.target.value })} />
                </Field>
                <Field label="Comparison">
                  <input className="al-input text-xs" value={editing.applovin_destination_comparison ?? ""} onChange={(e) => setEditing({ ...editing, applovin_destination_comparison: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="al-label">Defaults (used when no creative template selected)</div>
              <div className="space-y-2">
                <CountedField label="Headline" max={CHAR_LIMITS.headline}>
                  <input className="al-input" maxLength={CHAR_LIMITS.headline} value={editing.default_headline ?? ""} onChange={(e) => setEditing({ ...editing, default_headline: e.target.value })} />
                </CountedField>
                <CountedField label="Description" max={CHAR_LIMITS.description}>
                  <input className="al-input" maxLength={CHAR_LIMITS.description} value={editing.default_description ?? ""} onChange={(e) => setEditing({ ...editing, default_description: e.target.value })} />
                </CountedField>
                <CountedField label="Primary Text" max={CHAR_LIMITS.primary_text}>
                  <textarea className="al-input" rows={3} maxLength={CHAR_LIMITS.primary_text} value={editing.default_primary_text ?? ""} onChange={(e) => setEditing({ ...editing, default_primary_text: e.target.value })} />
                </CountedField>
                <Field label="Default CTA">
                  <Select value={editing.default_call_to_action ?? ""} onValueChange={(value) => setEditing({ ...editing, default_call_to_action: value || null })}>
                    <SelectTrigger className="al-input">
                      <SelectValue placeholder="— none —" />
                    </SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default Destination URL (fallback)">
                  <input className="al-input text-xs" value={editing.default_destination_url ?? ""} onChange={(e) => setEditing({ ...editing, default_destination_url: e.target.value })} />
                </Field>
              </div>
            </div>

            {save.isError && <div className="text-sm text-red-600">{(save.error as Error).message}</div>}
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending || !editing.name?.trim() || !editing.brand_id} onClick={() => save.mutate(editing)}>{save.isPending ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="al-label">{label}{required ? " *" : ""}</label>
      {children}
    </div>
  );
}

function CountedField({ label, max, children }: { label: string; max: number; children: React.ReactElement }) {
  const value: string = (children.props as any).value ?? "";
  return (
    <div>
      <label className="al-label flex items-center justify-between">
        <span>{label}</span>
        <span className={`text-[10px] font-mono ${value.length > max ? "text-red-600 font-bold" : value.length > max - 5 ? "text-amber-600" : "text-slate-400"}`}>
          {value.length}/{max}
        </span>
      </label>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Cycle 466 — inline product-name edit (double-click). Mirrors the
 * brand version on /brands. Enter/blur saves, Escape cancels.
 */
function InlineProductName({ product, onSave }: { product: Product; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product.name);
  if (!editing) {
    return (
      <span
        className="cursor-text"
        onDoubleClick={() => { setEditing(true); setDraft(product.name); }}
        title="Double-click to rename"
      >
        {product.name}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="text"
      className="al-input text-sm py-0.5 max-w-xs"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (draft.trim() && draft.trim() !== product.name) onSave(draft.trim());
          setEditing(false);
        }
        if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
      }}
      onBlur={() => {
        if (draft.trim() && draft.trim() !== product.name) onSave(draft.trim());
        setEditing(false);
      }}
    />
  );
}
