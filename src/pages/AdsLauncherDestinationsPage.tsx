import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api, DestinationUrl, FUNNELS, PLATFORMS, Product } from "@/features/ads-launcher/lib/api";
import { EmptyState, ListSkeleton, Plus } from "@/features/ads-launcher/components/ListShells";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Form = Partial<DestinationUrl> & { product_id?: string; funnel?: "Onbrand" | "Comparison"; platform?: "Meta" | "Applovin"; preview_url?: string | null };

export default function DestinationsPage() {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["destinations-all"],
    queryFn: async () => {
      const res = await api.get<DestinationUrl[] | { data: DestinationUrl[] }>("/api/destinations");
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products-full"],
    queryFn: async () => {
      const res = await api.get<Product[] | { data: Product[] }>("/api/products/full");
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
  });
  const [editing, setEditing] = useState<Form | null>(null);
  const [productFilter, setProductFilter] = useState<string>("");
  const [funnelFilter, setFunnelFilter] = useState<string>("");

  const save = useMutation({
    mutationFn: (d: Form) =>
      d.id ? api.put(`/api/destinations/${d.id}`, d) : api.post("/api/destinations", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["destinations-all"] });
      qc.invalidateQueries({ queryKey: ["destinations"] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/destinations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["destinations-all"] });
      qc.invalidateQueries({ queryKey: ["destinations"] });
    },
  });

  const filtered = useMemo(() => {
    return destinations.filter((d) => {
      if (productFilter && d.product_id !== productFilter) return false;
      if (funnelFilter && d.funnel !== funnelFilter) return false;
      return true;
    });
  }, [destinations, productFilter, funnelFilter]);

  const grouped = useMemo(() => {
    const out: Record<string, Record<string, Record<string, DestinationUrl[]>>> = {};
    for (const d of filtered) {
      const pKey = `${d.brand_name ?? "?"} · ${d.product_name ?? "?"}`;
      out[pKey] ??= {};
      out[pKey][d.funnel] ??= {};
      out[pKey][d.funnel][d.platform] ??= [];
      out[pKey][d.funnel][d.platform].push(d);
    }
    return out;
  }, [filtered]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Destination URLs</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pre-configured per (product, funnel, platform). The launcher auto-picks the default for the detected Ad-ID combination.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={products.length === 0}
          onClick={() =>
            setEditing({
              product_id: products[0]?.id,
              funnel: "Onbrand",
              platform: "Meta",
              name: "",
              url: "",
              is_default: false,
            })
          }
        >
          + Add destination URL
        </button>
      </div>

      {products.length === 0 ? (
        <div className="al-card mb-4">
          <EmptyState
            title="Set up a product first"
            description="Destination URLs live under a product + funnel + platform. Add a product before creating URLs."
            cta={{ label: "Go to Products", to: "/ads-launcher/products" }}
          />
        </div>
      ) : isLoading ? (
        <ListSkeleton />
      ) : destinations.length === 0 ? (
        <div className="al-card">
          <EmptyState
            title="No destination URLs yet"
            description="Add the first URL — name, URL with {{ad.id}} placeholders, scope it to product + funnel + platform, and mark it as default for that combination."
            icon={<Plus />}
            cta={{
              label: "+ Add destination URL",
              onClick: () =>
                setEditing({
                  product_id: products[0]?.id,
                  funnel: "Onbrand",
                  platform: "Meta",
                  name: "",
                  url: "",
                  is_default: true,
                }),
            }}
          />
        </div>
      ) : (
        <>
          <div className="al-card mb-4 space-y-3">
            <div>
              <label className="al-label">Filter by product</label>
              <Select
                value={productFilter || "__all__"}
                onValueChange={(v) => setProductFilter(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="md:max-w-md">
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All products</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Funnel</span>
              {(["", ...FUNNELS] as const).map((f) => (
                <button
                  key={f || "all"}
                  type="button"
                  onClick={() => setFunnelFilter(f)}
                  className={`chip text-[10.5px] ${
                    funnelFilter === f
                      ? (f ? "bg-brand-500 text-white border-brand-500" : "bg-slate-900 text-white border-slate-900")
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                  aria-pressed={funnelFilter === f}
                >
                  {f || "All"}
                </button>
              ))}
            </div>
          </div>

          {Object.keys(grouped).length === 0 && (
            <div className="al-card flex flex-col items-center text-center py-12 px-6 bg-gradient-to-b from-white to-slate-50/40">
              <div className="relative mb-5">
                <div className="absolute inset-0 rounded-full bg-amber-200/30 blur-2xl" />
                <div className="relative size-16 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 ring-4 ring-amber-50/70 flex items-center justify-center text-amber-500 shadow-sm">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </div>
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900">No destinations found</h3>
              <p className="text-[12.5px] text-slate-500 mt-1.5 max-w-sm">
                {(() => {
                  const product = productFilter ? products.find((p) => p.id === productFilter) : null;
                  const parts: string[] = [];
                  if (product) parts.push(`product "${product.name}"`);
                  if (funnelFilter) parts.push(`funnel "${funnelFilter}"`);
                  return parts.length
                    ? `Nothing configured for ${parts.join(" · ")} yet. Add one, or clear the filter to see the rest.`
                    : "Try adjusting the filters above, or add a new destination URL.";
                })()}
              </p>
              <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
                {(productFilter || funnelFilter) && (
                  <button
                    type="button"
                    className="btn-secondary text-[12.5px]"
                    onClick={() => { setProductFilter(""); setFunnelFilter(""); }}
                  >
                    Clear filters
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary text-[12.5px]"
                  onClick={() =>
                    setEditing({
                      product_id: productFilter || products[0]?.id,
                      funnel: (funnelFilter as Form["funnel"]) || "Onbrand",
                      platform: "Meta",
                      name: "",
                      url: "",
                      is_default: false,
                    })
                  }
                >
                  + Add destination URL
                </button>
              </div>
            </div>
          )}

          {Object.entries(grouped).map(([productKey, byFunnel]) => (
            <div key={productKey} className="al-card mb-4">
              <h2 className="font-semibold text-sm text-slate-700 mb-3">{productKey}</h2>
              <div className="space-y-3">
                {(["Onbrand", "Comparison"] as const).map((funnel) => {
                  const byPlatform = byFunnel[funnel];
                  if (!byPlatform) return null;
                  return (
                    <div key={funnel} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{funnel}</div>
                      <div className="space-y-2">
                        {(["Meta", "Applovin"] as const).map((platform) => {
                          const rows = byPlatform[platform];
                          if (!rows || rows.length === 0) return null;
                          return (
                            <div key={platform}>
                              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">{platform}</div>
                              <div className="space-y-1.5">
                                {rows.map((d) => (
                                  <div
                                    key={d.id}
                                    className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-brand-200 transition-colors"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm text-slate-900">{d.name}</span>
                                        {d.is_default && (
                                          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            default
                                          </span>
                                        )}
                                        {!d.preview_url && (
                                          <span
                                            className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                                            title="No preview URL set — edit to add one."
                                          >
                                            no preview
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-mono break-all mt-0.5" title={d.url}>
                                        <span className="text-slate-400 mr-1">actual:</span>{d.url}
                                      </div>
                                      {d.preview_url && (
                                        <div className="text-[11px] text-slate-500 font-mono break-all mt-0.5" title={d.preview_url}>
                                          <span className="text-slate-400 mr-1">preview:</span>{d.preview_url}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        className="btn-icon hover:!text-brand-600"
                                        title="Edit"
                                        aria-label="Edit destination URL"
                                        onClick={() => setEditing(d)}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M12 20h9" />
                                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                        </svg>
                                      </button>
                                      <button
                                        className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                                        title="Delete"
                                        aria-label="Delete destination URL"
                                        onClick={async () => {
                                          if (
                                            await confirmAct({
                                              title: `Delete "${d.name}"?`,
                                              description: "This destination URL will be removed. Any past launches that already saved the URL keep their copy.",
                                              tone: "danger",
                                              confirmLabel: "Delete",
                                            })
                                          )
                                            del.mutate(d.id);
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
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {editing && (
        <Editor
          form={editing}
          products={products}
          onCancel={() => setEditing(null)}
          onSave={(d) => save.mutate(d)}
          saving={save.isPending}
        />
      )}
    </div>
  );
}

function Editor({
  form,
  products,
  onCancel,
  onSave,
  saving,
}: {
  form: Form;
  products: Product[];
  onCancel: () => void;
  onSave: (d: Form) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(form.name ?? "");
  const [url, setUrl] = useState(form.url ?? "");
  const [previewUrl, setPreviewUrl] = useState(form.preview_url ?? "");
  const [productId, setProductId] = useState(form.product_id ?? products[0]?.id ?? "");
  const [funnel, setFunnel] = useState<"Onbrand" | "Comparison">((form.funnel ?? "Onbrand") as any);
  const [platform, setPlatform] = useState<"Meta" | "Applovin">((form.platform ?? "Meta") as any);
  const [isDefault, setIsDefault] = useState(form.is_default ?? false);

  const previewLooksOk = /^\S+\.\S+$/.test(previewUrl.trim());
  const actualLooksOk = /^\S+\.\S+$/.test(url.trim());
  const valid = name.trim().length >= 1 && actualLooksOk && previewLooksOk && !!productId;

  function normalizeUrl(v: string): string {
    const t = v.trim();
    if (!t) return t;
    if (/^https?:\/\//i.test(t)) return t;
    return `https://${t}`;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="al-card max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-slate-900 text-lg mb-4">
          {form.id ? "Edit destination URL" : "New destination URL"}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="al-label">Product</label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="al-label">Funnel</label>
              <Select value={funnel} onValueChange={(v) => setFunnel(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUNNELS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="al-label">Platform</label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="al-label">Name</label>
            <input
              className="al-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cleantra Lymph · Onbrand"
              autoFocus
            />
          </div>
          <div>
            <label className="al-label">Actual URL <span className="text-rose-500">*</span></label>
            <textarea
              className="al-input font-mono text-xs"
              rows={3}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://trvl.example.com/abc?ad_id={{ad.id}}&adset_id={{adset.id}}&campaign_id={{campaign.id}}"
            />
            <div className="text-[10px] text-slate-500 mt-1">
              Where the click actually goes. Meta tokens: <code>{`{{ad.id}}`}</code> <code>{`{{adset.id}}`}</code> <code>{`{{campaign.id}}`}</code> <code>{`{{site_source_name}}`}</code> <code>{`{{placement}}`}</code>. Applovin: <code>{`{AD_SIZE}`}</code> <code>{`{EVENT_ID}`}</code> <code>{`{CAMPAIGN_ID}`}</code> <code>{`{DID}`}</code>.
            </div>
          </div>
          <div>
            <label className="al-label">Preview URL (display) <span className="text-rose-500">*</span></label>
            <input
              className="al-input font-mono text-xs"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setPreviewUrl(t);
              }}
              placeholder="https://brand.com/offer"
            />
            <div className="text-[10px] text-slate-500 mt-1">
              The clean branded URL Meta displays under the CTA. Often shorter than the tracked actual URL above.
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-slate-300"
            />
            Default for {platform} · {funnel}{" "}
            <span className="text-xs text-slate-400">
              (auto-selected by the launcher on Ad-ID import)
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-200">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!valid || saving}
            onClick={() =>
              onSave({
                ...form,
                product_id: productId,
                funnel,
                platform,
                name: name.trim(),
                url: normalizeUrl(url),
                preview_url: previewUrl.trim(),
                is_default: isDefault,
              })
            }
          >
            {saving ? "Saving…" : form.id ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
