import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProducts, Product } from "@/hooks/useProducts";
import { useBrands, Brand } from "@/hooks/useBrands";
import { useAuth } from "@/hooks/useAuth";
import { usePublishers } from "@/hooks/usePublishers";
import { filterBrandScoped } from "@/lib/brandAccess";
import { Plus, X, Image, ExternalLink, Loader2, Sparkles, CheckCircle2, FileText } from "lucide-react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

interface ImageWithExplanation {
  file?: File;
  url?: string;
  explanation: string;
  preview?: string;
}

interface ComparisonBrand {
  file?: File;
  url?: string;
  brand_name: string;
  preview?: string;
}

export const ProductDialog = ({ open, onOpenChange, product }: ProductDialogProps) => {
  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [brandId, setBrandId] = useState<string>("");
  const [publisherId, setPublisherId] = useState<string>("");
  const [docsLink, setDocsLink] = useState<string>("");
  const [productcConfigUrl, setProductcConfigUrl] = useState<string>("");
  const [driveLinks, setDriveLinks] = useState<{ onbrand: string; comparison: string; tsl: string; adv: string; productFolder: string; tslScript: string }>({ onbrand: "", comparison: "", tsl: "", adv: "", productFolder: "", tslScript: "" });
  const [guidelines, setGuidelines] = useState("");
  const [images, setImages] = useState<ImageWithExplanation[]>([]);
  // Real holding/reference example photos — separate collection from product images
  // (consumed as GPT grip/scale references in the Add-a-Look flow).
  const [referenceImages, setReferenceImages] = useState<ImageWithExplanation[]>([]);
  const [comparisonBrands, setComparisonBrands] = useState<ComparisonBrand[]>([
    { brand_name: "" },
    { brand_name: "" },
    { brand_name: "" },
    { brand_name: "" },
    { brand_name: "" },
  ]);
  // Single overlay "Top 5 comparison" card image (shown on-screen during the
  // ranking line in Top-5 comparison video scripts). Distinct from the 5
  // per-brand comparison images above.
  const [top5Image, setTop5Image] = useState<{ file?: File; url?: string; preview?: string }>({});

  // Brief state
  const [productBrief, setProductBrief] = useState<string | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefEditorOpen, setBriefEditorOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");

  // Ad DB Sheet ID state
  const [adDbSheetId, setAdDbSheetId] = useState<string | null>(null);

  const { createProduct, updateProduct } = useProducts();
  const { data: allBrandsData } = useBrands();
  const { user } = useAuth();
  const { publishers } = usePublishers();
  const isEditing = !!product;

  // Custom-only users see only assigned brands
  const isCustomOnly = !!(
    user?.user_type?.includes("Custom") &&
    !user.user_type.some(t => ["Super Admin", "Admin", "Dev"].includes(t))
  );

  const allBrands: Brand[] = Array.isArray(allBrandsData) ? allBrandsData : [];
  const brands = isCustomOnly
    ? filterBrandScoped(user, allBrands, (b) => b.id)
    : allBrands;

  useEffect(() => {
    if (product) {
      setName(product.name);
      setProductCode(product.product_code || "");
      setBrandId(product.brand_id || "");
      setPublisherId(product.publisher_id || "");
      setDocsLink(product.docs_file_url || "");

      const dl = { onbrand: "", comparison: "", tsl: "", adv: "", productFolder: "", tslScript: "" };
      product.product_drive_links?.forEach((link) => {
        if (link.funnel_type === "onbrand") dl.onbrand = link.drive_link;
        if (link.funnel_type === "comparison") dl.comparison = link.drive_link;
        if (link.funnel_type === "tsl") dl.tsl = link.drive_link;
        if (link.funnel_type === "adv") dl.adv = link.drive_link;
        if (link.funnel_type === "productFolder") dl.productFolder = link.drive_link;
        if (link.funnel_type === "tslScript") dl.tslScript = link.drive_link;
      });
      setDriveLinks(dl);
      setGuidelines(product.guidelines || "");

      const existingImages = product.product_images?.map((img) => ({
        url: img.image_url,
        explanation: img.explanation,
        preview: img.image_url,
      })) || [];
      setImages(existingImages);

      const existingReferenceImages = product.product_reference_images?.map((img) => ({
        url: img.image_url,
        explanation: img.explanation,
        preview: img.image_url,
      })) || [];
      setReferenceImages(existingReferenceImages);

      const existingComparisons = Array(5).fill(null).map((_, i) => {
        const comp = product.product_comparison_brands?.find((c) => c.order_index === i + 1);
        return comp ? { url: comp.image_url, brand_name: comp.brand_name, preview: comp.image_url } : { brand_name: "" };
      });
      setComparisonBrands(existingComparisons);
      setProductBrief(product.product_brief ?? null);
      setAdDbSheetId(product.ad_db_sheet_id ?? null);
      setProductcConfigUrl(product.productc_config_url ?? "");
      setTop5Image(
        product.top_5_comparison_image
          ? { url: product.top_5_comparison_image, preview: product.top_5_comparison_image }
          : {}
      );
    } else {
      resetForm();
    }
  }, [product, open]);

  const resetForm = () => {
    setName("");
    setProductCode("");
    setBrandId("");
    setPublisherId("");
    setDocsLink("");
    setDriveLinks({ onbrand: "", comparison: "", tsl: "", adv: "", productFolder: "", tslScript: "" });
    setGuidelines("");
    setImages([]);
    setReferenceImages([]);
    setComparisonBrands([
      { brand_name: "" },
      { brand_name: "" },
      { brand_name: "" },
      { brand_name: "" },
      { brand_name: "" },
    ]);
    setProductBrief(null);
    setAdDbSheetId(null);
    setProductcConfigUrl("");
    setTop5Image({});
    setIsGeneratingBrief(false);
    setBriefEditorOpen(false);
    setBriefDraft("");
  };

 const handleGenerateBrief = async () => {
  if (!docsLink.trim()) return;
  setIsGeneratingBrief(true);
  try {
    const { data, error } = await supabase.functions.invoke("generate-brief", {
      body: { docs_file_url: docsLink },
    });

    // Add this to see what's actually coming back
    console.log("Response data:", data);
    console.log("Response error:", error);

    if (error || !data?.brief) throw error ?? new Error("No brief returned");

    // Parse the raw text into clean HTML paragraphs:
    // - Strip markdown markers (* ** #)
    // - Lines starting with # become their own paragraph (heading text only)
    // - Empty lines create paragraph breaks
    // - All other consecutive lines are grouped into one paragraph
    const rawLines = data.brief
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .split("\n");

    const paragraphs: string[] = [];
    let currentLines: string[] = [];

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      const isHeading = /^#{1,6}\s/.test(line);
      const cleaned = line.replace(/^#{1,6}\s*/, "");

      if (isHeading) {
        if (currentLines.length > 0) {
          paragraphs.push(currentLines.join("<br>"));
          currentLines = [];
        }
        if (cleaned) paragraphs.push(cleaned);
      } else if (cleaned === "") {
        if (currentLines.length > 0) {
          paragraphs.push(currentLines.join("<br>"));
          currentLines = [];
        }
      } else {
        currentLines.push(cleaned);
      }
    }
    if (currentLines.length > 0) {
      paragraphs.push(currentLines.join("<br>"));
    }

    const html = paragraphs
      .filter((p) => p.trim())
      .map((p) => `<p>${p}</p>`)
      .join("");

    setBriefDraft(html);
    setBriefEditorOpen(true);
  } catch (e: unknown) {
    console.error("Full error:", e); // Add this too
    const msg = e instanceof Error ? e.message : "Failed to generate brief";
    toast.error(msg);
  } finally {
    setIsGeneratingBrief(false);
  }
};

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!productCode.trim()) {
      toast.error("Product code is required");
      return;
    }
    if (!docsLink.trim()) {
      toast.error("Docs Knowledge File is required");
      return;
    }
    if (!productBrief && !isEditing) {
      toast.error("Please generate the product brief first");
      return;
    }

    if (!driveLinks.productFolder.trim()) {
      toast.error("Product Folder drive link is required");
      return;
    }
    if (!driveLinks.tslScript.trim()) {
      toast.error("TSL Script drive link is required");
      return;
    }

    // Fetch Ad DB Sheet ID from edge function
    let currentAdDbSheetId: string | null = adDbSheetId;
    try {
      const { data, error } = await supabase.functions.invoke("get-ads-db-sheet-id", {
        body: { product_name: name },
      });
      if (data?.ad_db_sheet_id) {
        currentAdDbSheetId = data.ad_db_sheet_id;
      }
      // Silently ignore if not found or error — proceed with null
    } catch {
      // Silently ignore errors — fail gracefully
    }

    const formData = {
      brand_id: brandId || null,
      publisher_id: publisherId || null,
      name,
      product_code: productCode,
      docs_file_url: docsLink || null,
      guidelines: guidelines || null,
      publisher_comparison: null,
      product_brief: productBrief,
      ad_db_sheet_id: currentAdDbSheetId,
      productc_config_url: productcConfigUrl.trim() || null,
      images: images.filter((img) => img.file || img.url),
      referenceImages: referenceImages.filter((img) => img.file || img.url),
      comparisonBrands: comparisonBrands.filter((comp) => comp.file || comp.url),
      driveLinks: [
        { funnel_type: "onbrand", drive_link: driveLinks.onbrand },
        { funnel_type: "comparison", drive_link: driveLinks.comparison },
        { funnel_type: "tsl", drive_link: driveLinks.tsl },
        { funnel_type: "adv", drive_link: driveLinks.adv },
        { funnel_type: "productFolder", drive_link: driveLinks.productFolder },
        { funnel_type: "tslScript", drive_link: driveLinks.tslScript },
      ],
    };

    try {
      let savedId: string | undefined = product?.id;
      if (isEditing) {
        await updateProduct.mutateAsync({ id: product.id, ...formData });
      } else {
        const res: any = await createProduct.mutateAsync(formData);
        savedId = res?.data?.id ?? res?.id ?? res?.data?.product?.id ?? savedId;
      }

      // The Top-5 comparison overlay image isn't part of the pipeline API
      // payload, so persist it straight to the products row (same approach the
      // ads-launcher product editor uses). Best-effort — never blocks the save.
      if (savedId) {
        try {
          let top5Url: string | null = top5Image.url?.trim() || null;
          if (top5Image.file) {
            const ext = (top5Image.file.name.split(".").pop() || "png").toLowerCase();
            const path = `top5-comparison/${savedId}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("product-images")
              .upload(path, top5Image.file, { upsert: true, contentType: top5Image.file.type || undefined });
            if (upErr) throw upErr;
            top5Url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
          }
          await supabase.from("products").update({ top_5_comparison_image: top5Url }).eq("id", savedId);
        } catch (e: any) {
          toast.error(`Saved product, but couldn't save the Top-5 comparison image: ${e?.message || e}`);
        }
      }

      onOpenChange(false);
    } catch {
      // Error handled in hook
    }
  };

  const addImage = () => {
    setImages([...images, { explanation: "" }]);
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const updateImage = (index: number, updates: Partial<ImageWithExplanation>) => {
    const newImages = [...images];
    newImages[index] = { ...newImages[index], ...updates };
    setImages(newImages);
  };

  const handleImageFileChange = (index: number, file: File | null) => {
    if (file) {
      const preview = URL.createObjectURL(file);
      updateImage(index, { file, preview, url: undefined });
    }
  };

  const addReferenceImage = () => {
    setReferenceImages([...referenceImages, { explanation: "" }]);
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const updateReferenceImage = (index: number, updates: Partial<ImageWithExplanation>) => {
    const next = [...referenceImages];
    next[index] = { ...next[index], ...updates };
    setReferenceImages(next);
  };

  const handleReferenceImageFileChange = (index: number, file: File | null) => {
    if (file) {
      const preview = URL.createObjectURL(file);
      updateReferenceImage(index, { file, preview, url: undefined });
    }
  };

  const handleTop5FileChange = (file: File | null) => {
    if (file) setTop5Image({ file, preview: URL.createObjectURL(file) });
  };

  const handleComparisonFileChange = (index: number, file: File | null) => {
    if (file) {
      const preview = URL.createObjectURL(file);
      const newComparisons = [...comparisonBrands];
      newComparisons[index] = { ...newComparisons[index], file, preview, url: undefined };
      setComparisonBrands(newComparisons);
    }
  };

  const updateComparisonBrand = (index: number, brand_name: string) => {
    const newComparisons = [...comparisonBrands];
    newComparisons[index] = { ...newComparisons[index], brand_name };
    setComparisonBrands(newComparisons);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val && isGeneratingBrief) return;
          onOpenChange(val);
        }}
      >
        <DialogContent
          className="sm:max-w-[700px] flex flex-col h-[90vh] p-0"
          onInteractOutside={(e) => { if (isGeneratingBrief) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isGeneratingBrief) e.preventDefault(); }}
        >
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
            <DialogTitle>{isEditing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">

              {/* Brand Select */}
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands?.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter product name"
                />
              </div>

              {/* Product Code */}
              <div className="space-y-2">
                <Label htmlFor="productCode">Product Code *</Label>
                <Input
                  id="productCode"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="e.g. GLP, DOP, PARA"
                />
              </div>

              {/* Product Config URL (GitHub) */}
              <div className="space-y-2">
                <Label htmlFor="productcConfigUrl">Product Config URL</Label>
                <Input
                  id="productcConfigUrl"
                  value={productcConfigUrl}
                  onChange={(e) => setProductcConfigUrl(e.target.value)}
                  placeholder="https://github.com/Acentecom/product-configs/tree/main/<slug>"
                />
                <p className="text-xs text-muted-foreground">
                  Required to make this product available in the UGC script generator and video ads builder.
                </p>
              </div>

              {/* Docs Knowledge File Link */}
              <div className="space-y-2">
                <Label htmlFor="docsLink">
                  Docs Knowledge File <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="docsLink"
                    value={docsLink}
                    onChange={(e) => setDocsLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => docsLink && window.open(docsLink, "_blank", "noopener,noreferrer")}
                    disabled={!docsLink}
                    title="Open link in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                {/* Generate Brief controls */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Button
                    type="button"
                    onClick={handleGenerateBrief}
                    disabled={!docsLink.trim() || isGeneratingBrief}
                    className="gap-2"
                  >
                    {isGeneratingBrief ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Brief...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Brief
                      </>
                    )}
                  </Button>
                  {productBrief && (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setBriefDraft(productBrief);
                        setBriefEditorOpen(true);
                      }}
                    >
                      <FileText className="w-4 h-4" />
                      View Brief
                    </Button>
                  )}
                  {productBrief && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Brief ready
                    </span>
                  )}
                </div>
              </div>

              {/* Drive Links */}
              <div className="space-y-4">
                {/* Generated Images Drive Links */}
                <div className="space-y-3">
                  <Label>Generated Images Drive Links (per funnel) <span className="text-destructive">*</span></Label>
                  {(["onbrand", "comparison", "tsl", "adv"] as const).map((funnelType) => (
                    <div key={funnelType} className="space-y-1">
                      <Label htmlFor={`driveLink-${funnelType}`} className="text-xs text-muted-foreground capitalize">{funnelType}</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`driveLink-${funnelType}`}
                          value={driveLinks[funnelType]}
                          onChange={(e) => setDriveLinks((prev) => ({ ...prev, [funnelType]: e.target.value }))}
                          placeholder="https://drive.google.com/..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => driveLinks[funnelType] && window.open(driveLinks[funnelType], "_blank", "noopener,noreferrer")}
                          disabled={!driveLinks[funnelType]}
                          title="Open link in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Product Folder and TSL Script Drive Links */}
                <div className="space-y-3">
                  <Label>Required Drive Links <span className="text-destructive">*</span></Label>
                  {(["productFolder", "tslScript"] as const).map((linkType) => (
                    <div key={linkType} className="space-y-1">
                      <Label htmlFor={`driveLink-${linkType}`} className="text-xs text-muted-foreground">
                        {linkType === "productFolder" ? "Product Folder" : "TSL Script"}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={`driveLink-${linkType}`}
                          value={driveLinks[linkType]}
                          onChange={(e) => setDriveLinks((prev) => ({ ...prev, [linkType]: e.target.value }))}
                          placeholder="https://drive.google.com/..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => driveLinks[linkType] && window.open(driveLinks[linkType], "_blank", "noopener,noreferrer")}
                          disabled={!driveLinks[linkType]}
                          title="Open link in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product Images with Explanations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Product Images + Explanation</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addImage}>
                    <Plus className="w-4 h-4 mr-1" /> Add Image
                  </Button>
                </div>
                <div className="space-y-3">
                  {images.map((img, index) => (
                    <div key={index} className="flex gap-3 p-3 border rounded-lg">
                      <div className="flex flex-col gap-2">
                        {img.preview ? (
                          <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded" />
                        ) : (
                          <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                            <Image className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileChange(index, e.target.files?.[0] || null)}
                          className="w-24 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Textarea
                          value={img.explanation}
                          onChange={(e) => updateImage(index, { explanation: e.target.value })}
                          placeholder="e.g., 'This is the patch itself' or 'Patch on woman's shoulder'"
                          className="h-20"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeImage(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {images.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No images added yet. Click "Add Image" to add product images with context.
                    </p>
                  )}
                </div>
              </div>

              {/* Reference example images — real holding photos, separate from product images */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Reference Examples (real holding photos)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addReferenceImage}>
                    <Plus className="w-4 h-4 mr-1" /> Add Reference
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Real photos of people holding this product — used as grip/size references for
                  AI generation. Kept separate from the product images above.
                </p>
                <div className="space-y-3">
                  {referenceImages.map((img, index) => (
                    <div key={index} className="flex gap-3 p-3 border rounded-lg">
                      <div className="flex flex-col gap-2">
                        {img.preview ? (
                          <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded" />
                        ) : (
                          <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                            <Image className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleReferenceImageFileChange(index, e.target.files?.[0] || null)}
                          className="w-24 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Textarea
                          value={img.explanation}
                          onChange={(e) => updateReferenceImage(index, { explanation: e.target.value })}
                          placeholder="e.g., 'Creator holding the pouch at chest height, thumb on front'"
                          className="h-20"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeReferenceImage(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {referenceImages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No reference examples yet. Click "Add Reference" to add real holding photos.
                    </p>
                  )}
                </div>
              </div>

              {/* Guidelines */}
              <div className="space-y-2">
                <Label htmlFor="guidelines">Guidelines</Label>
                <Textarea
                  id="guidelines"
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                  placeholder="Enter any notes or guidelines..."
                  className="min-h-[100px]"
                />
              </div>

              {/* Publisher */}
              <div className="space-y-2">
                <Label>Publisher</Label>
                <Select value={publisherId} onValueChange={setPublisherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select publisher" />
                  </SelectTrigger>
                  <SelectContent>
                    {publishers?.map((pub) => (
                      <SelectItem key={pub.id} value={pub.id}>
                        {pub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Top 5 Comparison overlay image (single card) */}
              <div className="space-y-2">
                <Label>Top 5 Comparison Image (overlay card)</Label>
                <p className="text-xs text-muted-foreground">
                  Shown as an on-screen card during the ranking line in Top-5 comparison (TOF/BOF) video scripts.
                  Appears when the trigger line is spoken and disappears after.
                </p>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {top5Image.preview ? (
                    <img src={top5Image.preview} alt="" className="w-16 h-16 object-contain rounded bg-muted" />
                  ) : (
                    <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                      <Image className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleTop5FileChange(e.target.files?.[0] || null)}
                    className="w-40 text-xs"
                  />
                  <Input
                    value={top5Image.url ?? ""}
                    onChange={(e) => setTop5Image({ url: e.target.value, preview: e.target.value })}
                    placeholder="…or paste an image URL"
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Top 5 Brands for Comparison */}
              <div className="space-y-2">
                <Label>Top 5 Brands (for comparison)</Label>
                <div className="grid grid-cols-1 gap-3">
                  {comparisonBrands.map((comp, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                      <span className="text-sm font-medium w-6">{index + 1}.</span>
                      {comp.preview ? (
                        <img src={comp.preview} alt="" className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                          <Image className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleComparisonFileChange(index, e.target.files?.[0] || null)}
                        className="w-32 text-xs"
                      />
                      <Input
                        value={comp.brand_name}
                        onChange={(e) => updateComparisonBrand(index, e.target.value)}
                        placeholder="Brand name"
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Fixed footer */}
          <div className="shrink-0 px-6 py-4 border-t bg-background flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGeneratingBrief}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createProduct.isPending || updateProduct.isPending || isGeneratingBrief}
            >
              {createProduct.isPending || updateProduct.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {createProduct.isPending || updateProduct.isPending ? "Processing..." : `${isEditing ? "Update" : "Add"} Product`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Brief editor popup */}
      <Dialog open={briefEditorOpen} onOpenChange={setBriefEditorOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Product Brief</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Review and edit the generated brief, then confirm to save it.
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg">
            <RichTextEditor
              content={briefDraft}
              onChange={setBriefDraft}
              placeholder="Brief content..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setBriefEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setProductBrief(briefDraft);
                setBriefEditorOpen(false);
              }}
            >
              Confirm &amp; Save Brief
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
