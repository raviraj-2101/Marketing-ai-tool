import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileImage,
  FileText,
  Pencil,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Check,
  Trash2,
  X,
  ArrowRight,
  Download,
  ZoomIn,
  Upload,
  ImagePlus,
} from "lucide-react";
import { pipelineApiRequest as apiRequest, PIPELINE_API_BASE as API_BASE, pipelineQueryFn } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyRichPaste } from "@/lib/pasteRichText";
import { oneLineSummary, detailParagraph, type AnalysisShape } from "@/lib/analysisProse";
import { analysisRows } from "@/lib/analysisFields";
import { parseScriptMessage } from "@/lib/tslScriptMessage";
import { ProgressTimer } from "@/components/tsl/ProgressTimer";
import { RealProgressBar } from "@/components/tsl/RealProgressBar";
import { readSseStream } from "@/lib/sseStream";
import { authHeaders, PIPELINE_API_BASE } from "@/lib/queryClient";
import {
  addToTray,
  removeFromTray,
  groupTrayByCategory,
  loadTray,
  saveTray,
  clearTray,
  loadGeneratedImages,
  saveGeneratedImages,
  clearGeneratedImages,
  type ApprovedImage,
  type GeneratedImage,
} from "@/lib/approvedTray";
import { useSessionPersistedState } from "@/lib/useSessionPersistedState";
import { touchTslSession, clearTslSession, sweepStaleTslSessions } from "@/lib/tslSession";
import { AddImageDialog } from "@/components/tsl/AddImageDialog";
import { useProducts } from "@/hooks/useProducts";
import { ProductReferencePicker } from "@/components/tsl/ProductReferencePicker";
import { findProductBySlug, pickerImagesForProduct } from "@/lib/tslProductReference";

interface ProductSummary {
  id: string;
  name: string;
}
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
interface ChatPayload {
  chat: { id: string; title: string; product: string };
  messages: ChatMessage[];
}

interface AnalyzeResponse {
  cacheKey: string;
  productSlug: string;
  scriptHash: string;
  analysis: AnalysisShape;
}

const CATEGORY_GRID: Array<{ id: string; label: string; description: string }> = [
  {
    id: "01-pain-artifact-broll",
    label: "Pain artifact",
    description: "Still life of an object that proves the problem. No faces — just the evidence.",
  },
  {
    id: "02-confessional-portrait",
    label: "Confessional portrait",
    description: "The narrator alone in a room, defeated. Quiet, real, past-crying.",
  },
  {
    id: "03-pov-pain-moment",
    label: "POV symptom",
    description: "First-person view down at the narrator's own body — the symptom as lived experience.",
  },
  {
    id: "04-family-pain-trigger",
    label: "Family pain trigger",
    description: "A family member notices. The private suffering becomes visible.",
  },
  {
    id: "05-failed-solutions",
    label: "Failed solutions",
    description: "Counter scattered with the remedies, pills, teas that did not work.",
  },
  {
    id: "06-authority-dismissal",
    label: "Doctor dismissal",
    description: "Narrator being waved off by a doctor — \"it's just stress / part of getting older\".",
  },
  {
    id: "07-mechanism-diagram",
    label: "Mechanism diagram",
    description: "Clean medical-textbook cross-section of the body system the product addresses.",
  },
  {
    id: "08-mechanism-overlay",
    label: "Mechanism on body",
    description: "Mechanism rendered on the narrator's actual body — editorial-medical, never video-game.",
  },
  {
    id: "09-product-ritual",
    label: "Product ritual",
    description: "The product in use at the moment of the daily ritual — hands, dose, kitchen counter.",
  },
  {
    id: "10-visible-proof",
    label: "Visible proof",
    description: "Body-evidence of the transformation — ring sliding loose, jeans falling off, scale reading.",
  },
  {
    id: "11-social-validation",
    label: "Social validation",
    description: "Third-party reaction shot — friend, husband, coworker noticing the change.",
  },
  {
    id: "12-chart-or-collage",
    label: "Chart / collage",
    description: "Receipts of progress — scale photo, calendar of checkmarks, before/after grid.",
  },
  {
    id: "13-mechanism-pain",
    label: "Pain mechanism",
    description: "The biological root cause visualised — congested vessel, sluggish gut, swollen tissue.",
  },
  {
    id: "14-mechanism-solution",
    label: "Solution mechanism",
    description: "Same system mid-flow — fluid moving, sludge flushing, vessels opening.",
  },
  {
    id: "15-pain-point-visible",
    label: "Symptom on body",
    description: "The symptom itself in frame — swollen ankles, puffy face, bloated belly.",
  },
  {
    id: "16-free-form",
    label: "Free form (no preset)",
    description: "Your prompt is sent verbatim to Gemini. No presets, no guardrails. Aspect 4:5 vertical.",
  },
];

const FREE_FORM_CATEGORY_ID = "16-free-form";

// Per-TSL image ceiling — mirrors the server's hard cap (pipeline-node rejects anything above it).
const MAX_TOTAL_VARIATIONS = 50;

// Groups raw render-failure reasons into operator-readable buckets so a quota outage
// reads as "quota hit — wait / switch model", not as silence or a wall of JSON.
function summarizeRenderFailures(failures: Array<{ categoryId?: string; reason: string }>) {
  const groups = new Map<string, { label: string; hint: string | null; count: number }>();
  for (const f of failures) {
    let key: string; let label: string; let hint: string | null = null;
    if (/429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(f.reason)) {
      key = "quota";
      label = "Gemini quota / rate limit hit";
      hint = "The Google API quota is exhausted. Wait a few minutes and retry, or switch Image model to GPT. If it keeps happening all day, the Gemini billing/quota needs admin attention.";
    } else if (/safety|moderation|violation|IMAGE_SAFETY|PROHIBITED/i.test(f.reason)) {
      key = "safety";
      label = "Model safety system rejected the prompt";
      hint = "Reword the prompt — medical/body phrasing often trips the filter as a false positive.";
    } else if (/403|PERMISSION_DENIED|dunning/i.test(f.reason)) {
      key = "denied";
      label = "Gemini API access denied (billing / permissions)";
      hint = "The Google Cloud project behind the API key is blocked — this needs admin attention, retrying won't help.";
    } else if (/timed out|timeout|abort/i.test(f.reason)) {
      key = "timeout";
      label = "Image model timed out";
      hint = "Usually transient — retry the generation.";
    } else {
      key = f.reason.slice(0, 80);
      label = f.reason.length > 220 ? `${f.reason.slice(0, 220)}…` : f.reason;
    }
    const g = groups.get(key) || { label, hint, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// Categories that are product-free BY DESIGN (TSL methodology): mechanism/diagram/
// failed-solutions beats never show the product. When "Include product" is on these are
// disabled, so the operator never silently generates a no-product image expecting one.
const PRODUCT_FREE_CATEGORY_IDS = ["05-failed-solutions", "07-mechanism-diagram", "08-mechanism-overlay"];

function splitBudget(total: number, count: number): number[] {
  if (count === 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export const FREE_FORM_SESSION_KEY = "tsl-v2:free-form-session-id";
export const FREE_FORM_PRODUCT_KEY_PREFIX = "tsl-v2:free-form-product:";
export const FREE_FORM_SCRIPT_KEY_PREFIX = "tsl-v2:free-form-script:";

function readOrMintFreeFormSessionId(): string {
  const fresh = `free-form-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (typeof window === "undefined") return fresh;
  try {
    const existing = window.sessionStorage.getItem(FREE_FORM_SESSION_KEY);
    if (existing) return existing;
    window.sessionStorage.setItem(FREE_FORM_SESSION_KEY, fresh);
    return fresh;
  } catch {
    return fresh;
  }
}

export default function TslDevelopPage() {
  const params = useParams<{ chatId?: string }>();
  const chatId = params.chatId;

  const freeFormSessionId = useMemo<string | null>(() => {
    if (chatId) return null;
    return readOrMintFreeFormSessionId();
  }, [chatId]);

  const sessionKey: string | undefined = chatId || freeFormSessionId || undefined;

  // Lazy-seeded from storage so the script (and its overridden flag) are correct
  // on the FIRST render. This is essential: react-query caches the chat messages,
  // so chatQ.data is available synchronously on mount — if scriptOverridden were
  // initialised to false, the chat-seed effect below would clobber a restored /
  // Final-review edit before a scheduled setScriptOverridden(true) could apply.
  const [script, setScript] = useState<string>(() => {
    if (!sessionKey || typeof window === "undefined") return "";
    try {
      const key = chatId ? `tsl-v2:script-override:${sessionKey}` : FREE_FORM_SCRIPT_KEY_PREFIX + sessionKey;
      return window.localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  });
  const [scriptOverridden, setScriptOverridden] = useState<boolean>(() => {
    if (!sessionKey || !chatId || typeof window === "undefined") return false;
    try {
      return !!window.localStorage.getItem(`tsl-v2:script-override:${sessionKey}`);
    } catch {
      return false;
    }
  });
  // Inline script editing (mirrors the Final-review page): a read-only preview
  // by default, Edit → draft textarea → Save/Cancel. Free-form with no script
  // yet opens straight into edit mode so there's somewhere to type.
  const [editingScript, setEditingScript] = useState<boolean>(() => !chatId && script.trim().length === 0);
  const [scriptDraft, setScriptDraft] = useState("");
  const scriptDraftRef = useRef<HTMLTextAreaElement | null>(null);
  const [scriptIdMode, setScriptIdMode] = useState<"new" | "iterate">("new");
  const [scriptIdExisting, setScriptIdExisting] = useState<string>("");
  const [scriptIdSearch, setScriptIdSearch] = useState<string>("");
  const [productSlug, setProductSlug] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // These survive Develop ⇄ Final-review navigation via per-session localStorage.
  const [analysis, setAnalysis] = useSessionPersistedState<AnalyzeResponse | null>(sessionKey, "analysis", null);
  const [detailExpanded, setDetailExpanded] = useState(false);

  const [selectedCats, setSelectedCats] = useSessionPersistedState<string[]>(sessionKey, "selected-cats", []);

  const [totalVariations, setTotalVariations] = useSessionPersistedState<number>(sessionKey, "total-variations", 10);
  // The cap used to be 60 — clamp any stale persisted value so old sessions can't exceed the server limit.
  useEffect(() => {
    if (totalVariations > MAX_TOTAL_VARIATIONS) setTotalVariations(MAX_TOTAL_VARIATIONS);
  }, [totalVariations, setTotalVariations]);
  const [guidingPrompt, setGuidingPrompt] = useSessionPersistedState<string>(
    sessionKey, "guiding-prompt", "",
    { serialize: (v) => v, deserialize: (r) => r },
  );
  const [categoryAspectRatios, setCategoryAspectRatios] = useState<Record<string, "4:5" | "1:1">>({});
  const aspectForCategory = (catId: string): "4:5" | "1:1" => categoryAspectRatios[catId] || "4:5";
  const [includeProductImage, setIncludeProductImage] = useState<boolean>(false);
  // Image model for rendering: gemini = current default flow, gpt = gpt-image-2.
  const [imageModel, setImageModel] = useState<"gemini" | "gpt">("gemini");
  const [referenceImages, setReferenceImages] = useState<Array<{ dataUrl: string; label?: string }>>([]);
  // Product image (single — label authority) + reference images (extra angles), kept
  // separate like the avatars flow. null/[] = Auto. + "feature product prominently" toggle.
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [productProminent, setProductProminent] = useState<boolean>(false);
  const [windowDragActive, setWindowDragActive] = useState(false);
  const [zoneDragActive, setZoneDragActive] = useState(false);

  // Product reference picker: the currently-selected product's catalog/reference images.
  const { products: allProducts } = useProducts();
  const currentProduct = findProductBySlug(allProducts, productSlug);
  const productPickerImages = pickerImagesForProduct(currentProduct);
  useEffect(() => {
    setProductImageUrl(null);
  }, [productSlug, includeProductImage]);

  // When "Include product" is turned on: default the renderer to GPT (best label fidelity)
  // and default "Feature product prominently" to ON (readable label). Operator can change both.
  useEffect(() => {
    if (includeProductImage) {
      setImageModel("gpt");
      setProductProminent(true);
    }
  }, [includeProductImage]);

  // Selected categories that are product-free by design — used to warn (not block) when
  // "Include product" is on, since the product can't appear in those beats.
  const selectedProductFreeCats = CATEGORY_GRID.filter(
    (c) => PRODUCT_FREE_CATEGORY_IDS.includes(c.id) && selectedCats.includes(c.id),
  );

  useEffect(() => {
    let dragCounter = 0;
    const isFileDrag = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return Array.from(types as unknown as string[]).includes("Files");
    };
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragCounter++;
      if (dragCounter === 1) setWindowDragActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setWindowDragActive(false);
      }
    };
    const onDrop = () => {
      dragCounter = 0;
      setWindowDragActive(false);
      setZoneDragActive(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);

  const onReferenceFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Reference image too large (max 5 MB). Try a smaller crop.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) return;
      setReferenceImages((prev) => [...prev, { dataUrl, label: file.name }].slice(-3));
    };
    reader.readAsDataURL(file);
  };

  const onRemoveReference = (i: number) => {
    setReferenceImages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const scriptIdKey = sessionKey ? `tsl-v2:script-id-mode:${sessionKey}` : null;
  const scriptIdValKey = sessionKey ? `tsl-v2:script-id-value:${sessionKey}` : null;
  useEffect(() => {
    if (!scriptIdKey) return;
    try {
      const m = window.localStorage.getItem(scriptIdKey);
      const v = window.localStorage.getItem(scriptIdValKey || "");
      if (m === "iterate" || m === "new") setScriptIdMode(m);
      if (v) setScriptIdExisting(v);
    } catch { /* ignore */ }
  }, [scriptIdKey, scriptIdValKey]);
  useEffect(() => {
    if (!scriptIdKey) return;
    try {
      window.localStorage.setItem(scriptIdKey, scriptIdMode);
      if (scriptIdValKey) {
        if (scriptIdExisting) {
          window.localStorage.setItem(scriptIdValKey, scriptIdExisting);
        } else {
          window.localStorage.removeItem(scriptIdValKey);
        }
      }
    } catch { /* ignore */ }
  }, [scriptIdKey, scriptIdValKey, scriptIdMode, scriptIdExisting]);

  const scriptListQ = useQuery<{ rows: Array<{ tsl_script_id: string; angle: string | null; summary: string | null; variation: number | null }> }>({
    queryKey: ["/api/tsl/script-ids", productSlug, scriptIdSearch],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (productSlug) qs.set("product", productSlug);
      if (scriptIdSearch.trim()) qs.set("search", scriptIdSearch.trim());
      qs.set("limit", "50");
      const r = await apiRequest("GET", `/api/tsl/script-ids?${qs.toString()}`);
      return r.json();
    },
    enabled: scriptIdMode === "iterate" && !!productSlug,
  });

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[] | null>(null);
  // Real progress driven by the SSE stream — total = how many prompts will run,
  // done = how many finished (success + failure), succeeded = subset that
  // produced an image, startedAt = wall-clock baseline for the elapsed counter.
  const [genProgress, setGenProgress] = useState<{ done: number; succeeded: number; total: number; startedAt: number } | null>(null);
  const [perCategory, setPerCategory] = useState<Array<{
    categoryId: string;
    images: Array<{ url: string }>;
  }> | null>(null);
  // Real per-image failure reasons streamed by the server (previously discarded, which
  // made quota/safety outages look like "0 images, no error"). Session-only.
  const [renderFailures, setRenderFailures] = useState<Array<{ categoryId?: string; reason: string }>>([]);

  const [pendingSelections, setPendingSelections] = useState<Set<string>>(new Set());
  // Tray is lazy-seeded from storage so the StrictMode mount-save can't clobber
  // it with an empty array (the bug where the approved tray emptied on return).
  const [approved, setApproved] = useState<ApprovedImage[]>(() => loadTray(sessionKey));
  const [round, setRound] = useState<number>(() => {
    const t = loadTray(sessionKey);
    return t.reduce((m, x) => Math.max(m, x.approvedInRound), 0) + 1;
  });
  const trayHydratedFor = useRef<string | undefined>(sessionKey);
  const [trayExpanded, setTrayExpanded] = useState<boolean>(true);

  const [zoomImage, setZoomImage] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => {
    if (!zoomImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomImage]);

  const downloadImage = async (url: string, suggestedName: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.warn("download failed", err);
      window.open(url, "_blank");
    }
  };

  // Re-hydrate the tray only when the session actually changes (the initial
  // value is already seeded above). This avoids re-reading — and the save
  // effect avoids re-writing — with a stale value on mount under StrictMode.
  useEffect(() => {
    if (sessionKey === trayHydratedFor.current) return;
    const t = loadTray(sessionKey);
    setApproved(t);
    setRound(t.reduce((m, x) => Math.max(m, x.approvedInRound), 0) + 1);
    trayHydratedFor.current = sessionKey;
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey || sessionKey !== trayHydratedFor.current) return;
    saveTray(sessionKey, approved);
  }, [sessionKey, approved]);

  // Restore the last generation round from localStorage on mount
  useEffect(() => {
    if (!sessionKey) return;
    const snap = loadGeneratedImages(sessionKey);
    // Restore when there's anything to show — including a fully-failed round
    // (0 images + failure reasons), so the operator still sees WHY after a reload.
    if (!snap || (snap.images.length === 0 && !(snap.renderFailures && snap.renderFailures.length > 0))) return;
    if (snap.images.length > 0) setGeneratedImages(snap.images);
    setPerCategory(snap.perCategory.length > 0 ? snap.perCategory : null);
    setRenderFailures(snap.renderFailures ?? []);
  }, [sessionKey]);

  useEffect(() => {
    if (chatId || !sessionKey) return;
    try {
      if (productSlug) {
        window.localStorage.setItem(FREE_FORM_PRODUCT_KEY_PREFIX + sessionKey, productSlug);
      } else {
        window.localStorage.removeItem(FREE_FORM_PRODUCT_KEY_PREFIX + sessionKey);
      }
    } catch { /* ignore quota */ }
  }, [chatId, sessionKey, productSlug]);
  useEffect(() => {
    if (chatId || !sessionKey) return;
    try {
      if (script) {
        window.localStorage.setItem(FREE_FORM_SCRIPT_KEY_PREFIX + sessionKey, script);
      } else {
        window.localStorage.removeItem(FREE_FORM_SCRIPT_KEY_PREFIX + sessionKey);
      }
    } catch { /* ignore quota */ }
  }, [chatId, sessionKey, script]);

  // ── Persist the script (the single source of truth shared with the
  // Final-review editor) ────────────────────────────────────────────────────
  // selectedCats / totalVariations / guidingPrompt / analysis are handled by
  // useSessionPersistedState above; script/scriptOverridden are lazy-seeded from
  // storage at the top, so restoration is already done — only persistence remains.
  // Chat mode persists to script-override; free-form to free-form-script (below).
  const scriptOverrideKey = sessionKey ? `tsl-v2:script-override:${sessionKey}` : null;

  useEffect(() => {
    if (!scriptOverrideKey || !chatId) return;
    try {
      if (scriptOverridden && script) window.localStorage.setItem(scriptOverrideKey, script);
      else window.localStorage.removeItem(scriptOverrideKey);
    } catch { /* ignore */ }
  }, [scriptOverrideKey, chatId, scriptOverridden, script]);

  // Keep this session marked as recently used and prune sessions that haven't
  // been opened in 30 days (localStorage never expires on its own).
  useEffect(() => {
    if (!sessionKey) return;
    touchTslSession(sessionKey);
    sweepStaleTslSessions();
  }, [sessionKey]);

  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushedBuildId, setPushedBuildId] = useState<string | null>(null);

  const chatQ = useQuery<ChatPayload>({
    queryKey: chatId ? [`/api/tsl/chats/${chatId}/messages`] : ["no-chat-develop"],
    queryFn: pipelineQueryFn,
    enabled: !!chatId,
  });
  useEffect(() => {
    if (!chatId || !chatQ.data) return;
    // Always resolve the product from the chat (independent of the script).
    setProductSlug(chatQ.data.chat.product);
    // Seed the script from the chat message only when not overridden — an
    // override (set here or by the Final-review editor) must not be clobbered.
    if (!scriptOverridden) {
      const lastAssistant = [...chatQ.data.messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) setScript(parseScriptMessage(lastAssistant.content).body);
    }
  }, [chatId, chatQ.data, scriptOverridden]);

  useEffect(() => {
    if (chatId && script.length > 200 && productSlug && !analysis && !analyzing) {
      void onAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, script, productSlug]);

  const productsQ = useQuery<ProductSummary[]>({
    queryKey: ["/api/tsl/products"],
    queryFn: pipelineQueryFn,
  });
  const products = productsQ.data || [];

  const productLabel =
    products.find((p) => p.id === productSlug)?.name || productSlug;

  const onSelectAllPresets = () => {
    setSelectedCats(CATEGORY_GRID.filter((c) => c.id !== FREE_FORM_CATEGORY_ID).map((c) => c.id));
  };
  const onResetToFreeForm = () => {
    setSelectedCats([FREE_FORM_CATEGORY_ID]);
  };

  const onAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const res = await apiRequest("POST", "/api/tsl/analyze-script", {
        chatId,
        script,
        productSlug,
      });
      const data = (await res.json()) as AnalyzeResponse;
      setAnalysis(data);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleCat = (id: string) => {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const splitPreview = useMemo(() => {
    const counts = splitBudget(totalVariations, selectedCats.length);
    return selectedCats.map((catId, i) => ({ id: catId, count: counts[i] || 0 }));
  }, [totalVariations, selectedCats]);

  const onGenerate = async () => {
    if (!analysis && !selectedCats.includes(FREE_FORM_CATEGORY_ID)) return;
    setGenerating(true);
    setGenerateError(null);
    setGeneratedImages([]); // start empty so images can be appended as they stream in
    setPerCategory(null);
    setRenderFailures([]);
    setPendingSelections(new Set());
    clearGeneratedImages(sessionKey);
    setGenProgress({ done: 0, succeeded: 0, total: totalVariations, startedAt: Date.now() });

    const aspectRatiosByCategory: Record<string, "4:5" | "1:1"> = {};
    for (const cid of selectedCats) {
      aspectRatiosByCategory[cid] = aspectForCategory(cid);
    }
    const prefixUrl = (url: string) => url.startsWith("http") ? url : `${API_BASE}${url}`;
    const streamed: GeneratedImage[] = [];
    // Local accumulator (not just state) so the snapshot save below reads the full
    // list instead of a stale closure value.
    const failuresLocal: Array<{ categoryId?: string; reason: string }> = [];
    let finalPerCategory: Array<{ categoryId: string; images: Array<{ url: string }> }> | null = null;

    try {
      const body = JSON.stringify({
        chatId,
        productSlug: productSlug || undefined,
        scriptHash: analysis?.scriptHash,
        categoryIds: selectedCats,
        totalVariations,
        guidingPrompt: guidingPrompt || undefined,
        aspectRatio: "4:5",
        aspectRatiosByCategory,
        includeProductImage,
        productImageUrl: productImageUrl || undefined,
        productProminent,
        imageModel,
        operatorReferenceImages: referenceImages.map((r) => ({ dataUrl: r.dataUrl, label: r.label })),
      });
      const headers = authHeaders({ "Content-Type": "application/json" });

      for await (const ev of readSseStream(`${PIPELINE_API_BASE}/api/tsl/generate-images-v2/stream`, { headers, body })) {
        const data = ev.data as Record<string, unknown> | undefined;
        if (ev.event === "image" && data && typeof data === "object") {
          const img = data.image as (GeneratedImage & { url: string }) | undefined;
          if (img && img.url) {
            const prefixed = { ...img, url: prefixUrl(img.url) } as GeneratedImage;
            streamed.push(prefixed);
            setGeneratedImages([...streamed]);
          }
          setGenProgress((prev) => prev ? { ...prev, done: Number(data.done) || prev.done, succeeded: Number(data.succeeded) || prev.succeeded } : prev);
        } else if (ev.event === "failure" && data) {
          setGenProgress((prev) => prev ? { ...prev, done: Number(data.done) || prev.done, succeeded: Number(data.succeeded) || prev.succeeded } : prev);
          if (data.reason) {
            failuresLocal.push({ categoryId: String(data.categoryId || ""), reason: String(data.reason) });
            setRenderFailures([...failuresLocal]);
          }
        } else if (ev.event === "done" && data) {
          finalPerCategory = (data.perCategory as typeof finalPerCategory) ?? null;
          // Category-level failures (e.g. prompt fan-out died before any render started).
          // The server also streams these as `failure` events, so dedupe on categoryId+reason.
          const catFailures = data.failures as Array<{ categoryId?: string; reason?: string }> | undefined;
          if (Array.isArray(catFailures) && catFailures.length > 0) {
            const seen = new Set(failuresLocal.map((f) => `${f.categoryId}|${f.reason}`));
            for (const f of catFailures) {
              if (!f.reason) continue;
              const key = `${String(f.categoryId || "")}|${String(f.reason)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              failuresLocal.push({ categoryId: String(f.categoryId || ""), reason: String(f.reason) });
            }
            setRenderFailures([...failuresLocal]);
          }
        } else if (ev.event === "error" && data) {
          throw new Error(String(data.error || "stream error"));
        }
      }

      const prefixedPerCategory = finalPerCategory
        ? finalPerCategory.map((c) => ({ ...c, images: c.images.map((i) => ({ ...i, url: prefixUrl(i.url) })) }))
        : null;
      setPerCategory(prefixedPerCategory);
      saveGeneratedImages(sessionKey, {
        images: streamed,
        perCategory: prefixedPerCategory ?? [],
        renderFailures: failuresLocal,
        savedAt: Date.now(),
      });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
      setGenProgress(null);
    }
  };

  const togglePending = (url: string) => {
    setPendingSelections((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const onAddPendingToTray = () => {
    if (!generatedImages) return;
    const picks = generatedImages.filter((g) => pendingSelections.has(g.url));
    if (picks.length === 0) return;
    setApproved((prev) => addToTray(prev, picks, round, Date.now()));
    setPendingSelections(new Set());
    setRound((r) => r + 1);
    setTrayExpanded(true);
  };

  const onRemoveFromTray = (dedupeKey: string) => {
    setApproved((prev) => removeFromTray(prev, dedupeKey));
  };

  const onClearTray = () => {
    if (!sessionKey) return;
    if (!confirm("Clear the entire approved tray? This cannot be undone (but the images themselves stay on disk).")) return;
    setApproved([]);
    clearTray(sessionKey);
  };

  // Manually-added images (pasted link / uploaded file) land in the tray exactly
  // like a generated one — same shape, dedup by url, X-removable, flows to push.
  // The backend returns a relative /api/tsl/… path; prefix it with the pipeline
  // API base the same way generated images are, so the <img> actually resolves.
  const [addImageOpen, setAddImageOpen] = useState(false);
  const onAddManualImage = (img: GeneratedImage) => {
    const url = img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;
    setApproved((prev) => addToTray(prev, [{ ...img, url }], round, Date.now()));
    setRound((r) => r + 1);
    setTrayExpanded(true);
  };

  const canAnalyze = script.trim().length > 80 && !!productSlug;
  const hasFreeForm = selectedCats.includes(FREE_FORM_CATEGORY_ID);
  const onlyFreeForm = hasFreeForm && selectedCats.length === 1;
  const freeFormMissingPrompt = hasFreeForm && guidingPrompt.trim().length === 0;
  const canGenerate =
    selectedCats.length > 0 &&
    totalVariations >= 1 &&
    (onlyFreeForm || !!analysis) &&
    !freeFormMissingPrompt;
  const canPush = approved.length > 0;

  let generateBlockedReason: string | null = null;
  if (selectedCats.length === 0) {
    generateBlockedReason = "Pick at least one category from the grid above.";
  } else if (freeFormMissingPrompt) {
    generateBlockedReason = "Free-form needs a prompt — type your description in the box below.";
  } else if (!onlyFreeForm && !analysis) {
    generateBlockedReason = "Analyze the script first — the analysis pane appears once it's done. (Free-form is the only category that works without analysis.)";
  } else if (totalVariations < selectedCats.length) {
    generateBlockedReason = `You picked ${selectedCats.length} categories but only ${totalVariations} variations — raise the slider so each category gets ≥1 image.`;
  }

  const onPushConcept = async () => {
    if (approved.length === 0) return;
    const slug = analysis?.productSlug || productSlug;
    if (!slug) {
      setPushError("No product slug — pick a product before pushing.");
      return;
    }
    setPushing(true);
    setPushError(null);
    setPushedBuildId(null);
    try {
      const payload = {
        chatId,
        scriptHash: analysis?.scriptHash || undefined,
        productSlug: slug,
        funnel: "TSL",
        cs: "Agentic",
        imagesPerAdset: approved.length,
        existingScriptId: scriptIdMode === "iterate" && scriptIdExisting ? scriptIdExisting : undefined,
        images: approved.map((i) => ({
          url: i.url,
          driveFileId: i.driveFileId || null,
          category_id: i.category_id,
          prompt: i.prompt,
          variation_note: i.variation_note,
        })),
      };
      const res = await apiRequest("POST", "/api/tsl/builds", payload);
      const data = (await res.json()) as { id: string };
      setPushedBuildId(data.id);
      // Build pushed — this session's scratch data is no longer needed.
      if (sessionKey) clearTslSession(sessionKey);
      setApproved([]);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  };

  const startScriptEdit = () => {
    setScriptDraft(script);
    setEditingScript(true);
  };
  const cancelScriptEdit = () => setEditingScript(false);
  const saveScriptEdit = () => {
    setScript(scriptDraft);
    if (chatId) setScriptOverridden(true); // mark as an override so it persists + survives the chat re-seed
    setEditingScript(false);
  };

  // When entering edit mode, focus the textarea and drop the caret at the end.
  useEffect(() => {
    if (!editingScript) return;
    const el = scriptDraftRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingScript]);

  // suppress unused warning — pushedBuildId is displayed in the push success banner
  void pushedBuildId;
  void pushing;
  void pushError;
  void canPush;
  void onPushConcept;
  void oneLineSummary;

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-6 bg-background min-h-full">
        <header className="flex items-baseline gap-3 mb-6 flex-wrap">
          <FileImage className="size-5 text-primary self-center shrink-0" />
          <div className="min-w-0 flex flex-col gap-0.5">
            <h1 className="text-lg font-semibold leading-tight">Develop TSL</h1>
            {productSlug && (
              <p className="text-xs text-muted-foreground font-medium" data-testid="develop-product-label">
                {productLabel}
                {chatId && (
                  <span className="ml-2 text-muted-foreground/60 font-normal">
                    · chat {chatId.slice(0, 8)}…
                  </span>
                )}
              </p>
            )}
          </div>
          <Link to="/tsl-builder/tsl-log" className="ml-auto text-xs text-primary hover:underline self-center">
            TSL Log →
          </Link>
        </header>

        <section className="max-w-5xl space-y-4">
          {/* ─── Script ─────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg p-4" data-testid="script-pane">
            {!chatId && (
              <div className="mb-3">
                <label className="text-xs text-muted-foreground block mb-1">Product</label>
                <Select value={productSlug} onValueChange={setProductSlug} data-testid="develop-product-select">
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue placeholder="Pick a product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Script header + edit controls (mirrors the Final-review page) */}
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <h3 className="text-sm font-semibold tracking-tight inline-flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Script
              </h3>
              {editingScript ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelScriptEdit}
                    className="h-7 px-2.5 text-xs text-muted-foreground"
                    data-testid="script-edit-cancel"
                  >
                    <X className="size-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveScriptEdit}
                    className="h-7 px-3 text-xs"
                    data-testid="script-edit-save"
                  >
                    <Check className="size-3.5 mr-1" /> Save
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startScriptEdit}
                  className="h-7 px-2.5 text-xs"
                  data-testid="script-edit-toggle"
                >
                  <Pencil className="size-3.5 mr-1" /> Edit
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[11.5px] mb-2">
              {(() => {
                const active = editingScript ? scriptDraft : script;
                return active ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {(active.match(/\b[A-Za-z0-9]+\b/g) || []).length} words
                  </span>
                ) : null;
              })()}
              {chatId && scriptOverridden && !editingScript && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium">
                  edited
                </span>
              )}
            </div>

            {editingScript ? (
              <>
                <textarea
                  ref={scriptDraftRef}
                  value={scriptDraft}
                  onChange={(e) => setScriptDraft(e.target.value)}
                  onPaste={(e) => {
                    // Google Docs separates paragraphs with margin, not blank
                    // lines, so its plain-text clipboard loses the spacing. Rebuild
                    // it from the HTML flavor when present.
                    const el = e.currentTarget;
                    const result = applyRichPaste(
                      e.clipboardData.getData("text/html"),
                      scriptDraft,
                      el.selectionStart ?? scriptDraft.length,
                      el.selectionEnd ?? scriptDraft.length,
                    );
                    if (!result.handled) return; // no usable HTML -> default paste
                    e.preventDefault();
                    setScriptDraft(result.nextValue);
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = result.caret;
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelScriptEdit();
                    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      saveScriptEdit();
                    }
                  }}
                  spellCheck
                  placeholder="Paste or write the TSL body here…"
                  className="w-full whitespace-pre-wrap font-sans text-foreground/90 text-[13px] leading-relaxed bg-background border border-primary/40 rounded-lg p-4 h-[44vh] min-h-[260px] overflow-y-auto resize-y ring-2 ring-primary/20 focus:ring-primary/30 focus:outline-none transition-shadow"
                  data-testid="develop-script-textarea"
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  This is the TSL text used for analysis and shared with the Final review page.
                  <span className="ml-1 text-muted-foreground/70">
                    Press <kbd className="px-1 rounded border border-border bg-muted/50 font-mono text-[10px]">Esc</kbd> to cancel,
                    {" "}<kbd className="px-1 rounded border border-border bg-muted/50 font-mono text-[10px]">⌘/Ctrl + ↵</kbd> to save.
                  </span>
                </p>
              </>
            ) : script ? (
              <pre
                onDoubleClick={startScriptEdit}
                title="Double-click to edit"
                className="whitespace-pre-wrap font-sans text-foreground/90 text-[13px] leading-relaxed bg-background border border-border rounded-lg p-4 h-[44vh] min-h-[260px] overflow-y-auto cursor-text hover:border-primary/30 transition-colors"
                data-testid="script-body-preview"
              >
                {script}
              </pre>
            ) : chatId && chatQ.isLoading ? (
              <div className="border border-dashed border-border rounded-lg p-6 flex items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading script…
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-lg p-6 text-center text-[12.5px] text-muted-foreground">
                No script yet — click <span className="font-medium text-foreground">Edit</span> to add one.
              </div>
            )}
            {!editingScript && script && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tip: <span className="font-medium text-foreground">double-click</span> the script to edit it.
              </p>
            )}

            {!editingScript && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={onAnalyze}
                  disabled={!canAnalyze || analyzing}
                  size="sm"
                  data-testid="analyze-button"
                >
                  {analyzing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {analysis ? "Re-analyze" : "Analyze"}
                </Button>
              </div>
            )}
            {analyzing && (
              <div className="mt-3">
                <ProgressTimer
                  active={analyzing}
                  estimatedMs={8000}
                  label="Analyzing script — extracting characters, mechanism, opener…"
                  testId="analyze-progress"
                />
              </div>
            )}
            {analyzeError && (
              <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <p>{analyzeError}</p>
              </div>
            )}
          </div>

          {/* ─── Script ID treatment ────────────────────────────────────── */}
          {productSlug && (
            <div className="bg-card border border-border rounded-lg p-4 shadow-card-sm space-y-3" data-testid="script-id-pane">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Script ID</h3>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    {scriptIdMode === "new"
                      ? "A fresh tsl_script_id will be minted when you push."
                      : "Reuses an existing script — pick which one below."}
                  </p>
                </div>
                <div className="inline-flex rounded-md border border-border bg-background overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setScriptIdMode("new")}
                    className={
                      scriptIdMode === "new"
                        ? "px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground"
                        : "px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    }
                    data-testid="script-id-mode-new"
                  >
                    New script
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptIdMode("iterate")}
                    className={
                      scriptIdMode === "iterate"
                        ? "px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground"
                        : "px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    }
                    data-testid="script-id-mode-iterate"
                  >
                    Iterate existing
                  </button>
                </div>
              </div>
              {scriptIdMode === "iterate" && (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={scriptIdSearch}
                    onChange={(e) => setScriptIdSearch(e.target.value)}
                    placeholder="search by angle / summary / id"
                    data-testid="script-id-search"
                  />
                  {scriptListQ.isLoading ? (
                    <div className="space-y-2">
                      <div className="skeleton h-10 rounded-md" />
                      <div className="skeleton h-10 rounded-md" />
                    </div>
                  ) : (scriptListQ.data?.rows || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic px-1">
                      No existing scripts found for {productSlug}.
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border bg-background">
                      {(scriptListQ.data?.rows || []).map((s) => {
                        const picked = scriptIdExisting === s.tsl_script_id;
                        return (
                          <button
                            key={s.tsl_script_id}
                            type="button"
                            onClick={() => setScriptIdExisting(s.tsl_script_id)}
                            className={
                              picked
                                ? "w-full px-3 py-2 text-left bg-primary/10 hover:bg-primary/15"
                                : "w-full px-3 py-2 text-left hover:bg-muted/30"
                            }
                            data-testid={`script-id-pick-${s.tsl_script_id}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {picked && <Check className="size-3.5 text-primary shrink-0" />}
                              <span className="text-xs font-mono font-semibold">{s.tsl_script_id}</span>
                              {s.variation !== null && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  v{s.variation}
                                </span>
                              )}
                              {s.angle && (
                                <span className="text-[11px] text-muted-foreground truncate">
                                  · {s.angle}
                                </span>
                              )}
                            </div>
                            {s.summary && (
                              <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1 ml-5">
                                {s.summary}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Analysis ───────────────────────────────────────────────── */}
          {analysis && (
            <div className="bg-card border border-border rounded-lg p-4" data-testid="analysis-pane">
              <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-medium">Script analysis</h3>
                <span className="text-[11px] text-muted-foreground">
                  derived from the chat above
                </span>
              </div>
              <dl
                className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm"
                data-testid="analysis-grid"
              >
                {analysisRows(analysis.analysis).map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-muted-foreground font-medium tracking-tight whitespace-nowrap">
                      {r.label}
                    </dt>
                    <dd
                      className={
                        r.emphasis === "muted"
                          ? "text-muted-foreground/60 italic"
                          : "text-foreground/95"
                      }
                      title={r.fullValue}
                    >
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={() => setDetailExpanded((v) => !v)}
                className="mt-4 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                data-testid="toggle-analysis-detail"
              >
                {detailExpanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                {detailExpanded ? "Hide strategist note" : "Show strategist note"}
              </button>
              {detailExpanded && (
                <p
                  className="mt-3 text-sm leading-relaxed text-foreground/85 border-l-2 border-primary/30 pl-3"
                  data-testid="analysis-detail"
                >
                  {detailParagraph(analysis.analysis)}
                </p>
              )}
            </div>
          )}

          {/* ─── Categories ─────────────────────────────────────────────── */}
          {(analysis || productSlug) && (
            <div
              className={
                generating
                  ? "bg-card border border-border rounded-lg p-4 opacity-60 pointer-events-none select-none"
                  : "bg-card border border-border rounded-lg p-4"
              }
              data-testid="categories-pane"
              aria-disabled={generating || undefined}
            >
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-sm font-medium">
                  Categories to generate
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {selectedCats.length} selected
                  </span>
                </h3>
                <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                  <button
                    type="button"
                    onClick={onSelectAllPresets}
                    disabled={!analysis}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-background hover:border-primary/40 hover:text-foreground text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="select-all-presets"
                    title={!analysis ? "Analyze the script first" : "Select all 15 preset categories (free-form excluded)"}
                  >
                    Select all presets
                  </button>
                  <button
                    type="button"
                    onClick={onResetToFreeForm}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-background hover:border-primary/40 hover:text-foreground text-muted-foreground transition-colors"
                    data-testid="reset-to-free-form"
                    title="Clear selection, pick free-form only"
                  >
                    Reset to free-form
                  </button>
                </div>
              </div>
              {!analysis && (
                <p className="text-[11.5px] text-muted-foreground mb-2 italic" data-testid="presets-locked-note">
                  Preset categories unlock after you analyze the script. Free-form is always available.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {CATEGORY_GRID.map((cat) => {
                  const active = selectedCats.includes(cat.id);
                  const num = cat.id.split("-")[0];
                  const isFreeForm = cat.id === FREE_FORM_CATEGORY_ID;
                  const locked = !analysis && !isFreeForm;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => !locked && toggleCat(cat.id)}
                      disabled={locked}
                      title={locked ? "Analyze the script first to unlock this preset category" : undefined}
                      className={
                        locked
                          ? "border border-dashed border-border/40 bg-muted/10 rounded-md px-3 py-2 text-left opacity-40 cursor-not-allowed"
                          : active
                          ? "border border-primary/60 bg-primary/10 rounded-md px-3 py-2 text-left transition-colors"
                          : "border border-border bg-background hover:border-muted-foreground/40 rounded-md px-3 py-2 text-left transition-colors"
                      }
                      data-testid={`category-${cat.id}`}
                      data-locked={locked ? "true" : "false"}
                    >
                      <div className="text-sm font-medium">
                        <span className="text-muted-foreground mr-1.5">{num}</span>
                        {cat.label}
                        {locked && (
                          <span className="ml-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                            locked
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {cat.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Variations + Generate ──────────────────────────────────── */}
          {(analysis || onlyFreeForm) && selectedCats.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4" data-testid="variations-pane">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="text-sm font-medium">Variations</h3>
                {totalVariations >= MAX_TOTAL_VARIATIONS && (
                  <span className="text-[11px] font-medium text-amber-500" data-testid="variations-cap-note">
                    Limit reached — {MAX_TOTAL_VARIATIONS} images max per generation
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <Slider
                  min={1}
                  max={MAX_TOTAL_VARIATIONS}
                  step={1}
                  value={[totalVariations]}
                  onValueChange={([v]) => setTotalVariations(v)}
                  disabled={generating}
                  className="flex-1 min-w-[120px]"
                  data-testid="variations-slider"
                />
                <Input
                  type="number"
                  min={1}
                  max={MAX_TOTAL_VARIATIONS}
                  value={totalVariations}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(MAX_TOTAL_VARIATIONS, Number(e.target.value) || 1));
                    setTotalVariations(v);
                  }}
                  disabled={generating}
                  className="w-20 text-center"
                  data-testid="variations-number"
                />
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {totalVariations} images split across {selectedCats.length} categories:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs mb-4">
                {splitPreview.map((p) => {
                  const cat = CATEGORY_GRID.find((c) => c.id === p.id);
                  const ratio = aspectForCategory(p.id);
                  const setRatio = (r: "4:5" | "1:1") =>
                    setCategoryAspectRatios((prev) => ({ ...prev, [p.id]: r }));
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-background rounded-md px-2 py-1.5 border border-border gap-2"
                      data-testid={`variations-row-${p.id}`}
                    >
                      <span className="truncate flex-1">{cat?.label || p.id}</span>
                      <span className="text-primary tabular-nums" data-testid={`variations-count-${p.id}`}>
                        {p.count}
                      </span>
                      <div
                        className="inline-flex items-center bg-muted/40 border border-border rounded-full p-0.5 gap-0.5 shrink-0"
                        data-testid={`aspect-toggle-${p.id}`}
                        role="group"
                        aria-label={`Aspect ratio for ${cat?.label || p.id}`}
                      >
                        <button
                          type="button"
                          onClick={() => setRatio("4:5")}
                          disabled={generating}
                          className={
                            ratio === "4:5"
                              ? "px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary text-primary-foreground shadow-sm"
                              : "px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          }
                          title="Vertical 4:5 (default feed format)"
                          data-testid={`aspect-toggle-${p.id}-4-5`}
                          aria-pressed={ratio === "4:5"}
                        >
                          4:5
                        </button>
                        <button
                          type="button"
                          onClick={() => setRatio("1:1")}
                          disabled={generating}
                          className={
                            ratio === "1:1"
                              ? "px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary text-primary-foreground shadow-sm"
                              : "px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          }
                          title="Square 1:1"
                          data-testid={`aspect-toggle-${p.id}-1-1`}
                          aria-pressed={ratio === "1:1"}
                        >
                          1:1
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mb-3">
                <label className="text-xs text-muted-foreground block mb-1">
                  {hasFreeForm
                    ? onlyFreeForm
                      ? "Prompt (required — sent verbatim to Gemini, no presets applied)"
                      : "Prompt (bias on the 15 presets · required for free-form · sent verbatim there)"
                    : "Optional direction (bias only — never overrides what the script established)"}
                </label>
                <Textarea
                  value={guidingPrompt}
                  onChange={(e) => setGuidingPrompt(e.target.value)}
                  rows={hasFreeForm ? 4 : 2}
                  placeholder={
                    hasFreeForm
                      ? "describe exactly what you want to see — composition, mood, props, lighting…"
                      : "e.g. lean into the laundry-room beats"
                  }
                  className={freeFormMissingPrompt ? "border-amber-500/60 ring-1 ring-amber-500/30 resize-y" : "resize-y"}
                  data-testid="guiding-prompt"
                  disabled={generating}
                />
              </div>

              <div
                className="mb-3 hidden items-start gap-2"
                data-testid="include-product-checkbox"
              >
                <Checkbox
                  id="include-product-image"
                  checked={includeProductImage}
                  onCheckedChange={(checked) => setIncludeProductImage(!!checked)}
                  disabled={generating}
                  className="mt-0.5"
                />
                <label htmlFor="include-product-image" className="flex flex-col gap-0.5 cursor-pointer select-none">
                  <span className="text-sm font-medium text-foreground">
                    Include product in image
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-snug">
                    Composites the real product into the scene with its exact
                    packaging and label preserved from the reference image. It
                    rests naturally on a surface by default; phrase your prompt
                    if a scene should show it held. Exactly one product, no
                    distorted labels.
                  </span>
                </label>
              </div>

              {includeProductImage && selectedProductFreeCats.length > 0 && (
                <div
                  className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-snug text-amber-700"
                  data-testid="product-free-warning"
                >
                  ⚠️ The product won't appear in{" "}
                  {selectedProductFreeCats.length === 1 ? "this selected category" : "these selected categories"}:{" "}
                  <span className="font-semibold">{selectedProductFreeCats.map((c) => `${c.id.split("-")[0]} ${c.label}`).join(", ")}</span>{" "}
                  — {selectedProductFreeCats.length === 1 ? "it's a" : "they're"} product-free beat
                  {selectedProductFreeCats.length === 1 ? "" : "s"} by design (mechanism / diagram / failed-solutions).
                  Your other selected categories will still show the product.
                </div>
              )}

              {includeProductImage && (
                <div className="mb-3 rounded-md border border-border/60 p-3">
                  <ProductReferencePicker
                    label="Product image (the label authority)"
                    hint="Pick the clearest front-label shot, or leave Auto. This is the image the AI copies the label from."
                    images={productPickerImages}
                    value={productImageUrl ? [productImageUrl] : []}
                    onChange={(urls) => setProductImageUrl(urls[0] ?? null)}
                    single
                    showAuto
                    disabled={generating}
                  />
                  <label className="mt-1 flex items-start gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={productProminent}
                      onCheckedChange={(c) => setProductProminent(!!c)}
                      disabled={generating}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">Feature product prominently</span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Renders the product large in the foreground with its label facing the
                        camera, so the brand/label is clearly readable. Best when the label must
                        be legible (off by default so normal b-roll scenes aren't forced into product close-ups).
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* ─── Reference-image upload ──────────────────────────────── */}
              {(() => {
                const dragging = (windowDragActive || zoneDragActive) && !generating && referenceImages.length < 3;
                return (
                  <div
                    className={
                      generating
                        ? "mb-3 border-2 border-dashed border-border/60 rounded-md p-3 opacity-50 pointer-events-none"
                        : dragging
                        ? "mb-3 relative border-2 border-dashed border-primary rounded-md p-4 bg-primary/10 ring-4 ring-primary/30 shadow-card-md scale-[1.01] transition-all duration-150"
                        : "mb-3 border-2 border-dashed border-border/60 hover:border-primary/40 rounded-md p-3 transition-all duration-150"
                    }
                    onDragEnter={(e) => {
                      if (generating) return;
                      e.preventDefault();
                      setZoneDragActive(true);
                    }}
                    onDragOver={(e) => {
                      if (generating) return;
                      e.preventDefault();
                      setZoneDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      const t = e.currentTarget as HTMLElement;
                      const r = e.relatedTarget as Node | null;
                      if (!r || !t.contains(r)) setZoneDragActive(false);
                    }}
                    onDrop={(e) => {
                      if (generating) return;
                      e.preventDefault();
                      setZoneDragActive(false);
                      setWindowDragActive(false);
                      const files = Array.from(e.dataTransfer.files || []);
                      for (const f of files.slice(0, 3 - referenceImages.length)) onReferenceFile(f);
                    }}
                    data-testid="reference-upload-zone"
                    data-drag-active={dragging ? "true" : "false"}
                  >
                    {dragging && (
                      <div
                        className="absolute inset-0 flex items-center justify-center rounded-md pointer-events-none animate-in fade-in zoom-in-95 duration-150"
                        data-testid="reference-drop-active-overlay"
                      >
                        <div className="flex flex-col items-center gap-2 text-primary">
                          <div className="size-12 rounded-full bg-primary/15 flex items-center justify-center animate-pulse">
                            <ImagePlus className="size-6" />
                          </div>
                          <div className="text-sm font-semibold tracking-tight">
                            Drop the image here
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Will become reference {referenceImages.length + 1} of 3
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      className={
                        dragging
                          ? "flex items-start gap-3 opacity-20 transition-opacity duration-150 flex-wrap"
                          : "flex items-start gap-3 transition-opacity duration-150 flex-wrap"
                      }
                    >
                      <ImagePlus className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            Reference images
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {referenceImages.length}/3 attached · optional
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          Drop an image anywhere on this card or hit Upload. The
                          prompt above describes what to <em>change</em> from it
                          ("same shot but make the person a man", "this composition
                          with a green background instead"). Max 3 references, 5 MB
                          each.
                        </p>
                        {referenceImages.length > 0 && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {referenceImages.map((r, i) => (
                              <div
                                key={i}
                                className="relative size-16 rounded-md overflow-hidden border border-border bg-muted/20"
                                data-testid={`ref-img-${i}`}
                              >
                                <img src={r.dataUrl} alt={r.label || `reference-${i + 1}`} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => onRemoveReference(i)}
                                  className="absolute top-0.5 right-0.5 size-5 rounded-full bg-background/90 border border-border text-foreground hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center text-[10px]"
                                  title="Remove"
                                  data-testid={`ref-img-remove-${i}`}
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <label
                        className="shrink-0 cursor-pointer text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:border-primary/40 hover:text-foreground text-muted-foreground transition-colors"
                        data-testid="upload-reference-button"
                      >
                        <Upload className="size-3.5" />
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            for (const f of files.slice(0, 3 - referenceImages.length)) onReferenceFile(f);
                            e.target.value = "";
                          }}
                          disabled={referenceImages.length >= 3}
                        />
                      </label>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Image model</span>
                  <Select value={imageModel} onValueChange={(v) => setImageModel(v as "gemini" | "gpt")}>
                    <SelectTrigger className="h-9 w-auto gap-1.5 text-xs" data-testid="image-model-select">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini — gemini-3-pro-image-preview</SelectItem>
                      <SelectItem value="gpt">GPT — gpt-image-2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={!canGenerate || generating}
                  className="btn-3d bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed font-medium px-4 py-2 rounded-md text-sm inline-flex items-center gap-2"
                  data-testid="generate-button"
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                  <span>
                    {generating ? "Generating…" : `Generate ${totalVariations} images`}
                  </span>
                </button>
                {!canGenerate && !generating && generateBlockedReason && (
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="generate-blocked-reason"
                  >
                    {generateBlockedReason}
                  </span>
                )}
              </div>
              {generating && (
                <div className="mt-3">
                  <RealProgressBar
                    progress={genProgress}
                    modelLabel={imageModel === "gpt" ? "GPT (gpt-image-2)" : "Gemini"}
                    label={`Generating ${totalVariations} image${totalVariations === 1 ? "" : "s"} across ${selectedCats.length} categor${selectedCats.length === 1 ? "y" : "ies"}…`}
                    testId="generate-progress"
                  />
                </div>
              )}
              {generateError && (
                <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <p>{generateError}</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Render failures (real reasons from the server) ─────────── */}
          {renderFailures.length > 0 && (
            <div className="bg-card border border-amber-500/40 rounded-lg p-4" data-testid="render-failures">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-400" />
                <h3 className="text-sm font-medium">
                  {renderFailures.length} image{renderFailures.length === 1 ? "" : "s"} failed to render
                </h3>
              </div>
              <div className="space-y-2">
                {summarizeRenderFailures(renderFailures).map((g, i) => (
                  <div key={i} className="text-xs" data-testid={`render-failure-group-${i}`}>
                    <p className="text-foreground">
                      <span className="tabular-nums text-amber-400">{g.count}×</span> {g.label}
                    </p>
                    {g.hint && <p className="text-muted-foreground mt-0.5">{g.hint}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Per-category hit rate ──────────────────────────────────── */}
          {perCategory && (
            <div className="bg-card border border-border rounded-lg p-4" data-testid="hit-rate">
              <h3 className="text-sm font-medium mb-2">Per-category delivery</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Amber = fewer images delivered than requested. In the hero categories (mechanism + product ritual) that can be the prompt lockdown dropping a model slip before it reaches the image model — by design. Anywhere else (especially Free form) it means renders failed — the reasons are listed above.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                {splitPreview.map((s) => {
                  const cat = CATEGORY_GRID.find((c) => c.id === s.id);
                  const got = perCategory.find((p) => p.categoryId === s.id)?.images.length || 0;
                  const ok = got >= s.count;
                  return (
                    <div
                      key={s.id}
                      className={
                        ok
                          ? "flex items-center justify-between bg-primary/5 border border-primary/30 rounded-md px-2 py-1"
                          : "flex items-center justify-between bg-amber-500/5 border border-amber-500/30 rounded-md px-2 py-1"
                      }
                    >
                      <span className="truncate text-foreground">{cat?.label || s.id}</span>
                      <span className={ok ? "tabular-nums text-primary" : "tabular-nums text-amber-400"}>
                        {got}/{s.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Generated images ───────────────────────────────────────── */}
          {generatedImages && (
            <div className="bg-card border border-border rounded-lg p-4 pb-6" data-testid="generated-images">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-medium">
                  Generated images
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    round {round} · {generatedImages.length} returned
                  </span>
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Tick the keepers — they collect in the approved tray below.
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {generatedImages.map((img, i) => {
                  const cat = CATEGORY_GRID.find((c) => c.id === img.category_id);
                  const isPicked = pendingSelections.has(img.url);
                  const alreadyApproved = approved.some((a) => a.dedupeKey === img.url);
                  const filename = img.url.split("/").pop() || `tsl-image-${i + 1}.jpg`;
                  return (
                    <div
                      key={i}
                      className={
                        alreadyApproved
                          ? "relative bg-background rounded-md border border-emerald-500/60 ring-2 ring-emerald-500/30 overflow-hidden"
                          : isPicked
                          ? "relative bg-background rounded-md border-2 border-primary ring-2 ring-primary/30 overflow-hidden"
                          : "relative bg-background rounded-md border border-border hover:border-primary/40 overflow-hidden transition-colors"
                      }
                      data-testid={`gen-img-${i}`}
                    >
                      <button
                        type="button"
                        onClick={() => !alreadyApproved && togglePending(img.url)}
                        disabled={alreadyApproved}
                        title={alreadyApproved ? "Already in the approved tray" : (isPicked ? "Untick" : "Tick to approve")}
                        className="w-full text-left disabled:cursor-not-allowed group"
                        data-testid={`gen-img-toggle-${i}`}
                      >
                        <div className="relative">
                          <div
                            className={
                              isPicked || alreadyApproved
                                ? "absolute top-2 left-2 size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-md z-10"
                                : "absolute top-2 left-2 size-6 rounded-md bg-background/85 backdrop-blur border border-border flex items-center justify-center z-10 group-hover:border-primary/60"
                            }
                          >
                            {(isPicked || alreadyApproved) && <Check className="size-4" />}
                          </div>
                          <img
                            src={img.url}
                            alt={img.variation_note}
                            className={
                              aspectForCategory(img.category_id) === "1:1"
                                ? "w-full aspect-square object-cover"
                                : "w-full aspect-[4/5] object-cover"
                            }
                            loading="lazy"
                          />
                        </div>
                      </button>

                      <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomImage({ url: img.url, alt: img.variation_note });
                          }}
                          className="size-7 rounded-md bg-background/85 backdrop-blur border border-border text-foreground hover:bg-card hover:border-primary/60 shadow-sm flex items-center justify-center transition-colors"
                          title="Preview (zoom)"
                          data-testid={`gen-img-zoom-${i}`}
                        >
                          <ZoomIn className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadImage(img.url, filename);
                          }}
                          className="size-7 rounded-md bg-background/85 backdrop-blur border border-border text-foreground hover:bg-card hover:border-primary/60 shadow-sm flex items-center justify-center transition-colors"
                          title="Download to your computer"
                          data-testid={`gen-img-download-${i}`}
                        >
                          <Download className="size-3.5" />
                        </button>
                      </div>

                      <div className="p-2 text-xs">
                        <div className="text-foreground font-medium" title={cat?.label || img.category_id}>
                          {cat?.label || img.category_id}
                        </div>
                        <div className="text-muted-foreground mt-0.5 whitespace-normal break-words leading-snug">
                          {img.variation_note}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Approved tray ──────────────────────────────────────────── */}
          {/* Always shown so a ready image can be dropped in without generating. */}
          <div
            className={
              "rounded-lg p-4 shadow-md bg-card border " +
              (approved.length > 0 ? "border-emerald-500/40" : "border-border")
            }
            data-testid="approved-tray"
          >
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                {approved.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTrayExpanded((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium hover:text-primary"
                    data-testid="tray-toggle"
                  >
                    {trayExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    <span>Approved images</span>
                    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 dark:text-emerald-300 border border-emerald-500/40">
                      {approved.length}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      across {Object.keys(groupTrayByCategory(approved)).length} categor{Object.keys(groupTrayByCategory(approved)).length === 1 ? "y" : "ies"}
                    </span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <ImageIcon className="size-4" />
                    Approved images
                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      0
                    </span>
                  </span>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {approved.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearTray}
                      className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      data-testid="tray-clear"
                      title="Clear the entire tray"
                    >
                      <Trash2 className="size-3" /> Clear tray
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAddImageOpen(true)}
                    className="text-[11px] inline-flex items-center gap-1 border border-border rounded-md px-2 py-1 hover:border-primary/40 hover:text-primary transition-colors"
                    data-testid="tray-add-image"
                    title="Add an image from a link or your computer"
                  >
                    <ImagePlus className="size-3.5" /> Add image
                  </button>
                  {approved.length > 0 && (
                    <Link
                      to={chatId ? `/tsl-builder/develop/${chatId}/metadata` : "/tsl-builder/develop/metadata"}
                      className="btn-3d bg-primary text-primary-foreground font-medium px-3 py-1.5 rounded-md text-xs inline-flex items-center gap-1.5"
                      data-testid="continue-to-metadata"
                    >
                      Continue to metadata
                      <ArrowRight className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
              {approved.length === 0 ? (
                <p className="text-[12px] text-muted-foreground" data-testid="tray-empty-hint">
                  No images yet — generate above, or drop in a ready one with{" "}
                  <span className="font-medium text-foreground">Add image</span>.
                </p>
              ) : trayExpanded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="tray-grid">
                  {approved.map((img) => {
                    const cat = CATEGORY_GRID.find((c) => c.id === img.category_id);
                    return (
                      <div
                        key={img.dedupeKey}
                        className="relative bg-background rounded-md border border-emerald-500/30 overflow-hidden group"
                      >
                        <img
                          src={img.url}
                          alt={img.variation_note}
                          className="w-full aspect-[4/5] object-cover"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveFromTray(img.dedupeKey)}
                          className="absolute top-1 right-1 size-6 rounded-md bg-background/85 backdrop-blur border border-border opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all flex items-center justify-center"
                          title="Remove from tray"
                          data-testid={`tray-remove-${img.dedupeKey.slice(-12)}`}
                        >
                          <X className="size-3.5" />
                        </button>
                        <div className="p-1.5 text-[10px]">
                          <div className="text-foreground font-medium truncate" title={cat?.label || img.category_id}>
                            {cat?.label || img.category_id}
                          </div>
                          <div className="text-muted-foreground/70 text-[9px] tabular-nums">
                            r{img.approvedInRound}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
        </section>
      </div>

      {/* ─── Sticky add-bar ─────────────────────────────────────────────── */}
      {pendingSelections.size > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground rounded-full shadow-lg border border-primary/30 px-4 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200"
          data-testid="add-pending-bar"
        >
          <span className="text-sm font-medium">
            {pendingSelections.size} image{pendingSelections.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={() => setPendingSelections(new Set())}
            className="text-xs hover:underline opacity-80"
            data-testid="add-bar-clear"
          >
            clear
          </button>
          <button
            type="button"
            onClick={onAddPendingToTray}
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5"
            data-testid="add-bar-confirm"
          >
            <Check className="size-3.5" />
            Add to project
          </button>
        </div>
      )}

      {/* ─── Add image (link / upload) ──────────────────────────────────── */}
      <AddImageDialog open={addImageOpen} onOpenChange={setAddImageOpen} onAdded={onAddManualImage} />

      {/* ─── Lightbox ───────────────────────────────────────────────────── */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150"
          onClick={() => setZoomImage(null)}
          data-testid="lightbox"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomImage(null);
            }}
            className="absolute top-4 right-4 size-9 rounded-full bg-background/90 border border-border text-foreground hover:bg-background flex items-center justify-center shadow-md"
            title="Close (Esc)"
            data-testid="lightbox-close"
          >
            <X className="size-4" />
          </button>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3">
            <img
              src={zoomImage.url}
              alt={zoomImage.alt}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {zoomImage.alt && (
              <p
                className="text-sm text-white/90 max-w-2xl text-center bg-black/40 px-4 py-2 rounded-md"
                onClick={(e) => e.stopPropagation()}
              >
                {zoomImage.alt}
              </p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
