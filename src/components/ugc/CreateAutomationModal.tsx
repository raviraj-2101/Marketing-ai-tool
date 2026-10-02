import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, ArrowRight, ChevronDown } from "lucide-react";
import { STATIC_BAR_PRESETS, MAX_SCHEMES, sameScheme, toggleScheme, type ColorScheme } from "./staticBarPresets";
import { PromptBuilderChat } from "./PromptBuilderChat";
import { type AdRow } from "@/lib/parseAds";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

const SCHEDULE_PRESETS = [
  { label: "Daily",        days: 1 },
  { label: "Every 2 days", days: 2 },
  { label: "Every 3 days", days: 3 },
  { label: "Weekly",       days: 7 },
] as const;

const AVATAR_TYPE_LABEL: Record<string, string> = {
  doctor: "Doctor",
  normal: "Normal person",
  natural_wellness: "Natural-wellness authority",
  mix: "Mix (rotate one of each)",
};
// The selectable concrete archetypes. "Mix" is a shortcut that ticks all three.
const AVATAR_ARCHETYPES = ["doctor", "normal", "natural_wellness"] as const;

// Output platform the generated ads are intended for.
const PLATFORMS = [
  { value: "both",     label: "Both — Meta + Applovin" },
  { value: "meta",     label: "Meta only" },
  { value: "applovin", label: "Applovin only" },
] as const;

interface AvatarOption {
  id: string;
  name: string;
  image_url: string | null;
  heygen_avatar_id?: string | null;
  type?: string | null;
}

// Shape needed to pre-fill the form in edit mode (subset of the ugc_automations row).
export interface AutomationLike {
  id: string;
  name: string;
  product: string;
  angle?: string | null;
  persona?: string | null;
  sub_angle?: string | null;
  pain_points?: string[] | null;
  prompt_guide?: string | null;
  avatar_type?: string | null;
  avatar_types?: string[] | null;
  avatar_pool?: string[] | null;
  scripts_per_run?: number | null;
  avatars_per_script?: number | null;
  intended_platform?: string | null;
  length_scope?: string | null;
  video_mode?: string | null;
  interval_minutes?: number | null;
  static_bar_enabled?: boolean | null;
  static_bar_bg_color?: string | null;
  static_bar_text_color?: string | null;
  static_bar_schemes?: ColorScheme[] | null;
  static_bar_scheme_mode?: "order" | "random" | null;
  static_bar_duration_sec?: number | null;
}

interface Props {
  open: boolean;
  products: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
  userId: string;
  /** When provided, the modal opens in EDIT mode: pre-filled + saves via PUT. */
  automation?: AutomationLike | null;
}

export function CreateAutomationModal({ open, products, onClose, onCreated, userId, automation = null }: Props) {
  const navigate = useNavigate();
  const isEdit = !!automation;
  const [name, setName]                   = useState("");
  const [product, setProduct]             = useState("");
  const [angle, setAngle]                 = useState("");
  const [persona, setPersona]             = useState("");
  const [subAngle, setSubAngle]           = useState("");
  const [painPoints, setPainPoints]       = useState<string[]>([]);
  const [promptGuide, setPromptGuide]     = useState("");
  const [avatarTypes, setAvatarTypes]     = useState<string[]>(["doctor", "normal", "natural_wellness"]);
  const [avatarPool, setAvatarPool]       = useState<string[]>([]);
  const [scriptsPerRun, setScriptsPerRun]       = useState(3);
  const [avatarsPerScript, setAvatarsPerScript] = useState(3);
  const [intendedPlatform, setIntendedPlatform] = useState<string>("both");
  const [lengthScope, setLengthScope]     = useState<"under60s" | "above60s" | "4to18min">("under60s");
  const [videoMode, setVideoMode]         = useState<"without" | "with" | "combination">("combination");
  const [scheduleDays, setScheduleDays]   = useState(1);
  // Static title bar (V2) — AI-generated bar text per script, stamped on each video.
  const [staticBarEnabled, setStaticBarEnabled]       = useState(true);
  const [staticBarSchemes, setStaticBarSchemes]       = useState<ColorScheme[]>([STATIC_BAR_PRESETS[0]]);
  const [staticBarSchemeMode, setStaticBarSchemeMode] = useState<"order" | "random">("order");
  const [staticBarDurationSec, setStaticBarDurationSec] = useState(8);

  // Options pulled live from the marketing Ads DB (same source as the manual flow).
  const [personas, setPersonas]           = useState<string[]>([]);
  const [subAngles, setSubAngles]         = useState<string[]>([]);
  const [pains, setPains]                 = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);

  // Look-coverage check: do the chosen product + avatar type/pool actually have a
  // with-product look (+ voice)? Prevents saving an automation that would render
  // the wrong product (or nothing) — the exact failure the operator hit live.
  const [coverage, setCoverage] = useState<
    { eligible_count: number; product_name: string; requires_product_look: boolean } | null
  >(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Prompt-builder "verify" chat: launch state + the last verified {product,text}.
  // The green "verified" chip is shown only when the current product + the
  // normalized prompt still match this record (gap#3/#4 — invalidated on edit or
  // a real product switch below).
  const [verifyOpen, setVerifyOpen]       = useState(false);
  const [verified, setVerified]           = useState<{ product: string; text: string } | null>(null);
  const [frozen, setFrozen]               = useState<{ promptText: string; ads: AdRow[]; query: Record<string, unknown> | null } | null>(null);

  // Auto-suggest a name from product + angle while the user hasn't typed their own.
  const lastSuggestedRef = useRef("");
  useEffect(() => {
    if (!product) return;
    const p = products.find((x) => x.id === product);
    if (!p) return;
    const bits = [p.name];
    if (angle) bits.push(angle);
    if (avatarTypes.length === 1) bits.push(`(${avatarTypes[0]})`);
    const suggested = bits.join(" — ");
    if (name === "" || name === lastSuggestedRef.current) {
      setName(suggested);
      lastSuggestedRef.current = suggested;
    }
  }, [product, angle, avatarTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch persona / sub-angle / pain options when the product changes.
  useEffect(() => {
    if (!product) { setPersonas([]); setSubAngles([]); setPains([]); return; }
    setOptionsLoading(true);
    const q = encodeURIComponent(product);
    Promise.all([
      fetch(`${API_BASE}/api/options/personas?product=${q}`).then((r) => r.json()).catch(() => []),
      fetch(`${API_BASE}/api/options/sub-angles?product=${q}`).then((r) => r.json()).catch(() => []),
      fetch(`${API_BASE}/api/options/pains?product=${q}`).then((r) => r.json()).catch(() => []),
    ]).then(([pe, sa, pa]) => {
      setPersonas(Array.isArray(pe) ? pe : (pe?.personas ?? []));
      setSubAngles(Array.isArray(sa) ? sa : (sa?.sub_angles ?? []));
      setPains(Array.isArray(pa) ? pa : (pa?.pains ?? []));
    }).finally(() => setOptionsLoading(false));
  }, [product]);

  // Edit mode: pre-fill every field from the automation once when it opens.
  // prefilledFor guards against re-running the prefill; the clear-on-product
  // effect below is gated on a real product switch so it won't wipe these values.
  const prefilledFor = useRef<string | null>(null);
  // Tracks the previous product value so the clear-on-product-change effect below
  // can distinguish a genuine user switch from the initial mount / edit prefill.
  const prevProductRef = useRef<string | null>(null);
  // Stable idempotency key for the current create session. Regenerated each time
  // the modal opens for a NEW create; reused across retries so a lost-response
  // retry returns the existing row instead of creating a duplicate.
  const idempotencyKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { prefilledFor.current = null; return; }
    if (!automation || prefilledFor.current === automation.id) return;
    prefilledFor.current = automation.id;
    lastSuggestedRef.current = "__edit__"; // disable name auto-suggest in edit mode
    setName(automation.name || "");
    setProduct(automation.product || "");
    setAngle(automation.angle || "");
    setPersona(automation.persona || "");
    setSubAngle(automation.sub_angle || "");
    setPainPoints(Array.isArray(automation.pain_points) ? automation.pain_points : []);
    setPromptGuide(automation.prompt_guide || "");
    setAvatarTypes(
      Array.isArray(automation.avatar_types) && automation.avatar_types.length
        ? automation.avatar_types
        : (automation.avatar_type && automation.avatar_type !== "mix"
            ? [automation.avatar_type]
            : ["doctor", "normal", "natural_wellness"]),
    );
    setAvatarPool(Array.isArray(automation.avatar_pool) ? automation.avatar_pool : []);
    setScriptsPerRun(automation.scripts_per_run || 3);
    setAvatarsPerScript(automation.avatars_per_script || 3);
    setIntendedPlatform(automation.intended_platform || "both");
    setLengthScope(automation.length_scope === "above60s" ? "above60s" : automation.length_scope === "4to18min" ? "4to18min" : "under60s");
    setVideoMode((["without", "with", "combination"].includes(automation.video_mode as string) ? automation.video_mode : "combination") as "without" | "with" | "combination");
    setScheduleDays(Math.max(1, Math.round((automation.interval_minutes || 1440) / 1440)));
    setStaticBarEnabled(automation.static_bar_enabled ?? true);
    setStaticBarSchemes(
      Array.isArray(automation.static_bar_schemes) && automation.static_bar_schemes.length
        ? automation.static_bar_schemes
        : [{ label: "", bg: automation.static_bar_bg_color || "#E53935", fg: automation.static_bar_text_color || "#FFFFFF" }],
    );
    setStaticBarSchemeMode(automation.static_bar_scheme_mode === "random" ? "random" : "order");
    setStaticBarDurationSec(automation.static_bar_duration_sec || 8);
  }, [open, automation]);

  // Reset (or generate) the idempotency key whenever the modal opens/closes.
  // Cleared on close so the NEXT open gets a fresh key. Generated lazily on
  // open-for-create so each new create session gets a distinct UUID.
  useEffect(() => {
    if (!open) { idempotencyKeyRef.current = null; return; }
    if (!isEdit && !idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
  }, [open, isEdit]);

  // Clear product-scoped selections (persona / sub-angle / pains) ONLY on a real
  // user switch between two non-empty products — their option sets differ. The
  // initial mount (prev null) and the edit-mode prefill ("" → product) are not
  // switches, so they keep the pre-filled values intact.
  useEffect(() => {
    const prev = prevProductRef.current;
    prevProductRef.current = product;
    if (prev && product && prev !== product) {
      setPersona(""); setSubAngle(""); setPainPoints([]);
      setVerified(null); // gap#4 — a genuine product switch invalidates a prior verification.
      setFrozen(null);  // clear frozen ads/query too — they belong to the old product.
    }
  }, [product]);

  // Above-60s and 4-18min clips can only run on Meta (Applovin caps at 60s) — clamp platform.
  // 4-18min (Format 08) is inherently a multi-clip combination render — clamp video mode too.
  useEffect(() => {
    if ((lengthScope === "above60s" || lengthScope === "4to18min") && intendedPlatform !== "meta") setIntendedPlatform("meta");
    if (lengthScope === "4to18min" && videoMode !== "combination") setVideoMode("combination");
  }, [lengthScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch avatar options for the picker, filtered by the chosen type.
  useEffect(() => {
    if (!open) return;
    setAvatarsLoading(true);
    // Automation-owned endpoint: filters by the real avatar_type column.
    fetch(`${API_BASE}/api/automation-avatars?types=${encodeURIComponent(avatarTypes.join(","))}`)
      .then((r) => r.json())
      .then((rows) => {
        const list: AvatarOption[] = Array.isArray(rows) ? rows : (rows?.avatars ?? []);
        setAvatarOptions(
          list.filter((a) => (a.heygen_avatar_id || a.id) && !/\btest\b/.test(`${a.name ?? ""}`.toLowerCase())),
        );
      })
      .catch(() => setAvatarOptions([]))
      .finally(() => setAvatarsLoading(false));
  }, [avatarTypes, open]);

  // Drop pool selections no longer present after a type change. Guard against the
  // empty initial state: the avatar fetch is async, so on (edit-mode) open
  // avatarOptions is still [] — reconciling then would wipe the just-prefilled
  // pool. Only reconcile once a real option set has loaded.
  useEffect(() => {
    if (!avatarOptions.length) return;
    const valid = new Set(avatarOptions.map((a) => String(a.heygen_avatar_id || a.id)));
    setAvatarPool((prev) => prev.filter((id) => valid.has(id)));
  }, [avatarOptions]);

  // Coverage check — debounced, re-runs when product / type / mode / pool change.
  // Server uses the SAME resolver as the renderer, so this matches what will
  // actually render. Fails open (leaves coverage null) so a network blip never
  // blocks creation — the renderer is itself safe (won't show a wrong product).
  useEffect(() => {
    if (!open || !product) { setCoverage(null); return; }
    setCoverageLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams({ product, types: avatarTypes.join(","), mode: videoMode });
      if (avatarPool.length) params.set("pool", avatarPool.join(","));
      fetch(`${API_BASE}/api/automation-avatars/coverage?${params.toString()}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setCoverage({
          eligible_count: d.eligible_count ?? 0,
          product_name: d.product_name ?? "",
          requires_product_look: d.requires_product_look ?? true,
        }))
        .catch(() => { /* aborted or failed — leave previous coverage, fail open */ })
        .finally(() => setCoverageLoading(false));
    }, 350);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [open, product, avatarTypes, videoMode, avatarPool]);

  // Hard-block creation when a with-product look is required but none exist.
  const blockNoLooks = !!coverage && coverage.requires_product_look && coverage.eligible_count === 0;

  // Toggle a single avatar archetype, enforcing a minimum of one selected.
  const toggleAvatarType = (t: string) =>
    setAvatarTypes((prev) =>
      prev.includes(t)
        ? (prev.length <= 1 ? prev : prev.filter((x) => x !== t))
        : [...prev, t],
    );

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      // Safety lazy-init: generate a key if the effect hasn't fired yet (e.g. rapid
      // submit before the effect runs). This guarantees a stable key across retries
      // within the same open session even if the effect fires slightly late.
      if (!isEdit && !idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      // Optional fields are sent explicitly (empty → null) so an EDIT can CLEAR
      // them, not just set them. createAutomation/updateAutomation both coerce
      // empty values to null/[].
      const body: Record<string, unknown> = {
        user_id: userId,
        name: name.trim() || (products.find((p) => p.id === product)?.name ?? "Untitled automation"),
        mode: "NN", // MVP: net-new only
        product,
        angle: angle.trim(),
        persona: persona.trim(),
        subAngle: subAngle.trim(),
        painPoints,
        promptGuide: promptGuide.trim(),
        avatarPool,
        scriptsPerRun,
        avatarsPerScript,
        avatarTypes,
        intervalMinutes: Math.max(1, scheduleDays) * 1440,
        intendedPlatform,
        lengthScope,
        videoMode,
        csOwner: "Agentic",
        ...(isEdit ? {} : { idempotencyKey: idempotencyKeyRef.current }),
        staticBarEnabled,
        staticBarSchemes,
        staticBarSchemeMode,
        staticBarDurationSec,
      };

      const res = await fetch(
        isEdit ? `${API_BASE}/api/automations/${automation!.id}?user_id=${userId}` : `${API_BASE}/api/automations`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message ?? b.error ?? `Server error ${res.status}`);
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!product || !frozen) return;
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        user_id: userId,
        name: name.trim() || (products.find((p) => p.id === product)?.name ?? "Untitled automation"),
        mode: "NN",
        product,
        angle: angle.trim(),
        persona: persona.trim(),
        subAngle: subAngle.trim(),
        painPoints,
        promptGuide: promptGuide.trim(),
        avatarPool,
        scriptsPerRun,
        avatarsPerScript,
        avatarTypes,
        intervalMinutes: Math.max(1, scheduleDays) * 1440,
        intendedPlatform,
        lengthScope,
        videoMode,
        csOwner: "Agentic",
        staticBarEnabled,
        staticBarSchemes,
        staticBarSchemeMode,
        staticBarDurationSec,
      };
      const draftRes = await fetch(`${API_BASE}/api/automations/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!draftRes.ok) throw new Error((await draftRes.json().catch(() => ({}))).error ?? `HTTP ${draftRes.status}`);
      const draft = await draftRes.json();
      const freezeRes = await fetch(`${API_BASE}/api/automations/${draft.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, prompt: frozen.promptText, ads: frozen.ads, query: frozen.query }),
      });
      if (!freezeRes.ok) throw new Error((await freezeRes.json().catch(() => ({}))).error ?? `HTTP ${freezeRes.status}`);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit automation" : "Create automation"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lymphatic — bloating loop" />
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger><SelectValue placeholder="Pick a product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Angle */}
          <div className="space-y-1.5">
            <Label>Angle <span className="text-muted-foreground">(free text — e.g. bloating / cravings / leg swelling)</span></Label>
            <Input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="bloating" />
          </div>

          {/* Persona + Sub-angle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Persona <span className="text-muted-foreground">(optional — label only, not added to the prompt)</span></Label>
              <Select value={persona || "__none__"} onValueChange={(v) => setPersona(v === "__none__" ? "" : v)} disabled={!product || optionsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={!product ? "Pick a product first" : optionsLoading ? "Loading…" : "None (no targeting)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (no targeting)</SelectItem>
                  {personas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sub-angle <span className="text-muted-foreground">(or blank)</span></Label>
              <Select value={subAngle || "__none__"} onValueChange={(v) => setSubAngle(v === "__none__" ? "" : v)} disabled={!product || optionsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={!product ? "Pick a product first" : optionsLoading ? "Loading…" : "None (no targeting)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (no targeting)</SelectItem>
                  {subAngles.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pain points */}
          <div className="space-y-1.5">
            <Label>Pain points <span className="text-muted-foreground">(tap to multi-select, or leave none for AI freedom)</span></Label>
            <MultiSelectChips
              options={pains}
              value={painPoints}
              onChange={setPainPoints}
              disabled={!product || optionsLoading}
              emptyText={!product ? "Pick a product first" : optionsLoading ? "Loading…" : "No pains catalogued for this product yet."}
            />
          </div>

          {/* Custom prompt / guidance */}
          <div className="space-y-1.5">
            <Label>
              Custom prompt
              <span className="ml-1 text-muted-foreground font-normal">(the core instruction — injected verbatim into the prompt)</span>
            </Label>
            <textarea
              value={promptGuide}
              onChange={(e) => setPromptGuide(e.target.value.slice(0, 4000))}
              rows={4}
              placeholder={`e.g. "Iterate the top-spending AppLovin ads launched in the last 7 days", or "iterate ad #2596" — or a plain creative brief like "build ads around the swollen-ankles pain point."`}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              When set, this drives generation. Mention real ads or performance (channel, ROAS, “launched in past N days”, or an ad id) and each run pulls those live ads + their scripts to iterate on — otherwise it generates from the product config as before. Persona and sub-angle are labels only. Cap 4000 chars.
            </p>
            {/* Verify-prompt launcher + verified chip (gap#3/#4). Disabled until a product is chosen. */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                variant="outline"
                size="sm"
                disabled={!product}
                title={!product ? "Pick a product first" : undefined}
                onClick={() => setVerifyOpen(true)}
              >
                Build &amp; verify prompt
              </Button>
              {verified && verified.product === product && verified.text === promptGuide.trim().slice(0, 4000) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="size-3" /> Verified for {products.find((p) => p.id === product)?.name ?? "this product"}
                </span>
              )}
            </div>
          </div>

          {/* Video mode */}
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={videoMode} onValueChange={(v) => setVideoMode(v as "without" | "with" | "combination")} disabled={lengthScope === "4to18min"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="combination">Combination — without → with product (merged, captions + title bar)</SelectItem>
                <SelectItem value="with">With product — single take, avatar holding the product</SelectItem>
                <SelectItem value="without">Without product — single take, hands-free</SelectItem>
              </SelectContent>
            </Select>
            {lengthScope === "4to18min" && (
              <p className="text-[11px] text-muted-foreground">Locked to Combination — 4-18 min ads render HOOK / MODULE / REVEAL clips and merge them in order.</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Combination is the default: a hands-free P1 and a product-in-hand P2 merged into one ad with burned captions and the static title bar.
            </p>
          </div>

          {/* Avatar type */}
          <div className="space-y-1.5">
            <Label>Avatar type</Label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <span className="truncate">
                    {avatarTypes.length === AVATAR_ARCHETYPES.length
                      ? "Mix (all types)"
                      : avatarTypes.map((t) => AVATAR_TYPE_LABEL[t]).join(", ")}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1">
                {AVATAR_ARCHETYPES.map((t) => {
                  const on = avatarTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleAvatarType(t)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
                    >
                      <Checkbox checked={on} className="pointer-events-none" />
                      <span>{AVATAR_TYPE_LABEL[t]}</span>
                    </button>
                  );
                })}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => setAvatarTypes((prev) => prev.length === AVATAR_ARCHETYPES.length ? prev : [...AVATAR_ARCHETYPES])}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
                >
                  <Checkbox checked={avatarTypes.length === AVATAR_ARCHETYPES.length} className="pointer-events-none" />
                  <span>Mix (all types)</span>
                </button>
                <p className="px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
                  Pick one or more. Multiple types rotate across the selected archetypes.
                </p>
              </PopoverContent>
            </Popover>
          </div>

          {/* Avatar pool (specific avatars) */}
          <div className="space-y-1.5">
            <Label>
              Avatar pool
              <span className="ml-1 text-muted-foreground font-normal">
                (optional — leave empty to use all configured {avatarTypes.length === AVATAR_ARCHETYPES.length ? "" : avatarTypes.join("/") + " "}avatars)
              </span>
            </Label>
            <AvatarPicker
              options={avatarOptions}
              value={avatarPool}
              onChange={setAvatarPool}
              loading={avatarsLoading}
            />
          </div>

          {/* Look-coverage banner — admin-facing guard against the wrong-product render. */}
          {product && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                blockNoLooks
                  ? "border-destructive/50 bg-destructive/5 text-destructive"
                  : coverage && coverage.eligible_count > 0
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              {coverageLoading && !coverage ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking which avatars have a look for this product…
                </span>
              ) : !coverage ? (
                <span>Pick a product to verify avatar looks.</span>
              ) : !coverage.requires_product_look ? (
                <span>Without-product mode — no product look needed. {coverage.eligible_count} avatar(s) available.</span>
              ) : coverage.eligible_count > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  {coverage.eligible_count} avatar{coverage.eligible_count === 1 ? "" : "s"} have a “{coverage.product_name}” with-product look ready{coverageLoading ? " · re-checking…" : "."}
                </span>
              ) : (
                <div className="space-y-2">
                  <p>
                    ⚠ No avatar has an approved “{coverage.product_name}” with-product look (with a voice).
                    This automation would render the <strong>wrong product</strong> or nothing — tag or create a
                    “{coverage.product_name}” look first{avatarPool.length ? " (or widen the avatar pool)" : ""}.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => { onClose(); navigate(`/ugc-builder/avatars?product=${encodeURIComponent(product)}`); }}
                  >
                    Add a “{coverage.product_name}” look on Avatars <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Scripts + avatars per script */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Number of scripts per run</Label>
              <Input type="number" min={1} max={20} value={scriptsPerRun} onChange={(e) => setScriptsPerRun(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Avatars per script</Label>
              <Input type="number" min={1} max={20} value={avatarsPerScript} onChange={(e) => setAvatarsPerScript(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </div>
          </div>

          {/* Ad length + intended platform (above-60s is Meta-only) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ad length</Label>
              <Select value={lengthScope} onValueChange={(v) => setLengthScope(v as "under60s" | "above60s" | "4to18min")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="under60s">Classic UGC (under 60s)</SelectItem>
                  <SelectItem value="above60s">Classic UGC 1-4 min</SelectItem>
                  <SelectItem value="4to18min">Classic UGC 4-18 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Intended platform</Label>
              <Select value={intendedPlatform} onValueChange={setIntendedPlatform} disabled={lengthScope === "above60s" || lengthScope === "4to18min"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      disabled={(lengthScope === "above60s" || lengthScope === "4to18min") && p.value === "applovin"}
                    >
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(lengthScope === "above60s" || lengthScope === "4to18min") && (
                <p className="text-[11px] text-muted-foreground">Locked to Meta — Applovin caps at 60s.</p>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label>Schedule</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SCHEDULE_PRESETS.map((p) => {
                const active = scheduleDays === p.days;
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setScheduleDays(p.days)}
                    className={`h-9 rounded-md border text-[12px] font-medium transition-colors ${
                      active
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Custom · </span>
              <Input
                type="number" min={1} max={60}
                value={scheduleDays}
                onChange={(e) => setScheduleDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="h-7 w-20 text-[12px]"
              />
              <span className="text-[11px] text-muted-foreground">days between runs</span>
            </div>
          </div>

          {/* Static title bar (V2) — AI-generated bar text per script, stamped on every video. */}
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={staticBarEnabled}
                onChange={(e) => setStaticBarEnabled(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-[13px] font-semibold">Add static title bar to every video</span>
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {staticBarDurationSec}s default · AI-generated per script
              </span>
            </label>
            {staticBarEnabled && (
              <div className="space-y-2 pt-1">
                {/* Rotation mode */}
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Color rotation</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {([
                      { v: "order",  label: "In order" },
                      { v: "random", label: "Random" },
                    ] as const).map((m) => {
                      const active = staticBarSchemeMode === m.v;
                      return (
                        <button
                          key={m.v}
                          type="button"
                          onClick={() => setStaticBarSchemeMode(m.v)}
                          className={`h-8 rounded-md border text-[12px] font-medium transition-colors ${
                            active
                              ? "border-primary/60 bg-primary/15 text-primary"
                              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color schemes (1–6) */}
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Color schemes</span>
                    <span className="tabular-nums">{staticBarSchemes.length}/{MAX_SCHEMES}</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {STATIC_BAR_PRESETS.map((s) => {
                      const on = staticBarSchemes.some((x) => sameScheme(x, s));
                      const atMax = staticBarSchemes.length >= MAX_SCHEMES;
                      const disabled = !on && atMax;
                      return (
                        <button
                          key={s.label}
                          type="button"
                          disabled={disabled}
                          onClick={() => setStaticBarSchemes((prev) => toggleScheme(prev, s))}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-all ${
                            on ? "ring-2 ring-primary/40 border-primary/40" : "border-border/40 hover:border-border"
                          } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                          style={{ background: s.bg, color: s.fg }}
                          title={disabled ? `Max ${MAX_SCHEMES} schemes` : s.label}
                        >
                          {on && <Check className="size-3" />}
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {staticBarSchemeMode === "order" && staticBarSchemes.length > 1 && (
                    <div className="flex items-center gap-1 mt-2 text-[10.5px] text-muted-foreground">
                      <span className="uppercase tracking-wider">Cycle:</span>
                      {staticBarSchemes.map((s, i) => (
                        <span key={`${s.bg}${s.fg}`} className="inline-flex items-center gap-1">
                          <span className="inline-block size-3 rounded-sm border border-border/60" style={{ background: s.bg }} />
                          {i < staticBarSchemes.length - 1 && <span>→</span>}
                        </span>
                      ))}
                      <span>→ repeat</span>
                    </div>
                  )}
                  <p className="text-[10.5px] text-muted-foreground/80 mt-1.5">
                    {staticBarSchemeMode === "random"
                      ? "Each video's script gets a random scheme from the list (no back-to-back repeats)."
                      : "Schemes rotate one per script, in the order selected, continuing across runs."}
                  </p>
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Duration on screen</span>
                    <span className="tabular-nums">{staticBarDurationSec}s</span>
                  </Label>
                  <input
                    type="range" min={2} max={15} step={1}
                    value={staticBarDurationSec}
                    onChange={(e) => setStaticBarDurationSec(parseInt(e.target.value, 10))}
                    className="w-full mt-1 accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/70">
                    <span>2s</span><span>Default 8s</span><span>15s</span>
                  </div>
                </div>
                <p className="text-[10.5px] text-muted-foreground italic">
                  Bar text is auto-generated per script (theme → primary angle → main pain → pick winner).
                </p>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            CS is hard-coded to <span className="font-medium">Agentic</span>. Persona / sub-angle / pain / avatar options are pulled live from the marketing Ads DB.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          {!isEdit && (
            <Button variant="secondary" disabled={!product || !frozen || saving} onClick={handleSaveDraft}>
              {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving draft…</> : "Save as draft"}
            </Button>
          )}
          <Button onClick={handleCreate} disabled={saving || !product || !name || blockNoLooks} title={blockNoLooks ? "No avatar has a with-product look for this product — tag one on the Avatars page first." : undefined}>
            {saving
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {isEdit ? "Saving…" : "Creating…"}</>
              : (isEdit ? "Save changes" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Verify-only prompt-builder chat. Previews the exact live ads the run will
        pull; on confirm it lifts the verbatim verified text into promptGuide (the
        existing POST/PUT save persists it — no new save path, no schema change). */}
    <PromptBuilderChat
      open={verifyOpen}
      onClose={() => setVerifyOpen(false)}
      userId={userId}
      product={product}
      productLabel={products.find((p) => p.id === product)?.name}
      initialPrompt={promptGuide}
      onConfirm={(v) => {
        setPromptGuide(v.promptText.slice(0, 4000));
        setVerified({ product, text: v.promptText.trim().slice(0, 4000) });
        setFrozen(v);
        setVerifyOpen(false);
      }}
    />
    </>
  );
}

/** Compact multi-select rendered as a chip cloud. Click a chip to toggle. */
function MultiSelectChips({
  options, value, onChange, disabled, emptyText,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  if (disabled || options.length === 0) {
    return <div className="text-xs text-muted-foreground italic px-3 py-2 rounded-md border border-dashed border-border">{emptyText || "—"}</div>;
  }
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Avatar selector. Shows a thumbnail grid; click to toggle. Selection value is the HeyGen avatar id. */
function AvatarPicker({
  options, value, onChange, loading,
}: {
  options: AvatarOption[];
  value: string[];
  onChange: (v: string[]) => void;
  loading?: boolean;
}) {
  if (loading) return <div className="text-xs text-muted-foreground italic">Loading avatars…</div>;
  if (options.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic rounded-md border border-dashed border-border px-3 py-2">
        No avatars match this type. Switch Avatar type to "Mix", or add avatars in the Avatars tab.
      </div>
    );
  }
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
      {options.map((a) => {
        const id = String(a.heygen_avatar_id || a.id);
        const on = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            className={`flex items-center gap-2 rounded-md border p-1.5 text-left transition-colors ${on ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:bg-muted"}`}
            title={a.name}
          >
            {a.image_url ? (
              <img src={a.image_url} alt={a.name} className="size-9 rounded object-cover shrink-0" loading="lazy" />
            ) : (
              <div className="size-9 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">A</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{a.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{a.type}</div>
            </div>
            {on && <Check className="size-3.5 text-primary shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
