import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, getISOWeek } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useBrands } from "@/hooks/useBrands";
import { useFilteredBrands } from "@/hooks/useFilteredBrands";
import { useProducts, Product } from "@/hooks/useProducts";
import { useInspos } from "@/hooks/useInspos";
import { useAuth } from "@/hooks/useAuth";
import { userHasBrandAccess } from "@/lib/brandAccess";
import { useCreateStaticsLog, StaticsLog } from "@/hooks/useStaticsLogs";
import { useFormTemplates, useCreateFormTemplate, FormTemplateFormData, FormTemplate } from "@/hooks/useFormTemplates";
import { TemplateDialog } from "@/components/templates/TemplateDialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Wand2,
  Loader2,
  FileText,
  ExternalLink,
  Lightbulb,
  X,
  CheckCircle,
  Layers,
  Tag,
  Type,
  Palette,
  Link2,
  LayoutTemplate,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  Eye,
  ArrowLeft,
  Send,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Google Drive `uc?export=view` URLs don't serve CORS headers and redirect large files
// to an HTML warning page, so browsers can't render them in <img>. Route through the
// existing drive-proxy-image edge function instead.
const driveProxySrc = (driveUrl: string): string => {
  try {
    const fileId = new URL(driveUrl).searchParams.get("id");
    if (fileId) return `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}`;
  } catch { /* fall through */ }
  return driveUrl;
};

// Full-resolution version — passes full=true to skip the thumbnail path in the proxy
const driveProxySrcFull = (driveUrl?: string): string => {
  // Guard: a stale slider index can hand us undefined after the images array changes.
  if (!driveUrl) return "";
  // Already a proxy URL — just ensure full=true is appended
  if (driveUrl.includes("drive-proxy-image")) {
    if (driveUrl.includes("full=true")) return driveUrl;
    return driveUrl + "&full=true";
  }
  // Original Drive URL (has ?id=...)
  try {
    const fileId = new URL(driveUrl).searchParams.get("id");
    if (fileId) return `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}&full=true`;
  } catch { /* fall through */ }
  return driveUrl;
};

/** Extracts the folder ID from a Drive folder URL (https://drive.google.com/drive/folders/{id}) */
const extractDriveFolderId = (url: string): string | null => {
  const match = url?.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

type FunnelType = "Comparison" | "Onbrand" | "TSL" | "Adv";

interface SelectedImage {
  url: string;
  label: string;
  type: "product" | "comparison" | "publisher" | "brand";
}

export interface GeneratorFormProps {
  templateData?: StaticsLog | null;
  onTemplateUsed?: () => void;
  formTemplate?: FormTemplate | null;
  onSubmitted?: () => void;
}

const BRAND_COLOR = "#3C83F6";

// ── Field wrapper ────────────────────────────────────────────────────────────
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

// ── Section card ─────────────────────────────────────────────────────────────
const Section = ({
  title,
  icon: Icon,
  children,
  accent,
  required,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  accent?: string;
  required?: boolean;
}) => (
  <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
    <div className={`px-5 py-3.5 border-b border-border flex items-center gap-3 ${accent || "bg-muted/50"}`}>
      {Icon && (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${BRAND_COLOR}18` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: BRAND_COLOR }} />
        </div>
      )}
      <span className="text-sm font-semibold text-foreground">
        {title}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
    </div>
    <div className="p-5 space-y-4">{children}</div>
  </div>
);

const styledTrigger = "h-10 rounded-lg border-border bg-muted/50 text-foreground text-sm transition-colors";
const styledInput = "h-10 rounded-lg border-border bg-muted/50 text-foreground text-sm transition-colors";

// ── Utility functions for prompt variation building ──────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


const GeneratorForm = ({ templateData, onTemplateUsed, formTemplate, onSubmitted }: GeneratorFormProps) => {
  const [stage, setStage] = useState<"stage1" | "stage2">("stage1");
  const [funnel, setFunnel] = useState<FunnelType | "">("");
  // Image model for generation: gemini = current default flow, gpt = gpt-image-2 single-pass.
  const [imageModel, setImageModel] = useState<"gemini" | "gpt">("gemini");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [cs, setCs] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [selectedInspoIds, setSelectedInspoIds] = useState<string[]>([]);
  const [inspoMode, setInspoMode] = useState<"inspos" | "upload">("inspos");
  const [uploadedInspoFiles, setUploadedInspoFiles] = useState<File[]>([]);
  const [uploadedInspoPreviewUrls, setUploadedInspoPreviewUrls] = useState<string[]>([]);
  const uploadedInspoInputRef = useRef<HTMLInputElement>(null);
  const [generatedImagesDriveLink, setGeneratedImagesDriveLink] = useState("");
  const [adTitle, setAdTitle] = useState("");
  const [adSubtitle, setAdSubtitle] = useState("");
  const [designElements, setDesignElements] = useState("");
  const [promptForImages, setPromptForImages] = useState("");
  const [numberOfAds, setNumberOfAds] = useState("");
  const [maxVariationsPerAdGroup, setMaxVariationsPerAdGroup] = useState("10");

  const [ctaButton, setCtaButton] = useState(false);
  const [ctaButtonText, setCtaButtonText] = useState("");
  const [multipleAngles, setMultipleAngles] = useState(false);
  const [badge, setBadge] = useState(false);
  const [badgeText, setBadgeText] = useState("");
  const [productsToShow, setProductsToShow] = useState("5");
  const [customProductsCount, setCustomProductsCount] = useState("");
  const [fileNamingConvention, setFileNamingConvention] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState("");
  const [aiSelectedImages, setAiSelectedImages] = useState<string[]>([]);
  const [confirmedProductImages, setConfirmedProductImages] = useState<string[]>([]);
  const [confirmedGeneratedImages, setConfirmedGeneratedImages] = useState<string[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [comparisonImagesInitialized, setComparisonImagesInitialized] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [generatedImageFileIds, setGeneratedImageFileIds] = useState<string[]>([]);
  const [confirmedGeneratedFileIds, setConfirmedGeneratedFileIds] = useState<string[]>([]);
  const [selectedProductImageIds, setSelectedProductImageIds] = useState<string[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [briefViewOpen, setBriefViewOpen] = useState(false);
  const [viewBriefDraft, setViewBriefDraft] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  // ── Image slider popup (for generated images) ──────────────────────────
  const [sliderOpen, setSliderOpen] = useState(false);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [sliderLoading, setSliderLoading] = useState(false);

  // ── G-Drive source images (Stage 2) ─────────────────────────────────────
  const GDRIVE_SOURCE_FOLDER = "https://drive.google.com/drive/folders/1xLSqxD9lAbtZoV0kCG4znDIiYN2y9_QI";
  const [gdriveImages, setGdriveImages] = useState<{ id: string; name: string }[]>([]);
  const [isDriveImagesLoading, setIsDriveImagesLoading] = useState(false);

  const { data: brands = [], isLoading: brandsLoading } = useFilteredBrands();
  const { products = [], isLoading: productsLoading } = useProducts();
  const { inspos = [], isLoading: insposLoading } = useInspos();
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

  const filteredInspos = useMemo(
    () => (funnel ? inspos.filter((i) => i.funnel_type.some((ft) => ft.toLowerCase() === funnel.toLowerCase())) : inspos),
    [inspos, funnel],
  );
  const createLogMutation = useCreateStaticsLog();
  const createTemplateMutation = useCreateFormTemplate();
  const { data: allFunnelTemplates = [] } = useFormTemplates(funnel || undefined);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filter templates to show only user's assigned brand templates
  const funnelTemplates = useMemo(() => {
    return allFunnelTemplates.filter(t => userHasBrandAccess(user, t.brand_id, { emptyMeansAll: true }));
  }, [allFunnelTemplates, user]);

  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [pendingTemplateImages, setPendingTemplateImages] = useState<string[] | null>(null);
  const appliedTemplateIdRef = useRef<string | null>(null);
  const pendingTemplateIdRef = useRef<string | null>(null);
  const pendingTemplateMatchRef = useRef<StaticsLog | null>(null);
  const pendingDirectTemplateIdRef = useRef<string | null>(null);
  const fileNamingManuallyEditedRef = useRef(false);
  const templateJustAppliedRef = useRef(false);
  const templateApplyingRef = useRef(false);
  const prevFunnelRef = useRef(funnel);
  const prevBrandIdRef = useRef(selectedBrandId);

  // ── Load template data ───────────────────────────────────────────────────
  useEffect(() => {
    if (!templateData || productsLoading || brandsLoading || insposLoading) return;
    if (appliedTemplateIdRef.current === templateData.id) return;
    setIsLoadingTemplate(true);
    pendingTemplateIdRef.current = templateData.id;
    // If template_id was stored at submission time, defer restoration until funnelTemplates loads for correct funnel.
    // Otherwise, fall back to composite-key matching via pendingTemplateMatchRef.
    if (templateData.template_id) {
      pendingDirectTemplateIdRef.current = templateData.template_id;
    } else {
      pendingTemplateMatchRef.current = templateData;
    }
    const lower = templateData.funnel?.toLowerCase();
    let resolvedFunnel: FunnelType = "Onbrand";
    if (lower === "comparison") resolvedFunnel = "Comparison";
    else if (lower === "tsl") resolvedFunnel = "TSL";
    else if (lower === "adv") resolvedFunnel = "Adv";
    const resolvedBrandId = templateData.brand_id || brands.find((b) => b.name === templateData.brand_name)?.id || "";
    const resolvedProductId =
      templateData.product_id ||
      products.find((p: Product) => p.name === templateData.product_name && p.brand_id === resolvedBrandId)?.id ||
      "";
    const resolvedInspoIds = (templateData.inspo_links || [])
      .map((link) => inspos.find((i) => i.drive_link === link)?.id)
      .filter((id): id is string => !!id);
    setFunnel(resolvedFunnel);
    setSelectedBrandId(resolvedBrandId);
    setSelectedProductId(resolvedProductId);
    setCs(templateData.cs || "");
    setConceptName(templateData.concept_name || "");
    fileNamingManuallyEditedRef.current = false;
    setSelectedInspoIds(resolvedInspoIds);
    setPendingTemplateImages(templateData.selected_images || []);
    setAdTitle(templateData.title || "");
    setAdSubtitle(templateData.subtitle || "");
    setDesignElements(templateData.design_elements || "");

    setCtaButton(templateData.is_cta_button || false);
    setCtaButtonText(templateData.cta_button_text || "");
    setBadge(templateData.is_badge || false);
    setBadgeText(templateData.badge_text || "");
    setMultipleAngles(templateData.is_multiple || false);
    const rawPts = (templateData as any).products_to_show || "5";
    if (rawPts === "5" || rawPts === "5 Products") {
      setProductsToShow("5"); setCustomProductsCount("");
    } else if (rawPts === "0" || rawPts === "No products") {
      setProductsToShow("0"); setCustomProductsCount("");
    } else {
      setProductsToShow("other"); setCustomProductsCount(rawPts);
    }
    setNumberOfAds(templateData.number_of_ads || "");
    setMaxVariationsPerAdGroup(templateData.max_variations_per_ad_group || "10");
    setGeneratedImagesDriveLink(templateData.drive_link || "");
    setPromptForImages(templateData.prompt_for_images || "");
    if (templateData.prompt) {
      setEditablePrompt(templateData.prompt);
    }
  }, [templateData, productsLoading, brandsLoading, insposLoading, brands, products, inspos]);

  const keyboardHandlerRef = useRef<(e: KeyboardEvent) => void>();

useEffect(() => {
  if (!sliderOpen) {
    // Clean up when slider closes
    if (keyboardHandlerRef.current) {
      window.removeEventListener('keydown', keyboardHandlerRef.current);
      keyboardHandlerRef.current = undefined;
    }
    return;
  }

  // Define handler only once when slider opens
  if (!keyboardHandlerRef.current) {
    keyboardHandlerRef.current = (e: KeyboardEvent) => {
      let newIndex = sliderIndex; // Start with the current index

      if (e.key === "ArrowRight") {
        e.preventDefault();
        newIndex = Math.min(sliderIndex + 1, generatedImages.length - 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        newIndex = Math.max(sliderIndex - 1, 0);
      }
      if (e.key === "Escape") {
        setSliderOpen(false);
        return; // Exit early for Escape
      }

      // Only trigger loading and update if the index actually changed
      if (newIndex !== sliderIndex) {
        setSliderIndex(newIndex);
        setSliderLoading(true); // Only set loading if we're actually navigating
      }
    };

    window.addEventListener('keydown', keyboardHandlerRef.current);
  }

  // Clean up when component unmounts or slider closes
  return () => {
    if (keyboardHandlerRef.current) {
      window.removeEventListener('keydown', keyboardHandlerRef.current);
      keyboardHandlerRef.current = undefined;
    }
  };
}, [sliderOpen, generatedImages.length, sliderIndex]); // Added sliderIndex as dependency to ensure handler has current value

  // useEffect(() => {
  //   if (!sliderOpen) return;
  //   setSliderLoading(true); // reset loader on every slide change
  //   const handler = (e: KeyboardEvent) => {
  //     if (e.key === "ArrowRight") { setSliderIndex(i => Math.min(i + 1, generatedImages.length - 1)); setSliderLoading(true); }
  //     if (e.key === "ArrowLeft") { setSliderIndex(i => Math.max(i - 1, 0)); setSliderLoading(true); }
  //     if (e.key === "Escape") setSliderOpen(false);
  //   };
  //   window.addEventListener("keydown", handler);
  //   return () => window.removeEventListener("keydown", handler);
  // }, [sliderOpen, generatedImages.length]);

  // ── Load from FormTemplate (Generate from template flow) ─────────────────
  useEffect(() => {
    if (!formTemplate) return;
    // Sync the prevFunnelRef before state update so the funnel-change effect
    // below does NOT clear the inspo IDs we're about to set.
    prevFunnelRef.current = (formTemplate.funnel as FunnelType) || "";
    templateApplyingRef.current = true;
    setFunnel((formTemplate.funnel as FunnelType) || "");
    setSelectedBrandId(formTemplate.brand_id || "");
    setSelectedProductId(formTemplate.product_id || "");
    setSelectedTemplateId(formTemplate.id);
    setIsEditingTemplate(false);
    setCs(formTemplate.cs || "");
    setConceptName(formTemplate.concept_name || "");
    setAdTitle(formTemplate.title || "");
    setAdSubtitle(formTemplate.subtitle || "");
    setDesignElements(formTemplate.design_elements || "");
    setPromptForImages(formTemplate.prompt_for_images || "");
    setNumberOfAds(formTemplate.number_of_ads || "");
    setMaxVariationsPerAdGroup(formTemplate.max_variations_per_ad_group || "");
    setCtaButton(formTemplate.is_cta_button || false);
    setCtaButtonText(formTemplate.cta_button_text || "");
    setMultipleAngles(formTemplate.is_multiple || false);
    setBadge(formTemplate.is_badge || false);
    setBadgeText(formTemplate.badge_text || "");
    const pts = formTemplate.products_to_show || "5";
    if (pts === "5" || pts === "5 Products") { setProductsToShow("5"); setCustomProductsCount(""); }
    else if (pts === "0" || pts === "No products") { setProductsToShow("0"); setCustomProductsCount(""); }
    else { setProductsToShow("other"); setCustomProductsCount(pts); }
    setSelectedInspoIds(formTemplate.inspo_ids || []);
    setComparisonImagesInitialized(false);
    setTimeout(() => { templateApplyingRef.current = false; }, 0);
  }, [formTemplate]);

  // ── Match and restore template from StaticsLog ─────────────────────────
  useEffect(() => {
    if (!pendingDirectTemplateIdRef.current && !pendingTemplateMatchRef.current) return;
    if (funnelTemplates.length === 0) return;
    if (funnelTemplates[0]?.funnel !== funnel) return;  // wait for correct funnel's data

    // Path A: direct template_id (new records — after Bug 1 is fixed)
    if (pendingDirectTemplateIdRef.current) {
      const tid = pendingDirectTemplateIdRef.current;
      pendingDirectTemplateIdRef.current = null;
      if (funnelTemplates.some(t => t.id === tid)) {
        setSelectedTemplateId(tid);
        setIsEditingTemplate(false);
      }
      return;
    }

    // Path B: composite-key match (old records without template_id)
    const log = pendingTemplateMatchRef.current!;
    const match = funnelTemplates.find(t =>
      t.brand_id === log.brand_id &&
      t.product_id === log.product_id &&
      (t.concept_name || "") === (log.concept_name || "") &&
      (t.cs || "") === (log.cs || "")
    );
    if (match) {
      setSelectedTemplateId(match.id);
      setIsEditingTemplate(false);
    }
    pendingTemplateMatchRef.current = null;
  }, [funnelTemplates, funnel]);

  const filteredProducts = products.filter((p: Product) => p.brand_id === selectedBrandId);
  const selectedProduct = useMemo(
    () => products.find((p: Product) => p.id === selectedProductId),
    [products, selectedProductId],
  );
  const selectedBrand = useMemo(() => brands.find((b) => b.id === selectedBrandId), [brands, selectedBrandId]);

  useEffect(() => {
    if (isLoadingTemplate) return;
    if (selectedProduct?.product_drive_links && funnel) {
      const match = selectedProduct.product_drive_links.find(
        (dl: any) => dl.funnel_type.toLowerCase() === funnel.toLowerCase(),
      );
      setGeneratedImagesDriveLink(match?.drive_link || "");
    } else setGeneratedImagesDriveLink("");
  }, [selectedProduct, funnel, isLoadingTemplate]);

  useEffect(() => {
    if (isLoadingTemplate || templateApplyingRef.current) { // ✅ add this
      prevFunnelRef.current = funnel;
      return;
    }
    if (prevFunnelRef.current !== funnel) {
      setSelectedInspoIds([]);
      setInspoMode("inspos");
      setUploadedInspoFiles([]);
      setUploadedInspoPreviewUrls([]);
      prevFunnelRef.current = funnel;
    }
  }, [funnel, isLoadingTemplate]);

  const availableImages = useMemo((): SelectedImage[] => {
    if (!selectedProduct || funnel === "TSL") return [];
    const imgs: SelectedImage[] = [];
    if (funnel === "Onbrand") {
      selectedProduct.product_images
        ?.sort((a: any, b: any) => a.order_index - b.order_index)
        .forEach((img: any) =>
          imgs.push({
            url: img.image_url,
            label: img.explanation || `Product Image ${img.order_index + 1}`,
            type: "product",
          }),
        );
      if (selectedBrand?.black_logo_url)
        imgs.push({ url: selectedBrand.black_logo_url, label: "Brand Logo (Black)", type: "brand" });
      if (selectedBrand?.white_logo_url)
        imgs.push({ url: selectedBrand.white_logo_url, label: "Brand Logo (White)", type: "brand" });
    } else if (funnel === "Comparison") {
      selectedProduct.product_comparison_brands
        ?.sort((a: any, b: any) => a.order_index - b.order_index)
        .slice(0, 5)
        .forEach((c: any) => imgs.push({ url: c.image_url, label: c.brand_name, type: "comparison" }));
      if (selectedProduct.publishers?.image_url)
        imgs.push({
          url: selectedProduct.publishers.image_url,
          label: `Publisher: ${selectedProduct.publishers.name}`,
          type: "publisher",
        });
    }
    return imgs;
  }, [selectedProduct, selectedBrand, funnel]);

  const displayImages = useMemo(
    () => availableImages.filter((img) => img.type !== "brand" && img.type !== "publisher"),
    [availableImages]
  );

  const effectiveProductCount = useMemo(() => {
    if (productsToShow === "other") return parseInt(customProductsCount || "0");
    return parseInt(productsToShow || "0");
  }, [productsToShow, customProductsCount]);

  useEffect(() => {
    if (!isLoadingTemplate || !pendingTemplateImages) return;
    if (funnel === "TSL") {
      setPendingTemplateImages(null);
      setIsLoadingTemplate(false);
      appliedTemplateIdRef.current = pendingTemplateIdRef.current;
      pendingTemplateIdRef.current = null;
      onTemplateUsed?.();
      return;
    }
    if (funnel === "Onbrand") {
      if (!selectedProduct?.product_images?.length) return; // wait for product data
      const urlSet = new Set(pendingTemplateImages);
      const matchedIds = (selectedProduct.product_images as any[])
        .filter((img) => urlSet.has(img.image_url))
        .map((img) => img.id);
      setSelectedProductImageIds(matchedIds.length > 0 ? matchedIds : (selectedProduct.product_images as any[]).map((img) => img.id));
      setPendingTemplateImages(null);
      setIsLoadingTemplate(false);
      appliedTemplateIdRef.current = pendingTemplateIdRef.current;
      pendingTemplateIdRef.current = null;
      onTemplateUsed?.();
      return;
    }
    if (availableImages.length === 0) return;
    const matched = pendingTemplateImages.filter((url) => new Set(availableImages.map((i) => i.url)).has(url));
    const toSelect = matched.length > 0 ? matched : availableImages.map(i => i.url);
    setSelectedImages(toSelect);
    setAiSelectedImages(toSelect);
    setComparisonImagesInitialized(true);
    setPendingTemplateImages(null);
    setIsLoadingTemplate(false);
    appliedTemplateIdRef.current = pendingTemplateIdRef.current;
    pendingTemplateIdRef.current = null;
    templateJustAppliedRef.current = true;
    onTemplateUsed?.();
  }, [isLoadingTemplate, pendingTemplateImages, availableImages, selectedProduct, onTemplateUsed, funnel]);

  useEffect(() => {
    if (isLoadingTemplate || templateApplyingRef.current) {
      prevBrandIdRef.current = selectedBrandId;
      return;
    }
    if (prevBrandIdRef.current !== selectedBrandId) {
      setSelectedProductId("");
      setSelectedImages([]);
      prevBrandIdRef.current = selectedBrandId;
    }
  }, [selectedBrandId, isLoadingTemplate]);

  useEffect(() => {
    if (!isLoadingTemplate) {
      if (templateJustAppliedRef.current) {
        templateJustAppliedRef.current = false;
        return;
      }
      setSelectedImages([]);
      setComparisonImagesInitialized(false);
    }
  }, [selectedProductId, funnel, isLoadingTemplate]);

  useEffect(() => {
    if (
      (funnel === "Comparison" || funnel === "Onbrand") &&
      availableImages.length > 0 &&
      !comparisonImagesInitialized &&
      !isLoadingTemplate
    ) {
      setSelectedImages(availableImages.map((i) => i.url));
      setComparisonImagesInitialized(true);
    }
  }, [funnel, availableImages, comparisonImagesInitialized, isLoadingTemplate]);

  useEffect(() => {
    if (isLoadingTemplate) return;
    if (selectedProduct?.product_images?.length) {
      setSelectedProductImageIds(selectedProduct.product_images.map((img: any) => img.id));
    } else {
      setSelectedProductImageIds([]);
    }
  }, [selectedProductId]);

  useEffect(() => {
    if (fileNamingManuallyEditedRef.current) return;
    const now = new Date();
    setFileNamingConvention(
      `${selectedBrand?.brand_code || "[Brand]"}_${selectedProduct?.product_code || "[Product]"}_${format(now, "MM-dd-yy")}_Y${format(now, "yy")}W${getISOWeek(now)}_${conceptName.trim() || "[Concept]"}_G[Group Number]_V[Ad Number]_IMG_Auto_${funnel || "Onbrand"}_${cs || "[CS]"}_EN_TS_TS.[Generation Timestamp]`,
    );
  }, [selectedBrand, selectedProduct, conceptName, cs, funnel]);


  const handleImageToggle = (url: string) =>
    setSelectedImages((p) => (p.includes(url) ? p.filter((u) => u !== url) : [...p, url]));

  // Fetch G-Drive images when entering Stage 2 (only once per session)
  useEffect(() => {
    if (stage !== "stage2" || gdriveImages.length > 0 || isDriveImagesLoading) return;
    setIsDriveImagesLoading(true);
    supabase.functions
      .invoke("drive-list-images", { body: { drive_link: GDRIVE_SOURCE_FOLDER } })
      .then(({ data, error }) => {
        if (!error && data?.images) {
          setGdriveImages(data.images as { id: string; name: string }[]);
        } else if (error) {
          toast({ title: "Error", description: "Failed to load Drive images", variant: "destructive" });
        }
        setIsDriveImagesLoading(false);
      });
  }, [stage, gdriveImages.length]);


  const handleGenerateImages = async () => {
    const missing: string[] = [];
    if (!funnel) missing.push("Funnel");
    if (!selectedBrandId) missing.push("Brand");
    if (!selectedProductId) missing.push("Product");
    if (!conceptName.trim()) missing.push("Concept Name");
    if (!numberOfAds.trim()) missing.push("Number of Ads");
    if (inspoMode === "inspos" && !selectedInspoIds.length) missing.push("Inspiration");
    if (inspoMode === "upload" && !uploadedInspoFiles.length) missing.push("Inspiration (upload at least one image)");
    if (missing.length > 0) {
      toast({
        title: "Required fields missing",
        description: `Please fill in: ${missing.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (funnel === "Comparison" && availableImages.length === 0) {
      toast({
        title: "Validation Error",
        description: "This product does not have Comparison product images yet.",
        variant: "destructive",
      });
      return;
    }

    if (funnel !== "" && funnel !== "TSL" && !generatedImagesDriveLink.trim()) {
      toast({
        title: "Required fields missing",
        description: "Please provide a Google Drive link for generated images.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedImages([]);
    setGeneratedImageFileIds([]);
    setShowPromptEditor(true);

    try {
      const brd = brands.find((b) => b.id === selectedBrandId);
      const prd = products.find((p: Product) => p.id === selectedProductId);
      const inspoItems = selectedInspoIds.flatMap(
        (id) => inspos.find((i) => i.id === id)?.inspo_brief || []
      );

      // Determine reference image URLs based on funnel type. Roles travel alongside the
      // URLs (same order) so the backend can tell the model what each reference IS —
      // the GPT path needs explicit labels (publisher logo vs product packaging) or it
      // can pick a competitor's brand name as the masthead.
      let referenceImageUrls: string[];
      let referenceImageRoles: string[];
      if (funnel === "TSL" || funnel === "Adv") {
        referenceImageUrls = []; // TSL and Adv never use reference images
        referenceImageRoles = [];
      } else if (funnel === "Comparison") {
        if (effectiveProductCount === 0) {
          referenceImageUrls = [];
          referenceImageRoles = [];
        } else {
          // Use images the user has selected (auto-selected by default, deselectable)
          const comparisonUrlSet = new Set(
            (prd?.product_comparison_brands || []).map((c: any) => c.image_url).filter(Boolean)
          );
          const selectedComparisonUrls = selectedImages.filter((u) => comparisonUrlSet.has(u));
          const publisherUrl = prd?.publishers?.image_url as string | undefined;
          referenceImageUrls = [...selectedComparisonUrls, ...(publisherUrl ? [publisherUrl] : [])];
          referenceImageRoles = [
            ...selectedComparisonUrls.map(() => "competitor_product"),
            ...(publisherUrl ? ["publisher_logo"] : []),
          ];
        }
      } else {
        const brandLogoUrls = [brd?.black_logo_url, brd?.white_logo_url].filter(Boolean) as string[];
        const productRefUrls = selectedProductImageIds
          .map((id) => prd?.product_images?.find((img: any) => img.id === id)?.image_url)
          .filter((u): u is string => !!u);
        referenceImageUrls = [...productRefUrls, ...brandLogoUrls];
        referenceImageRoles = [
          ...productRefUrls.map(() => "product"),
          ...brandLogoUrls.map(() => "brand_logo"),
        ];
      }

      // ── Onbrand / Comparison / TSL / Adv: shared API call ─────────────────────
      if (funnel === "Onbrand" || funnel === "Comparison" || funnel === "TSL" || funnel === "Adv") {
        const count = Math.max(parseInt(numberOfAds || "1") || 1, 1);

        try {
          let response: Response;

          if (inspoMode === "upload") {
            // Upload Images mode — multipart FormData
            const formData = new FormData();
            formData.append("prompt", designElements || "");
            formData.append("concept", conceptName || "");
            formData.append("title", adTitle || "");
            formData.append("inspo", JSON.stringify([]));
            formData.append("count", count.toString());
            formData.append("brief", stripHtml(prd?.product_brief || ""));
            formData.append("referenceImages", JSON.stringify(referenceImageUrls));
            formData.append("referenceImageRoles", JSON.stringify(referenceImageRoles));
            formData.append("funnel", funnel);
            formData.append("imageModel", imageModel);
            formData.append("isInspoImages", "true");
            if (funnel === "Comparison") formData.append("productCount", effectiveProductCount.toString());
            uploadedInspoFiles.forEach((file) => formData.append("inspoImages", file));

            response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/generate-images`, {
              method: "POST",
              body: formData,
            });
          } else {
            // Use Inspos mode — JSON
            const payload: any = {
              prompt: designElements || "",
              concept: conceptName || "",
              title: adTitle || "",
              inspo: inspoItems,
              count,
              brief: stripHtml(prd?.product_brief || ""),
              referenceImages: referenceImageUrls,
              referenceImageRoles,
              funnel,
              imageModel,
              isInspoImages: false,
            };
            if (funnel === "Comparison") payload.productCount = effectiveProductCount;

            response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/generate-images`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          if (!response.ok) throw new Error(`API error: ${response.statusText}`);
          const result = await response.json();
          if (!result.success) throw new Error(result.message || "Image generation failed");

          const imageData: { index: number; fileName: string; fileId: string }[] = result.data?.images || [];
          const images: string[] = imageData.map(
            (img) => `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(img.fileId)}`
          );
          images.forEach((url) => {
            setGeneratedImages((prev) => [...prev, url]);
            setSelectedImages((prev) => [...prev, url]);
          });
          imageData.forEach((img) => {
            setGeneratedImageFileIds((prev) => [...prev, img.fileId]);
          });
          if (images.length === 0) {
            toast({ title: "Error", description: "No images were generated. Please try again.", variant: "destructive" });
            setShowPromptEditor(false);
          }
          return;
        } catch (e: any) {
          toast({ title: "Error", description: e.message || "Failed to generate images", variant: "destructive" });
          setShowPromptEditor(false);
          throw e;
        }
      }

    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate images", variant: "destructive" });
      setShowPromptEditor(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmPrompt = async () => {
    setIsConfirming(true);
    try {
      const brd = brands.find((b) => b.id === selectedBrandId);
      const prd = products.find((p: Product) => p.id === selectedProductId);
      const inspoLinks = selectedInspoIds
        .map((id) => inspos.find((i) => i.id === id)?.drive_link)
        .filter((l): l is string => !!l);

      // Fetch sheet ID based on product name
      let adDbSheetId: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke("get-ads-db-sheet-id", {
          body: { product_name: prd?.name },
        });
        if (data?.ad_db_sheet_id) {
          adDbSheetId = data.ad_db_sheet_id;
        }
      } catch (e) {
        // Silently ignore if sheet ID fetch fails
        console.log("Sheet ID fetch failed, continuing without it");
      }

      const response = await fetch(`${import.meta.env.VITE_PIPELINE_API_BASE_URL}/api/submit-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_drive_link: generatedImagesDriveLink || null,
          brand_code: brd?.brand_code || "",
          product_code: prd?.product_code || "",
          brand_id: selectedBrandId || null,
          brand_name: brd?.name || "",
          product_id: selectedProductId || null,
          product_name: prd?.name || "",
          ad_db_sheet_id: adDbSheetId || null,
          funnel: funnel === "Adv" ? "adv" : (funnel || "Onbrand"),
          cs: cs || null,
          concept_name: conceptName || null,
          selected_images: funnel === "Onbrand"
            ? selectedProductImageIds
                .map((id) => prd?.product_images?.find((img: any) => img.id === id)?.image_url)
                .filter((u): u is string => !!u)
            : funnel === "Comparison"
            ? selectedImages.filter((u) => displayImages.some((img) => img.url === u))
            : funnel === "Adv"
            ? []
            : confirmedGeneratedImages,
          gdrive_file_ids: confirmedGeneratedFileIds.length > 0 ? confirmedGeneratedFileIds : undefined,
          ads_per_set: parseInt(maxVariationsPerAdGroup || "1") || 1,
          total_ads: confirmedGeneratedFileIds.length || confirmedGeneratedImages.length || parseInt(numberOfAds || "1") || 1,
          prompt: editablePrompt || null,
          task_description: taskDescription || null,
          inspo_links: inspoLinks,
          title: adTitle || null,
          subtitle: adSubtitle || null,
          design_elements: designElements || null,
          is_multiple: multipleAngles,
          is_cta_button: ctaButton,
          cta_button_text: ctaButton ? ctaButtonText : null,
          is_badge: badge,
          badge_text: badge ? badgeText : null,
          products_to_show: funnel === "Comparison"
            ? (productsToShow === "other" ? customProductsCount : productsToShow)
            : null,
          file_naming_convention: fileNamingConvention || null,
          docs_file_url: prd?.docs_file_url || null,
          prompt_for_images: null,
          template_id: selectedTemplateId || null,
          isTslScriptId: true,
          tslScriptId:''
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
      queryClient.invalidateQueries({ queryKey: ["statics_logs"] });
      handleClear();
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to submit to pipeline", variant: "destructive" });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClear = () => {
    setStage("stage1");
    setTaskDescription("");
    setFunnel("");
    setSelectedBrandId("");
    setSelectedProductId("");
    setSelectedImages([]);
    setConfirmedProductImages([]);
    setConfirmedGeneratedImages([]);
    setCs("");
    setConceptName("");
    setSelectedInspoIds([]);
    setInspoMode("inspos");
    setUploadedInspoFiles([]);
    setUploadedInspoPreviewUrls([]);
    setGeneratedImagesDriveLink("");
    setComparisonImagesInitialized(false);
    setAdTitle("");
    setAdSubtitle("");
    setDesignElements("");
    setPromptForImages("");
    setNumberOfAds("");
    setMaxVariationsPerAdGroup("10");

    setCtaButton(false);
    setCtaButtonText("");
    setMultipleAngles(false);
    setBadge(false);
    setBadgeText("");
    setProductsToShow("5");
    setCustomProductsCount("");
    setFileNamingConvention("");
    fileNamingManuallyEditedRef.current = false;
    setShowPromptEditor(false);
    setEditablePrompt("");
    setAiSelectedImages([]);
    setSelectedTemplateId("");
    setIsEditingTemplate(false);
    setGeneratedImages([]);
    setGeneratedImageFileIds([]);
    setConfirmedGeneratedFileIds([]);
    setSelectedProductImageIds([]);
    setGdriveImages([]);
    setIsDriveImagesLoading(false);
    setTemplateDialogOpen(false);
  };

  const isFieldDisabled = !!selectedTemplateId && !isEditingTemplate;

  const handleTemplateSelect = (id: string) => {
    if (id === "__create_new") {
      setTemplateDialogOpen(true);
      return;
    }
    if (id === "__none") {
      setSelectedTemplateId("");
      return;
    }
    const tpl = funnelTemplates.find((t) => t.id === id);
    if (!tpl) return;

    prevFunnelRef.current = (tpl.funnel as FunnelType) || funnel;
    templateApplyingRef.current = true;
    setSelectedTemplateId(id);
    setIsEditingTemplate(false);
    setSelectedBrandId(tpl.brand_id || "");
    setSelectedProductId(tpl.product_id || "");
    setCs(tpl.cs || "");
    setConceptName(tpl.concept_name || "");
    setAdTitle(tpl.title || "");
    setAdSubtitle(tpl.subtitle || "");
    setDesignElements(tpl.design_elements || "");
    setPromptForImages(tpl.prompt_for_images || "");
    setNumberOfAds(tpl.number_of_ads || "");
    setMaxVariationsPerAdGroup(tpl.max_variations_per_ad_group || "");

    setCtaButton(tpl.is_cta_button || false);
    setCtaButtonText(tpl.cta_button_text || "");
    setMultipleAngles(tpl.is_multiple || false);
    setBadge(tpl.is_badge || false);
    setBadgeText(tpl.badge_text || "");
    const tplPts = tpl.products_to_show || "5";
    if (tplPts === "5" || tplPts === "5 Products") { setProductsToShow("5"); setCustomProductsCount(""); }
    else if (tplPts === "0" || tplPts === "No products") { setProductsToShow("0"); setCustomProductsCount(""); }
    else { setProductsToShow("other"); setCustomProductsCount(tplPts); }
    setSelectedInspoIds(tpl.inspo_ids || []);
    setComparisonImagesInitialized(false);
    setTimeout(() => {
      templateApplyingRef.current = false;
    }, 0);
  };

  const handleNewTemplateSubmit = (formData: FormTemplateFormData) => {
    createTemplateMutation.mutate(formData, {
      onSuccess: async (t) => {
        setTemplateDialogOpen(false);
        await queryClient.invalidateQueries({ queryKey: ["form_templates"] });
        templateApplyingRef.current = true;
        setSelectedTemplateId(t.id);
        setIsEditingTemplate(false);
        setSelectedBrandId(t.brand_id || "");
        setSelectedProductId(t.product_id || "");
        setCs(t.cs || "");
        setConceptName(t.concept_name || "");
        setAdTitle(t.title || "");
        setAdSubtitle(t.subtitle || "");
        setDesignElements(t.design_elements || "");
        setPromptForImages(t.prompt_for_images || "");
        setNumberOfAds(t.number_of_ads || "");
        setMaxVariationsPerAdGroup(t.max_variations_per_ad_group || "");

        setCtaButton(t.is_cta_button || false);
        setCtaButtonText(t.cta_button_text || "");
        setMultipleAngles(t.is_multiple || false);
        setBadge(t.is_badge || false);
        setBadgeText(t.badge_text || "");
        setSelectedInspoIds(t.inspo_ids || []);
        setProductsToShow(t.products_to_show || "5 Products");
        setComparisonImagesInitialized(false);
        setTimeout(() => {
          templateApplyingRef.current = false;
        }, 0);
      },
    });
  };

  const handleInspoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setUploadedInspoFiles((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedInspoPreviewUrls((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleRemoveUploadedInspo = (index: number) => {
    setUploadedInspoFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadedInspoPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const showDocsAndDriveLink = funnel !== "" && funnel !== "TSL";
  const showInspo = funnel !== "";
  const showAngleOfAd = funnel !== "";
  const showPromptForImages = false;

  const funnelColors: Record<string, string> = {
    Comparison: "bg-blue-50 text-blue-700 border-blue-200",
    Onbrand: "bg-emerald-50 text-emerald-700 border-emerald-200",
    TSL: "bg-purple-50 text-purple-700 border-purple-200",
    Adv: "bg-rose-50 text-rose-700 border-rose-200",
  };

  // ── Shared button styles ─────────────────────────────────────────────────
  const primaryBtn =
    "flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50";
  const secondaryBtn =
    "flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50";

  return (
    <>
      <div
        className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
        style={{ height: "calc(100vh - 140px)" }}
      >
        {/* ══ 1. STICKY HEADER — Stage sub-tabs ══════════════════════════ */}
        <div className="shrink-0 bg-card border-b border-border">
          <div className="flex items-center gap-1 px-5 pt-3">
            {(["stage1", "stage2"] as const).map((s, idx) => {
              const isStage2Locked = s === "stage2" && confirmedGeneratedImages.length === 0;
              return (
                <button
                  key={s}
                  onClick={() => !isStage2Locked && setStage(s)}
                  disabled={isStage2Locked}
                  title={isStage2Locked ? "Confirm images in Stage 1 to unlock" : undefined}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${stage === s
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
          {/* Request Summary strip — visible once brand + product are selected */}
          {stage === "stage1" && selectedBrandId && selectedProductId && (
            <div className="px-5 py-2.5 bg-muted/40 border-t border-border flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Submission Context
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {products.find((p) => p.id === selectedProductId)?.name ?? "—"}
                </p>
              </div>
              {funnel && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${funnelColors[funnel]}`}
                >
                  {funnel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ══ 2. STAGE 2 — PIPELINE REQUEST ════════════════════════════ */}
        {stage === "stage2" && (
          <div className="flex-1 min-h-0 flex overflow-hidden">

            {/* ── Left panel: Handoff form ─────────────────────────────── */}
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
                    {/* Product Name */}
                    <div className="col-span-2 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Product</p>
                      <p className="text-sm font-semibold text-foreground leading-snug">
                        {products.find((p) => p.id === selectedProductId)?.name ?? "—"}
                      </p>
                    </div>
                    {/* Funnel */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Funnel</p>
                      {funnel ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${funnelColors[funnel]}`}>
                          {funnel}
                        </span>
                      ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                      )}
                    </div>
                    {/* Template Name */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Template</p>
                      <p className="text-xs font-medium text-foreground truncate">
                        {funnelTemplates.find((t) => t.id === selectedTemplateId)?.name
                          || formTemplate?.name
                          || "—"}
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

                    {/* Funnel — editable */}
                    <Field label="Funnel" required icon={Layers}>
                      <Select value={funnel} onValueChange={(v: FunnelType) => setFunnel(v)}>
                        <SelectTrigger className={styledTrigger}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["Comparison", "Onbrand", "Adv"] as FunnelType[]).map((f) => (
                            <SelectItem key={f} value={f}>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${funnelColors[f]}`}>
                                {f}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    {/* CS — Select from cs_config based on selected brand */}
                    <Field label="CS" required icon={FileText}>
                      <Select
                        value={cs}
                        onValueChange={setCs}
                        disabled={!selectedBrandId || csConfigLoading}
                      >
                        <SelectTrigger className={styledTrigger}>
                          <SelectValue placeholder={!selectedBrandId ? "Select brand first" : csConfigLoading ? "Loading…" : "Select CS"} />
                        </SelectTrigger>
                        <SelectContent>
                          {csConfig.map((item) => (
                            <SelectItem key={item.id} value={item.label}>
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
                          onBlur={() => { if (!maxVariationsPerAdGroup) setMaxVariationsPerAdGroup("10"); }}
                          placeholder="—"
                        />
                      </div>
                      {confirmedGeneratedImages.length > 0 && maxVariationsPerAdGroup && (() => {
                        const aps = Math.max(1, parseInt(maxVariationsPerAdGroup) || 1);
                        const total = confirmedGeneratedImages.length;
                        const setCount = Math.ceil(total / aps);
                        return (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-foreground">
                              {total} images available, max {aps} image{aps !== 1 ? "s" : ""} per set = {setCount} ad set{setCount !== 1 ? "s" : ""} with unique ad IDs.
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

                    {/* Task Description — resizable textarea */}
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

            {/* ── Right panel: G-Drive source images ──────────────────── */}
            <div className="flex-1 overflow-y-auto bg-muted/20">
              <div className="p-6 space-y-6">

                {/* Section header */}
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    Selected Generated Images
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {confirmedGeneratedImages.length > 0
                      ? `These are the ${confirmedGeneratedImages.length} image${confirmedGeneratedImages.length !== 1 ? "s" : ""} that will be forwarded to the pipeline and launched via the generation workflow.`
                      : "No images selected from Stage 1. Go back and select images."}
                  </p>
                </div>

                {confirmedGeneratedImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No images selected from Stage 1</p>
                    <button
                      onClick={() => setStage("stage1")}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Go back to select images
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {confirmedGeneratedImages.map((url, idx) => {
                      return (
                        <div
                          key={url}
                          className="relative rounded-xl overflow-hidden border-2 transition-all group"
                          style={{ borderColor: BRAND_COLOR, boxShadow: `0 0 0 3px ${BRAND_COLOR}25` }}
                        >
                          <img
                            src={driveProxySrc(url)}
                            alt={`Generated image ${idx + 1}`}
                            className="w-full aspect-square object-cover"
                            loading="lazy"
                          />
                          <div className="absolute top-1.5 right-1.5">
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center bg-primary border-primary">
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ══ 3. SCROLLABLE BODY (Stage 1 only) ════════════════════════ */}
        {stage === "stage1" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Core fields */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <Field label="Funnel" required icon={Layers}>
                    <Select
                      value={funnel}
                      onValueChange={(v: FunnelType) => {
                        setFunnel(v);
                        setSelectedTemplateId("");
                        setIsEditingTemplate(false);
                      }}
                      disabled={isFieldDisabled}
                    >
                      <SelectTrigger className={styledTrigger}>
                        <SelectValue placeholder="Select funnel" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Comparison", "Onbrand", "Adv"].map((f) => (
                          <SelectItem key={f} value={f}>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${funnelColors[f]}`}
                            >
                              {f}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Image Model" icon={Sparkles}>
                    <Select
                      value={imageModel}
                      onValueChange={(v) => setImageModel(v as "gemini" | "gpt")}
                      disabled={isFieldDisabled}
                    >
                      <SelectTrigger className={styledTrigger}>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini">Gemini — gemini-3-pro-image-preview</SelectItem>
                        <SelectItem value="gpt">GPT — gpt-image-2</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Brand">
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
                  <Field label="Product">
                    <Select
                      value={selectedProductId}
                      onValueChange={setSelectedProductId}
                      disabled={!selectedBrandId || isFieldDisabled}
                    >
                      <SelectTrigger className={styledTrigger}>
                        <SelectValue
                          placeholder={
                            !selectedBrandId
                              ? "Select brand first"
                              : productsLoading
                                ? "Loading…"
                                : filteredProducts.length === 0
                                  ? "No products"
                                  : "Select product"
                          }
                        />
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
                      value={conceptName}
                      onChange={(e) => setConceptName(e.target.value)}
                      placeholder="e.g. Summer Glow"
                      disabled={isFieldDisabled}
                    />
                  </Field>
                  {funnel === "Comparison" && (
                    <Field label="Products to Show">
                      <Select value={productsToShow} onValueChange={(v) => { setProductsToShow(v); if (v !== "other") setCustomProductsCount(""); }} disabled={isFieldDisabled}>
                        <SelectTrigger className={styledTrigger}>
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
                          className={`${styledInput} mt-2`}
                          type="number"
                          min="1"
                          value={customProductsCount}
                          onChange={(e) => setCustomProductsCount(e.target.value)}
                          placeholder="Enter number of products"
                          disabled={isFieldDisabled}
                        />
                      )}
                    </Field>
                  )}
                  {funnel === "Comparison" && selectedProduct?.publishers?.image_url && (
                    <div className="col-span-1">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                        Publisher Logo
                      </label>
                      <div
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImageUrl(selectedProduct.publishers.image_url)}
                      >
                        <img
                          src={selectedProduct.publishers.image_url}
                          alt={selectedProduct.publishers.name}
                          className="w-10 h-10 rounded-lg object-contain border border-border bg-card"
                        />
                        <span className="text-sm text-foreground font-medium">{selectedProduct.publishers.name}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Number of Ads" required>
                    <Input
                      className={styledInput}
                      type="number"
                      min="1"
                      value={numberOfAds}
                      onChange={(e) => setNumberOfAds(e.target.value)}
                      placeholder="e.g. 10"
                      disabled={isFieldDisabled}
                    />
                  </Field>
                </div>
              </div>

              {/* Template */}
              {funnel && (
                <Section title="Template" icon={LayoutTemplate}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex-1 w-full">
                      <Select value={selectedTemplateId || "__none"} onValueChange={handleTemplateSelect}>
                        <SelectTrigger className={styledTrigger}>
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">None</SelectItem>
                          {funnelTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
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
                          onCheckedChange={(v) => {
                            if (v) {
                              setSelectedTemplateId("");
                            }
                          }}
                        />
                        <Label htmlFor="editTpl" className="text-sm text-muted-foreground cursor-pointer">
                          Edit fields
                        </Label>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Links & Resources — hidden for TSL (no brief or drive link needed) */}
              {selectedProductId && funnel !== "TSL" && (
                <Section title="Links & Resources" icon={Link2}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedProduct?.product_brief && (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${BRAND_COLOR}18` }}
                        >
                          <FileText className="w-4 h-4" style={{ color: BRAND_COLOR }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground font-medium mb-0.5">Product Brief</p>
                          <p className="text-sm font-medium text-foreground">Brief available</p>
                        </div>
                        <button
                          onClick={() => {
                            setViewBriefDraft(selectedProduct.product_brief || "");
                            setBriefViewOpen(true);
                          }}
                          className="w-8 h-8 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                          title="View Brief"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {showDocsAndDriveLink && (
                      <Field label="Generated Images Drive Link">
                        <div className="flex gap-2">
                          <Input
                            className={`${styledInput} flex-1`}
                            value={generatedImagesDriveLink}
                            onChange={(e) => setGeneratedImagesDriveLink(e.target.value)}
                            placeholder="https://drive.google.com/…"
                            disabled={isFieldDisabled}
                          />
                          <button
                            onClick={() => generatedImagesDriveLink && window.open(generatedImagesDriveLink, "_blank")}
                            disabled={!generatedImagesDriveLink}
                            className="w-10 h-10 rounded-lg border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </Field>
                    )}
                  </div>
                </Section>
              )}

              {/* Ad Creative */}
              {showAngleOfAd && (
                <Section title="Ad Creative" icon={Palette}>
                  {funnel !== "TSL" && (
                    <Field label="Title">
                      <Input
                        className={styledInput}
                        value={adTitle}
                        onChange={(e) => setAdTitle(e.target.value)}
                        placeholder="Ad headline"
                        disabled={isFieldDisabled}
                      />
                    </Field>
                  )}
                  <Field label="Design Elements">
                    <Textarea
                      value={designElements}
                      onChange={(e) => setDesignElements(e.target.value)}
                      placeholder="Describe visual style, colors, layout…"
                      className="min-h-[80px] rounded-lg border-border bg-muted/50 text-sm resize-y"
                      disabled={isFieldDisabled}
                    />
                  </Field>
                </Section>
              )}

              {/* TSL: Prompt for Images */}
              {showPromptForImages && (
                <Section title="Prompt for Images" icon={Sparkles} required>
                  <Textarea
                    value={promptForImages}
                    onChange={(e) => setPromptForImages(e.target.value)}
                    placeholder="Describe the images you want to generate…"
                    className="min-h-[140px] rounded-lg border-border bg-muted/50 text-sm resize-none"
                    disabled={isFieldDisabled}
                  />
                </Section>
              )}

              {/* Inspiration */}
              {showInspo && (
                <Section title="Inspiration" icon={Lightbulb} required={!!funnel}>
                  {/* Mode toggle */}
                  <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                    <button
                      onClick={() => setInspoMode("inspos")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        inspoMode === "inspos"
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Use Inspos
                    </button>
                    <button
                      onClick={() => setInspoMode("upload")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        inspoMode === "upload"
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Upload Images
                    </button>
                  </div>

                  {/* Use Inspos mode */}
                  {inspoMode === "inspos" && (
                    <>
                      {selectedInspoIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedInspoIds.map((id) => {
                            const inspo = inspos.find((i) => i.id === id);
                            return inspo ? (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
                                style={{
                                  background: `${BRAND_COLOR}12`,
                                  borderColor: `${BRAND_COLOR}40`,
                                  color: BRAND_COLOR,
                                }}
                              >
                                {inspo.name}
                                {!isFieldDisabled && (
                                  <button onClick={() => setSelectedInspoIds((p) => p.filter((x) => x !== id))}>
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {insposLoading ? (
                          <p className="text-xs text-muted-foreground col-span-full">Loading…</p>
                        ) : filteredInspos.length === 0 ? (
                          <p className="text-xs text-muted-foreground col-span-full">
                            {funnel ? `No inspos for "${funnel}".` : "No inspos available."}
                          </p>
                        ) : (
                          filteredInspos.map((inspo) => (
                            <div
                              key={inspo.id}
                              onClick={() =>
                                !isFieldDisabled &&
                                setSelectedInspoIds((p) =>
                                  p.includes(inspo.id) ? p.filter((x) => x !== inspo.id) : [...p, inspo.id],
                                )
                              }
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all select-none ${isFieldDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                              style={
                                selectedInspoIds.includes(inspo.id)
                                  ? { borderColor: `${BRAND_COLOR}60`, background: `${BRAND_COLOR}10`, color: BRAND_COLOR }
                                  : {}
                              }
                            >
                              <Checkbox
                                checked={selectedInspoIds.includes(inspo.id)}
                                onCheckedChange={() =>
                                  !isFieldDisabled &&
                                  setSelectedInspoIds((p) =>
                                    p.includes(inspo.id) ? p.filter((x) => x !== inspo.id) : [...p, inspo.id],
                                  )
                                }
                                disabled={isFieldDisabled}
                                className="shrink-0 w-3.5 h-3.5"
                              />
                              <span className="truncate text-xs text-muted-foreground">{inspo.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedInspoIds.length} selected</p>
                    </>
                  )}

                  {/* Upload Images mode */}
                  {inspoMode === "upload" && (
                    <div className="space-y-3">
                      <input
                        ref={uploadedInspoInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleInspoFileChange}
                        className="hidden"
                        id="inspo-upload"
                      />
                      <label
                        htmlFor="inspo-upload"
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors text-sm font-medium text-foreground w-fit"
                      >
                        <Upload className="w-4 h-4" />
                        {uploadedInspoFiles.length === 0 ? "Click to upload images" : "Add more images"}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {uploadedInspoFiles.length === 0
                          ? "No images uploaded"
                          : `${uploadedInspoFiles.length} image(s) uploaded`}
                      </p>
                      {uploadedInspoPreviewUrls.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {uploadedInspoPreviewUrls.map((url, i) => (
                            <div key={i} className="relative rounded-lg overflow-hidden border border-border group">
                              <img
                                src={url}
                                alt={`Uploaded ${i + 1}`}
                                className="w-full aspect-square object-cover"
                              />
                              <button
                                onClick={() => handleRemoveUploadedInspo(i)}
                                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-destructive/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Section>
              )}

              {/* ── Reference Images ──────────────────────────────────────── */}
              {!showPromptEditor && selectedProductId && funnel !== "TSL" && funnel !== "Adv" && (
                funnel === "Comparison"
                  ? displayImages.length > 0 && effectiveProductCount > 0
                  : (selectedProduct?.product_images?.length ?? 0) > 0
              ) && (
                  <Section title="Reference Images" icon={ImageIcon}>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {funnel === "Comparison"
                        ? displayImages.map((img) => {
                          const isSel = selectedImages.includes(img.url);
                          return (
                            <div
                              key={img.url}
                              onClick={() =>
                                setSelectedImages((prev) =>
                                  prev.includes(img.url)
                                    ? prev.filter((u) => u !== img.url)
                                    : [...prev, img.url]
                                )
                              }
                              className="relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all group"
                              style={
                                isSel
                                  ? { borderColor: BRAND_COLOR, boxShadow: `0 0 0 3px ${BRAND_COLOR}25` }
                                  : { borderColor: "transparent" }
                              }
                            >
                              <img
                                src={img.url}
                                alt={img.label}
                                className="w-full aspect-square object-cover"
                                loading="lazy"
                              />
                              {/* Label */}
                              <div className="absolute bottom-0 inset-x-0 px-1 py-0.5 bg-black/50">
                                <p className="text-[10px] text-white truncate">{img.label}</p>
                              </div>
                              {/* Hover overlay */}
                              <div className={`absolute inset-0 transition-opacity ${isSel ? "bg-primary/10" : "bg-black/0 group-hover:bg-black/8"}`} />
                              {/* Selection indicator */}
                              <div className="absolute top-1.5 right-1.5">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSel
                                  ? "bg-primary border-primary"
                                  : "bg-black/25 border-white/70 group-hover:border-white"
                                  }`}>
                                  {isSel && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                        : selectedProduct.product_images.map((img: any, i: number) => {
                          const isSelected = selectedProductImageIds.includes(img.id);
                          return (
                            <div
                              key={img.id}
                              onClick={() => !isFieldDisabled && setSelectedProductImageIds((p) => p.includes(img.id) ? p.filter((x) => x !== img.id) : [...p, img.id])}
                              className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all group ${isFieldDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                              style={
                                isSelected
                                  ? { borderColor: BRAND_COLOR, boxShadow: `0 0 0 3px ${BRAND_COLOR}25` }
                                  : { borderColor: "transparent" }
                              }
                            >
                              <img
                                src={img.image_url}
                                alt={`Product image ${i + 1}`}
                                className="w-full aspect-square object-cover"
                                loading="lazy"
                              />
                              <div className={`absolute inset-0 transition-opacity ${isSelected ? "bg-primary/10" : "bg-black/0 group-hover:bg-black/8"}`} />
                              <div className="absolute top-1.5 right-1.5">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "bg-black/25 border-white/70 group-hover:border-white"}`}>
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {funnel === "Comparison"
                        ? `${selectedImages.filter((u) => displayImages.some((img) => img.url === u)).length} / ${displayImages.length} selected`
                        : `${selectedProductImageIds.length} / ${selectedProduct.product_images.length} selected`}
                    </p>
                  </Section>
                )}

              {/* ── Select Generated Images (shown after Generate Images) ── */}
              {showPromptEditor && (
                <Section title="Select Generated Images" icon={ImageIcon} accent="bg-blue-50/50">
                  {isGenerating && generatedImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" style={{ color: BRAND_COLOR }} />
                      <p className="text-sm text-muted-foreground">Generating {numberOfAds} images…</p>
                    </div>
                  ) : generatedImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground text-center">
                        No images generated yet. Click "Generate Images" above to start.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Progress badge shown while still generating */}
                      {isGenerating && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-3 border-b border-border">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: BRAND_COLOR }} />
                          <span>{generatedImages.length} / {numberOfAds} generated…</span>
                        </div>
                      )}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {generatedImages.map((url, i) => {
                          const isSel = selectedImages.includes(url);
                          return (
                            <div
                              key={url}
                              onClick={() => handleImageToggle(url)}
                              onDoubleClick={(e) => { e.stopPropagation(); setSliderIndex(i); setSliderOpen(true); }}
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
                              {/* Hover overlay */}
                              <div
                                className={`absolute inset-0 transition-opacity ${isSel ? "bg-primary/10" : "bg-black/0 group-hover:bg-black/8"
                                  }`}
                              />
                              {/* Selection indicator */}
                              <div className="absolute top-1.5 right-1.5">
                                <div
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSel
                                    ? "bg-primary border-primary"
                                    : "bg-black/25 border-white/70 group-hover:border-white"
                                    }`}
                                >
                                  {isSel && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
                          {selectedImages.filter((u) => generatedImages.includes(u)).length} / {generatedImages.length} selected
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

              {/* ── Image Slider Popup Dialog ────────────────────────────── */}

              {generatedImages.length > 0 && (
                <Dialog open={sliderOpen} onOpenChange={setSliderOpen}>
                  <DialogContent
                    className="!fixed !inset-0 !translate-x-0 !translate-y-0 !left-0 !top-0 !max-w-none w-screen h-screen rounded-none p-0 bg-black border-0 overflow-hidden flex items-center justify-center"
                  >
                    {/* High-res image centered */}
                    <div
                      className="relative flex items-center justify-center"
                      style={{ maxHeight: "calc(100vh - 80px)", maxWidth: "calc(100vw - 120px)" }}
                    >
                      {/* Spinner — shown while image is loading */}
                      {sliderLoading && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="flex flex-col items-center gap-3">
                            {/* <Loader2 className="w-30 h-30 animate-spin text-white/60" /> */}
                            <Loader2 className="w-[80px] h-[80px] animate-spin text-white/60" />
                          </div>
                        </div>
                      )}
                      <img
                        key={generatedImages[sliderIndex]}
                        src={driveProxySrcFull(generatedImages[sliderIndex])}
                        alt={`Image ${sliderIndex + 1}`}
                        className={`object-contain max-w-full max-h-full transition-opacity duration-300 ${sliderLoading ? "opacity-0" : "opacity-100"}`}
                        style={{ maxHeight: "calc(100vh - 80px)", maxWidth: "calc(100vw - 120px)" }}
                        // onLoad={() => setSliderLoading(false)}
                        onLoad={() => {
                          // Add a small delay to ensure the spinner shows consistently
                          setTimeout(() => setSliderLoading(false), 50);
                        }}
                        onError={() => setSliderLoading(false)}
                      />
                    </div>

                    {/* Top bar */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 z-10">
                      <div className="text-white/50 text-sm font-mono">
                        {sliderIndex + 1} / {generatedImages.length}
                      </div>
                      <button
                        onClick={() => setSliderOpen(false)}
                        className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1.5 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Prev button */}
                    <button
                      onClick={() => { setSliderIndex(i => Math.max(i - 1, 0)); setSliderLoading(true); }}
                      disabled={sliderIndex === 0}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 disabled:opacity-20 rounded-full p-3 transition-colors z-10"
                    >
                      <ChevronLeft className="w-7 h-7" />
                    </button>

                    {/* Next button */}
                    <button
                      onClick={() => { setSliderIndex(i => Math.min(i + 1, generatedImages.length - 1)); setSliderLoading(true); }}
                      disabled={sliderIndex === generatedImages.length - 1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 disabled:opacity-20 rounded-full p-3 transition-colors z-10"
                    >
                      <ChevronRight className="w-7 h-7" />
                    </button>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            {/* /p-5 */}
          </div>
        )}
        {/* /stage1 */}

        {/* ══ 4. STICKY FOOTER ══════════════════════════════════════════ */}
        {stage === "stage1" && (
          <div className="shrink-0 flex gap-3 px-5 py-4 bg-card border-t border-border">
            {!showPromptEditor ? (
              <>
                <button
                  onClick={handleGenerateImages}
                  disabled={isGenerating || isPreparing || createLogMutation.isPending}
                  className={primaryBtn}
                  style={{ background: BRAND_COLOR, boxShadow: `0 4px 14px ${BRAND_COLOR}40` }}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {isGenerating ? "Generating…" : "Generate Images"}
                </button>
                <button onClick={handleClear} disabled={isGenerating} className={secondaryBtn}>
                  Clear
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    const confirmedUrls = selectedImages.filter((url) => generatedImages.includes(url));
                    setConfirmedGeneratedImages(confirmedUrls);
                    const confirmedIds = confirmedUrls
                      .map((url) => {
                        try { return new URL(url).searchParams.get("fileId") ?? ""; }
                        catch { return ""; }
                      })
                      .filter(Boolean);
                    setConfirmedGeneratedFileIds(confirmedIds);
                    setStage("stage2");
                  }}
                  disabled={isPreparing || isConfirming || isGenerating || selectedImages.length === 0}
                  className={primaryBtn}
                  style={{ background: BRAND_COLOR, boxShadow: `0 4px 14px ${BRAND_COLOR}40` }}
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirm
                </button>
                <button onClick={handleGenerateImages} disabled={isPreparing || isConfirming || isGenerating} className={secondaryBtn}>
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {isGenerating ? "Generating…" : "Regenerate"}
                </button>
                <button
                  onClick={handleClear}
                  disabled={isGenerating}
                  className="px-5 h-11 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}
        {/* ══ 5. STAGE 2 FOOTER ═════════════════════════════════════════ */}
        {stage === "stage2" && (
          <div className="shrink-0 flex items-center gap-3 px-5 py-4 bg-card border-t border-border">
            <button
              onClick={() => setStage("stage1")}
              className={secondaryBtn}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Generate
            </button>
            <button
              onClick={handleConfirmPrompt}
              disabled={isConfirming || !conceptName.trim() || !maxVariationsPerAdGroup || !cs}
              className={primaryBtn}
              style={{ background: BRAND_COLOR, boxShadow: `0 4px 14px ${BRAND_COLOR}40` }}
            >
              {isConfirming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isConfirming ? "Submitting…" : "Submit Ads to Pipeline"}
            </button>
          </div>
        )}
        {/* /sticky footer */}
      </div>
      {/* /card */}

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={null}
        onSubmit={handleNewTemplateSubmit}
        isLoading={createTemplateMutation.isPending}
        defaultFunnel={funnel}
      />

      <Dialog open={!!previewImageUrl} onOpenChange={() => setPreviewImageUrl(null)}>
        <DialogContent className="max-w-lg p-2 border-none bg-transparent shadow-none">
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt="Publisher Logo Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg bg-card p-4"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Product Brief viewer */}
      <Dialog open={briefViewOpen} onOpenChange={setBriefViewOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Product Brief</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedProduct?.name} — review the product brief.
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg">
            <RichTextEditor
              content={viewBriefDraft}
              onChange={setViewBriefDraft}
              placeholder="No brief content…"
              editable={false}
            />
          </div>
          <div className="flex justify-end pt-4 border-t shrink-0">
            <button
              onClick={() => setBriefViewOpen(false)}
              className="px-4 h-10 rounded-lg border border-border bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GeneratorForm;
