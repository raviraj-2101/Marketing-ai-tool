/**
 * /ugc-builder/batch-creator — multi-ad batch creator
 *
 * The user can land here in two ways:
 *
 *   1. From the chat side panel ("Send to batch creator"). Scripts and the
 *      product slug are passed via sessionStorage (key = "ugc.create.payload")
 *      so we don't put potentially-long script bodies in a URL. The URL only
 *      carries `?from=chat-<chatId>` so the "Back to chat" button can return
 *      the user where they came from.
 *
 *   2. Directly via the new "Create" nav link. The page opens blank; the user
 *      adds ads manually.
 *
 * Each ad is a card. Per-ad settings:
 *   - Mode (with / without / combination of with-and-without product)
 *   - Length toggle (Under 60s — when ON the 60s cap is enforced server-side,
 *     when OFF the user opts into long-form)
 *   - Script body (one textarea for with/without, two textareas for combo
 *     — P1 hands-free + P2 holding bottle)
 *   - Word-count meter with a 60s line at 170 words (170 WPM, the live
 *     tool's assumed pace per the audit of image-builder)
 *   - Allowed avatar types (multi-select chips — doctor / natural / normal /
 *     any). Drives which avatars from /api/options/avatars match.
 *   - Number of avatars + Random/Manual pick mode. Manual surfaces a grid.
 *
 * Batch-wide settings on top (the user explicitly asked for these to be
 * universal across all ads in the batch, not per-ad):
 *   - Brand + Product (the product slug)
 *   - CS — searchable Combobox over cs_config
 *   - Funnel — Joi enum: Onbrand / Comparison / TSL
 *   - Persona — DISTINCT from ads.persona for the product
 *   - Sub-angle — DISTINCT from ads.sub_angle for the product
 *   - Main pains — multi-select chips (DISTINCT from ads.main_pains)
 *   - Intended platform — Meta / Applovin / Both
 *
 * Submit:
 *   - POST /api/ugc-builds with phase="pending_approval".
 *   - Server returns the new build id.
 *   - We redirect to /ugc-builder/log (the per-ad approve UI lives there).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Trash2, Video, FileText, ChevronDown, Sparkles, Shuffle, RefreshCw,
  Lock, Loader2, AlertTriangle, Check, MessageSquare, Hash, X as XIcon,
  ChevronUp, ChevronDown as ChevronDownIcon, Send, Edit3, Settings2, Maximize2,
} from "lucide-react";
import { useAdsDbFields, type AdsField } from "@/hooks/useAdsDb";
import { ManageOptionsDialog } from "@/hooks/useAdsAgGridColumns";
import { CUSTOM_FIELD_IDS, type TargetingFieldKey } from "@/lib/customFieldIds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import {
  buildSettingsSnapshot,
  hydrateRestorePayload,
  RESTORE_SESSION_KEY,
  SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/ugcSettingsSnapshot";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/hooks/useAuth";
import { StaticBarEditor } from "@/components/ugc/StaticBarEditor";
import { DashboardLayout } from "@/components/DashboardLayout";
import { generateAnimatedCharacter, generateAnimatedScene } from "../lib/animatedCharsApi";
import { driveProxyFull } from "../lib/driveImage";
import { SoftSelect, ChipMultiSelect, CsCombobox, type CsOwner } from "@/components/concept/ConceptControls";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const VOICE_ID = 'Ryelb74sfkLgSElzikns';

/** Render a Google-Drive fileId as a viewable <img> src via the Supabase
 *  drive-proxy-image edge function (mirrors EditImagesDialog / GeneratorForm). */
const driveProxySrc = (fileId: string): string =>
  `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}`;

/** Canonical Google-Drive share URL for a fileId — the shape sent to the
 *  backend as the scene image (e.g. https://drive.google.com/file/d/<id>/view). */
const driveFileUrl = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

/** Direct Google-Drive DOWNLOAD url for a fileId — the shape the FAL /
 *  scene-prompt APIs expect (they fetch the bytes directly). */
const driveDownloadUrl = (fileId: string): string =>
  `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

// ─────────────────────────────────────────────────────────────────────────
// Constants — pulled from the audit of image-builder
// ─────────────────────────────────────────────────────────────────────────

/** The live tool assumes 170 WPM (170 words per minute) for English UGC
 *  delivery. Matches skill.md's 170-word cap for a 60-second avatar_60s
 *  script. We use the same constant client-side so the word-count meter
 *  predicts exactly what the server-side cap will enforce. */
const WPM = 170;
const SIXTY_SEC_LIMIT_WORDS = 170;

const AVATAR_TYPES = [
  { id: "doctor",            label: "Doctor",           cls: "border-sky-400/40 bg-sky-500/10 text-sky-300" },
  { id: "natural_wellness",  label: "Natural wellness", cls: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" },
  { id: "normal",            label: "Normal person",    cls: "border-violet-400/40 bg-violet-500/10 text-violet-300" },
] as const;

type AvatarTypeId = (typeof AVATAR_TYPES)[number]["id"];
// "animated" = Format-04 ("Animated Characters" — slug "04-animated-characters-ads").
// It is an image-only per-character workspace (no HeyGen/FAL video pipeline). The
// mode is auto-selected + locked on the 04 handoff and is NEVER offered by the
// clickable ModeToggle — it only ever appears as a locked chip.
type Mode = "with" | "without" | "combination" | "animated";

// Single source of truth for the Format-04 locked-mode chip label. Used by the
// mode badge (and any other 04 UI) so the literal isn't scattered.
const ANIMATED_MODE_LABEL = "Animated Characters";
// Format-05 (Classic UGC 1-4 min) adds optional middle beats. "60s" matches the
// existing single-take Classic flow (P1 + P2); "1-4min" allows the M1 and M2
// hands-free middle clips. Only meaningful when mode === "combination".
// Format-08 (Classic UGC 4-18 min) is "4-18min": HOOK + N hands-free MODULE
// clips + REVEAL (with product). Set from the chat session's format slug ONLY —
// never content-sniffed.
type LengthTarget = "60s" | "1-4min" | "4-18min";

// Per-clip scenery/scene visuals carried from the Format-02 script. p1–p3 are
// the Advanced Intro callouts (scenery + scene narrative); p4/p5 are the body
// sections (scenery only). Drives the Generate Scene pipeline payload.
type PipelineScenes = {
  p1: { scenery: string; scene: string };
  p2: { scenery: string; scene: string };
  p3: { scenery: string; scene: string };
  p4: { scenery: string };
  p5: { scenery: string };
};
// Per-avatar generated pipeline images — each slot holds a Google-Drive fileId.
type PipelineImageSet = { p1?: string; p2?: string; p3?: string; p4?: string; p5?: string };

// Per-ad card state. Lives in component state only; serialised at submit.
type AdState = {
  uid: string;                   // local-only — for React keys
  concept: string;               // free-text — also serves as the ad's identity (the title was redundant)
  mode: Mode;
  /** When true the user can't change mode (e.g. ad came in from chat with a
   *  P1+P2 split already authored). Defaults false. */
  modeLocked: boolean;
  allowUnlimitedLength: boolean; // false = under 60s enforced
  /** True when this ad was built from a "Unique Intro" (Format 02) script.
   *  Gates the 3 advanced-intro script fields below — they only surface for
   *  these scripts. Always false for manually-created ads. */
  isUniqueIntro: boolean;
  /** Script type label as shown on the generate-script page's format picker
   *  (e.g. "Unique Intro · A1 Label/Cause"). Carried through the chat handoff
   *  so the Mode badge can mirror the exact format the script was authored as.
   *  Empty for manually-created ads — those derive their badge from mode +
   *  lengthTarget instead. */
  formatLabel: string;
  /** Unique Intro only — the 3 spoken callout lines (slot 0/1/2 = Script 1/2/3)
   *  authored in the Advanced Intro section. Each line is the actual script sent
   *  to HeyGen for its advanced-intro scene. Prefilled from the chat handoff;
   *  editable. Always ["", "", ""] for manually-created ads. */
  advanceScripts: string[];
  /** Optional spoken hook (ClickUp 86caz3tkg) filmed as clip #1, IN FRONT of
   *  every other part — including the advanced-intro clips. Off by default;
   *  hydrated on from the chat handoff when the script carried a hook. */
  hookEnabled: boolean;
  /** The hook's spoken line(s) — editable like every other script box. */
  hookText: string;
  /** The hook's OWN avatar (avatars.id). Deliberately NOT assumed to be the ad's
   *  body avatar; "" = not picked yet (blocks submit while the hook is on). */
  hookAvatarId: string;
  withProductText: string;       // used when mode = "with" or "combination" (= P2)
  withoutProductText: string;    // used when mode = "without" or "combination" (= P1)
  /** Classic UGC length sub-toggle. Defaults to "60s" so existing flows behave
   *  identically. "1-4min" surfaces optional M1 / M2 hands-free middle beats. */
  lengthTarget: LengthTarget;
  /** M1 hands-free middle beat — only used when mode = "combination" AND
   *  lengthTarget = "1-4min". Empty string = beat not authored (short band). */
  m1Text: string;
  /** M2 hands-free counter-objection / rationale beat — only used when mode =
   *  "combination" AND lengthTarget = "1-4min" AND M1 is also set (long band). */
  m2Text: string;
  /** Format-08 (Classic UGC 4-18 min) MODULE beats, in order — only used when
   *  mode = "combination" AND lengthTarget = "4-18min". Each entry is one
   *  hands-free MODULE clip (same scene as the HOOK); HOOK lives in
   *  withoutProductText and REVEAL in withProductText. Always [] otherwise. */
  moduleTexts: string[];
  allowedAvatarTypes: AvatarTypeId[]; // empty = "any" (all types eligible)
  avatarsCount: number;
  randomAvatars: boolean;
  manualAvatarIds: string[];
  /** Committed random picks (size matches avatarsCount once auto-init runs). */
  randomAvatarIds: string[];
  /** Per-avatar voice-speed override for THIS ad: avatarId → speed multiplier.
   *  Absent = use the avatar's saved voice_speed, then the renderer default. */
  avatarSpeeds: Record<string, number>;
  /** Per-avatar look override: avatarId → lookUid (see `lookUid`) chosen in the
   *  "See selected looks" modal. Keyed by per-look uid, not scene_group_id, since
   *  one scene_group_id can carry several looks. Avatars absent from this map keep
   *  the default behavior (a look is picked at random at submit). */
  selectedLooks: Record<string, string>;
  /** Unique Intro only — per-avatar Advance Script scene picks. Maps
   *  avatarId → an array of 3 scene_ids (slot 0/1/2 = Script 1/2/3; "" =
   *  unpicked). Each scene is a no-product (P1) scene; at submit these become
   *  the first three advanced-intro HeyGen clips before P1/P2. */
  advanceScenes: Record<string, string[]>;
  /** Unique Intro only — per-clip scenery/scene visuals plumbed from the
   *  Format-02 script via the chat handoff. Drives the Generate Scene pipeline
   *  payload. null when not a Unique Intro ad / no visuals available. */
  pipelineScenes: PipelineScenes | null;
  /** Unique Intro only — product image chosen as the pipeline reference
   *  (sent as productUrl to generate-pipeline-images). "" = none picked. */
  productImageUrl: string;
  /** Unique Intro only — per-avatar generated pipeline images. Maps avatarId →
   *  { p1..p5: Drive fileId }. Filled by Generate Scene; used as each clip's
   *  scene image at submit. */
  pipelineImages: Record<string, PipelineImageSet>;
  /** Unique Intro only — image model for the Generate Scene pipeline (P1–P5).
   *  gemini = current default flow, gpt = gpt-image-2. Optional so drafts
   *  saved before this field existed safely default to gemini. */
  imageModel?: "gemini" | "gpt";
  /** Unique Intro only — real holding-example photos (stored
   *  product_reference_images URLs and/or upload data-URIs, max 5) sent as
   *  gripExampleImages to generate-pipeline-images, where they become the P5
   *  grip reference sheet. GPT-only: the picker is hidden and the field is
   *  not sent on gemini runs. Optional so state serialised before this field
   *  existed stays valid (mirrors imageModel). */
  gripExampleImages?: string[];
  /** Per-ad targeting metadata. Liam asked these live at the AD level, not
   *  batch-wide — different ads in the same batch can target different
   *  personas / pains / sub-angles. */
  persona: string;     // "" = none picked → AI freedom
  subAngle: string;    // legacy "sub_angle" column = the "Angle"
  subAngleDetail: string; // new "sub_angle_detail" column = the "Sub-angle"
  mainPains: string[]; // multi-select
  /** Concept variation number — the "v1 / v2 / v3" suffix the existing tool
   *  stamps onto ClickUp tasks, Drive folders, brief docs, and Frame.io
   *  uploads. Defaults to 1; user can bump it when iterating on the same
   *  concept name with a different angle/avatar. Clamped 1–99 server-side. */
  variationNumber: number;
  /** Provenance — set to "chat" when the ad was hydrated from the chat
   *  side-panel handoff, "manual" otherwise. Carried to the server so the
   *  log can render the "Imported from chat" tag. */
  source: "chat" | "manual";
  /** V2 — static title bar overlay shown above the captions for the
   *  first N seconds. Enabled by default per Liam's spec. */
  staticBar: {
    enabled: boolean;
    text: string;
    bgColor: string;
    textColor: string;
    durationSec: number;
    captionPlacement: string;
    staticBarPlacement: string;
  };
  // ── Format-04 ("Animated Characters") — image-only per-character workspace ──
  /** True when this ad was built from a Format-04 animated-characters storyboard.
   *  Gates the entire per-character cast workspace branch in AdCard and short-
   *  circuits the avatar-driven validate()/submit() (no HeyGen/FAL pipeline runs).
   *  Always false for every other format. */
  isAnimatedChars?: boolean;
  /** Format-04 only — storyboard-level meta carried from parseAnimatedCharsScript,
   *  shown as a small summary on the card. */
  animatedMeta?: {
    chosenFramework?: string;
    mainPain?: string;
    totalSpokenWords?: string;
    estimatedSeconds?: string;
    characterCount?: string;
  };
  /** Format-04 only — the per-character cast. One workspace card per entry. The
   *  LAST entry is the brand (isBrand:true): it also gets a product-image picker
   *  and its character image is generated USING the picked product image. Each
   *  entry independently tracks its generated character image + scene image and
   *  their statuses; regenerating one piece must never wipe the others. */
  animatedChars?: Array<{
    characterId: number | null;
    role?: string;
    identifier?: string;
    characterConcept: string;
    visual: string;
    firstFramePrompt?: string;
    spokenLine: string;
    durationS?: string;
    voiceTone?: string;
    isBrand: boolean;
    /** Brand char only — the product image the user picked for this character. */
    brandImageUrl?: string;
    characterImageUrl?: string;
    sceneImageUrl?: string;
    characterStatus?: "idle" | "loading" | "done" | "error";
    sceneStatus?: "idle" | "loading" | "done" | "error";
  }>;
};

type SceneRef = {
  scene_id: string;
  heygen_scene_id: string | null;
  heygen_avatar_id: string | null;
  name: string;
  image_url: string | null;
  product_tags?: string[];
};

type LookGroup = {
  scene_group_id: string;
  p1: SceneRef;
  p2: SceneRef;
};

// Stable per-LOOK identity for selection/keys. A single scene_group_id can carry
// SEVERAL looks (one per P2 product-scene row), so scene_group_id is NOT unique
// per look — using it makes duplicate looks both highlight as "Selected" and
// impossible to tell apart. Each scene row has a unique scene_id, so key on the
// P2 scene (with-product looks) and fall back to P1 (without-product looks).
const lookUid = (g: LookGroup): string =>
  g.p2?.scene_id ?? g.p1?.scene_id ?? g.scene_group_id;

type AvatarOption = {
  id: string;
  name: string;
  type: AvatarTypeId | "any";
  image_url: string | null;
  voice_name: string | null;
  voice_id: string;
  /** Avatar's saved voice speed (null = renderer default). */
  voice_speed?: number | null;
  /** Look groups already filtered to the selected product by the API.
   *  One is picked at random per avatar at submit time. */
  looks: LookGroup[];
  look_count?: number;
};

type ProductInfo = {
  id: string;
  name: string;
  brand?: string;
  product_id?: string;
  productc_config_url?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function secondsForWords(words: number): number {
  // 170 wpm → 1 word ≈ 0.3529s.
  return Math.round((words / WPM) * 60);
}

function pickRandom<T>(arr: T[], n: number): T[] {
  if (n <= 0 || arr.length === 0) return [];
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

/** React-query key for the Advance Script scenes lookup. Order-independent so
 *  the page-level validate/submit can rebuild the exact key the AdCard used. */
const advanceScenesQueryKey = (avatarIds: string[]) =>
  ["ugc.adv-nonproduct-scenes", [...avatarIds].sort().join(",")] as const;

/** Fetch ALL no-product (is_product=false) scenes for the given avatars,
 *  product-independent (ignores product_tags / the selected product), grouped
 *  by avatar_id. Powers the Advance Script scenes picker for Unique Intro ads.
 *  Reads the Supabase `scenes` table directly — the same table CreateVideos /
 *  ManageScenes / useScenes read client-side. */
async function fetchNonProductScenes(avatarIds: string[]): Promise<Record<string, SceneRef[]>> {
  if (avatarIds.length === 0) return {};
  const { data, error } = await supabase
    .from("scenes")
    .select("id, name, image_url, heygen_scene_id, heygen_avatar_id, avatar_id, product_tags, is_product")
    .in("avatar_id", avatarIds)
    .eq("is_product", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const map: Record<string, SceneRef[]> = {};
  for (const r of (data as any[]) ?? []) {
    (map[r.avatar_id] ??= []).push({
      scene_id: r.id,
      heygen_scene_id: r.heygen_scene_id ?? null,
      heygen_avatar_id: r.heygen_avatar_id ?? null,
      name: r.name ?? "",
      image_url: r.image_url ?? null,
      product_tags: r.product_tags ?? undefined,
    });
  }
  return map;
}

function makeFreshAd(): AdState {
  return {
    uid: uid(),
    concept: "",
    mode: "combination",
    modeLocked: false,
    allowUnlimitedLength: false,
    isUniqueIntro: false,
    formatLabel: "",
    advanceScripts: ["", "", ""],
    // Hook OFF is the default, and because hydrateAd() merges only keys present
    // in these fresh defaults, an ad saved BEFORE the hook feature existed
    // reopens with the hook off + empty — no snapshot version bump needed.
    hookEnabled: false,
    hookText: "",
    hookAvatarId: "",
    withProductText: "",
    withoutProductText: "",
    lengthTarget: "60s",
    m1Text: "",
    m2Text: "",
    moduleTexts: [],
    allowedAvatarTypes: [],   // empty = any
    avatarsCount: 3,
    randomAvatars: true,
    manualAvatarIds: [],
    randomAvatarIds: [],
    avatarSpeeds: {},
    selectedLooks: {},
    advanceScenes: {},
    pipelineScenes: null,
    productImageUrl: "",
    pipelineImages: {},
    imageModel: "gemini",
    gripExampleImages: [],
    persona: "",
    subAngle: "",
    subAngleDetail: "",
    mainPains: [],
    variationNumber: 1,
    source: "manual",
    staticBar: {
      enabled: false,
      text: "",
      bgColor: "#E53935",
      textColor: "#FFFFFF",
      durationSec: 8,
      captionPlacement: "bottom:22",
      staticBarPlacement: "",
    },
    // Format-04 defaults — off for every manually-created / non-04 ad.
    isAnimatedChars: false,
    animatedMeta: undefined,
    animatedChars: undefined,
  };
}


// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function BatchCreatorPage() {
  const { user } = useAuth();
  // useAuth exposes the logged-in account via `user`; there is no top-level
  // `email` on the context, so derive it from user?.email everywhere.
  const email = user?.email ?? "";
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Back-to-chat referrer. ScriptChat navigates here with `?from=chat-<chatId>`
  // in the query string, so read it from searchParams (not the hash).
  const referrer = useMemo(() => {
    const from = searchParams.get("from");
    return from && from.startsWith("chat-") ? from.slice("chat-".length) : null;
  }, [searchParams]);

  // "Edit & Regenerate" lineage (86caug6v1): the generation_id this form was reopened FROM,
  // recorded on the new batch's snapshot so a regenerated ad can be traced to its original.
  // Stays null for an ordinary batch; the restore path sets it. Held in a ref rather than
  // state because nothing renders from it and it must not trigger a re-render mid-submit.
  const restoredFromGenerationId = useRef<string | null>(null);

  // Server-driven option lists
  const productsQ = useQuery<ProductInfo[]>({
    queryKey: [`${API_BASE}/api/ugc/products`],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/ugc/products");
      const body = await r.json();
      return Array.isArray(body) ? body : (body.products ?? []);
    },
  });
  const products = productsQ.data ?? [];

  const csOwnersQ = useQuery<CsOwner[]>({
    queryKey: [`${API_BASE}/api/options/cs-owners`],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/options/cs-owners");
      return r.json();
    },
  });
  const csOwners = csOwnersQ.data ?? [];

  // ── Batch-wide settings ───────────────────────────────────────────────
  const [product, setProduct] = useState<string>("");
  /** When true the product picker is read-only — the batch was launched from
   *  a chat that already has a product attached. Set by the hydrate effect. */
  const [productLocked, setProductLocked] = useState<boolean>(false);
  const [funnel, setFunnel] = useState<"Onbrand" | "Comparison" | "TSL">("Onbrand");
  // Liam's brief: under-60s defaults to "Both" platforms. We'll honor the
  // chat-level length scope later (above-60s locks to Meta) once it's wired.
  const [intendedPlatform, setIntendedPlatform] = useState<"Meta" | "Applovin" | "Both">("Both");
  const [cs, setCs] = useState<string>("");

  // Auto-pick CS once roster + email load. Match the logged-in user by email;
  // if they're not in the roster, default to their email so the field still
  // represents them. Agentic/first owner only when we have no email at all.
  useEffect(() => {
    if (cs) return;
    if (!csOwners.length) return;
    const me = user?.email || "";
    const mine = csOwners.find((c) => c.email.toLowerCase() === me.toLowerCase());
    if (mine) { setCs(mine.label); return; }
    if (me) { setCs(me); return; }
    const agentic = csOwners.find((c) => /^agentic$/i.test(c.label));
    setCs(agentic?.label || csOwners[0].label);
  }, [csOwners, cs, user]);

  // ── Per-product option lists (persona, sub-angle, pains) ──────────────
  // These power the per-ad pickers inside each AdCard. The product slug is
  // batch-wide, so we fetch the catalogues once and pass them down.
  const personasQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/personas`, product],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/options/personas?product=${encodeURIComponent(product)}`);
      return r.json();
    },
    enabled: !!product,
  });
  const subAnglesQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/sub-angles`, product],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/options/sub-angles?product=${encodeURIComponent(product)}`);
      return r.json();
    },
    enabled: !!product,
  });
  // New "Sub-angle" (sub_angle_detail) values — same CS KPIs source as the Angle.
  const subAngleDetailsQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/sub-angle-details`, product],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/options/sub-angle-details?product=${encodeURIComponent(product)}`);
      return r.json();
    },
    enabled: !!product,
  });
  const painsQ = useQuery<string[]>({
    queryKey: [`${API_BASE}/api/options/pains`, product],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/options/pains?product=${encodeURIComponent(product)}`);
      return r.json();
    },
    enabled: !!product,
  });

  // ── Avatars — product + mode aware. Each ad has its own mode (no product,
  // with product, combination), so the avatars list is fetched per-ad inside
  // each AdCard. We expose helpers here for page-level reads (validate +
  // submit) that pull from React Query's cache via queryClient.getQueryData.
  // product_tags on scenes stores product NAMES (e.g. ["Oregano"]).
  const productName = useMemo(
    () => (productsQ.data ?? []).find((p) => p.id === product)?.name ?? "",
    [productsQ.data, product],
  );
  /** Stable key used by both the per-ad useQuery in AdCard and the
   *  queryClient.getQueryData lookup in submit / validate. */
  const avatarsQueryKey = (modeArg: Mode) =>
    [`${API_BASE}/api/new-avatars`, productName, modeArg] as const;

  // ── Per-field options Manage dialog ───────────────────────────────────
  // Mirrors the Ads DB "Manage Options" UX. We read the raw cross-product
  // {label, product[]} options shape from the shared `custom_fields` cache,
  // then PUT mutations back to Pipeline-Node's /custom-fields/update endpoint
  // — exact parity with handleAddFieldOption in AdsDb.tsx.
  const queryClient = useQueryClient();
  const adsDbFieldsQ = useAdsDbFields();
  const allFields = adsDbFieldsQ.data ?? [];
  const fieldsLoading = adsDbFieldsQ.isLoading;
  const currentProductName = products.find((p) => p.id === product)?.name || "";

  const fieldForKey = (key: TargetingFieldKey): AdsField | undefined =>
    allFields.find((f) => f.id === CUSTOM_FIELD_IDS[key]);

  // queryKey + URL-segment mapping for per-product options cache invalidation
  const optionsQueryKey: Record<TargetingFieldKey, [string, string]> = {
    persona:   [`${API_BASE}/api/options/personas`,   product],
    sub_angle: [`${API_BASE}/api/options/sub-angles`, product],
    pains:     [`${API_BASE}/api/options/pains`,      product],
  };

  const [manageDialog, setManageDialog] = useState<
    { open: boolean; fieldKey: TargetingFieldKey; adUid: string } | null
  >(null);

  const onOpenManage = useCallback((fieldKey: TargetingFieldKey, adUid: string) => {
    setManageDialog({ open: true, fieldKey, adUid });
  }, []);

  const customFieldsUpdate = useCallback(
    async (fieldId: string, options: unknown[]): Promise<boolean> => {
      const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL as string | undefined;
      if (!baseUrl) {
        toast({ title: "Config missing", description: "VITE_PIPELINE_API_BASE_URL is not set.", variant: "destructive" });
        return false;
      }
      try {
        const res = await fetch(`${baseUrl}/custom-fields/update`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: fieldId, options }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      } catch (err) {
        console.error("[BatchCreator] custom_fields update failed:", err);
        toast({ title: "Save failed", description: (err as Error).message || "Unknown error", variant: "destructive" });
        return false;
      }
    },
    [toast],
  );

  const handleAddFieldOption = useCallback(async (fieldKey: TargetingFieldKey, label: string) => {
    const field = fieldForKey(fieldKey);
    if (!field) return;
    const trimmed = label.trim();
    if (!trimmed) return;

    let updatedOptions: unknown[];
    if (field.is_option_product_level && currentProductName) {
      const current = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      const existing = current.find((o) => o.label === trimmed);
      if (existing) {
        updatedOptions = current.map((o) =>
          o.label === trimmed
            ? { ...o, product: Array.from(new Set([...o.product, currentProductName])) }
            : o,
        );
      } else {
        updatedOptions = [...current, { label: trimmed, product: [currentProductName] }];
      }
    } else {
      const current = (field.options as string[]) ?? [];
      if (current.includes(trimmed)) return;
      updatedOptions = [...current, trimmed];
    }

    // Optimistically extend the product-filtered options cache so the
    // dropdown shows the new value immediately, before the refetch lands.
    queryClient.setQueryData<string[]>(optionsQueryKey[fieldKey], (old) => {
      const arr = Array.isArray(old) ? old : [];
      if (arr.includes(trimmed)) return arr;
      return [...arr, trimmed].sort();
    });

    const ok = await customFieldsUpdate(field.id, updatedOptions);
    if (!ok) {
      // Roll back the optimistic update on failure.
      queryClient.invalidateQueries({ queryKey: optionsQueryKey[fieldKey] });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["ads-db-fields"] });
    queryClient.invalidateQueries({ queryKey: optionsQueryKey[fieldKey] });

    // Auto-select the freshly-added value on the ad that opened the dialog.
    const adUid = manageDialog?.adUid;
    if (adUid) {
      if (fieldKey === "pains") {
        setAds((prev) =>
          prev.map((a) =>
            a.uid === adUid
              ? { ...a, mainPains: a.mainPains.includes(trimmed) ? a.mainPains : [...a.mainPains, trimmed] }
              : a,
          ),
        );
      } else {
        const patchKey = fieldKey === "persona" ? "persona" : "subAngle";
        setAds((prev) => prev.map((a) => (a.uid === adUid ? { ...a, [patchKey]: trimmed } : a)));
      }
    }
  }, [allFields, currentProductName, customFieldsUpdate, queryClient, manageDialog]);

  const handleRenameFieldOption = useCallback(async (fieldKey: TargetingFieldKey, oldLabel: string, newLabel: string) => {
    const field = fieldForKey(fieldKey);
    if (!field) return;
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return;

    let updatedOptions: unknown[];
    if (field.is_option_product_level) {
      const current = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      updatedOptions = current.map((o) => (o.label === oldLabel ? { ...o, label: trimmed } : o));
    } else {
      const current = (field.options as string[]) ?? [];
      updatedOptions = current.map((o) => (o === oldLabel ? trimmed : o));
    }

    const ok = await customFieldsUpdate(field.id, updatedOptions);
    if (!ok) return;
    queryClient.invalidateQueries({ queryKey: ["ads-db-fields"] });
    queryClient.invalidateQueries({ queryKey: optionsQueryKey[fieldKey] });

    // If any ad in this batch was carrying the old label, migrate it.
    setAds((prev) => prev.map((a) => {
      if (fieldKey === "pains") {
        return { ...a, mainPains: a.mainPains.map((p) => (p === oldLabel ? trimmed : p)) };
      }
      const patchKey = fieldKey === "persona" ? "persona" : "subAngle";
      return a[patchKey] === oldLabel ? { ...a, [patchKey]: trimmed } : a;
    }));
  }, [allFields, customFieldsUpdate, queryClient]);

  const handleRemoveFieldOption = useCallback(async (fieldKey: TargetingFieldKey, label: string) => {
    const field = fieldForKey(fieldKey);
    if (!field) return;

    let updatedOptions: unknown[];
    if (field.is_option_product_level && currentProductName) {
      const current = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      updatedOptions = current
        .map((o) =>
          o.label === label
            ? { ...o, product: o.product.filter((p) => p !== currentProductName) }
            : o,
        )
        .filter((o) => o.product.length > 0);
    } else {
      const current = (field.options as string[]) ?? [];
      updatedOptions = current.filter((o) => o !== label);
    }

    const ok = await customFieldsUpdate(field.id, updatedOptions);
    if (!ok) return;
    queryClient.invalidateQueries({ queryKey: ["ads-db-fields"] });
    queryClient.invalidateQueries({ queryKey: optionsQueryKey[fieldKey] });
  }, [allFields, currentProductName, customFieldsUpdate, queryClient]);

  // Derive ManageOptionsDialog props from the currently-open field, scoped
  // to the active product (only labels with the product in their product[]).
  const manageDialogInitial = useMemo(() => {
    if (!manageDialog) return [] as Array<{ label: string; value: string }>;
    const field = fieldForKey(manageDialog.fieldKey);
    if (!field) return [];
    if (field.is_option_product_level && currentProductName) {
      const rows = (field.options as Array<{ label: string; product: string[] }>) ?? [];
      return rows
        .filter((o) => o.product.includes(currentProductName))
        .map((o) => ({ label: o.label, value: o.label }));
    }
    const flat = (field.options as string[]) ?? [];
    return flat.map((s) => ({ label: s, value: s }));
  }, [manageDialog, allFields, currentProductName]);

  // ── Ads list ──────────────────────────────────────────────────────────
  const [ads, setAds] = useState<AdState[]>([makeFreshAd()]);

  // ── "Edit & Regenerate" restore state (86caug6v1) ──────────────────────
  // True only while a restored snapshot is being applied. The page-level effects below
  // check it and skip, so they cannot wipe or override values we just restored. Released
  // on the next tick (see the effect after the long-form one) so the user's OWN subsequent
  // edits get the normal behaviour back.
  const restoringRef = useRef(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  // Set by a restore, consumed by each AdCard once its avatar pool loads, so references to
  // avatars deleted since the snapshot get dropped up-front instead of blowing up at submit.
  const [staleCheckPending, setStaleCheckPending] = useState(false);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const handleStaleRefsPruned = useCallback((dropped: string[]) => {
    const n = dropped.length;
    setStaleWarning(
      `${n} avatar${n === 1 ? "" : "s"} from these settings no longer exist${n === 1 ? "s" : ""} and ${n === 1 ? "was" : "were"} removed (${dropped.map((d) => d.slice(0, 8)).join(", ")}). Re-pick before generating.`,
    );
  }, []);
  // Tracks the last product we reacted to. Declared HERE, beside the restore, rather than
  // beside its own effect below — the restore branch has to prime it before calling
  // setProduct, otherwise the product-change effect fires and wipes every restored avatar
  // pick, look and speed.
  const prevProductRef = useRef(product);

  // Hydrate from sessionStorage when arriving from chat. Cleared after read
  // so a refresh doesn't repopulate stale scripts.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (typeof window === "undefined") return;

    // ── "Edit & Regenerate" restore (86caug6v1) ─────────────────────────────
    // Deliberately checked BEFORE the chat branch below, and short-circuits it.
    //
    // A snapshot must be assigned VERBATIM. The chat branch DERIVES state by sniffing
    // content — mode from which script bodies are present, length target from banners —
    // which is right for a chat handoff but wrong here: it would re-derive values that
    // contradict what the user actually had, producing a form that looks restored but
    // behaves differently on re-submit.
    const restoreRaw = window.sessionStorage.getItem(RESTORE_SESSION_KEY);
    if (restoreRaw) {
      // Claim the hydrate slot and clear the key immediately, so a refresh doesn't
      // silently re-restore over edits the user has since made.
      hydratedRef.current = true;
      window.sessionStorage.removeItem(RESTORE_SESSION_KEY);
      try {
        const result = hydrateRestorePayload(JSON.parse(restoreRaw), makeFreshAd);
        if (!result.ok) {
          toast({
            title: "Couldn't reopen those settings",
            description: `${result.reason}. Starting from a blank form instead.`,
            variant: "destructive",
          });
          return;
        }
        const { page, ads: restoredAds, sourceGenerationId, gripExamplesTruncated } = result.value;

        // Suppress the page-level effects that would otherwise clobber the restore.
        restoringRef.current = true;
        // Prime the product ref BEFORE setting product so the product-change effect sees
        // no transition and does not wipe every restored avatar pick, look and speed.
        prevProductRef.current = page.product;

        setProduct(page.product);
        // Explicitly UNLOCKED: the whole point of Edit & Regenerate is that the user can
        // change anything, product included. (The chat branch locks it; we must not.)
        setProductLocked(false);
        if (page.funnel) setFunnel(page.funnel as typeof funnel);
        if (page.intended_platform) setIntendedPlatform(page.intended_platform as typeof intendedPlatform);
        if (page.cs) setCs(page.cs);
        setAds(restoredAds as unknown as AdState[]);

        // Lineage for the batch this form will produce.
        restoredFromGenerationId.current = sourceGenerationId;
        // Ask each card to validate its avatar references once its pool resolves.
        setStaleCheckPending(true);
        setRestoreNotice(
          gripExamplesTruncated
            ? "Settings reopened. Uploaded grip example images weren't saved — re-attach them if you need them. A NEW batch will be created; your original videos are untouched."
            : "Settings reopened. A NEW batch will be created; your original videos are untouched.",
        );
      } catch {
        toast({
          title: "Couldn't reopen those settings",
          description: "The saved settings were unreadable. Starting from a blank form instead.",
          variant: "destructive",
        });
      }
      return;
    }

    const raw = window.sessionStorage.getItem("ugc.create.payload");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      hydratedRef.current = true;
      window.sessionStorage.removeItem("ugc.create.payload");
      if (parsed?.product) {
        setProduct(parsed.product);
        // Product is locked when launched from a chat — the chat has a
        // product attached and the user can't change it mid-flow.
        setProductLocked(true);
      }
      // Session-wide script format from the chat (e.g.
      // "05-classic-ugc-1-to-4min"). Used as a fallback length signal so a
      // batch authored in a 1-4 min chat stays 1-4 min even on scripts whose
      // individual bodies didn't carry a per-script M1/M2 / banner signal.
      const sessionFormat = String(parsed?.format || "");
      // Human-readable label for that format ("Unique Intro · A1 Label/Cause",
      // etc.) as shown on the generate-script page's format picker. Carried so
      // the Mode badge can mirror the exact script type. Per-script `formatLabel`
      // wins when present; otherwise we fall back to the batch-wide label.
      const sessionFormatLabel = String(parsed?.formatLabel || "");
      const is14minFormat = /1-to-4|1-4\s*min/i.test(sessionFormat);
      // Format-08 (Classic UGC 4-18 min). Slug-only — the session format is
      // the SOLE signal for this length target (never content-sniffed), so
      // single- and multi-script selections behave identically.
      const is418Format = /4-to-18/i.test(sessionFormat);
      // Formats 06/07 ("No-Product · With CTA" / "No-Product · Pure Talk") —
      // SLUG-ONLY. The product is never shown, so the ad renders as ONE
      // hands-free "without-product" take. Force mode="without" and clear any
      // P2/with-product text so the single-take render is deterministic (never
      // content-sniffed into "with"/"combination").
      const isNoProductFormat = /^0[67]-/.test(sessionFormat);

      // ── Format-04 ("Animated Characters") — SLUG-ONLY + UNCONDITIONAL ────
      // Mirrors the Format-08 slug-only approach: route purely on the session
      // format slug, NEVER on content. A single-character storyboard and a
      // multi-character storyboard therefore hydrate identically (the prior
      // single-vs-multi content-sniff bug avoided here too). 04 carries a parsed
      // `animated` storyboard instead of classic `scripts`, so it builds ONE
      // image-only ad and returns BEFORE the classic-scripts derivation below.
      const is04Format = sessionFormat === "04-animated-characters-ads";
      if (is04Format && parsed?.animated) {
        const anim = parsed.animated as {
          meta?: AdState["animatedMeta"];
          characters?: Array<{
            characterId?: number | null;
            role?: string;
            identifier?: string;
            characterConcept?: string;
            visual?: string;
            firstFramePrompt?: string;
            spokenLine?: string;
            durationS?: string;
            voiceTone?: string;
          }>;
        };
        const chars = Array.isArray(anim.characters) ? anim.characters : [];
        const lastIdx = chars.length - 1;
        const ad = makeFreshAd();
        ad.isAnimatedChars = true;
        ad.mode = "animated";
        ad.modeLocked = true;
        ad.source = "chat";
        ad.formatLabel = sessionFormatLabel || "Animated Characters - Ads";
        ad.animatedMeta = anim.meta ?? {};
        ad.animatedChars = chars.map((c, i) => ({
          characterId: c.characterId ?? null,
          role: c.role,
          identifier: c.identifier,
          characterConcept: String(c.characterConcept ?? ""),
          visual: String(c.visual ?? ""),
          firstFramePrompt: String(c.firstFramePrompt ?? ""),
          spokenLine: String(c.spokenLine ?? ""),
          durationS: c.durationS,
          voiceTone: c.voiceTone,
          // The LAST character is the brand: it gets the product-image picker
          // and is generated USING the picked product image.
          isBrand: i === lastIdx,
          brandImageUrl: "",
          characterImageUrl: "",
          sceneImageUrl: "",
          characterStatus: "idle" as const,
          sceneStatus: "idle" as const,
        }));
        setAds([ad]);
        return; // 04 is fully resolved — do NOT fall through to the classic path.
      }

      if (Array.isArray(parsed?.scripts) && parsed.scripts.length) {
        const hydrated: AdState[] = parsed.scripts.map((s: any, idx: number) => {
          const fresh = makeFreshAd();
          // Sequential variation numbers when a batch lands with multiple
          // scripts — mirrors the existing tool's _v1 / _v2 / _v3 naming.
          fresh.variationNumber = idx + 1;
          // Use the chat-side title as a fallback for concept when no concept
          // was authored — concept is now the single identity field.
          fresh.concept = String(s?.concept || s?.title || "").slice(0, 200);
          // Unique Intro (Format 02) ads carry an `isUniqueIntro` flag from the
          // chat side-panel build. When set, surface the 3 advanced-intro script
          // fields prefilled with the spoken callout lines from the Advanced
          // Intro section (padded to exactly 3 slots).
          fresh.isUniqueIntro = !!s?.isUniqueIntro;
          fresh.formatLabel = String(s?.formatLabel || sessionFormatLabel || "");
          fresh.advanceScripts = [0, 1, 2].map((i) => String(s?.advanceScripts?.[i] ?? ""));
          // Per-clip scenery/scene visuals for the Generate Scene pipeline,
          // plumbed from the Format-02 script (buildFormat2Picked). Kept null
          // when absent so the Generate Scene button can guard on it.
          fresh.pipelineScenes = s?.pipelineScenes
            ? {
                p1: { scenery: String(s.pipelineScenes.p1?.scenery ?? ""), scene: String(s.pipelineScenes.p1?.scene ?? "") },
                p2: { scenery: String(s.pipelineScenes.p2?.scenery ?? ""), scene: String(s.pipelineScenes.p2?.scene ?? "") },
                p3: { scenery: String(s.pipelineScenes.p3?.scenery ?? ""), scene: String(s.pipelineScenes.p3?.scene ?? "") },
                p4: { scenery: String(s.pipelineScenes.p4?.scenery ?? "") },
                p5: { scenery: String(s.pipelineScenes.p5?.scenery ?? "") },
              }
            : null;
          // Strip the model's internal-notes HTML comments (`<!-- persona:
          // option - 1 -->`, etc) before they land in the textareas. These
          // are authoring metadata for the chat writer, not lines for the
          // avatar to narrate — letting them flow through made HeyGen voice
          // them verbatim. Same regex the server uses, so the count we show
          // here matches what gets sent to /api/ugc-builds.
          const stripNotes = (raw: string): string =>
            raw.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
          fresh.withoutProductText = stripNotes(String(s?.p1 || ""));
          fresh.withProductText = stripNotes(String(s?.p2 || ""));
          // Optional spoken hook (ClickUp 86caz3tkg). parseScripts already split
          // it OFF the body, so it can never also be inside p1/p2/plain (and so
          // the 06/07 `plain` fallback further down cannot re-introduce it).
          // Absent / empty => both fields stay at their fresh OFF defaults, i.e.
          // a hook-off script hydrates exactly as it does today. Format-08 is out
          // of scope — its structural HOOK stays in withoutProductText.
          if (!is418Format) {
            const hookFromChat = stripNotes(String(s?.hook || ""));
            if (hookFromChat) {
              fresh.hookEnabled = true;
              fresh.hookText = hookFromChat;
            }
          }
          // Format-05 (Classic UGC 1-4 min) middle beats. The bench emits them
          // either as dedicated `s.m1` / `s.m2` fields (preferred) OR as `**M1**`
          // / `**M2**` blocks inside `s.plain`. Try the typed fields first; fall
          // back to in-body marker parsing so this works whichever shape the
          // chat side ships.
          fresh.m1Text = stripNotes(String(s?.m1 || ""));
          fresh.m2Text = stripNotes(String(s?.m2 || ""));
          if (!fresh.m1Text && !fresh.m2Text && s?.plain) {
            const plain = String(s.plain);
            // Split by bold-marker headings. `**P1**` / `**M1**` / `**M2**` / `**P2**`.
            const sections: Record<string, string> = {};
            const re = /\*\*(P1|M1|M2|P2)\*\*\s*([\s\S]*?)(?=\*\*(?:P1|M1|M2|P2)\*\*|$)/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(plain)) !== null) {
              sections[m[1]] = stripNotes(m[2]);
            }
            if (sections.M1) fresh.m1Text = sections.M1;
            if (sections.M2) fresh.m2Text = sections.M2;
            // If P1/P2 came from markers AND the typed fields were empty,
            // honour the markers too (handles bench scripts that ship the
            // full body in `plain` with no separate p1/p2 fields).
            if (!fresh.withoutProductText && sections.P1) fresh.withoutProductText = sections.P1;
            if (!fresh.withProductText && sections.P2) fresh.withProductText = sections.P2;
          }
          // The bench's banner line `🎬 Random duration: m:ss (Ns) — ~low-high spoken words`
          // is the canonical 1-4 min signal. If it's in the body OR M1/M2 are
          // populated, treat as 1-4 min. Otherwise default to 60 s.
          const has14minSignal =
            !!(fresh.m1Text || fresh.m2Text) ||
            /🎬\s*Random duration/i.test(String(s?.plain || "")) ||
            // Session-wide fallback: the chat itself was a 1-4 min format. A
            // 1-4 min script can legitimately roll a short duration with no
            // M1/M2 beats and no banner left in the stripped body, which would
            // otherwise mis-classify it (and every script past the first) as
            // 60 s. The chat format is the authoritative session intent.
            is14minFormat;
          fresh.lengthTarget = has14minSignal ? "1-4min" : "60s";
          // Format-08 (Classic UGC 4-18 min): HOOK → withoutProductText,
          // MODULEs → moduleTexts, REVEAL → withProductText. Prefer the typed
          // `segments` from the chat payload; fall back to re-parsing the
          // marker lines out of s.plain (mirror of the P1-family fallback
          // above). NOTE the fallback regex is LINE-anchored, CASE-SENSITIVE
          // (markers are always uppercase; spoken prose like "Module 3 is
          // where most people quit." must never be excised) and matches ONLY
          // genuine heading lines: either bold-wrapped with the closing `**`
          // AFTER any same-line suffix ("**MODULE 3 — Question three: …**" —
          // a bare `\*\*MODULE \d+\*\*` would miss it; the separator class
          // includes `.` because the server's stripEmDashes stores it as
          // "**MODULE 3. Question three: …**"), or an already-de-bolded BARE
          // token-only line with at most a trailing period (scriptToPlain
          // strips `**`) — never `token + free text` without the closing `**`.
          if (is418Format) {
            let hook = "";
            let reveal = "";
            const modules: string[] = [];
            const segs = Array.isArray(s?.segments) ? s.segments : [];
            if (segs.length > 0) {
              for (const seg of segs) {
                const text = stripNotes(String(seg?.text ?? ""));
                if (!text) continue;
                if (seg?.key === "hook") hook = text;
                else if (seg?.key === "reveal") reveal = text;
                else if (seg?.key === "module") modules.push(text);
              }
            } else if (s?.plain) {
              const plain = String(s.plain);
              const markerRx =
                /^[ \t]*(?:\*\*\s*(HOOK|REVEAL|MODULE\s+\d+)\b[^\n]*?\*\*|(HOOK|REVEAL|MODULE\s+\d+)\.?)[ \t]*\r?$/gm;
              const hits: Array<{ token: string; end: number; idx: number }> = [];
              let hm: RegExpExecArray | null;
              while ((hm = markerRx.exec(plain)) !== null) {
                const token = (hm[1] || hm[2] || "").replace(/\s+/g, " ");
                hits.push({ token, idx: hm.index, end: hm.index + hm[0].length });
              }
              for (let h = 0; h < hits.length; h++) {
                const sliceEnd = h + 1 < hits.length ? hits[h + 1].idx : plain.length;
                const text = stripNotes(plain.slice(hits[h].end, sliceEnd));
                if (!text) continue;
                if (hits[h].token === "HOOK") hook = text;
                else if (hits[h].token === "REVEAL") reveal = text;
                else modules.push(text);
              }
            }
            if (hook) fresh.withoutProductText = hook;
            if (reveal) fresh.withProductText = reveal;
            fresh.moduleTexts = modules;
            // Slug-only length target — overrides whatever the 60s/1-4min
            // signals above concluded (the 🎬 banner text is shared with
            // format-05, so it must NOT decide this).
            fresh.lengthTarget = "4-18min";
            // 4-18 min is by definition over 60s.
            fresh.allowUnlimitedLength = true;
            // M1/M2 are format-05 beats — never valid alongside MODULEs.
            fresh.m1Text = "";
            fresh.m2Text = "";
          }
          // Determine mode from what's actually in the body. Ads from chat
          // can't change their mode — the script was authored as a P1+P2
          // combination, or as a single-block one-take. Locking prevents the
          // user from accidentally chopping content off.
          if (isNoProductFormat) {
            // No-Product (06/07): single hands-free take, product never shown.
            // Force "without" and guarantee no P2/with-product text leaks in so
            // the render is a single without-product clip regardless of content.
            fresh.withoutProductText =
              fresh.withoutProductText || stripNotes(String(s?.plain || ""));
            fresh.withProductText = "";
            fresh.mode = "without";
          } else if (fresh.withProductText && fresh.withoutProductText) {
            fresh.mode = "combination";
          } else if (fresh.withProductText) {
            fresh.mode = "with";
          } else if (fresh.withoutProductText) {
            fresh.mode = "without";
          } else if (s?.plain) {
            const plain = stripNotes(String(s.plain));
            fresh.withoutProductText = plain;
            fresh.mode = "without";
          }
          fresh.modeLocked = true;
          // 1-4 min ads are by definition over 60s. Auto-enable the unlimited
          // length flag so the LengthMeter doesn't fire its 60s cap warning,
          // and surface the toggle/banner as "1-4 min" up front.
          if (fresh.lengthTarget === "1-4min") {
            fresh.allowUnlimitedLength = true;
          }
          // Per-ad persona / sub-angle suggestions from chat parseScriptDoc
          // (the model emits these as hidden HTML-comment markers).
          //
          // SKIP placeholder values. The model's `<script_skeleton>` template
          // emits literal strings like "option - 1", "option-2", "none", "any",
          // "tbd" when the writer didn't actually pick a specific persona —
          // those are template-fill artifacts, not real personas. If we let
          // them through they pin the ad to a meaningless value and the user
          // can't tell why "AI picks" isn't on. Keep blank so the dropdown
          // shows "None" and the runtime is free to choose.
          const isPlaceholderValue = (v: unknown): boolean => {
            if (typeof v !== "string") return true;
            const t = v.trim().toLowerCase();
            if (!t) return true;
            if (["none", "any", "n/a", "na", "tbd", "—", "-", "null"].includes(t)) return true;
            // Matches "option - 1", "option-2", "option 3", "option1", etc.
            if (/^option[\s_-]*\d+$/.test(t)) return true;
            return false;
          };
          if (typeof s?.suggestedPersona === "string" && !isPlaceholderValue(s.suggestedPersona)) {
            fresh.persona = s.suggestedPersona;
          }
          if (typeof s?.suggestedSubAngle === "string" && !isPlaceholderValue(s.suggestedSubAngle)) {
            fresh.subAngle = s.suggestedSubAngle;
          }
          // Tag with provenance so the log can render the "Imported from
          // chat" badge.
          fresh.source = "chat";
          return fresh;
        });
        setAds(hydrated);
        // If ANY chat-handed ad is 1-4 min OR 4-18 min, lock the batch to
        // Meta — Applovin hard-caps at 60s and would block submission.
        // Operator can override (we don't disable the platform picker) but
        // the default is the right one for these formats.
        if (hydrated.some((a) => a.lengthTarget === "1-4min" || a.lengthTarget === "4-18min")) {
          setIntendedPlatform("Meta");
        }
      }
    } catch { /* corrupt sessionStorage entry — ignore */ }
  }, []);

  const addAd = () => setAds((prev) => [...prev, makeFreshAd()]);
  const removeAd = (uid: string) => setAds((prev) => prev.length > 1 ? prev.filter((a) => a.uid !== uid) : prev);
  // `patch` may be a plain object OR a function of the current ad. The function
  // form is required when the patch derives from existing ad state (e.g. merging
  // into pipelineImages) so concurrent updates read the freshest state instead of
  // a stale closure and don't clobber each other.
  const updateAd = (uid: string, patch: Partial<AdState> | ((ad: AdState) => Partial<AdState>)) =>
    setAds((prev) => prev.map((a) => (a.uid === uid ? { ...a, ...(typeof patch === "function" ? patch(a) : patch) } : a)));

  // When the product changes, drop every ad's committed avatar picks. The
  // new avatars list is product-scoped, so prior selections are likely to be
  // stale (or absent entirely from the new pool). The randomAvatarIds
  // auto-fill effect inside AdCard will re-seed once allAvatars resolves.
  useEffect(() => {
    if (prevProductRef.current === product) return;
    // Bail BEFORE touching prevProductRef. The restore primes that ref to the product it is
    // about to set, but on the mount commit `product` is still "" — so assigning the ref
    // here first would overwrite the priming, and the NEXT commit would see a genuine ""
    // -> "celmor-body-oil" transition and wipe every restored avatar pick, look and speed.
    // Returning early leaves the primed value in place, so the next commit matches and this
    // effect correctly does nothing. A later product change by the user still wipes normally.
    if (restoringRef.current) return;
    prevProductRef.current = product;
    setAds((prev) => prev.map((a) => ({
      ...a,
      manualAvatarIds: [],
      randomAvatarIds: [],
      avatarSpeeds: {},
      selectedLooks: {},
      gripExampleImages: [],
      avatarsCount: 3,
    })));
  }, [product]);

  // Applovin policy: above-60s videos can't ship to Applovin's spec sheet,
  // so when the batch's intended platform includes Applovin we enforce the
  // 60s cap on every ad regardless of the per-ad "allow unlimited" toggle.
  // Meta-only batches can opt-into long-form.
  const applovinSelected = intendedPlatform === "Applovin" || intendedPlatform === "Both";

  // Defensive auto-unlock: catch every shape of long-form ad and prevent
  // the 60s cap from firing on submit. Two layered triggers:
  //   1. lengthTarget === "1-4min" (chat hand-off or manual toggle)
  //   2. measured spoken duration > 60s (bench scripts without the 🎬 banner,
  //      direct paste, anything the structured detection misses)
  // When either fires we (a) auto-set allowUnlimitedLength=true on the ad so
  // the per-ad cap doesn't reject the script and (b) flip intendedPlatform
  // to Meta so the Applovin cap doesn't reject the batch.
  //
  // WORD BASIS (ClickUp 86caz3tkg): this effect, validate()'s 60s gate (:~1371),
  // the batch over-cap counter (`totals`) and the per-card length badge all measure
  // the SAME thing — spokenWordsForAd(), i.e. body + the optional hook. They used to
  // disagree (this effect body-only, validate() body+hook), which refused a hooked ad
  // whose body alone was under 60s at submit — the exact case the brief says must be
  // allowed to run long, and which the merge side already exempts
  // (routes.js `maxDurationSec = (isClassicUnder60 && !groupHasHook) ? 60 : null`).
  // spokenWordsForAd() returns exactly countWords(scriptForAd(a)) when the hook is
  // off (see :~2317), so every hook-OFF ad behaves byte-identically to before.
  // The intendedPlatform -> "Meta" consequence below is NOT new for hooked ads: it is
  // what every >60s ad already gets from this same effect today.
  // allowUnlimitedLength is front-end/snapshot state only — it is in no request payload
  // (grep: BatchCreator.tsx + ugcSettingsSnapshot.test.ts only), so auto-flipping it
  // changes nothing that reaches the backend.
  useEffect(() => {
    // Skip while restoring. This effect force-sets intendedPlatform to "Meta" for any
    // long-form ad, which would silently overwrite the platform the user actually had.
    // (A long-form ad can only ever have been SUBMITTED as Meta — this same effect saw to
    // that — so the restored value is already correct and needs no re-deriving.) Once the
    // guard releases, the user's own edits get the normal enforcement back.
    if (restoringRef.current) return;
    let mutated = false;
    const next = ads.map((a) => {
      const longByDuration = secondsForWords(spokenWordsForAd(a)) > 60;
      if (longByDuration && !a.allowUnlimitedLength) {
        mutated = true;
        return { ...a, allowUnlimitedLength: true };
      }
      return a;
    });
    if (mutated) setAds(next);
    const anyLongForm = next.some(
      (a) =>
        a.lengthTarget === "1-4min" ||
        a.lengthTarget === "4-18min" ||
        secondsForWords(spokenWordsForAd(a)) > 60,
    );
    if (anyLongForm && intendedPlatform !== "Meta") {
      setIntendedPlatform("Meta");
    }
  }, [ads, intendedPlatform]);

  // Release the restore guards once the render that applied the restored state has
  // committed. Intentionally declared AFTER the effects it guards: within that same commit
  // React runs effects in declaration order, so those effects still observe the flag as set.
  // No dependency array — it re-checks each render and is a no-op unless a restore is live.
  useEffect(() => {
    if (!restoringRef.current) return;
    const t = setTimeout(() => { restoringRef.current = false; }, 0);
    return () => clearTimeout(t);
  });

  // ── Derived stats ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let ads_ = 0, videos = 0, over = 0;
    for (const ad of ads) {
      ads_++;
      // One final delivered video per avatar — in combination mode the two
      // HeyGen renders (P1 hands-free + P2 with product) get merged into a
      // single video, so we don't double-count.
      const avatarCount = ad.randomAvatars ? ad.avatarsCount : ad.manualAvatarIds.length;
      videos += Math.max(0, avatarCount);
      const w = spokenWordsForAd(ad);
      const s = secondsForWords(w);
      const effectivelyCapped = applovinSelected || !ad.allowUnlimitedLength;
      if (effectivelyCapped && s > 60) over++;
    }
    return { ads: ads_, videos, over };
  }, [ads, applovinSelected]);

  // Format-04 ("Animated Characters") is image-only: when ANY ad is a 04 ad we
  // hide the page-level "Generate videos" submit bar and short-circuit
  // validate()/submit() so the avatar-driven HeyGen/FAL pipeline never runs.
  // In-card character/scene generation is the ONLY generation for 04.
  const anyAnimated = useMemo(() => ads.some((a) => a.isAnimatedChars), [ads]);

  // ── Submit ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  // Synchronous double-submit guard. The footer button is disabled on `submitting`, but that
  // is React state and lands a render later — a fast double click can enter submit() twice
  // before the button greys out, billing a second full batch of HeyGen renders. A ref closes
  // that window because it is set in the same tick as the call.
  const submitInFlightRef = useRef(false);
  // Confirm step shown only when this form was reopened via Edit & Regenerate. Regenerating
  // used to be gated by the sheer friction of rebuilding the form by hand; this feature
  // removes that friction on purpose, so the spend needs an explicit, countable confirmation.
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  // Track which field-paths failed validation so we can paint a red ring
  // around the relevant input. Cleared every time we re-validate. Field
  // identifiers map to the BatchSettingsBar / per-ad card render below.
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  // When validation fails because a Unique Intro ad is missing Advance Script
  // scenes, this holds that ad's uid so its AdCard auto-opens the looks picker.
  const [autoOpenLooksUid, setAutoOpenLooksUid] = useState<string | null>(null);

  const validate = useCallback((): { msg: string; field?: string; openLooksUid?: string } | null => {
    if (!product) return { msg: "Pick a brand / product on the top bar.", field: "product" };
    if (!cs) return { msg: "Pick a CS on the top bar.", field: "cs" };
    for (let i = 0; i < ads.length; i++) {
      const a = ads[i];
      // Format-04 ("Animated Characters") is an image-only per-character
      // workspace — it has no script body, no avatars, and no HeyGen/FAL
      // pipeline. The avatar-driven checks below must NOT run for it (they'd
      // throw on the absent script/avatars). In-card generation is the only
      // generation path for 04, so there's nothing to validate here.
      if (a.isAnimatedChars) continue;
      const body = scriptForAd(a);
      if (body.trim().length < 20) {
        return { msg: `Ad #${i + 1}: script body is too short (need 20+ characters).`, field: `ad-${i}-script` };
      }
      if (a.mode === "combination" && (!a.withoutProductText.trim() || !a.withProductText.trim())) {
        return { msg: `Ad #${i + 1}: combination mode needs BOTH the P1 (without-product) and P2 (with-product) parts.`, field: `ad-${i}-combo` };
      }
      // Format-08 (4-18 min): HeyGen Avatar IV hard-caps each scene's script
      // at ~5000 chars. Block submit on any over-limit clip (HOOK, each
      // MODULE, REVEAL) — the per-card warning surfaces this earlier too.
      if (a.mode === "combination" && a.lengthTarget === "4-18min") {
        const clips = [
          { label: "HOOK", text: a.withoutProductText },
          ...a.moduleTexts.map((t, mi) => ({ label: `MODULE ${mi + 1}`, text: t })),
          { label: "REVEAL", text: a.withProductText },
        ];
        const over = clips.find((c) => c.text.length > 5000);
        if (over) {
          return { msg: `Ad #${i + 1}: ${over.label} is ${over.text.length} chars — HeyGen Avatar IV caps each scene at 5000. Trim it or split it into another MODULE.`, field: `ad-${i}-script` };
        }
      }
      // Optional hook (ClickUp 86caz3tkg) — only checked when it is switched on,
      // so a hook-off ad validates exactly as it does today. Its avatar is NOT
      // assumed to be the body avatar, so it has to be picked explicitly.
      if (a.hookEnabled) {
        if (!a.hookText.trim()) {
          return { msg: `Ad #${i + 1}: the hook is on but empty — write the hook or switch it off.`, field: `ad-${i}-script` };
        }
        if (a.hookText.length > 5000) {
          return { msg: `Ad #${i + 1}: the hook is ${a.hookText.length} chars — HeyGen Avatar IV caps each scene at 5000. Trim it.`, field: `ad-${i}-script` };
        }
        if (!a.hookAvatarId) {
          return { msg: `Ad #${i + 1}: pick the avatar who films the hook.`, field: `ad-${i}-avatars` };
        }
      }
      if (a.isUniqueIntro && [0, 1, 2].some((slot) => !(a.advanceScripts[slot] ?? "").trim())) {
        return { msg: `Ad #${i + 1}: fill all 3 Advanced Intro scripts.`, field: `ad-${i}-script` };
      }
      if (a.isUniqueIntro && !a.pipelineScenes) {
        return { msg: `Ad #${i + 1}: this Unique Intro script has no scene descriptions — rebuild it from the script chat.`, field: `ad-${i}-script` };
      }
      if (a.isUniqueIntro && !a.productImageUrl) {
        return { msg: `Ad #${i + 1}: pick a product image for scene generation.`, field: `ad-${i}-avatars` };
      }
      // Hook words count towards the 60s gate (they are spoken in the finished
      // file, and the merge-side speed-up no longer clamps a hooked group).
      const w = spokenWordsForAd(a);
      const s = secondsForWords(w);
      const effectivelyCapped = applovinSelected || !a.allowUnlimitedLength;
      if (effectivelyCapped && s > 60) {
        if (applovinSelected) {
          return { msg: `Ad #${i + 1}: ~${s}s — Applovin doesn't accept videos over 60s, so the cap is enforced for this batch. Trim the script, or switch Intended Platform to Meta-only to opt into long-form.`, field: `ad-${i}-script` };
        }
        return { msg: `Ad #${i + 1}: ~${s}s at 170 WPM — over the 60-second cap. Trim the script or toggle "Allow unlimited length".`, field: `ad-${i}-script` };
      }
      const adAvatars = queryClient.getQueryData<AvatarOption[]>(avatarsQueryKey(a.mode)) ?? [];
      const eligible = adAvatars.filter((av) => {
        if (a.allowedAvatarTypes.length === 0) return true;
        return a.allowedAvatarTypes.includes(av.type as AvatarTypeId);
      });
      if (eligible.length === 0) {
        return { msg: `Ad #${i + 1}: no eligible avatars match the selected types. Widen the allowed types or add avatars in the Ads DB.`, field: `ad-${i}-avatars` };
      }
      const selectedAvatarIds = a.randomAvatars ? a.randomAvatarIds : a.manualAvatarIds;
      if (selectedAvatarIds.length === 0) {
        return { msg: `Ad #${i + 1}: pick at least one avatar (or use Random pick).`, field: `ad-${i}-avatars` };
      }
      // Every selected avatar must have at least one look group for this ad's
      // mode + product (the API already filters, so this is defensive against
      // stale picks left over from a prior mode/product).
      for (const avId of selectedAvatarIds) {
        const av = adAvatars.find((x) => x.id === avId);
        // Unique Intro uses generated pipeline images (not look groups): every
        // selected avatar must have all 5 P1–P5 scene images generated.
        if (a.isUniqueIntro) {
          const imgs = a.pipelineImages?.[avId] ?? {};
          const allReady = (["p1", "p2", "p3", "p4", "p5"] as const).every((k) => !!imgs[k]);
          if (!allReady) {
            return { msg: `Ad #${i + 1}: click "Generate Scene" for ${av?.name ?? "each avatar"} — all 5 scene images (P1–P5) are required.`, field: `ad-${i}-avatars` };
          }
          continue;
        }
        if (!av || !av.looks || av.looks.length === 0) {
          return { msg: `Ad #${i + 1}: ${av?.name ?? "an avatar"} has no look group for this ad's mode + product. Re-pick.`, field: `ad-${i}-avatars` };
        }
      }
      // The hook films with the hook avatar's NO-PRODUCT (P1) look, so that
      // avatar must have at least one look group carrying a P1. In "with" mode
      // the avatar payload legitimately contains p1-less groups, and a submit
      // that discovers this inside the entries loop throws and aborts the WHOLE
      // batch — so it is rejected here, in validation, with a named avatar.
      if (a.hookEnabled && a.hookAvatarId && !a.isUniqueIntro) {
        const hookAv = adAvatars.find((x) => x.id === a.hookAvatarId);
        if (!hookAv?.looks?.some((g) => g.p1?.heygen_avatar_id)) {
          return { msg: `Ad #${i + 1}: ${hookAv?.name ?? "the hook avatar"} has no no-product look for this product — pick a different hook avatar.`, field: `ad-${i}-avatars` };
        }
      }
    }
    return null;
  }, [ads, product, cs, productName, queryClient]);

  const submit = async () => {
    // Format-04 ("Animated Characters") never submits to the avatar-driven
    // video pipeline — its only generation is the in-card per-character image
    // workspace. Short-circuit so a stray submit (the bar is hidden, but be
    // defensive) can't fire the HeyGen/FAL path or throw.
    if (anyAnimated) return;
    const err = validate();
    if (err) {
      if (err.field) {
        setMissingFields(new Set([err.field]));
        setTimeout(() => {
          const node = document.querySelector(`[data-missing-field="${err.field}"]`);
          if (node && "scrollIntoView" in node) {
            (node as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 50);
      } else {
        setMissingFields(new Set());
      }
      // Missing Advance Script scenes → pop the looks picker open for that ad.
      if (err.openLooksUid) setAutoOpenLooksUid(err.openLooksUid);
      toast({ title: "Hold up", description: err.msg, variant: "destructive" });
      return;
    }
    setMissingFields(new Set());
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      // ── 1. Resolve brand + product names from the products list ──────────
      // The list comes from /api/ugc/products which is now backed by Supabase,
      // so each item already carries the DB-canonical brand and product names.
      const selectedProduct = products.find((p) => p.id === product);
      const brand = selectedProduct?.brand ?? '';
      const productDisplay = selectedProduct?.name ?? '';
      const productcConfigUrl = selectedProduct?.productc_config_url ?? '';

      // Unique Intro: resolve each selected avatar's HeyGen id once (AvatarOption
      // doesn't carry it) — sent as `avatar_group_id` on the P4/P5 HeyGen clips.
      const uniqueIntroAvatarIds = [
        ...new Set(
          ads
            .filter((a) => a.isUniqueIntro)
            .flatMap((a) => (a.randomAvatars ? a.randomAvatarIds : a.manualAvatarIds)),
        ),
      ];
      const avatarHeygenMap: Record<string, string> = {};
      if (uniqueIntroAvatarIds.length) {
        const { data: avRows } = await supabase
          .from("avatars")
          .select("id, heygen_avatar_id")
          .in("id", uniqueIntroAvatarIds);
        ((avRows ?? []) as Array<{ id: string; heygen_avatar_id: string | null }>).forEach((r) => {
          if (r.heygen_avatar_id) avatarHeygenMap[r.id] = r.heygen_avatar_id;
        });
      }

      // ── 2. Build per-render entries — one per (avatar × slot) ────────────
      // For each selected avatar on each ad, pick ONE look group at random,
      // then emit a HeyGen entry per slot the mode requires. The avatars API
      // has already filtered each avatar's `looks` to the chosen product, so
      // any group is safe to pick.
      type Entry = {
        avatarId: string;
        sceneRef: SceneRef;
        scriptText: string;
        voiceId: string;
        generationId: string;
        concept: string;
        sceneSelection: string;
        captionPlacement: string;
        staticTitleBar: { enabled: boolean; text: string; bgColor: string; textColor: string; duration: number } | null;
        staticBarPlacement: string;
        persona: string;
        subAngle: string;
        // Was read at submit (targeting_metadata.sub_angle_detail) but never declared here
        // nor assigned in `base`, so it silently persisted as null on every row. TypeScript
        // does flag this (TS2339) — nothing ran it, because `build` is a bare `vite build`.
        subAngleDetail: string;
        mainPains: string[];
        // Assigned in `base` and carried in by the spread, so it DOES reach the request at
        // runtime — the type was simply missing it. Declared here so the read at the fetch
        // stays honest: the tempting "fix" for the TS2339 was to delete that read, which
        // would have silently killed per-avatar voice speed.
        voiceSpeed?: number;
        isProduct: boolean;
        // 1-based ordinal that maps onto video_generation_logs.scene_index.
        // The HeyGen webhook merge sorts by this when any clip in the group
        // carries it (back-compat with legacy rows that don't).
        sceneIndex: number;
        // Shared merge-glue marker (ClickUp 86caz3tkg). Set on EVERY clip of a
        // hooked ad+avatar group so the merge tail keeps the hook (which may be
        // filmed by a DIFFERENT avatar) in the same merged file as the body.
        // undefined for hook-off ads — the key is then omitted from the request
        // entirely, so the hook-off request body is byte-identical to today's.
        mergeGroupId?: string;
      };
      // Same format value for the entire generation. Persisted on every
      // video_generation_logs row so the build log shows the script format
      // (NOT the per-clip With/Without-product mode). Chat-launched batches
      // carry the Generate Scripts label via `formatLabel`; manual batches
      // fall back to a length-based Classic UGC label.
      const videoFormat =
        ads.find((a) => a.formatLabel)?.formatLabel ||
        (() => {
          const a = ads[0];
          if (!a) return "";
          if (a.isUniqueIntro) return "Unique Intro";
          return `Classic UGC ${a.lengthTarget === "4-18min" ? "4-18 min" : a.lengthTarget === "1-4min" ? "1-4 min" : "(under 60s)"}`;
        })();

      // "Edit & Regenerate" (86caug6v1): one batch id shared by every ad in this submit, so
      // a multi-ad batch can later be reopened as one form. Batches have no persisted
      // identity today — each ad gets its own generation_id with no shared key — so this is
      // the only carrier for "these ads were created together".
      const batchId = crypto.randomUUID();
      // (ad, generationId) pairs to snapshot. Collected in the loop below rather than written
      // there, so an ad that throws while building its clips never leaves a stray snapshot.
      const adSnapshots: Array<{ ad: AdState; generationId: string }> = [];

      const entries: Entry[] = [];
      // Unique Intro (A1/A2): each avatar runs a multi-step pipeline at submit —
      // generate-scene-prompts → 2× create-fal-video (P1+P2, then P3), then
      // 2× create-heygen-video (P4, P5) with isAdvancedIntro . One job per avatar.
      type UniqueIntroJob = {
        avatarId: string;
        generationId: string;
        // Google-Drive DOWNLOAD links for the 5 generated pipeline images (fed to
        // the FAL / scene-prompt APIs). p4Id/p5Id keep the raw fileId so the P4/P5
        // HeyGen `sceneimage` can use the Drive share URL (driveFileUrl).
        p1Url: string; p2Url: string; p3Url: string; p4Url: string; p5Url: string;
        p4Id: string; p5Id: string;
        dialogues: string[];      // P1–P3 spoken lines
        p4Script: string;         // without-product body
        p5Script: string;         // with-product reveal
        p1p2Dialogue: string;     // P1+P2 spoken lines joined — the call #1 script
        p1p2Duration: number;     // 4 (A1) / 6 (A2) — the P1+P2 fal clip duration
        p3PlaybackSpeed: number;  // P3 fal-log playback_speed — 1.3 (A1) / 1 (A2)
        voiceId: string;          // avatar's HeyGen voice id for the P4/P5 clips
        voiceSpeed?: number;      // per-avatar voice speed for the P4/P5 clips
        heygenGroupId: string;    // avatar's HeyGen id → avatar_group_id on P4/P5
        title: string; concept: string;
        sceneSelection: string; captionPlacement: string;
        persona: string; subAngle: string; subAngleDetail: string; mainPains: string[];
      };
      const uniqueIntroJobs: UniqueIntroJob[] = [];
      for (const a of ads) {
        const selectedAvatarIds = a.randomAvatars ? a.randomAvatarIds : a.manualAvatarIds;
        if (selectedAvatarIds.length === 0) continue;
        // One generation_id per ad — all videos across all avatars on this ad
        // are grouped together in the log, matching the existing per-ad bundle.
        const generationId = crypto.randomUUID();
        // Snapshot this ad's full settings under the same generation_id the Video Build Log
        // will group its clips by — that shared key is what lets Edit & Regenerate find them.
        adSnapshots.push({ ad: a, generationId });
        const sceneSelection = a.mode === "combination" ? "Both" : a.mode === "with" ? "With Product" : "Without Product";

        const captionPlacement = a.staticBar.captionPlacement || "bottom:22";
        // Map the editor's `durationSec` to the `duration` key the merge
        // service / captionBurn already consumes. Send null when the bar is
        // disabled or has no text so the merge doesn't try to render a blank.
        const barEnabledAndFilled = a.staticBar.enabled && a.staticBar.text.trim().length > 0;
        const staticTitleBar = barEnabledAndFilled
          ? {
              enabled: a.staticBar.enabled,
              text: a.staticBar.text.trim(),
              bgColor: a.staticBar.bgColor,
              textColor: a.staticBar.textColor,
              duration: a.staticBar.durationSec,
            }
          : null;
        const staticBarPlacement = barEnabledAndFilled ? (a.staticBar.staticBarPlacement || "") : "";

        const adAvatars = queryClient.getQueryData<AvatarOption[]>(avatarsQueryKey(a.mode)) ?? [];
        for (const avatarId of selectedAvatarIds) {
          const avatar = adAvatars.find((x) => x.id === avatarId);
          if (!avatar) throw new Error(`Avatar ${avatarId} no longer in the product list — re-pick avatars.`);

          // Unique Intro (A1/A2): collect a FAL pipeline job per avatar. All 5
          // pipeline images must be generated — P1–P3 = advanced-intro scenes,
          // P4 = without-product talking head, P5 = with-product reveal. They are
          // sent to the FAL/scene-prompt APIs as Drive DOWNLOAD links.
          if (a.isUniqueIntro) {
            const imgs = a.pipelineImages?.[avatarId] ?? {};
            const slotKeys = ["p1", "p2", "p3", "p4", "p5"] as const;
            const ids = slotKeys.map((k) => {
              const id = imgs[k];
              if (!id) throw new Error(`${avatar.name}: scene image ${k.toUpperCase()} not generated yet.`);
              return id;
            });
            const [p1Url, p2Url, p3Url, p4Url, p5Url] = ids.map(driveDownloadUrl);
            const dialogues = [
              (a.advanceScripts[0] ?? "").trim(),
              (a.advanceScripts[1] ?? "").trim(),
              (a.advanceScripts[2] ?? "").trim(),
            ];
            uniqueIntroJobs.push({
              avatarId,
              generationId,
              p1Url, p2Url, p3Url, p4Url, p5Url,
              p4Id: ids[3], p5Id: ids[4],
              dialogues,
              p4Script: a.withoutProductText.trim(),
              p5Script: a.withProductText.trim(),
              p1p2Dialogue: [dialogues[0], dialogues[1]].filter(Boolean).join(" "),
              // The P1+P2 fal clip runs 6s for A2 (the user's "B2"), 4s otherwise.
              p1p2Duration: /\bA2\b/i.test(a.formatLabel || "") ? 6 : 4,
              // P3 plays at 1.3× for A1, normal (1×) for A2.
              p3PlaybackSpeed: /\bA2\b/i.test(a.formatLabel || "") ? 1 : 1.3,
              voiceId: avatar.voice_id || VOICE_ID,
              voiceSpeed: a.avatarSpeeds?.[avatarId] ?? avatar.voice_speed ?? undefined,
              heygenGroupId: avatarHeygenMap[avatarId] ?? "",
              title: a.concept,
              concept: a.concept,
              sceneSelection, captionPlacement,
              persona: a.persona, subAngle: a.subAngle, subAngleDetail: a.subAngleDetail ?? "", mainPains: a.mainPains,
            });
            continue;
          }

          if (!avatar.looks?.length) throw new Error(`${avatar.name} has no look group for ${productDisplay}.`);

          // Honor a look explicitly chosen in the "See selected looks" modal;
          // fall back to a random group when none was picked (or the pick is
          // no longer available for this product/mode).
          // selectedLooks stores a per-look uid (lookUid), not scene_group_id —
          // two looks can share a scene_group_id, so resolve by the unique uid.
          const chosenLookUid = a.selectedLooks?.[avatarId];
          const group =
            (chosenLookUid && avatar.looks.find((g) => lookUid(g) === chosenLookUid)) ||
            pickRandom(avatar.looks, 1)[0];
          const voiceId = avatar.voice_id || VOICE_ID;
          // ── Optional hook (ClickUp 86caz3tkg) ───────────────────────────
          // Filmed as its OWN clip, FIRST, by its OWN avatar. One merge group
          // per (ad, body-avatar) — the brief's explicit choice: 3 avatars = 3
          // hook clips = 3 paid renders; reuse is a later optimisation.
          // mergeGroupId stays undefined for hook-off ads, so every clip below
          // is built exactly as it is today.
          const hookOn = !!a.hookEnabled && !!a.hookText.trim();
          const mergeGroupId = hookOn ? crypto.randomUUID() : undefined;
          const base = {
            avatarId, voiceId, generationId, concept: a.concept, sceneSelection,
            mergeGroupId,
            captionPlacement, staticTitleBar, staticBarPlacement,
            persona: a.persona, subAngle: a.subAngle, subAngleDetail: a.subAngleDetail ?? "", mainPains: a.mainPains,
            // Per-ad override wins over the avatar's saved speed; undefined
            // falls through to the renderer default.
            voiceSpeed: a.avatarSpeeds?.[avatarId] ?? avatar.voice_speed ?? undefined,
          };
          // Build the ordered clip list for this avatar.
          // - 60s combo: P1 (idx 1) → P2 (idx 2). Same as today.
          // - 1-4 min combo short (M1/M2 empty): same as 60s combo.
          // - 1-4 min combo medium (M1 only): P1 → M1 → P2.
          // - 1-4 min combo long (M1+M2): P1 → M1 → M2 → P2.
          // - with / without single-take: one entry, idx 1.
          // P1 + M1 + M2 all use the without-product scene (hands-free);
          // P2 uses the with-product scene. Format-05 skill enforces this.
          // The hook is clip #1 and every other clip shifts up by one. EVERY clip
          // must carry a 1-based number: the merge sorts on `scene_index ?? 999`,
          // so an unnumbered clip would land at the very END of the video.
          if (hookOn) {
            const hookAvatar = adAvatars.find((x) => x.id === a.hookAvatarId);
            if (!hookAvatar) throw new Error(`Hook avatar for "${a.concept || "this ad"}" is no longer in the product list — re-pick it.`);
            if (!hookAvatar.looks?.length) throw new Error(`${hookAvatar.name} (hook) has no look group for ${productDisplay}.`);
            // The hook always films with the avatar's NO-PRODUCT (P1) look, so
            // the look group has to be one that HAS a P1. In "with" mode the
            // /api/new-avatars payload legitimately returns groups whose p1 is
            // null (newAvatarService only skips p1-less groups for
            // mode==="combination"), so a blind random pick would throw on ~a
            // third of them and — because this runs inside the entries loop —
            // abort the WHOLE batch nondeterministically. Prefer a p1-bearing
            // look; validate() already rejects a hook avatar that has none.
            const hookLooks = hookAvatar.looks.filter((g) => g.p1?.heygen_avatar_id);
            const hookGroup = hookLooks.length ? pickRandom(hookLooks, 1)[0] : undefined;
            if (!hookGroup?.p1?.heygen_avatar_id) throw new Error(`${hookAvatar.name} (hook) has no no-product look for ${productDisplay} — pick a different hook avatar.`);
            entries.push({
              ...base,
              // WHO IS FILMED comes from the hook avatar: its scene, its voice,
              // its speed. `avatar_id` on the row deliberately stays the BODY
              // avatar's id (it is the Video Build Log's bucketing key — the hook
              // avatar's id there would split one ad into two cards), and the
              // per-avatar regenerate re-derives the HeyGen avatar from scene_id.
              sceneRef: hookGroup.p1,
              voiceId: hookAvatar.voice_id || VOICE_ID,
              voiceSpeed: a.avatarSpeeds?.[a.hookAvatarId] ?? hookAvatar.voice_speed ?? undefined,
              scriptText: a.hookText.trim(),
              isProduct: false,
              sceneIndex: 1,
            });
          }
          const firstClipIndex = hookOn ? 2 : 1;
          if (a.mode === "without") {
            if (!group.p1?.heygen_avatar_id) throw new Error(`${avatar.name}: P1 scene missing HeyGen avatar id.`);
            entries.push({ ...base, sceneRef: group.p1, scriptText: a.withoutProductText, isProduct: false, sceneIndex: firstClipIndex });
          } else if (a.mode === "with") {
            if (!group.p2?.heygen_avatar_id) throw new Error(`${avatar.name}: P2 scene missing HeyGen avatar id.`);
            entries.push({ ...base, sceneRef: group.p2, scriptText: a.withProductText, isProduct: true, sceneIndex: firstClipIndex });
          } else {
            // combination
            if (!group.p1?.heygen_avatar_id) throw new Error(`${avatar.name}: P1 scene missing HeyGen avatar id.`);
            if (!group.p2?.heygen_avatar_id) throw new Error(`${avatar.name}: P2 scene missing HeyGen avatar id.`);
            const useExtended = a.lengthTarget === "1-4min";
            const m1Body = useExtended ? a.m1Text.trim() : "";
            const m2Body = useExtended ? a.m2Text.trim() : "";
            // Format-08 (4-18 min): every authored MODULE is its own hands-free
            // clip between the HOOK (withoutProductText) and the REVEAL
            // (withProductText). Empty for every other length target, so the
            // 60s / 1-4 min clip lists below are untouched.
            const moduleBodies =
              a.lengthTarget === "4-18min"
                ? a.moduleTexts.map((t) => t.trim()).filter(Boolean)
                : [];
            // Clip order: P1/HOOK=1, [M1=2, M2=3,] or [MODULE 1..N = 2..N+1,]
            // P2/REVEAL=last. (Unique Intro is handled earlier via the
            // advanced_intro path and never reaches here.)
            let idx = firstClipIndex;
            entries.push({ ...base, sceneRef: group.p1, scriptText: a.withoutProductText, isProduct: false, sceneIndex: idx++ });
            if (m1Body) {
              entries.push({ ...base, sceneRef: group.p1, scriptText: m1Body, isProduct: false, sceneIndex: idx++ });
            }
            if (m2Body) {
              entries.push({ ...base, sceneRef: group.p1, scriptText: m2Body, isProduct: false, sceneIndex: idx++ });
            }
            for (const moduleBody of moduleBodies) {
              entries.push({ ...base, sceneRef: group.p1, scriptText: moduleBody, isProduct: false, sceneIndex: idx++ });
            }
            entries.push({ ...base, sceneRef: group.p2, scriptText: a.withProductText, isProduct: true, sceneIndex: idx });
          }
        }
      }

      // ── 2b. Persist the settings snapshot, one row per ad ────────────────
      // Written BEFORE the render fan-out: the settings are known-good by this point (every
      // ad built its clips without throwing), and a failure surfaces immediately rather than
      // after a long render.
      //
      // Deliberately NON-FATAL. A missing snapshot costs the user an "Edit & Regenerate"
      // button; it must never cost them their videos. So this warns and continues — it does
      // not throw into the catch below, which would abort the whole submit.
      //
      // ⚠️ DEPLOY ORDER: image-builder MUST ship before this frontend. The endpoint below is
      // new; if the FE goes out first every submit POSTs to a 404 and every user gets the
      // "Settings not saved for re-editing" toast. Videos still generate correctly (that is
      // what the non-fatal handling buys us), but it looks broken. The migration is already
      // applied and is safe to sit ahead of both — the table simply stays empty.
      if (adSnapshots.length) {
        const snapshotPage = {
          product,
          product_name: productDisplay,
          brand,
          funnel,
          intended_platform: intendedPlatform,
          cs,
        };
        const snapshotResults = await Promise.allSettled(
          adSnapshots.map(async ({ ad: a, generationId }) => {
            const res = await fetch(`${API_BASE}/api/ugc-generation-settings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                generation_id: generationId,
                batch_id: batchId,
                // The logged-in account, not `cs` — cs is a Creative Strategist LABEL which
                // may be someone else entirely (or "Agentic").
                user_email: email || null,
                product_id: product || null,
                source_generation_id: restoredFromGenerationId.current,
                schema_version: SNAPSHOT_SCHEMA_VERSION,
                settings_json: buildSettingsSnapshot({
                  ad: a as unknown as Record<string, unknown>,
                  page: snapshotPage,
                  chatId: referrer,
                  sourceGenerationId: restoredFromGenerationId.current,
                }),
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => null);
              throw new Error(body?.error || `snapshot failed (HTTP ${res.status})`);
            }
            return res;
          }),
        );
        const failedSnapshots = snapshotResults.filter((r) => r.status === "rejected");
        if (failedSnapshots.length) {
          toast({
            title: "Settings not saved for re-editing",
            description: `${failedSnapshots.length} of ${adSnapshots.length} ad${adSnapshots.length === 1 ? "" : "s"} won't offer "Edit & Regenerate". Your videos are generating normally.`,
          });
        }
      }

      // ── 3. Fire all create-heygen-video calls in parallel ────────────────
      await Promise.all(entries.map(async (e) => {
        const res = await fetch(`${API_BASE}/api/create-heygen-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            heygen_avatar_id: e.sceneRef.heygen_avatar_id,
            title: e.sceneRef.name,
            script: e.scriptText,
            voice_id: e.voiceId,
            voice_speed: e.voiceSpeed,
            log: {
              avatar_id: e.avatarId,
              generation_id: e.generationId,
              scene_id: e.sceneRef.scene_id,
              product_name: productDisplay,
              brand,
              productc_config_url: productcConfigUrl,
              script: e.scriptText,
              cs,
              concept: e.concept,
              is_product: e.isProduct,
              // 1-based clip order. Persisted on video_generation_logs so the
              // HeyGen webhook merge concats P1 → M1? → M2? → P2 correctly for
              // format-05 (Classic UGC 1-4 min). Legacy rows without this stay
              // on the old [withoutProduct, withProduct] ordering.
              scene_index: e.sceneIndex,
              // Shared merge-glue marker — ONLY present for hooked groups. The
              // row insert copies this object straight into
              // video_generation_logs, so the key must never be sent as
              // null/undefined noise on the hook-off path.
              ...(e.mergeGroupId ? { merge_group_id: e.mergeGroupId } : {}),
              video_format: videoFormat,
              funnel,
              // Platform chosen on this creation page. Persisted on every
              // video_generation_logs row so the Video Build Log shows the REAL
              // intended platform instead of always defaulting to "Both".
              intended_platform: intendedPlatform,
              scene_selection: e.sceneSelection,
              caption_placement: e.captionPlacement,
              static_title_bar: e.staticTitleBar,
              static_bar_placement: e.staticBarPlacement,
              targeting_metadata: {
                persona:    e.persona    || null,
                sub_angle:  e.subAngle   || null,
                sub_angle_detail: e.subAngleDetail || null,
                main_pains: e.mainPains && e.mainPains.length ? e.mainPains : null,
              },
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.video_id) throw new Error(data?.error || `Video creation failed for scene "${e.sceneRef.name}"`);
        return data;
      }));

      // Unique Intro (A1/A2): per avatar —
      //   1) generate-scene-prompts/advanced-intro (P1+P2 and P3 prompts)
      //   2) create-fal-video for P1+P2 (combined), then a separate one for P3
      //   3) create-heygen-video for P4 and P5 (isAdvancedIntro)
      // Returns the number of clips kicked off per avatar for the toast count.
      const uniqueIntroCounts = await Promise.all(
        uniqueIntroJobs.map(async (j) => {
          // Step 1 — scene prompts (split: P1+P2 and P3).
          const spRes = await fetch(`${API_BASE}/api/generate-scene-prompts/advanced-intro`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scene_images: [j.p1Url, j.p2Url, j.p3Url],
              product_image: j.p5Url,
              p4_script: j.p4Script,
              avatar_image: j.p4Url,
              p5_script: j.p5Script,
              dialogues: j.dialogues,
            }),
          });
          const sp = await spRes.json().catch(() => null);
          if (!spRes.ok || !sp?.success) {
            throw new Error(sp?.error || sp?.message || "Scene prompt generation failed.");
          }
          // `scene_prompts` is [Scene 1, Scene 2, Scene 3]. The combined P1+P2
          // clip uses Scene 1 + Scene 2 joined; the P3 clip uses Scene 3.
          const scenePrompts: string[] = Array.isArray(sp.scene_prompts) ? sp.scene_prompts : [];
          const p1p2Prompt: string =
            [scenePrompts[0], scenePrompts[1]].filter(Boolean).join(" ") || sp.scene_combined_prompt || "";
          const p3Prompt: string = scenePrompts[2] ?? "";

          // Superset log base — keeps the metadata the Video Build Log shows.
          const logBase = {
            avatar_id: j.avatarId,
            generation_id: j.generationId,
            scene_id: "",
            product_name: productDisplay,
            brand,
            productc_config_url: productcConfigUrl,
            cs,
            concept: j.concept,
            video_format: videoFormat,
            funnel,
            intended_platform: intendedPlatform,
            scene_selection: j.sceneSelection,
            caption_placement: j.captionPlacement,
            targeting_metadata: {
              persona:    j.persona   || null,
              sub_angle:  j.subAngle  || null,
              sub_angle_detail: j.subAngleDetail || null,
              main_pains: j.mainPains && j.mainPains.length ? j.mainPains : null,
            },
          };

          const createFalVideo = async (body: Record<string, unknown>) => {
            const res = await fetch(`${API_BASE}/api/create-fal-video`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || data?.message || "FAL video creation failed.");
            return data;
          };

          // P4/P5 talking-head clips → HeyGen (no ElevenLabs). Mirrors the
          // classic create-heygen-video payload + isAdvancedIntro ; `sceneimage`
          // is the generated image's Drive share URL, `avatar_group_id` the
          // avatar's HeyGen id (heygen_avatar_id stays empty), `log` an object.
          const createHeygenClip = async (
            fileId: string,
            script: string,
            isProduct: boolean,
            sceneIndex: number,
          ) => {
            const res = await fetch(`${API_BASE}/api/create-heygen-video`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                heygen_avatar_id: [],
                avatar_group_id: j.heygenGroupId,
                isAdvancedIntro: true,
                title: j.title,
                script,
                sceneimage: driveFileUrl(fileId),
                voice_id: j.voiceId,
                voice_speed: j.voiceSpeed,
                log: { ...logBase, script, is_product: isProduct, scene_index: sceneIndex },
              }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.video_id) {
              throw new Error(data?.error || data?.message || "HeyGen video creation failed.");
            }
            return data;
          };

          // scene_index runs continuously: 1 = P1+P2, 2 = P3, 3 = P4, 4 = P5.
          const calls: Promise<unknown>[] = [
            // Call #1 — combined P1+P2 (4s, or 6s for A2).
            createFalVideo({
              type: "reference-to-video",
              prompt: p1p2Prompt,
              script: j.p1p2Dialogue,
              image_urls: [j.p1Url, j.p2Url],
              audio_urls: [],
              resolution: "1080p",
              aspect_ratio: "9:16",
              duration: j.p1p2Duration,
              generate_audio: true,
              log: { ...logBase, script: j.p1p2Dialogue, is_product: false, scene_index: 1 },
            }),
            // Call #2 — P3 (separate fal call).
            createFalVideo({
              type: "reference-to-video",
              prompt: p3Prompt,
              script: j.dialogues[2] ?? "",
              image_urls: [j.p3Url],
              audio_urls: [],
              resolution: "1080p",
              aspect_ratio: "9:16",
              duration: 4,
              generate_audio: true,
              log: { ...logBase, script: j.dialogues[2] ?? "", is_product: false, scene_index: 2, playback_speed: j.p3PlaybackSpeed },
            }),
            // P4 then P5 — HeyGen talking-head clips.
            createHeygenClip(j.p4Id, j.p4Script, false, 3),
            createHeygenClip(j.p5Id, j.p5Script, true, 4),
          ];

          await Promise.all(calls);
          return calls.length;
        }),
      );

      const videoCount = entries.length + uniqueIntroCounts.reduce((n, c) => n + c, 0);
      toast({
        title: "Batch submitted",
        description: `${videoCount} video${videoCount === 1 ? "" : "s"} queued — tracking in the log.`,
      });
      navigate("/ugc-builder/video-build-log");
    } catch (err: any) {
      toast({ title: "Submit failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  // Footer button entry point. A regeneration goes through an explicit confirmation naming
  // the clip count and stating that the originals are kept; an ordinary batch submits
  // straight through, exactly as before.
  const handleSubmitClick = () => {
    if (restoredFromGenerationId.current) {
      setConfirmRegenOpen(true);
      return;
    }
    submit();
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
    <div className="h-full w-full flex flex-col bg-background">
      {/* Top bar — back-to-chat + page title */}
      <header className="border-b border-border/85 bg-card/40 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {referrer ? (
            <Link
              to={`/ugc-builder/generate-scripts?chat=${encodeURIComponent(referrer)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/85 bg-card hover:bg-muted px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
              data-testid="batch-back-to-chat"
            >
              <ArrowLeft className="size-3.5" />
              <MessageSquare className="size-3.5 text-muted-foreground" />
              Back to chat
            </Link>
          ) : (
            <Link
              to="/ugc-builder/generate-scripts"
              className="inline-flex items-center gap-1.5 rounded-md text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Chat
            </Link>
          )}
          <span className="text-muted-foreground/55 mx-1">·</span>
          <div className="inline-flex items-center gap-2">
            <div className="size-6 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center">
              <Video className="size-3 text-primary" />
            </div>
            <span className="text-[13.5px] font-semibold tracking-tight">Create UGC batch</span>
          </div>
          <div className="ml-auto text-[11.5px] text-muted-foreground hidden sm:inline">
            {email}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Hero copy */}
        <section className="relative overflow-hidden rounded-2xl border border-border/85 bg-gradient-to-br from-card via-card to-primary/5 px-5 py-4">
          <div className="absolute -top-12 -right-12 size-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <Sparkles className="size-5 text-primary/80 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight">
                Build a batch of UGC ads
              </h1>
              <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed max-w-2xl">
                Add as many ads as you need. Each ad becomes one row in AdsDB
                with its own ClickUp task + Drive folder once you approve it.
                Settings above the fold apply to the whole batch; per-ad
                settings live on each card below.
              </p>
            </div>
          </div>
        </section>

        {/* Batch-wide settings */}
        <BatchSettingsBar
          products={products}
          product={product}
          setProduct={(v) => { setProduct(v); setMissingFields((m) => { const n = new Set(m); n.delete("product"); return n; }); }}
          productLocked={productLocked}
          cs={cs}
          setCs={(v) => { setCs(v); setMissingFields((m) => { const n = new Set(m); n.delete("cs"); return n; }); }}
          csOwners={csOwners}
          funnel={funnel}
          setFunnel={setFunnel}
          intendedPlatform={intendedPlatform}
          setIntendedPlatform={setIntendedPlatform}
          missingFields={missingFields}
        />

        {/* Edit & Regenerate — reassure the user their originals are safe (86caug6v1) */}
        {restoreNotice && (
          <div
            className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[12.5px] text-foreground/90 flex items-start justify-between gap-3"
            data-testid="batch-restore-notice"
          >
            <span>{restoreNotice}</span>
            <button
              type="button"
              onClick={() => setRestoreNotice(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}

        {/* Stale references dropped on restore — never silently shrink the selection */}
        {staleWarning && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-foreground/90 flex items-start justify-between gap-3"
            data-testid="batch-stale-warning"
          >
            <span className="flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-600" />
              {staleWarning}
            </span>
            <button
              type="button"
              onClick={() => setStaleWarning(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}

        {/* Ad cards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Ads in this batch ({ads.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={addAd}
              className="h-8 gap-1.5"
              data-testid="batch-add-ad"
            >
              <Plus className="size-3.5" />
              Add another ad
            </Button>
          </div>
          {ads.map((ad, idx) => (
            <AdCard
              key={ad.uid}
              ad={ad}
              idx={idx}
              total={ads.length}
              productName={productName}
              personaOptions={personasQ.data ?? []}
              subAngleOptions={subAnglesQ.data ?? []}
              subAngleDetailOptions={subAngleDetailsQ.data ?? []}
              painsOptions={painsQ.data ?? []}
              productPicked={!!product}
              productSlug={product}
              applovinSelected={applovinSelected}
              onChange={(patch) => updateAd(ad.uid, patch)}
              onRemove={() => removeAd(ad.uid)}
              onOpenManage={onOpenManage}
              canManageOptions={!!product && !!currentProductName && !fieldsLoading}
              autoOpenLooks={autoOpenLooksUid === ad.uid}
              onAutoOpenConsumed={() => setAutoOpenLooksUid(null)}
              checkStaleRefs={staleCheckPending}
              onStaleRefsPruned={handleStaleRefsPruned}
            />
          ))}
          <Button
            variant="outline"
            size="lg"
            onClick={addAd}
            className="w-full h-12 gap-1.5 border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/30"
            data-testid="batch-add-ad-bottom"
          >
            <Plus className="size-4" />
            Add another ad
          </Button>
        </section>
      </main>

      {/* Submit bar — sits at the bottom of the flex column so it tracks the
          actual main-content width and never overlaps the AppShell sidebar
          (whose width is driven by a CSS variable, not a fixed breakpoint).
          HIDDEN for Format-04 ("Animated Characters"): that flow is image-only
          (in-card per-character generation), so the avatar-driven "Generate
          videos" submit must never appear or fire. */}
      {!anyAnimated && (
      <footer className="border-t border-border/85 bg-card/95 backdrop-blur-md sticky bottom-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-[12.5px]">
            <span className="font-semibold tabular-nums">{totals.ads}</span>
            <span className="text-muted-foreground">ad{totals.ads === 1 ? "" : "s"}</span>
            <span className="text-muted-foreground/55">·</span>
            <span className="font-semibold tabular-nums">{totals.videos}</span>
            <span className="text-muted-foreground">video{totals.videos === 1 ? "" : "s"}</span>
            {totals.over > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 text-destructive px-2 py-0.5 text-[10.5px] font-medium ml-1">
                <AlertTriangle className="size-3" />
                {totals.over} over 60s
              </span>
            )}
          </div>
          <Button
            onClick={handleSubmitClick}
            disabled={submitting || totals.ads === 0 || totals.videos === 0}
            className="ml-auto h-10 gap-1.5"
            data-testid="batch-submit"
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {submitting
              ? "Submitting…"
              : `Generate ${totals.ads} ad${totals.ads === 1 ? "" : "s"} · ${totals.videos} video${totals.videos === 1 ? "" : "s"}`}
          </Button>
        </div>
      </footer>
      )}

      {/* Regeneration cost confirmation (86caug6v1). Only reachable when this form was
          reopened via Edit & Regenerate — an ordinary batch submits straight through. */}
      <Dialog open={confirmRegenOpen} onOpenChange={setConfirmRegenOpen}>
        <DialogContent className="sm:max-w-md" data-testid="confirm-regenerate-dialog">
          <DialogHeader>
            <DialogTitle>Generate a new batch?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1 text-[13px] leading-relaxed">
                <p>
                  This renders{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {totals.videos} new video{totals.videos === 1 ? "" : "s"}
                  </span>{" "}
                  across {totals.ads} ad{totals.ads === 1 ? "" : "s"} — a fresh, billable batch.
                </p>
                <p>
                  The videos you reopened these settings from are{" "}
                  <span className="font-semibold text-foreground">kept</span> and stay in the
                  Video Build Log as their own entry. Nothing is overwritten.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmRegenOpen(false)}
              data-testid="confirm-regenerate-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => { setConfirmRegenOpen(false); submit(); }}
              className="gap-1.5"
              data-testid="confirm-regenerate-go"
            >
              <Send className="size-3.5" />
              Generate {totals.videos} video{totals.videos === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {manageDialog && (
        <ManageOptionsDialog
          open={manageDialog.open}
          onClose={() => setManageDialog(null)}
          fieldName={fieldForKey(manageDialog.fieldKey)?.name || manageDialog.fieldKey}
          initialOptions={manageDialogInitial}
          onAdd={(label) => handleAddFieldOption(manageDialog.fieldKey, label)}
          onRename={(oldL, newL) => handleRenameFieldOption(manageDialog.fieldKey, oldL, newL)}
          onRemove={(label) => handleRemoveFieldOption(manageDialog.fieldKey, label)}
          canEdit
        />
      )}
    </div>
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Plain body string for an ad — combines P1+P2 for combination, otherwise
 *  the single text field. This is what gets shipped to HeyGen. */
function scriptForAd(a: AdState): string {
  if (a.mode === "with") return a.withProductText;
  if (a.mode === "without") return a.withoutProductText;
  // Format-08 (4-18 min): the MODULE clips sit between HOOK and REVEAL.
  const middles = a.lengthTarget === "4-18min" ? a.moduleTexts : [];
  return [a.withoutProductText, ...middles, a.withProductText].filter(Boolean).join("\n\n");
}

// Spoken words the finished file will contain, INCLUDING the optional hook
// (ClickUp 86caz3tkg). The hook is a real spoken clip glued in front of the
// body, so it has to be inside every duration estimate — the merge-side 60s
// speed-up is deliberately switched off for hooked groups (routes.js
// `maxDurationSec = (isClassicUnder60 && !groupHasHook) ? 60 : null`), so this
// front-end estimate is the ONLY thing left that can stop an Applovin batch
// shipping a file over 60s. Returns exactly countWords(scriptForAd(a)) when the
// hook is off, so hook-off ads are estimated exactly as they are today.
function spokenWordsForAd(a: AdState): number {
  const hookWords = a.hookEnabled && a.hookText.trim() ? countWords(a.hookText) : 0;
  return countWords(scriptForAd(a)) + hookWords;
}

// ─────────────────────────────────────────────────────────────────────────
// Batch settings bar — sticky-ish above the ads list
// ─────────────────────────────────────────────────────────────────────────

function BatchSettingsBar(props: {
  products: ProductInfo[];
  product: string; setProduct: (v: string) => void; productLocked?: boolean;
  cs: string; setCs: (v: string) => void; csOwners: CsOwner[];
  funnel: "Onbrand" | "Comparison" | "TSL"; setFunnel: (v: "Onbrand" | "Comparison" | "TSL") => void;
  intendedPlatform: "Meta" | "Applovin" | "Both"; setIntendedPlatform: (v: "Meta" | "Applovin" | "Both") => void;
  missingFields?: Set<string>;
}) {
  const currentProductName = props.products.find((p) => p.id === props.product)?.name || props.product;
  // Visual ring + label tint when a field is flagged as missing by the
  // submit validator. Clears the moment the user picks a value (see the
  // setProduct / setCs wrappers in the parent component).
  const flag = (k: string) => props.missingFields?.has(k) || false;
  const flagRing = (k: string) => flag(k)
    ? "ring-2 ring-destructive/70 ring-offset-1 ring-offset-background rounded-md"
    : "";
  const flagLabel = (k: string) => flag(k)
    ? "text-destructive font-semibold"
    : "text-muted-foreground/80";
  return (
    <section className="rounded-2xl border border-border/85 bg-card/60 backdrop-blur-sm overflow-hidden">
      <header className="px-5 py-2.5 border-b border-border/85 flex items-center gap-2">
        <Lock className="size-3 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
          Batch settings — apply to every ad below
        </span>
      </header>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`space-y-1 ${flagRing("product")}`} data-missing-field="product">
          <Label className={`text-[10.5px] uppercase tracking-wider ${flagLabel("product")}`}>
            Brand · Product {flag("product") && <span>· required</span>}
          </Label>
          {props.productLocked ? (
            <div className="h-9 px-3 flex items-center gap-2 text-[12.5px] rounded-md border border-border/85 bg-muted/30 text-muted-foreground">
              <Lock className="size-3 shrink-0" />
              <span className="truncate text-foreground">{currentProductName || props.product}</span>
              <span className="ml-auto text-[10px] italic text-muted-foreground/70">from chat</span>
            </div>
          ) : (
            <Select value={props.product} onValueChange={props.setProduct}>
              <SelectTrigger className="h-9 text-[12.5px]" data-testid="batch-product">
                <SelectValue placeholder="Pick a product…" />
              </SelectTrigger>
              <SelectContent>
                {props.products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className={`space-y-1 ${flagRing("cs")}`} data-missing-field="cs">
          <Label className={`text-[10.5px] uppercase tracking-wider ${flagLabel("cs")}`}>
            Creative Strategist {flag("cs") && <span>· required</span>}
          </Label>
          <CsCombobox value={props.cs} owners={props.csOwners} onChange={props.setCs} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
            Funnel
          </Label>
          <Select value={props.funnel} onValueChange={(v) => props.setFunnel(v as any)}>
            <SelectTrigger className="h-9 text-[12.5px]" data-testid="batch-funnel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Onbrand">Onbrand</SelectItem>
              <SelectItem value="Comparison">Comparison</SelectItem>
              <SelectItem value="TSL">TSL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
            Intended platform
          </Label>
          <Select value={props.intendedPlatform} onValueChange={(v) => props.setIntendedPlatform(v as any)}>
            <SelectTrigger className="h-9 text-[12.5px]" data-testid="batch-platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Both">Both — Meta + Applovin</SelectItem>
              <SelectItem value="Meta">Meta only</SelectItem>
              <SelectItem value="Applovin">Applovin only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ad card
// ─────────────────────────────────────────────────────────────────────────

function AdCard({
  ad, idx, total, productName, personaOptions, subAngleOptions, subAngleDetailOptions, painsOptions, productPicked, productSlug, applovinSelected, onChange, onRemove, onOpenManage, canManageOptions, autoOpenLooks, onAutoOpenConsumed, checkStaleRefs, onStaleRefsPruned,
}: {
  ad: AdState;
  idx: number;
  total: number;
  productName: string;
  personaOptions: string[];
  subAngleOptions: string[];
  subAngleDetailOptions: string[];
  painsOptions: string[];
  productPicked: boolean;
  productSlug: string;
  applovinSelected: boolean;
  onChange: (patch: Partial<AdState> | ((ad: AdState) => Partial<AdState>)) => void;
  onRemove: () => void;
  onOpenManage: (fieldKey: TargetingFieldKey, adUid: string) => void;
  canManageOptions: boolean;
  autoOpenLooks: boolean;
  onAutoOpenConsumed: () => void;
  /** True for a short window after an Edit & Regenerate restore: once this card's avatar
   *  pool has loaded, drop any avatar the snapshot referenced that no longer exists. */
  checkStaleRefs: boolean;
  /** Reports the human-readable names/ids that were dropped, so the page can tell the user
   *  exactly what went missing rather than silently shrinking their selection. */
  onStaleRefsPruned: (dropped: string[]) => void;
}) {
  // Format-05 (1-4 min): each middle beat that didn't generate is hidden behind
  // its own "Add" reveal so the operator can author it on demand without empty
  // fields cluttering the card — and collapse it again while it's still empty.
  const [showM1, setShowM1] = useState(false);
  const [showM2, setShowM2] = useState(false);

  const ManageBtn = ({ fieldKey }: { fieldKey: TargetingFieldKey }) => (
    <button
      type="button"
      disabled={!canManageOptions}
      onClick={() => onOpenManage(fieldKey, ad.uid)}
      title={canManageOptions ? "Add / rename / remove options for this product" : "Pick a product first"}
      className="inline-flex items-center gap-1 rounded-md border border-border/85 bg-card/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed normal-case tracking-normal ml-2"
      data-testid={`manage-${fieldKey}-${ad.uid}`}
    >
      <Settings2 className="size-2.5" />
      Manage
    </button>
  );

  // Per-ad avatars — mode-aware. The same (productName, ad.mode) key is used
  // by the page-level submit/validate via queryClient.getQueryData, so this
  // is the single source of truth for what avatars this ad can pick from.
  const avatarsQ = useQuery<AvatarOption[]>({
    queryKey: [`${API_BASE}/api/new-avatars`, productName, ad.mode],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/new-avatars?product=${encodeURIComponent(productName)}&mode=${ad.mode}`,
      );
      return r.json();
    },
    enabled: !!productName,
  });
  const avatars = avatarsQ.data ?? [];

  // Unique Intro only — ALL no-product scenes for this ad's selected avatars,
  // product-independent (straight from the scenes table, not the product-
  // filtered /api/new-avatars looks). Keyed so the page-level validate/submit
  // can read it back from the cache (mirrors the avatarsQ pattern above).
  const advAvatarIds = ad.randomAvatars ? ad.randomAvatarIds : ad.manualAvatarIds;
  const advScenesQ = useQuery<Record<string, SceneRef[]>>({
    queryKey: advanceScenesQueryKey(advAvatarIds),
    queryFn: () => fetchNonProductScenes(advAvatarIds),
    enabled: ad.isUniqueIntro && advAvatarIds.length > 0,
  });
  const advanceSceneOptions = advScenesQ.data ?? {};

  const { toast } = useToast();

  // Unique Intro only — stored product images for the picker (the productUrl
  // sent to generate-pipeline-images). Sourced from the same products feed the
  // Avatars "Generate a new look" flow uses (useProducts → /api/products/full),
  // whose `product_images` are pre-joined and keyed by the canonical product id.
  // Match the ad's product by id first, then fall back to name (the /api/ugc
  // product id space isn't guaranteed to equal the products feed's id).
  const { products: allProducts } = useProducts();
  const productForImages = (allProducts ?? []).find(
    (p) => p.id === productSlug || p.name === productName,
  );
  const productImages = productForImages?.product_images ?? [];

  // Real holding-example photos (up to 5) sent as extra GPT references at P5 —
  // they teach the model the natural grip and true product size. Stored
  // product_reference_images URLs and/or upload data-URIs. Ad-level + GPT-only,
  // mirroring the Avatars Add-a-Look picker (UgcAvatarsPage).
  const MAX_GRIP_EXAMPLES = 5;
  const gripExamples = ad.gripExampleImages ?? [];
  const productReferenceImages = productForImages?.product_reference_images ?? [];
  const gripExampleInputRef = useRef<HTMLInputElement | null>(null);

  const addGripExampleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        // Functional form: merge into the LATEST list so multi-file uploads
        // (one onload per file) don't clobber each other.
        onChange((cur) => {
          const prev = cur.gripExampleImages ?? [];
          return prev.length >= MAX_GRIP_EXAMPLES || prev.includes(url)
            ? {}
            : { gripExampleImages: [...prev, url] };
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleGripExample = (url: string) =>
    onChange((cur) => {
      const prev = cur.gripExampleImages ?? [];
      return prev.includes(url)
        ? { gripExampleImages: prev.filter((u) => u !== url) }
        : prev.length >= MAX_GRIP_EXAMPLES
          ? {}
          : { gripExampleImages: [...prev, url] };
    });

  // Transient per-avatar "generating" flags driving the P1–P5 skeletons.
  const [pipelineLoading, setPipelineLoading] = useState<Record<string, boolean>>({});

  // Fire the Generate Scene pipeline for one avatar: POST the per-clip
  // scenery/scene + chosen product image, then map the 5 returned Drive
  // fileIds into the ad's pipelineImages so the cards (and submit) use them.
  const generateScene = async (avatar: AvatarOption) => {
    const ps = ad.pipelineScenes;
    if (!ps) {
      toast({ title: "No scene visuals", description: "This script has no parsed scene descriptions to generate from.", variant: "destructive" });
      return;
    }
    if (!ad.productImageUrl) {
      toast({ title: "Pick a product image", description: "Select a product image before generating scenes.", variant: "destructive" });
      return;
    }
    if (!avatar.image_url) {
      toast({ title: "Avatar has no image", description: `${avatar.name} has no image to generate from.`, variant: "destructive" });
      return;
    }
    setPipelineLoading((m) => ({ ...m, [avatar.id]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/generate-pipeline-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarUrl: avatar.image_url,
          productUrl: ad.productImageUrl,
          imageModel: ad.imageModel ?? "gemini",
          // Real holding examples ride along as extra GPT references (P5 grip
          // sheet). GPT-only: don't send them on gemini runs (mirrors Add-a-Look).
          ...(ad.imageModel === "gpt" && (ad.gripExampleImages?.length ?? 0) > 0
            ? { gripExampleImages: ad.gripExampleImages }
            : {}),
          scenes: {
            p1: { scenery: ps.p1.scenery, scene: ps.p1.scene },
            p2: { scenery: ps.p2.scenery, scene: ps.p2.scene },
            p3: { scenery: ps.p3.scenery, scene: ps.p3.scene },
            p4: { scenery: ps.p4.scenery },
            p5: { scenery: ps.p5.scenery },
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Scene generation failed.");
      }
      const images: Array<{ index: number; fileName: string; fileId: string }> = data?.data?.images ?? [];
      const next: PipelineImageSet = {};
      const slots: Array<keyof PipelineImageSet> = ["p1", "p2", "p3", "p4", "p5"];
      for (const img of images) {
        // Prefer the fileName (P1.png → p1); fall back to 1-based index.
        const fromName = (img.fileName || "").replace(/\.[a-z0-9]+$/i, "").toLowerCase();
        const key = (slots.includes(fromName as keyof PipelineImageSet)
          ? fromName
          : slots[(img.index ?? 0) - 1]) as keyof PipelineImageSet | undefined;
        if (key && slots.includes(key)) next[key] = img.fileId;
      }
      // Functional form: merge into the LATEST pipelineImages, not the stale
      // closure, so generating scenes for multiple avatars doesn't drop earlier
      // avatars' images.
      onChange((cur) => ({ pipelineImages: { ...cur.pipelineImages, [avatar.id]: next } }));
      toast({ title: "Scenes generated", description: `${images.length} image${images.length === 1 ? "" : "s"} ready for ${avatar.name}.` });
    } catch (err) {
      toast({ title: "Generate failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setPipelineLoading((m) => ({ ...m, [avatar.id]: false }));
    }
  };

  // ── Format-04 ("Animated Characters") per-character image workspace ────────
  // Each handler targets EXACTLY ONE character (by index) and updates state
  // immutably via the functional onChange form, so regenerating one character /
  // scene never wipes the others' images or status (the single-vs-multi
  // correctness requirement). All image generation goes through GPT
  // (generateImageOpenAI / gpt-image-2) on the backend — no Gemini.
  //
  // Immutably patch one character entry by index, preserving all other entries.
  const patchAnimatedChar = (
    index: number,
    patch: Partial<NonNullable<AdState["animatedChars"]>[number]>,
  ) =>
    onChange((cur) => {
      const list = cur.animatedChars ?? [];
      return {
        animatedChars: list.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      };
    });

  // Generate (or regenerate) the character image for one cast member. The brand
  // (last) character is generated USING its picked product image.
  const genAnimatedCharacter = async (index: number) => {
    const c = (ad.animatedChars ?? [])[index];
    if (!c) return;
    if (c.isBrand && !c.brandImageUrl) {
      toast({ title: "Pick a product image", description: "The brand character is generated from a product image — pick one first.", variant: "destructive" });
      return;
    }
    patchAnimatedChar(index, { characterStatus: "loading" });
    try {
      const { url } = await generateAnimatedCharacter({
        characterConcept: c.characterConcept,
        role: c.role,
        identifier: c.identifier,
        productImage: c.isBrand ? c.brandImageUrl : undefined,
      });
      patchAnimatedChar(index, { characterImageUrl: url, characterStatus: "done" });
    } catch (err) {
      patchAnimatedChar(index, { characterStatus: "error" });
      toast({ title: "Character generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // Generate (or regenerate) the scene image for one cast member, using that
  // character's just-generated character image. Enabled once the character image
  // exists. The brand character also passes its product image through.
  const genAnimatedScene = async (index: number) => {
    const c = (ad.animatedChars ?? [])[index];
    if (!c) return;
    if (!c.characterImageUrl) {
      toast({ title: "Generate the character first", description: "The scene is built from the character image — generate the character before the scene.", variant: "destructive" });
      return;
    }
    patchAnimatedChar(index, { sceneStatus: "loading" });
    try {
      const { url } = await generateAnimatedScene({
        firstFramePrompt: c.firstFramePrompt,
        visual: c.visual,
        characterConcept: c.characterConcept,
        characterImage: c.characterImageUrl,
        spokenLine: c.spokenLine,
        productImage: c.isBrand ? c.brandImageUrl : undefined,
      });
      patchAnimatedChar(index, { sceneImageUrl: url, sceneStatus: "done" });
    } catch (err) {
      patchAnimatedChar(index, { sceneStatus: "error" });
      toast({ title: "Scene generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // ── "Generate all" — fan every character / scene out in PARALLEL ───────────
  // Each Promise.all entry calls the same single-target handler, which patches
  // ONLY its own index immutably (functional onChange), so concurrent
  // generations never clobber each other's image or status.
  const [bulkCharLoading, setBulkCharLoading] = useState(false);
  const [bulkSceneLoading, setBulkSceneLoading] = useState(false);

  // Generate ALL character images at once. The brand (last) character needs a
  // product image first, so it's skipped (with a note) until one is picked.
  const genAllCharacters = async () => {
    const cast = ad.animatedChars ?? [];
    const targets = cast
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !(c.isBrand && !c.brandImageUrl));
    if (targets.length === 0) {
      toast({ title: "Pick a product image", description: "The only character is the brand — pick its product image first.", variant: "destructive" });
      return;
    }
    const skipped = cast.length - targets.length;
    setBulkCharLoading(true);
    try {
      await Promise.all(targets.map(({ i }) => genAnimatedCharacter(i)));
      if (skipped > 0) {
        toast({ title: "Brand character skipped", description: "Pick a product image for the brand character, then generate it." });
      }
    } finally {
      setBulkCharLoading(false);
    }
  };

  // Generate ALL scenes at once, for every character whose character image is
  // ready (a scene is built from its character image).
  const genAllScenes = async () => {
    const cast = ad.animatedChars ?? [];
    const targets = cast.map((c, i) => ({ c, i })).filter(({ c }) => !!c.characterImageUrl);
    if (targets.length === 0) {
      toast({ title: "Generate characters first", description: "Generate the character images before their scenes.", variant: "destructive" });
      return;
    }
    setBulkSceneLoading(true);
    try {
      await Promise.all(targets.map(({ i }) => genAnimatedScene(i)));
    } finally {
      setBulkSceneLoading(false);
    }
  };

  // When the ad's mode changes, drop committed picks so the auto-fill effect
  // re-seeds from the new mode's avatar pool. Product changes are handled at
  // the page level; this covers the per-ad axis.
  const prevModeRef = useRef(ad.mode);
  useEffect(() => {
    if (prevModeRef.current === ad.mode) return;
    prevModeRef.current = ad.mode;
    onChange({ manualAvatarIds: [], randomAvatarIds: [], selectedLooks: {} });
  }, [ad.mode, onChange]);

  const eligible = useMemo(() => {
    if (ad.allowedAvatarTypes.length === 0) return avatars;
    const set = new Set(ad.allowedAvatarTypes);
    return avatars.filter((a) => set.has(a.type as AvatarTypeId));
  }, [avatars, ad.allowedAvatarTypes]);

  const previewPicked = useMemo(() => {
    const ids = ad.randomAvatars ? ad.randomAvatarIds : ad.manualAvatarIds;
    return ids
      .map((id) => avatars.find((a) => a.id === id))
      .filter((a): a is AvatarOption => !!a);
  }, [ad.randomAvatars, ad.randomAvatarIds, ad.manualAvatarIds, avatars]);

  // The avatar filming the hook, resolved for the confirmation line above the
  // grid. undefined when nothing is picked yet, or when a previously-saved id
  // is no longer in this product's list (submit already errors on that).
  // Plain find, not useMemo — one lookup over a short list, and memoising it
  // would just add another consumer to the `avatars` identity warning above.
  const hookAvatarPicked = ad.hookAvatarId
    ? avatars.find((a) => a.id === ad.hookAvatarId)
    : undefined;

  // Auto-fill random picks so scenes can load without the user needing to
  // click refresh first. Tops up randomAvatarIds to match avatarsCount when
  // short (e.g. on first mount, after switching modes, or after a type change
  // cleared the previous picks).
  useEffect(() => {
    if (!ad.randomAvatars) return;
    if (eligible.length === 0) return;
    if (ad.randomAvatarIds.length >= ad.avatarsCount) return;
    const available = eligible.filter((e) => !ad.randomAvatarIds.includes(e.id));
    if (available.length === 0) return;
    const needed = Math.min(ad.avatarsCount - ad.randomAvatarIds.length, available.length);
    const newPicks = pickRandom(available, needed).map((a) => a.id);
    if (newPicks.length === 0) return;
    onChange({ randomAvatarIds: [...ad.randomAvatarIds, ...newPicks] });
  }, [eligible.length, ad.avatarsCount, ad.randomAvatars, ad.randomAvatarIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Assign a concrete look to each selected avatar as soon as it's picked, and
  // prune entries for avatars no longer selected. This means the "See selected
  // looks" modal always shows a real, highlighted selection (which the user can
  // override) rather than deferring a random pick to submit time. Re-assigns
  // when a stored look is no longer valid for the current product/mode.
  useEffect(() => {
    if (avatars.length === 0) return; // wait for the avatar pool to load
    const ids = ad.randomAvatars ? ad.randomAvatarIds : ad.manualAvatarIds;
    const cur = ad.selectedLooks || {};
    const next: Record<string, string> = {};
    for (const id of ids) {
      const av = avatars.find((a) => a.id === id);
      if (!av?.looks?.length) continue;
      const existing = cur[id];
      next[id] = existing && av.looks.some((g) => lookUid(g) === existing)
        ? existing
        : lookUid(pickRandom(av.looks, 1)[0]);
    }
    const curKeys = Object.keys(cur);
    const nextKeys = Object.keys(next);
    const unchanged = curKeys.length === nextKeys.length && nextKeys.every((k) => cur[k] === next[k]);
    if (!unchanged) onChange({ selectedLooks: next });
  }, [ad.randomAvatars, ad.randomAvatarIds, ad.manualAvatarIds, avatars]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stale-reference pruning after an Edit & Regenerate restore (86caug6v1).
  //
  // A snapshot pins avatar ids, but avatars get deleted and looks get re-shot. Left alone,
  // a dead id survives all the way into submit(), which throws
  //   "Avatar <raw-uuid> no longer in the product list — re-pick avatars."
  // — an error naming a bare uuid, raised only AFTER the user has finished editing. Pruning
  // here instead means the form is honest the moment it opens.
  //
  // Runs at most once per card, only for a restored ad, and only once the pool has actually
  // loaded (an empty pool means "still fetching", not "every avatar was deleted").
  const stalePrunedRef = useRef(false);
  useEffect(() => {
    if (!checkStaleRefs || stalePrunedRef.current) return;
    if (avatars.length === 0) return;
    stalePrunedRef.current = true;

    const known = new Set(avatars.map((a) => a.id));
    const dropped = [...ad.manualAvatarIds, ...ad.randomAvatarIds].filter((id) => !known.has(id));
    if (dropped.length === 0) return;

    const prunedSpeeds = { ...ad.avatarSpeeds };
    const prunedLooks = { ...ad.selectedLooks };
    for (const id of dropped) {
      delete prunedSpeeds[id];
      delete prunedLooks[id];
    }
    onChange({
      manualAvatarIds: ad.manualAvatarIds.filter((id) => known.has(id)),
      randomAvatarIds: ad.randomAvatarIds.filter((id) => known.has(id)),
      avatarSpeeds: prunedSpeeds,
      selectedLooks: prunedLooks,
    });
    onStaleRefsPruned(dropped);
  }, [checkStaleRefs, avatars.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Includes the optional hook's words — it is spoken in the finished file.
  const words = spokenWordsForAd(ad);
  const seconds = secondsForWords(words);
  // When Applovin is in the platform mix the cap is enforced regardless of
  // the per-ad toggle — Applovin doesn't accept >60s creatives.
  const effectivelyCapped = applovinSelected || !ad.allowUnlimitedLength;
  const overCap = effectivelyCapped && seconds > 60;

  const toggleType = (t: AvatarTypeId) => {
    // Clear committed random picks so auto-init re-picks from the new eligible pool.
    const base = { randomAvatarIds: [] as string[] };
    if (ad.allowedAvatarTypes.includes(t)) {
      onChange({ ...base, allowedAvatarTypes: ad.allowedAvatarTypes.filter((x) => x !== t) });
    } else {
      onChange({ ...base, allowedAvatarTypes: [...ad.allowedAvatarTypes, t] });
    }
  };

  // Selected avatar ids — used for the preview row, the looks modal, and the
  // submit-time look-group pick.
  const selectedAvatarIds = ad.randomAvatars ? ad.randomAvatarIds : ad.manualAvatarIds;
  const [looksOpen, setLooksOpen] = useState(false);
  // "Expand" on the hook-avatar strip — the inline grid stays deliberately small
  // so it doesn't push the scripts down; this opens the full list at a size you
  // can actually read faces at.
  const [hookAvatarsOpen, setHookAvatarsOpen] = useState(false);

  // Parent asks us to open the looks picker (e.g. submit found missing Advance
  // Script scenes for this ad). Open once, then clear the signal.
  useEffect(() => {
    if (!autoOpenLooks) return;
    setLooksOpen(true);
    onAutoOpenConsumed();
  }, [autoOpenLooks, onAutoOpenConsumed]);

  // ── Format-04 ("Animated Characters") branch ──────────────────────────────
  // An entirely separate, image-only card: the per-character cast workspace
  // replaces the concept input / ModeToggle / Length sub-toggle / LengthMeter /
  // P1-P2 ScriptFields / StaticBarEditor, and the Avatar config + looks blocks
  // are not rendered at all (no empty/dead UI). Returns early so none of the
  // avatar-driven classic body below mounts for 04.
  if (ad.isAnimatedChars) {
    const cast = ad.animatedChars ?? [];
    const meta = ad.animatedMeta ?? {};
    return (
      <article className="rounded-2xl border border-border/85 bg-card/70 backdrop-blur-sm overflow-hidden">
        {/* Header — locked "Animated Characters" chip (single label source) +
            storyboard meta summary. No editable concept / mode toggle. */}
        <header className="px-5 py-3 flex items-center gap-3 border-b border-border/85">
          <div className="size-7 rounded-md bg-primary/10 text-primary text-[11px] font-mono font-semibold tabular-nums flex items-center justify-center shrink-0">
            {String(idx + 1).padStart(2, "0")}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Locked mode chip — NOT a clickable toggle. */}
              <span
                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] rounded-md border border-border/85 bg-muted/30 text-muted-foreground"
                title="This batch was handed off from a Format-04 chat — the ad mode is locked to Animated Characters."
                data-testid={`animated-mode-chip-${idx}`}
              >
                <Lock className="size-3" />
                <span className="text-foreground">{ANIMATED_MODE_LABEL}</span>
              </span>
              {ad.source === "chat" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-medium tracking-wide text-primary">
                  <MessageSquare className="size-2.5" />
                  Imported from chat
                </span>
              )}
            </div>
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[10.5px] text-muted-foreground/80">
              {meta.characterCount && <span>{meta.characterCount} characters</span>}
              {meta.estimatedSeconds && <span>~{meta.estimatedSeconds}s</span>}
              {meta.totalSpokenWords && <span>{meta.totalSpokenWords} words</span>}
              {meta.chosenFramework && <span className="truncate">{meta.chosenFramework}</span>}
            </div>
          </div>
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              className="size-9 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
              title="Remove ad"
              data-testid={`ad-remove-${idx}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </header>

        {/* Body — one workspace card per character. */}
        <div className="px-5 py-4 space-y-3">
          {/* Bulk actions — generate every character / every scene in parallel. */}
          {cast.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pb-1">
              <button
                type="button"
                onClick={genAllCharacters}
                disabled={bulkCharLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 hover:bg-primary/15 px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`animated-gen-all-characters-${idx}`}
                title="Generate every character image in parallel (the brand character needs a product image first)"
              >
                {bulkCharLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {bulkCharLoading ? "Generating characters…" : "Generate all characters"}
              </button>
              <button
                type="button"
                onClick={genAllScenes}
                disabled={bulkSceneLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 hover:bg-primary/15 px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`animated-gen-all-scenes-${idx}`}
                title="Generate a scene for every character that already has a character image, in parallel"
              >
                {bulkSceneLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
                {bulkSceneLoading ? "Generating scenes…" : "Generate all scenes"}
              </button>
            </div>
          )}
          {meta.mainPain && (
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground">
              <span className="font-medium text-foreground">Main pain · </span>{meta.mainPain}
            </div>
          )}
          {cast.length === 0 && (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-[12px] text-muted-foreground text-center">
              No characters in this storyboard — rebuild it from the script chat.
            </div>
          )}
          {cast.map((c, ci) => {
            const charLoading = c.characterStatus === "loading";
            const sceneLoading = c.sceneStatus === "loading";
            const charReady = !!c.characterImageUrl;
            return (
              <div
                key={ci}
                className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5"
                data-testid={`animated-char-${idx}-${ci}`}
              >
                {/* Character heading + script alongside */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 shrink-0">
                      {ci + 1}
                    </span>
                    <span className="text-[13px] font-semibold truncate">
                      {c.identifier || c.role || `Character ${ci + 1}`}
                    </span>
                    {c.isBrand && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-400 shrink-0">
                        <Sparkles className="size-2.5" />
                        Brand
                      </span>
                    )}
                    {c.durationS && (
                      <span className="text-[10px] text-muted-foreground/75 shrink-0">~{c.durationS}s</span>
                    )}
                  </div>
                </div>

                {/* The character's script — concept / spoken line / visual / voice. */}
                <div className="space-y-1.5 text-[12px] leading-relaxed">
                  {c.characterConcept && (
                    <p><span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Character · </span>{c.characterConcept}</p>
                  )}
                  {c.spokenLine && (
                    <p className="text-foreground"><span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Line · </span>“{c.spokenLine}”</p>
                  )}
                  {c.firstFramePrompt && (
                    <p className="text-muted-foreground"><span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">First frame · </span>{c.firstFramePrompt}</p>
                  )}
                  {c.visual && (
                    <p className="text-muted-foreground/85"><span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Motion · </span>{c.visual}</p>
                  )}
                  {c.voiceTone && (
                    <p className="text-muted-foreground/85"><span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Voice · </span>{c.voiceTone}</p>
                  )}
                </div>

                {/* Brand (last) character only — product-image picker. The brand
                    character image is generated USING the picked product image.
                    Reuses the same useProducts product_images feed + inline
                    thumbnail-grid pattern as the Unique Intro picker. */}
                {c.isBrand && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Product image — the brand character is generated from this
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap" title="Product image used to generate the brand character">
                      {!allProducts ? (
                        <span className="text-[10px] text-muted-foreground italic">Loading images…</span>
                      ) : productImages.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground italic">No product images</span>
                      ) : (
                        productImages.map((img) => {
                          const sel = c.brandImageUrl === img.image_url;
                          return (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => patchAnimatedChar(ci, { brandImageUrl: img.image_url })}
                              className={`relative w-12 h-16 rounded overflow-hidden border-2 transition-colors ${
                                sel ? "border-primary ring-1 ring-primary/40" : "border-transparent hover:border-muted-foreground/40"
                              }`}
                              data-testid={`animated-product-image-${idx}-${ci}-${img.id}`}
                            >
                              <img src={img.image_url} alt={img.explanation || "Product"} className="w-full h-full object-cover" loading="lazy" />
                              {sel && (
                                <span className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                  <Check className="size-3.5 text-white drop-shadow" />
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Generate actions + image previews */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => genAnimatedCharacter(ci)}
                    disabled={charLoading || (c.isBrand && !c.brandImageUrl)}
                    title={c.isBrand && !c.brandImageUrl ? "Pick a product image first" : charReady ? "Regenerate this character image" : "Generate this character image"}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid={`animated-gen-character-${idx}-${ci}`}
                  >
                    {charLoading ? <Loader2 className="size-3.5 animate-spin" /> : charReady ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                    {charLoading ? "Generating…" : charReady ? "Regenerate character" : "Generate character"}
                  </button>
                  <button
                    type="button"
                    onClick={() => genAnimatedScene(ci)}
                    disabled={sceneLoading || !charReady}
                    title={!charReady ? "Generate the character first" : c.sceneImageUrl ? "Regenerate this scene image" : "Generate this scene image"}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid={`animated-gen-scene-${idx}-${ci}`}
                  >
                    {sceneLoading ? <Loader2 className="size-3.5 animate-spin" /> : c.sceneImageUrl ? <RefreshCw className="size-3.5" /> : <Video className="size-3.5" />}
                    {sceneLoading ? "Generating…" : c.sceneImageUrl ? "Regenerate scene" : "Generate scene"}
                  </button>
                </div>

                {/* Character + scene image slots — grouped side by side, each a
                    small 9:16 thumbnail. Flex (not a full-width 2-col grid) so they
                    sit next to each other instead of spreading across the card. */}
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Character", loading: charLoading, url: c.characterImageUrl, err: c.characterStatus === "error" },
                    { label: "Scene", loading: sceneLoading, url: c.sceneImageUrl, err: c.sceneStatus === "error" },
                  ].map((slot) => (
                    <div key={slot.label} className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{slot.label}</span>
                      <div className="h-40 aspect-[9/16] rounded-md overflow-hidden bg-muted">
                        {slot.loading ? (
                          <Skeleton className="w-full h-full rounded-md" />
                        ) : slot.url ? (
                          <img src={driveProxyFull(slot.url)} alt={slot.label} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <div className={`w-full h-full border border-dashed rounded-md flex flex-col items-center justify-center gap-1 ${slot.err ? "border-destructive/50 text-destructive/70" : "border-border/70 text-muted-foreground/60"}`}>
                            {slot.err ? <AlertTriangle className="size-4" /> : <Sparkles className="size-4" />}
                            <span className="text-[9px]">{slot.err ? "Failed — retry" : `No ${slot.label.toLowerCase()} yet`}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-border/85 bg-card/70 backdrop-blur-sm overflow-hidden">
      {/* Header — concept name doubles as the ad's identity. */}
      <header className="px-5 py-3 flex items-center gap-3 border-b border-border/85">
        <div className="size-7 rounded-md bg-primary/10 text-primary text-[11px] font-mono font-semibold tabular-nums flex items-center justify-center shrink-0 mt-1">
          {String(idx + 1).padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
              Concept name
              <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">flows into the ClickUp task, Drive folder, brief doc, and Frame.io names</span>
            </Label>
            {ad.source === "chat" && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-medium tracking-wide text-primary"
                title="This ad was handed off from a chat — the script body is locked-from-chat"
              >
                <MessageSquare className="size-2.5" />
                Imported from chat
              </span>
            )}
          </div>
          <div className="flex items-stretch gap-2">
            <Input
              value={ad.concept}
              onChange={(e) => onChange({ concept: e.target.value })}
              placeholder={`e.g. BL_sock_swelling — short, slug-style`}
              className="h-9 text-[14px] font-semibold flex-1"
              data-testid={`ad-concept-${idx}`}
            />
          </div>
        </div>
        <div className="flex flex-col shrink-0">
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
            Mode
          </Label>
          {ad.modeLocked ? (
            <div className="inline-flex items-center gap-1.5 h-9 px-2.5 text-[11px] rounded-md border border-border/85 bg-muted/30 text-muted-foreground" title="Mode is locked because this ad came from chat — the script was authored with this structure">
              <Lock className="size-3" />
              <span className="text-foreground">
                {ad.isAnimatedChars
                  ? ANIMATED_MODE_LABEL
                  : ad.isUniqueIntro
                  ? (ad.formatLabel || "Unique Intro")
                  : ad.mode === "combination"
                  ? `Classic UGC ${ad.lengthTarget === "4-18min" ? "4-18 min" : ad.lengthTarget === "1-4min" ? "1-4 min" : "60s"}`
                  : ad.mode === "with" ? "With product" : "No product"}
              </span>
            </div>
          ) : (
            <ModeToggle value={ad.mode} onChange={(m) => onChange({ mode: m })} />
          )}
        </div>
        {/* Length sub-toggle — only when Classic UGC is selected. Modes
            "with"/"without" don't have a length variant. Hidden when mode is
            locked since the chat ad's length variant is already fixed. */}
        {ad.mode === "combination" && !ad.modeLocked && (
          <div className="flex flex-col shrink-0">
            <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
              Length
            </Label>
            <LengthTargetToggle
              value={ad.lengthTarget}
              onChange={(lt) => onChange({
                lengthTarget: lt,
                // Toggling to "1-4 min" implicitly unlocks the 60s cap (the
                // format is by definition over 60s). Toggling back to "60s"
                // resets the unlock + clears M1/M2 — they're invalid in 60s
                // and the validator would 400 if they leaked into the payload.
                ...(lt === "1-4min"
                  ? { allowUnlimitedLength: true }
                  : { m1Text: "", m2Text: "", allowUnlimitedLength: false }),
              })}
            />
          </div>
        )}
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="size-9 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 mt-5"
            title="Remove ad"
            data-testid={`ad-remove-${idx}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </header>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">

        {/* Length toggle + word count */}
        <LengthMeter
          words={words}
          seconds={seconds}
          allowUnlimited={ad.allowUnlimitedLength}
          forceCap={applovinSelected}
          onChange={(allow) => onChange({ allowUnlimitedLength: allow })}
        />

        {/* Script textareas */}
        {/* Optional hook (ClickUp 86caz3tkg) — sits ABOVE every other script box
            because it is filmed as clip #1, in front of the whole ad. It has its
            OWN avatar: the person building the ad picks who films it, and it is
            deliberately NOT assumed to be the body avatar. Off by default; a
            manually-created ad can switch it on here. Not offered for Unique
            Intro (Format-02), whose clips run through a different pipeline. */}
        {!ad.isUniqueIntro && (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={ad.hookEnabled}
                onCheckedChange={(v) => onChange({ hookEnabled: v === true })}
                data-testid={`ad-hook-toggle-${idx}`}
              />
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">With hook</span>
              <span className="text-[10.5px] text-muted-foreground/75 normal-case">
                A short attention-grabber filmed as its own clip and played first
              </span>
            </label>
            {ad.hookEnabled && (
              <div className="space-y-3 pt-1">
                <ScriptField
                  label="Hook"
                  sublabel="Spoken FIRST, in front of the ad — 1-2 sentences"
                  value={ad.hookText}
                  onChange={(v) => onChange({ hookText: v })}
                  testId={`ad-hook-${idx}`}
                />
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">Hook avatar</Label>
                    <span className="text-[10.5px] text-muted-foreground/75 normal-case">
                      Can be a different person from the ad's avatar
                    </span>
                    {/* Echo the choice as text too — the tile caption is small,
                        and this is the line the user scans to confirm the pick. */}
                    {hookAvatarPicked && (
                      <span className="text-[10.5px] text-primary font-medium normal-case ml-auto">
                        Filming the hook: {hookAvatarPicked.name}
                      </span>
                    )}
                  </div>
                  {/* Full avatar list, NOT `eligible` — the body's allowed-types
                      filter deliberately doesn't constrain who films the hook. */}
                  <HookAvatarGrid
                    dense
                    options={avatars}
                    picked={ad.hookAvatarId}
                    onPick={(id) => onChange({ hookAvatarId: id })}
                    testId={`ad-hook-avatar-${idx}`}
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {!ad.hookAvatarId ? (
                      <p className="text-[10.5px] text-muted-foreground/75">Pick who films the hook.</p>
                    ) : <span />}
                    <button
                      type="button"
                      onClick={() => setHookAvatarsOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors ml-auto"
                      data-testid={`ad-hook-avatar-expand-${idx}`}
                    >
                      <Maximize2 className="size-3" />
                      Expand · see all {avatars.length}
                    </button>
                  </div>
                  <HookAvatarDialog
                    open={hookAvatarsOpen}
                    onOpenChange={setHookAvatarsOpen}
                    options={avatars}
                    picked={ad.hookAvatarId}
                    onPick={(id) => onChange({ hookAvatarId: id })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {/* Advanced Intro scripts — only for Unique Intro (Format 02) ads. The 3
            spoken callout lines from the Advanced Intro section, one per intro
            scene. Each line is the actual script sent to HeyGen. Prefilled from
            the chat handoff; editable. Sits above the P1 / first script field. */}
        {ad.isUniqueIntro && [0, 1, 2].map((i) => (
          <ScriptField
            key={i}
            label={`P${i + 1}`}
            sublabel="Advanced intro spoken line — the words the avatar says"
            value={ad.advanceScripts[i] ?? ""}
            onChange={(v) => {
              const next = [...ad.advanceScripts];
              next[i] = v;
              onChange({ advanceScripts: next });
            }}
            testId={`ad-advance-script-${idx}-${i}`}
          />
        ))}
        {ad.mode === "without" && (
          <ScriptField
            label="Script (no product on screen)"
            sublabel="Hands-free delivery — bottle not visible"
            value={ad.withoutProductText}
            onChange={(v) => onChange({ withoutProductText: v })}
            testId={`ad-without-${idx}`}
          />
        )}
        {ad.mode === "with" && (
          <ScriptField
            label="Script (holding the product)"
            sublabel="With the bottle in frame from the first second"
            value={ad.withProductText}
            onChange={(v) => onChange({ withProductText: v })}
            testId={`ad-with-${idx}`}
          />
        )}
        {ad.mode === "combination" && (
          <div className="space-y-3">
            <ScriptField
              label={ad.isUniqueIntro ? "P4 · without product" : ad.lengthTarget === "4-18min" ? "HOOK · without product" : "P1 · without product"}
              sublabel="Hands-free hook — avatar's without-product scene"
              value={ad.withoutProductText}
              onChange={(v) => onChange({ withoutProductText: v })}
              testId={`ad-p1-${idx}`}
            />
            {/* Format-08 MODULE beats — only when length is "4-18min". One
                textarea per MODULE, in order; all hands-free (same scene as
                the HOOK). The REVEAL (P2 field below) is the with-product
                clip. See server-only/skills/08-classic-ugc-4-to-18min/skill.md. */}
            {ad.lengthTarget === "4-18min" && (
              <>
                {ad.moduleTexts.map((moduleText, mi) => (
                  <div key={mi} className="space-y-1">
                    <ScriptField
                      label={`MODULE ${mi + 1} · hands-free`}
                      sublabel="One self-contained beat — same scene as the HOOK."
                      value={moduleText}
                      onChange={(v) => {
                        const next = [...ad.moduleTexts];
                        next[mi] = v;
                        onChange({ moduleTexts: next });
                      }}
                      testId={`ad-module-${idx}-${mi}`}
                    />
                    {!moduleText && (
                      <button
                        type="button"
                        onClick={() => onChange({ moduleTexts: ad.moduleTexts.filter((_, i) => i !== mi) })}
                        className="mt-1 text-[10.5px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        data-testid={`ad-remove-module-${idx}-${mi}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => onChange({ moduleTexts: [...ad.moduleTexts, ""] })}
                  data-testid={`ad-add-module-${idx}`}
                >
                  <Plus className="size-3" />
                  Add MODULE {ad.moduleTexts.length + 1}
                </Button>
              </>
            )}
            {/* Format-05 middle beats — only when length is "1-4min".
                M1 deepens the mechanism / drops social proof / stacks symptoms.
                M2 lands the counter-objection, before/after, or rationale.
                Both stay hands-free (same scene as P1). M2 only enables once
                M1 is authored — long-band scripts never go P1 → M2 without M1.
                See server-only/skills/05-classic-ugc-1-to-4min/skill.md §5. */}
            {ad.lengthTarget === "1-4min" && (() => {
              // A beat is shown when it has authored text OR the operator
              // explicitly revealed it. Each beat hides/reveals independently.
              const m1Visible = !!ad.m1Text || showM1;
              const m2Visible = !!ad.m2Text || showM2;
              // Estimated spoken length from whatever is authored so far.
              const durationSec = secondsForWords(
                countWords(ad.withoutProductText) +
                  countWords(ad.m1Text) +
                  countWords(ad.m2Text) +
                  countWords(ad.withProductText),
              );
              // Small "Hide" link shown on an empty, manually-revealed beat so the
              // operator can collapse it again (authored text isn't hideable).
              const hideLink = (onClick: () => void, testId: string) => (
                <button
                  type="button"
                  onClick={onClick}
                  className="mt-1 text-[10.5px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  data-testid={testId}
                >
                  Hide
                </button>
              );
              return (
                <>
                  {/* M1 */}
                  {m1Visible ? (
                    <div className="space-y-1">
                      <ScriptField
                        label="M1 · middle beat (hands-free)"
                        sublabel="Optional · deepening beat — mechanism elaboration, social proof, or symptom stack. Same scene as P1."
                        value={ad.m1Text}
                        onChange={(v) => onChange({ m1Text: v })}
                        testId={`ad-m1-${idx}`}
                      />
                      {!ad.m1Text && hideLink(() => setShowM1(false), `ad-hide-m1-${idx}`)}
                    </div>
                  ) : (
                    <div
                      className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2.5"
                      data-testid={`ad-no-m1-${idx}`}
                    >
                      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                        This script doesn't have M1/M2 — length ≈{" "}
                        <span className="font-medium text-foreground tabular-nums">{durationSec}s</span>.
                        You can add them manually, or continue with P1 → P2 only.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 gap-1 text-[11px]"
                        onClick={() => setShowM1(true)}
                        data-testid={`ad-add-m1-${idx}`}
                      >
                        <Plus className="size-3" />
                        Add M1 · middle beat
                      </Button>
                    </div>
                  )}

                  {/* M2 — long-band only; needs M1 first. Hidden behind its own
                      "Add M2" reveal once M1 exists but M2 doesn't. */}
                  {m2Visible ? (
                    <div className="space-y-1">
                      <ScriptField
                        label={ad.m1Text ? "M2 · counter-objection / rationale (hands-free)" : "M2 · (disabled until M1 is set)"}
                        sublabel="Optional · long-band only. Counter-objection, before/after testimonial, or scientific rationale. Same scene as P1. Requires M1 to be set."
                        value={ad.m2Text}
                        onChange={(v) => (ad.m1Text ? onChange({ m2Text: v }) : undefined)}
                        testId={`ad-m2-${idx}`}
                      />
                      {!ad.m2Text && hideLink(() => setShowM2(false), `ad-hide-m2-${idx}`)}
                    </div>
                  ) : ad.m1Text ? (
                    <div
                      className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2.5"
                      data-testid={`ad-no-m2-${idx}`}
                    >
                      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                        No M2 on this script. Add a counter-objection / rationale beat, or continue without it.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 gap-1 text-[11px]"
                        onClick={() => setShowM2(true)}
                        data-testid={`ad-add-m2-${idx}`}
                      >
                        <Plus className="size-3" />
                        Add M2 · counter-objection
                      </Button>
                    </div>
                  ) : null}
                </>
              );
            })()}
            <ScriptField
              label={ad.isUniqueIntro ? "P5 · with product" : ad.lengthTarget === "4-18min" ? "REVEAL · with product" : "P2 · with product"}
              sublabel="Offer + CTA delivered with the product in frame — avatar's with-product scene"
              value={ad.withProductText}
              onChange={(v) => onChange({ withProductText: v })}
              testId={`ad-p2-${idx}`}
            />
            {/* HeyGen v2 API hard-caps each clip's input_text at 1500 chars.
                Surface the violation now so the operator trims before submit
                rather than getting a 400 from the server. (4-18 min renders
                via HeyGen Avatar IV instead — its per-scene limits are the
                dedicated block below, not this 1500-char cap.) */}
            {ad.lengthTarget !== "4-18min" && (() => {
              const HEYGEN_MAX = 1500;
              const offenders: string[] = [];
              if (ad.withoutProductText.length > HEYGEN_MAX) offenders.push(`P1 (${ad.withoutProductText.length})`);
              if (ad.lengthTarget === "1-4min" && ad.m1Text.length > HEYGEN_MAX) offenders.push(`M1 (${ad.m1Text.length})`);
              if (ad.lengthTarget === "1-4min" && ad.m2Text.length > HEYGEN_MAX) offenders.push(`M2 (${ad.m2Text.length})`);
              if (ad.withProductText.length > HEYGEN_MAX) offenders.push(`P2 (${ad.withProductText.length})`);
              if (!offenders.length) return null;
              return (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-center gap-2">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{`HeyGen caps each clip at ${HEYGEN_MAX} chars: ${offenders.join(", ")} over limit.`}</span>
                </div>
              );
            })()}
            {/* Format-08 per-clip limits — HeyGen Avatar IV renders each scene
                separately and caps ~5000 chars of script / ~3 minutes per
                render. Every clip (HOOK, each MODULE, REVEAL) is checked.
                >5000 chars also blocks submit (see validate()). */}
            {ad.lengthTarget === "4-18min" && (() => {
              const AVATAR_IV_MAX_CHARS = 5000;
              const AVATAR_IV_MAX_SEC = 180;
              const clips = [
                { label: "HOOK", text: ad.withoutProductText },
                ...ad.moduleTexts.map((t, i) => ({ label: `MODULE ${i + 1}`, text: t })),
                { label: "REVEAL", text: ad.withProductText },
              ];
              const overChars = clips
                .filter((c) => c.text.length > AVATAR_IV_MAX_CHARS)
                .map((c) => `${c.label} (${c.text.length} chars)`);
              // Spoken-pace estimate at ~2.6 w/s (the format's high band).
              const overTime = clips
                .filter((c) => c.text.length <= AVATAR_IV_MAX_CHARS)
                .filter((c) => Math.round(countWords(c.text) / 2.6) > AVATAR_IV_MAX_SEC)
                .map((c) => `${c.label} (~${Math.round(countWords(c.text) / 2.6)}s)`);
              if (!overChars.length && !overTime.length) return null;
              return (
                <>
                  {overChars.length > 0 && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-center gap-2">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span>{`HeyGen Avatar IV caps each scene at ${AVATAR_IV_MAX_CHARS} chars: ${overChars.join(", ")} over limit — submit is blocked until trimmed.`}</span>
                    </div>
                  )}
                  {overTime.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span>{`HeyGen Avatar IV renders top out around 3 minutes per scene: ${overTime.join(", ")} estimated over — consider splitting into another MODULE.`}</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {overCap && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-center gap-2">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              ~{seconds}s at 170 WPM — over the 60-second cap.
              {applovinSelected
                ? " Applovin won't accept this; trim, or switch Intended Platform to Meta-only on the top bar."
                : " Trim, or toggle \"Allow unlimited length\" above to override."}
            </span>
          </div>
        )}

        {/* V2 — Static title bar editor (with live preview + AI auto-suggest).
            Operator confirms the bar at the same step they confirm the script,
            per Liam's spec ("at the time of confirming the script we're going
            to have another field there"). */}
        <StaticBarEditor
          value={ad.staticBar}
          onChange={(v) => onChange({ staticBar: v })}
          scriptText={[ad.withoutProductText, ad.withProductText].filter(Boolean).join("\n\n")}
          productSlug={productSlug}
        />


        {/* Avatar config — disabled until a product is picked, since the avatar
            pool is loaded per product. */}
        <div
          className={`border-t border-border/85 pt-4 space-y-3 transition-opacity ${!productPicked ? "opacity-50 pointer-events-none select-none" : ""}`}
          data-missing-field={`ad-${idx}-avatars`}
        >
          <div className="flex items-center gap-2">
            <Hash className="size-3 text-muted-foreground" />
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              Avatar config
            </span>
            {!productPicked && (
              <span className="text-[10px] text-muted-foreground/75 normal-case">
                · pick a product first to choose avatars
              </span>
            )}
          </div>

          {/* Allowed types */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/80">Allowed types ·</span>
            {AVATAR_TYPES.map((t) => {
              const active = ad.allowedAvatarTypes.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? t.cls
                      : "border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && <Check className="size-2.5" />}
                  {t.label}
                </button>
              );
            })}
            <span className="text-[10.5px] text-muted-foreground/75 ml-1">
              {ad.allowedAvatarTypes.length === 0
                ? "(any type)"
                : `${eligible.length} eligible`}
            </span>
          </div>

          {/* Count + random/manual */}
          <div className="flex items-center gap-3 flex-wrap">
            {ad.randomAvatars ? (
              <div className="inline-flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Avatars per ad</span>
                <div className="inline-flex items-center rounded-md border border-border/85 overflow-hidden">
                  <button
                    type="button"
                    className="size-7 hover:bg-muted text-sm leading-none"
                    onClick={() => {
                      const nextCount = Math.max(1, ad.avatarsCount - 1);
                      if (nextCount === ad.avatarsCount) return;
                      onChange({
                        avatarsCount: nextCount,
                        randomAvatarIds: ad.randomAvatarIds.slice(0, nextCount),
                      });
                    }}
                  >−</button>
                  <div className="w-8 text-center text-[12.5px] tabular-nums">{ad.avatarsCount}</div>
                  <button
                    type="button"
                    className="size-7 hover:bg-muted text-sm leading-none"
                    onClick={() => {
                      const cap = Math.max(1, eligible.length);
                      const nextCount = Math.min(cap, ad.avatarsCount + 1);
                      if (nextCount === ad.avatarsCount) return;
                      // The auto-init effect will top-up randomAvatarIds for us.
                      onChange({ avatarsCount: nextCount });
                    }}
                  >+</button>
                </div>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{ad.manualAvatarIds.length}</span>{" "}
                avatar{ad.manualAvatarIds.length === 1 ? "" : "s"} selected
                <span className="ml-1 text-muted-foreground/75">(count adapts to selection)</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                if (ad.randomAvatars) {
                  // Switching → manual. Seed from random preview.
                  const seeded = previewPicked.map((a) => a.id);
                  onChange({
                    randomAvatars: false,
                    randomAvatarIds: [],
                    manualAvatarIds: seeded,
                    avatarsCount: seeded.length || 1,
                  });
                } else {
                  // Switching → random. The auto-fill effect will re-pick.
                  onChange({
                    randomAvatars: true,
                    randomAvatarIds: [],
                    avatarsCount: Math.max(1, ad.manualAvatarIds.length || 1),
                  });
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-md h-7 px-2.5 text-[11.5px] font-medium border transition-colors ${
                ad.randomAvatars
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shuffle className="size-3" />
              {ad.randomAvatars ? "Random pick" : "Manual pick"}
            </button>
          </div>

          {/* Picked / manual grid */}
          {ad.randomAvatars ? (
            <div className="flex items-center gap-2">
              <AvatarPreviewRow picked={previewPicked} requested={ad.avatarsCount} productPicked={productPicked} />
              <button
                type="button"
                title="Re-roll avatars"
                onClick={() => {
                  const next = pickRandom(eligible, ad.avatarsCount).map((a) => a.id);
                  onChange({ randomAvatarIds: next });
                }}
                className="shrink-0 size-7 rounded-md border border-border/85 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className="size-3.5" />
              </button>
            </div>
          ) : (
            <ManualAvatarGrid
              options={eligible}
              picked={ad.manualAvatarIds}
              onToggle={(id) => {
                const has = ad.manualAvatarIds.includes(id);
                const nextPicked = has
                  ? ad.manualAvatarIds.filter((x) => x !== id)
                  : [...ad.manualAvatarIds, id];
                onChange({
                  manualAvatarIds: nextPicked,
                  avatarsCount: nextPicked.length || 1,
                });
              }}
            />
          )}

          {/* Per-avatar voice speed — baked into the HeyGen render, so no
              post-generation speed-up pass is needed for slow talkers. */}
          {selectedAvatarIds.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                Voice speed
                <span className="ml-1 normal-case tracking-normal font-normal text-muted-foreground/70">
                  · applied at render time — no post-generation speed-up needed
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedAvatarIds.map((id) => {
                  const av = eligible.find((x) => x.id === id);
                  if (!av) return null;
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-md border border-border/80 bg-card/60 px-1.5 py-1 text-[11px]">
                      {av.image_url && (
                        <img src={av.image_url} alt={av.name} className="size-6 rounded object-cover" />
                      )}
                      <span className="font-medium truncate max-w-[110px]">{av.name}</span>
                      <VoiceSpeedSelect
                        value={ad.avatarSpeeds?.[id] ?? av.voice_speed ?? null}
                        onChange={(v) => {
                          const next = { ...(ad.avatarSpeeds || {}) };
                          if (v == null) delete next[id];
                          else next[id] = v;
                          onChange({ avatarSpeeds: next });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Looks. Unique Intro (A1/A2) uses an inline per-avatar panel with a
            Generate Scene action and five P1–P5 scene-slot placeholders; every
            other mode keeps the auto-picked looks + "See selected looks" modal. */}
        {selectedAvatarIds.length > 0 && (
          ad.isUniqueIntro ? (
            <div className="border-t border-border/85 pt-3 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="size-3 text-muted-foreground" />
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                  Scenes per avatar
                </span>
                <span className="text-[10px] text-muted-foreground/75 normal-case">
                  · one scene per clip — P1–P3 advanced intro, P4 without product, P5 with product
                </span>
                <div className="ml-auto inline-flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground/75">Image model</span>
                  <Select
                    value={ad.imageModel ?? "gemini"}
                    onValueChange={(v) => onChange({ imageModel: v as "gemini" | "gpt" })}
                  >
                    <SelectTrigger className="h-7 w-auto gap-1 text-[11px]" data-testid={`image-model-${ad.uid}`}>
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini — gemini-3-pro-image-preview</SelectItem>
                      <SelectItem value="gpt">GPT — gpt-image-2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* GPT-only: real holding examples — composited server-side into the
                  leak-proof grip reference sheet at P5 (mirrors Add-a-Look). The
                  gemini path ignores them, so hide the picker there. */}
              {(ad.imageModel ?? "gemini") === "gpt" && (
                <div className="space-y-1.5">
                  <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/85">
                    Real holding examples
                    <span className="ml-1 normal-case font-normal text-muted-foreground/70">
                      (optional, up to {MAX_GRIP_EXAMPLES}) — real photos of the product held in a hand; teaches the natural grip + true size. Used on the P5 scene only.
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap items-start">
                    {gripExamples.map((url) => (
                      <div key={url} className="relative">
                        <img src={url} alt="holding example" className="w-16 h-20 object-cover rounded-lg border-2 border-emerald-400/60" loading="lazy" />
                        <button
                          type="button"
                          onClick={() => toggleGripExample(url)}
                          aria-label="Remove example"
                          className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground ring-2 ring-card flex items-center justify-center hover:bg-destructive/90"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                    ))}
                    {gripExamples.length < MAX_GRIP_EXAMPLES && (
                      <button
                        type="button"
                        onClick={() => gripExampleInputRef.current?.click()}
                        className="w-16 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground"
                        data-testid={`grip-upload-${ad.uid}`}
                      >
                        <Plus className="size-4" />
                        <span className="text-[9px] font-medium">Upload</span>
                      </button>
                    )}
                    <input
                      ref={gripExampleInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => { addGripExampleFiles(e.target.files); e.target.value = ""; }}
                    />
                  </div>
                  {productReferenceImages.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground/70">
                        …or click a stored reference example (real holding photos from the product):
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {productReferenceImages.map((img) => (
                          <button
                            key={`grip-${img.id}`}
                            type="button"
                            onClick={() => toggleGripExample(img.image_url)}
                            className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                              gripExamples.includes(img.image_url)
                                ? "border-emerald-400/80 ring-1 ring-emerald-400/40"
                                : "border-transparent hover:border-muted-foreground/40"
                            }`}
                            data-testid={`grip-example-${ad.uid}-${img.id}`}
                          >
                            <img src={img.image_url} alt={img.explanation || ""} className="w-12 h-14 object-cover" loading="lazy" />
                            {gripExamples.includes(img.image_url) && (
                              <div className="absolute inset-0 bg-emerald-500/25 flex items-center justify-center">
                                <Check className="size-4 text-white drop-shadow" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {previewPicked.map((avatar) => {
                const genLoading = !!pipelineLoading[avatar.id];
                const genImages = ad.pipelineImages[avatar.id] ?? {};
                return (
                <div
                  key={avatar.id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-2.5"
                >
                  {/* Avatar row + product-image picker + Generate Scene */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-full bg-muted/40 overflow-hidden shrink-0">
                        {avatar.image_url && (
                          <img src={avatar.image_url} alt={avatar.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="text-[13px] font-semibold truncate">{avatar.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Product image picker — ad-level reference (productUrl) */}
                      <div className="flex items-center gap-1" title="Product image used as the generation reference">
                        {!allProducts ? (
                          <span className="text-[10px] text-muted-foreground italic">Loading images…</span>
                        ) : productImages.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">No product images</span>
                        ) : (
                          productImages.map((img) => {
                            const sel = ad.productImageUrl === img.image_url;
                            return (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => onChange({ productImageUrl: img.image_url })}
                                className={`relative w-12 h-16 rounded overflow-hidden border-2 transition-colors ${
                                  sel ? "border-primary ring-1 ring-primary/40" : "border-transparent hover:border-muted-foreground/40"
                                }`}
                                data-testid={`product-image-${ad.uid}-${img.id}`}
                              >
                                <img src={img.image_url} alt={img.explanation || "Product"} className="w-full h-full object-cover" loading="lazy" />
                                {sel && (
                                  <span className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <Check className="size-3.5 text-white drop-shadow" />
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => generateScene(avatar)}
                        disabled={genLoading || !ad.productImageUrl || !ad.pipelineScenes}
                        title={!ad.pipelineScenes ? "No scene descriptions in this script" : !ad.productImageUrl ? "Pick a product image first" : "Generate the 5 scene images"}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid={`generate-scene-${ad.uid}-${avatar.id}`}
                      >
                        {genLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        {genLoading ? "Generating…" : "Generate Scene"}
                      </button>
                    </div>
                  </div>
                  {/* P1–P5 scene slots — skeleton while generating, image when ready */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {[
                      { key: "p1", badge: "P1", label: "Advanced Intro · Scene 1" },
                      { key: "p2", badge: "P2", label: "Advanced Intro · Scene 2" },
                      { key: "p3", badge: "P3", label: "Advanced Intro · Scene 3" },
                      { key: "p4", badge: "P4", label: "Without product" },
                      { key: "p5", badge: "P5", label: "With product" },
                    ].map((slot) => {
                      const fileId = (genImages as PipelineImageSet)[slot.key as keyof PipelineImageSet];
                      return (
                      <div key={slot.key} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5">
                            {slot.badge}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">{slot.label}</span>
                        </div>
                        <div className="aspect-[3/4] rounded-md overflow-hidden bg-card/40">
                          {genLoading ? (
                            <Skeleton className="w-full h-full rounded-md" />
                          ) : fileId ? (
                            <img
                              src={driveProxySrc(fileId)}
                              alt={slot.label}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full border border-dashed border-border/70 rounded-md flex flex-col items-center justify-center gap-1 text-muted-foreground/60">
                              <Video className="size-4" />
                              <span className="text-[9px]">No scene yet</span>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="border-t border-border/85 pt-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
                  <Video className="size-3 mt-0.5 shrink-0" />
                  <span>A look is selected for each avatar — review or change them.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLooksOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary transition-colors"
                  data-testid="see-selected-looks"
                >
                  <Video className="size-3.5" />
                  See selected looks
                  <span className="relative ml-0.5 flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                </button>
              </div>
              <SelectedLooksModal
                open={looksOpen}
                onOpenChange={setLooksOpen}
                mode={ad.mode}
                avatars={previewPicked}
                selectedLooks={ad.selectedLooks || {}}
                onPick={(avatarId, lookId) => {
                  onChange({ selectedLooks: { ...(ad.selectedLooks || {}), [avatarId]: lookId } });
                }}
                isUniqueIntro={ad.isUniqueIntro}
                advanceScenes={ad.advanceScenes || {}}
                sceneOptionsByAvatar={advanceSceneOptions}
                onPickAdvance={(avatarId, slot, sceneId) => {
                  const cur = (ad.advanceScenes?.[avatarId] ?? ["", "", ""]).slice();
                  cur[slot] = sceneId;
                  onChange({ advanceScenes: { ...(ad.advanceScenes || {}), [avatarId]: cur } });
                }}
              />
            </div>
          )
        )}

        {/* Per-ad targeting metadata */}
        <div className="border-t border-border/85 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3 text-muted-foreground" />
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              Targeting metadata
            </span>
            <span className="text-[10px] text-muted-foreground/75 normal-case">
              · stored on the lineage row for analytics — different ads can target different people
            </span>
          </div>
          {/* Persona is hidden for the CS rollout. The value + push payload are
              kept — only the input is not rendered. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
                <span>
                  Angle
                  <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(optional — no targeting by default)</span>
                </span>
                <ManageBtn fieldKey="sub_angle" />
              </Label>
              <SoftSelect
                value={ad.subAngle}
                onChange={(v) => onChange({ subAngle: v })}
                options={subAngleOptions}
                placeholder={productPicked ? "None" : "Pick a product first"}
                disabled={!productPicked}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
                <span>
                  Sub-angle
                  <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(from CS KPIs)</span>
                </span>
              </Label>
              <SoftSelect
                value={ad.subAngleDetail}
                onChange={(v) => onChange({ subAngleDetail: v })}
                options={subAngleDetailOptions}
                placeholder={productPicked ? "None" : "Pick a product first"}
                disabled={!productPicked}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 flex items-center">
              <span>
                Main pains
                <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">(multi-select — which pains this ad addresses)</span>
              </span>
              <ManageBtn fieldKey="pains" />
            </Label>
            <ChipMultiSelect
              value={ad.mainPains}
              onChange={(v) => onChange({ mainPains: v })}
              options={painsOptions}
              placeholder={productPicked ? "Pick the pains this ad addresses" : "Pick a product first"}
              disabled={!productPicked}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function ModeToggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const opts: { id: Mode; label: string }[] = [
    { id: "without", label: "No product" },
    { id: "with", label: "With product" },
    { id: "combination", label: "Classic UGC" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-border/85 overflow-hidden h-7 text-[11px] font-medium">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-2.5 h-full transition-colors ${
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Visible only when mode === "combination" — picks between the 60s P1+P2 flow
// and the 1-4min flow (with optional M1/M2 hands-free middle beats).
function LengthTargetToggle({ value, onChange }: { value: LengthTarget; onChange: (lt: LengthTarget) => void }) {
  const opts: { id: LengthTarget; label: string }[] = [
    { id: "60s", label: "60s" },
    { id: "1-4min", label: "1-4 min" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-border/85 overflow-hidden h-7 text-[11px] font-medium" data-testid="length-target-toggle">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-2.5 h-full transition-colors ${
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            data-testid={`length-target-${o.id}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LengthMeter({
  words, seconds, allowUnlimited, forceCap, onChange,
}: {
  words: number;
  seconds: number;
  allowUnlimited: boolean;
  /** When true the under-60s cap is enforced regardless of allowUnlimited
   *  — used when Applovin is in the intended-platform mix. The toggle is
   *  disabled and shows a lock with copy explaining why. */
  forceCap?: boolean;
  onChange: (allow: boolean) => void;
}) {
  const pct = Math.min(100, (seconds / 60) * 100);
  const effectivelyCapped = forceCap || !allowUnlimited;
  const overCap = effectivelyCapped && seconds > 60;
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="text-muted-foreground">Length</span>
          <span className={`font-semibold tabular-nums ${overCap ? "text-destructive" : "text-foreground"}`}>
            {words}
          </span>
          <span className="text-muted-foreground">words</span>
          <span className="text-muted-foreground/65">·</span>
          <span className={`font-semibold tabular-nums ${overCap ? "text-destructive" : "text-foreground"}`}>
            ~{seconds}s
          </span>
          <span className="text-muted-foreground/75 text-[10.5px]">@ 170 WPM</span>
        </div>
        {forceCap ? (
          <span
            className="inline-flex items-center gap-1 rounded-md h-6 px-2 text-[10.5px] font-medium border border-border/85 bg-muted/30 text-muted-foreground"
            title="Applovin doesn't accept >60s creatives — the cap is enforced for this batch. Switch Intended Platform to Meta-only on the top bar to opt into long-form."
          >
            <Lock className="size-2.5" />
            Under 60s · Applovin
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onChange(!allowUnlimited)}
            className={`inline-flex items-center gap-1.5 rounded-md h-6 px-2 text-[10.5px] font-medium border transition-colors ${
              allowUnlimited
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-border/85 bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {allowUnlimited ? "Long-form allowed" : "Under 60s"}
          </button>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden relative">
        <div
          className={`h-full transition-all ${
            seconds > 60 ? "bg-destructive" : seconds > 45 ? "bg-amber-400" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
        {/* 60s tick */}
        {effectivelyCapped && (
          <div className="absolute top-0 bottom-0 right-0 w-px bg-foreground/40" title="60s cap" />
        )}
      </div>
      <div className="text-[10px] text-muted-foreground/75">
        Soft target {Math.round(SIXTY_SEC_LIMIT_WORDS * 0.88)} words ·{" "}
        Hard cap {SIXTY_SEC_LIMIT_WORDS} words at 60s
        {allowUnlimited && !forceCap && (
          <span className="text-amber-400/80"> · Cap disabled — long-form will keep generating</span>
        )}
        {forceCap && (
          <span className="text-muted-foreground/80"> · Applovin batch — cap is locked on</span>
        )}
      </div>
    </div>
  );
}

function ScriptField({
  label, sublabel, value, onChange, testId,
}: {
  label: string;
  sublabel: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">{label}</Label>
        <span className="text-[10.5px] text-muted-foreground/75 normal-case">{sublabel}</span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="text-[13px] leading-relaxed resize-y min-h-[88px]"
        placeholder="Paste or type the spoken prose — no markers, just the words the avatar says."
        data-testid={testId}
      />
    </div>
  );
}

function LookThumb({ src, label }: { src: string | null; label: string }) {
  return (
    <div className="w-16">
      <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted/40 flex items-center justify-center">
        {src ? (
          <img src={src} alt={label} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Video className="size-4 text-muted-foreground/40" />
        )}
      </div>
      <div className="mt-0.5 text-[9px] text-center text-muted-foreground">{label}</div>
    </div>
  );
}

// Modal listing every selected avatar's look groups. The avatar's currently
// assigned group is highlighted; clicking another group overrides it.
function SelectedLooksModal({
  open, onOpenChange, mode, avatars, selectedLooks, onPick,
  isUniqueIntro, advanceScenes, sceneOptionsByAvatar, onPickAdvance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  avatars: AvatarOption[];
  selectedLooks: Record<string, string>;
  onPick: (avatarId: string, lookId: string) => void;
  isUniqueIntro: boolean;
  advanceScenes: Record<string, string[]>;
  sceneOptionsByAvatar: Record<string, SceneRef[]>;
  onPickAdvance: (avatarId: string, slot: number, sceneId: string) => void;
}) {
  const showP1 = mode === "without" || mode === "combination";
  const showP2 = mode === "with" || mode === "combination";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/60 shrink-0">
          <DialogTitle className="text-[15px]">Selected looks</DialogTitle>
          <DialogDescription className="text-[12px]">
            {avatars.length} avatar{avatars.length === 1 ? "" : "s"} · a look is auto-selected for each — click another to override it.
          </DialogDescription>
        </DialogHeader>
        {avatars.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground py-10 text-center">No avatars selected yet.</p>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-2 divide-y divide-border/40">
            {avatars.map((a) => {
              const chosen = selectedLooks[a.id] ?? null;
              return (
                <div key={a.id} className="space-y-2 py-4 first:pt-3 last:pb-3">
                  <div className="flex items-center gap-2 sticky top-0 bg-background py-2 -mx-6 px-6 z-10">
                    <div className="size-7 rounded-full bg-muted/40 overflow-hidden shrink-0">
                      {a.image_url && <img src={a.image_url} alt={a.name} className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-[13px] font-semibold truncate">{a.name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">· {a.looks.length} look{a.looks.length === 1 ? "" : "s"}</span>
                  </div>
                  {isUniqueIntro && (() => {
                    const scenes = sceneOptionsByAvatar[a.id] ?? [];
                    const picks = advanceScenes[a.id] ?? ["", "", ""];
                    return (
                      <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                          Advance Script scenes
                        </div>
                        {scenes.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic">No no-product scenes available for this avatar.</p>
                        ) : (
                          [0, 1, 2].map((slot) => {
                            const pickedId = picks[slot] || "";
                            return (
                              <div key={slot} className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10.5px] font-medium text-foreground/80">Script {slot + 1}</span>
                                  {!pickedId && <span className="text-[10px] text-amber-600">· pick a scene</span>}
                                </div>
                                <div className="flex flex-wrap items-start gap-1.5">
                                  {scenes.map((sc) => {
                                    const isSel = pickedId === sc.scene_id;
                                    return (
                                      <button
                                        key={sc.scene_id}
                                        type="button"
                                        onClick={() => onPickAdvance(a.id, slot, sc.scene_id)}
                                        className={`rounded-md border p-1 transition-colors ${
                                          isSel ? "border-primary/60 ring-2 ring-primary/40 bg-primary/5" : "border-border/85 hover:bg-muted"
                                        }`}
                                      >
                                        <LookThumb src={sc.image_url ?? null} label={isSel ? "Selected" : sc.name || "Scene"} />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2">
                    {a.looks.map((g) => {
                      const uid = lookUid(g);
                      const isSel = chosen === uid;
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => onPick(a.id, uid)}
                          className={`rounded-lg border p-1.5 transition-colors ${
                            isSel ? "border-primary/60 ring-2 ring-primary/40 bg-primary/5" : "border-border/85 hover:bg-muted"
                          }`}
                        >
                          <div className="flex gap-1.5">
                            {showP1 && <LookThumb src={g.p1?.image_url ?? null} label="No product" />}
                            {showP2 && <LookThumb src={g.p2?.image_url ?? null} label="Product" />}
                          </div>
                          <div className={`mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold ${isSel ? "text-primary" : "text-muted-foreground/70"}`}>
                            {isSel ? <><Check className="size-3" /> Selected</> : "Use this look"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AvatarPreviewRow({ picked, requested, productPicked }: { picked: AvatarOption[]; requested: number; productPicked: boolean }) {
  if (picked.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground italic px-3 py-2 rounded-md border border-dashed border-border/85 bg-muted/10">
        {productPicked
          ? "No eligible avatars match this script's type. Widen the allowed types above."
          : "Choose a product first to see the avatars available for it."}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {picked.map((a) => (
        <AvatarChip key={a.id} avatar={a} />
      ))}
      {requested > picked.length && (
        <span className="inline-flex items-center text-[10.5px] text-muted-foreground/70 italic">
          (only {picked.length} eligible)
        </span>
      )}
    </div>
  );
}

function ManualAvatarGrid({
  options, picked, onToggle,
}: {
  options: AvatarOption[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground italic px-3 py-2 rounded-md border border-dashed border-border/85 bg-muted/10">
        No eligible avatars match the selected types.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
      {options.map((a) => {
        const active = picked.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onToggle(a.id)}
            className={`relative rounded-lg overflow-hidden border transition-colors text-left aspect-[3/4] ${
              active
                ? "border-primary/60 ring-2 ring-primary/30"
                : "border-border/85 hover:border-border"
            }`}
          >
            {a.image_url ? (
              <img src={a.image_url} alt={a.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center text-muted-foreground/75 text-[11px]">
                {a.name.slice(0, 2)}
              </div>
            )}
            <div className="absolute top-1 left-1 max-w-[calc(100%-0.5rem)]">
              <AvatarTypeBadge type={a.type} />
            </div>
            {active && (
              <div className="absolute top-1 right-1 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                <Check className="size-3" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4">
              <span className="block text-white text-[10px] font-medium leading-tight truncate">{a.name}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** The hook always films with the avatar's NO-PRODUCT (P1) look, so an avatar
 *  can only film it if at least one of its look groups carries a P1 with a
 *  HeyGen id. Same predicate validate() uses — surfaced here so the user sees
 *  it while picking instead of hitting it at submit. */
const canFilmHook = (a: AvatarOption): boolean =>
  (a.looks ?? []).some((g) => g.p1?.heygen_avatar_id);

/** Single-select face picker for the hook avatar. Deliberately mirrors
 *  ManualAvatarGrid's tile language (same aspect, badge, check, name gradient)
 *  so the two pickers on this card read as one system — but single-select, and
 *  it greys out avatars that have no hands-free look for this product.
 *
 *  `dense` is the inline strip that sits between the hook text and P1: smaller
 *  tiles, more per row, two rows tall. The roomy variant is what the Expand
 *  dialog renders. Both share this one body so a tweak can't drift between the
 *  two places the same faces are shown. */
function HookAvatarGrid({
  options, picked, onPick, testId, dense,
}: {
  options: AvatarOption[];
  picked: string;
  onPick: (id: string) => void;
  testId?: string;
  dense?: boolean;
}) {
  if (options.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground italic px-3 py-2 rounded-md border border-dashed border-border/85 bg-muted/10">
        No avatars available for this product yet.
      </div>
    );
  }
  return (
    <div
      className={
        dense
          ? "grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-1.5 max-h-[8.5rem] overflow-y-auto pr-0.5"
          : "grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2"
      }
      data-testid={testId}
    >
      {options.map((a) => {
        const active = picked === a.id;
        const usable = canFilmHook(a);
        return (
          <button
            key={a.id}
            type="button"
            disabled={!usable}
            title={usable ? a.name : `${a.name} — no hands-free look for this product`}
            onClick={() => onPick(a.id)}
            className={`relative rounded-md overflow-hidden border transition-colors text-left aspect-[3/4] ${
              active
                ? "border-primary/60 ring-2 ring-primary/30"
                : usable
                  ? "border-border/85 hover:border-border"
                  : "border-border/60 opacity-40 cursor-not-allowed"
            }`}
          >
            {a.image_url ? (
              <img src={a.image_url} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center text-muted-foreground/75 text-[10px]">
                {a.name.slice(0, 2)}
              </div>
            )}
            {/* The type badge needs room to read — at dense size it would just be
                a truncated smear over the face, so it only shows in the dialog. */}
            {!dense && (
              <div className="absolute top-1 left-1 max-w-[calc(100%-0.5rem)]">
                <AvatarTypeBadge type={a.type} />
              </div>
            )}
            {active && (
              <div className={`absolute rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow ${
                dense ? "top-0.5 right-0.5 size-3.5" : "top-1 right-1 size-5"
              }`}>
                <Check className={dense ? "size-2" : "size-3"} />
              </div>
            )}
            <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent ${
              dense ? "px-1 pb-0.5 pt-3" : "px-1.5 pb-1 pt-4"
            }`}>
              <span className={`block text-white font-medium leading-tight truncate ${dense ? "text-[8.5px]" : "text-[10px]"}`}>
                {a.name}
              </span>
              {!usable && !dense && (
                <span className="block text-white/70 text-[9px] leading-tight truncate">no hands-free look</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Full-size hook-avatar browser. Picking closes it — the hook takes exactly one
 *  avatar, so there is nothing left to do in here after a choice. */
function HookAvatarDialog({
  open, onOpenChange, options, picked, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  options: AvatarOption[];
  picked: string;
  onPick: (id: string) => void;
}) {
  const unusable = options.filter((a) => !canFilmHook(a)).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/60 shrink-0">
          <DialogTitle className="text-[15px]">Who films the hook</DialogTitle>
          <DialogDescription className="text-[12px]">
            {options.length} avatar{options.length === 1 ? "" : "s"} · can be a different person from the ad's avatar
            {unusable > 0 && ` · ${unusable} greyed out have no hands-free look for this product`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <HookAvatarGrid
            options={options}
            picked={picked}
            onPick={(id) => { onPick(id); onOpenChange(false); }}
            testId="hook-avatar-dialog-grid"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Voice-speed choices for HeyGen renders. Baked in at render time so slow
// talkers (e.g. Ryan Calloway) don't need the 3-10 min post-generation
// speed-up pass. null = no per-ad override (avatar default / renderer default).
const VOICE_SPEED_CHOICES = [0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];

function VoiceSpeedSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      className="h-6 rounded border border-border/85 bg-background/80 px-1 text-[10.5px] tabular-nums text-foreground focus-visible:outline-none focus-visible:border-primary/40"
      title="Voice speed for this avatar's renders"
    >
      <option value="">default</option>
      {VOICE_SPEED_CHOICES.map((s) => (
        <option key={s} value={String(s)}>{s}×</option>
      ))}
    </select>
  );
}

function AvatarChip({ avatar }: { avatar: AvatarOption }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card/60 px-1.5 py-1 text-[11px]">
      {avatar.image_url && (
        <img src={avatar.image_url} alt={avatar.name} className="size-6 rounded object-cover" />
      )}
      <span className="font-medium truncate max-w-[90px]">{avatar.name}</span>
      <AvatarTypeBadge type={avatar.type} compact />
    </div>
  );
}

function AvatarTypeBadge({ type, compact }: { type: AvatarOption["type"]; compact?: boolean }) {
  const cfg = AVATAR_TYPES.find((t) => t.id === type) || {
    id: "any" as const, label: "Any", cls: "border-amber-400/40 bg-amber-500/10 text-amber-300",
  };
  return (
    <span className={`inline-block max-w-full truncate align-middle rounded ${compact ? "px-1 py-0" : "px-1.5 py-0.5"} text-[9px] font-semibold uppercase tracking-wider border ${cfg.cls}`}>
      {compact ? cfg.label.slice(0, 1) : cfg.label}
    </span>
  );
}
