import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, Circle, Package, Bookmark, Layers, Lightbulb, FileText, Type, Tag, Hash } from "lucide-react";
import { useProducts, Product } from "@/hooks/useProducts";
import { useInspos } from "@/hooks/useInspos";
import { useAuth } from "@/hooks/useAuth";
import { userHasBrandAccess } from "@/lib/brandAccess";
import { useFilteredBrands } from "@/hooks/useFilteredBrands";
import {
  useCreateFormTemplate,
  useUpdateFormTemplate,
  FormTemplate,
  FormTemplateFormData,
} from "@/hooks/useFormTemplates";

type FunnelType = "Comparison" | "Onbrand" | "TSL" | "Adv";

interface TemplateBuilderFormProps {
  editingTemplate?: FormTemplate | null;
  onSaved: () => void;
}

const FUNNEL_ACTIVE: Record<FunnelType, string> = {
  Comparison: "bg-blue-600 text-white border-blue-600",
  Onbrand: "bg-emerald-600 text-white border-emerald-600",
  TSL: "bg-purple-600 text-white border-purple-600",
  Adv: "bg-rose-600 text-white border-rose-600",
};

const FUNNEL_BADGE: Record<FunnelType, string> = {
  Comparison: "funnel-badge-comparison",
  Onbrand: "funnel-badge-onbrand",
  TSL: "funnel-badge-tsl",
  Adv: "funnel-badge-adv",
};

const CheckItem = ({ label, done }: { label: string; done: boolean }) => (
  <div className="flex items-center gap-2 text-sm">
    {done ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    ) : (
      <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    )}
    <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
  </div>
);

export const TemplateBuilderForm = ({ editingTemplate, onSaved }: TemplateBuilderFormProps) => {
  const [name, setName] = useState("");
  const [funnel, setFunnel] = useState<FunnelType | "">("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [title, setTitle] = useState("");
  const [designElements, setDesignElements] = useState("");
  const [numberOfAds, setNumberOfAds] = useState("");
  const [selectedInspoIds, setSelectedInspoIds] = useState<string[]>([]);
  const [productsToShow, setProductsToShow] = useState("5");
  const [customProductsCount, setCustomProductsCount] = useState("");

  const { data: brands = [] } = useFilteredBrands();
  const { products = [] } = useProducts();
  const { inspos = [] } = useInspos();
  const { user } = useAuth();
  const createTemplate = useCreateFormTemplate();
  const updateTemplate = useUpdateFormTemplate();

  // Filter products by selected brand and user's assigned brands
  const filteredProducts = products.filter(
    (p: Product) => p.brand_id === selectedBrandId && userHasBrandAccess(user, p.brand_id, { emptyMeansAll: true })
  );
  const selectedProduct = useMemo(
    () => products.find((p: Product) => p.id === selectedProductId),
    [products, selectedProductId]
  );
  const filteredInspos = useMemo(
    () =>
      funnel
        ? inspos.filter((i) => i.funnel_type.some((ft) => ft.toLowerCase() === funnel.toLowerCase()))
        : inspos,
    [inspos, funnel]
  );

  // Populate form when editing
  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name);
      setFunnel((editingTemplate.funnel as FunnelType) || "");
      setSelectedBrandId(editingTemplate.brand_id || "");
      setSelectedProductId(editingTemplate.product_id || "");
      setConceptName(editingTemplate.concept_name || "");
      setTitle(editingTemplate.title || "");
      setDesignElements(editingTemplate.design_elements || "");
      setNumberOfAds(editingTemplate.number_of_ads || "");
      setSelectedInspoIds(editingTemplate.inspo_ids || []);
      const pts = editingTemplate.products_to_show || "5";
      if (pts === "5" || pts === "0") {
        setProductsToShow(pts);
        setCustomProductsCount("");
      } else {
        setProductsToShow("other");
        setCustomProductsCount(pts);
      }
    } else {
      setName("");
      setFunnel("");
      setSelectedBrandId("");
      setSelectedProductId("");
      setConceptName("");
      setTitle("");
      setDesignElements("");
      setNumberOfAds("");
      setSelectedInspoIds([]);
      setProductsToShow("5");
      setCustomProductsCount("");
    }
  }, [editingTemplate]);

  const requiresInspos = funnel && ["Comparison", "Onbrand", "Adv"].includes(funnel);

  const isValid =
    name.trim() !== "" &&
    funnel !== "" &&
    selectedBrandId !== "" &&
    selectedProductId !== "" &&
    conceptName.trim() !== "" &&
    numberOfAds !== "" &&
    (!requiresInspos || selectedInspoIds.length > 0);

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const handleSubmit = () => {
    if (!isValid) return;
    const payload: FormTemplateFormData = {
      name: name.trim(),
      funnel: funnel as FunnelType,
      brand_id: selectedBrandId || null,
      product_id: selectedProductId || null,
      cs: null,
      concept_name: conceptName || null,
      title: title || null,
      subtitle: null,
      design_elements: designElements || null,
      prompt_for_images: null,
      number_of_ads: numberOfAds || null,
      max_variations_per_ad_group: null,
      logo_name: null,
      is_cta_button: null,
      cta_button_text: null,
      is_multiple: null,
      is_badge: null,
      badge_text: null,
      inspo_ids: selectedInspoIds,
      selected_image_urls: [],
      products_to_show:
        funnel === "Comparison"
          ? productsToShow === "other"
            ? customProductsCount
            : productsToShow
          : null,
    };
    if (editingTemplate) {
      updateTemplate.mutate({ id: editingTemplate.id, formData: payload }, { onSuccess: onSaved });
    } else {
      createTemplate.mutate(payload, { onSuccess: onSaved });
    }
  };

  const toggleInspo = (id: string) =>
    setSelectedInspoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const showDesignElements = !!funnel;
  const showInspos = !!funnel && funnel !== "TSL";

  const selectedInspoNames = selectedInspoIds
    .map((id) => inspos.find((i) => i.id === id)?.name)
    .filter(Boolean) as string[];

  const brandName = brands.find((b) => b.id === selectedBrandId)?.name ?? "";
  const productName = selectedProduct?.name ?? "";

  return (
    <div className="h-full flex gap-6 pb-8">
      {/* ── LEFT: Form ── */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-5 pr-1">

        {/* Config Template Name */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/50 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Config Identity</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">
                Config Template Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Comparison Q1 Evergreen"
                className="border-border bg-muted/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">
                Funnel <span className="text-rose-500">*</span>
              </Label>
              <div className="flex gap-2 flex-wrap">
                {(["Comparison", "Onbrand", "TSL", "Adv"] as FunnelType[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFunnel(f);
                      setSelectedInspoIds([]);
                    }}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                      funnel === f
                        ? FUNNEL_ACTIVE[f]
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground bg-transparent"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Brand + Product */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/50 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Brand & Product</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">
                  Brand <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={selectedBrandId}
                  onValueChange={(v) => {
                    setSelectedBrandId(v);
                    setSelectedProductId("");
                  }}
                >
                  <SelectTrigger className="border-border bg-muted/50">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">
                  Product <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={selectedProductId}
                  onValueChange={setSelectedProductId}
                  disabled={!selectedBrandId}
                >
                  <SelectTrigger className="border-border bg-muted/50">
                    <SelectValue placeholder={selectedBrandId ? "Select product" : "Select brand first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((p: Product) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Concept + Number of Ads */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/50 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Concept</span>
          </div>
          <div className="p-5 space-y-4">
            <div className={`grid ${funnel !== "TSL" ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">
                  Concept Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={conceptName}
                  onChange={(e) => setConceptName(e.target.value)}
                  placeholder="Short label for this creative concept"
                  className="border-border bg-muted/50"
                />
              </div>
              {funnel !== "TSL" && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-foreground">
                    Title
                  </Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ad headline"
                    className="border-border bg-muted/50"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  Number of Ads <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={numberOfAds}
                  onChange={(e) => setNumberOfAds(e.target.value)}
                  placeholder="e.g. 5"
                  className="border-border bg-muted/50"
                />
              </div>
              {funnel === "Comparison" && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-foreground">Products to Show</Label>
                  <Select
                    value={productsToShow}
                    onValueChange={(v) => {
                      setProductsToShow(v);
                      if (v !== "other") setCustomProductsCount("");
                    }}
                  >
                    <SelectTrigger className="border-border bg-muted/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 Products</SelectItem>
                      <SelectItem value="0">No products</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {productsToShow === "other" && (
                    <Input
                      type="number"
                      min="1"
                      value={customProductsCount}
                      onChange={(e) => setCustomProductsCount(e.target.value)}
                      placeholder="Custom count"
                      className="mt-2 border-border bg-muted/50"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Design Elements (Comparison / Onbrand only) */}
        {showDesignElements && (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/50 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Type className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Design Elements</span>
            </div>
            <div className="p-5">
              <Textarea
                value={designElements}
                onChange={(e) => setDesignElements(e.target.value)}
                placeholder="Describe visual style, colors, layout…"
                className="min-h-[80px] resize-y border-border bg-muted/50"
              />
            </div>
          </div>
        )}


        {/* Inspo Source Pools */}
        {showInspos && (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/50 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">
                Inspo Source Pools
                {requiresInspos && <span className="text-rose-500 ml-1">*</span>}
              </span>
              {selectedInspoIds.length > 0 && (
                <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {selectedInspoIds.length} selected
                </span>
              )}
            </div>
            <div className="p-5">
              {filteredInspos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No source pools found for this funnel. Add pools in the Inspo tab.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredInspos.map((inspo) => {
                    const selected = selectedInspoIds.includes(inspo.id);
                    return (
                      <button
                        key={inspo.id}
                        type="button"
                        onClick={() => toggleInspo(inspo.id)}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-muted-foreground/50 bg-muted/30"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                          }`}
                        >
                          {selected && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm truncate ${selected ? "text-foreground font-medium" : "text-foreground"}`}>
                          {inspo.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Config Snapshot ── */}
      <div className="w-72 shrink-0">
        <div className="sticky top-0 rounded-2xl border border-border bg-card shadow-sm flex flex-col" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-border bg-muted/30 shrink-0">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              Config Snapshot
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Live preview of your config</p>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Product + Funnel */}
            <div className="space-y-2">
              {productName ? (
                <div>
                  <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-0.5">Product</p>
                  <p className="text-sm font-semibold text-foreground">{productName}</p>
                  {brandName && (
                    <p className="text-xs text-muted-foreground mt-0.5">{brandName}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No product selected</p>
              )}
              {funnel && (
                <span className={FUNNEL_BADGE[funnel as FunnelType]}>
                  {funnel}
                </span>
              )}
              <br />
              {numberOfAds && (
                <span className="text-[12px] mt-2 font-semibold tracking-widest text-muted-foreground ">
                  Number of Ads: 
                  {numberOfAds}
                </span>
              )}
            </div>

            {/* Template name */}
            {name.trim() && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-0.5">
                  Config Name
                </p>
                <p className="text-sm font-medium text-foreground break-words">{name}</p>
              </div>
            )}

            {/* Concept */}
            {conceptName.trim() && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-0.5">
                  Concept
                </p>
                <p className="text-sm text-foreground break-words">{conceptName}</p>
              </div>
            )}

            {/* Title */}
            {title.trim() && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-0.5">
                  Title
                </p>
                <p className="text-sm text-foreground break-words">{title}</p>
              </div>
            )}

            {/* Selected inspos */}
            {selectedInspoNames.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1.5">
                  Source Pools
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedInspoNames.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-muted text-foreground border border-border"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Completeness checklist */}
            <div className="border-t border-border pt-3 space-y-1.5">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">
                Completeness
              </p>
              <CheckItem label="Config name" done={name.trim() !== ""} />
              <CheckItem label="Brand" done={selectedBrandId !== ""} />
              <CheckItem label="Product" done={selectedProductId !== ""} />
              <CheckItem label="Funnel" done={funnel !== ""} />
              <CheckItem label="Concept name" done={conceptName.trim() !== ""} />
              <CheckItem label="Number of ads" done={numberOfAds !== ""} />
              {requiresInspos && (
                <CheckItem label="Inspo Source Pools" done={selectedInspoIds.length > 0} />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 pt-3 space-y-2 border-t border-border shrink-0">
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!isValid || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {editingTemplate ? "Updating…" : "Saving…"}
                </>
              ) : editingTemplate ? (
                "Update Config"
              ) : (
                "Save Config"
              )}
            </Button>
            <Button variant="outline" className="w-full" onClick={onSaved}>
              Browse saved configs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
