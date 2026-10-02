/**
 * BuildFromChatModal v2 — per-script card-stack with futuristic-minimal styling.
 *
 * Each script becomes its own card with:
 *   - Auto-generated concept name (template `<angle> – <description>`) + edit
 *   - Read-only avatar-type chips (from the script's Meta.avatar_types marker)
 *   - "# of avatars" stepper + Random ⇄ Manual avatar selection
 *   - Per-avatar "Random look" toggle + (placeholder) look picker — single
 *     look per avatar until the marketing DB grows a looks model
 *   - Expandable: P1 (without product) + P2 (with product) inline-editable
 *     textareas, plus a Delete-from-batch button
 *
 * The modal submits a per-script payload so each script ships with its own
 * concept, its own (script × avatar) pair list, and any user edits to P1/P2.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Video, Check, FileText, ChevronDown, ChevronUp, Shuffle,
  X as XIcon, Trash2, Sparkles, Lock, Edit3, Hash,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, API_BASE } from "@/lib/queryClient";

export type BuildScriptItem = {
  title: string;
  plain: string;          // legacy full body (P1+P2 joined)
  concept: string;
  angle?: string;
  angleLabel?: string;
  angleCode?: string;
  description?: string;
  p1?: string;
  p2?: string;
  avatarTypes?: Array<"doctor" | "normal" | "natural_wellness" | "any">;
  /** Model-suggested defaults for the dropdowns. Empty = "None fit". */
  suggestedPersona?: string;
  suggestedSubAngle?: string;
  /** Bank ad_ids the model leaned on while writing this script. The
   *  build endpoint hydrates these into lineage.inspo. */
  inspiredByAdIds?: string[];
};

type AvatarOption = {
  id: string;
  name: string;
  type: "doctor" | "natural_wellness" | "normal";
  image_url: string | null;
  voice_name: string | null;
  voice_id: string;
  /** Avatar's saved voice speed (null = global 0.95 default). */
  voice_speed?: number | null;
};

/** HeyGen voice-speed choices. 0.95 is the long-standing global default
 *  (calmer gestures); slow-talking avatars (e.g. Ryan Calloway) get 1.1–1.2
 *  so the pace is baked in at render time — no post-generation speed-up. */
const SPEED_OPTIONS = [0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];
const SPEED_DEFAULT = 0.95;

function SpeedSelect({
  value, onChange, testId,
}: {
  value: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      className="h-6 rounded border border-border/85 bg-background/80 px-1 text-[10.5px] tabular-nums text-foreground focus-visible:outline-none focus-visible:border-primary/40"
      title="Voice speed for this avatar's renders"
      data-testid={testId}
    >
      {SPEED_OPTIONS.map((s) => (
        <option key={s} value={String(s)}>
          {s === SPEED_DEFAULT ? `${s}× (default)` : `${s}×`}
        </option>
      ))}
    </select>
  );
}

const AVATAR_TYPE_PILL: Record<string, { label: string; cls: string }> = {
  doctor:           { label: "Doctor",           cls: "border-sky-400/40 bg-sky-500/10 text-sky-300" },
  natural_wellness: { label: "Natural wellness", cls: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" },
  normal:           { label: "Normal person",    cls: "border-violet-400/40 bg-violet-500/10 text-violet-300" },
  any:              { label: "Any avatar",       cls: "border-amber-400/40 bg-amber-500/10 text-amber-300" },
};

/** Auto-generate a default concept name in the template
 *  `<angle_slug> – <short hook description>`. Falls back to the script's own
 *  concept field, then to the title. */
function defaultConcept(s: BuildScriptItem): string {
  if (s.concept && /[–-]/.test(s.concept)) return s.concept.slice(0, 120);
  if (s.angle && s.description) {
    return `${s.angle} – ${s.description}`.slice(0, 120);
  }
  return (s.concept || s.title || "Untitled concept").slice(0, 120);
}

/** Per-script card state held in the modal. The avatar set is regenerated
 *  whenever the random toggle is on; manual selections persist when the
 *  toggle is off.
 *
 *  persona / subAngle are metadata — they tag the resulting build row so
 *  later analytics can group renders by who/which angle was the target,
 *  without changing the script body itself. Empty = "AI picks" (we leave
 *  the value blank on the lineage row and downstream readers infer from
 *  the script content). */
type CardState = {
  enabled: boolean;
  concept: string;
  conceptEdited: boolean;
  avatarsCount: number;
  randomAvatars: boolean;
  manualAvatarIds: string[];
  randomLookByAvatar: Record<string, boolean>;
  manualLookByAvatar: Record<string, string>;
  expanded: boolean;
  editingScript: boolean;
  p1: string;
  p2: string;
  persona: string;   // "" = "None fit" (no AI suggestion + no human override)
  subAngle: string;  // same
  /** CS label as it appears in cs_config (e.g. "Liam", "Agentic"). Defaults
   *  to the row whose email matches the logged-in user; falls back to
   *  "Agentic". The user can override per-card. */
  cs: string;
};

function makeInitialState(
  s: BuildScriptItem,
  defaultCs: string,
): CardState {
  return {
    enabled: true,
    concept: defaultConcept(s),
    conceptEdited: false,
    avatarsCount: 3,
    randomAvatars: true,
    manualAvatarIds: [],
    randomLookByAvatar: {},
    manualLookByAvatar: {},
    expanded: false,
    editingScript: false,
    p1: s.p1 || s.plain.split(/\n\n+/)[0] || "",
    p2: s.p2 || s.plain.split(/\n\n+/).slice(1).join("\n\n") || "",
    // Honour the model's suggested persona / sub-angle if it emitted them.
    // Empty string is the "None fit" state — the submit handler sends no
    // persona/subAngle field, so the lineage row stays clean.
    persona: s.suggestedPersona || "",
    subAngle: s.suggestedSubAngle || "",
    cs: defaultCs,
  };
}

function pickRandom<T>(pool: T[], n: number): T[] {
  if (n <= 0 || pool.length === 0) return [];
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

export type BuildFromChatModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productSlug: string;
  chatId: string | null;
  scripts: BuildScriptItem[];
};

export function BuildFromChatModal({ open, onOpenChange, productSlug, chatId, scripts }: BuildFromChatModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [funnel, setFunnel] = useState("Onbrand");
  const [submitting, setSubmitting] = useState(false);
  const [cardsByIdx, setCardsByIdx] = useState<Record<number, CardState>>({});
  // Per-avatar voice-speed overrides for THIS build, keyed by avatar id and
  // shared across all script cards (an avatar speaks at one speed per batch).
  // Only explicitly changed values are sent; everything else falls back to the
  // avatar's saved speed, then the global 0.95 default.
  const [speedByAvatar, setSpeedByAvatar] = useState<Record<string, number>>({});
  const setAvatarSpeed = useCallback((id: string, v: number) => {
    setSpeedByAvatar((s) => ({ ...s, [id]: v }));
  }, []);

  // Roster of Creative Strategists from cs_config. We pre-select the row
  // whose email matches the logged-in user (a real human is curating the
  // AI's output, so the CS column should reflect that). If no match,
  // fall back to "Agentic". Automation runs always pass "Agentic" — they
  // don't go through this modal.
  const csOwnersQ = useQuery<Array<{ label: string; email: string }>>({
    queryKey: [`${API_BASE}/api/options/cs-owners`],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/options/cs-owners");
      return r.json();
    },
    enabled: open,
  });
  const csOwners = csOwnersQ.data ?? [];
  // user.email returns the logged-in email from auth. We match it
  // case-insensitively against the cs_config roster; falls back to "Agentic"
  // if no roster row matches.
  const userEmail = user?.email || "";
  const defaultCs = useMemo(() => {
    if (!csOwners.length) return "Agentic";
    const mine = csOwners.find((c) => c.email.toLowerCase() === userEmail.toLowerCase());
    if (mine) return mine.label;
    const agentic = csOwners.find((c) => /^agentic$/i.test(c.label));
    return agentic?.label || csOwners[0].label;
  }, [csOwners, userEmail]);

  // Pull all configured avatars once (mix). We filter per-card by avatar-type
  // client-side so we don't hammer the API.
  // NOTE: an explicit queryFn is required here — the default joins the
  // queryKey with "/" which would hit /api/options/avatars/mix (a path the
  // server doesn't define → SPA HTML fallback → JSON parse fails silently
  // → allAvatars stays empty → "0 eligible" on every card).
  const avatarsQ = useQuery<AvatarOption[]>({
    queryKey: [`${API_BASE}/api/options/avatars`, "mix"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/options/avatars?type=mix");
      return r.json();
    },
    enabled: open,
  });
  const allAvatars = avatarsQ.data ?? [];

  // Personalization options shared across the modal — same endpoints the
  // automation form uses. Cached server-side per slug for 5 min, so reopening
  // the modal is instant.
  const personasQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/personas`, productSlug],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/options/personas?product=${encodeURIComponent(productSlug)}`);
      return r.json();
    },
    enabled: open && !!productSlug,
  });
  const subAnglesQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/sub-angles`, productSlug],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/options/sub-angles?product=${encodeURIComponent(productSlug)}`);
      return r.json();
    },
    enabled: open && !!productSlug,
  });
  const personaOptions = personasQ.data ?? [];
  const subAngleOptions = subAnglesQ.data ?? [];

  // Reset state whenever the modal opens with a new batch. defaultCs is
  // intentionally OUT of the deps — if csOwners loads after the modal opens
  // we don't want to wipe per-card user edits.
  useEffect(() => {
    if (!open) return;
    const fresh: Record<number, CardState> = {};
    scripts.forEach((s, i) => { fresh[i] = makeInitialState(s, defaultCs); });
    setCardsByIdx(fresh);
    setFunnel("Onbrand");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scripts]);

  // Second-pass: when the CS roster finishes loading AFTER the modal opens,
  // update each card's CS field IF the user hasn't touched it (heuristic: the
  // current value still equals the seed value at open time, which we store on
  // a ref). This avoids the "we wiped your edits" bug while still letting the
  // server-resolved default land in the picker.
  const seededCsRef = useRef<string>("Agentic");
  useEffect(() => {
    if (!open) return;
    const prev = seededCsRef.current;
    if (defaultCs === prev) return;
    setCardsByIdx((prevCards) => {
      const next: Record<number, CardState> = {};
      for (const [k, v] of Object.entries(prevCards)) {
        next[Number(k)] = (v && v.cs === prev) ? { ...v, cs: defaultCs } : v;
      }
      return next;
    });
    seededCsRef.current = defaultCs;
  }, [defaultCs, open]);

  const filterAvatars = useCallback((wanted: BuildScriptItem["avatarTypes"]) => {
    if (!wanted || wanted.length === 0 || wanted.includes("any")) return allAvatars;
    const set = new Set(wanted);
    return allAvatars.filter((a) => set.has(a.type));
  }, [allAvatars]);

  const patchCard = (idx: number, patch: Partial<CardState>) => {
    setCardsByIdx((prev) => ({ ...prev, [idx]: { ...prev[idx], ...patch } }));
  };

  const totalVideos = useMemo(() => {
    let t = 0;
    for (const idx of Object.keys(cardsByIdx).map(Number)) {
      const c = cardsByIdx[idx];
      if (!c || !c.enabled) continue;
      t += Math.max(0, c.avatarsCount);
    }
    return t;
  }, [cardsByIdx]);

  const enabledCount = useMemo(
    () => Object.values(cardsByIdx).filter((c) => c.enabled).length,
    [cardsByIdx],
  );

  const submit = async () => {
    const payloads: any[] = [];
    for (let i = 0; i < scripts.length; i++) {
      const c = cardsByIdx[i];
      if (!c || !c.enabled) continue;
      const s = scripts[i];
      const eligible = filterAvatars(s.avatarTypes).map((a) => a.id);
      const picked = c.randomAvatars
        ? pickRandom(eligible, c.avatarsCount)
        : c.manualAvatarIds.slice(0, c.avatarsCount);
      if (picked.length === 0) {
        toast({
          title: `Script #${i + 1} has no avatars`,
          description:
            "Either flip Avatar pick to Random, or pick at least one avatar manually. If the filter matched zero avatars, set the script's avatar_types to 'any' in chat first.",
          variant: "destructive",
        });
        return;
      }
      const body = [c.p1, c.p2].filter(Boolean).join("\n\n").trim();
      if (body.length < 20) {
        toast({
          title: `Script #${i + 1} is empty`,
          description: "Expand the card to add the P1 / P2 text or remove it from the batch.",
          variant: "destructive",
        });
        return;
      }
      payloads.push({
        title: s.title.slice(0, 120),
        plain: body,
        concept: c.concept.slice(0, 200),
        p1: c.p1,
        p2: c.p2,
        avatarIds: picked,
        persona: (c.persona || "").slice(0, 200) || undefined,
        subAngle: (c.subAngle || "").slice(0, 200) || undefined,
        cs: (c.cs || "").slice(0, 40) || undefined,
        inspiredByAdIds: (s.inspiredByAdIds || []).slice(0, 8),
      });
    }
    if (!payloads.length) {
      toast({ title: "Nothing to build", description: "Re-enable at least one script.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Inline fetch so 409 (in-flight build for this chat) routes the user
      // to the existing build instead of showing a generic error toast.
      const r = await fetch(`${API_BASE}/api/ugc-builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: productSlug,
          chatId,
          cs: "Agentic",
          funnel,
          // Chat-side builds always go through the approval gate — same
          // contract as the batch-creator page. Without this the runner
          // defaults to phase="live", auto-marks every row approval_status
          // = "approved", then immediately tries to push to pipeline. In
          // dry-run mode (PIPELINE_PUSH_ENABLED=false) the push gets a
          // pipeline_status="skipped" and the row ends up in a zombie
          // state: locked, no Push CTA, status chip says "Pushing" but
          // nothing is actually pushing. Sending pending_approval keeps
          // the row in the reviewable state so the Push CTA renders.
          phase: "pending_approval",
          perScript: payloads,
          // Per-avatar voice-speed overrides (only user-changed values).
          ...(Object.keys(speedByAvatar).length ? { avatarSpeeds: speedByAvatar } : {}),
        }),
      });
      const data = await r.json().catch(() => ({} as any));
      if (r.status === 409 && data?.id) {
        toast({ title: "Already building", description: "Opening the in-progress build." });
        onOpenChange(false);
        navigate(`/ugc-builder/builds/${data.id}`);
        return;
      }
      if (!r.ok) throw new Error(data?.message || `${r.status}: build failed to start`);
      toast({
        title: "Build queued",
        description: `${enabledCount} ad${enabledCount === 1 ? "" : "s"} · ${totalVideos} HeyGen render${totalVideos === 1 ? "" : "s"} queueing.`,
      });
      onOpenChange(false);
      if (data?.id) navigate(`/ugc-builder/builds/${data.id}`);
    } catch (err: any) {
      toast({ title: "Build failed to start", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-border/85 bg-gradient-to-b from-card via-card to-background"
      >
        {/* Custom header with glow accent */}
        <div className="relative overflow-hidden border-b border-border/80">
          <div className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -top-8 -left-8 size-32 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
          <DialogHeader className="relative px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Sparkles className="size-4 text-primary" />
              Build AI UGC ads from {scripts.length} script{scripts.length === 1 ? "" : "s"}
            </DialogTitle>
            <p className="text-[11.5px] text-muted-foreground mt-1">
              Each card below ships as its own build job — random avatar pick by default, expand to edit P1 / P2 inline.
            </p>
          </DialogHeader>
        </div>

        {/* Top control bar */}
        <div className="px-5 py-3 border-b border-border/85 flex items-center gap-3 flex-wrap bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Funnel</Label>
            <Select value={funnel} onValueChange={setFunnel}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Only the funnels pipeline-node /add-video-ad accepts in
                    its Joi schema. Historical ads.funnel values like
                    "Advertorial" / "Quiz" / "3P Adv" exist in the analytics
                    DB but the create-ad endpoint rejects them. */}
                <SelectItem value="Onbrand">Onbrand</SelectItem>
                <SelectItem value="Comparison">Comparison</SelectItem>
                <SelectItem value="TSL">TSL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-[11px] text-muted-foreground">
            CS · <span className="font-medium text-foreground">Agentic</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11.5px]">
            <span className="text-muted-foreground tabular-nums">
              {enabledCount} of {scripts.length} script{scripts.length === 1 ? "" : "s"} active
            </span>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary tabular-nums font-medium">
              {totalVideos} video render{totalVideos === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Script-card stack */}
        <div className="px-5 py-4 space-y-3">
          {scripts.map((s, i) => {
            const c = cardsByIdx[i];
            if (!c) return null;
            return (
              <ScriptCard
                key={i}
                idx={i}
                script={s}
                state={c}
                allAvatars={allAvatars}
                eligibleAvatars={filterAvatars(s.avatarTypes)}
                personaOptions={personaOptions}
                subAngleOptions={subAngleOptions}
                csOwners={csOwners}
                onPatch={(p) => patchCard(i, p)}
                onDelete={() => patchCard(i, { enabled: false })}
                onRestore={() => patchCard(i, { enabled: true })}
                speedByAvatar={speedByAvatar}
                onSetSpeed={setAvatarSpeed}
              />
            );
          })}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border/80 bg-card/50">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || totalVideos === 0}
            data-testid="button-submit-build"
            className="relative"
          >
            {submitting ? <Loader2 className="size-3 animate-spin" /> : <Video className="size-3" />}
            {/* Each enabled script becomes its own ad row in AdsDB (one ad_id
                per script). Each avatar on that script renders a separate
                HeyGen video that gets uploaded to Frame.io / the ad's Drive
                folder. So an "ad" is the unit that matters for the marketing
                team — videos is the renderer-level count. */}
            <span className="ml-1.5">
              {submitting
                ? "Queueing…"
                : `Build ${enabledCount} ad${enabledCount === 1 ? "" : "s"} · ${totalVideos} video${totalVideos === 1 ? "" : "s"}`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ScriptCard({
  idx, script, state, allAvatars, eligibleAvatars, personaOptions, subAngleOptions, csOwners, onPatch, onDelete, onRestore, speedByAvatar, onSetSpeed,
}: {
  idx: number;
  script: BuildScriptItem;
  state: CardState;
  allAvatars: AvatarOption[];
  eligibleAvatars: AvatarOption[];
  personaOptions: string[];
  subAngleOptions: string[];
  csOwners: Array<{ label: string; email: string }>;
  onPatch: (p: Partial<CardState>) => void;
  onDelete: () => void;
  onRestore: () => void;
  speedByAvatar: Record<string, number>;
  onSetSpeed: (id: string, v: number) => void;
}) {
  const types = script.avatarTypes && script.avatarTypes.length ? script.avatarTypes : (["any"] as const);
  const avatarById = useMemo(() => {
    const m = new Map<string, AvatarOption>();
    for (const a of allAvatars) m.set(a.id, a);
    return m;
  }, [allAvatars]);

  // Picked avatars for the preview row: random sample if random=on, else manual.
  const picked = useMemo(() => {
    if (state.randomAvatars) return pickRandom(eligibleAvatars, state.avatarsCount);
    return state.manualAvatarIds
      .map((id) => avatarById.get(id))
      .filter((a): a is AvatarOption => !!a)
      .slice(0, state.avatarsCount);
  }, [state.randomAvatars, state.manualAvatarIds, state.avatarsCount, eligibleAvatars, avatarById]);

  const toggleManualAvatar = (id: string) => {
    const has = state.manualAvatarIds.includes(id);
    onPatch({
      manualAvatarIds: has
        ? state.manualAvatarIds.filter((x) => x !== id)
        : [...state.manualAvatarIds, id].slice(0, Math.max(state.avatarsCount, state.manualAvatarIds.length + 1)),
    });
  };

  if (!state.enabled) {
    return (
      <article className="rounded-xl border border-border/70 bg-muted/20 px-4 py-2.5 flex items-center gap-3 opacity-60">
        <Trash2 className="size-3.5 text-muted-foreground" />
        <span className="text-[12.5px] text-muted-foreground truncate">
          #{idx + 1} · removed from this batch — {script.title}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={onRestore}>
          Restore
        </Button>
      </article>
    );
  }

  return (
    <article
      className="relative rounded-xl border border-border/85 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-border/90 transition-colors"
      data-testid={`build-script-${idx}`}
    >
      {/* Card header */}
      <header className="px-4 py-3 flex items-start gap-3 border-b border-border/85">
        <div className="text-[10px] font-mono tabular-nums text-muted-foreground/70 mt-1 w-8 shrink-0">
          {String(idx + 1).padStart(2, "0")}
        </div>
        <FileText className="size-4 text-primary mt-1 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Concept name input */}
          <div className="relative">
            <Input
              value={state.concept}
              onChange={(e) => onPatch({ concept: e.target.value, conceptEdited: true })}
              className="h-7 text-[13px] font-medium border-transparent bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary/40 hover:bg-muted/20"
              placeholder="Concept name"
              data-testid={`build-concept-${idx}`}
            />
            <div className="absolute right-0 top-1.5 text-[10px] text-muted-foreground/75 flex items-center gap-1 pr-1 pointer-events-none">
              {state.conceptEdited ? <Edit3 className="size-2.5" /> : <Sparkles className="size-2.5" />}
              <span className="hidden sm:inline">{state.conceptEdited ? "edited" : "auto"}</span>
            </div>
          </div>
          {/* Avatar-type chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {types.map((t) => {
              const p = AVATAR_TYPE_PILL[t] || AVATAR_TYPE_PILL.any;
              return (
                <span key={t} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${p.cls}`}>
                  <Lock className="size-2.5 opacity-50" />
                  {p.label}
                </span>
              );
            })}
            <span className="text-muted-foreground/75">·</span>
            <span className="text-muted-foreground tabular-nums">{eligibleAvatars.length} eligible</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={() => onPatch({ expanded: !state.expanded })}
            data-testid={`build-expand-${idx}`}
          >
            {state.expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {state.expanded ? "Hide" : "Inspect"}
          </Button>
          <button
            type="button"
            onClick={onDelete}
            className="size-7 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
            title="Remove from this batch"
            data-testid={`build-delete-${idx}`}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      </header>

      {/* Avatar pick controls */}
      <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-center">
        <div className="flex items-center gap-2">
          <Hash className="size-3 text-muted-foreground" />
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Avatars</Label>
          <div className="inline-flex items-center rounded-md border border-border/85 overflow-hidden">
            <button
              type="button"
              className="size-7 hover:bg-muted text-sm leading-none"
              onClick={() => onPatch({ avatarsCount: Math.max(1, state.avatarsCount - 1) })}
              data-testid={`build-count-down-${idx}`}
            >−</button>
            <div className="w-8 text-center text-[12.5px] tabular-nums">{state.avatarsCount}</div>
            <button
              type="button"
              className="size-7 hover:bg-muted text-sm leading-none"
              onClick={() => onPatch({ avatarsCount: Math.min(20, state.avatarsCount + 1) })}
              data-testid={`build-count-up-${idx}`}
            >+</button>
          </div>
        </div>
        <ToggleRow
          label="Random pick"
          checked={state.randomAvatars}
          onChange={(v) => onPatch({ randomAvatars: v })}
          hint={state.randomAvatars
            ? `picks ${state.avatarsCount} at random from the ${eligibleAvatars.length} avatars matching this script's type`
            : "untick to manually pick which avatars are used"}
          icon={<Shuffle className="size-3" />}
          testId={`build-random-${idx}`}
        />
      </div>

      {/* Avatar preview / manual picker */}
      <div className="px-4 pb-3">
        {state.randomAvatars ? (
          <AvatarPreviewRow
            picked={picked}
            requested={state.avatarsCount}
            speedByAvatar={speedByAvatar}
            onSetSpeed={onSetSpeed}
          />
        ) : (
          <ManualAvatarGrid
            options={eligibleAvatars}
            picked={state.manualAvatarIds}
            limit={state.avatarsCount}
            onToggle={toggleManualAvatar}
            avatarById={avatarById}
            speedByAvatar={speedByAvatar}
            onSetSpeed={onSetSpeed}
          />
        )}
      </div>

      {/* Per-script CS picker. A real human Creative Strategist is curating
          the AI's output, so the CS column on the resulting ad row should
          reflect that. Defaults to the row matching the logged-in user;
          automation runs always pass "Agentic" and don't go through this
          modal. The list comes from cs_config on pipeline-node. We use a
          Combobox with type-ahead because the live roster is ~40 names. */}
      <div className="px-4 pb-3 border-t border-border/85 pt-3 space-y-1">
        <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
          Creative Strategist (CS)
          <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">flows into ClickUp, Drive folder + brief doc names</span>
        </Label>
        <CsCombobox value={state.cs} owners={csOwners} onChange={(v) => onPatch({ cs: v })} testId={`build-cs-${idx}`} />
      </div>

      {/* Per-script metadata pickers — persona + sub-angle. */}
      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/85 pt-3">
        <PersonalizationSelect
          label="Persona"
          value={state.persona}
          options={personaOptions}
          onChange={(v) => onPatch({ persona: v })}
          testId={`build-persona-${idx}`}
        />
        <PersonalizationSelect
          label="Sub-angle"
          value={state.subAngle}
          options={subAngleOptions}
          onChange={(v) => onPatch({ subAngle: v })}
          testId={`build-subangle-${idx}`}
        />
      </div>

      {/* Expanded view: P1 / P2 inline editor */}
      {state.expanded && (
        <div className="border-t border-border/85 px-4 py-3 space-y-3 bg-background/40">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Edit3 className="size-3" />
            <span>The two clips that ship to the HeyGen renderer. Edit either or remove the script entirely.</span>
            {state.editingScript ? (
              <button
                type="button"
                onClick={() => onPatch({ editingScript: false })}
                className="ml-auto text-primary hover:underline"
                data-testid={`build-lock-${idx}`}
              >Lock</button>
            ) : (
              <button
                type="button"
                onClick={() => onPatch({ editingScript: true })}
                className="ml-auto text-primary hover:underline"
                data-testid={`build-unlock-${idx}`}
              >Edit</button>
            )}
          </div>
          <ClipEditor
            label="Without product (P1)"
            value={state.p1}
            disabled={!state.editingScript}
            onChange={(v) => onPatch({ p1: v })}
            testId={`build-p1-${idx}`}
          />
          <ClipEditor
            label="With product (P2)"
            value={state.p2}
            disabled={!state.editingScript}
            onChange={(v) => onPatch({ p2: v })}
            testId={`build-p2-${idx}`}
          />
        </div>
      )}
    </article>
  );
}

/** Type-ahead Combobox for picking a CS from a 40+-item roster. Falls back
 *  to a single "value visible / not editable" pill when no roster rows are
 *  available (DB down / unauthenticated). */
function CsCombobox({
  value, owners, onChange, testId,
}: {
  value: string;
  owners: Array<{ label: string; email: string }>;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (owners.length === 0) {
    return (
      <div className="h-8 px-3 flex items-center text-[12px] rounded-md border border-border/85 bg-muted/30 text-muted-foreground" data-testid={testId}>
        {value || "Agentic"} <span className="ml-auto text-[10.5px] italic">(roster unavailable)</span>
      </div>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-testid={testId}
          className="h-8 w-full px-3 flex items-center text-[12px] rounded-md border border-border/85 bg-background hover:bg-muted/40 transition-colors text-left"
        >
          <span className="truncate">{value || "Pick a CS"}</span>
          <ChevronDown className="ml-auto size-3 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search Creative Strategists…" className="h-9 text-[12px]" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No CS matched.</CommandEmpty>
            <CommandGroup>
              {owners.map((c) => (
                <CommandItem
                  key={c.label}
                  value={`${c.label} ${c.email}`}
                  onSelect={() => { onChange(c.label); setOpen(false); }}
                  className="text-[12px] flex items-center"
                >
                  <Check className={`mr-2 size-3.5 ${value === c.label ? "opacity-100 text-emerald-500" : "opacity-0"}`} />
                  <span className="font-medium">{c.label}</span>
                  <span className="ml-auto text-[10.5px] text-muted-foreground">{c.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PersonalizationSelect({
  label, value, options, onChange, testId,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  testId?: string;
}) {
  // "__none__" is the sentinel for the "None fit" option (submits blank).
  // shadcn's Select rejects empty-string values, hence the sentinel.
  const NONE = "__none__";
  // If the model suggested a persona/sub-angle that isn't actually in the DB
  // list (the option dropdown), surface it anyway as a one-off item so the
  // user sees what was suggested and can change it. Otherwise the default
  // would silently fall back to "None fit".
  const cleanOptions = options.filter((o) => o && o.trim());
  const valueNotInList = value && !cleanOptions.includes(value);
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
        {label}
        <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(AI pre-fills · editable)</span>
      </Label>
      <Select
        value={value || NONE}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
      >
        <SelectTrigger className="h-8 text-[12px]" data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {valueNotInList && (
            <SelectItem value={value}>{value}</SelectItem>
          )}
          {cleanOptions.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
          <SelectItem value={NONE} className="text-muted-foreground italic">
            None fit
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({
  label, checked, onChange, hint, icon, testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  icon?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium border transition-colors ${
          checked
            ? "bg-primary/10 border-primary/40 text-primary"
            : "bg-card border-border text-muted-foreground hover:text-foreground"
        }`}
        data-testid={testId}
      >
        <div className={`size-3 rounded-sm border ${checked ? "bg-primary border-primary" : "border-muted-foreground/60"} flex items-center justify-center`}>
          {checked && <Check className="size-2 text-primary-foreground" />}
        </div>
        {icon}
        {label}
      </button>
      {hint && <span className="text-[10.5px] text-muted-foreground/80">{hint}</span>}
    </div>
  );
}

function AvatarPreviewRow({
  picked, requested, speedByAvatar, onSetSpeed,
}: {
  picked: AvatarOption[];
  requested: number;
  speedByAvatar: Record<string, number>;
  onSetSpeed: (id: string, v: number) => void;
}) {
  if (picked.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/85 px-3 py-2 text-[11px] text-muted-foreground italic">
        No eligible avatars match this script's avatar type. Change the script's `avatar_types` in chat, set the avatar pool override, or untick Random and pick manually.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 mr-1 shrink-0">
        Sample
      </span>
      {picked.map((a, i) => (
        <div key={a.id + i} className="shrink-0 flex items-center gap-1.5 rounded-md border border-border/80 bg-card/80 px-1.5 py-1 text-[11px]">
          {a.image_url ? (
            <img src={a.image_url} alt={a.name} className="size-7 rounded object-cover" />
          ) : (
            <div className="size-7 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">A</div>
          )}
          <span className="font-medium truncate max-w-[120px]">{a.name}</span>
          <SpeedSelect
            value={speedByAvatar[a.id] ?? a.voice_speed ?? SPEED_DEFAULT}
            onChange={(v) => onSetSpeed(a.id, v)}
            testId={`build-speed-${a.id}`}
          />
        </div>
      ))}
      {picked.length < requested && (
        <span className="text-[10.5px] text-amber-500 shrink-0">
          only {picked.length} eligible (asked for {requested})
        </span>
      )}
    </div>
  );
}

function ManualAvatarGrid({
  options, picked, limit, onToggle, avatarById, speedByAvatar, onSetSpeed,
}: {
  options: AvatarOption[];
  picked: string[];
  limit: number;
  onToggle: (id: string) => void;
  avatarById: Map<string, AvatarOption>;
  speedByAvatar: Record<string, number>;
  onSetSpeed: (id: string, v: number) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/85 px-3 py-2.5 text-[11px] text-muted-foreground italic">
        No eligible avatars for this script's type. Either change the script's `avatar_types` in chat, or override the avatar's type via Architecture → Avatar overrides.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-[10.5px] text-muted-foreground tabular-nums">
        Pick {limit}{picked.length === limit ? " (limit reached)" : ""} · {picked.length} selected
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto p-0.5">
        {options.map((a) => {
          const on = picked.includes(a.id);
          const atLimit = picked.length >= limit;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onToggle(a.id)}
              disabled={!on && atLimit}
              className={`flex items-center gap-1.5 rounded-md border p-1 text-left transition-all ${
                on
                  ? "border-primary ring-1 ring-primary/40 bg-primary/5"
                  : atLimit
                    ? "border-border/85 opacity-50 cursor-not-allowed"
                    : "border-border/85 hover:border-border hover:bg-muted/40"
              }`}
              data-testid={`build-pick-avatar-${a.id}`}
              title={a.id}
            >
              {a.image_url ? (
                <img src={a.image_url} alt={a.name} className="size-8 rounded object-cover shrink-0" />
              ) : (
                <div className="size-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">A</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-medium truncate">{a.name}</div>
                <div className="text-[9.5px] text-muted-foreground truncate">{a.type}</div>
              </div>
              {on && <Check className="size-3 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
      {picked.length > 0 && (
        <div className="pt-1.5 space-y-1">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
            Voice speed
            <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">baked in at render — no post-generation speed-up needed</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {picked.map((id) => {
              const a = avatarById.get(id);
              if (!a) return null;
              return (
                <div key={id} className="flex items-center gap-1.5 rounded-md border border-border/80 bg-card/80 px-1.5 py-1 text-[11px]">
                  <span className="font-medium truncate max-w-[110px]">{a.name}</span>
                  <SpeedSelect
                    value={speedByAvatar[id] ?? a.voice_speed ?? SPEED_DEFAULT}
                    onChange={(v) => onSetSpeed(id, v)}
                    testId={`build-speed-${id}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ClipEditor({
  label, value, disabled, onChange, testId,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const words = (value || "").trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
        <span>{label}</span>
        <span className="tabular-nums">{words}w</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-border/85 bg-background/60 px-3 py-2 text-[12.5px] leading-relaxed font-mono disabled:opacity-80 disabled:cursor-default focus-visible:outline-none focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20 min-h-[100px] max-h-[260px]"
        rows={Math.max(3, Math.min(10, Math.ceil(value.length / 90)))}
        spellCheck={false}
        data-testid={testId}
      />
    </div>
  );
}
