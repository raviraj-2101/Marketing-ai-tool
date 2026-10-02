import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Loader2, Lightbulb } from "lucide-react";
import { useBrands } from "@/hooks/useBrands";
import { useProducts, Product } from "@/hooks/useProducts";
import { useInspos } from "@/hooks/useInspos";
import { useAuth } from "@/hooks/useAuth";
import { filterBrandScoped } from "@/lib/brandAccess";
import { FormTemplate, FormTemplateFormData } from "@/hooks/useFormTemplates";

type FunnelType = "Comparison" | "Onbrand" | "TSL" | "Adv";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FormTemplate | null;
  onSubmit: (data: FormTemplateFormData) => void;
  isLoading: boolean;
  defaultFunnel?: string;
}

export const TemplateDialog = ({
  open,
  onOpenChange,
  template,
  onSubmit,
  isLoading,
  defaultFunnel,
}: TemplateDialogProps) => {
  const [name, setName] = useState("");
  const [funnel, setFunnel] = useState<FunnelType | "">((defaultFunnel as FunnelType) || "");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [adTitle, setAdTitle] = useState("");
  const [adSubtitle, setAdSubtitle] = useState("");
  const [designElements, setDesignElements] = useState("");
  const [promptForImages, setPromptForImages] = useState("");
  const [numberOfAds, setNumberOfAds] = useState("");

  const [ctaButton, setCtaButton] = useState(false);
  const [ctaButtonText, setCtaButtonText] = useState("");
  const [multipleAngles, setMultipleAngles] = useState(false);
  const [badge, setBadge] = useState(false);
  const [badgeText, setBadgeText] = useState("");
  const [selectedInspoIds, setSelectedInspoIds] = useState<string[]>([]);
  const [productsToShow, setProductsToShow] = useState<string>("5");
  const [customProductsCount, setCustomProductsCount] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { data: allBrands = [] } = useBrands();
  const { products = [] } = useProducts();
  const { inspos = [] } = useInspos();
  const { user } = useAuth();

  // Filter brands to show only user's assigned brands
  const brands = filterBrandScoped(user, allBrands, (b) => b.id, { emptyMeansAll: true });

  const filteredProducts = products.filter((p: Product) => p.brand_id === selectedBrandId);
  const selectedProduct = useMemo(
    () => products.find((p: Product) => p.id === selectedProductId),
    [products, selectedProductId],
  );
  const filteredInspos = useMemo(
    () => (funnel ? inspos.filter((i) => i.funnel_type.some((ft) => ft.toLowerCase() === funnel.toLowerCase())) : inspos),
    [inspos, funnel],
  );


  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name);
        setFunnel((template.funnel as FunnelType) || "");
        setSelectedBrandId(template.brand_id || "");
        setSelectedProductId(template.product_id || "");
        setConceptName(template.concept_name || "");
        setAdTitle(template.title || "");
        setAdSubtitle(template.subtitle || "");
        setDesignElements(template.design_elements || "");
        setPromptForImages(template.prompt_for_images || "");
        setNumberOfAds(template.number_of_ads || "");

        setCtaButton(template.is_cta_button || false);
        setCtaButtonText(template.cta_button_text || "");
        setMultipleAngles(template.is_multiple || false);
        setBadge(template.is_badge || false);
        setBadgeText(template.badge_text || "");
        setSelectedInspoIds(template.inspo_ids || []);
        const tPts = template.products_to_show || "5";
        if (tPts === "5" || tPts === "5 Products") { setProductsToShow("5"); setCustomProductsCount(""); }
        else if (tPts === "0" || tPts === "No products") { setProductsToShow("0"); setCustomProductsCount(""); }
        else { setProductsToShow("other"); setCustomProductsCount(tPts); }
      } else {
        setName("");
        setFunnel((defaultFunnel as FunnelType) || "");
        setSelectedBrandId("");
        setSelectedProductId("");
        setConceptName("");
        setAdTitle("");
        setAdSubtitle("");
        setDesignElements("");
        setPromptForImages("");
        setNumberOfAds("");

        setCtaButton(false);
        setCtaButtonText("");
        setMultipleAngles(false);
        setBadge(false);
        setBadgeText("");
        setSelectedInspoIds([]);
        setProductsToShow("5");
        setCustomProductsCount("");
      }
    }
  }, [open, template, defaultFunnel]);

  const handleSubmit = () => {
    if (
      !name.trim() ||
      !funnel ||
      !selectedBrandId ||
      !selectedProductId ||
      !conceptName.trim() ||
      !numberOfAds ||
      (funnel === "TSL" && !designElements.trim()) ||
      ((funnel === "Comparison" || funnel === "Onbrand" || funnel === "Adv") && selectedInspoIds.length === 0)
    )
      return;
    onSubmit({
      name: name.trim(),
      funnel,
      brand_id: selectedBrandId || null,
      product_id: selectedProductId || null,
      cs: null,
      concept_name: conceptName || null,
      title: adTitle || null,
      subtitle: adSubtitle || null,
      design_elements: designElements || null,
      prompt_for_images: promptForImages || null,
      number_of_ads: numberOfAds || null,
      max_variations_per_ad_group: null,
      logo_name: null,
      is_cta_button: ctaButton,
      cta_button_text: ctaButton ? ctaButtonText || null : null,
      is_multiple: multipleAngles,
      is_badge: badge,
      badge_text: badge ? badgeText || null : null,
      inspo_ids: selectedInspoIds,
      selected_image_urls: [],
      products_to_show: funnel === "Comparison" ? (productsToShow === "other" ? customProductsCount : productsToShow) : null,
    });
  };

  const showAngleFields = funnel === "Comparison" || funnel === "Onbrand" || funnel === "TSL" || funnel === "Adv";
  const showPromptForImagesField = false;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "Create New Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter template name" />
          </div>

          <div className="space-y-2">
            <Label>
              Funnel <span className="text-destructive">*</span>
            </Label>
            <Select value={funnel} onValueChange={(v: FunnelType) => setFunnel(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select funnel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Comparison">Comparison</SelectItem>
                <SelectItem value="Onbrand">Onbrand</SelectItem>
                <SelectItem value="TSL">TSL</SelectItem>
                <SelectItem value="Adv">Adv</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Brand <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedBrandId}
              onValueChange={(v) => {
                setSelectedBrandId(v);
                setSelectedProductId("");
              }}
            >
              <SelectTrigger>
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

          <div className="space-y-2">
            <Label>
              Product <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedBrandId}>
              <SelectTrigger>
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


          {funnel === "Comparison" && (
            <div className="space-y-2">
              <Label>Products to Show</Label>
              <Select value={productsToShow} onValueChange={(v) => { setProductsToShow(v); if (v !== "other") setCustomProductsCount(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select option" />
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
                  placeholder="Enter number of products"
                />
              )}
            </div>
          )}

          {funnel === "Comparison" && selectedProduct?.publishers?.image_url && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setPreviewImageUrl(selectedProduct.publishers.image_url)}
            >
              <img
                src={selectedProduct.publishers.image_url}
                alt={selectedProduct.publishers.name}
                className="w-10 h-10 rounded-lg object-contain border bg-white"
              />
              <div>
                <p className="text-xs text-muted-foreground">Publisher Logo</p>
                <p className="text-sm font-medium">{selectedProduct.publishers.name}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Concept Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={conceptName}
              onChange={(e) => setConceptName(e.target.value)}
              placeholder="Enter concept name"
            />
          </div>

          {funnel !== "TSL" && showAngleFields && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="Enter ad title" />
              </div>
              <div className="space-y-2">
                <Label>Design Elements</Label>
                <Textarea
                  value={designElements}
                  onChange={(e) => setDesignElements(e.target.value)}
                  placeholder="Describe design elements..."
                  className="min-h-[80px] resize-y"
                />
              </div>
            </div>
          )}

          {funnel === "TSL" && (
            <div className="space-y-2">
              <Label>Design Elements <span className="text-destructive">*</span></Label>
              <Textarea
                value={designElements}
                onChange={(e) => setDesignElements(e.target.value)}
                placeholder="Describe visual style, colors, layout…"
                className="min-h-[100px] resize-y"
              />
            </div>
          )}


          {showPromptForImagesField && (
            <div className="space-y-2">
              <Label>Prompt for Images <span className="text-destructive">*</span></Label>
              <Textarea
                value={promptForImages}
                onChange={(e) => setPromptForImages(e.target.value)}
                placeholder="Describe images..."
                className="min-h-[100px]"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Number of Ads <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="1"
              value={numberOfAds}
              onChange={(e) => setNumberOfAds(e.target.value)}
              placeholder="Enter number of ads"
            />
          </div>

          {/* Inspo selection */}
          {funnel && (funnel === "Comparison" || funnel === "Onbrand" || funnel === "Adv") && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" /> Inspiration (Inspo) <span className="text-destructive">*</span>
              </Label>
              {selectedInspoIds.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/50">
                  {selectedInspoIds.map((id) => {
                    const inspo = inspos.find((i) => i.id === id);
                    return inspo ? (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
                        {inspo.name}
                        <button
                          type="button"
                          onClick={() => setSelectedInspoIds((p) => p.filter((x) => x !== id))}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                {filteredInspos.map((inspo) => (
                  <div
                    key={inspo.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${selectedInspoIds.includes(inspo.id) ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground"}`}
                    onClick={() =>
                      setSelectedInspoIds((p) =>
                        p.includes(inspo.id) ? p.filter((x) => x !== inspo.id) : [...p, inspo.id],
                      )
                    }
                  >
                    <Checkbox
                      checked={selectedInspoIds.includes(inspo.id)}
                      onCheckedChange={() =>
                        setSelectedInspoIds((p) =>
                          p.includes(inspo.id) ? p.filter((x) => x !== inspo.id) : [...p, inspo.id],
                        )
                      }
                    />
                    <span className="text-sm truncate">{inspo.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              !name.trim() ||
              !funnel ||
              !selectedBrandId ||
              !selectedProductId ||
              !conceptName.trim() ||
              !numberOfAds ||
              (funnel === "TSL" && !designElements.trim()) ||
              ((funnel === "Comparison" || funnel === "Onbrand" || funnel === "Adv") && selectedInspoIds.length === 0)
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
              </>
            ) : template ? (
              "Update Template"
            ) : (
              "Create Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!previewImageUrl} onOpenChange={() => setPreviewImageUrl(null)}>
      <DialogContent className="max-w-lg p-2 border-none bg-transparent shadow-none">
        {previewImageUrl && (
          <img
            src={previewImageUrl}
            alt="Publisher Logo Preview"
            className="w-full h-auto max-h-[80vh] object-contain rounded-lg bg-white p-4"
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};
