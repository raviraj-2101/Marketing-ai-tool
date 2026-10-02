import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { pipelineQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Rocket,
  Sparkles,
  Check,
  Hash,
  FileText,
  X,
  Pencil,
  ImagePlus,
} from "lucide-react";
import { pipelineApiRequest as apiRequest, PIPELINE_API_BASE } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SoftSelect, ChipMultiSelect, CsCombobox, type CsOwner } from "@/components/concept/ConceptControls";
import { useTargetingOptions } from "@/components/concept/useTargetingOptions";
import { useCsKpiAngleOptions } from "@/components/concept/useCsKpiAngleOptions";
import { ManageSubAngleDialog } from "@/components/concept/ManageSubAngleDialog";
import { ManageOptionsDialog } from "@/hooks/useAdsAgGridColumns";
import { getAccessFlags } from "@/lib/permissions";
import { Settings2 } from "lucide-react";
import { loadTray, saveTray, addToTray, removeFromTray, type ApprovedImage, type GeneratedImage } from "@/lib/approvedTray";
import { AddImageDialog } from "@/components/tsl/AddImageDialog";
import { planAdSetSplit } from "@/lib/adSetSplit";
import { parseScriptMessage } from "@/lib/tslScriptMessage";
import { useSessionPersistedState } from "@/lib/useSessionPersistedState";
import { touchTslSession, clearTslSession, hasTslSessionValue, tslSessionStorageKey } from "@/lib/tslSession";
import {
  FREE_FORM_SESSION_KEY,
  FREE_FORM_PRODUCT_KEY_PREFIX,
  FREE_FORM_SCRIPT_KEY_PREFIX,
} from "@/pages/TslDevelopPage";

interface CsOption { label: string; value: string }
interface ChatPayload {
  chat: { id: string; title: string; product: string };
  messages: Array<{ id: string; role: string; content: string }>;
}

// Small "Manage options" button shown next to Persona / Sub-angle / Main pains
// labels — opens the shared options editor (matches the UGC builder's ManageBtn).
function ManageBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "Pick a product first" : "Add / rename / remove options for this product"}
      className="inline-flex items-center gap-1 rounded-md border border-border/85 bg-card/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed normal-case tracking-normal ml-2"
    >
      <Settings2 className="size-2.5" />
      Manage
    </button>
  );
}

export default function TslMetadataPage() {
  const params = useParams<{ chatId?: string }>();
  const chatId = params.chatId;
  const navigate = useNavigate();

  const freeFormSessionId = useMemo<string | null>(() => {
    if (chatId) return null;
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(FREE_FORM_SESSION_KEY);
    } catch {
      return null;
    }
  }, [chatId]);
  const sessionKey: string | undefined = chatId || freeFormSessionId || undefined;
  const isFreeForm = !chatId && !!freeFormSessionId;

  const chatQ = useQuery<ChatPayload>({
    queryKey: chatId ? [`/api/tsl/chats/${chatId}/messages`] : ["no-chat-metadata"],
    queryFn: pipelineQueryFn,
    enabled: !!chatId,
  });

  const freeFormProductSlug = useMemo(() => {
    if (!isFreeForm || !sessionKey) return "";
    try {
      return window.localStorage.getItem(FREE_FORM_PRODUCT_KEY_PREFIX + sessionKey) || "";
    } catch {
      return "";
    }
  }, [isFreeForm, sessionKey]);

  const freeFormScriptBody = useMemo(() => {
    if (!isFreeForm || !sessionKey) return "";
    try {
      return window.localStorage.getItem(FREE_FORM_SCRIPT_KEY_PREFIX + sessionKey) || "";
    } catch {
      return "";
    }
  }, [isFreeForm, sessionKey]);

  const productSlug = chatQ.data?.chat.product || freeFormProductSlug || "";
  // Human product name (e.g. "Lymphatic") resolved from the slug ("cleantra-lymphatic").
  // /api/tsl/products maps slug → clean name (id IS the slug here — same source the
  // Develop page uses). Used for the read-only Product field + manage-option scoping.
  const tslProductsQ = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/tsl/products"],
    queryFn: pipelineQueryFn,
  });
  const productName = useMemo(
    () => (tslProductsQ.data || []).find((p) => p.id === productSlug)?.name || productSlug,
    [tslProductsQ.data, productSlug],
  );

  const [tray, setTray] = useState<ApprovedImage[]>([]);
  useEffect(() => {
    if (!sessionKey) return;
    setTray(loadTray(sessionKey));
    touchTslSession(sessionKey); // mark recently used so the TTL sweep keeps it
  }, [sessionKey]);

  // Edit the approved set right here (no round-trip to Develop). Changes persist
  // to the shared tray store, so the Develop page reflects them too.
  const [addImageOpen, setAddImageOpen] = useState(false);
  const persistTray = (next: ApprovedImage[]) => {
    setTray(next);
    if (sessionKey) saveTray(sessionKey, next);
  };
  const onRemoveImage = (dedupeKey: string) => persistTray(removeFromTray(tray, dedupeKey));
  const onAddImage = (img: GeneratedImage) => {
    // Manual images return a relative /api/tsl/… path; prefix it so the <img> resolves.
    const url = img.url.startsWith("http") ? img.url : `${PIPELINE_API_BASE}${img.url}`;
    const round = tray.reduce((m, x) => Math.max(m, x.approvedInRound), 0) + 1;
    persistTray(addToTray(tray, [{ ...img, url }], round, Date.now()));
  };

  const [scriptIdMode, setScriptIdMode] = useState<"new" | "iterate">("new");
  const [chosenScriptId, setChosenScriptId] = useState<string>("");
  useEffect(() => {
    if (!sessionKey) return;
    try {
      const m = window.localStorage.getItem(`tsl-v2:script-id-mode:${sessionKey}`);
      const v = window.localStorage.getItem(`tsl-v2:script-id-value:${sessionKey}`);
      if (m === "iterate" || m === "new") setScriptIdMode(m);
      if (v) setChosenScriptId(v);
    } catch { /* ignore */ }
  }, [sessionKey]);

  // Script text derived from the source (free-form draft or the last assistant
  // chat message). This is the starting point for the editable preview below.
  const derivedScriptBody = useMemo(() => {
    if (isFreeForm) {
      if (!freeFormScriptBody) return "";
      return parseScriptMessage(freeFormScriptBody).body;
    }
    const last = [...(chatQ.data?.messages || [])].reverse().find((m) => m.role === "assistant");
    if (!last) return "";
    return parseScriptMessage(last.content).body;
  }, [chatQ.data?.messages, isFreeForm, freeFormScriptBody]);

  // Shared script storage — the single source of truth for the TSL text, shared
  // with the Develop page. Chat mode uses the script-override key (absent = fall
  // back to the chat message); free-form mode uses the free-form-script key
  // (which IS the script). Editing on either page writes here, so both stay in
  // sync across navigation.
  const scriptStoreKey = sessionKey
    ? (isFreeForm ? FREE_FORM_SCRIPT_KEY_PREFIX + sessionKey : `tsl-v2:script-override:${sessionKey}`)
    : null;
  const readStoredScript = (): string => {
    if (!scriptStoreKey || typeof window === "undefined") return "";
    try {
      const raw = window.localStorage.getItem(scriptStoreKey);
      return raw ? parseScriptMessage(raw).body : "";
    } catch {
      return "";
    }
  };

  // Committed script text — exactly what gets pushed. Seeded from a stored edit
  // if present, otherwise from the derived source once it loads (chat data is
  // async). After the first seed the user owns it; edits persist on Save.
  const [scriptBody, setScriptBody] = useState<string>(() => readStoredScript());
  const seededScript = useRef<boolean>(scriptBody.length > 0);
  // Inline-edit mode: a working draft buffer kept separate from the committed
  // text so Cancel can discard cleanly and Save commits in one shot.
  const [editingScript, setEditingScript] = useState(false);
  const [scriptDraft, setScriptDraft] = useState("");
  const scriptDraftRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingScript || seededScript.current) return;
    if (derivedScriptBody) {
      setScriptBody(derivedScriptBody);
      seededScript.current = true;
    }
  }, [derivedScriptBody, editingScript]);

  // "edited" = the committed text diverges from the derived source. Computed
  // (not stored) so it stays correct as the async source loads.
  const scriptEdited = !!derivedScriptBody && scriptBody.trim() !== derivedScriptBody.trim();

  const startScriptEdit = () => {
    setScriptDraft(scriptBody);
    setEditingScript(true);
  };
  const cancelScriptEdit = () => setEditingScript(false);
  const saveScriptEdit = () => {
    const next = scriptDraft;
    setScriptBody(next);
    seededScript.current = true;
    setEditingScript(false);
    if (!scriptStoreKey) return;
    try {
      if (isFreeForm) {
        // free-form key is the canonical script — always keep the latest.
        window.localStorage.setItem(scriptStoreKey, next);
      } else if (next.trim() && next.trim() !== derivedScriptBody.trim()) {
        window.localStorage.setItem(scriptStoreKey, next); // chat override
      } else {
        window.localStorage.removeItem(scriptStoreKey); // reverted to the chat original
      }
    } catch { /* ignore */ }
  };

  // When entering edit mode, focus the textarea and drop the caret at the end.
  useEffect(() => {
    if (!editingScript) return;
    const el = scriptDraftRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingScript]);

  // The AI-generated concept slug for this script (like the UGC builder's
  // "imported from chat" name). Produced by the script-analysis pass that runs
  // when the script is made on the Develop page, and persisted with the analysis
  // under tsl-v2:analysis:<session>. We read it here as the concept-name default.
  const scriptConcept = useMemo(() => {
    if (!sessionKey || typeof window === "undefined") return "";
    try {
      const raw = window.localStorage.getItem(tslSessionStorageKey("analysis", sessionKey));
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      const c = parsed?.analysis?.concept;
      return typeof c === "string" ? c.trim() : "";
    } catch {
      return "";
    }
  }, [sessionKey]);

  // All persisted per-session so the form survives Develop ⇄ Final-review navigation.
  const [conceptName, setConceptName] = useSessionPersistedState<string>(sessionKey, "concept-name", "");
  // Tracks whether the user has hand-edited the concept name. While false, the
  // name auto-fills from the AI-generated script concept (mirrors the UGC builder).
  const [conceptNameEdited, setConceptNameEdited] = useSessionPersistedState<boolean>(sessionKey, "concept-name-edited", false);
  const [cs, setCs] = useSessionPersistedState<string>(sessionKey, "cs", "Agentic");
  const [persona, setPersona] = useSessionPersistedState<string>(sessionKey, "persona", "");
  const [mainPainsArr, setMainPainsArr] = useSessionPersistedState<string[]>(sessionKey, "main-pains", []);
  const [angle, setAngle] = useSessionPersistedState<string>(sessionKey, "angle", "");
  // New "Sub-angle" (sub_angle_detail) — separate from the Angle above.
  const [subAngleDetail, setSubAngleDetail] = useSessionPersistedState<string>(sessionKey, "sub-angle-detail", "");
  const [adsPerAdSet, setAdsPerAdSet] = useSessionPersistedState<number>(sessionKey, "ads-per-set", 10);

  // Seed the concept name from the AI-generated script concept until the user
  // edits it (then their text wins). Empty when no concept is available yet.
  useEffect(() => {
    if (conceptNameEdited) return;
    if (scriptConcept && scriptConcept !== conceptName) setConceptName(scriptConcept);
  }, [scriptConcept, conceptNameEdited, conceptName, setConceptName]);

  // "Ads per Ad Set" can never exceed the number of approved images — putting
  // more ads in a set than you have images is meaningless. Cap at the tray size
  // (with the existing 100 ceiling for large trays) and clamp the value down
  // when the tray loads so e.g. 1 image shows "max 1 per set", not the default 10.
  const maxPerSet = Math.max(1, Math.min(100, tray.length));
  useEffect(() => {
    if (tray.length > 0) setAdsPerAdSet((prev) => Math.min(prev, maxPerSet));
  }, [maxPerSet, tray.length, setAdsPerAdSet]);

  const adSetPlan = useMemo(
    () => planAdSetSplit(tray.length, adsPerAdSet),
    [tray.length, adsPerAdSet],
  );

  const csQ = useQuery<{ rows: CsOption[] }>({ queryKey: ["/api/tsl/cs-options"], queryFn: pipelineQueryFn });
  // CS roster for the combobox: {label, email} like the UGC tool. "Agentic" is
  // the default and always selectable; the rest come from cs_config (value = email).
  const csOwners = useMemo<CsOwner[]>(
    () => [
      { label: "Agentic", email: "" },
      ...((csQ.data?.rows || [])
        .filter((r) => r.label !== "Agentic")
        .map((r) => ({ label: r.label, email: r.value }))),
    ],
    [csQ.data?.rows],
  );

  // Pre-select the CS dropdown to the logged-in user when they exist in the CS
  // list (cs_config.value holds each CS's email). Runs once after both the user
  // and the CS rows are available; falls back to the "Agentic" default on no
  // match. Skipped entirely when a CS was already persisted for this session, so
  // it never clobbers a restored choice on return navigation (only first visit).
  const { user } = useAuth();
  // Manage buttons are Admin / Super Admin / Dev only (backend also enforces
  // requireKpiEditor on the cs-kpis writes).
  const isAdmin = getAccessFlags(user).hasAdmin;
  const csWasPersisted = useRef<boolean>(hasTslSessionValue("cs", sessionKey));
  const csAutoSelected = useRef(false);
  useEffect(() => {
    if (csAutoSelected.current || csWasPersisted.current) return;
    const email = user?.email?.trim().toLowerCase();
    const rows = csQ.data?.rows;
    if (!email || !rows) return;
    const match = rows.find((r) => r.value?.trim().toLowerCase() === email);
    if (match) setCs(match.label);
    csAutoSelected.current = true;
  }, [user?.email, csQ.data?.rows, setCs]);

  // Persona / Sub-angle / Main-pains options + the "Manage options" mutations,
  // backed by the SAME custom_fields the AI UGC builder uses (product-scoped).
  const targeting = useTargetingOptions(productSlug, productName);
  // Angle + Sub-angle "Manage" (admin-only) — CRUD against the CS-KPIs config,
  // the same source the Angle / Sub-angle dropdowns below read from.
  const csKpi = useCsKpiAngleOptions(productSlug);
  // New "Sub-angle" dropdown values come from the CS KPIs config (same source as
  // the UGC final form), served by the image-builder options API (VITE_SERVER_URL).
  const subAngleDetailQ = useQuery<string[]>({
    queryKey: ["ib-sub-angle-details", productSlug],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/options/sub-angle-details?product=${encodeURIComponent(productSlug)}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!productSlug,
  });
  const subAngleDetailOptions = subAngleDetailQ.data ?? [];
  // Angle values come from the SAME CS KPIs config as everywhere else (one source
  // of truth across all tools), not the legacy custom-field list.
  const angleQ = useQuery<string[]>({
    queryKey: ["ib-angles", productSlug],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/options/angles?product=${encodeURIComponent(productSlug)}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!productSlug,
  });
  const angleOptions = angleQ.data ?? [];

  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const canPush =
    tray.length > 0 &&
    conceptName.trim().length >= 3 &&
    cs.trim().length > 0 &&
    !!productSlug &&
    !editingScript &&
    (scriptIdMode === "new" || !!chosenScriptId);

  const blockedReason = useMemo<string | null>(() => {
    if (tray.length === 0) return "No approved images — go back to develop and pick some before pushing.";
    if (conceptName.trim().length < 3) return "Concept name needs at least 3 characters.";
    if (!productSlug) {
      return isFreeForm
        ? "Product slug missing — go back to develop and pick a product before approving images."
        : "Product slug missing (chat row didn't load).";
    }
    if (editingScript)
      return "You're editing the script — Save or Cancel your changes before pushing.";
    if (scriptIdMode === "iterate" && !chosenScriptId)
      return "Script ID set to 'iterate' on the develop page but no existing script was picked — go back and pick one or switch to 'new'.";
    return null;
  }, [tray, conceptName, productSlug, scriptIdMode, chosenScriptId, isFreeForm, editingScript]);

  const onPush = async () => {
    if (!canPush) return;
    setPushing(true);
    setPushError(null);
    try {
      const res = await apiRequest("POST", "/api/tsl/builds", {
        chatId: isFreeForm ? undefined : chatId,
        productSlug,
        // Send the (possibly edited) script body in BOTH modes. The backend
        // prefers this over the chat-history fallback, so edits made here are
        // what flow into the brief doc + ad.
        tslScriptBody: scriptBody.trim() || undefined,
        conceptName: conceptName.trim(),
        funnel: "TSL",
        cs: cs.trim(),
        imagesPerAdset: adsPerAdSet,
        adsPerAdSet,
        existingScriptId: scriptIdMode === "iterate" ? chosenScriptId : undefined,
        persona: persona.trim() || undefined,
        mainPains: mainPainsArr.length > 0 ? mainPainsArr.join(", ") : undefined,
        angle: angle.trim() || undefined,
        subAngle: subAngleDetail.trim() || undefined,
        images: tray.map((i) => ({
          url: i.url,
          category_id: i.category_id,
          prompt: i.prompt,
          variation_note: i.variation_note,
        })),
      });
      const data = await res.json();
      // Warn if push was partial (some pipeline steps failed) but continue navigation
      if (data.errors?.length) {
        console.warn("[TSL push] partial errors:", data.errors);
      }
      // Build pushed — wipe all of this session's saved scratch (tray, script,
      // selections, form fields, …) so it doesn't linger in localStorage.
      if (sessionKey) clearTslSession(sessionKey);
      if (isFreeForm) {
        try {
          window.sessionStorage.removeItem(FREE_FORM_SESSION_KEY);
        } catch { /* ignore */ }
      }
      navigate("/tsl-builder/tsl-log");
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  };

  const backHref = chatId ? `/tsl-builder/develop/${chatId}` : "/tsl-builder/develop";

  return (
    <DashboardLayout>
      <div className="bg-background min-h-full">
        <header className="border-b border-border/40 bg-card/40 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4 flex-wrap">
            <Link
              to={backHref}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="size-3.5" /> Back to develop
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <h1 className="text-base font-semibold inline-flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Final review &amp; push
            </h1>
            <span className="ml-auto text-xs text-muted-foreground">
              {tray.length} approved image{tray.length === 1 ? "" : "s"}
            </span>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {tray.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="size-4 mt-0.5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">No approved images yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go back to{" "}
                  <Link to={backHref} className="text-primary underline">
                    develop
                  </Link>{" "}
                  and tick the images you want to push.
                </p>
              </div>
            </div>
          )}

          {/* ─── Required fields ──────────────────────────────────────── */}
          <section className="bg-card border border-border rounded-lg shadow-card-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold tracking-tight">Concept</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1" data-testid="meta-concept-name">
                <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
                  <span>Concept name <span className="text-destructive">*</span></span>
                  <span
                    className={
                      "ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium normal-case tracking-normal " +
                      (conceptNameEdited ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")
                    }
                    title={conceptNameEdited ? "You edited this name" : "AI-generated from the script — edit to override"}
                  >
                    {conceptNameEdited ? <Pencil className="size-2.5" /> : <Sparkles className="size-2.5" />}
                    {conceptNameEdited ? "edited" : "auto"}
                  </span>
                </Label>
                <Input
                  type="text"
                  value={conceptName}
                  onChange={(e) => {
                    if (!conceptNameEdited) setConceptNameEdited(true);
                    setConceptName(e.target.value);
                  }}
                  placeholder="give the batch a creative name…"
                  maxLength={120}
                  className="h-9 text-[12.5px]"
                />
              </div>
              <div className="space-y-1" data-testid="meta-product">
                <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">Product</Label>
                <Input
                  type="text"
                  value={productName}
                  readOnly
                  className="h-9 text-[12.5px] bg-muted/30 text-muted-foreground"
                />
              </div>
              <div className="space-y-1" data-testid="meta-cs">
                <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
                  CS <span className="text-destructive">*</span>
                </Label>
                <CsCombobox value={cs} owners={csOwners} onChange={setCs} />
              </div>
              {/* Persona is hidden for the CS rollout. The value, the submit
                  payload, and the persona data are all kept — only the input is
                  not rendered. */}
              <div className="space-y-1" data-testid="meta-angle">
                <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
                  <span>
                    Angle
                    <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(from CS KPIs config)</span>
                  </span>
                  {isAdmin && (
                    <ManageBtn onClick={csKpi.angleManage.onOpen} disabled={!csKpi.canManage} />
                  )}
                </Label>
                <SoftSelect
                  value={angle}
                  onChange={setAngle}
                  options={angleOptions}
                  placeholder={productSlug ? "None" : "Pick a product first"}
                  disabled={!productSlug}
                />
              </div>
              <div className="space-y-1" data-testid="meta-sub-angle">
                <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
                  <span>
                    Sub-angle
                    <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(from CS KPIs config)</span>
                  </span>
                  {isAdmin && (
                    <ManageBtn onClick={csKpi.subAngleManage.onOpen} disabled={!csKpi.canManage} />
                  )}
                </Label>
                <SoftSelect
                  value={subAngleDetail}
                  onChange={setSubAngleDetail}
                  options={subAngleDetailOptions}
                  placeholder={productSlug ? "None" : "Pick a product first"}
                  disabled={!productSlug}
                />
              </div>
              <div className="space-y-1 sm:col-span-2" data-testid="meta-mainpains">
                <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
                  <span>
                    Main pains
                    <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(multi-select — which pains this ad addresses)</span>
                  </span>
                  <ManageBtn onClick={() => targeting.openManage("pains")} disabled={!targeting.canManage} />
                </Label>
                <ChipMultiSelect
                  value={mainPainsArr}
                  onChange={setMainPainsArr}
                  options={targeting.painsOptions}
                  placeholder={productSlug ? "Pick the pains this ad addresses" : "Pick a product first"}
                  disabled={!productSlug}
                />
              </div>
            </div>
          </section>

          <ManageOptionsDialog
            open={targeting.manage.open}
            onClose={targeting.manage.onClose}
            fieldName={targeting.manage.fieldName}
            initialOptions={targeting.manage.initialOptions}
            onAdd={targeting.manage.onAdd}
            onRemove={targeting.manage.onRemove}
            onRename={targeting.manage.onRename}
          />

          {/* Angle "Manage" — flat list (reuses the Main-Pains dialog). cs-kpis has
              no rename, so canEdit is off (remove + add only). Admin-gated above. */}
          <ManageOptionsDialog
            open={csKpi.angleManage.open}
            onClose={csKpi.angleManage.onClose}
            fieldName={csKpi.angleManage.fieldName}
            initialOptions={csKpi.angleManage.options}
            onAdd={csKpi.angleManage.onAdd}
            onRemove={csKpi.angleManage.onRemove}
            canEdit={false}
          />

          {/* Sub-angle "Manage" — two-level (parent-angle picker + its sub-angles). */}
          <ManageSubAngleDialog
            open={csKpi.subAngleManage.open}
            onClose={csKpi.subAngleManage.onClose}
            parentAngles={csKpi.subAngleManage.parentAngles}
            selectedAngleId={csKpi.subAngleManage.selectedAngleId}
            onSelectAngle={csKpi.subAngleManage.setSelectedAngleId}
            options={csKpi.subAngleManage.options}
            onAdd={csKpi.subAngleManage.onAdd}
            onRemove={csKpi.subAngleManage.onRemove}
          />

          {/* ─── Ads per Ad Set ───────────────────────────────────────── */}
          {tray.length > 0 && (
            <section className="bg-card border border-border rounded-lg shadow-card-sm p-5 space-y-3" data-testid="ads-per-ad-set">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    Ads per Ad Set <span className="text-destructive">*</span>
                  </label>
                  <p className="text-[12px] text-muted-foreground">
                    Each ad set = 1 ad ID in the marketing DB, with its own Drive folder + ClickUp task.
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={maxPerSet}
                  value={adsPerAdSet}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(maxPerSet, Number(e.target.value) || 1));
                    setAdsPerAdSet(v);
                  }}
                  className="w-20 text-center font-semibold shrink-0"
                  data-testid="ads-per-ad-set-input"
                />
              </div>
              <p className="text-sm font-semibold text-foreground" data-testid="ad-set-summary">
                {tray.length} image{tray.length === 1 ? "" : "s"} available, max {adsPerAdSet} per set = {adSetPlan.adSetCount} ad set{adSetPlan.adSetCount === 1 ? "" : "s"} with unique ad IDs.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {adSetPlan.perSet.map((s) => (
                  <span
                    key={s.adSetIndex}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border text-[12.5px] font-medium tabular-nums"
                    data-testid={`ad-set-pill-${s.adSetIndex}`}
                  >
                    Ad set {s.adSetIndex}: {s.imageCount} image{s.imageCount === 1 ? "" : "s"}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ─── Script (read-only preview ⇄ inline edit) ─────────────── */}
          {(derivedScriptBody || scriptBody || chosenScriptId || scriptIdMode === "new") && (
            <section className="bg-card border border-border rounded-lg shadow-card-sm p-5 space-y-3" data-testid="script-preview-pane">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold tracking-tight inline-flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  Script
                </h2>
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
              <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border">
                  <Hash className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Script ID:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {scriptIdMode === "iterate"
                      ? chosenScriptId || "—"
                      : "new (auto-assigned)"}
                  </span>
                </span>
                {(() => {
                  const active = editingScript ? scriptDraft : scriptBody;
                  return active ? (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {(active.match(/\b[A-Za-z0-9]+\b/g) || []).length} words
                    </span>
                  ) : null;
                })()}
                {scriptEdited && !editingScript && (
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
                    placeholder="The script text that will be pushed…"
                    className="w-full whitespace-pre-wrap font-sans text-foreground/90 text-[13px] leading-relaxed bg-background border border-primary/40 rounded-lg p-4 h-[44vh] min-h-[260px] overflow-y-auto resize-y ring-2 ring-primary/20 focus:ring-primary/30 focus:outline-none transition-shadow"
                    data-testid="script-body-editor"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    What you push is exactly this text (used for the brief doc + ad).
                    <span className="ml-1 text-muted-foreground/70">
                      Press <kbd className="px-1 rounded border border-border bg-muted/50 font-mono text-[10px]">Esc</kbd> to cancel,
                      {" "}<kbd className="px-1 rounded border border-border bg-muted/50 font-mono text-[10px]">⌘/Ctrl + ↵</kbd> to save.
                    </span>
                  </p>
                </>
              ) : scriptBody ? (
                <pre
                  onDoubleClick={startScriptEdit}
                  title="Double-click to edit"
                  className="whitespace-pre-wrap font-sans text-foreground/90 text-[13px] leading-relaxed bg-background border border-border rounded-lg p-4 h-[44vh] min-h-[260px] overflow-y-auto cursor-text hover:border-primary/30 transition-colors"
                  data-testid="script-body-preview"
                >
                  {scriptBody}
                </pre>
              ) : !isFreeForm && chatQ.isLoading ? (
                <div className="border border-dashed border-border rounded-lg p-6 flex items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Loading script…
                </div>
              ) : (
                <div className="border border-dashed border-border rounded-lg p-6 text-center text-[12.5px] text-muted-foreground">
                  No script yet — click <span className="font-medium text-foreground">Edit</span> to add one.
                </div>
              )}
              {!editingScript && scriptBody && (
                <p className="text-[11px] text-muted-foreground">
                  Tip: <span className="font-medium text-foreground">double-click</span> the script to edit it.
                </p>
              )}
            </section>
          )}

          {/* ─── Approved images (add / remove inline) ─────────────────── */}
          <section className="bg-card border border-border rounded-lg shadow-card-sm p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Approved images going up
                <span className="ml-2 text-xs text-muted-foreground font-normal">{tray.length}</span>
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAddImageOpen(true)}
                  className="text-[11px] inline-flex items-center gap-1 border border-border rounded-md px-2 py-1 hover:border-primary/40 hover:text-primary transition-colors"
                  data-testid="meta-add-image"
                  title="Add an image from a link or your computer"
                >
                  <ImagePlus className="size-3.5" /> Add image
                </button>
                <Link
                  to={backHref}
                  className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  ← edit on develop
                </Link>
              </div>
            </div>
            {tray.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {tray.map((img) => (
                  <div
                    key={img.dedupeKey}
                    className="relative group aspect-[4/5] rounded-md overflow-hidden border border-border bg-muted/20"
                  >
                    <img src={img.url} alt={img.variation_note} className="w-full h-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      onClick={() => onRemoveImage(img.dedupeKey)}
                      className="absolute top-1 right-1 size-6 rounded-md bg-background/85 backdrop-blur border border-border opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all flex items-center justify-center"
                      title="Remove from this push"
                      data-testid={`meta-remove-${img.dedupeKey.slice(-12)}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground" data-testid="meta-tray-empty">
                No images — add one with <span className="font-medium text-foreground">Add image</span>, or go back to develop.
              </p>
            )}
          </section>

          <AddImageDialog open={addImageOpen} onOpenChange={setAddImageOpen} onAdded={onAddImage} />

          {/* ─── Push CTA ─────────────────────────────────────────────── */}
          <section className="flex items-center gap-4 flex-wrap pb-8">
            <Button
              type="button"
              onClick={onPush}
              disabled={!canPush || pushing}
              size="lg"
              data-testid="push-button"
            >
              {pushing ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {pushing ? "Pushing to pipeline…" : `Push ${tray.length} image${tray.length === 1 ? "" : "s"} to pipeline`}
            </Button>
            {!canPush && blockedReason && (
              <span className="text-xs text-muted-foreground" data-testid="push-blocked-reason">
                {blockedReason}
              </span>
            )}
          </section>

          {pushError && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-3 flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <p>{pushError}</p>
            </div>
          )}
        </main>
      </div>
    </DashboardLayout>
  );
}
