import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useBrands } from "@/hooks/useBrands";
import { useFilteredBrands } from "@/hooks/useFilteredBrands";
import { useProducts, Product } from "@/hooks/useProducts";
import { useFormTemplates, useCreateFormTemplate, FormTemplateFormData } from "@/hooks/useFormTemplates";
import { useAuth } from "@/hooks/useAuth";
import { userHasBrandAccess } from "@/lib/brandAccess";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TemplateDialog } from "@/components/templates/TemplateDialog";
import {
  Wand2,
  Loader2,
  ImageIcon,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  ArrowLeft,
  Send,
  Tag,
  Sparkles,
  ClipboardList,
  Palette,
  LayoutTemplate,
  Layers,
  FileText,
  Type,
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const BRAND_COLOR = "#3C83F6";

const driveProxySrc = (driveUrl: string): string => {
  try {
    const fileId = new URL(driveUrl).searchParams.get("id");
    if (fileId) return `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}`;
  } catch {
    /* fall through */
  }
  return driveUrl;
};

const driveProxySrcFull = (driveUrl: string): string => {
  if (driveUrl.includes("drive-proxy-image")) {
    if (driveUrl.includes("full=true")) return driveUrl;
    return driveUrl + "&full=true";
  }
  try {
    const fileId = new URL(driveUrl).searchParams.get("id");
    if (fileId)
      return `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}&full=true`;
  } catch {
    /* fall through */
  }
  return driveUrl;
};

const Field = ({
  label,
  required,
  icon: Icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ElementType;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      {label}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const Section = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
    <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 bg-muted/50">
      {Icon && (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${BRAND_COLOR}18` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: BRAND_COLOR }} />
        </div>
      )}
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
    <div className="p-5 space-y-4">{children}</div>
  </div>
);

const styledTrigger = "h-10 rounded-lg border-border bg-muted/50 text-foreground text-sm transition-colors";
const styledInput = "h-10 rounded-lg border-border bg-muted/50 text-foreground text-sm transition-colors";

const TSLGeneratorForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [stage, setStage] = useState<"stage1" | "stage2">("stage1");

  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [numberOfImages, setNumberOfImages] = useState("");
  const [designElements, setDesignElements] = useState("");

  const [referencePreviewUrls, setReferencePreviewUrls] = useState<string[]>([]);
  const [referenceBase64s, setReferenceBase64s] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [generatedImageFileIds, setGeneratedImageFileIds] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [approvedImages, setApprovedImages] = useState<{ url: string; fileId: string }[]>([]);
  const [confirmedApprovedImages, setConfirmedApprovedImages] = useState<{ url: string; fileId: string }[]>([]);
  const [downloadingImageUrl, setDownloadingImageUrl] = useState<string | null>(null);

  const [sliderOpen, setSliderOpen] = useState(false);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [sliderLoading, setSliderLoading] = useState(false);
  const [sliderSource, setSliderSource] = useState<"generated" | "approved">("generated");

  // Stage 2 fields
  const [maxVariationsPerAdGroup, setMaxVariationsPerAdGroup] = useState("");
  const [funnel, setFunnel] = useState("TSL");
  const [cs, setCs] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // TSL Script ID dialog
  const [tslScriptDialogOpen, setTslScriptDialogOpen] = useState(false);
  const [tslScriptOption, setTslScriptOption] = useState<"without" | "with">("without");
  const [tslScriptId, setTslScriptId] = useState("");

  const queryClient = useQueryClient();
  const createTemplateMutation = useCreateFormTemplate();
  const { user } = useAuth();

  const { data: brands = [], isLoading: brandsLoading } = useFilteredBrands();
  const { products = [], isLoading: productsLoading } = useProducts();
  const [allCsConfigs, setAllCsConfigs] = useState<Array<{ id: string; label: string; value: string }>>([]);
  const [csConfigLoading, setCsConfigLoading] = useState(false);

  // Fetch all CS configs once
  useEffect(() => {
    setCsConfigLoading(true);
    supabase.from('cs_config').select('id, label, value').order('label').then(({ data }) => {
      setAllCsConfigs((data as any) || []);
      setCsConfigLoading(false);
    });
  }, []);

  // Filter CS configs based on selected brand (same logic as CreateVideos)
  const csConfig = useMemo(() => {
    const selectedBrand = brands.find((b) => b.id === selectedBrandId);
    if (!selectedBrand) return [];

    const mainAndSecondaryEmails = [
      ...(selectedBrand.main_cs || []),
      ...(selectedBrand.secondary_cs || []),
    ];

    if (mainAndSecondaryEmails.length === 0) return [];

    return allCsConfigs.filter((cs) =>
      mainAndSecondaryEmails.some(
        (email) => cs.value?.toLowerCase().trim() === email.toLowerCase().trim()
      )
    );
  }, [selectedBrandId, brands, allCsConfigs]);

  const { data: allTslTemplates = [], isLoading: templatesLoading } = useFormTemplates("TSL");

  // Filter templates to show only from user's assigned brands
  const tslTemplates = allTslTemplates.filter(
    t => userHasBrandAccess(user, t.brand_id, { emptyMeansAll: true })
  );

  const filteredProducts = products.filter((p: Product) => p.brand_id === selectedBrandId);
  const isFieldDisabled = !!selectedTemplateId && !isEditingTemplate;

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === "__create_new") {
      setTemplateDialogOpen(true);
      return;
    }
    if (templateId === "__none") {
      setSelectedTemplateId("");
      setIsEditingTemplate(false);
      return;
    }
    const template = tslTemplates.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplateId(templateId);
      setIsEditingTemplate(false);
      if (template.brand_id) setSelectedBrandId(template.brand_id);
      if (template.product_id) setSelectedProductId(template.product_id);
      if (template.concept_name) setConceptName(template.concept_name);
      if (template.design_elements) setDesignElements(template.design_elements);
      if (template.number_of_ads) setNumberOfImages(template.number_of_ads);
      if (template.max_variations_per_ad_group) setMaxVariationsPerAdGroup(template.max_variations_per_ad_group);
    }
  };

  const handleEditTemplateToggle = (v: boolean) => {
    if (v) {
      setSelectedTemplateId("");
    }
    setIsEditingTemplate(v);
  };

  const handleNewTemplateSubmit = (formData: FormTemplateFormData) => {
    createTemplateMutation.mutate(formData, {
      onSuccess: async (t) => {
        setTemplateDialogOpen(false);
        await queryClient.invalidateQueries({ queryKey: ["form_templates"] });
        setSelectedTemplateId(t.id);
        setIsEditingTemplate(false);
        if (t.brand_id) setSelectedBrandId(t.brand_id);
        if (t.product_id) setSelectedProductId(t.product_id);
        if (t.concept_name) setConceptName(t.concept_name);
        if (t.design_elements) setDesignElements(t.design_elements);
        if (t.number_of_ads) setNumberOfImages(t.number_of_ads);
        if (t.max_variations_per_ad_group) setMaxVariationsPerAdGroup(t.max_variations_per_ad_group);
        toast({ title: "Template created and applied successfully" });
      },
    });
  };

  // Keyboard handler for slider navigation
  const keyboardHandlerRef = useRef<(e: KeyboardEvent) => void>();
  useEffect(() => {
    const sliderImages =
      sliderSource === "generated" ? generatedImages : approvedImages.map((a) => a.url);
    keyboardHandlerRef.current = (e: KeyboardEvent) => {
      if (!sliderOpen || sliderImages.length === 0) return;
      if (e.key === "Escape") {
        setSliderOpen(false);
      } else if (e.key === "ArrowLeft") {
        setSliderIndex((i) => Math.max(i - 1, 0));
        setSliderLoading(true);
      } else if (e.key === "ArrowRight") {
        setSliderIndex((i) => Math.min(i + 1, sliderImages.length - 1));
        setSliderLoading(true);
      }
    };
  }, [sliderOpen, generatedImages, approvedImages, sliderSource]);

  useEffect(() => {
    const handler = keyboardHandlerRef.current;
    if (!handler) return;
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Populate Stage-1 from Pipeline Log or Template if navigated from StaticsGenerator
  useEffect(() => {
    const log = (location.state as any)?.fromLog;
    const template = (location.state as any)?.fromTemplate;
    const source = log || template;
    if (!source) return;
    if (source.brand_id) setSelectedBrandId(source.brand_id);
    if (source.product_id) setSelectedProductId(source.product_id);
    if (source.concept_name) setConceptName(source.concept_name);
    if (source.design_elements) setDesignElements(source.design_elements);
    if (source.number_of_ads) setNumberOfImages(source.number_of_ads);
    // Set template ID if available (from template or from log)
    const templateId = template?.id || log?.template_id;
    if (templateId) {
      setSelectedTemplateId(templateId);
      setIsEditingTemplate(false);
    }
    // Clear location state so a page refresh doesn't re-apply it
    window.history.replaceState({}, document.title);
  }, []);

  const handleReferenceFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setReferencePreviewUrls([]);
    setReferenceBase64s([]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setReferencePreviewUrls((prev) => [...prev, dataUrl]);
        setReferenceBase64s((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!selectedBrandId) {
      toast({ title: "Error", description: "Please select a brand", variant: "destructive" });
      return;
    }

    if (!selectedProductId) {
      toast({ title: "Error", description: "Please select a product", variant: "destructive" });
      return;
    }

    if (!conceptName.trim() || !designElements.trim()) {
      toast({ title: "Error", description: "Please fill in Concept Name and Design Elements", variant: "destructive" });
      return;
    }

    if (referenceBase64s.length === 0) {
      toast({ title: "Error", description: "Please upload at least one reference image", variant: "destructive" });
      return;
    }

    if (!numberOfImages.trim()) {
      toast({ title: "Error", description: "Please enter number of images to generate", variant: "destructive" });
      return;
    }

    setGeneratedImages([]);
    setGeneratedImageFileIds([]);
    setSelectedImages([]);

    setIsGenerating(true);

    try {
      const count = Math.max(parseInt(numberOfImages || "1") || 1, 1);
      const formData = new FormData();
      formData.append("prompt_for_images", designElements);
      formData.append("count", count.toString());
      formData.append("concept", conceptName);

      // Add reference images as files
      if (fileInputRef.current?.files) {
        Array.from(fileInputRef.current.files).forEach((file) => {
          formData.append("images", file);
        });
      }

      const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/generate-tsl-images`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`API error: ${response.statusText}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Image generation failed");

      const imageData: { index: number; fileName: string; fileId: string; url?: string }[] =
        result.data?.images || [];
      const images: string[] = imageData.map((img) => {
        if (img.fileId) return `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(img.fileId)}`;
        if (img.url) return img.url;
        return "";
      }).filter(Boolean);

      images.forEach((url) => {
        setGeneratedImages((prev) => [...prev, url]);
      });
      imageData.forEach((img) => {
        if (img.fileId) {
          setGeneratedImageFileIds((prev) => [...prev, img.fileId]);
        }
      });

      if (images.length === 0) {
        toast({ title: "Error", description: "No images were generated. Please try again.", variant: "destructive" });
      } else {
        toast({ title: "Success", description: `Generated ${images.length} image${images.length !== 1 ? "s" : ""}`, variant: "default" });
        // Clear reference images after successful generation
        setReferencePreviewUrls([]);
        setReferenceBase64s([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate images", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageToggle = (url: string) => {
    setSelectedImages((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleApproveSelected = () => {
    const toApprove = selectedImages.map((url) => {
      const idx = generatedImages.indexOf(url);
      return { url, fileId: generatedImageFileIds[idx] ?? "" };
    });
    setApprovedImages((prev) => [...prev, ...toApprove]);
    setSelectedImages([]);
  };

  const handleDownloadApproved = async (img: { url: string; fileId: string }, index: number) => {
    try {
      setDownloadingImageUrl(img.url);
      const fullUrl = driveProxySrcFull(img.url);
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `approved_image_${index + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to download image", variant: "destructive" });
    } finally {
      setDownloadingImageUrl(null);
    }
  };

  const handleRemoveApprovedImage = (urlToRemove: string) => {
    setApprovedImages((prev) => {
      const updated = prev.filter((img) => img.url !== urlToRemove);
      // If removing from slider view, adjust index or close slider
      if (sliderSource === "approved" && sliderOpen) {
        if (updated.length === 0) {
          setSliderOpen(false);
        } else if (sliderIndex >= updated.length) {
          setSliderIndex(Math.max(0, updated.length - 1));
        }
      }
      return updated;
    });
  };

  const openSlider = (source: "generated" | "approved", index: number) => {
    setSliderSource(source);
    setSliderIndex(index);
    setSliderLoading(true);
    setSliderOpen(true);
  };

  const sliderImages =
    sliderSource === "generated" ? generatedImages : approvedImages.map((a) => a.url);

  const handleProceedToStage2 = () => {
    setConfirmedApprovedImages(approvedImages);
    setStage("stage2");
  };

  const handleClear = () => {
    setSelectedBrandId("");
    setSelectedProductId("");
    setConceptName("");
    setNumberOfImages("");
    setDesignElements("");
    setSelectedTemplateId("");
    setIsEditingTemplate(false);
    setReferencePreviewUrls([]);
    setReferenceBase64s([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setGeneratedImages([]);
    setGeneratedImageFileIds([]);
    setSelectedImages([]);
    setApprovedImages([]);
  };

  const handleSubmitClick = () => {
    if (!cs.trim()) {
      toast({ title: "Error", description: "Please select a CS", variant: "destructive" });
      return;
    }

    if (!conceptName.trim()) {
      toast({ title: "Error", description: "Please fill in Concept Name", variant: "destructive" });
      return;
    }

    if (!maxVariationsPerAdGroup) {
      toast({ title: "Error", description: "Please set Ads per Ad Set", variant: "destructive" });
      return;
    }

    setTslScriptOption("without");
    setTslScriptId("");
    setTslScriptDialogOpen(true);
  };

  const handleTslScriptSubmit = async () => {
    if (tslScriptOption === "with" && !tslScriptId.trim()) {
      toast({ title: "Error", description: "Please enter a TSL Script ID", variant: "destructive" });
      return;
    }

    setTslScriptDialogOpen(false);
    setIsSubmitting(true);
    try {
      const brd = brands.find((b) => b.id === selectedBrandId);
      const prd = products.find((p: Product) => p.id === selectedProductId);
      const tslDriveLink = prd?.product_drive_links?.find((dl) => dl.funnel_type.toLowerCase() === "tsl")?.drive_link;

      const response = await fetch(`${import.meta.env.VITE_PIPELINE_API_BASE_URL}/api/submit-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_drive_link: tslDriveLink || null,
          brand_code: brd?.brand_code || "",
          product_code: prd?.product_code || "",
          brand_id: selectedBrandId || null,
          brand_name: brd?.name || "",
          product_id: selectedProductId || null,
          product_name: prd?.name || "",
          funnel: funnel || "TSL",
          cs: cs || null,
          concept_name: conceptName || null,
          selected_images: confirmedApprovedImages.map((img) => img.url),
          gdrive_file_ids: confirmedApprovedImages.length > 0 ? confirmedApprovedImages.map((img) => img.fileId) : undefined,
          ads_per_set: parseInt(maxVariationsPerAdGroup || "1") || 1,
          total_ads: confirmedApprovedImages.length,
          prompt: designElements || null,
          task_description: taskDescription || null,
          inspo_links: [],
          title: null,
          subtitle: null,
          design_elements: designElements || null,
          is_multiple: false,
          is_cta_button: false,
          cta_button_text: null,
          is_badge: false,
          badge_text: null,
          products_to_show: null,
          file_naming_convention: null,
          docs_file_url: prd?.docs_file_url || null,
          prompt_for_images: null,
          template_id: selectedTemplateId || null,
          isTslScriptId: tslScriptOption === "with",
          tslScriptId: tslScriptOption === "with" ? tslScriptId : null,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.message || `Request failed with status ${response.status}`);
      }

      const data: { success: boolean; generation_id: string; ad_groups: { ad_id: string; group_number: number }[] } =
        await response.json();

      if (!data.success) {
        throw new Error("Pipeline submission was not successful");
      }
      const groupCount = data?.ad_groups?.length || 0;
      toast({ title: "Success", description: `${groupCount} ad group(s) submitted to pipeline.` });
      queryClient.invalidateQueries({ queryKey: ["form_templates"] });

      // Clear all Stage 1 fields
      setSelectedBrandId("");
      setSelectedProductId("");
      setConceptName("");
      setNumberOfImages("");
      setDesignElements("");
      setSelectedTemplateId("");
      setIsEditingTemplate(false);
      setReferencePreviewUrls([]);
      setReferenceBase64s([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setGeneratedImages([]);
      setGeneratedImageFileIds([]);
      setSelectedImages([]);
      setApprovedImages([]);
      setConfirmedApprovedImages([]);

      // Clear all Stage 2 fields
      setMaxVariationsPerAdGroup("");
      setFunnel("TSL");
      setCs("");
      setTaskDescription("");

      setStage("stage1");

      // Redirect to Pipeline Log after API success is confirmed
      navigate("/pipeline-log");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to submit pipeline", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Stage tabs */}
      <div className="shrink-0 border-b border-border bg-card px-5">
        <div className="flex items-center gap-8">
          {(["stage1", "stage2"] as const).map((s, idx) => {
            const isStage2Locked = s === "stage2" && confirmedApprovedImages.length === 0;
            return (
              <button
                key={s}
                onClick={() => !isStage2Locked && setStage(s)}
                disabled={isStage2Locked}
                title={isStage2Locked ? "Approve images in Stage 1 to unlock" : undefined}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  stage === s
                    ? "border-primary text-primary"
                    : isStage2Locked
                      ? "border-transparent text-muted-foreground/40 cursor-not-allowed"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {idx === 0 ? "Stage 1 – Generate" : "Stage 2 – Pipeline Request"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage 1 content */}
      {stage === "stage1" && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Core fields */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <Field label="Brand" required>
                    <Select value={selectedBrandId} onValueChange={setSelectedBrandId} disabled={isFieldDisabled}>
                      <SelectTrigger className={styledTrigger}>
                        <SelectValue placeholder={brandsLoading ? "Loading…" : "Select brand"} />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Product" required>
                    <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedBrandId || isFieldDisabled}>
                      <SelectTrigger className={styledTrigger}>
                        <SelectValue placeholder={!selectedBrandId ? "Select a brand first" : productsLoading ? "Loading…" : "Select product"} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProducts.map((p: Product) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Concept Name" required icon={Tag}>
                    <Input
                      className={styledInput}
                      disabled={isFieldDisabled}
                      value={conceptName}
                      onChange={(e) => setConceptName(e.target.value)}
                      placeholder="e.g. Summer Glow"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Number of Images" required>
                    <Input
                      className={styledInput}
                      type="number"
                      min="1"
                      disabled={isFieldDisabled}
                      value={numberOfImages}
                      onChange={(e) => setNumberOfImages(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </Field>
                </div>
              </div>

              {/* Template */}
              <Section title="Template" icon={LayoutTemplate}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex-1 w-full">
                    <Select value={selectedTemplateId || "__none"} onValueChange={handleTemplateSelect}>
                      <SelectTrigger className={styledTrigger}>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {tslTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__create_new">+ Create New Template</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedTemplateId && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        id="editTpl"
                        checked={isEditingTemplate}
                        onCheckedChange={handleEditTemplateToggle}
                      />
                      <Label htmlFor="editTpl" className="text-sm text-muted-foreground cursor-pointer">
                        Edit fields
                      </Label>
                    </div>
                  )}
                </div>
              </Section>

              {/* Ad Creative */}
              <Section title="Ad Creative" icon={Palette}>
                <Field label="Design Elements" required>
                  <Textarea
                    disabled={isFieldDisabled}
                    value={designElements}
                    onChange={(e) => setDesignElements(e.target.value)}
                    placeholder="Describe visual style, colors, layout…"
                    className="min-h-[80px] rounded-lg border-border bg-muted/50 text-sm resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </Field>
              </Section>

              {/* Reference Images */}
              <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 bg-muted/50">
                  {ImageIcon && (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${BRAND_COLOR}18` }}
                    >
                      <ImageIcon className="w-3.5 h-3.5" style={{ color: BRAND_COLOR }} />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    Reference Images
                    <span className="text-rose-500">*</span>
                  </span>
                </div>
                <div className="p-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleReferenceFilesChange}
                      className="hidden"
                      id="ref-upload"
                    />
                    <label
                      htmlFor="ref-upload"
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors text-sm font-medium text-foreground"
                    >
                      <Upload className="w-4 h-4" />
                      Click to upload reference images
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {referencePreviewUrls.length === 0 ? "No images selected" : `${referencePreviewUrls.length} image(s)`}
                    </span>
                  </div>

                  {referencePreviewUrls.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {referencePreviewUrls.map((url, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border border-border">
                          <img
                            src={url}
                            alt={`Reference ${i + 1}`}
                            className="w-full aspect-square object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

              {/* Generated Images */}
              {(generatedImages.length > 0 || isGenerating) && (
                <Section title="Generated Images" icon={ImageIcon}>
                  {isGenerating && generatedImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND_COLOR }} />
                      <p className="text-sm text-muted-foreground">Generating {numberOfImages} images…</p>
                    </div>
                  ) : (
                    <>
                      {isGenerating && generatedImages.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-3 border-b border-border">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: BRAND_COLOR }} />
                          <span>
                            {generatedImages.length} / {numberOfImages} generated…
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {generatedImages.map((url, i) => {
                          const isSel = selectedImages.includes(url);
                          return (
                            <div
                              key={url}
                              onClick={() => handleImageToggle(url)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                openSlider("generated", i);
                              }}
                              className="relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all group"
                              style={
                                isSel
                                  ? { borderColor: BRAND_COLOR, boxShadow: `0 0 0 3px ${BRAND_COLOR}25` }
                                  : { borderColor: "transparent" }
                              }
                            >
                              <img
                                src={driveProxySrc(url)}
                                alt={`Generated image ${i + 1}`}
                                className="w-full aspect-square object-cover"
                                loading="lazy"
                              />
                              <div
                                className={`absolute inset-0 transition-opacity ${
                                  isSel ? "bg-primary/10" : "bg-black/0 group-hover:bg-black/8"
                                }`}
                              />
                              <div className="absolute top-1.5 right-1.5">
                                <div
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isSel
                                      ? "bg-primary border-primary"
                                      : "bg-black/25 border-white/70 group-hover:border-white"
                                  }`}
                                >
                                  {isSel && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                      <path
                                        d="M2 6l3 3 5-5"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-xs text-muted-foreground">
                          {selectedImages.filter((u) => generatedImages.includes(u)).length} /{" "}
                          {generatedImages.length} selected
                        </p>
                        {selectedImages.length > 0 && (
                          <button
                            onClick={() => setSelectedImages([])}
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Clear selection
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </Section>
              )}

              {/* Approved Images Bank */}
              {approvedImages.length > 0 && (
                <Section title={`Approved Images (${approvedImages.length})`} icon={CheckCircle}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {approvedImages.map((img, i) => {
                      const isDownloading = downloadingImageUrl === img.url;
                      return (
                        <div
                          key={img.url}
                          className="relative rounded-xl overflow-hidden border-2 group"
                          style={{ borderColor: BRAND_COLOR, boxShadow: `0 0 0 3px ${BRAND_COLOR}25` }}
                        >
                          <img
                            src={driveProxySrc(img.url)}
                            alt={`Approved image ${i + 1}`}
                            className="w-full aspect-square object-cover cursor-pointer"
                            onDoubleClick={() => openSlider("approved", i)}
                            loading="lazy"
                          />
                          <button
                            onClick={() => handleRemoveApprovedImage(img.url)}
                            className="absolute top-1.5 left-1.5 p-2 rounded-lg bg-black/60 hover:bg-destructive/80 text-white transition-colors"
                            title="Remove image"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadApproved(img, i)}
                            disabled={isDownloading}
                            className="absolute top-1.5 right-1.5 p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors disabled:opacity-60"
                            title="Download image"
                          >
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>
          </div>

          {/* Stage 1 Footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 pb-10">
            <div className="flex items-center gap-3 py-4">
              {isGenerating && generatedImages.length === 0 ? (
                <>
                  <button disabled className="h-11 flex-1 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating…
                  </button>
                  <button
                    onClick={handleClear}
                    className="h-11 flex-1 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                </>
              ) : generatedImages.length === 0 ? (
                <>
                  <button
                    onClick={handleGenerate}
                    className="h-11 flex-1 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    style={{ background: BRAND_COLOR }}
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate Images
                  </button>
                  <button
                    onClick={handleClear}
                    className="h-11 flex-1 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                </>
              ) : (
                <>
                  {selectedImages.length > 0 && (
                    <button
                      onClick={handleApproveSelected}
                      className="h-11 flex-1 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                      style={{ background: BRAND_COLOR }}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve Selected ({selectedImages.length})
                    </button>
                  )}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="h-11 flex-1 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isGenerating ? "Generating…" : "Generate Again"}
                  </button>
                  {approvedImages.length > 0 && (
                    <button
                      onClick={handleProceedToStage2}
                      className="h-11 flex-1 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                      style={{ background: BRAND_COLOR }}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Proceed to Stage 2
                    </button>
                  )}
                  <button
                    onClick={handleClear}
                    className="h-11 flex-1 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Stage 2 content */}
      {stage === "stage2" && (
        <>
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left panel: Handoff form */}
            <div className="w-[450px] shrink-0 border-r border-border overflow-y-auto bg-card">
              <div className="p-5 space-y-4">
                {/* Submission context strip */}
                <div
                  className="rounded-xl p-4 space-y-3 border"
                  style={{ background: `${BRAND_COLOR}08`, borderColor: `${BRAND_COLOR}30` }}
                >
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Submission Context
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Product</p>
                      <p className="text-sm font-semibold text-foreground leading-snug">
                        {products.find((p) => p.id === selectedProductId)?.name ?? "—"}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Funnel</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-purple-50 text-purple-700 border-purple-200">
                        {funnel}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">CS</p>
                      <p className="text-xs font-medium text-foreground truncate">
                        {csConfig.find((c) => c.value === cs)?.label ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Handoff details card */}
                <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border bg-muted/50 flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${BRAND_COLOR}18` }}
                    >
                      <ClipboardList className="w-3.5 h-3.5" style={{ color: BRAND_COLOR }} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Uploader Handoff Details</span>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Brand — read-only */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Brand</label>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-sm font-medium text-foreground">
                          {brands.find((b) => b.id === selectedBrandId)?.name ?? "—"}
                        </span>
                      </div>
                    </div>

                    {/* Product — read-only */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product</label>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-sm font-medium text-foreground">
                          {products.find((p) => p.id === selectedProductId)?.name ?? "—"}
                        </span>
                      </div>
                    </div>

                    {/* Funnel — read-only */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Funnel</label>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-sm font-medium text-foreground">
                          {funnel || "TSL"}
                        </span>
                      </div>
                    </div>

                    {/* CS — Select from cs_config */}
                    <Field label="CS" required icon={FileText}>
                      <Select
                        value={cs}
                        onValueChange={setCs}
                      >
                        <SelectTrigger className={styledTrigger}>
                          <SelectValue placeholder="Select CS" />
                        </SelectTrigger>
                        <SelectContent>
                          {csConfig.map((item) => (
                            <SelectItem key={item.id} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    {/* Concept Name — editable */}
                    <Field label="Concept Name" required icon={Tag}>
                      <Input
                        className={styledInput}
                        value={conceptName}
                        onChange={(e) => setConceptName(e.target.value)}
                        placeholder="e.g. Summer Glow"
                      />
                    </Field>

                    {/* Ads per Ad Set — editable */}
                    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            Ads per Ad Set
                            <span className="text-rose-500">*</span>
                          </label>
                        </div>
                        <Input
                          className="w-16 h-9 text-center rounded-lg border-border bg-card text-sm font-semibold shrink-0"
                          type="number"
                          min="1"
                          value={maxVariationsPerAdGroup}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") { setMaxVariationsPerAdGroup(""); return; }
                            const n = Math.max(1, parseInt(raw) || 1);
                            setMaxVariationsPerAdGroup(String(n));
                          }}
                          onBlur={() => { if (!maxVariationsPerAdGroup) setMaxVariationsPerAdGroup("1"); }}
                          placeholder="—"
                        />
                      </div>
                      {confirmedApprovedImages.length > 0 && maxVariationsPerAdGroup && (() => {
                        const aps = Math.max(1, parseInt(maxVariationsPerAdGroup) || 1);
                        const total = confirmedApprovedImages.length;
                        const setCount = Math.ceil(total / aps);
                        return (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-foreground">
                              {total} images available, {aps} image{aps !== 1 ? "s" : ""} per set = {setCount} ad set{setCount !== 1 ? "s" : ""} with unique ad IDs.
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: setCount }, (_, i) => {
                                const start = i * aps;
                                const count = Math.min(aps, total - start);
                                return (
                                  <span
                                    key={i}
                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-card border border-border text-foreground hover:border-primary/50 hover:bg-primary/5 cursor-default transition-colors select-none"
                                  >
                                    Ad set {i + 1}: {count} image{count !== 1 ? "s" : ""}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* User Description — resizable textarea */}
                    <Field label="User Description" icon={Type}>
                      <Textarea
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Add notes for the uploader — optional"
                        className="min-h-[100px] rounded-lg border-border bg-muted/50 text-sm resize-y"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {/* Right panel: Selected images */}
            <div className="flex-1 overflow-y-auto bg-muted/20">
              <div className="p-6 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    Selected Approved Images
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {confirmedApprovedImages.length > 0
                      ? `These are the ${confirmedApprovedImages.length} image${confirmedApprovedImages.length !== 1 ? "s" : ""} that will be submitted to the pipeline.`
                      : "No images approved from Stage 1."}
                  </p>
                </div>

                {confirmedApprovedImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No images approved from Stage 1</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {confirmedApprovedImages.map((img, idx) => (
                      <div
                        key={img.url}
                        className="relative rounded-xl overflow-hidden border-2 transition-all group"
                        style={{ borderColor: BRAND_COLOR, boxShadow: `0 0 0 3px ${BRAND_COLOR}25` }}
                      >
                        <img
                          src={driveProxySrc(img.url)}
                          alt={`Image ${idx + 1}`}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                        <div className="absolute top-1.5 right-1.5">
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center bg-primary border-primary">
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2 6l3 3 5-5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stage 2 Footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 pb-10">
            <div className="flex items-center gap-3 py-4">
              <button
                onClick={() => setStage("stage1")}
                className="h-11 flex-1 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Stage 1
              </button>
              <button
                onClick={handleSubmitClick}
                disabled={isSubmitting || !cs.trim() || !conceptName.trim() || !maxVariationsPerAdGroup}
                className="h-11 flex-1 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: BRAND_COLOR }}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSubmitting ? "Submitting…" : "Submit to Pipeline"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Slider Dialog */}
      {sliderImages.length > 0 && sliderIndex < sliderImages.length && (
        <Dialog open={sliderOpen} onOpenChange={setSliderOpen}>
          <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !left-0 !top-0 !max-w-none w-screen h-screen rounded-none p-0 bg-black border-0 overflow-hidden flex items-center justify-center">
            <div
              className="relative flex items-center justify-center"
              style={{ maxHeight: "calc(100vh - 80px)", maxWidth: "calc(100vw - 120px)" }}
            >
              {sliderLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Loader2 className="w-20 h-20 animate-spin text-white/60" />
                </div>
              )}
              {sliderImages[sliderIndex] && (
                <img
                  key={sliderImages[sliderIndex]}
                  src={driveProxySrcFull(sliderImages[sliderIndex])}
                  alt={`Image ${sliderIndex + 1}`}
                  className={`object-contain max-w-full max-h-full transition-opacity duration-300 ${
                    sliderLoading ? "opacity-0" : "opacity-100"
                  }`}
                  style={{ maxHeight: "calc(100vh - 80px)", maxWidth: "calc(100vw - 120px)" }}
                  onLoad={() => {
                    setTimeout(() => setSliderLoading(false), 50);
                  }}
                  onError={() => setSliderLoading(false)}
                />
              )}
            </div>

            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 z-10">
              <div className="text-white/50 text-sm font-mono">
                {sliderIndex + 1} / {sliderImages.length}
              </div>
              <button
                onClick={() => setSliderOpen(false)}
                className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1.5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => {
                setSliderIndex((i) => Math.max(i - 1, 0));
                setSliderLoading(true);
              }}
              disabled={sliderIndex === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 disabled:opacity-20 rounded-full p-3 transition-colors z-10"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>

            <button
              onClick={() => {
                setSliderIndex((i) => Math.min(i + 1, sliderImages.length - 1));
                setSliderLoading(true);
              }}
              disabled={sliderIndex === sliderImages.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 disabled:opacity-20 rounded-full p-3 transition-colors z-10"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          </DialogContent>
        </Dialog>
      )}

      {/* TSL Script ID Dialog */}
      <Dialog open={tslScriptDialogOpen} onOpenChange={setTslScriptDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">TSL Script ID</h2>
              <p className="text-sm text-muted-foreground">Do you want to include a TSL Script ID with your submission?</p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {/* Without TSL Script ID */}
              <button
                onClick={() => setTslScriptOption("without")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  tslScriptOption === "without"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      tslScriptOption === "without"
                        ? "border-primary bg-primary"
                        : "border-border"
                    }`}
                  >
                    {tslScriptOption === "without" && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Without TSL Script ID</p>
                    <p className="text-xs text-muted-foreground mt-1">Submit pipeline without a script ID</p>
                  </div>
                </div>
              </button>

              {/* With TSL Script ID */}
              <button
                onClick={() => setTslScriptOption("with")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  tslScriptOption === "with"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      tslScriptOption === "with"
                        ? "border-primary bg-primary"
                        : "border-border"
                    }`}
                  >
                    {tslScriptOption === "with" && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">With TSL Script ID</p>
                    <p className="text-xs text-muted-foreground mt-1">Include a script ID with your submission</p>
                  </div>
                </div>
              </button>
            </div>

            {/* TSL Script ID Input */}
            {tslScriptOption === "with" && (
              <div className="space-y-2 p-4 rounded-xl bg-muted/40 border border-border">
                <Label htmlFor="tslScriptId" className="text-sm font-semibold">
                  TSL Script ID
                </Label>
                <Input
                  id="tslScriptId"
                  placeholder="Enter your TSL Script ID"
                  value={tslScriptId}
                  onChange={(e) => setTslScriptId(e.target.value)}
                  className="h-10 rounded-lg border-border bg-card text-sm"
                  autoFocus
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setTslScriptDialogOpen(false)}
                className="flex-1 h-10 rounded-xl border border-border bg-card text-muted-foreground text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTslScriptSubmit}
                disabled={isSubmitting}
                className="flex-1 h-10 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: BRAND_COLOR }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Pipeline
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={null}
        onSubmit={handleNewTemplateSubmit}
        isLoading={createTemplateMutation.isPending}
        defaultFunnel="TSL"
      />
    </div>
  );
};

export default TSLGeneratorForm;
