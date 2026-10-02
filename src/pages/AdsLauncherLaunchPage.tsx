import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  AdLookupResult,
  api,
  APPLOVIN_GOAL_TYPES,
  APPLOVIN_GOAL_TYPES_WITH_ROAS,
  APPLOVIN_BIDDING_STRATEGIES,
  APPLOVIN_DEFAULT_BIDDING_STRATEGY,
  ApplovinBiddingStrategy,
  ApplovinGoalType,
  ATTRIBUTIONS,
  AudienceTemplate,
  getApplovinCampaigns,
  getApplovinCreativeSets,
  getApplovinSourceEndCards,
  Brand,
  BUDGET_TYPES,
  BUYING_TYPES,
  CAMPAIGN_MODES,
  CHAR_LIMITS,
  ROAS_DAY_TARGETS,
  RoasDayTarget,
  SOFT_LIMITS,
  CreativeTemplate,
  CTA_OPTIONS,
  FbPage,
  FrameioFile,
  FUNNELS,
  IgAccount,
  LaunchPackageDetail,
  LaunchVariation,
  MetaAccount,
  OBJECTIVES,
  OPTIMIZATIONS,
  PLACEMENT_MODES,
  PLACEMENT_OPTIONS,
  Pixel,
  Product,
} from "@/features/ads-launcher/lib/api";
import { aspectFromFilename, useToast } from "@/features/ads-launcher/components/Toast";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { HelpTip } from "@/features/ads-launcher/components/Tooltip";
import { clearDraft, readDraft, relativeTime, writeDraft } from "@/features/ads-launcher/lib/draftStore";
import {
  objectiveMetaToLabel,
  buyingTypeMetaToLabel,
  optimizationMetaToLabel,
  attributionMetaToLabel,
} from "@/features/ads-launcher/lib/metaEnumMap";
import { fmtDateChip } from "@/features/ads-launcher/lib/datetime";
import { usePrefs } from "@/features/ads-launcher/lib/prefs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useBrands } from "@/hooks/useBrands";
import { useProducts } from "@/hooks/useProducts";
import { type UniversalPreset } from "@/pages/UploadPresetsPage";
import { supabase } from "@/integrations/supabase/client";

const DRAFT_KEY = "ads-uploader.launch-draft.v1";

/**
 * Cycle 406 — convert a naive `YYYY-MM-DDTHH:MM` string interpreted in
 * the given IANA tz to an absolute UTC ISO string. The launcher's
 * schedule input stores its value in the ad account's tz (not browser
 * tz) so operators read it directly without mental math; this turns
 * that into the wire format the server stores.
 */
function naiveTzStringToUtcIso(naive: string, tz: string): string {
  const naiveUtcMs = Date.parse(`${naive}:00Z`);
  if (!Number.isFinite(naiveUtcMs)) return new Date(naive).toISOString();
  const offsetAt = (utcMs: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, timeZoneName: "shortOffset",
    }).formatToParts(new Date(utcMs));
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
    const m = tzPart.match(/GMT([+-])(\d+)(?::?(\d+))?/);
    if (!m) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    const mins = parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
    return sign * mins;
  };
  let off1 = offsetAt(naiveUtcMs);
  let utcMs = naiveUtcMs - off1 * 60 * 1000;
  const off2 = offsetAt(utcMs);
  if (off2 !== off1) utcMs = naiveUtcMs - off2 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

type Funnel = (typeof FUNNELS)[number];
type CampaignMode = (typeof CAMPAIGN_MODES)[number]["value"];
type PlacementMode = (typeof PLACEMENT_MODES)[number];
type Attribution = (typeof ATTRIBUTIONS)[number];

// Maps the human-readable Optimization Goal labels (what the operator
// sees in the dropdown) to the Meta Marketing API's enum values. The
// backend forwards these directly to the AdSet `optimization_goal`
// field — no further translation needed.
const OPTIMIZATION_MAP: Record<string, string> = {
  "Maximize number of conversions": "OFFSITE_CONVERSIONS",
  "Maximize value of conversions": "VALUE",
  "Maximize landing page views": "LANDING_PAGE_VIEWS",
  "Maximize number of leads": "LEAD_GENERATION",
};

function deriveAdName(filename: string, _code: string | null, _funnel: Funnel | "") {
  // Cycle 327 — auto-fill the ad name with the filename (extension stripped).
  // Operator spec: "fill the ad name fields with the same as the file name
  // and actually fill it, yet allow us to edit it, of course."
  // Strip the extension only; preserve casing + separators so operators
  // who use naming conventions in filenames see them as-is.
  return filename.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
}

// Cycle 322 — deriveFolderName removed; ad-set name is DB-config-only.

export default function LaunchPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const confirmAct = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const cloneFromId = searchParams.get("from");

  const { data: supabaseBrandsData } = useBrands();
  const { products: supabaseProductsData } = useProducts();

  const brands = (Array.isArray(supabaseBrandsData) ? supabaseBrandsData : supabaseBrandsData?.data) ?? [];
  const products = (Array.isArray(supabaseProductsData) ? supabaseProductsData : supabaseProductsData?.data) ?? [];

  // Ad-ID gate (NEW — required first input)
  const [adId, setAdId] = useState("");
  // Cycle 194 — remember which package the launcher was cloned from so
  // we can show a persistent "Cloned from X" hint at the top until the
  // operator saves the new package. Cleared on first successful save.
  const [clonedFromName, setClonedFromName] = useState<string | null>(null);
  const [adIdImported, setAdIdImported] = useState<AdLookupResult | null>(null);
  const [adIdImporting, setAdIdImporting] = useState(false);
  const [adIdImportErr, setAdIdImportErr] = useState<string | null>(null);
  // Platform toggle — Meta is default; Applovin is wired in DB but UI is "Coming soon".
  const [platform, setPlatform] = useState<"Meta" | "Applovin">("Meta");

  // Targeting state
  const [packageName, setPackageName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");

  // Account dropdown: when a product is picked, scope to accounts allowed
  // for that product (allowed_product_ids contains it, OR is empty = generic).
  // Defaults to all accounts when no product is selected yet so Step 1 still
  // works for early-stage launches. Declared AFTER productId useState so the
  // queryKey dependency doesn't trip a temporal-dead-zone error (Cycle 98 fix).
  // Cycle 148 — strict filter: launcher dropdown only shows accounts
  // explicitly enabled for the picked product (the "Available for products"
  // checkbox on the account edit modal). Without a product picked we list
  // everything so the brand→product flow can still hydrate from a saved
  // template.
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    // Cycle 343 — accounts filtered by BRAND now (not product). Brand
    // is selected on Step 1; the dropdown narrows to ad accounts on
    // that brand. When no brand is picked yet, list every account
    // (operator hasn't committed to a brand). Without strict mode,
    // admin/global accounts (empty allowed_brand_ids) still surface.
    queryKey: ["meta-accounts", brandId],
    queryFn: () => api.get<{ ok: boolean; accounts: MetaAccount[] }>(brandId ? `/api/meta-accounts?brand_id=${brandId}` : "/api/meta-accounts"),
  });
  const accounts = (Array.isArray(accountsData) ? accountsData : accountsData?.accounts) ?? [];
  const [accountId, setAccountId] = useState("");
  // Cycle 492 — fuzzy search above the Meta Account dropdown. Hidden
  // until there are 8+ accounts in the dropdown (no point cluttering
  // operators who only have a handful). Matches against name +
  // meta_account_id substring; the currently-selected account is
  // always shown regardless of filter so the operator can't lose
  // their pick by typing.
  // Cycle 496 — persist last-used search to localStorage so an operator
  // who's repeatedly working in the same account family doesn't have
  // to retype the same filter every time they open /launch.
  const [accountSearch, setAccountSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem("ads-uploader.account-search") ?? ""; } catch { return ""; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (accountSearch) window.localStorage.setItem("ads-uploader.account-search", accountSearch);
      else window.localStorage.removeItem("ads-uploader.account-search");
    } catch {}
  }, [accountSearch]);
  const [funnel, setFunnel] = useState<Funnel | "">("");
  const [audienceTemplateId, setAudienceTemplateId] = useState("");
  // Cycle 342 — per-launch targeting template (from per-account list).
  // Cycle 361 — targetingTemplateId removed. Per-launch targeting is
  // the only path; defaults to broad-18+-US-all-genders with no incl/excl.
  // `null` here means "use Meta's pure default"; the operator types
  // actual values on Step 4 to set anything else.
  const [overrideAgeMin, setOverrideAgeMin] = useState<number | null>(null);
  const [overrideAgeMax, setOverrideAgeMax] = useState<number | null>(null);
  const [overrideGenders, setOverrideGenders] = useState<string[] | null>(null);
  const [overrideIncludeIds, setOverrideIncludeIds] = useState<string[] | null>(null);
  const [overrideExcludeIds, setOverrideExcludeIds] = useState<string[] | null>(null);
  const [pixelId, setPixelId] = useState("");
  const [tracking, setTracking] = useState("");
  const [fbPageId, setFbPageId] = useState("");
  const [igAccountId, setIgAccountId] = useState("");
  const [creativeTemplateId, setCreativeTemplateId] = useState("");

  // Campaign state
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("new_per_adset");
  const [existingCampaignId, setExistingCampaignId] = useState<string>("");
  const [existingAdsetId, setExistingAdsetId] = useState<string>("");
  const [existingAdsetName, setExistingAdsetName] = useState<string>("");
  // Meta existing-ad-set launch. "new" = create a fresh ad set (default = today's
  // behaviour); "existing" = attach the ads into an operator-picked live ad set.
  const [adsetMode, setAdsetMode] = useState<"new" | "existing">("new");
  // Fix 2 — live ad-set template. When the operator picks a live ad set to
  // copy settings from, its settings are stored here and pre-fill Step 4.
  const [adsetTemplateId, setAdsetTemplateId] = useState<string>("");
  const [adsetTemplateName, setAdsetTemplateName] = useState<string>("");
  const [campaignName, setCampaignName] = useState("");
  const [existingCampaignName, setExistingCampaignName] = useState("");
  const [campaignObjective, setCampaignObjective] = useState<typeof OBJECTIVES[number]>("OUTCOME_LEADS");
  const [buyingType, setBuyingType] = useState<typeof BUYING_TYPES[number]>("AUCTION");
  const [budgetType, setBudgetType] = useState<typeof BUDGET_TYPES[number]>("daily");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [optimizationGoal, setOptimizationGoal] = useState<typeof OPTIMIZATIONS[number]>("Maximize number of leads");

  // AppLovin (Axon) goal state — shown only when platform === "Applovin".
  // goal_type drives which sub-field is required: CPP/CHK_ROAS -> roasDayTarget,
  // CPE -> eventTarget. Defaults per brief: CHK_ROAS + DAY7.
  const [goalType, setGoalType] = useState<ApplovinGoalType>("CHK_ROAS");
  const [roasDayTarget, setRoasDayTarget] = useState<RoasDayTarget>("DAY7");
  const [eventTarget, setEventTarget] = useState("");
  // AppLovin (Axon) campaign-form fields. Countries are REQUIRED (Axon targeting must be
  // non-empty); stored as a comma/space-delimited string of ISO codes the operator types
  // (auto-populated from the universal preset's default_countries when available). Bidding
  // strategy defaults to the single known-valid Axon option. Creative-set name is optional
  // (placeholder shows the derived default).
  const [applovinCountries, setApplovinCountries] = useState("");
  const [applovinCountriesUserSet, setApplovinCountriesUserSet] = useState(false);
  const [applovinBiddingStrategy, setApplovinBiddingStrategy] =
    useState<ApplovinBiddingStrategy>(APPLOVIN_DEFAULT_BIDDING_STRATEGY);
  const [applovinCreativeSetName, setApplovinCreativeSetName] = useState("");
  // AppLovin (Axon) spec fields — the tool REUSES an existing campaign (picked from a live
  // list) and never creates one / sets targeting / budget / goal / bidding / ad copy.
  //  - applovinCampaignId: the existing Axon campaign id the operator picks.
  //  - applovinBuildMode: "create" (new set from video + end-card) | "clone" (clone a proven
  //    source set, then swap in the new video + end-card).
  //  - applovinSourceCreativeSetId: the source set to clone (Clone mode only).
  const [applovinCampaignId, setApplovinCampaignId] = useState("");
  const [applovinBuildMode, setApplovinBuildMode] = useState<"create" | "clone">("create");
  const [applovinSourceCreativeSetId, setApplovinSourceCreativeSetId] = useState("");

  // Ad-set state
  const [attributionSetting, setAttributionSetting] = useState<Attribution>("7-day click or 1-day view");
  const [adSetNameOverride, setAdSetNameOverride] = useState("");

  // Placements state
  const [placementMode, setPlacementMode] = useState<PlacementMode>("Advantage+ placements");
  const [manualPlacements, setManualPlacements] = useState<string[]>([...PLACEMENT_OPTIONS]);

  // Cycle 304 — schedule. Stored as the operator's local input value
  // (datetime-local format: "YYYY-MM-DDTHH:mm"). Converted to UTC ISO
  // at save time. Empty = launch immediately.
  // Cycle 366 — defaults to midnight of the next day in the SELECTED
  // ad account's timezone (operator: every launch should align with
  // Meta's budget-reset clock by default). The hydration effect below
  // fills this in once accounts + accountId are known.
  const [scheduledFor, setScheduledFor] = useState("");
  // True after the operator has typed/cleared the field manually — we
  // stop overwriting it from the tz default on subsequent account
  // changes so we don't clobber the human's choice.
  const [scheduledForUserSet, setScheduledForUserSet] = useState(false);

  // Launch mode: "now" fires immediately (create + enqueue onto the background
  // launch queue, lands PAUSED); "schedule" saves a draft with scheduled_for that
  // the per-minute scheduled worker fires at that time. Default "now" — the create
  // form no longer silently pre-fills a future schedule (that made operators think
  // a launch fired when it had only been scheduled for tomorrow). Schedule is opt-in.
  const [launchMode, setLaunchMode] = useState<"now" | "schedule">("now");

  // Cycle 307 / Cycle 325 — per-launch ship-as toggle.
  // C325 (operator): no "default" option — default to PAUSED.
  // true = ship PAUSED (operator must enable in Meta). false = ship ACTIVE.
  const [launchPaused, setLaunchPaused] = useState<boolean>(true);

  // Files & rows
  const [folderUrl, setFolderUrl] = useState("");
  // Cycle 380 — accept `?prefill_filename=<urlencoded>` from the Library
  // page so "Use in launch" pre-loads the manual-name list with the
  // filename already pasted. Strip the param after consumption so
  // refresh doesn't repaint it on top of operator edits.
  const initialManualNames = (() => {
    const fn = searchParams.get("prefill_filename");
    return fn ? fn : "";
  })();
  const [manualNames, setManualNames] = useState(initialManualNames);
  // Cycle 377 / 391 — operator preferences (default brand, default funnel,
  // schedule offset, default ship-as). Loaded asynchronously; we apply
  // them only when fields are still empty (don't clobber draft state or
  // operator edits).
  const { prefs } = usePrefs();
  // AppLovin readiness — mirrors the key_status{configured, tested_ok} concept used by
  // PlatformStatusCard on the Log page. Drives whether the AppLovin toggle is selectable.
  // Source: GET /api/launch-presets/applovin (per-brand campaign key configured + last test).
  // Gated on the selected brand so the chip/toggle reflect the brand actually being launched.
  const { data: applovinKeysData } = useQuery({
    queryKey: ["applovin-keys-all"],
    queryFn: () => api.get<{ ok?: boolean; brands?: any[] } | any[]>("/api/launch-presets/applovin"),
  });
  const applovinReadiness = useMemo(() => {
    const list: any[] = Array.isArray(applovinKeysData)
      ? applovinKeysData
      : (applovinKeysData?.brands ?? []);
    const row = brandId ? list.find((b) => b?.brand_id === brandId) : null;
    const configured = !!(row && row.campaign_configured);
    const tested_ok = row ? (row.last_tested_ok ?? null) : null;
    return { configured, tested_ok };
  }, [applovinKeysData, brandId]);
  // Live Axon campaign list for the picked brand — the operator REUSES one of these
  // (the tool never creates a campaign). Fetched only on the AppLovin path once a brand
  // is chosen. Refetchable via the refresh button on the picker.
  const applovinCampaignsQuery = useQuery({
    queryKey: ["applovin-campaigns", brandId],
    queryFn: () => getApplovinCampaigns(brandId),
    enabled: platform === "Applovin" && !!brandId,
    staleTime: 30_000,
  });
  const applovinCampaigns = applovinCampaignsQuery.data?.campaigns ?? [];
  // Live source-creative-set list for the picked campaign — only needed in Clone mode.
  const applovinCreativeSetsQuery = useQuery({
    queryKey: ["applovin-creative-sets", brandId, applovinCampaignId],
    queryFn: () => getApplovinCreativeSets(brandId, applovinCampaignId),
    enabled:
      platform === "Applovin" &&
      applovinBuildMode === "clone" &&
      !!brandId &&
      !!applovinCampaignId,
    staleTime: 30_000,
  });
  const applovinCreativeSets = applovinCreativeSetsQuery.data?.creative_sets ?? [];
  // Platform selection is ALWAYS free (both Meta and AppLovin) — picking the platform is
  // never gated on readiness. AppLovin push-readiness (brand campaign key configured +
  // whitelist) is surfaced via the readiness chip below and enforced at the actual PUSH on
  // the Log page, so the operator can prepare + save an AppLovin draft before the Axon
  // key/whitelist is ready (brief: "prepare an ad once and push it"). readiness drives the chip.
  useEffect(() => {
    if (searchParams.get("prefill_filename")) {
      const next = new URLSearchParams(searchParams);
      next.delete("prefill_filename");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rows, setRows] = useState<(LaunchVariation & { aspect?: string | null; local_preview_url?: string | null; local_mime?: string | null; local_size?: number | null; duration_sec?: number | null; local_file?: File | null; applovin_end_card_local_file?: File | null; applovin_end_card_preview_url?: string | null })[]>([]);
  // Clone mode: list the source set's end-card assets so the operator can PICK which one to reuse
  // (a set may have several HOSTED_HTML playables). Fetched once a source set is chosen. The picked
  // asset id is reused by id on the BACKEND at launch, swapping in only the new video.
  const applovinSourceEndCardsQuery = useQuery({
    queryKey: ["applovin-source-endcards", brandId, applovinSourceCreativeSetId],
    queryFn: () => getApplovinSourceEndCards(brandId, applovinSourceCreativeSetId),
    enabled:
      platform === "Applovin" &&
      applovinBuildMode === "clone" &&
      !!brandId &&
      !!applovinSourceCreativeSetId,
    staleTime: 5 * 60_000,
  });
  const applovinSourceEndCards = applovinSourceEndCardsQuery.data?.end_cards ?? [];
  // Clone mode: the end-card asset a specific row will reuse (each row picks its own from the source
  // set's end-cards). Multi-select per row (stored comma-joined in applovin_end_card_asset_id).
  // A row that was never touched (null/undefined) defaults to ALL end-cards selected; "" = none.
  const rowSelectedEndCardIds = (r: any): string[] => {
    const all = applovinSourceEndCards.map((c) => c.asset_id);
    if (r.applovin_end_card_asset_id == null) return all; // default: all selected
    return String(r.applovin_end_card_asset_id).split(",").map((s) => s.trim()).filter(Boolean);
  };
  const toggleRowEndCard = (i: number, r: any, assetId: string) => {
    const sel = new Set(rowSelectedEndCardIds(r));
    if (sel.has(assetId)) sel.delete(assetId); else sel.add(assetId);
    // materialize + keep source order so the stored value is stable
    const ordered = applovinSourceEndCards.map((c) => c.asset_id).filter((id) => sel.has(id));
    updateRow(i, { applovin_end_card_asset_id: ordered.join(",") } as any);
  };
  // The end-card preview for a row = the operator's own upload (create mode only). Null → placeholder.
  const rowEndCardPreview = (r: any): string | null =>
    r.applovin_end_card_preview_url || r.applovin_end_card_upload_url || null;
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [fetchSource, setFetchSource] = useState<"api" | "manual" | null>(null);
  const [sourceTab, setSourceTab] = useState<"url" | "upload" | "gdrive">("url");
  const [assetSource, setAssetSource] = useState<"frameio" | "gdrive" | "upload" | null>(null);
  // Cycle 311 — Google Drive folder URL state. Separate from folderUrl
  // so switching tabs doesn't clobber a half-typed Frame.io URL.
  const [driveUrl, setDriveUrl] = useState("");
  const [driveErr, setDriveErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [applyToAllAdCopy, setApplyToAllAdCopy] = useState(true);

  // Clone-from: hydrate every form field from an existing package when ?from=<id>
  useEffect(() => {
    if (!cloneFromId) return;
    let cancelled = false;
    api
      .get<LaunchPackageDetail>(`/api/launches/${cloneFromId}`)
      .then((p) => {
        if (cancelled) return;
        // Copy the Ad ID so the cloned form isn't gated behind the empty Step 0
        // wall. Operator can wipe + retype if they want a different Ad ID.
        // (Cycle 104 fix — previously cloning showed an empty Step 0 and the
        // hydrated fields were hidden under the "Start with the Ad ID" gate.)
        setAdId(p.ad_id ?? "");
        setPackageName(`${p.name} (copy)`);
        setClonedFromName(p.name);
        setBrandId(p.brand_id ?? "");
        setProductId(p.product_id ?? "");
        setAccountId(p.meta_account_id ?? "");
        setFunnel((p.funnel as Funnel) ?? "");
        setAudienceTemplateId(p.audience_template_id ?? "");
        setPixelId(p.pixel_id ?? "");
        setFbPageId(p.fb_page_id ?? "");
        setIgAccountId(p.ig_account_id ?? "");
        setCreativeTemplateId(p.creative_template_id ?? "");
        setCampaignMode(((p.campaign_mode as CampaignMode) ?? "new_per_adset"));
        setCampaignName(p.campaign_name ?? "");
        setExistingCampaignName(p.existing_campaign_name ?? "");
        if (p.campaign_objective) setCampaignObjective(p.campaign_objective as any);
        if (p.buying_type) setBuyingType(p.buying_type as any);
        if (p.budget_type) setBudgetType(p.budget_type as any);
        setBudgetAmount(p.budget_amount ?? "");
        if (p.optimization_goal) setOptimizationGoal(p.optimization_goal as any);
        if (p.attribution_setting) setAttributionSetting(p.attribution_setting as Attribution);
        setAdSetNameOverride(p.ad_set_name_override ?? "");
        setApplyToAllAdCopy(p.apply_to_all_ad_copy !== false);
        if (p.placement_mode) setPlacementMode(p.placement_mode as PlacementMode);
        if (Array.isArray(p.manual_placements)) setManualPlacements(p.manual_placements as string[]);
        if (p.platform === "Meta" || p.platform === "Applovin") setPlatform(p.platform);
        // AppLovin spec fields — reuse the same campaign + build mode on the clone.
        setApplovinCampaignId(p.applovin_campaign_id ?? "");
        if (p.applovin_build_mode === "create" || p.applovin_build_mode === "clone") setApplovinBuildMode(p.applovin_build_mode);
        setApplovinSourceCreativeSetId(p.applovin_source_creative_set_id ?? "");
        setFolderUrl(p.frameio_folder_url ?? "");
        // Hydrate rows from variations
        const hydrated = (p.variations ?? []).map((v) => ({
          file_id: v.file_id ?? null,
          file_name: v.file_name,
          ad_name: v.ad_name,
          call_to_action: v.call_to_action ?? "Learn more",
          primary_text: v.primary_text ?? "",
          headline: v.headline ?? "",
          description: v.description ?? "",
          destination_url: v.destination_url ?? "",
          preview_url: v.preview_url ?? null,
          thumb: v.thumb ?? null,
          aspect: aspectFromFilename(v.file_name),
        }));
        setRows(hydrated);
        if (hydrated.length > 0) setFetchSource("manual");
        // Clear the ?from query param now that we've hydrated
        const next = new URLSearchParams(searchParams);
        next.delete("from");
        setSearchParams(next, { replace: true });
        toast("success", `Cloned "${p.name}". Edit and save as a new package.`);
      })
      .catch((e) => {
        // Cycle 209 — distinguish 404 (source deleted) from other errors.
        // 404 case: drop the ?from param so a manual refresh doesn't keep
        // re-triggering the same failure.
        const msg = String(e?.message ?? "unknown error");
        if (/^404\b|Not Found|\bNot found/i.test(msg)) {
          toast("error", "The source launch was deleted. Starting a fresh launcher.");
          const next = new URLSearchParams(searchParams);
          next.delete("from");
          setSearchParams(next, { replace: true });
        } else {
          toast("error", `Couldn't clone: ${msg}`);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloneFromId]);

  // ── Draft persistence (localStorage) ────────────────────────────────
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  // Cycle 421 — warn before close/refresh when there are staged rows.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (rows.length === 0) return;
      e.preventDefault();
      // Required for older browsers; modern ones show their own copy.
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);
  // True for ~100ms after a draft restore so cascading "reset dependents"
  // effects know to no-op rather than wipe the restored values.
  const hydratingRef = useRef(false);

  // One-shot restore on mount. Skips when ?from= is set (clone takes priority).
  useEffect(() => {
    if (cloneFromId) {
      setDraftHydrated(true);
      return;
    }
    const draft = readDraft<any>(DRAFT_KEY);
    if (!draft) {
      setDraftHydrated(true);
      return;
    }
    hydratingRef.current = true;
    const d = draft.data;
    if (typeof d.adId === "string") setAdId(d.adId);
    if (d.adIdImported) setAdIdImported(d.adIdImported);
    if (d.platform === "Meta" || d.platform === "Applovin") setPlatform(d.platform);
    if (d.goalType) setGoalType(d.goalType);
    if (d.roasDayTarget) setRoasDayTarget(d.roasDayTarget);
    if (d.eventTarget !== undefined) setEventTarget(d.eventTarget);
    if (d.applovinCountries !== undefined) setApplovinCountries(d.applovinCountries);
    if (typeof d.applovinCountriesUserSet === "boolean") setApplovinCountriesUserSet(d.applovinCountriesUserSet);
    if (d.applovinBiddingStrategy) setApplovinBiddingStrategy(d.applovinBiddingStrategy);
    if (d.applovinCreativeSetName !== undefined) setApplovinCreativeSetName(d.applovinCreativeSetName);
    if (d.applovinCampaignId !== undefined) setApplovinCampaignId(d.applovinCampaignId);
    if (d.applovinBuildMode === "create" || d.applovinBuildMode === "clone") setApplovinBuildMode(d.applovinBuildMode);
    if (d.applovinSourceCreativeSetId !== undefined) setApplovinSourceCreativeSetId(d.applovinSourceCreativeSetId);
    if (d.packageName !== undefined) setPackageName(d.packageName);
    if (d.brandId !== undefined) setBrandId(d.brandId);
    if (d.productId !== undefined) setProductId(d.productId);
    if (d.accountId !== undefined) setAccountId(d.accountId);
    if (d.funnel !== undefined) setFunnel(d.funnel);
    if (d.audienceTemplateId !== undefined) setAudienceTemplateId(d.audienceTemplateId);
    if (d.pixelId !== undefined) setPixelId(d.pixelId);
    if (d.tracking !== undefined) setTracking(d.tracking);
    if (d.fbPageId !== undefined) setFbPageId(d.fbPageId);
    if (d.igAccountId !== undefined) setIgAccountId(d.igAccountId);
    if (d.creativeTemplateId !== undefined) setCreativeTemplateId(d.creativeTemplateId);
    if (d.campaignMode) setCampaignMode(d.campaignMode);
    if (d.campaignName !== undefined) setCampaignName(d.campaignName);
    if (d.existingCampaignName !== undefined) setExistingCampaignName(d.existingCampaignName);
    if (d.campaignObjective) setCampaignObjective(d.campaignObjective);
    if (d.buyingType) setBuyingType(d.buyingType);
    if (d.budgetType) setBudgetType(d.budgetType);
    if (d.budgetAmount !== undefined) setBudgetAmount(d.budgetAmount);
    if (d.optimizationGoal) setOptimizationGoal(d.optimizationGoal);
    if (d.attributionSetting) setAttributionSetting(d.attributionSetting);
    if (d.adSetNameOverride !== undefined) setAdSetNameOverride(d.adSetNameOverride);
    if (typeof d.applyToAllAdCopy === "boolean") setApplyToAllAdCopy(d.applyToAllAdCopy);
    if (d.placementMode) setPlacementMode(d.placementMode);
    if (Array.isArray(d.manualPlacements)) setManualPlacements(d.manualPlacements);
    if (d.folderUrl !== undefined) setFolderUrl(d.folderUrl);
    if (d.manualNames !== undefined) setManualNames(d.manualNames);
    if (Array.isArray(d.rows)) setRows(d.rows);
    if (d.sourceTab) setSourceTab(d.sourceTab);
    setDraftRestoredAt(draft.savedAt);
    setDraftHydrated(true);
    // Let cascading reset-effects run normally again after a tick. 200ms is
    // generous — enough for the brand/product/account queries to settle.
    window.setTimeout(() => {
      hydratingRef.current = false;
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on any meaningful change (skipped until first hydration completes
  // so we don't overwrite the restored draft with empty defaults).
  const { data: pixelsData, isLoading: pixelsLoading } = useQuery({
    queryKey: ["pixels", accountId],
    queryFn: () => api.get<{ ok: boolean; pixels: Pixel[] }>(`/api/pixels?meta_account_id=${accountId}`),
    enabled: !!accountId,
  });
  const pixels = (Array.isArray(pixelsData) ? pixelsData : pixelsData?.pixels) ?? [];
  const { data: audienceTemplatesData } = useQuery({
    queryKey: ["audience-templates", accountId],
    queryFn: () => api.get<{ ok: boolean; audience_templates: AudienceTemplate[] }>(`/api/audience-templates?meta_account_id=${accountId}`),
    enabled: !!accountId,
  });
  const audienceTemplates = audienceTemplatesData?.audience_templates ?? [];
  // Cycle 361 — targetingTemplates query removed (templates dropped per
  // operator). All per-launch targeting flows through the override state.
  // Cycle 362 — FB Pages + IG accounts pulled LIVE from Meta Graph per
  // account (no DB mirror indirection). Operator: "make sure it's
  // dynamic and legit, only showing options based on what is synced
  // to the ad account in Meta." Response shape adapted to the local
  // FbPage / IgAccount types in-place.
  const { data: fbPagesLive, isLoading: fbPagesLoading } = useQuery({
    queryKey: ["fb-pages-live", accountId],
    queryFn: () => api.get<{ ok: boolean; pages: { id: string; page_id: string; name: string; live_ads_count: number | null; ads_limit: number | null }[] }>(`/api/meta-accounts/${accountId}/fb-pages-live`),
    enabled: !!accountId,
    staleTime: 30_000,
  });
  const fbPages: FbPage[] = ((Array.isArray(fbPagesLive) ? fbPagesLive : fbPagesLive?.pages) ?? []).map((p) => ({
    id: p.id,
    meta_account_id: accountId,
    name: p.name,
    page_id: p.page_id,
    helper_copy: null,
    // Cycle 399 — surface counts on the launcher dropdown chip.
    live_ads_count: p.live_ads_count,
    ads_limit: p.ads_limit,
  }));
  const { data: igLive, isLoading: igLoading } = useQuery({
    queryKey: ["ig-accounts-live", accountId],
    queryFn: () => api.get<{ ok: boolean; instagrams: { id: string; ig_id: string; handle: string }[] }>(`/api/meta-accounts/${accountId}/ig-accounts-live`),
    enabled: !!accountId,
    staleTime: 30_000,
  });
  const igAccounts: IgAccount[] = ((Array.isArray(igLive) ? igLive : igLive?.instagrams) ?? []).map((i) => ({
    id: i.id,
    meta_account_id: accountId,
    handle: i.handle,
    instagram_id: i.ig_id,
    helper_copy: null,
  }));
  const { data: creativeTemplatesData } = useQuery({
    queryKey: ["creative-templates", productId],
    queryFn: () => api.get<{ ok: boolean; creative_templates: CreativeTemplate[] }>(`/api/creative-templates?product_id=${productId}`),
    enabled: !!productId,
  });
  const creativeTemplates = (Array.isArray(creativeTemplatesData) ? creativeTemplatesData : creativeTemplatesData?.creative_templates) ?? [];
  // Pull every Meta launch preset mirrored from marketing.acentecom.com's MCP
  // (small payload, 5 rows today, cached aggressively). We use this to auto-
  // pick the FB Page + IG account the moment an operator selects a Meta ad
  // account, so the launcher doesn't make them re-pick something already
  // configured upstream. Falls back silently when no preset exists for the
  // selected account.
  const { data: launchPresetsData } = useQuery({
    queryKey: ["launch-presets-meta"],
    queryFn: () =>
      api.get<{
        presets: Array<{
          account_id: string;
          defaults: { page?: string; insta?: string };
          default_cta: string | null;
          url_tags: string | null;
        }>;
        // Cycle 292 — universal preset hydrates Step 3 defaults.
        universal: {
          launch_paused: boolean | null;
          default_campaign_objective: string | null;
          default_buying_type: string | null;
          default_budget_type: string | null;
          default_optimization_goal: string | null;
          default_attribution_setting: string | null;
          default_placement_mode: string | null;
          default_age_min: number | null;
          default_age_max: number | null;
          default_countries: string[] | null;
          special_ad_categories: string[] | null;
        } | null;
      }>("/api/launch-presets/meta"),
    staleTime: 5 * 60_000,
  });

  // Parse the operator's free-typed AppLovin countries string ("US, GB ca") into a clean,
  // de-duplicated array of upper-case ISO codes. Used by validation + save payload so both
  // agree on the exact set sent to Axon. Empty when nothing valid is typed.
  const applovinCountriesList = useMemo(
    () => Array.from(new Set(
      applovinCountries
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    )),
    [applovinCountries],
  );

  const selectedBrand = brands.find((b) => b.id === brandId);
  const selectedProduct = products.find((p) => p.id === productId);
  const selectedCreative = creativeTemplates.find((c) => c.id === creativeTemplateId);
  const productsForBrand = useMemo(() => products.filter((p) => p.brand_id === brandId), [products, brandId]);

  const namingCode = useMemo(() => {
    if (!selectedProduct) return null;
    if (funnel === "Onbrand") return selectedProduct.onbrand_code;
    if (funnel === "Comparison") return selectedProduct.comparison_code;
    // TSL + Adv don't have their own product naming codes yet — fall
    // back to the onbrand code with a funnel suffix so ad names still encode it.
    if (funnel === "TSL" && selectedProduct.onbrand_code) return `${selectedProduct.onbrand_code}_TSL`;
    if (funnel === "Adv" && selectedProduct.onbrand_code) return `${selectedProduct.onbrand_code}_ADV`;
    return null;
  }, [selectedProduct, funnel]);

  // Destination URLs are now first-class records scoped by (product, funnel, platform).
  // Configure them in /destinations. The launcher only shows the relevant set.
  type DestinationOption = { id: string; name: string; url: string; preview_url: string | null; is_default: boolean };
  const { data: destinationsData } = useQuery({
    queryKey: ["destinations", productId, funnel, platform],
    queryFn: () => {
      const params = new URLSearchParams();
      if (productId) params.set("product_id", productId);
      if (funnel) params.set("funnel", funnel);
      if (platform) params.set("platform", platform);
      return api.get<DestinationOption[] | { ok: boolean; destinations: DestinationOption[] }>(`/api/destinations${params.toString() ? `?${params}` : ""}`);
    },
    enabled: Boolean(productId && funnel),
  });
  const destinations = Array.isArray(destinationsData) ? destinationsData : (destinationsData?.destinations ?? []);
  // Cycle 137 — load every destination for the picked product (across all
  // funnels + platforms) so the funnel chip can show whether THAT funnel
  // has at least one destination configured before the operator clicks it.
  // Without this hint the operator picks a funnel only to find an empty
  // dropdown and an "+ Add destination" link in step 1.
  type DestinationLite = { funnel: string; platform: string };
  const { data: allDestinationsData } = useQuery({
    queryKey: ["destinations-all-funnels", productId],
    queryFn: () => api.get<{ ok: boolean; destinations: DestinationLite[] }>(`/api/destinations?product_id=${productId}`),
    enabled: !!productId,
  });
  const allDestinations = allDestinationsData?.destinations ?? [];

  const [destinationChoice, setDestinationChoice] = useState<string>(""); // destination_urls.id or "custom"
  const [destinationCustom, setDestinationCustom] = useState("");
  // Cycle 363 — preview/display URL paired with destination URL. Required
  // for both template-backed and manual choices; the launcher persists
  // both per variation so Meta's actual-vs-display link can be set at
  // launch time.
  const [destinationPreviewCustom, setDestinationPreviewCustom] = useState("");

  // Auto-pick the default destination when (product, funnel, platform) load.
  useEffect(() => {
    if (destinationChoice === "custom") return;
    if (!destinations.length) {
      setDestinationChoice("");
      return;
    }
    // If current choice is still in the list, keep it. Otherwise pick default.
    if (destinationChoice && destinations.find((d) => d.id === destinationChoice)) return;
    const def = destinations.find((d) => d.is_default) ?? destinations[0];
    if (def) setDestinationChoice(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations]);

  // When product cleared, reset
  useEffect(() => {
    if (!selectedProduct) {
      setDestinationChoice("");
      setDestinationCustom("");
      setDestinationPreviewCustom("");
    }
  }, [selectedProduct]);

  const destinationUrl = useMemo(() => {
    // Cycle 441 — auto-prefix `https://` when the operator typed a bare
    // domain (www.foo.com → https://www.foo.com). Meta rejects URLs
    // without scheme, so we patch it before save instead of forcing
    // operators to type scheme manually.
    const raw = destinationChoice === "custom"
      ? destinationCustom
      : destinations.find((d) => d.id === destinationChoice)?.url ?? "";
    const t = raw.trim();
    if (!t) return "";
    if (/^https?:\/\//i.test(t)) return t;
    return `https://${t}`;
  }, [destinationChoice, destinationCustom, destinations]);
  const destinationPreviewUrl = useMemo(() => {
    if (destinationChoice === "custom") return destinationPreviewCustom;
    return destinations.find((d) => d.id === destinationChoice)?.preview_url ?? "";
  }, [destinationChoice, destinationPreviewCustom, destinations]);

  // Cycle 322 — ad set name suggested from DB config ONLY (product's naming
  // code + ad_id / package name). Folder-name source dropped per operator
  // spec: "ad set name should be pulled from the database configuration,
  // not from any folder".
  const suggestedAdSetName = useMemo(() => {
    if (namingCode && adId.trim()) return `${namingCode} | ${adId.trim()}`;
    if (namingCode && packageName) return `${namingCode} · ${packageName}`;
    if (adId.trim()) return adId.trim();
    return "";
  }, [namingCode, packageName, adId]);

  useEffect(() => {
    // Initial fill: empty → suggestion.
    if (!adSetNameOverride && suggestedAdSetName) {
      setAdSetNameOverride(suggestedAdSetName);
      return;
    }
    // Upgrade case: when the current override is recognizable as an
    // auto-generated value (matches a previous adId or a previous
    // adId-only fallback) and a richer suggestion is now available,
    // replace it. Two patterns we treat as "auto-generated":
    //   1. Bare adId (e.g. "001999") — fired before namingCode resolved
    //   2. `${namingCode} | ${prevAdId}` — Ad ID changed mid-flow
    // Operators who manually typed something get left alone.
    const looksAutoGenerated =
      /^\d{4,6}$/.test(adSetNameOverride.trim()) || // pure-numeric Ad ID
      /^[A-Z_]+\s\|\s\d{4,6}$/.test(adSetNameOverride.trim()); // `CODE | NNNNNN`
    if (
      looksAutoGenerated &&
      suggestedAdSetName &&
      suggestedAdSetName !== adSetNameOverride
    ) {
      setAdSetNameOverride(suggestedAdSetName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedAdSetName]);

  // Auto-suggest campaign name when namingCode appears
  useEffect(() => {
    if (campaignMode === "new_per_adset" && namingCode && !campaignName) {
      setCampaignName(namingCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namingCode, campaignMode]);

  // Cycle 402 — switching CBO ↔ ABO unselects any picked existing
  // campaign + ad set. The previously-picked campaign is filtered to
  // a single buying_type so it can't possibly fit the new mode;
  // letting it stay selected would just be a footgun at save time.
  useEffect(() => {
    if (hydratingRef.current) return;
    setExistingCampaignId("");
    setExistingCampaignName("");
    setExistingAdsetId("");
    setExistingAdsetName("");
    setAdsetMode("new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignMode]);

  // Changing the picked existing campaign must drop any ad set chosen under the
  // OLD campaign — otherwise a launch could attach ads to an ad set that no longer
  // belongs to the selected campaign (the backend attaches to existing_adset_id
  // without re-checking the campaign). adsetMode is left as-is; the operator just
  // re-picks an ad set for the new campaign, and the "Pick an existing ad set"
  // validation re-blocks launch until they do.
  useEffect(() => {
    if (hydratingRef.current) return;
    setExistingAdsetId("");
    setExistingAdsetName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCampaignId]);

  useEffect(() => {
    if (hydratingRef.current) return;
    if (selectedBrand?.default_meta_account_id && !accountId) setAccountId(selectedBrand.default_meta_account_id);
    // Only clear productId when products have actually loaded; otherwise we'd
    // wipe a freshly-restored draft value because productsForBrand is [] until
    // the query resolves.
    if (brandId && products.length > 0 && !productsForBrand.find((p) => p.id === productId)) {
      setProductId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, products.length]);

  useEffect(() => {
    if (hydratingRef.current) return;
    setAudienceTemplateId("");
    setPixelId("");
    setTracking("");
    setFbPageId("");
    setIgAccountId("");
  }, [accountId]);

  // When a Pixel is picked, autofill Tracking to "Website Events"
  // (offsite_conversion). Operator can still change it, but skipping
  // a second dropdown speeds up the common path. Clearing the pixel
  // also clears tracking so stale values aren't sent without a pixel.
  useEffect(() => {
    if (hydratingRef.current) return;
    if (pixelId && !tracking) setTracking("offsite_conversion");
    if (!pixelId && tracking) setTracking("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelId]);

  // Cycle 391 — apply per-operator default brand / funnel / ship-as
  // ONLY after draft hydration settles, and only when the field is
  // still empty (don't clobber a draft or an operator edit).
  useEffect(() => {
    if (!draftHydrated) return;
    if (hydratingRef.current) return;
    if (prefs.default_brand_id && !brandId) setBrandId(prefs.default_brand_id);
    if (prefs.default_funnel && !funnel) setFunnel(prefs.default_funnel);
    if (typeof prefs.default_launch_paused === "boolean") {
      // Only override the hardcoded PAUSED default when the operator
      // explicitly chose ACTIVE. true (PAUSED) is a no-op since it
      // matches the current default.
      if (prefs.default_launch_paused === false && launchPaused === true) {
        setLaunchPaused(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftHydrated, prefs.default_brand_id, prefs.default_funnel, prefs.default_launch_paused]);

  // Cycle 366 — auto-default the schedule to midnight of the next day in
  // the selected ad account's timezone. Operator wants every launch to
  // align with Meta's budget-reset clock by default; they can still edit
  // or clear. We only set the default once per account change AND only
  // if the operator hasn't manually typed anything.
  //
  // Cycle 391 — respect the schedule offset from account preset (if set),
  // falling back to operator preference. Range clamped to [0, 23].
  //
  // The math has to navigate three coordinate systems:
  //   1. The wall-clock date in the AD ACCOUNT's tz (we want "tomorrow"
  //      there, not tomorrow in the operator's tz).
  //   2. The absolute UTC instant for midnight-in-that-tz.
  //   3. The browser-local datetime-local string that the <input> wants,
  //      which is naive (no tz suffix) and re-interpreted in browser tz.
  useEffect(() => {
    if (hydratingRef.current) return;
    // Only pre-fill a default time when the operator has explicitly chosen to
    // schedule. In "launch now" mode we never touch the field — no silent
    // tomorrow-default that gets submitted as a real scheduled launch (#11).
    if (launchMode !== "schedule") return;
    if (scheduledForUserSet) return;
    const acct = accounts.find((a) => a.id === accountId);
    const tz = acct?.timezone_name ?? null;
    if (!tz) return;
    try {
      const now = new Date();
      // Cycle 406 — `scheduledFor` now stores a NAIVE wall-clock string
      // YYYY-MM-DDTHH:MM that's interpreted in the AD account's tz.
      // The datetime-local input renders this exact string with no
      // browser-tz conversion (just don't trust the browser to interpret
      // it). Conversion to UTC happens at save time only.
      // 1. "Tomorrow" as YYYY-MM-DD in the AD account's tz.
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      });
      const tomorrowInTz = new Date(now.getTime() + 24 * 3600 * 1000);
      const dateStr = fmt.format(tomorrowInTz); // "YYYY-MM-DD" in tz
      // Use operator preference for schedule offset (account preset clears this to re-hydrate)
      const offsetHours = Math.max(0, Math.min(23, prefs.schedule_offset_hours ?? 0));
      const hh = String(offsetHours).padStart(2, "0");
      // Operator sees this exact string in the input. Default 00:00.
      setScheduledFor(`${dateStr}T${hh}:00`);
    } catch {
      // Time math failed for this tz — leave the input empty.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accounts.length, prefs.schedule_offset_hours, launchMode]);
  useEffect(() => {
    if (hydratingRef.current) return;
    setCreativeTemplateId("");
    // When the product changes, the allowed_product_ids filter on accounts
    // may exclude the currently-selected one. The dropdown silently falls
    // through to "— select —" but `accountId` state still holds the stale
    // value → operator thinks they've picked, save uses the wrong account.
    // Clear the state when the current pick isn't in the freshly-filtered
    // list. (Cycle 102 fix.)
    if (accountId && accounts.length > 0 && !accounts.find((a) => a.id === accountId)) {
      setAccountId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, accounts]);
  useEffect(() => {
    if (hydratingRef.current) return;
    if (creativeTemplateId && selectedCreative && selectedCreative.funnel !== funnel && funnel) {
      setCreativeTemplateId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel]);

  // Auto-pick FB Page + IG account from the matching launch preset once the
  // operator has chosen a Meta account. The preset (mirrored from
  // marketing.acentecom.com) carries the canonical page/insta IDs. We map
  // those to the local fb_pages / ig_accounts rows by external ID and select
  // them on the dropdown. Only fires when nothing's already selected — never
  // overrides an operator's manual pick.
  const selectedMetaAcct = accounts.find((a) => a.id === accountId);
  useEffect(() => {
    if (hydratingRef.current) return;
    if (!selectedMetaAcct) return;
    if (!launchPresetsData) return;
    const preset = launchPresetsData.presets.find(
      (p) => p.account_id.replace(/^act_/, "") === selectedMetaAcct.meta_account_id,
    );
    if (!preset) return;
    const presetPageId = preset.defaults?.page;
    const presetInstaId = preset.defaults?.insta;
    if (presetPageId && !fbPageId && fbPages.length > 0) {
      const match = fbPages.find((p) => p.page_id === presetPageId);
      if (match) setFbPageId(match.id);
    }
    if (presetInstaId && !igAccountId && igAccounts.length > 0) {
      const match = igAccounts.find((i) => i.instagram_id === presetInstaId);
      if (match) setIgAccountId(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetaAcct, launchPresetsData, fbPages, igAccounts]);

  // Cycle 292 — hydrate Step 3 (Campaign Settings) from the operator's
  // universal preset (configured in /upload-presets). Each field only
  // fires if (a) the current value is still the hardcoded initial AND
  // (b) the draft hydration didn't already populate it. Guard ref
  // tracks whether we've already applied so we don't re-apply when
  // launchPresetsData refetches.
  const universalAppliedRef = useRef(false);
  // Cycle 452 — per-account preset (with singleton fallback). Source
  // of truth for default targeting (age, genders, audiences) +
  // auto_exclude_past_purchasers. Re-fetched on accountId change.
  const { data: accountPresetData } = useQuery({
    queryKey: ["account-preset", accountId],
    queryFn: () => api.get<{
      ok?: boolean;
      preset: UniversalPreset | null;
      is_custom?: boolean;
    }>(`/api/launch-presets/meta/by-account?meta_account_id=${accountId}`),
    enabled: !!accountId,
    staleTime: 60_000,
  });
  // Apply preset defaults to per-launch overrides — only when the
  // operator hasn't set them yet (null sentinel). Operators can clear
  // any field by hitting "reset to defaults" which re-runs this.
  const accountPresetAppliedRef = useRef<string>("");
  useEffect(() => {
    if (hydratingRef.current) return;
    if (!accountId) return;
    if (accountPresetAppliedRef.current === accountId) return;
    const p = accountPresetData?.preset;
    if (!p) return;
    // Apply campaign defaults from per-account preset (takes priority over universal)
    const obj = p.default_campaign_objective ? objectiveMetaToLabel(p.default_campaign_objective) : null;
    if (obj && campaignObjective?.toLowerCase() === "sales") setCampaignObjective(obj as any);
    const bt = p.default_buying_type ? buyingTypeMetaToLabel(p.default_buying_type) : null;
    if (bt && buyingType?.toLowerCase() === "auction") setBuyingType(bt as any);
    const opt = p.default_optimization_goal ? optimizationMetaToLabel(p.default_optimization_goal) : null;
    if (opt && optimizationGoal?.toLowerCase() === "maximize number of conversions") setOptimizationGoal(opt as any);
    if (p.default_budget_type) {
      const lc = p.default_budget_type.toLowerCase();
      if (lc === "daily" || lc === "lifetime") setBudgetType(lc);
    }
    // Apply targeting defaults
    if (overrideAgeMin === null && typeof p.default_age_min === "number") setOverrideAgeMin(p.default_age_min);
    if (overrideAgeMax === null && typeof p.default_age_max === "number") setOverrideAgeMax(p.default_age_max);
    if (overrideGenders === null && Array.isArray(p.default_genders)) setOverrideGenders(p.default_genders);
    if (overrideIncludeIds === null && Array.isArray(p.default_include_audience_ids)) setOverrideIncludeIds(p.default_include_audience_ids);
    if (overrideExcludeIds === null && Array.isArray(p.default_exclude_audience_ids)) setOverrideExcludeIds(p.default_exclude_audience_ids);
    // Apply launch settings from preset (treat null as true/PAUSED)
    if (p.launch_paused !== undefined) setLaunchPaused(p.launch_paused !== false);
    // Clear scheduled time so it re-hydrates with the account preset's schedule offset
    if (!scheduledForUserSet && typeof (p as any).default_schedule_offset_hours === "number") {
      setScheduledFor("");
    }
    accountPresetAppliedRef.current = accountId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountPresetData, accountId]);
  useEffect(() => {
    if (hydratingRef.current) return;
    if (universalAppliedRef.current) return;
    const uni = launchPresetsData?.universal;
    if (!uni) return;
    // Server returns Meta API raw enums (OUTCOME_SALES, OFFSITE_CONVERSIONS,
    // 1d_click) while the UI uses friendly labels. metaEnumMap translates.
    // Each setter fires only when (a) the mapper recognised the upstream
    // value AND (b) the current value is still the hardcoded init (so
    // a draft load or explicit operator pick is never overwritten).
    const obj = objectiveMetaToLabel(uni.default_campaign_objective);
    if (obj && campaignObjective?.toLowerCase() === "sales") setCampaignObjective(obj as any);
    const bt = buyingTypeMetaToLabel(uni.default_buying_type);
    if (bt && buyingType?.toLowerCase() === "auction") setBuyingType(bt as any);
    const opt = optimizationMetaToLabel(uni.default_optimization_goal);
    if (opt && optimizationGoal?.toLowerCase() === "maximize number of conversions") setOptimizationGoal(opt as any);
    // Cycle 448 — operator spec: "default attribution at the ad-set
    // level is 7-day click or 1-day view, regardless of preset". The
    // universal preset can still be edited (and existing per-account
    // rows respect their own override), but the launcher always starts
    // at this default so operators can rely on it without checking.
    // The attributionMetaToLabel(...) lookup is intentionally not
    // applied here.
    // Budget type stored upstream as DAILY/LIFETIME (Meta enum); our UI uses
    // the lowercase variant. Coerce both directions.
    if (uni.default_budget_type && budgetType === "daily") {
      const lc = uni.default_budget_type.toLowerCase();
      if (lc === "daily" || lc === "lifetime") setBudgetType(lc);
    }
    // AppLovin (Axon) targeting countries — auto-populate from the universal preset's
    // default_countries when the operator hasn't typed any yet and a draft didn't restore
    // them. Reuses the same data the Meta path loads; pure additive (no Meta field touched).
    if (!applovinCountriesUserSet && !applovinCountries.trim() && Array.isArray(uni.default_countries) && uni.default_countries.length) {
      setApplovinCountries(uni.default_countries.join(", "));
    }
    universalAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchPresetsData]);

  // Cycle 148 — auto-pick the is_default audience template + pixel when
  // they load. Operators were leaving these on "— none —" and discovering
  // it at the Save bar. Default to the is_default-flagged one when nothing
  // else is selected, falling back to the first available row.
  useEffect(() => {
    if (hydratingRef.current) return;
    if (!audienceTemplateId && audienceTemplates.length > 0) {
      const def = audienceTemplates.find((a: any) => a.is_default) ?? audienceTemplates[0];
      if (def) setAudienceTemplateId(def.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceTemplates]);

  // Cycle 361 — template logic removed. Effective targeting values
  // come purely from operator overrides.
  // Cycle 404 — operator default: no age limit (Meta accepts age_min
  // as low as 13 and age_max up to 65; leaving them unspecified means
  // "all adults Meta will serve to"). Operators can set per-launch if
  // they want age targeting. We use Meta's wire defaults (18/65) only
  // as fallbacks when sending to the API, but the UI shows them as
  // empty so operators don't mistakenly think we're narrowing.
  const effAgeMin = overrideAgeMin ?? 18;
  const effAgeMax = overrideAgeMax ?? 65;
  const effGenders: string[] = overrideGenders ?? [];
  const effIncludeIds: string[] = overrideIncludeIds ?? [];
  const effExcludeIds: string[] = overrideExcludeIds ?? [];
  useEffect(() => {
    if (hydratingRef.current) return;
    if (!pixelId && pixels.length > 0) {
      const def = pixels.find((p: any) => p.is_default) ?? pixels[0];
      if (def) setPixelId(def.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixels]);

  // Auto-pick the first creative template that matches the chosen funnel as
  // soon as templates resolve for the product. Operators almost always want
  // the brand's pre-baked copy, and forgetting to pick it leaves Step 6 with
  // blank headline/primary text. We only fill in when nothing's selected yet
  // — never overwrite an operator's manual pick.
  // Cycle 405 — auto-pick as soon as creativeTemplates load for the
  // current product, even if the operator hasn't picked a funnel yet:
  // operator wants the default text template to populate right after
  // product selection. We still respect funnel when it's set.
  useEffect(() => {
    if (hydratingRef.current) return;
    if (creativeTemplateId) return;            // operator already chose
    if (creativeTemplates.length === 0) return;
    const match =
      // 1. Funnel-default for the current funnel (operator-pinned).
      (funnel && creativeTemplates.find((c) => c.funnel === funnel && (c as any).is_default)) ||
      // 2. Any template for the current funnel.
      (funnel && creativeTemplates.find((c) => c.funnel === funnel)) ||
      // 3. Any default template regardless of funnel.
      creativeTemplates.find((c) => (c as any).is_default) ||
      // 4. Onbrand fallback (most common funnel).
      creativeTemplates.find((c) => c.funnel === "Onbrand") ||
      // 5. Last resort: first template.
      creativeTemplates[0];
    if (match) setCreativeTemplateId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creativeTemplates, funnel]);

  function copyFromCreative(): Partial<LaunchVariation> {
    // Cycle 334 — TSL funnel ships with empty creative text by default.
    // Operator spec: TSL assets carry the headline/primary/description
    // baked into the static image, so the Meta ad fields should stay
    // blank (Meta will display only the image without competing text).
    if (funnel === "TSL") {
      return {
        call_to_action: selectedCreative?.call_to_action ?? selectedProduct?.default_call_to_action ?? selectedBrand?.default_call_to_action ?? "Learn more",
        primary_text: "",
        headline: "",
        description: "",
      };
    }
    if (selectedCreative) {
      return {
        call_to_action: selectedCreative.call_to_action ?? "Learn more",
        primary_text: selectedCreative.primary_text ?? "",
        headline: selectedCreative.headline ?? "",
        description: selectedCreative.description ?? "",
      };
    }
    return {
      call_to_action: selectedProduct?.default_call_to_action ?? selectedBrand?.default_call_to_action ?? "Learn more",
      primary_text: selectedProduct?.default_primary_text ?? selectedBrand?.default_primary_text ?? "",
      headline: selectedProduct?.default_headline ?? "",
      description: selectedProduct?.default_description ?? "",
    };
  }

  const fetchFolder = useMutation({
    // Cycle 129 Round 5 — trim the folder URL before sending. Operators
    // copy-paste URLs with trailing spaces / newlines all the time which
    // breaks UUID extraction with a cryptic error.
    mutationFn: () =>
      api.post<{ files: FrameioFile[]; source: "api" | "manual" }>("/api/frameio/list", { url: folderUrl.trim() }),
    onSuccess: (res) => {
      setFetchErr(null);
      setFetchSource(res.source);
      setAssetSource("frameio");
      ingestFiles(res.files);
      toast("success", `Loaded ${res.files.length} file${res.files.length === 1 ? "" : "s"} from Frame.io.`);
    },
    onError: (e: any) => {
      setFetchErr(e.message);
      // Auto-pivot to manual tab for the unrecoverable cases; toast keeps the
      // explanation visible across the tab switch so the user doesn't get lost.
      if (/v4|next\.frame\.io|Adobe IMS|token|access/i.test(e.message)) {
        setSourceTab("upload");
        toast("info", "Frame.io API can't reach this folder — switched you to Drag & drop / upload.");
      } else {
        toast("error", e.message);
      }
    },
  });

  // Cycle 311 — Google Drive folder ingestion. Same shape as fetchFolder
  // so the existing ingestFiles helper handles the file array. The server
  // returns 503 when GOOGLE_DRIVE_* env vars aren't configured; the
  // onError surfaces that as a clear setup hint.
  const fetchDrive = useMutation({
    mutationFn: () =>
      api.post<{ files: FrameioFile[]; source: "api"; folder_id: string }>(
        "/api/gdrive/list",
        { url: driveUrl.trim() },
      ),
    onSuccess: (res) => {
      setDriveErr(null);
      setFetchSource("api");
      setAssetSource("gdrive");
      ingestFiles(res.files);
      toast("success", `Loaded ${res.files.length} file${res.files.length === 1 ? "" : "s"} from Google Drive.`);
    },
    onError: (e: any) => {
      setDriveErr(e?.message ?? "Drive fetch failed");
    },
  });

  function ingestFiles(fs: FrameioFile[]) {
    const base = copyFromCreative();
    const newRows = fs.map((f) => ({
      file_id: f.id,
      file_name: f.name,
      ad_name: deriveAdName(f.name, namingCode, funnel),
      call_to_action: (base.call_to_action as string) ?? "Learn more",
      primary_text: (base.primary_text as string) ?? "",
      headline: (base.headline as string) ?? "",
      description: (base.description as string) ?? "",
      destination_url: destinationUrl,
      preview_url: destinationPreviewUrl || null,
      thumb: f.thumb,
      aspect: aspectFromFilename(f.name),
      // Frame.io's pre-signed CloudFront URL (Cycle 98 — unlocked via the
      // `?include=media_links.original` query parameter). When present the
      // VariationPreview <video> can stream the source bytes directly from
      // Frame.io's CDN instead of forcing the operator to re-drop the file.
      // For Google Drive files, use the drive-proxy-image endpoint to avoid
      // CORS + 429 rate-limiting issues. Pass the Google Drive file ID.
      local_preview_url: f.id && f.thumb ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${f.id}` : f.inline_url ?? null,
      local_mime: f.filetype ?? null,
      local_size: f.size ?? null,
    }));
    setRows(newRows);
  }

  function ingestManualNames() {
    setFetchErr(null);
    const names = manualNames.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (names.length === 0) {
      setFetchErr("Paste at least one filename, one per line.");
      return;
    }
    setFetchSource("manual");
    ingestFiles(
      names.map((n, i) => ({ id: `manual-${i}`, name: n, filetype: null, size: null, thumb: null, source: "manual" as const }))
    );
    toast("success", `Loaded ${names.length} file${names.length === 1 ? "" : "s"} from manual entry.`);
  }

  /**
   * Drag/drop or file-picker ingest. Creates one row per file, generates an
   * in-browser blob URL for instant <video> preview (no upload needed for
   * the launcher to function), and uses the filename as the ad name.
   */
  function ingestLocalFiles(files: FileList | File[] | null) {
    if (!files) return;
    // Cycle 129 Round 5 — size + count guards.
    // Without these: 5GB video → browser hang creating blob URL;
    // 500 files → React tree explosion + memory blowout.
    // Meta's hard cap on advideos is 4GB but anything over 200MB is impractical
    // to round-trip through a browser; tell the operator instead of silently failing.
    const MAX_FILE_BYTES = 200 * 1024 * 1024;   // 200 MB per file
    const MAX_FILE_COUNT = 50;                  // max files per drop
    const all = Array.from(files);
    const oversized = all.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length > 0) {
      toast("error", `${oversized.length} file${oversized.length === 1 ? "" : "s"} skipped: over ${MAX_FILE_BYTES / 1024 / 1024} MB max. (${oversized.map((f) => f.name).slice(0, 3).join(", ")}${oversized.length > 3 ? "…" : ""})`);
    }
    const arr = all
      .filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES)
      .slice(0, Math.max(0, MAX_FILE_COUNT - rows.length));
    if (all.length > arr.length + oversized.length) {
      toast("info", `Capped at ${MAX_FILE_COUNT} rows per package.`);
    }
    if (arr.length === 0) return;
    setFetchErr(null);
    setFetchSource("manual");
    setAssetSource("upload");
    const base = copyFromCreative();
    const newRows = arr.map((f) => {
      const url = URL.createObjectURL(f);
      return {
        file_id: null, // no Frame.io binding for local-drop files
        file_name: f.name,
        ad_name: deriveAdName(f.name, namingCode, funnel),
        call_to_action: (base.call_to_action as string) ?? "Learn more",
        primary_text: (base.primary_text as string) ?? "",
        headline: (base.headline as string) ?? "",
        description: (base.description as string) ?? "",
        destination_url: destinationUrl,
        preview_url: destinationPreviewUrl || null,
        thumb: null,
        // Initial aspect guess from filename; will be overwritten by probe below.
        aspect: aspectFromFilename(f.name),
        local_preview_url: url,
        local_mime: f.type || null,
        local_size: f.size,
        local_file: f,
      };
    });
    const startIdx = rows.length;
    setRows((rs) => [...rs, ...newRows]);
    toast("success", `Loaded ${arr.length} file${arr.length === 1 ? "" : "s"} from your device.`);

    // Probe each file for real mime + dimensions and write back. Filename-based
    // aspect is a guess — actual content trumps it. Detects image vs video by
    // the File's MIME type, then introspects via <img>/<video> metadata.
    arr.forEach(async (f, i) => {
      try {
        const probed = await probeAsset(f);
        if (!probed) return;
        setRows((rs) =>
          rs.map((r, k) => {
            if (k !== startIdx + i) return r;
            const dim = probed.aspect ?? r.aspect;
            // Cycle 439 — also record duration so the validation chip
            // can warn at >60s. Null for images.
            return { ...r, aspect: dim, local_mime: probed.mime ?? r.local_mime, duration_sec: probed.duration_sec };
          }),
        );
      } catch {
        // probe failed (corrupt file etc.) — keep the filename-derived aspect.
      }
    });
  }

  function updateRow(idx: number, patch: Partial<LaunchVariation> & { aspect?: string | null; local_preview_url?: string | null; local_mime?: string | null; local_size?: number | null; local_file?: File | null }) {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== idx) return r;
        const merged = { ...r, ...patch };
        if (patch.file_name !== undefined) merged.aspect = aspectFromFilename(patch.file_name);
        return merged;
      })
    );
  }
  function removeRow(idx: number) { setRows((rs) => rs.filter((_, i) => i !== idx)); }
  function duplicateRow(idx: number) {
    setRows((rs) => {
      const orig = rs[idx];
      if (!orig) return rs;
      // Cycle 163b — orig.ad_name may be empty (Cycle 148 default).
      // Don't generate " (copy)" with a leading space.
      const baseName = orig.ad_name?.trim() || orig.file_name.replace(/\.[a-z0-9]{2,5}$/i, "");
      const copy = { ...orig, file_id: null, ad_name: baseName ? `${baseName} (copy)` : "" };
      return [...rs.slice(0, idx + 1), copy, ...rs.slice(idx + 1)];
    });
  }

  function applySharedCopyToAll() {
    if (rows.length === 0) return;
    const first = rows[0];
    setRows((rs) =>
      rs.map((r, i) =>
        i === 0
          ? r
          : { ...r, call_to_action: first.call_to_action, primary_text: first.primary_text, headline: first.headline, description: first.description, destination_url: first.destination_url }
      )
    );
  }

  // Validation
  const validation = useMemo(() => {
    // `soft: true` marks an advisory warning — it renders in the to-do list
    // but does NOT block Save (see canSave below). Everything without it is a
    // hard blocker. Cycle 512 — the brand-slug/long-video/payload checks were
    // commented "operator can save anyway" but canSave counted them as blockers.
    const issues: { key: string; label: string; step: number; soft?: boolean }[] = [];
    if (!adId.trim()) issues.push({ key: "ad-id", label: "Enter the Ad ID", step: 1 });
    if (!brandId) issues.push({ key: "brand", label: "Pick a Brand", step: 1 });
    if (!productId) issues.push({ key: "product", label: "Pick a Product", step: 1 });
    if (!funnel) issues.push({ key: "funnel", label: "Pick a Funnel", step: 1 });
    // ── Platform-gated requirements ───────────────────────────────────────
    // Meta and AppLovin (Axon) have different account models. Meta needs a
    // FB-page/pixel/IG/ad-set chain; Axon uses per-brand campaign keys and has
    // NO ad-set layer, FB page, pixel, or IG account. To force junk Meta data
    // on an AppLovin operator would be wrong, so every Meta-only rule below is
    // gated behind `platform !== "Applovin"`. The Meta branch is BYTE-IDENTICAL
    // to before this change (zero regression) — only the gate was added.
    const isApplovin = platform === "Applovin";
    const addingToExistingAdset = campaignMode !== "new_per_adset" && adsetMode === "existing";
    if (!isApplovin) {
      if (!accountId) issues.push({ key: "account", label: "Pick a Meta Account", step: 2 });
      if (!fbPageId) issues.push({ key: "fb-page", label: "Pick a Facebook Page", step: 2 });
      if (!addingToExistingAdset && !pixelId) issues.push({ key: "pixel", label: "Pick a Pixel", step: 2 });
      if (pixelId && !tracking) issues.push({ key: "tracking", label: "Pick a Tracking event", step: 2 });
      if (campaignMode === "new_per_adset" && !campaignName.trim()) issues.push({ key: "campaign-name", label: "Name the new campaign", step: 3 });
      if (campaignMode === "new_per_adset" && !campaignObjective) issues.push({ key: "campaign-objective", label: "Pick a Campaign Objective", step: 3 });
      if (campaignMode === "new_per_adset" && !buyingType) issues.push({ key: "buying-type", label: "Pick a Buying Type", step: 3 });
      if (campaignMode === "new_per_adset" && !budgetType) issues.push({ key: "budget-type", label: "Pick a Budget Type", step: 3 });
      if (campaignMode === "new_per_adset" && (!budgetAmount.trim() || Number(budgetAmount) <= 0)) issues.push({ key: "budget-amount", label: "Enter a Budget Amount", step: 3 });
      if (campaignMode === "new_per_adset" && !optimizationGoal) issues.push({ key: "optimization-goal", label: "Pick an Optimization Goal", step: 3 });
      if (!addingToExistingAdset && !attributionSetting) issues.push({ key: "attribution", label: "Pick an Attribution setting", step: 4 });
      if (!addingToExistingAdset && !adSetNameOverride.trim()) issues.push({ key: "adset-name", label: "Name the ad set", step: 4 });
      if (addingToExistingAdset && !existingAdsetId) issues.push({ key: "existing-adset", label: "Pick an existing ad set", step: 4 });
    } else {
      // AppLovin (Axon) spec requirements. The tool REUSES an existing campaign and never
      // creates one / sets targeting / budget / goal / bidding / ad copy — so none of those
      // are validated here. Readiness is intentionally NOT blocking (draft-before-key-ready).
      //  1. An existing Axon campaign must be picked (from the live list).
      if (!applovinCampaignId.trim()) {
        issues.push({ key: "applovin-campaign", label: "Pick an AppLovin campaign to launch into", step: 3 });
      }
      //  2. Clone mode needs a source creative set to clone.
      if (applovinBuildMode === "clone" && !applovinSourceCreativeSetId.trim()) {
        issues.push({ key: "applovin-source-set", label: "Pick a source creative set to clone", step: 3 });
      }
      //  2b. Clone mode: each ad row reuses one-or-more source end-cards (default all). A row is only
      //  invalid if the operator deselected EVERY end-card (a WEB set can't be video-only).
      if (applovinBuildMode === "clone" && applovinSourceCreativeSetId.trim() && rows.length > 0 && applovinSourceEndCards.length > 0) {
        const missing = rows.filter((r: any) => rowSelectedEndCardIds(r).length === 0).length;
        if (missing > 0) {
          issues.push({ key: "applovin-endcard-pick", label: `${missing} row${missing === 1 ? "" : "s"} have no end-card selected — select at least one per row in Step 5`, step: 5 });
        }
      }
      //  3. End-card image (Axon IMG_INTER_P): REQUIRED in create (from-scratch) mode, enforced
      //     per-row below (the `applovin-endcard-required` check). In clone mode it's optional —
      //     the winning source set's end-card is auto-pulled as the default, so no gate here.
    }
    // Cycle 157 — Meta's campaign-name validation. The API rejects names
    // longer than 400 chars or containing certain control characters.
    // Catch it here so Save doesn't fall through to a Meta rejection.
    // (AppLovin runs its own copy of these checks inside the platform-gated
    //  block above, so this Meta branch stays gated to avoid double-pushing.)
    if (!isApplovin && campaignMode === "new_per_adset" && campaignName) {
      if (campaignName.length > 400) {
        issues.push({ key: "campaign-name-long", label: `Campaign name exceeds 400 chars`, step: 3 });
      }
      if (/[\x00-\x1F]/.test(campaignName)) { // eslint-disable-line no-control-regex
        issues.push({ key: "campaign-name-ctrl", label: "Campaign name contains a control character (newline/tab)", step: 3 });
      }
    }
    if (!isApplovin && campaignMode !== "new_per_adset" && !existingCampaignName.trim()) issues.push({ key: "existing-campaign", label: "Pick the existing campaign", step: 3 });
    // AppLovin goal / targeting / bidding validation REMOVED — the AppLovin path reuses an
    // existing campaign and never sets those (they live on the reused campaign). The
    // campaign + build-mode + source-set + per-row end-card checks live in the AppLovin
    // branch above.
    // Existing-ad-set support (86cav8bbn): when adsetMode === "existing" the
    // operator attaches ads to a live ad set (existing_adset_id) and the
    // adset-name / attribution / placement checks above are skipped; otherwise a
    // brand-new ad set is created and named per Step 4's Ad-Set Name input.
    if (!isApplovin && !addingToExistingAdset && placementMode === "manual placements" && manualPlacements.length === 0) issues.push({ key: "placements", label: "Pick a placement (or switch to Advantage+)", step: 4 });
    if (rows.length === 0) issues.push({ key: "rows", label: "Pull files or drop them in", step: 5 });
    // Cycle 148 — ad_name is now optional (Meta auto-generates on launch).
    // Only file_name is mandatory; without it we can't even tell what asset
    // to upload.
    if (rows.length > 0 && rows.some((r) => !r.file_name.trim())) issues.push({ key: "rows-empty", label: "Every row needs a file", step: 6 });
    // Cycle 333 — FB page capacity hard-block. Meta caps each page at 250
    // active ads. If picking this page would push it over, BLOCK the save
    // with a clear message naming the gap.
    if (fbPageId && rows.length > 0) {
      const page = fbPages.find((p) => p.id === fbPageId);
      const live = typeof page?.live_ads_count === "number" ? page.live_ads_count : null;
      const limit = typeof page?.ads_limit === "number" ? page.ads_limit : 250;
      if (live !== null) {
        const available = Math.max(0, limit - live);
        if (rows.length > available) {
          issues.push({
            key: "page-capacity",
            label: `Pick another FB page — "${page?.name ?? "this page"}" has ${available} slot${available === 1 ? "" : "s"} left (${live}/${limit} live) but the package needs ${rows.length}`,
            step: 4,
          });
        }
      }
    }
    // Cycle 156 — duplicate filename across rows. Meta uploads the same
    // bytes twice, the operator pays double, and the ad ID lookup later
    // can't disambiguate. Flag this hard.
    if (rows.length > 1) {
      const seen = new Set<string>();
      let dup = false;
      for (const r of rows) {
        const n = (r.file_name || "").trim().toLowerCase();
        if (!n) continue;
        if (seen.has(n)) { dup = true; break; }
        seen.add(n);
      }
      if (dup) issues.push({ key: "rows-dup-filename", label: "Two rows share the same filename", step: 6 });
    }
    // Destination URL is required — every variation must have a URL set or
    // the launched ad will hit a 404. Lives in Step 1 (Brand · Product ·
    // Funnel). Operator clicked the chip and got dragged to the wrong
    // step previously; fixing to point at Step 1 where the field is.
    // AppLovin reuses an existing campaign, so the click destination is campaign-inherited and
    // the tool sends no destination to Axon — only Meta requires a per-variation destination URL.
    if (platform !== "Applovin" && rows.length > 0 && rows.some((r) => !r.destination_url || !r.destination_url.trim())) {
      issues.push({ key: "destination", label: "Pick a destination URL", step: 1 });
    }
    // Cycle 439 — long-video warning. Videos >60s have noticeably
    // worse Meta CPM in our data; surface a non-blocking soft warning
    // so the operator knows what they're shipping. Uses the duration
    // probed at drop-time; rows without a duration (Frame.io rows,
    // images) are skipped.
    const longVideos = rows.filter((r: any) => typeof r.duration_sec === "number" && r.duration_sec > 60);
    if (longVideos.length > 0) {
      const maxDur = Math.max(...longVideos.map((r: any) => r.duration_sec));
      issues.push({
        key: "long-video",
        label: `${longVideos.length} video${longVideos.length === 1 ? "" : "s"} > 60s (longest ${Math.round(maxDur)}s). Meta CPM tends to suffer past 60s — review or trim.`,
        step: 5,
        soft: true,
      });
    }
    // Cycle 436 — total payload size warning at 500 MB. Operator-set
    // threshold; the older 1 GB amber chip stays but this adds a
    // validation issue so the operator can't miss it before Save.
    // Cycle 496 — scope the sum to LOCAL-only rows (no file_id). Frame.io-
    // bound rows save instantly (just the file_id reference goes to the
    // DB; the bytes never round-trip through the browser). The prior
    // implementation summed every row's local_size and fired even on
    // pure-Frame.io packages, blocking save with misleading
    // "Consider Frame.io pull instead" copy — operators who'd already
    // pulled from Frame.io had no remediation path. Now: this only
    // fires when there's actually a heavy LOCAL-drop payload to upload.
    const localOnly = rows.filter((r: any) => !r.file_id);
    const totalLocalBytes = localOnly.reduce((s, r: any) => s + (r.local_size ?? 0), 0);
    const PAYLOAD_WARN_MB = 500;
    if (totalLocalBytes > PAYLOAD_WARN_MB * 1024 * 1024) {
      const mb = (totalLocalBytes / 1024 / 1024).toFixed(0);
      issues.push({
        key: "payload-size",
        label: `${localOnly.length} local-only row${localOnly.length === 1 ? "" : "s"} total ${mb} MB (> ${PAYLOAD_WARN_MB} MB) — save will round-trip through your browser. Frame.io-bound rows are unaffected.`,
        step: 5,
        soft: true,
      });
    }
    // Cycle 371 — Meta launch only supports Frame.io-backed video URLs.
    // Local drag-drop rows have file_id=null and would fail server-side
    // (`drag-drop uploads not yet supported on this launch path`). Catch
    // it pre-flight so the operator knows BEFORE saving + clicking Launch.
    // Both launch paths upload from Frame.io (Meta: video URL; AppLovin: the
    // Axon multipart upload pulls bytes via the Frame.io file_id). Either way a
    // row with no file_id can't be launched, so flag it for both — only the
    // platform name in the message differs.
    const localOnlyRows = rows.filter((r) => !r.file_id);
    if (localOnlyRows.length > 0) {
      issues.push({
        key: "no-frameio-binding",
        label: `${localOnlyRows.length} row${localOnlyRows.length === 1 ? "" : "s"} have no Frame.io binding — ${isApplovin ? "AppLovin" : "Meta"} launch will fail. Re-import from Frame.io or remove the row.`,
        step: 5,
      });
    }
    // AppLovin only: a WEB creative set cannot be video-only — Axon needs a poster image
    // (IMG_INTER_P). The backend resolves one automatically from, in order: an operator end-card,
    // the row's preview_url, or the Frame.io video thumbnail (derived from file_id). So a row only
    // truly lacks an image if it has NONE of those — which won't happen for a valid Frame.io row.
    // (Meta has no equivalent rule.)
    if (isApplovin && rows.length > 0) {
      const noImage = rows.filter((r: any) => {
        const hasPreview = typeof r.preview_url === "string" && r.preview_url.trim();
        const hasThumb = typeof r.thumb === "string" && r.thumb.trim();
        const hasFrameio = typeof r.file_id === "string" && r.file_id.trim(); // → backend derives a Frame.io thumbnail
        const hasEndCard =
          r.applovin_end_card_local_file instanceof File ||
          (typeof r.applovin_end_card_file_id === "string" && r.applovin_end_card_file_id.trim()) ||
          (typeof r.applovin_end_card_upload_url === "string" && r.applovin_end_card_upload_url.trim());
        return !hasPreview && !hasThumb && !hasFrameio && !hasEndCard;
      });
      if (noImage.length > 0) {
        issues.push({
          key: "applovin-no-image",
          label: `${noImage.length} row${noImage.length === 1 ? "" : "s"} have no resolvable image (preview/thumbnail) — AppLovin needs a poster image per creative.`,
          step: 5,
        });
      }
      // End-card is REQUIRED when building from scratch (create mode). AppLovin rejects/blocks a
      // from-scratch WEB set whose only image is the auto video-poster (often the wrong ratio →
      // IMG_ICON rejection). Clone mode is exempt — it auto-reuses the winning source set's end-card.
      if (applovinBuildMode !== "clone") {
        const missingEndCard = rows.filter((r: any) => !(
          r.applovin_end_card_local_file instanceof File ||
          (typeof r.applovin_end_card_file_id === "string" && r.applovin_end_card_file_id.trim()) ||
          (typeof r.applovin_end_card_upload_url === "string" && r.applovin_end_card_upload_url.trim())
        ));
        if (missingEndCard.length > 0) {
          issues.push({
            key: "applovin-endcard-required",
            label: `${missingEndCard.length} row${missingEndCard.length === 1 ? "" : "s"} need an end-card image — AppLovin requires one per creative when building from scratch. Upload a 9:16 end-card in Step 5.`,
            step: 5,
          });
        }
      }
    }
    // Cycle 482 — hostname-vs-brand typo guard. If the actual URL's
    // hostname doesn't contain the brand-name slug (alpha lower), warn.
    // Catches paste-of-wrong-brand mistakes that survived through
    // template selection. Soft warning — operator can save anyway.
    if (destinationUrl && selectedBrand?.name) {
      try {
        const host = new URL(destinationUrl).hostname.toLowerCase().replace(/^www\./, "");
        const brandSlug = selectedBrand.name.toLowerCase().replace(/[^a-z]/g, "");
        if (brandSlug.length >= 4 && !host.includes(brandSlug)) {
          issues.push({
            key: "hostname-mismatch",
            label: `Destination hostname "${host}" doesn't contain the brand slug "${brandSlug}" — typo? Or wrong destination URL picked.`,
            step: 1,
            soft: true,
          });
        }
      } catch {
        // URL didn't parse — earlier checks already surface this.
      }
    }
    // Cycle 363 — preview URL is also required (Meta's actual-vs-display
    // distinction). Manual mode shows the field; template mode resolves
    // from destination_urls.preview_url. Legacy template rows that have
    // no preview URL set fail here so operators are forced to fix the
    // template in /destinations before launching.
    // Cycle 447 — jump target is Step 1 (where the destination/preview
    // URL fields actually live), not Step 6 (Review). Operator complaint:
    // chip was dragging them to the creative-template area.
    // Disabled per operator request — preview URL is no longer a blocking validation.
    // if (rows.length > 0 && (!destinationPreviewUrl || !destinationPreviewUrl.trim())) {
    //   const reason = destinationChoice === "custom"
    //     ? "Enter the preview (display) URL — Manual mode (Step 1)"
    //     : "Selected destination has no preview URL — edit it in /destinations";
    //   issues.push({ key: "preview-url", label: reason, step: 1 });
    // }
    // Per-row required copy. Meta rejects ads with empty primary/headline,
    // and we always need a CTA to render the call-to-action button.
    // Per-index keys (`row-cta-{i}`) so each row's specific input can be
    // highlighted in Step 6. AppLovin never sets ad copy (the reused campaign owns it),
    // so these are Meta-only.
    if (!isApplovin) {
      rows.forEach((r, i) => {
        if (!r.call_to_action?.trim()) issues.push({ key: `row-cta-${i}`, label: `Pick a CTA on row ${i + 1}`, step: 6 });
        if (!r.headline?.trim()) issues.push({ key: `row-headline-${i}`, label: `Headline is required on row ${i + 1}`, step: 6 });
        if (!r.primary_text?.trim()) issues.push({ key: `row-primary-${i}`, label: `Primary text is required on row ${i + 1}`, step: 6 });
      });
      // Meta character caps — exceeding causes silent truncation OR rejection
      // depending on placement. Surface up-front so the operator catches it
      // before save. Limits per Meta Ads Manager: 125 / 40 / 30.
      if (rows.some((r) => (r.primary_text?.length ?? 0) > CHAR_LIMITS.primary_text)) {
        issues.push({ key: "rows-primary-over", label: `Primary text exceeds ${CHAR_LIMITS.primary_text} chars on at least one ad`, step: 6 });
      }
      if (rows.some((r) => (r.headline?.length ?? 0) > CHAR_LIMITS.headline)) {
        issues.push({ key: "rows-headline-over", label: `Headline exceeds ${CHAR_LIMITS.headline} chars on at least one ad`, step: 6 });
      }
      if (rows.some((r) => (r.description?.length ?? 0) > CHAR_LIMITS.description)) {
        issues.push({ key: "rows-desc-over", label: `Description exceeds ${CHAR_LIMITS.description} chars on at least one ad`, step: 6 });
      }
    }
    // Cycle 143 — ad_name has a hard cap of 512 in the Meta API. Catch it
    // here so Save doesn't fall through to a confusing Meta rejection.
    if (rows.some((r) => (r.ad_name?.length ?? 0) > CHAR_LIMITS.ad_name)) {
      issues.push({ key: "rows-ad-name-over", label: `Ad name exceeds ${CHAR_LIMITS.ad_name} chars on at least one ad`, step: 6 });
    }
    // Schedule is required ONLY in "schedule" mode — the operator must pick a
    // future datetime. In "launch now" mode there's no schedule to validate (it
    // fires immediately). Every OTHER validation above still applies in both modes,
    // so "launch now" can never bypass a genuinely invalid form.
    if (launchMode === "schedule") {
      if (!scheduledFor.trim()) {
        issues.push({ key: "schedule", label: "Pick a schedule time", step: 6 });
      } else {
        const acct = accounts.find((a) => a.id === accountId);
        const tz = acct?.timezone_name ?? null;
        const ms = tz
          ? Date.parse(naiveTzStringToUtcIso(scheduledFor, tz))
          : new Date(scheduledFor).getTime();
        if (Number.isFinite(ms) && ms <= Date.now()) {
          issues.push({ key: "schedule-past", label: "Schedule time must be in the future", step: 6 });
        }
      }
    }
    return issues;
  }, [
    adId, brandId, productId, funnel,
    accountId, fbPageId, pixelId, tracking,
    campaignMode, campaignName, existingCampaignName, existingCampaignId,
    adsetMode, existingAdsetId,
    campaignObjective, buyingType, budgetType, budgetAmount, optimizationGoal,
    platform, goalType, roasDayTarget, eventTarget, applovinReadiness.configured,
    applovinCountriesList,
    applovinCampaignId, applovinBuildMode, applovinSourceCreativeSetId, applovinSourceEndCards,
    attributionSetting, adSetNameOverride,
    placementMode, manualPlacements,
    fbPages, rows,
    destinationUrl, destinationPreviewUrl, destinationChoice, selectedBrand?.name,
    scheduledFor, accounts, launchMode,
  ]);

  // Map of validation issue key → label, derived from `validation`.
  // Used to render inline red border + small error message under each
  // affected field (in addition to the bottom chip summary).
  const errorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of validation) m[v.key] = v.label;
    return m;
  }, [validation]);

  // Tailwind class fragment to append to an input/select trigger when
  // its field has a validation error. Caller wires this into existing
  // className via template-string interpolation.
  const errCls = (key: string) =>
    errorMap[key] ? " !border-rose-400 !ring-1 !ring-rose-200" : "";

  // Per-row error lookup for Step 6. Keys are `row-{kind}-{i}`.
  const rowErr = (i: number, kind: "cta" | "headline" | "primary") =>
    errorMap[`row-${kind}-${i}`];

  function jumpToStep(step: number) {
    const el = document.getElementById(`launch-step-${step}`);
    if (!el) return;
    // scrollIntoView with "smooth" can be silently ignored when prefers-reduced-motion
    // is set or the user-agent disables it. Compute the target manually and animate.
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - 24;
    try {
      window.scrollTo({ top: targetY, behavior: "smooth" });
    } catch {
      window.scrollTo(0, targetY);
    }
    // Fallback if smooth scroll was no-op
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - targetY) > 8) window.scrollTo(0, targetY);
    }, 600);
    el.classList.add("ring-2", "ring-amber-400");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1600);
    // Focus the first interactive field inside the step for keyboard users
    const focusable = el.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])"
    );
    focusable?.focus({ preventScroll: true });
  }

  // Determine asset_type based on source: Frame.io = Video, Google Drive = Image, Upload = mixed/both
  function getAssetType(): string {
    if (assetSource === "frameio") return "Video";
    if (assetSource === "gdrive") return "Image";
    if (assetSource === "upload") {
      const hasVideo = rows.some((r) => r.local_mime?.startsWith("video/"));
      const hasImage = rows.some((r) => r.local_mime?.startsWith("image/"));
      if (hasVideo && hasImage) return "Mixed";
      if (hasVideo) return "Video";
      if (hasImage) return "Image";
      return "Mixed";
    }
    return "Mixed";
  }

  // Cycle 222 — track "force=1" override so the second click within 30s
  // confirms a near-duplicate save instead of being blocked.
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const saveLaunch = useMutation({
    mutationFn: async () => {
      // Upload any locally-selected files to Supabase before saving so the
      // backend receives a real public URL instead of a browser-only blob URL.
      const variationRows = await Promise.all(
        rows.map(async (row) => {
          let next: typeof row = row;
          // Upload the video/local asset (existing behaviour).
          if (row.local_file instanceof File && row.local_preview_url?.startsWith("blob:")) {
            const ext = row.local_file.name.split(".").pop() ?? "bin";
            const path = `${crypto.randomUUID()}.${ext}`;
            const { error } = await supabase.storage
              .from("launch-assets")
              .upload(path, row.local_file, { contentType: row.local_file.type || undefined });
            if (error) throw new Error(`Upload failed for "${row.file_name}": ${error.message}`);
            const { data: { publicUrl } } = supabase.storage.from("launch-assets").getPublicUrl(path);
            next = { ...next, local_preview_url: publicUrl };
          }
          // AppLovin end-card image (IMG_INTER_P): upload the operator's local end-card file
          // to Supabase and record its public URL so the backend receives a real URL.
          if (platform === "Applovin" && (row as any).applovin_end_card_local_file instanceof File) {
            const ecFile: File = (row as any).applovin_end_card_local_file;
            const ext = ecFile.name.split(".").pop() ?? "png";
            const path = `endcard/${crypto.randomUUID()}.${ext}`;
            const { error } = await supabase.storage
              .from("launch-assets")
              .upload(path, ecFile, { contentType: ecFile.type || undefined });
            if (error) throw new Error(`End-card upload failed for "${row.file_name}": ${error.message}`);
            const { data: { publicUrl } } = supabase.storage.from("launch-assets").getPublicUrl(path);
            next = {
              ...next,
              applovin_end_card_source: "upload",
              applovin_end_card_upload_url: publicUrl,
            } as typeof row;
          }
          // Clone mode: send the SELECTED source end-card asset ids (comma-joined; default = all).
          // The backend reuses these by id and swaps in only the new video.
          if (platform === "Applovin" && applovinBuildMode === "clone") {
            next = { ...next, applovin_end_card_asset_id: rowSelectedEndCardIds(row).join(",") } as typeof row;
          }
          return next;
        }),
      );
      return api.post<{ id: string }>(`/api/launches${forceDuplicate ? "?force=1" : ""}`, {
        ad_id: adId.trim(),
        clickup_task_url: adIdImported?.clickup_task_url ?? adIdImported?.suggested_clickup_task_url ?? null,
        frameio_folder_url_suggested: adIdImported?.suggested_frameio_folder_url ?? null,
        name: packageName || adId.trim(),
        brand_id: brandId || null,
        product_id: productId || null,
        meta_account_id: accountId || null,
        audience_template_id: audienceTemplateId || null,
        // Cycle 361 — targeting_template_id always null now (templates dropped).
        targeting_template_id: null,
        // Cycle 345 — per-launch targeting overrides (only sent when
        // operator actually tweaked the field; null = inherit template).
        targeting_age_min: overrideAgeMin,
        targeting_age_max: overrideAgeMax,
        targeting_genders: overrideGenders,
        targeting_include_audience_ids: overrideIncludeIds,
        targeting_exclude_audience_ids: overrideExcludeIds,
        pixel_id: pixelId || null,
        tracking: tracking || null,
        fb_page_id: fbPageId || null,
        ig_account_id: igAccountId || null,
        creative_template_id: creativeTemplateId || null,
        funnel: funnel || null,
        audience_template: audienceTemplates.find((a) => a.id === audienceTemplateId)?.name ?? null,
        preview_url: destinationPreviewUrl || null,
        frameio_folder_url: folderUrl || null,
        ad_set_name_override: adSetNameOverride || null,
        apply_to_all_ad_copy: applyToAllAdCopy,
        campaign_mode: campaignMode,
        campaign_name: campaignMode === "new_per_adset" ? campaignName || null : null,
        existing_campaign_name: campaignMode !== "new_per_adset" ? existingCampaignName || null : null,
        existing_campaign_id: campaignMode !== "new_per_adset" ? existingCampaignId || null : null,
        existing_adset_id: (campaignMode !== "new_per_adset" && adsetMode === "existing") ? existingAdsetId || null : null,
        existing_adset_name: (campaignMode !== "new_per_adset" && adsetMode === "existing") ? existingAdsetName || null : null,
        adset_template_id: campaignMode !== "new_per_adset" ? adsetTemplateId || null : null,
        // campaign_objective + buying_type + budget_type + budget_amount
        // + optimization_goal are sent in ALL modes:
        // - new_per_adset → used to build the new campaign + ad set
        // - existing_abo / existing_cbo → applied to the NEW ad set
        //   created under the picked existing campaign
        campaign_objective: campaignMode === "new_per_adset"
          ? campaignObjective
          : (campaignObjective || null),
        buying_type: campaignMode === "new_per_adset"
          ? buyingType
          : (buyingType || null),
        budget_type: campaignMode === "new_per_adset"
          ? budgetType
          : (budgetType || null),
        budget_amount: campaignMode === "new_per_adset"
          ? (budgetAmount || null)
          : (budgetAmount || null),
        optimization_goal: campaignMode === "new_per_adset"
          ? optimizationGoal
          : (optimizationGoal ? (OPTIMIZATION_MAP[optimizationGoal] ?? optimizationGoal) : null),
        attribution_setting: attributionSetting,
        placement_mode: placementMode,
        manual_placements: placementMode === "manual placements" ? manualPlacements : [],
        asset_type: getAssetType(),
        // Cycle 304 / 406 — operator's input is naive YYYY-MM-DDTHH:MM
        // interpreted in the AD ACCOUNT'S tz (not browser tz). Convert
        // to UTC ISO using the account tz. Empty string = launch
        // immediately. Falls back to browser tz if no account tz known
        // (legacy / no admanage mirror yet).
        scheduled_for: (() => {
          if (launchMode !== "schedule") return null; // launch-now: no schedule
          if (!scheduledFor.trim()) return null;
          const acct = accounts.find((a) => a.id === accountId);
          const tz = acct?.timezone_name ?? null;
          return tz ? naiveTzStringToUtcIso(scheduledFor, tz) : new Date(scheduledFor).toISOString();
        })(),
        // Launch-now: tell the backend to enqueue this package onto the background
        // launch queue immediately (createPackage's auto_launch path → 202 + job_id).
        // Schedule mode leaves this false and relies on the scheduled worker. Ships
        // PAUSED unless Ship-as is ACTIVE (launch_paused above), same as any launch.
        auto_launch: launchMode === "now",
        // Cycle 307 — explicit per-launch PAUSED/ACTIVE override.
        launch_paused: launchPaused,
        // Platform selector (Meta default). Sent in all modes so the backend persists which
        // platform this draft targets; the Meta launch path ignores the AppLovin-only fields.
        platform,
        // AppLovin (Axon) spec fields — the tool REUSES an existing campaign and never sets
        // targeting / budget / goal / bidding / ad copy, so none of those are sent anymore.
        //  - applovin_campaign_id: the existing Axon campaign the operator picked.
        //  - applovin_build_mode: "create" | "clone".
        //  - applovin_source_creative_set_id: source set to clone (Clone mode only).
        // Null for Meta so nothing leaks across.
        applovin_campaign_id: platform === "Applovin" ? (applovinCampaignId.trim() || null) : null,
        applovin_build_mode: platform === "Applovin" ? applovinBuildMode : null,
        applovin_source_creative_set_id:
          platform === "Applovin" && applovinBuildMode === "clone"
            ? (applovinSourceCreativeSetId.trim() || null)
            : null,
        variations: variationRows,
      });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["launches"] });
      clearDraft(DRAFT_KEY); // saved → no more draft
      // Message must match what actually happened, so nobody misreads it:
      //  - launch now (auto_launch → 202 with job_id): it's firing right now.
      //  - schedule: parked until the chosen time.
      //  - plain draft (neither): saved, launch later from the log.
      if (launchMode === "now" || res?.job_id) {
        toast(
          "success",
          launchPaused
            ? `Launching now in the background — every ad lands PAUSED. Track it in the launch log.`
            : `Launching now in the background — ads go LIVE (Ship as ACTIVE). Track it in the launch log.`,
        );
      } else if (launchMode === "schedule") {
        toast("success", `Scheduled — it will fire at the time you set. Track it in the launch log.`);
      } else {
        toast("success", `Saved as DRAFT — open the package and click Launch to push to Meta.`);
      }
      nav(`/ads-launcher/log`);
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Save failed");
      // Cycle 222 — server returned 409 "near-duplicate"; flip the
      // force flag so the operator's next click bypasses the check.
      if (/saved \d+s ago/.test(msg) || /A launch for this Ad ID/.test(msg)) {
        setForceDuplicate(true);
        toast("error", `${msg} (Click Save again to confirm.)`);
        // Reset the force flag after 30s so it doesn't linger.
        setTimeout(() => setForceDuplicate(false), 30_000);
      } else {
        toast("error", msg);
      }
    },
  });

  // Auto-save the form state on every change once hydration is done.
  useEffect(() => {
    if (!draftHydrated) return;
    if (cloneFromId) return; // ?from= flow handles its own redirect
    // Skip an entirely empty form so first-load doesn't drop a useless draft.
    const empty =
      !adId.trim() &&
      !packageName.trim() &&
      !brandId &&
      !productId &&
      !accountId &&
      !funnel &&
      rows.length === 0;
    if (empty) return;
    // Cycle 421 — confirm-on-unload guard. When the operator has rows
    // staged (the most expensive state to lose), warn before
    // close/refresh. Listener is cheap — it short-circuits when
    // rows.length === 0. Browsers ignore custom messages; only the
    // standard "Leave site?" dialog fires.
    // Side note: writeDraft persists every change in localStorage so
    // the actual draft is recoverable on next mount; this guard
    // protects the in-memory blob URLs (lost on reload) + any
    // half-typed copy that hasn't yet debounced into the draft.
    // Cycle 294 — debounce the draft save by 600ms so typing into the
    // campaignName / primaryText / headline fields doesn't fire
    // localStorage.setItem on every keystroke. Each writeDraft does a
    // full JSON.stringify of the whole form, which (with media rows in
    // memory) is meaningful main-thread work.
    const handle = window.setTimeout(() => {
      writeDraft(DRAFT_KEY, {
        adId, adIdImported,
        platform, goalType, roasDayTarget, eventTarget,
        applovinCountries, applovinCountriesUserSet, applovinBiddingStrategy, applovinCreativeSetName,
        applovinCampaignId, applovinBuildMode, applovinSourceCreativeSetId,
        packageName, brandId, productId, accountId, funnel,
        audienceTemplateId, pixelId, tracking, fbPageId, igAccountId, creativeTemplateId,
        campaignMode, campaignName, existingCampaignName, campaignObjective,
        buyingType, budgetType, budgetAmount, optimizationGoal,
        attributionSetting, adSetNameOverride, applyToAllAdCopy,
        placementMode, manualPlacements,
        folderUrl, manualNames, rows, sourceTab,
      });
      setDraftSavedAt(Date.now());
    }, 600);
    return () => window.clearTimeout(handle);
  }, [
    draftHydrated, cloneFromId,
    adId, adIdImported,
    platform, goalType, roasDayTarget, eventTarget,
    applovinCountries, applovinCountriesUserSet, applovinBiddingStrategy, applovinCreativeSetName,
    packageName, brandId, productId, accountId, funnel,
    audienceTemplateId, pixelId, tracking, fbPageId, igAccountId, creativeTemplateId,
    campaignMode, campaignName, existingCampaignName, campaignObjective,
    buyingType, budgetType, budgetAmount, optimizationGoal,
    attributionSetting, adSetNameOverride, applyToAllAdCopy,
    placementMode, manualPlacements,
    folderUrl, manualNames, rows, sourceTab,
    adId, adIdImported,
  ]);

  // Soft advisories (brand-slug mismatch, long-video, payload-size) surface in
  // the to-do list but must NOT block Save — only hard blockers gate the button.
  const canSave = validation.filter((i) => !i.soft).length === 0;

  // Ticking now-string so "Auto-saved Ns ago" updates without other re-renders
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!draftSavedAt) return;
    const id = window.setInterval(() => setNowTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [draftSavedAt]);

  // Cmd+Enter / Ctrl+Enter to save (when the form is valid)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (canSave && !saveLaunch.isPending) {
          e.preventDefault();
          saveLaunch.mutate();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, saveLaunch]);

  // Cycle 204 — beforeunload warning when the operator has meaningful
  // unsaved state (rows added or copy typed). Browser shows its native
  // "Leave site? Changes you made may not be saved." dialog. Skipped
  // during the save mutation itself (avoid spurious warning on success
  // redirect).
  useEffect(() => {
    const hasUnsavedWork = rows.length > 0 || packageName.trim().length > 0;
    if (!hasUnsavedWork || saveLaunch.isSuccess) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the string, but setting returnValue is
      // still required to trigger the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [rows.length, packageName, saveLaunch.isSuccess]);

  // Step completion derived from validation
  const stepHasIssue = (n: number) => validation.some((v) => v.step === n);
  const stepStatus = (n: number): "complete" | "current" | "todo" => {
    if (!stepHasIssue(n)) {
      // step 6 only "complete" once rows exist
      if (n === 6 && rows.length === 0) return "todo";
      return "complete";
    }
    // First incomplete step is "current"
    const firstIncomplete = [1, 2, 3, 4, 5, 6].find((s) => stepHasIssue(s)) ?? 6;
    return n === firstIncomplete ? "current" : "todo";
  };
  // Step labels are platform-aware. Meta keeps its exact wording (byte-identical,
  // zero regression). AppLovin (Axon) has no FB-page/pixel/IG/ad-set model, so the
  // Meta-only labels are relabeled to platform-appropriate Axon copy.
  const STEP_LABELS = platform === "Applovin"
    ? ["Brand · Product", "Destination", "Campaign", "Targeting", "Files", "Review"]
    : ["Brand · Product", "Meta Targeting", "Campaign", "Ad-Set", "Files", "Review"];
  // Visible steps per platform. AppLovin hides Meta-only Step 2 (targeting) and Step 4 (ad-set),
  // so the progress rail, headings and to-do renumber the logical steps 1·3·5·6 → shown 1·2·3·4.
  const VISIBLE_STEPS = platform === "Applovin" ? [1, 3, 5, 6] : [1, 2, 3, 4, 5, 6];
  const stepDisplayNo = (logical: number) => {
    const i = VISIBLE_STEPS.indexOf(logical);
    return i >= 0 ? i + 1 : logical;
  };

  // Gate: launcher locked until an ad-ID is entered
  const adIdEntered = adId.trim().length > 0;

  async function importDetails() {
    if (!adId.trim()) return;
    setAdIdImporting(true);
    setAdIdImportErr(null);
    try {
      const r = await api.post<AdLookupResult>("/api/ad-lookup/import", { ad_id: adId.trim(), platform });
      setAdIdImported(r);
      // Pre-fill brand/product/funnel
      if (r.brand_id) setBrandId(r.brand_id);
      if (r.product_id) setProductId(r.product_id);
      if (r.funnel) setFunnel(r.funnel);
      // Reset Package Name on new Ad ID import
      setPackageName(adId.trim());
      // Pre-fill Ad-Set Name (Step 4) from API response
      if (r.ad_set_name) {
        setAdSetNameOverride(r.ad_set_name);
      }
      // Apply the resolved destination URL (if any) by id — the destinations
      // useQuery refetch will pick it up.
      if ((r as any).resolved_destination_url?.id) {
        setDestinationChoice((r as any).resolved_destination_url.id);
      }
      if ((r as any).resolved_creative_template?.id) {
        setCreativeTemplateId((r as any).resolved_creative_template.id);
      }
      // Prefill Step 5 source tab and URL based on ad_type
      if (r.ad_type === "VID" && r.frameio_url) {
        setSourceTab("url");
        setFolderUrl(r.frameio_url);
      } else if ((r.ad_type === "TSL" || r.ad_type === "IMG") && r.gdrive_url) {
        setSourceTab("gdrive");
        setDriveUrl(r.gdrive_url);
      }
      toast("success", r.brand_name ? `Imported ${r.brand_name} · ${r.product_name} · ${r.funnel}` : "Ad ID accepted — pick details manually.");
    } catch (e: any) {
      setAdIdImportErr(e?.message ?? "Lookup failed");
      // Clear form data on import error
      setAdIdImported(null);
      setBrandId("");
      setProductId("");
      setFunnel("");
      setPackageName("");
      setAdSetNameOverride("");
      setDestinationChoice("");
      setCreativeTemplateId("");
      setSourceTab("url");
      setFolderUrl("");
      setDriveUrl("");
    } finally {
      setAdIdImporting(false);
    }
  }

  // Per-row warning if file name doesn't start with the ad ID *anywhere in
  // the leading filename tokens*. The user's spec: presence (in the beginning)
  // is sufficient — exact equality is NOT required. We strip the file
  // extension and check whether the ad_id appears as a prefix or as one of
  // the early underscore-separated tokens.
  function rowAdIdWarning(fileName: string): boolean {
    if (!adId.trim() || !fileName) return false;
    const clean = adId.trim().toUpperCase().replace(/[_\s-]+$/g, "");
    const stem = fileName.toUpperCase().replace(/\.[a-z0-9]{2,5}$/i, "");
    if (stem.startsWith(clean)) return false;
    // Check the first 3 tokens of the filename for the ad-id substring.
    const head = stem.split(/[_\s-]+/).slice(0, 3).join("_");
    if (head.includes(clean)) return false;
    return true;
  }

  // Tiny inline error message under a form field. Renders nothing
  // when there's no validation issue for the given key.
  const FieldError = ({ for: key, msg }: { for?: string; msg?: string | null }) => {
    const text = msg ?? (key ? errorMap[key] : null);
    if (!text) return null;
    return (
      <p className="text-[11px] text-rose-600 mt-1 flex items-start gap-1" role="alert">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[2px]">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{text}</span>
      </p>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="shrink-0 flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Launch an Ad Package</h1>
          {/* Cycle 194 — visible "cloned from X" pill that stays put
              throughout the form until the operator saves. Operators
              were forgetting they were inside a clone after editing for
              a while; small persistent reminder prevents accidentally
              overwriting the parent's intent. */}
          {clonedFromName && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-violet-800 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full" title="Hydrated from an existing package. Edits create a NEW launch — the source row stays untouched.">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              cloned from <span className="font-semibold truncate max-w-[200px]">{clonedFromName}</span>
            </span>
          )}
        </div>
        {draftSavedAt && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500" title="Your work is auto-saved to this browser as you type.">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Auto-saved {relativeTime(draftSavedAt)}
            {/* Cycle 202 — explicit "Reset" link. Operators occasionally
                want to wipe a half-typed draft and start clean without
                navigating away and back. */}
            <button
              type="button"
              className="ml-1 text-slate-400 hover:text-rose-600 underline decoration-dotted"
              title="Discard everything you've typed and start a fresh launch."
              onClick={async () => {
                if (!(await confirmAct({
                  title: "Clear this draft?",
                  description: "Everything you've typed in this launcher session will be erased.",
                  tone: "danger",
                  confirmLabel: "Clear draft",
                }))) return;
                clearDraft(DRAFT_KEY);
                window.location.reload();
              }}
            >
              Reset
            </button>
          </span>
        )}
      </div>
      {draftRestoredAt && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <div className="text-xs text-sky-900">
            <span className="font-semibold">Restored your draft</span>
            <span className="text-sky-700"> · saved {relativeTime(draftRestoredAt)}</span>
            {/* Cycle 248 — Ad ID + row-count chip so operator knows
                which draft they restored without scrolling. */}
            {(adId.trim() || rows.length > 0) && (
              <span className="ml-2 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-white border border-sky-200 font-mono text-[10px] text-sky-800">
                {adId.trim() || "(no ad id)"}
                <span className="opacity-60">·</span>
                <span>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
              </span>
            )}
            {/* Cycle 249 — orphaned reference warning. If the draft has
                a brand/product/account ID but that record no longer
                exists in the current data, the operator's about to
                hit a dead-end. Surface it explicitly.
                Cycle 252 — chip is now clickable to clear all stale
                refs in one go. */}
            {(() => {
              const orphans: string[] = [];
              if (brandId && !brands.find((b) => b.id === brandId)) orphans.push("brand");
              if (productId && !products.find((p) => p.id === productId)) orphans.push("product");
              if (accountId && !accounts.find((a) => a.id === accountId)) orphans.push("account");
              if (orphans.length === 0) return null;
              return (
                <button
                  type="button"
                  className="ml-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100"
                  title="Click to clear all stale reference values so you can re-pick them."
                  onClick={() => {
                    if (orphans.includes("brand")) setBrandId("");
                    if (orphans.includes("product")) setProductId("");
                    if (orphans.includes("account")) setAccountId("");
                  }}
                >
                  ⚠ stale reference: {orphans.join(", ")} — click to reset
                </button>
              );
            })()}
          </div>
          <button
            className="text-xs font-semibold text-sky-700 hover:text-sky-900 underline"
            onClick={async () => {
              if (!(await confirmAct({ title: "Discard this draft?", description: "Your in-progress launch will be cleared and you'll start fresh.", tone: "danger", confirmLabel: "Discard draft" }))) return;
              clearDraft(DRAFT_KEY);
              window.location.reload();
            }}
          >
            Discard draft
          </button>
        </div>
      )}
      {!draftRestoredAt && <div className="mb-6" />}

      {/* Step 0 — Ad ID gate (always first) */}
      <div className="al-card mb-6 border-brand-200/60 bg-gradient-to-br from-white to-brand-50/40">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold">0</span>
          <h2 className="font-semibold text-slate-900">Start with the Ad ID</h2>
        </div>
        <p className="text-xs text-slate-600 mb-3">
          Paste the Ad ID from your ClickUp task. We'll pre-fill the brand, product, and funnel; suggest the Frame.io folder; and bind this launch to that task in the ads database when it goes live.
        </p>
        {/* Platform toggle — drives which Destination URL gets resolved and which platform's
            settings show below. AppLovin is enabled when the selected brand's Axon campaign
            key is configured (readiness mirrors PlatformStatusCard's key_status). */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Launch platform">
            {(["Meta", "Applovin"] as const).map((p) => {
              const active = platform === p;
              // Both platforms are always selectable — picking the platform is free.
              // AppLovin push-readiness is gated later (Log page), never at selection.
              const disabled = false;
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => !disabled && setPlatform(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    active
                      ? "bg-brand-500 text-white shadow-sm"
                      : disabled
                      ? "text-slate-400 cursor-not-allowed"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  title={disabled ? "AppLovin not ready for this brand — configure the Axon campaign key first" : ""}
                >
                  {p}
                  {disabled && <span className="ml-1.5 text-[9px] uppercase tracking-wider opacity-70">not ready</span>}
                </button>
              );
            })}
          </div>
          {/* AppLovin readiness chip — mirrors the key_status pill concept from the Log page.
              Only shown when AppLovin is the active platform so the operator sees brand readiness. */}
          {platform === "Applovin" && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                !brandId
                  ? "bg-slate-100 text-slate-500"
                  : applovinReadiness.configured
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
              title="AppLovin (Axon) key status for the selected brand. Keys live in the server environment per brand; a configured brand is ready to launch."
            >
              {/* No brand yet → nothing to check. Configured (env key present) → ready; creds are
                  env-based + proven, so there's no separate 'tested' step to gate on. */}
              {!brandId
                ? "Select a brand (enter an Ad ID) to check AppLovin readiness"
                : applovinReadiness.configured
                ? "AppLovin key ready"
                : "AppLovin key missing for this brand"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <Field label="Ad ID">
            <input
              className="al-input font-mono"
              placeholder="e.g. CL_LYMPH_ONB_HOOK1"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              // Cycle 221 — trim on paste so a multi-line ClickUp paste
              // (often ends with \n) doesn't break the lookup.
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (/\s/.test(pasted)) {
                  e.preventDefault();
                  setAdId(pasted.trim().split(/\s+/)[0]);
                }
              }}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setAdId(t);
              }}
              autoFocus
            />
          </Field>
          <button
            className="btn-secondary h-10"
            disabled={!adId.trim() || adIdImporting}
            onClick={importDetails}
            type="button"
          >
            {adIdImporting ? "Looking up…" : "Import details"}
          </button>
          {adIdEntered && (
            <button
              className="btn-secondary h-10"
              type="button"
              onClick={() => {
                setAdId("");
                setAdIdImported(null);
                setAdIdImportErr(null);
              }}
              title="Clear the Ad ID and start over"
            >
              Clear
            </button>
          )}
        </div>
        {adIdImportErr && <div className="text-xs text-red-600 mt-2">{adIdImportErr}</div>}
        {adIdImported && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-xs space-y-1 ${
            adIdImported.source === "admanage_library"
              ? "border-emerald-200 bg-emerald-50"
              : adIdImported.brand_name
              ? "border-sky-200 bg-sky-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <div className={adIdImported.source === "admanage_library" ? "text-emerald-800" : "text-slate-800"}>
              <span className="font-semibold">Imported:</span>{" "}
              {adIdImported.brand_name && adIdImported.product_name
                ? `${adIdImported.brand_name} · ${adIdImported.product_name}`
                : "(no brand/product match)"}
              {adIdImported.funnel ? ` · ${adIdImported.funnel}` : ""}
              {adIdImported.source === "admanage_library" && (
                <span className="ml-2 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                  ads DB match
                </span>
              )}
            </div>
            {adIdImported.library_ref && (
              <div className="text-[11px] text-slate-700 space-y-0.5">
                <div className="font-mono text-[10px] text-slate-500 truncate" title={adIdImported.library_ref.filename}>
                  {adIdImported.library_ref.filename}
                </div>
                {adIdImported.library_ref.meta_ad_library_urls && adIdImported.library_ref.meta_ad_library_urls.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-slate-500">Meta ad{adIdImported.library_ref.meta_ad_library_urls.length === 1 ? "" : "s"}:</span>
                    {adIdImported.library_ref.meta_ad_library_urls.map((u, i) => (
                      <a key={i} className="text-brand-600 hover:underline" href={u} target="_blank" rel="noopener noreferrer">
                        Library #{i + 1} ↗
                      </a>
                    ))}
                  </div>
                )}
                {adIdImported.library_ref.admanage_manage_url && (
                  <div>
                    <span className="text-slate-500">AdManage: </span>
                    <a className="text-brand-600 hover:underline" href={adIdImported.library_ref.admanage_manage_url} target="_blank" rel="noopener noreferrer">
                      Manage ↗
                    </a>
                  </div>
                )}
              </div>
            )}
            {adIdImported.suggested_frameio_folder_url && (
              <div className="text-slate-500">
                Suggested Frame.io search:{" "}
                <a className="text-brand-600 hover:underline font-mono" href={adIdImported.suggested_frameio_folder_url} target="_blank" rel="noopener noreferrer">
                  {adIdImported.suggested_frameio_folder_url}
                </a>
              </div>
            )}
            {adIdImported.suggested_clickup_task_url && (
              <div className="text-slate-500">
                ClickUp task (guessed):{" "}
                <a className="text-brand-600 hover:underline" href={adIdImported.suggested_clickup_task_url} target="_blank" rel="noopener noreferrer">
                  {adIdImported.suggested_clickup_task_url}
                </a>
              </div>
            )}
            {adIdImported.is_mock && adIdImported.source !== "admanage_library" && (
              <div className="text-amber-700 text-[10px] italic">
                {adIdImported.source === "prefix"
                  ? "Inferred from code prefix — file not yet indexed in AdManage's library."
                  : "No match in the ads DB or by prefix. Pick details manually."}
              </div>
            )}
            {adIdImported.prior_launches && adIdImported.prior_launches.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-[11px] mb-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  {adIdImported.prior_launches.length} prior launch{adIdImported.prior_launches.length === 1 ? "" : "es"} already bound to this Ad ID
                </div>
                <div className="text-[10px] text-amber-800 mb-1.5">Continuing will create another package on the same Ad ID. Open an existing one to edit instead.</div>
                <ul className="space-y-1">
                  {adIdImported.prior_launches.map((p) => {
                    const statusBits = [
                      p.meta_upload_status ? `Meta · ${p.meta_upload_status}` : null,
                      p.applovin_upload_status ? `Applovin · ${p.applovin_upload_status}` : null,
                    ].filter(Boolean).join("  ·  ");
                    return (
                      <li key={p.id} className="text-[11px] flex items-center justify-between gap-2 bg-white rounded border border-amber-200 px-2 py-1">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {fmtDateChip(p.created_at)} · {p.variation_count} ad{p.variation_count === 1 ? "" : "s"}
                            {statusBits ? ` · ${statusBits}` : ""}
                          </div>
                        </div>
                        <a
                          href={`/ads-launcher/log?package=${encodeURIComponent(p.id)}`}
                          className="shrink-0 text-[10px] font-semibold text-brand-600 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          open →
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        {!adIdEntered && (
          <div className="mt-3 text-[11px] text-slate-500">
            ⓘ The rest of the launcher unlocks once you enter an Ad ID.
          </div>
        )}
      </div>

      {!adIdEntered ? null : (
        <>
      {/* Progress rail — 6 step checkpoints, click to jump */}
      <div className="al-card mb-6 py-4">
        <ol className="flex items-center justify-between gap-1 overflow-x-auto" aria-label="Launch progress">
          {VISIBLE_STEPS.map((n, idx) => {
            const status = stepStatus(n);
            const isLast = idx === VISIBLE_STEPS.length - 1;
            const dotClasses =
              status === "complete"
                ? "bg-emerald-500 text-white shadow-sm"
                : status === "current"
                ? "bg-brand-500 text-white shadow-sm ring-4 ring-brand-100"
                : "bg-white text-slate-400 border border-slate-300";
            const labelClasses =
              status === "complete"
                ? "text-emerald-700"
                : status === "current"
                ? "text-brand-700 font-semibold"
                : "text-slate-500";
            return (
              <li key={n} className="flex items-center flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => jumpToStep(n)}
                  className="flex items-center gap-2 group focus:outline-none"
                  title={`Jump to Step ${idx + 1}`}
                >
                  <span
                    className={`w-7 h-7 inline-flex items-center justify-center rounded-full text-xs font-semibold transition-all ${dotClasses}`}
                  >
                    {status === "complete" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span className={`text-xs whitespace-nowrap ${labelClasses}`}>{STEP_LABELS[n - 1]}</span>
                </button>
                {!isLast && (
                  <span
                    className={`flex-1 mx-2 h-px ${
                      status === "complete" ? "bg-emerald-300" : "bg-slate-200"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step 1: Brand/Product/Funnel */}
      <div id="launch-step-1" className="al-card mb-6 transition-shadow scroll-mt-6">
        <h2 className="font-semibold text-slate-900 mb-4">Step 1 · Brand, Product & Funnel</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Package Name">
            <input
              className="al-input"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              // Cycle 268 — trim on blur to catch trailing newlines from paste.
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setPackageName(t);
              }}
              placeholder={namingCode ? `e.g. ${namingCode} · May Hooks` : "e.g. Brand X — May Hooks"}
            />
          </Field>
          <Field label="Brand">
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger className={`al-input${errCls("brand")}`}>
                <SelectValue placeholder="— select —" />
              </SelectTrigger>
              <SelectContent>
                {/* Cycle 224 — alphabetize so operators with 10+ brands
                    don't have to scan a random API-order list. */}
                {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError for="brand" />
          </Field>
          <Field label="Product">
            <Select value={productId} onValueChange={setProductId} disabled={!brandId}>
              <SelectTrigger className={`al-input${errCls("product")}`} disabled={!brandId}>
                <SelectValue placeholder="— select —" />
              </SelectTrigger>
              <SelectContent>
                {[...productsForBrand].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError for="product" />
            {/* Cycle 272 — empty-state hint when the picked brand has no
                products. Operator's stuck on this select otherwise. */}
            {brandId && productsForBrand.length === 0 && (
              <div className="mt-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug">
                This brand has no products. Open <a href="/ads-launcher/products" className="underline font-semibold">Products</a> to add one.
              </div>
            )}
          </Field>
          <Field label="Funnel" info="Onbrand = your own branded landing page. Comparison = a 'Top X' style article comparing your product to others. TSL = static / image-format direct-response page. Adv = long-form editorial-style page. Determines the destination URL + creative-template defaults.">
            {/* Cycle 323 — replaced 4 narrow buttons with a select. Full
                names are readable, no truncation, single field. */}
            <select
              className={`al-input${errCls("funnel")}`}
              value={funnel}
              onChange={(e) => setFunnel(e.target.value as typeof funnel)}
            >
              <option value="">— select funnel —</option>
              {FUNNELS.map((f) => {
                const destForFunnel = productId
                  ? allDestinations.filter((d) => d.funnel === f && d.platform === platform).length
                  : null;
                const ready = destForFunnel === null || destForFunnel > 0;
                return (
                  <option key={f} value={f}>
                    {f}
                  </option>
                );
              })}
            </select>
            {selectedProduct && funnel && (
              <div className="mt-2 text-[11px] text-slate-500">
                Naming code: <span className="font-mono text-slate-700">{namingCode || "—"}</span>
              </div>
            )}
            <FieldError for="funnel" />
          </Field>
          {/* Destination URL is Meta-only. AppLovin reuses an existing campaign, so the click
              destination is inherited from that campaign — the tool sends no destination to Axon. */}
          {platform !== "Applovin" && (
          <Field label="Destination URL" info="Pick a pre-configured template (per product / funnel / platform) or choose 'Manual URL' to enter one freeform. Applies to the whole batch — not per-ad.">
            {/* Cycle 332 — Manual URL is always selectable, no need to
                pick product+funnel first. Templates only appear when
                product+funnel are picked. */}
            <select
              className="al-input"
              value={destinationChoice}
              onChange={(e) => setDestinationChoice(e.target.value)}
            >
              <option value="">— select destination —</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>{d.is_default ? `${d.name} (default)` : d.name}</option>
              ))}
              <option value="custom">— Manual URL —</option>
            </select>
            {destinationChoice === "custom" ? (
              <>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 mt-2 block">
                  Actual URL <span className="text-rose-500">*</span>
                </label>
                <input
                  className="al-input text-xs font-mono"
                  // Cycle 200 — autofocus when the operator just switched
                  // to Custom URL. Removes the extra click required to
                  // start typing.
                  autoFocus
                  value={destinationCustom}
                  onChange={(e) => setDestinationCustom(e.target.value)}
                  // Cycle 166 — trim on blur. Operators often paste URLs
                  // with a trailing newline or leading space that Meta's
                  // URL parser rejects silently. Trim is safe — no valid
                  // URL has meaningful whitespace at the ends.
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (t !== e.target.value) setDestinationCustom(t);
                  }}
                  placeholder="https://…?ad_id={{ad.id}}…"
                />
                {/* Cycle 154 / 441 — parseability check on Custom URLs.
                    We auto-prefix https:// on save when missing so the
                    operator can type `www.foo.com` and it'll ship as
                    `https://www.foo.com`. Only whitespace + obviously
                    malformed shapes warn now. */}
                {destinationCustom.trim().length > 0 && (() => {
                  const v = destinationCustom.trim();
                  const issues: string[] = [];
                  if (/\s/.test(v)) issues.push("contains whitespace");
                  if (!/\./.test(v)) issues.push("not a valid domain");
                  if (issues.length === 0) return null;
                  return (
                    <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 inline-flex items-center gap-1.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 9v4M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                      <span>{issues.join(" · ")}</span>
                    </div>
                  );
                })()}
                {/* Cycle 363 — preview URL field, required in manual mode. */}
                <label className="text-[10px] uppercase tracking-wider text-slate-500 mt-3 block">
                  Preview URL (display) <span className="text-rose-500">*</span>
                </label>
                <input
                  className="al-input text-xs font-mono"
                  value={destinationPreviewCustom}
                  onChange={(e) => setDestinationPreviewCustom(e.target.value)}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (t !== e.target.value) setDestinationPreviewCustom(t);
                  }}
                  placeholder="https://brand.com/offer"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  The clean URL Meta displays under the CTA — typically shorter than the tracked actual URL.
                </div>
              </>
            ) : null}
            {/* Cycle 363 — when a template-backed destination is chosen,
                surface the resolved preview URL alongside the actual one
                so operators see both at a glance. Legacy template rows
                without preview_url render a warning so the launcher
                pre-flight catches the issue before save. */}
            {destinationChoice && destinationChoice !== "custom" && destinationUrl && (
              <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                <div className="font-mono break-all">
                  <span className="text-slate-400 mr-1">preview:</span>
                  {destinationPreviewUrl || (
                    <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                      missing — edit this destination in <Link to="/ads-launcher/destinations" className="underline">/destinations</Link>
                    </span>
                  )}
                </div>
              </div>
            )}
            {destinationUrl && (
              <DestinationPreview url={destinationUrl} namingCode={namingCode} />
            )}
            {productId && funnel && destinations.length === 0 && (
              <Link to="/ads-launcher/destinations" className="block text-[11px] text-brand-600 hover:underline mt-1">
                + Add a destination URL for {platform} · {funnel}
              </Link>
            )}
          </Field>
          )}
        </div>
      </div>

      {/* Step 2: Meta Targeting — Meta-only. Axon has no FB-page/pixel/IG/Meta-account
          model, so the whole card is hidden when AppLovin is the active platform.
          (The Meta branch is unchanged; only the platform gate was added.) */}
      {platform !== "Applovin" && (
      <div id="launch-step-2" className="al-card mb-6 transition-shadow scroll-mt-6">
        <h2 className="font-semibold text-slate-900 mb-4">Step 2 · Meta Targeting</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Meta Account">
            {/* Cycle 492 — search filter above the dropdown. Only visible
                when 8+ accounts are loaded. Filters by name + meta_account_id
                substring; the currently-selected account stays in the list
                regardless of the filter. */}
            {accounts.length >= 8 && (() => {
              const term = accountSearch.trim().toLowerCase();
              const matchCount = term
                ? accounts.filter((a) =>
                    a.name.toLowerCase().includes(term) ||
                    a.meta_account_id.toLowerCase().includes(term))
                    .length
                : accounts.length;
              return (
                <div className="mb-1.5 flex items-center gap-2">
                  <input
                    type="search"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    placeholder="Filter accounts…"
                    className="al-input text-xs h-7 flex-1"
                  />
                  {term && (
                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                      {matchCount}/{accounts.length}
                    </span>
                  )}
                </div>
              );
            })()}
            <Select value={accountId} onValueChange={setAccountId} disabled={accountsLoading}>
              <SelectTrigger className={`al-input${errCls("account")}`}>
                <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "— select —"} />
              </SelectTrigger>
              <SelectContent>
              {/* Cycle 168 — surface the brand's default_meta_account_id
                  at the top of the dropdown so operators don't scroll
                  past it. Marked with "· default" suffix.
                  Cycle 488 — when no brand filter is applied, group accounts
                  into groups per brand (resolved via allowed_brand_ids).
                  Accounts shared across many brands fall into "Shared (multi-brand)".
                  Accounts available to every brand fall into "All brands".
                  Cycle 492 — accountSearch filters the list; the currently-
                  selected account is force-included so a typed filter never
                  hides the operator's pick. */}
              {(() => {
                const def = selectedBrand?.default_meta_account_id ?? null;
                const sortPinDefault = (a: MetaAccount, b: MetaAccount) =>
                  a.id === def ? -1 : b.id === def ? 1 : a.name.localeCompare(b.name);
                const term = accountSearch.trim().toLowerCase();
                const matchesSearch = (a: MetaAccount) =>
                  !term ||
                  a.id === accountId ||
                  a.name.toLowerCase().includes(term) ||
                  a.meta_account_id.toLowerCase().includes(term);
                const filtered = accounts.filter(matchesSearch);

                if (filtered.length === 0) {
                  return (
                    <SelectItem value="__no_match__" disabled>
                      No account found
                    </SelectItem>
                  );
                }

                if (brandId) {
                  // Brand selected → accounts are server-filtered. Flat list.
                  const sorted = [...filtered].sort(sortPinDefault);
                  return sorted.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.meta_account_id}){a.id === def ? " · default" : ""}
                    </SelectItem>
                  ));
                }
                const byBrand = new Map<string, MetaAccount[]>();
                const allBrands: MetaAccount[] = [];
                const multi: MetaAccount[] = [];
                for (const a of filtered) {
                  const ids = a.allowed_brand_ids ?? [];
                  if (ids.length === 0) {
                    allBrands.push(a);
                  } else if (ids.length > 1) {
                    multi.push(a);
                  } else {
                    const list = byBrand.get(ids[0]) ?? [];
                    list.push(a);
                    byBrand.set(ids[0], list);
                  }
                }
                const brandSorted = [...brands].sort((x, y) => x.name.localeCompare(y.name));
                return (
                  <>
                    {brandSorted
                      .filter((b) => (byBrand.get(b.id) ?? []).length > 0)
                      .map((b) => {
                        const list = [...(byBrand.get(b.id) ?? [])].sort(sortPinDefault);
                        return (
                          <SelectGroup key={b.id}>
                            <SelectLabel>{b.name}</SelectLabel>
                            {list.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.meta_account_id}){a.id === b.default_meta_account_id ? " · default" : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                    {multi.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Shared (multi-brand)</SelectLabel>
                        {[...multi].sort((a, b) => a.name.localeCompare(b.name)).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({a.meta_account_id})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {allBrands.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>All brands</SelectLabel>
                        {[...allBrands].sort((a, b) => a.name.localeCompare(b.name)).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({a.meta_account_id})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </>
                );
              })()}
              </SelectContent>
            </Select>
            {/* Cycle 160 — empty-state when the strict-by-product filter
                returns 0 accounts. Operator's stuck here unless we hand
                them a path forward (open the account that should be
                wired to this product and tick the checkbox). */}
            {productId && accounts.length === 0 && (
              <div className="mt-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug">
                No Meta account is enabled for this product. Open <a href="/ads-launcher/accounts" className="underline hover:no-underline font-semibold">Meta Accounts</a>, edit the account that should launch this product, and tick the product under "Available for products".
              </div>
            )}
            <FieldError for="account" />
          </Field>
          {/* Cycle 361 — Targeting Template picker REMOVED. Operator's
              spec: per-account templates were overhead; targeting now
              lives entirely on the launcher (Step 4) as per-launch
              incl/excl/age/gender. Default: no inclusions, no exclusions,
              18+, all genders, US. Operator adds per-launch as needed. */}
          {/* Cycle 401 — legacy "Audience Template" picker removed
              entirely. Per-launch targeting lives in Step 4. The
              audienceTemplateId state is still saved to back compat
              with older draft payloads, but the operator never sees
              this dropdown anymore. */}
          <Field label="Pixel" info="The Meta tracking pixel that fires on your landing page (and feeds the audience/optimization). Each Meta ad account has its own pixels.">
            <Select value={pixelId} onValueChange={setPixelId} disabled={!accountId || pixelsLoading}>
              <SelectTrigger className={`al-input${errCls("pixel")}`}>
                <SelectValue placeholder={pixelsLoading ? "Loading pixels..." : "— select a pixel —"} />
              </SelectTrigger>
              <SelectContent>
                {pixels.length === 0 ? (
                  <SelectItem value="__no_match__" disabled>
                    No pixel found
                  </SelectItem>
                ) : (
                  pixels.map((p) => {
                    // Cycle 409 — surface is_active + numeric pixel_id in
                    // the option label so operators spot disabled pixels
                    // before launching.
                    const tag = p.admanage_is_active === false
                      ? " · ⚠ inactive"
                      : p.admanage_is_active === true
                        ? ""
                        : " · status unknown";
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · #{p.pixel_id}{tag}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            <FieldError for="pixel" />
          </Field>
          {pixelId && (
            <Field label="Tracking *" info="The Meta pixel conversion event this ad set optimises for.">
              <Select value={tracking} onValueChange={setTracking}>
                <SelectTrigger className={`al-input${errCls("tracking")}`}>
                  <SelectValue placeholder="— select tracking event —" />
                </SelectTrigger>
                <SelectContent>
                  {([
                    ["Website events", "offsite_conversion"],
                  ] as [string, string][]).map(([label, value]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError for="tracking" />
            </Field>
          )}
          {/* Cycle 328 — filter FB/IG dropdowns to assets exclusively
              connected to THIS ad account (ad_account_count <= 1).
              Pages/IGs shared business-wide across multiple ad accounts
              show "(business-wide)" and only when no exclusive option
              exists. Drastically smaller dropdowns when the business
              has many shared pages. */}
          <Field label="Facebook Page" info="Only pages exclusively connected to this ad account. Pages shared business-wide across multiple ad accounts are hidden by default to keep the dropdown small.">
            <Select value={fbPageId} onValueChange={setFbPageId} disabled={!accountId || fbPagesLoading}>
              <SelectTrigger className={`al-input${errCls("fb-page")}`}>
                <SelectValue placeholder={fbPagesLoading ? "Loading pages..." : "— select a page —"} />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const exclusive = fbPages.filter((p) => ((p as any).ad_account_count ?? 0) <= 1);
                  const shown = exclusive.length > 0 ? exclusive : fbPages;
                  if (shown.length === 0) {
                    return (
                      <SelectItem value="__no_match__" disabled>
                        No Facebook Page found
                      </SelectItem>
                    );
                  }
                  return shown.map((p) => {
                    const live = (p as { live_ads_count?: number | null }).live_ads_count;
                    const limit = (p as { ads_limit?: number | null }).ads_limit;
                    const cap = typeof live === "number" ? ` · ${live}${typeof limit === "number" ? `/${limit}` : ""} live` : "";
                    const shared = (((p as any).ad_account_count ?? 0) > 1) ? " · business-wide" : "";
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{cap}{shared}
                      </SelectItem>
                    );
                  });
                })()}
              </SelectContent>
            </Select>
            <FieldError for="fb-page" />
          </Field>
          <Field label="Instagram Account" info="Only IGs exclusively connected to this ad account. Shared business-wide IGs are hidden by default.">
            <Select value={igAccountId} onValueChange={setIgAccountId} disabled={!accountId || igLoading}>
              <SelectTrigger className="al-input">
                <SelectValue placeholder={igLoading ? "Loading accounts..." : "— none —"} />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const exclusive = igAccounts.filter((i) => ((i as any).ad_account_count ?? 0) <= 1);
                  const shown = exclusive.length > 0 ? exclusive : igAccounts;
                  if (shown.length === 0) {
                    return (
                      <SelectItem value="__no_match__" disabled>
                        No Instagram Account found
                      </SelectItem>
                    );
                  }
                  return shown.map((p: IgAccount) => {
                    const shared = (((p as any).ad_account_count ?? 0) > 1) ? " · business-wide" : "";
                    // Cycle 453 — friendlier display when the handle is
                    // the AdManage placeholder "Instagram <ig_id>" (token
                    // lacks instagram_basic scope so we can't fetch the
                    // real username). Shorten to "IG ...<last 6>" so the
                    // dropdown is at least scannable.
                    const m = (p.handle ?? "").match(/^Instagram\s+(\d{8,})$/);
                    const label = m
                      ? `IG …${m[1].slice(-6)} (handle unavailable)`
                      : p.handle;
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {label}{shared}
                      </SelectItem>
                    );
                  });
                })()}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      )}

      {/* Step 3: Campaign Settings. Header relabels for AppLovin (no Meta
          objective/buying-type/optimization concepts on Axon). The campaign-mode
          selector is reused verbatim for both platforms. */}
      <div id="launch-step-3" className="al-card mb-6 transition-shadow scroll-mt-6">
        <h2 className="font-semibold text-slate-900 mb-4">{platform === "Applovin" ? "Step 2 · Campaign · Build Mode" : "Step 3 · Campaign Settings"}</h2>

        {platform === "Applovin" ? (
          // ── AppLovin (Axon) — REUSE an existing campaign (picked from a LIVE list). The tool
          //    NEVER creates a campaign and NEVER sets targeting / budget / goal / bidding / ad
          //    copy. Two build modes: Create (new creative set) or Clone (clone a proven source
          //    set, then swap in the new video + end-card).
          <div className="space-y-4">
            {/* Campaign picker — LIVE Axon campaign list for the selected brand. */}
            <Field label="Campaign" info="Reuse an EXISTING Axon campaign. This tool never creates a campaign — it adds creative set(s) under the one you pick. Targeting, budget, goal and bidding stay as configured on this campaign.">
              {!brandId ? (
                <div className="al-input flex items-center text-slate-400 text-sm">Pick a brand first (Step 1) to load campaigns</div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      className={errCls("applovin-campaign")}
                      value={applovinCampaignId}
                      onChange={(v) => { setApplovinCampaignId(v); setApplovinSourceCreativeSetId(""); }}
                      disabled={applovinCampaignsQuery.isFetching && applovinCampaigns.length === 0}
                      placeholder={
                        applovinCampaignsQuery.isFetching && applovinCampaigns.length === 0
                          ? "Loading campaigns…"
                          : applovinCampaigns.length === 0
                          ? "No live campaigns found for this brand"
                          : "— pick an AppLovin campaign —"
                      }
                      searchPlaceholder="Search campaigns…"
                      emptyText="No matching campaign."
                      options={applovinCampaigns.map((c) => ({
                        value: c.id,
                        label: `${c.name}${c.status ? ` · ${c.status}` : ""}${c.type ? ` · ${c.type}` : ""}`,
                        keywords: c.id,
                      }))}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary h-10 shrink-0"
                    onClick={() => applovinCampaignsQuery.refetch()}
                    disabled={applovinCampaignsQuery.isFetching}
                    title="Reload the live campaign list from AppLovin"
                  >
                    {applovinCampaignsQuery.isFetching ? "…" : "↻ Refresh"}
                  </button>
                </div>
              )}
              {applovinCampaignsQuery.isError && (
                <div className="mt-1 text-[11px] text-rose-600">
                  Couldn't load campaigns: {(applovinCampaignsQuery.error as Error)?.message ?? "unknown error"}
                </div>
              )}
              <FieldError for="applovin-campaign" />
            </Field>

            {/* Build mode: Create vs Clone. */}
            <div>
              <label className="al-label">Build Mode</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                {([
                  { value: "create", label: "Create", hint: "New creative set from the uploaded video + end-card image." },
                  { value: "clone", label: "Clone", hint: "Clone a proven source creative set, then swap in the new video + end-card." },
                ] as const).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setApplovinBuildMode(m.value)}
                    className={`text-left px-3 py-2 rounded-lg border ${applovinBuildMode === m.value ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    <div className="text-sm font-semibold">{m.label}</div>
                    <div className={`text-[11px] mt-0.5 ${applovinBuildMode === m.value ? "text-white/85" : "text-slate-500"}`}>{m.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Source creative set — Clone mode only. LIVE list scoped to the picked campaign. */}
            {applovinBuildMode === "clone" && (
              <Field label="Source Creative Set" info="The proven Axon creative set to clone. Its settings are copied, then the new video + end-card are swapped in.">
                {!applovinCampaignId ? (
                  <div className="al-input flex items-center text-slate-400 text-sm">Pick a campaign first to load its creative sets</div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        className={errCls("applovin-source-set")}
                        value={applovinSourceCreativeSetId}
                        onChange={(v) => { setApplovinSourceCreativeSetId(v); }}
                        disabled={applovinCreativeSetsQuery.isFetching && applovinCreativeSets.length === 0}
                        placeholder={
                          applovinCreativeSetsQuery.isFetching && applovinCreativeSets.length === 0
                            ? "Loading creative sets…"
                            : applovinCreativeSets.length === 0
                            ? "No creative sets found in this campaign"
                            : "— pick a source creative set —"
                        }
                        searchPlaceholder="Search creative sets…"
                        emptyText="No matching creative set."
                        options={applovinCreativeSets.map((s) => ({
                          value: s.id,
                          label: `${s.name}${s.status ? ` · ${s.status}` : ""}`,
                          keywords: s.id,
                        }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary h-10 shrink-0"
                      onClick={() => applovinCreativeSetsQuery.refetch()}
                      disabled={applovinCreativeSetsQuery.isFetching}
                      title="Reload the live creative-set list"
                    >
                      {applovinCreativeSetsQuery.isFetching ? "…" : "↻ Refresh"}
                    </button>
                  </div>
                )}
                {applovinCreativeSetsQuery.isError && (
                  <div className="mt-1 text-[11px] text-rose-600">
                    Couldn't load creative sets: {(applovinCreativeSetsQuery.error as Error)?.message ?? "unknown error"}
                  </div>
                )}
                <FieldError for="applovin-source-set" />
              </Field>
            )}

            {applovinBuildMode === "clone" && applovinSourceCreativeSetId && (
              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-2">
                {applovinSourceEndCardsQuery.isFetching && applovinSourceEndCards.length === 0
                  ? "Loading the source set's end-cards…"
                  : applovinSourceEndCards.length === 0
                  ? "This source set has no reusable end-card (HTML/image) — pick a different source set."
                  : <>This source set has <span className="font-semibold">{applovinSourceEndCards.length}</span> reusable end-card{applovinSourceEndCards.length === 1 ? "" : "s"}. All are <span className="font-semibold">selected by default per ad row</span> in Step 5 — deselect any you don't want; every selected one is added to the cloned set.</>}
              </div>
            )}

            <div className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
              Every creative set launches <span className="font-semibold">PAUSED</span>. Use the separate <span className="font-semibold">Enable → LIVE</span> action on the launch log after review to start delivery.
            </div>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          {CAMPAIGN_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`px-3 py-2 rounded-lg text-sm border ${campaignMode === m.value ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
              onClick={() => setCampaignMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {campaignMode === "new_per_adset" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="New Campaign Name">
              <input className={`al-input${errCls("campaign-name")}`} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder={namingCode ?? "e.g. CL_OREG_COMP"} />
              <FieldError for="campaign-name" />
              <FieldError for="campaign-name-long" />
              <FieldError for="campaign-name-ctrl" />
            </Field>
            <Field label="Campaign Objective" info="What Meta optimizes for. Sales = on-site purchase events. Leads = lead-gen forms. Traffic = link clicks. Pick Sales for direct-response e-com.">
              <select className={`al-input${errCls("campaign-objective")}`} value={campaignObjective} onChange={(e) => setCampaignObjective(e.target.value as any)}>
                {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
              </select>
              <FieldError for="campaign-objective" />
            </Field>
            <Field label="Buying Type" info="Auction = standard pay-per-result Meta auction. Reach and frequency = guaranteed delivery for awareness — rarely useful for direct-response.">
              <select className={`al-input${errCls("buying-type")}`} value={buyingType} onChange={(e) => setBuyingType(e.target.value as any)}>
                {BUYING_TYPES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <FieldError for="buying-type" />
            </Field>
            <Field label="Budget Type" info="Daily = spend roughly this much each day. Lifetime = spread the amount across the whole campaign duration.">
              <select className={`al-input${errCls("budget-type")}`} value={budgetType} onChange={(e) => setBudgetType(e.target.value as any)}>
                {BUDGET_TYPES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <FieldError for="budget-type" />
            </Field>
            <Field label="Budget Amount (USD)">
              <input className={`al-input${errCls("budget-amount")}`} value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 100" inputMode="decimal" />
              <FieldError for="budget-amount" />
            </Field>
            <Field label="Optimization Goal" info="What event Meta optimizes the auction toward. 'Maximize conversions' = most purchases. 'Maximize value of conversions' = highest-AOV purchases (needs purchase-value data on the pixel). 'Landing page views' = top-of-funnel only.">
              <select className={`al-input${errCls("optimization-goal")}`} value={optimizationGoal} onChange={(e) => setOptimizationGoal(e.target.value as any)}>
                {OPTIMIZATIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <FieldError for="optimization-goal" />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Cycle 331 — picker shows when no campaign is locked. Once
                picked, swap to a read-only details card with budget,
                objective, etc + a "Change" button so the operator can
                still re-pick if they want to. */}
            {existingCampaignId ? (
              <ExistingCampaignLockedCard
                accountId={(() => {
                  const acct = accounts.find((a) => a.id === accountId);
                  return acct ? `act_${acct.meta_account_id}` : "";
                })()}
                mode={campaignMode === "existing_abo" ? "abo" : "cbo"}
                campaignId={existingCampaignId}
                campaignName={existingCampaignName}
                onChange={() => {
                  setExistingCampaignName("");
                  setExistingCampaignId("");
                }}
              />
            ) : (
              <Field label="Existing Campaign" info="Live list of campaigns in this ad account, filtered to the buying type you picked above. A NEW ad set will be created under it using the Ad-Set Name in Step 4.">
                <ExistingCampaignPicker
                  accountId={(() => {
                    const acct = accounts.find((a) => a.id === accountId);
                    return acct ? `act_${acct.meta_account_id}` : "";
                  })()}
                  mode={campaignMode === "existing_abo" ? "abo" : "cbo"}
                  value={existingCampaignName}
                  onChange={(name, campaignId) => {
                    setExistingCampaignName(name);
                    setExistingCampaignId(campaignId ?? "");
                  }}
                />
                <FieldError for="existing-campaign" />
              </Field>
            )}
            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              {adsetMode === "existing" && existingAdsetName
                ? <>Ads will be added into the existing ad set <span className="font-mono text-slate-700">{existingAdsetName}</span> (chosen in Step 4).</>
                : <>A new ad set named <span className="font-mono text-slate-700">{adSetNameOverride || suggestedAdSetName || "(set in Step 4)"}</span> will be created under this campaign.</>}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Step 4: Ad-Set Settings — entirely Meta concepts (attribution, ad-set
          name, Meta placements, Meta audiences). Axon has NO ad-set layer, so the
          whole card is hidden for AppLovin. (Meta branch unchanged — gate only.) */}
      {platform !== "Applovin" && (
      <div id="launch-step-4" className="al-card mb-6 transition-shadow scroll-mt-6">
        <h2 className="font-semibold text-slate-900 mb-4">Step 4 · Ad-Set Settings</h2>
        {/* Existing-ad-set choice — only in existing-campaign mode, once a campaign
            is picked (need its id to search its ad sets). Meta-only: the Step 4 card
            is already gated to platform !== "Applovin". */}
        {campaignMode !== "new_per_adset" && existingCampaignId && (
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-2" role="radiogroup" aria-label="Ad set">
            {[
              { v: "new", title: "Create a new ad set", sub: "Set name, budget, targeting for a fresh ad set." },
              { v: "existing", title: "Add to an existing ad set", sub: "Attach ads into a live ad set — its budget & targeting stay as-is." },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={adsetMode === o.v}
                className={`text-left px-3 py-2.5 rounded-lg border transition ${adsetMode === o.v ? "bg-brand-500/10 border-brand-500 ring-1 ring-brand-500" : "bg-white border-slate-300 hover:bg-slate-50"}`}
                onClick={() => {
                  setAdsetMode(o.v as "new" | "existing");
                  if (o.v === "new") { setExistingAdsetId(""); setExistingAdsetName(""); }
                }}
              >
                <div className="text-sm font-medium text-slate-900">{o.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{o.sub}</div>
              </button>
            ))}
          </div>
        )}
        {campaignMode !== "new_per_adset" && existingCampaignId && adsetMode === "existing" ? (
          <div className="space-y-2">
            <Field label="Existing Ad Set" info="Live ad sets in the picked campaign (from the AdManage mirror). The new ads attach directly INTO the one you pick — nothing new is created.">
              <ExistingAdsetPicker
                campaignId={existingCampaignId}
                valueId={existingAdsetId}
                valueName={existingAdsetName}
                onChange={(id, name) => { setExistingAdsetId(id); setExistingAdsetName(name); }}
              />
              <FieldError for="existing-adset" />
            </Field>
            <div className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
              Ads attach into this ad set and launch <span className="font-semibold">PAUSED</span>. Its budget, targeting and schedule stay exactly as they are — no new ad set is created.
            </div>
          </div>
        ) : (
          <>
        {/* Fix 2 — live ad-set template picker. Only shown when using an existing campaign
            (ABO or CBO). Lets the buyer copy a proven live ad set's settings instead of
            re-typing targeting/attribution/placements from scratch. */}
        {campaignMode !== "new_per_adset" && existingCampaignId && (
          <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50/50">
            <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider mb-2">
              Copy settings from a live ad set (optional)
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Search live ad sets in this campaign and copy their targeting, attribution, and placement settings into the fields below. The new ad-set name still comes from Step 4.
            </p>
            {adsetTemplateId ? (
              <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-medium text-slate-800 flex-1 truncate" title={adsetTemplateName}>{adsetTemplateName}</span>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => { setAdsetTemplateId(""); setAdsetTemplateName(""); }}
                >
                  Clear
                </button>
              </div>
            ) : (
              <LiveAdSetPicker
                accountId={(() => { const acct = accounts.find((a) => a.id === accountId); return acct ? `act_${acct.meta_account_id}` : ""; })()}
                campaignId={existingCampaignId}
                onSelect={(adset) => {
                  setAdsetTemplateId(adset.adset_id);
                  setAdsetTemplateName(adset.name);
                  // Pre-fill Step 4 fields from the live ad set's settings
                  if (adset.optimization_goal) {
                    const label = Object.entries(OPTIMIZATION_MAP).find(([, v]) => v === adset.optimization_goal)?.[0];
                    if (label) setOptimizationGoal(label as typeof OPTIMIZATIONS[number]);
                  }
                  if (adset.attribution_spec) setAttributionSetting(adset.attribution_spec as Attribution);
                  if (adset.placement_mode) setPlacementMode(adset.placement_mode as PlacementMode);
                  if (adset.manual_placements?.length) setManualPlacements(adset.manual_placements);
                  if (adset.age_min != null) setOverrideAgeMin(adset.age_min);
                  if (adset.age_max != null) setOverrideAgeMax(adset.age_max);
                  if (adset.genders?.length) setOverrideGenders(adset.genders.map(String));
                }}
              />
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Attribution" info="How long after seeing/clicking your ad a conversion still gets credited to it. '7-day click or 1-day view' is Meta's default + the broadest attribution window.">
            <select className={`al-input${errCls("attribution")}`} value={attributionSetting} onChange={(e) => setAttributionSetting(e.target.value as Attribution)}>
              {ATTRIBUTIONS.map((a) => <option key={a}>{a}</option>)}
            </select>
            <FieldError for="attribution" />
          </Field>
          <Field label="Ad-Set Name" info="Name of the NEW ad set Meta will create for this package. Suggestion built from the product's naming code + Ad ID — edit freely.">
            <input className={`al-input text-sm font-mono${errCls("adset-name")}`} value={adSetNameOverride} onChange={(e) => setAdSetNameOverride(e.target.value)} placeholder={suggestedAdSetName} />
            <FieldError for="adset-name" />
          </Field>
        </div>
        <div className="mt-4">
          <label className="al-label">Placements</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
            {PLACEMENT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`px-3 py-2 rounded-lg text-sm border ${placementMode === m ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                onClick={() => setPlacementMode(m)}
              >
                {m === "Advantage+ placements" ? "Advantage+ Placements (recommended)" : "Manual Placements"}
              </button>
            ))}
          </div>
          {placementMode === "manual placements" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-2">
              {PLACEMENT_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={manualPlacements.includes(opt)}
                    onChange={(e) => {
                      setManualPlacements((arr) => (e.target.checked ? [...new Set([...arr, opt])] : arr.filter((p) => p !== opt)));
                    }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* Cycle 361 — per-launch targeting (no template).
            Defaults: 18-65, all genders, no incl/excl. Operator adds
            audiences + tweaks demo per-launch as needed. */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            <label className="al-label mb-0">Targeting</label>
            {(overrideAgeMin != null || overrideAgeMax != null || overrideGenders != null || overrideIncludeIds != null || overrideExcludeIds != null) && (
              <button
                type="button"
                className="text-[10px] text-slate-500 hover:text-slate-900 underline"
                onClick={() => {
                  setOverrideAgeMin(null);
                  setOverrideAgeMax(null);
                  setOverrideGenders(null);
                  setOverrideIncludeIds(null);
                  setOverrideExcludeIds(null);
                }}
              >
                reset to defaults
              </button>
            )}
          </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Cycle 404 — show age inputs EMPTY when operator hasn't
                  set them so it's visually clear targeting isn't being
                  narrowed. Meta's broadest is 18-65+; that fallback
                  still applies server-side, but the UI doesn't pretend
                  the operator chose it. */}
              <Field label="Age min (empty = no limit)">
                <input
                  type="number"
                  min={13}
                  max={120}
                  className="al-input"
                  value={overrideAgeMin ?? ""}
                  placeholder="18"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setOverrideAgeMin(v === "" ? null : Number(v));
                  }}
                />
              </Field>
              <Field label="Age max (empty = no limit)">
                <input
                  type="number"
                  min={13}
                  max={120}
                  className="al-input"
                  value={overrideAgeMax ?? ""}
                  placeholder="65+"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setOverrideAgeMax(v === "" ? null : Number(v));
                  }}
                />
              </Field>
              <Field label="Genders (empty = all)">
                <div className="flex items-center gap-3 pt-2">
                  {(["male", "female"] as const).map((g) => (
                    <label key={g} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={effGenders.includes(g)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...effGenders, g]
                            : effGenders.filter((x) => x !== g);
                          setOverrideGenders(next);
                        }}
                      />
                      {g}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Audience counts">
                <div className="text-xs text-slate-600 pt-1.5 font-mono">
                  {effIncludeIds.length} incl · {effExcludeIds.length} excl
                </div>
              </Field>
            </div>
            {/* Cycle 353 — per-launch include/exclude audience editor.
                Operator can override the template's audience lists for
                this single launch without touching the template. Pulls
                live audiences from /api/meta-accounts/:id/audiences. */}
            {accountId && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <LaunchAudiencePicker
                  accountId={accountId}
                  label="Include audiences (override)"
                  selected={effIncludeIds}
                  onChange={setOverrideIncludeIds}
                />
                <LaunchAudiencePicker
                  accountId={accountId}
                  label="Exclude audiences (override)"
                  selected={effExcludeIds}
                  onChange={setOverrideExcludeIds}
                />
              </div>
            )}
          <p className="text-[10px] text-slate-500 mt-2">
            Defaults: ages 18-65, all genders, US, no audiences. Add inclusions/exclusions or tweak the demo per-launch.
          </p>
        </div>
          </>
        )}
      </div>
      )}

      {/* Step 5: Source files */}
      <div id="launch-step-5" className="al-card mb-6 transition-shadow scroll-mt-6">
        {/* Cycle 359 — operator pushback: the 4 yellow validation chips
            (total file size, mixed aspects, filename mismatch, library
            match) were noise. Removed entirely; the row-level checks
            still surface real problems at save time via the validation
            list — that's enough signal. */}
        <h2 className="font-semibold text-slate-900 mb-1">{platform === "Applovin" ? "Step 3 · Source the Ad Assets" : "Step 5 · Source the Ad Assets"}</h2>
        <p className="text-xs text-slate-500 mb-4">
          Two ways. Use whichever works. The Frame.io URL is stored on the package either way for reference.
        </p>

        <div className="flex gap-1 mb-4 border-b border-slate-200">
          <TabButton active={sourceTab === "url"} onClick={() => setSourceTab("url")}>
            Frame.io URL
          </TabButton>
          <TabButton active={sourceTab === "gdrive"} onClick={() => setSourceTab("gdrive")}>
            Google Drive
          </TabButton>
          <TabButton active={sourceTab === "upload"} onClick={() => setSourceTab("upload")}>
            Drag &amp; drop / upload
          </TabButton>
        </div>

        {sourceTab === "gdrive" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <Field label="Google Drive Folder URL">
                <input
                  className="al-input"
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/<id>  or raw folder ID"
                />
                {driveUrl.trim().length > 0 && (() => {
                  const v = driveUrl.trim();
                  const issues: string[] = [];
                  // Accept raw ID or any drive.google.com URL containing /folders/
                  if (!/^[A-Za-z0-9_-]{20,80}$/.test(v) && !/drive\.google\.com\/.*\/folders\//i.test(v)) {
                    issues.push("not a Google Drive folder URL or raw ID");
                  }
                  if (issues.length === 0) return null;
                  return (
                    <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 inline-flex items-center gap-1.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 9v4M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                      <span>{issues.join(" · ")}</span>
                    </div>
                  );
                })()}
              </Field>
              <button
                className="btn-primary h-10"
                disabled={!driveUrl.trim() || fetchDrive.isPending}
                onClick={() => fetchDrive.mutate()}
              >
                {fetchDrive.isPending ? "Fetching…" : "Pull Files"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Lists image + video files in the folder. The folder must be shared with the service account or accessible via the operator's OAuth refresh token. v1 lists immediate children only (no recursive descent).
            </p>
            {driveErr && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-1.5">
                <div className="text-amber-900">
                  <span className="font-semibold">Couldn't list this Drive folder.</span> If the server says "GOOGLE_DRIVE_* not configured", the operator needs to drop a refresh token + client ID + client secret in <span className="font-mono">/var/www/ads-uploader/.env</span> and restart pm2.
                </div>
                <div className="text-[10px] text-amber-700 italic">Technical: {driveErr}</div>
              </div>
            )}
          </>
        ) : sourceTab === "upload" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              ingestLocalFiles(e.dataTransfer.files);
            }}
            className={`rounded-xl border-2 border-dashed transition-colors p-8 text-center ${
              dragOver ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50/40 hover:bg-slate-50"
            }`}
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-100 text-brand-600 mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-900">Drop video or image files here</div>
            <div className="text-xs text-slate-500 mt-1 mb-4">
              Each file becomes one ad row. Filename stays as the asset's fact. Aspect ratio auto-detected from the filename.
            </div>
            <label className="btn-primary text-xs cursor-pointer inline-flex">
              Choose files…
              <input
                type="file"
                accept="video/*,image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  ingestLocalFiles(e.target.files);
                  e.target.value = ""; // reset so re-selecting the same file fires onChange again
                }}
              />
            </label>
            <div className="text-[11px] text-slate-400 mt-3">
              Files stay on your device until you click Save — nothing is uploaded yet. Preview plays straight from your browser.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <Field label="Frame.io Folder URL">
                <input
                  className="al-input"
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  placeholder="https://app.frame.io/projects/.../folders/... or https://next.frame.io/project/..."
                />
                {/* Cycle 162 — inline pre-flight check on the URL before
                    the operator clicks Pull Files. Catches the common
                    typos (frameio.com, missing https://, pasted some
                    random URL by accident) without round-tripping to
                    the server's parser. */}
                {folderUrl.trim().length > 0 && (() => {
                  const v = folderUrl.trim();
                  const issues: string[] = [];
                  let host = "";
                  try {
                    host = new URL(v).host.toLowerCase();
                  } catch {
                    issues.push("not a parseable URL — paste the full address from Frame.io");
                  }
                  if (host && !/(^|\.)frame\.io$/i.test(host)) {
                    issues.push(`host is "${host}" — should be app.frame.io or next.frame.io`);
                  }
                  if (issues.length === 0) return null;
                  return (
                    <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 inline-flex items-center gap-1.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 9v4M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                      <span>{issues.join(" · ")}</span>
                    </div>
                  );
                })()}
              </Field>
              <button
                className="btn-primary h-10"
                disabled={!folderUrl.trim() || fetchFolder.isPending}
                onClick={() => fetchFolder.mutate()}
              >
                {fetchFolder.isPending ? "Fetching…" : "Pull Files"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Pulls file metadata from Frame.io. Files already launched to AdManage preview as real video. Frame.io drafts that aren't in AdManage yet need to be dragged in via the Upload tab to preview.{" "}
              <span className="text-amber-600 font-medium">Tip: paste a <strong>folder</strong> link (not a single-file link) to import multiple ads at once.</span>
            </p>
            {fetchErr && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-1.5">
                <div className="text-amber-900">
                  <span className="font-semibold">Couldn't list this Frame.io folder.</span> Most likely the Frame.io v4 server-side token expired. Easiest path:
                </div>
                <ul className="list-disc pl-5 text-amber-900 space-y-0.5">
                  <li>Use the <button type="button" className="underline font-medium" onClick={() => setSourceTab("upload")}>Drag &amp; drop / upload</button> tab to add files directly from your device — no Frame.io login needed.</li>
                </ul>
                <div className="text-[10px] text-amber-700 italic">Technical: {fetchErr}</div>
              </div>
            )}
          </>
        )}

        {fetchSource && rows.length > 0 && (
          <div className="text-xs text-emerald-700 mt-3 font-medium">
            ✓ Loaded {rows.length} file{rows.length === 1 ? "" : "s"} via{" "}
            {fetchSource === "api" ? "Frame.io API" : "manual entry"}.
          </div>
        )}
      </div>

      {/* Step 6: Variations */}
      {rows.length > 0 && (
        <div id="launch-step-6" className="al-card mb-6 transition-shadow scroll-mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{platform === "Applovin" ? "Step 4" : "Step 6"} · Review {rows.length} Ad Row{rows.length === 1 ? "" : "s"}</h2>
            <div className="flex items-center gap-3 text-sm">
              {/* Ad copy is a Meta-only concept — AppLovin reuses the campaign's copy. */}
              {platform !== "Applovin" && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applyToAllAdCopy} onChange={(e) => setApplyToAllAdCopy(e.target.checked)} className="rounded border-slate-300" />
                  <span className="text-slate-700">Share copy across all ads</span>
                </label>
              )}
              <button
                type="button"
                className="text-xs text-red-600 hover:text-red-700 hover:underline"
                onClick={async () => {
                  if (await confirmAct({ title: "Remove all rows?", description: "Clears every ad variation. The Frame.io link / filenames are preserved so you can re-pull.", tone: "danger", confirmLabel: "Remove all" })) {
                    setRows([]);
                    setFetchSource(null);
                  }
                }}
              >
                Remove all
              </button>
            </div>
          </div>

          {/* AppLovin end-card note (Meta uses the bulk-fill copy panel below instead). */}
          {platform === "Applovin" && (
            <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11.5px] text-violet-900">
              Each variation needs its <span className="font-semibold">video</span> (sourced above).{" "}
              {applovinBuildMode === "clone" ? (
                <>
                  The <span className="font-semibold">end-card is reused from the source creative set</span> (its
                  {" "}<span className="font-mono">HOSTED_HTML</span> playable / end-card) — only the video is swapped, so there's nothing to upload.
                </>
              ) : (
                <>
                  An <span className="font-semibold">end-card image</span> (Axon <span className="font-mono">IMG_INTER_P</span>, 9:16) is
                  {" "}<span className="font-semibold">required</span> per row when building from scratch.
                </>
              )}
              {" "}Ad copy is inherited from the reused campaign — nothing to write here.
            </div>
          )}

          {/* Bulk-fill panel — pick a creative template, edit copy once, apply to every row.
              Meta-only: AppLovin reuses the campaign's ad copy, so no copy is collected here. */}
          {platform !== "Applovin" && (
          <BulkFillPanel
            ctaOptions={[...CTA_OPTIONS]}
            sharedMode={applyToAllAdCopy}
            // When shared-copy mode is on, the per-row inputs are hidden,
            // so surface the per-row required-field errors on the BulkFill
            // inputs instead. Row 0 is representative — all rows share the
            // same values in shared mode, so its errors apply equally.
            errors={applyToAllAdCopy ? {
              cta: rowErr(0, "cta"),
              headline: rowErr(0, "headline"),
              primary: rowErr(0, "primary"),
            } : undefined}
            initial={rows[0] ? {
              primary_text: rows[0].primary_text,
              headline: rows[0].headline,
              description: rows[0].description,
              call_to_action: rows[0].call_to_action,
            } : null}
            charLimits={CHAR_LIMITS}
            templates={creativeTemplates
              .filter((c) => !funnel || c.funnel === funnel)
              .filter((c) => c.asset_type === "Video")
              .map((c) => ({
                id: c.id,
                name: c.name,
                call_to_action: c.call_to_action ?? "Learn more",
                primary_text: c.primary_text ?? "",
                headline: c.headline ?? "",
                description: c.description ?? "",
                is_default: (c as any).is_default ?? false,
              }))}
            templateId={creativeTemplateId}
            onTemplateChange={(id) => setCreativeTemplateId(id)}
            onApply={(patch, opts) => {
              setRows((rs) => rs.map((r) => ({ ...r, ...patch })));
              // Only show the toast on explicit-click apply; silent
              // background propagation in shared mode would spam the
              // toast on every keystroke debounce flush.
              if (opts?.fromClick) {
                toast("success", `Applied to all ${rows.length} row${rows.length === 1 ? "" : "s"}.`);
              }
            }}
          />
          )}

          <div className="space-y-4 mt-4">
            {rows.map((r, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <VariationPreview
                    fileId={r.file_id ?? null}
                    thumb={r.thumb ?? null}
                    aspect={r.aspect}
                    localUrl={r.local_preview_url ?? null}
                    localMime={r.local_mime ?? null}
                    onAspectProbed={(a) => updateRow(i, { aspect: a })}
                    onDropFile={(file) => {
                      // Cycle 148 — dropping a file ONTO the preview now also
                      // updates the row's filename + clears the old Frame.io
                      // binding (operator is replacing the asset, not just
                      // re-showing a preview). Matches the explicit "Replace
                      // asset" button below.
                      if (r.local_preview_url) {
                        try { URL.revokeObjectURL(r.local_preview_url); } catch {}
                      }
                      updateRow(i, {
                        file_name: file.name,
                        file_id: null,
                        thumb: null,
                        local_preview_url: URL.createObjectURL(file),
                        local_mime: file.type || null,
                        local_size: file.size,
                        local_file: file,
                        aspect: null,
                      } as any);
                    }}
                  />

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
                      {(() => {
                        // Row kind label flips between Image / Video based on
                        // the actual filename extension (or local MIME if the
                        // file was dragged in). Previously hard-coded "Video"
                        // even for png/jpg rows, which confused operators.
                        // Cycle 148: label is "Ad row N" not "Video row N" —
                        // the row holds either a video or an image, calling it
                        // a Video row was misleading and got flagged.
                        return (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900 text-white font-semibold">
                            Ad row {i + 1}
                          </span>
                        );
                      })()}
                      {(() => {
                        // Render the image/video kind alongside Ad row N as a
                        // secondary chip so the operator still sees what kind
                        // of asset it is at a glance.
                        const ext = (r.file_name.split(".").pop() || "").toLowerCase();
                        const mime = (r.local_mime ?? "").toLowerCase();
                        const isImg =
                          mime.startsWith("image/") ||
                          /^(png|jpe?g|gif|webp|bmp|tiff?|heic|avif)$/.test(ext);
                        return (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                            {isImg ? "Image" : "Video"}
                          </span>
                        );
                      })()}
                      {/* Cycle 497 — click-to-pick aspect dropdown. The auto-probe
                          can stall for minutes when many videos load in parallel
                          (browsers cap ~6 concurrent media streams); the operator
                          used to be stuck on "detecting…" with no manual override.
                          Now the chip IS a <select>: leave on "auto" to let the
                          probe fill it in, or pick directly to unblock. */}
                      <select
                        className={`text-xs px-2 py-0.5 rounded-full font-mono border-0 cursor-pointer ${
                          r.aspect ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                        }`}
                        title={r.aspect
                          ? "Aspect ratio — pick a different value to override the auto-detection."
                          : "Auto-detection is probing the video metadata; pick a value here to set it manually if you don't want to wait."}
                        value={r.aspect ?? ""}
                        onChange={(e) => updateRow(i, { aspect: e.target.value || null } as any)}
                      >
                        <option value="">{r.aspect ? "auto" : "detecting…"}</option>
                        <option value="9x16">9x16</option>
                        <option value="4x5">4x5</option>
                        <option value="1x1">1x1</option>
                        <option value="1.91x1">1.91x1</option>
                        <option value="16x9">16x9</option>
                      </select>
                      {/* Cycle 273 — per-row file size when known. */}
                      {(r.local_size ?? 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 font-mono border border-slate-200">
                          {(r.local_size! / 1024 / 1024).toFixed(1)} MB
                        </span>
                      )}
                      {rowAdIdWarning(r.file_name) && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                          title={`Filename doesn't start with the Ad ID "${adId}". Performance reports may not match this ad back to the task.`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
                          filename doesn't start with {adId}
                        </span>
                      )}
                      {/* Cycle 150 — when this row's Frame.io binding has
                          been cleared (operator used Replace Asset, or
                          dropped a local file in place), surface a chip
                          so they can tell at a glance which rows still
                          hydrate from Frame.io vs which are local-only.
                          Local-only rows skip the Frame.io ad-links view
                          on the Log detail. */}
                      {!r.file_id && (r.local_preview_url || (r.local_size ?? 0) > 0) && folderUrl && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200"
                          title="This row's asset is local — Frame.io binding was cleared (Replace Asset or drag-and-drop). The package's Frame.io folder URL is still saved on the package for reference."
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                          </svg>
                          local — Frame.io unlinked
                        </span>
                      )}
                      {/* Cycle 148 — per-row Replace Asset. Click → file picker
                          → new file replaces the row's filename + preview +
                          aspect. Frame.io binding is cleared (file_id=null)
                          since the new asset is local.  */}
                      <label
                        className="ml-auto text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                        title="Replace this row's asset with a new file. Filename and preview update automatically."
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15A9 9 0 1 1 5.64 5.64L23 10" />
                        </svg>
                        Replace asset
                        <input
                          type="file"
                          accept="video/*,image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (r.local_preview_url) {
                              try { URL.revokeObjectURL(r.local_preview_url); } catch {}
                            }
                            updateRow(i, {
                              file_name: f.name,
                              file_id: null,
                              thumb: null,
                              local_preview_url: URL.createObjectURL(f),
                              local_mime: f.type || null,
                              local_size: f.size,
                              local_file: f,
                              aspect: null,
                            } as any);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <Field label="File Name" info="Edit the filename if the VE named it incorrectly. The name you set here is what gets pushed to Meta."><AutoGrowTextarea className="al-input font-mono text-xs" value={r.file_name} onChange={(v) => updateRow(i, { file_name: v })} placeholder="e.g. AD123_OnBrand_VID.mp4" /></Field>
                    <Field
                      label="Ad Name (optional)"
                      info="Leave blank and Meta auto-generates the name when the ad is created. Override here only if you want a specific in-Ads-Manager label."
                    >
                      <AutoGrowTextarea
                        className="al-input"
                        value={r.ad_name}
                        placeholder="(auto-generated by Meta on launch)"
                        maxLength={CHAR_LIMITS.ad_name}
                        onChange={(v) => updateRow(i, { ad_name: v })}
                      />
                    </Field>
                    {/* AppLovin per-variation END-CARD image (Axon IMG_INTER_P). Operator-uploaded;
                        sits alongside the video. Meta has no equivalent. */}
                    {platform === "Applovin" && applovinBuildMode === "clone" && (
                      <div className="md:col-span-2">
                        <label className="al-label">End-card to reuse <span className="text-slate-400 font-normal">· per row · from the source set · only the video is swapped</span></label>
                        {applovinSourceEndCardsQuery.isFetching && applovinSourceEndCards.length === 0 ? (
                          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-300 border-t-blue-600 motion-safe:animate-spin" aria-hidden="true" />
                            Loading the source set's end-cards…
                          </div>
                        ) : applovinSourceEndCardsQuery.isError ? (
                          <div className="mt-1 text-[11px] text-amber-700">
                            Couldn't load end-cards{(applovinSourceEndCardsQuery.error as Error)?.message ? ` (${(applovinSourceEndCardsQuery.error as Error).message})` : ""} — retry or pick a different source set.
                          </div>
                        ) : applovinSourceEndCards.length === 0 ? (
                          <div className="mt-1 text-[11px] text-amber-700">This source set has no reusable end-card — pick a different source set.</div>
                        ) : (
                          <div className="mt-1">
                            <div className="text-[11px] text-slate-500 mb-1.5">
                              <span className="font-semibold">{rowSelectedEndCardIds(r).length}</span> of {applovinSourceEndCards.length} selected · all selected by default — click a tile to deselect. Every selected end-card is added to the cloned set (only the video is swapped in).
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {applovinSourceEndCards.map((c) => {
                                const selected = rowSelectedEndCardIds(r).includes(c.asset_id);
                                return (
                                  <div
                                    key={c.asset_id}
                                    onClick={() => toggleRowEndCard(i, r, c.asset_id)}
                                    title={`${c.type ?? "asset"} · asset ${c.asset_id}${c.status && c.status !== "ACTIVE" ? ` · ${c.status}` : ""}`}
                                    className={`relative w-[90px] h-[160px] rounded border-2 shrink-0 overflow-hidden cursor-pointer transition ${selected ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200 opacity-50 hover:opacity-90"}`}
                                  >
                                    {/IMG/i.test(c.type ?? "") && c.url ? (
                                      <img src={c.url} alt="End-card" className="w-full h-full object-contain bg-slate-50 pointer-events-none" />
                                    ) : c.url ? (
                                      <iframe
                                        src={c.url}
                                        title={`End-card ${c.asset_id}`}
                                        sandbox="allow-scripts allow-same-origin"
                                        scrolling="no"
                                        loading="lazy"
                                        className="w-full h-full border-0 bg-slate-50 pointer-events-none"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-slate-50 flex items-center justify-center text-[9px] text-slate-500 text-center leading-tight">HTML<br />end-card</div>
                                    )}
                                    {/* selected badge */}
                                    <div className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${selected ? "bg-brand-500 text-white" : "bg-white/80 text-slate-400 border border-slate-300"}`}>
                                      {selected ? "✓" : ""}
                                    </div>
                                    {/* open-full (doesn't toggle) */}
                                    {c.url && (
                                      <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute top-1 left-1 w-4 h-4 rounded bg-white/85 text-slate-600 text-[10px] flex items-center justify-center hover:bg-white"
                                        title="Open full preview"
                                      >↗</a>
                                    )}
                                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] px-1 py-0.5 truncate pointer-events-none">{c.type ?? "asset"}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {platform === "Applovin" && applovinBuildMode !== "clone" && (
                      <div className="md:col-span-2">
                        <label className="al-label">End-card image (IMG_INTER_P) <span className="text-slate-400 font-normal">· required when building from scratch</span></label>
                        <div className="mt-1 flex items-center gap-3">
                          {rowEndCardPreview(r) ? (
                            <img
                              src={rowEndCardPreview(r) as string}
                              alt="End-card preview"
                              className="h-14 w-14 rounded object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[9px] text-slate-400 shrink-0 text-center leading-tight">
                              no<br />end-card
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded border bg-white hover:bg-slate-50 cursor-pointer border-slate-300">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                              {rowEndCardPreview(r) ? "Replace end-card" : "Upload end-card"}
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  if (r.applovin_end_card_preview_url) {
                                    try { URL.revokeObjectURL(r.applovin_end_card_preview_url); } catch {}
                                  }
                                  updateRow(i, {
                                    applovin_end_card_local_file: f,
                                    applovin_end_card_preview_url: URL.createObjectURL(f),
                                    applovin_end_card_source: "upload",
                                    applovin_end_card_file_id: null,
                                    applovin_end_card_upload_url: null,
                                  } as any);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {(r.applovin_end_card_preview_url || r.applovin_end_card_upload_url) && (
                              <button
                                type="button"
                                className="text-[11px] text-red-600 hover:underline"
                                onClick={() => {
                                  if (r.applovin_end_card_preview_url) {
                                    try { URL.revokeObjectURL(r.applovin_end_card_preview_url); } catch {}
                                  }
                                  updateRow(i, {
                                    applovin_end_card_local_file: null,
                                    applovin_end_card_preview_url: null,
                                    applovin_end_card_source: null,
                                    applovin_end_card_file_id: null,
                                    applovin_end_card_upload_url: null,
                                  } as any);
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Per-row copy editors are hidden in shared-copy mode — only the BulkFillPanel at the
                        top of Step 6 controls the text. Untick "Share copy across all ads" to edit per-row.
                        Meta-only: AppLovin reuses the campaign's ad copy. */}
                    {platform !== "Applovin" && !applyToAllAdCopy && (
                      <>
                        <Field label="CTA">
                          <select className={`al-input${rowErr(i, "cta") ? " !border-rose-400 !ring-1 !ring-rose-200" : ""}`} value={r.call_to_action || ""} onChange={(e) => updateRow(i, { call_to_action: e.target.value })}>
                            <option value="">— select —</option>
                            {CTA_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                          </select>
                          <FieldError msg={rowErr(i, "cta")} />
                        </Field>
                        <CountedField label="Headline" max={CHAR_LIMITS.headline} soft={SOFT_LIMITS.headline} value={r.headline}>
                          <input className={`al-input${rowErr(i, "headline") ? " !border-rose-400 !ring-1 !ring-rose-200" : ""}`} maxLength={CHAR_LIMITS.headline} value={r.headline} onChange={(e) => updateRow(i, { headline: e.target.value })} />
                          <FieldError msg={rowErr(i, "headline")} />
                        </CountedField>
                        <CountedField label="Description" max={CHAR_LIMITS.description} soft={SOFT_LIMITS.description} value={r.description}>
                          <input className="al-input" maxLength={CHAR_LIMITS.description} value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
                        </CountedField>
                        <div className="md:col-span-2">
                          <CountedField label="Primary Text" max={CHAR_LIMITS.primary_text} soft={SOFT_LIMITS.primary_text} value={r.primary_text}>
                            <textarea className={`al-input${rowErr(i, "primary") ? " !border-rose-400 !ring-1 !ring-rose-200" : ""}`} rows={2} maxLength={CHAR_LIMITS.primary_text} value={r.primary_text} onChange={(e) => updateRow(i, { primary_text: e.target.value })} />
                            <FieldError msg={rowErr(i, "primary")} />
                          </CountedField>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      className="btn-icon hover:!text-brand-600"
                      onClick={() => duplicateRow(i)}
                      title="Duplicate this row"
                      aria-label="Duplicate this row"
                      type="button"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                      onClick={() => removeRow(i)}
                      title="Remove this row"
                      aria-label="Remove this row"
                      type="button"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Cycle 148 — "Add another ad row" at the bottom of the list.
              Click → file picker → new row appended with the chosen asset.
              Avoids forcing operators back up to Step 5's drop zone every
              time they want to add one more ad. */}
          <label
            className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-brand-400 hover:text-brand-700 cursor-pointer"
            title="Append another ad row. Pick a file from your computer and it lands as the next row."
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add another ad row
            <input
              type="file"
              accept="video/*,image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                ingestLocalFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {applyToAllAdCopy && rows.length > 1 && (
            <div className="text-xs text-slate-500 mt-3">
              Edits are disabled on rows 2+ — uncheck "Share copy across all ads" to customize per-row.
            </div>
          )}
        </div>
      )}

      {/* Validation summary + save bar */}
      {/* Cycle 236 — hide the sticky save bar when the operator hasn't
          typed anything yet (no Ad ID, no rows). Frees vertical space
          on the empty-state Step 0 view. */}
      <div className={` px-8 py-3 bg-white/95 backdrop-blur border-t border-slate-200 ${
        !adId.trim() && rows.length === 0 ? "hidden" : ""
      }`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {validation.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Cycle 512 — when only soft advisories remain, Save is enabled;
                    show the green "Ready to save" lead-in and render the soft
                    items as muted "notes" (slate) rather than blocking amber
                    "to-do" pills. Hard blockers stay amber and keep the button
                    disabled. */}
                {canSave ? (
                  <span className="text-xs font-semibold text-emerald-700 shrink-0 inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px]">✓</span>
                    Ready to save — heads-up:
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-700 shrink-0">To-do — click to jump:</span>
                )}
                {validation.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => jumpToStep(v.step)}
                    className={`text-xs px-2 py-1 rounded-full transition font-medium ${
                      v.soft
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    }`}
                    title={`Jump to Step ${stepDisplayNo(v.step)}`}
                  >
                    Step {stepDisplayNo(v.step)} · {v.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-2">
                {/* Cycle 231 — pulse the checkmark briefly to grab the
                    operator's attention once everything is green.
                    motion-safe so prefers-reduced-motion users opt out. */}
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] motion-safe:animate-pulse">✓</span>
                Ready to save.
              </div>
            )}
          </div>
          {saveLaunch.isError && <div className="text-sm text-red-600">{(saveLaunch.error as Error).message}</div>}
          {/* Launch mode: "Launch now" (default) fires immediately onto the
              background queue; "Schedule for later" reveals the datetime picker.
              The schedule field only exists in schedule mode, so nobody is
              silently pushed into scheduling a launch they meant to fire now. */}
          <div className="flex flex-col items-end gap-1 mr-2">
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="uppercase tracking-wider font-semibold text-slate-500">Launch</span>
              <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] ${launchMode === "now" ? "bg-sky-100 text-sky-900 font-semibold" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setLaunchMode("now")}
                  title="Launch immediately — creates the ad(s) now and runs them in the background queue."
                >
                  Launch now
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] border-l border-slate-300 ${launchMode === "schedule" ? "bg-sky-100 text-sky-900 font-semibold" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setLaunchMode("schedule")}
                  title="Schedule for a future time — the ad(s) are created at that time by the scheduled worker."
                >
                  Schedule for later
                </button>
              </div>
            </div>
            {launchMode === "now" && (
              <div className="text-[10px] text-slate-500">
                Fires immediately in the background · lands {launchPaused ? "PAUSED" : "ACTIVE (spending)"}
              </div>
            )}
            {launchMode === "schedule" && (
            <>
            {/* Cycle 329 — schedule shows the ad-account timezone + defaults
                to midnight of the next day in that timezone.
                The datetime-local input expresses everything in the
                browser's local timezone (no native way around that), so
                the default value is the BROWSER-LOCAL equivalent of
                "midnight tomorrow in the ad account's tz". The label
                makes the tz explicit. */}
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Schedule <span className="text-rose-500">*</span>
              {(() => {
                const acct = accounts.find((a) => a.id === accountId);
                const tz = acct?.timezone_name ?? null;
                return tz ? (
                  <span className="normal-case tracking-normal font-normal text-slate-600">
                    · ad account tz: <span className="font-mono">{tz}</span>
                  </span>
                ) : null;
              })()}
            </label>
            <input
              type="datetime-local"
              className={`text-xs px-2 py-1 rounded border border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-200 font-mono${(errorMap["schedule"] || errorMap["schedule-past"]) ? " !border-rose-400 !ring-1 !ring-rose-200" : ""}`}
              value={scheduledFor}
              onChange={(e) => {
                setScheduledFor(e.target.value);
                setScheduledForUserSet(true);
              }}
              title={(() => {
                const acct = accounts.find((a) => a.id === accountId);
                const tz = acct?.timezone_name ?? null;
                return tz
                  ? `Time entered is interpreted in the ad account's timezone (${tz}), NOT your browser's. Type 00:00 to fire at midnight in ${tz}.`
                  : "Pick a future time to fire this launch.";
              })()}
            />
            <FieldError for="schedule" />
            <FieldError for="schedule-past" />
            {scheduledFor && (
              <div className="text-[10px] text-sky-700 font-medium">
                {(() => {
                  const acct = accounts.find((a) => a.id === accountId);
                  const tz = acct?.timezone_name ?? null;
                  if (!tz) {
                    // No tz known — fall back to treating as browser-local.
                    try { return <>Will fire {new Date(scheduledFor).toLocaleString()}</>; } catch { return null; }
                  }
                  try {
                    const utcIso = naiveTzStringToUtcIso(scheduledFor, tz);
                    const utcDate = new Date(utcIso);
                    const browserStr = utcDate.toLocaleString();
                    return (
                      <>
                        Will fire at <span className="font-semibold">{scheduledFor.replace("T", " ")}</span>{" "}
                        in <span className="font-mono">{tz}</span>
                        <span className="text-slate-500"> · your local: {browserStr}</span>
                      </>
                    );
                  } catch { return null; }
                })()}
                <button
                  type="button"
                  className="ml-1.5 text-slate-500 hover:text-slate-900 underline"
                  onClick={() => { setScheduledFor(""); setScheduledForUserSet(true); }}
                >
                  clear
                </button>
              </div>
            )}
            </>
            )}
            {/* Cycle 325 / 340 — two-state ship-as toggle (PAUSED default). Applies to BOTH Meta and
                AppLovin: PAUSED = launch then manually enable; ACTIVE = go live immediately on launch. */}
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="uppercase tracking-wider font-semibold text-slate-500">Ship as</span>
              <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
                <button
                  type="button"
                  className={`px-2 py-1 text-[10px] ${launchPaused === true ? "bg-amber-100 text-amber-900 font-semibold" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setLaunchPaused(true)}
                  title={platform === "Applovin"
                    ? "Create the creative set(s) PAUSED — flip LIVE later via Enable on the launch log. Safer for a review pass."
                    : "Ship to Meta in PAUSED state — operator must manually enable in Ads Manager. Safer for launches that need a review pass."}
                >
                  PAUSED
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-[10px] border-l border-slate-300 ${launchPaused === false ? "bg-emerald-100 text-emerald-900 font-semibold" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setLaunchPaused(false)}
                  title={platform === "Applovin"
                    ? "Ship the creative set(s) LIVE immediately on launch — starts spending."
                    : "Ship to Meta in ACTIVE state — starts spending immediately."}
                >
                  ACTIVE
                </button>
              </div>
            </div>
          </div>
          <button
            className="btn-primary inline-flex items-center gap-2"
            disabled={saveLaunch.isPending || !canSave}
            onClick={() => {
              if (!canSave || saveLaunch.isPending) return;
              saveLaunch.mutate();
            }}
            // Cycle 234 — tooltip explains why the button is disabled
            // by listing remaining validation issues. Disabled buttons
            // don't fire mouse events so this surfaces on hover.
            title={
              !canSave
                ? `Resolve ${validation.length} issue${validation.length === 1 ? "" : "s"}: ${validation.map((v) => v.label).join(" · ")}`
                : "Save (⌘↵ / Ctrl+Enter)"
            }
          >
            <span>{saveLaunch.isPending
              ? (launchMode === "schedule" ? "Scheduling…" : "Launching…")
              : (launchMode === "schedule" ? "Schedule launch" : "Launch now")}</span>
            {!saveLaunch.isPending && canSave && (
              <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] font-mono bg-white/15 border border-white/20 rounded px-1.5 py-0.5 text-white/80">
                ⌘
                <span>↵</span>
              </kbd>
            )}
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

type FrameioStatus = {
  configured: boolean;
  connected: boolean;
  grant?: "client_credentials" | "authorization_code";
  paste_mode?: boolean;
  expires_at?: string;
  user_email?: string | null;
  has_refresh?: boolean;
  reason?: string;
};

function FrameioConnectionBar() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: status } = useQuery({
    queryKey: ["frameio-oauth-status"],
    queryFn: () => api.get<FrameioStatus>("/api/frameio/oauth/status"),
    refetchInterval: (q) => (q.state.data?.connected ? false : 8000),
  });

  if (!status) return null;

  if (!status.configured) {
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        v4 (<code className="bg-white px-1 rounded">next.frame.io</code>) sign-in isn't configured on the
        server yet. v2 (<code className="bg-white px-1 rounded">app.frame.io</code>) folders still work.
      </div>
    );
  }

  const isS2S = status.grant === "client_credentials";

  if (!status.connected) {
    if (isS2S) {
      return (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <span className="font-semibold">Frame.io v4 token failed.</span> Server-to-Server credentials are set
          but Adobe IMS rejected them. Check FRAMEIO_OAUTH_CLIENT_ID / SECRET on the server.
        </div>
      );
    }
    if (status.paste_mode) return <PasteModeBar />;
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="text-xs text-amber-900">
          <span className="font-semibold">Frame.io v4 not connected.</span>{" "}
          Click Connect to sign in once — then v4 folder URLs will fetch like v2.
        </div>
        <a className="btn-primary text-xs h-8 px-3" href="/api/frameio/oauth/start">
          Connect Frame.io
        </a>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="text-xs text-emerald-900">
        <span className="font-semibold">✓ Frame.io v4 connected.</span>
        {isS2S ? " (server-to-server — no sign-in needed)" : status.user_email ? ` ${status.user_email}` : ""}
      </div>
      {!isS2S && (
        <button
          className="btn-secondary text-xs h-8 px-3"
          onClick={async () => {
            await api.post("/api/frameio/oauth/disconnect");
            qc.invalidateQueries({ queryKey: ["frameio-oauth-status"] });
            toast("info", "Disconnected from Frame.io.");
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}

function PasteModeBar() {
  const qc = useQueryClient();
  const toast = useToast();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    // Detect common Adobe-side errors in the pasted URL BEFORE we try to
    // exchange the code, so the message surfaces what to do next.
    const trimmed = paste.trim();
    if (/[?&]error=invalid_scope/.test(trimmed)) {
      setErr(
        "Adobe rejected the scope. Our credential isn't registered for one or more of the scopes we requested. " +
          "Either (a) drag the file in via the Upload tab — no Frame.io login needed, or " +
          "(b) ask the dev who set up the Adobe credential to enable the missing scope, then retry."
      );
      setBusy(false);
      return;
    }
    const m = trimmed.match(/[?&]error=([^&]+)/);
    if (m) {
      setErr(`Adobe returned error=${decodeURIComponent(m[1])}. Sign in again, or use drag/drop instead.`);
      setBusy(false);
      return;
    }
    try {
      await api.post("/api/frameio/oauth/paste", { url: trimmed });
      toast("success", "Frame.io connected.");
      qc.invalidateQueries({ queryKey: ["frameio-oauth-status"] });
      setPaste("");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to exchange code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
      <div className="text-xs text-amber-900 mb-2">
        <span className="font-semibold">One-time Frame.io connect (paste mode).</span>{" "}
        Click below to sign in with Adobe. You'll land on a "page can't be reached" screen — that's
        expected. Copy the full URL from your browser's address bar and paste it here.
      </div>
      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <a
          className="btn-primary text-xs h-8 px-3 inline-flex items-center justify-center"
          href="/api/frameio/oauth/start"
          target="_blank"
          rel="noopener noreferrer"
        >
          1. Open Adobe sign-in →
        </a>
        <input
          className="al-input text-xs flex-1 font-mono"
          placeholder="2. Paste the URL you landed on (https://…?code=…&state=…)"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          disabled={busy}
        />
        <button
          className="btn-primary text-xs h-8 px-3"
          disabled={!paste.trim() || busy}
          onClick={submit}
        >
          {busy ? "Connecting…" : "3. Connect"}
        </button>
      </div>
      {err && <div className="text-xs text-red-700 mt-2">{err}</div>}
    </div>
  );
}

type BulkTemplate = {
  id: string;
  name: string;
  call_to_action: string;
  primary_text: string;
  headline: string;
  description: string;
  is_default: boolean;
};

function BulkFillPanel({
  initial,
  ctaOptions,
  charLimits,
  sharedMode,
  templates,
  templateId,
  onTemplateChange,
  onApply,
  errors,
}: {
  initial: { primary_text: string; headline: string; description: string; call_to_action: string } | null;
  ctaOptions: string[];
  charLimits: { primary_text: number; headline: number; description: number };
  sharedMode: boolean;
  templates: BulkTemplate[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  onApply: (
    patch: { primary_text: string; headline: string; description: string; call_to_action: string },
    opts?: { fromClick?: boolean },
  ) => void;
  errors?: { cta?: string | null; headline?: string | null; primary?: string | null };
}) {
  const [open, setOpen] = useState(true);
  const [primary, setPrimary] = useState(initial?.primary_text ?? "");
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cta, setCta] = useState(initial?.call_to_action ?? "Learn more");
  // Sync initial values when the user changes brand/product upstream
  useEffect(() => {
    if (initial) {
      setPrimary(initial.primary_text || "");
      setHeadline(initial.headline || "");
      setDescription(initial.description || "");
      setCta(initial.call_to_action || "Learn more");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.primary_text, initial?.headline, initial?.description]);

  // In shared (apply-to-all) mode, propagate edits to every row in real
  // time — debounced 250ms so we batch keystrokes. Operator no longer has
  // to remember to click "Apply to every ad →"; the per-row state is just
  // the bulk editor's state. (Cycle 101 fix — silent data loss bug where
  // typing without clicking Apply left every row blank.)
  useEffect(() => {
    if (!sharedMode) return;
    const t = window.setTimeout(() => {
      onApply({ primary_text: primary, headline, description, call_to_action: cta });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedMode, primary, headline, description, cta]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  // "Custom" status: copy state has diverged from the selected template's
  // source values. When no template is selected, "Custom" doesn't apply.
  const isCustom = selectedTemplate
    ? selectedTemplate.primary_text !== primary
      || selectedTemplate.headline !== headline
      || selectedTemplate.description !== description
      || selectedTemplate.call_to_action !== cta
    : false;

  function applyTemplateNow(t: BulkTemplate) {
    setPrimary(t.primary_text);
    setHeadline(t.headline);
    setDescription(t.description);
    setCta(t.call_to_action);
    onTemplateChange(t.id);
  }

  return (
    <div className="rounded-xl border border-brand-200/60 bg-gradient-to-br from-brand-50/40 to-white p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-brand-500 text-white text-[10px] font-bold">⇊</span>
          <span className="text-sm font-semibold text-slate-900">
            {sharedMode ? "Copy · shared across every ad" : "Set copy once · apply to every row"}
          </span>
          {/* Status chip — shows current template name or "Custom" when the
              displayed copy has diverged from the template's source values. */}
          {selectedTemplate ? (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                isCustom
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
              title={isCustom ? "Copy was edited past the template's source values — won't update the saved template." : "Copy matches the template exactly."}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isCustom ? "bg-amber-500" : "bg-emerald-500"}`} />
              {isCustom ? "Custom" : selectedTemplate.name}
            </span>
          ) : templates.length > 0 ? (
            // Cycle 148 — when no template is picked but the operator has
            // typed any copy, flip the chip to "Custom" (amber). The old
            // chip said "No template" forever which made it look like the
            // copy wasn't getting saved. "Custom" matches the language we
            // use when a selected template's copy is mutated past source.
            (() => {
              const hasManualCopy = (primary || headline || description || "").trim().length > 0;
              if (hasManualCopy) {
                return (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
                    title="No template picked — the copy you typed is the source of truth for this launch."
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Custom
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  No template
                </span>
              );
            })()
          ) : null}
        </div>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {templates.length > 0 && (
            <div>
              <label className="al-label flex items-center justify-between">
                <span>Creative Template</span>
                {selectedTemplate && isCustom && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); applyTemplateNow(selectedTemplate); }}
                    className="text-[10px] text-brand-600 hover:underline font-medium"
                    title="Restore the copy to the saved template values"
                  >
                    ↺ Reset to {selectedTemplate.name}
                  </button>
                )}
              </label>
              <select
                className="al-input"
                value={templateId}
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  if (t) applyTemplateNow(t);
                  else onTemplateChange("");
                }}
              >
                <option value="">— no template (manual copy) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.is_default ? " · default" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
            <div>
              <label className="al-label">CTA</label>
              <select className={`al-input${errors?.cta ? " !border-rose-400 !ring-1 !ring-rose-200" : ""}`} value={cta} onChange={(e) => setCta(e.target.value)}>
                <option value="">— select —</option>
                {ctaOptions.map((c) => <option key={c}>{c}</option>)}
              </select>
              {errors?.cta && (
                <p className="text-[11px] text-rose-600 mt-1 flex items-start gap-1" role="alert">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[2px]">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{errors.cta}</span>
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <BulkCountedField label="Headline" max={charLimits.headline} soft={SOFT_LIMITS.headline} value={headline} onChange={setHeadline} error={errors?.headline} />
            <BulkCountedField label="Description" max={charLimits.description} soft={SOFT_LIMITS.description} value={description} onChange={setDescription} />
          </div>
          <BulkCountedField label="Primary Text" max={charLimits.primary_text} soft={SOFT_LIMITS.primary_text} value={primary} onChange={setPrimary} textarea rows={3} error={errors?.primary} />
          {/* Cycle 148 — in shared-copy mode every keystroke already
              propagates to every row (see the useEffect in the parent
              that mirrors this state into all rows). The Apply button is
              redundant noise in that mode; only show it when the operator
              has UNticked "Share copy across all ads" and is using this
              panel as a one-shot bulk-fill. */}
          {!sharedMode && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => onApply({ primary_text: primary, headline, description, call_to_action: cta }, { fromClick: true })}
              >
                Apply to all rows →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BulkCountedField({
  label, max, value, onChange, textarea, rows, error,
}: {
  label: string; max: number; soft?: number; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number; error?: string | null;
}) {
  // Cycle 326 — `soft` ignored. Only Meta's hard limit triggers a red counter.
  const len = value.length;
  const overHard = len > max;
  const tone = overHard ? "text-red-600 font-bold" : "text-slate-400";
  const errCls = error ? " !border-rose-400 !ring-1 !ring-rose-200" : "";
  return (
    <div>
      <label className="al-label flex items-center justify-between">
        <span>{label}</span>
        <span
          className={`text-[10px] font-mono ${tone}`}
          title={overHard ? `Past Meta's API hard limit of ${max} — launch will be rejected.` : undefined}
        >
          {len}/{max}
        </span>
      </label>
      {textarea ? (
        <textarea className={`al-input${errCls}`} rows={rows ?? 2} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={`al-input${errCls}`} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {error && (
        <p className="text-[11px] text-rose-600 mt-1 flex items-start gap-1" role="alert">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[2px]">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition ${
        active ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

// Cycle 512 — auto-growing textarea for the Step 6 Ad Name / File Name fields.
// Frame.io filenames come in long and poorly named, so media buyers rename them;
// a single-line <input> forced arrow-key scrolling left/right to edit. A textarea
// soft-wraps the (often space-less) name across as many lines as needed and grows
// with its content, so the whole name is visible + editable — no horizontal scroll.
function AutoGrowTextarea({
  value,
  onChange,
  className,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}

function Field({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="al-label">
        {label}
        {info && <HelpTip text={info} />}
      </label>
      {children}
    </div>
  );
}

type AdmanageCampaign = {
  campaign_id: string;
  ad_account_id: string;
  name: string;
  platform: string | null;
  status: string | null;
  objective: string | null;
  buying_type: string | null;
  // Cycle 330 — surface budget so the launcher can show it when locking.
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  total_spend: number | null;
  ad_set_count: number | null;
  last_updated: string | null;
};

/**
 * Cycle 331 — read-only display card for an already-picked existing
 * campaign. Surfaces objective / buying type / budget / status so the
 * operator can verify they picked the right one without re-opening
 * Ads Manager. Re-fetches the campaign list to find this row by ID
 * (cheap — server-side 60s cache).
 */
function ExistingCampaignLockedCard({
  accountId,
  mode,
  campaignId,
  campaignName,
  onChange,
}: {
  accountId: string;
  mode: "abo" | "cbo";
  campaignId: string;
  campaignName: string;
  onChange: () => void;
}) {
  const { data: campaignsData } = useQuery({
    queryKey: ["admanage-campaigns", accountId, mode, ""],
    queryFn: () => {
      const params = new URLSearchParams({ account_id: accountId, mode });
      return api.get<{ ok: boolean; campaigns: AdmanageCampaign[] }>(`/api/admanage/campaigns?${params}`);
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
  const campaigns = (Array.isArray(campaignsData) ? campaignsData : campaignsData?.campaigns) ?? [];
  const c = campaigns.find((x) => x.campaign_id === campaignId) ?? null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Existing campaign</div>
          <div className="font-semibold text-slate-900 truncate" title={c?.name ?? campaignName}>{c?.name ?? campaignName}</div>
          <div className="text-[10px] font-mono text-slate-400">id {campaignId}</div>
        </div>
        <button
          type="button"
          className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
          onClick={onChange}
          title="Pick a different campaign."
        >
          Change
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <ReadOnlyChip label="Status" value={c?.status ?? "—"} tone={c?.status === "ACTIVE" ? "emerald" : "slate"} />
        <ReadOnlyChip label="Objective" value={c?.objective ?? "—"} />
        <ReadOnlyChip label="Buying" value={c?.buying_type ?? "—"} />
        <ReadOnlyChip
          label={c?.daily_budget != null ? "Daily budget" : c?.lifetime_budget != null ? "Lifetime budget" : "Budget"}
          value={
            c?.daily_budget != null ? `$${c.daily_budget.toFixed(2)}` :
            c?.lifetime_budget != null ? `$${c.lifetime_budget.toFixed(2)}` :
            "ad-set level (ABO)"
          }
        />
      </div>
    </div>
  );
}

function ReadOnlyChip({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "slate" }) {
  const cls = tone === "emerald" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-white text-slate-700 border-slate-200";
  return (
    <div className={`rounded border px-2 py-1 ${cls}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="font-mono truncate" title={value}>{value}</div>
    </div>
  );
}

/**
 * Searchable combobox for existing-ABO/CBO campaign selection.
 *
 * Queries `/api/admanage/campaigns?account_id=&mode=&q=` (mode is "abo" or
 * "cbo" — pre-filtered server-side). Debounced to 250ms. Picking a result
 * commits the campaign name to the parent state. Typing a totally custom
 * name is still allowed (free-text fallback when the campaign isn't in our
 * mirror yet).
 */
function ExistingCampaignPicker({
  accountId,
  mode,
  value,
  onChange,
}: {
  accountId: string;
  mode: "abo" | "cbo";
  value: string;
  onChange: (name: string, campaignId?: string | null) => void;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => { setQ(value); }, [value]);

  const { data: resultsData, isFetching } = useQuery({
    queryKey: ["admanage-campaigns", accountId, mode, debounced],
    queryFn: () => {
      const params = new URLSearchParams({ account_id: accountId, mode });
      if (debounced.trim()) params.set("q", debounced.trim());
      return api.get<{ ok: boolean; campaigns: AdmanageCampaign[] }>(`/api/admanage/campaigns?${params}`);
    },
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
  const results = (Array.isArray(resultsData) ? resultsData : resultsData?.campaigns) ?? [];

  function selectCampaign(c: AdmanageCampaign) {
    onChange(c.name, c.campaign_id);
    setQ(c.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          className="al-input flex-1"
          placeholder={accountId ? `Search live campaigns in this account…` : "Pick an ad account first"}
          value={q}
          disabled={!accountId}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value, null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 200)} // delay to allow click
        />
        {q !== debounced && !isFetching && (
          <span className="text-xs text-amber-600 font-medium">searching…</span>
        )}
        {isFetching && (
          <span className="text-xs text-blue-600 font-medium">loading…</span>
        )}
      </div>
      {open && accountId && (isFetching || results.length > 0) && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-card">
          {isFetching ? (
            <div className="px-3 py-3 text-[11px] text-slate-500">Loading campaigns…</div>
          ) : (
            <>
              {/* Cycle 173 — ACTIVE campaigns at the top, same ordering rule
                  as the adset picker (Cycle 172). */}
              {[...results].sort((a, b) => {
                const aActive = a.status === "ACTIVE" ? 0 : 1;
                const bActive = b.status === "ACTIVE" ? 0 : 1;
                return aActive - bActive;
              }).map((c) => {
            const isSelected = c.name === value;
            return (
              <button
                key={c.campaign_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCampaign(c)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-brand-50 transition-colors border-b border-slate-100 last:border-0 ${isSelected ? "bg-brand-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      c.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : c.status === "PAUSED"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {c.status ?? "?"}
                  </span>
                  <span className="font-medium text-slate-900 truncate flex-1" title={c.name}>{c.name}</span>
                  {c.ad_set_count != null && (
                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{c.ad_set_count} ad sets</span>
                  )}
                </div>
                {(c.total_spend ?? 0) > 0 && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    ${Number(c.total_spend).toLocaleString(undefined, { maximumFractionDigits: 0 })} spent
                  </div>
                )}
              </button>
            );
          })}
            </>
          )}
        </div>
      )}
      {accountId && results.length === 0 && !isFetching && (
        <div className="text-sm font-semibold text-red-600 mt-2 px-2 py-1.5 rounded bg-red-50 border border-red-200">
          {q.trim() ? "No matching campaigns" : "No campaigns available"}
        </div>
      )}
    </div>
  );
}

type LiveAdSet = {
  adset_id: string;
  name: string;
  status: string | null;
  optimization_goal: string | null;
  attribution_spec: string | null;
  placement_mode: string | null;
  manual_placements: string[] | null;
  age_min: number | null;
  age_max: number | null;
  genders: number[] | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
};

/**
 * Fix 2 — searchable picker for live ad sets inside the chosen campaign.
 * Calls /api/admanage/adsets?account_id=&campaign_id=&q= (pipeline-node).
 * When the operator picks one, onSelect fires with the full adset settings
 * so Step 4 can pre-fill targeting/attribution/placement fields.
 */
function LiveAdSetPicker({
  accountId,
  campaignId,
  onSelect,
}: {
  accountId: string;
  campaignId: string;
  onSelect: (adset: LiveAdSet) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data: resultsData, isFetching } = useQuery({
    queryKey: ["admanage-adsets", accountId, campaignId, debounced],
    queryFn: () => {
      const params = new URLSearchParams({ account_id: accountId, campaign_id: campaignId });
      if (debounced.trim()) params.set("q", debounced.trim());
      return api.get<{ ok: boolean; adsets: LiveAdSet[] }>(`/api/admanage/adsets?${params}`);
    },
    enabled: Boolean(accountId) && Boolean(campaignId),
    staleTime: 60_000,
  });
  const results = (Array.isArray(resultsData) ? resultsData : resultsData?.adsets) ?? [];

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          className="al-input flex-1"
          placeholder={accountId && campaignId ? "Search live ad sets in this campaign…" : "Pick a campaign first"}
          value={q}
          disabled={!accountId || !campaignId}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 200)}
        />
        {isFetching && <span className="text-xs text-blue-600 font-medium">loading…</span>}
      </div>
      {open && accountId && campaignId && (isFetching || results.length > 0) && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-card">
          {isFetching ? (
            <div className="px-3 py-3 text-[11px] text-slate-500">Loading ad sets…</div>
          ) : results.map((a) => (
            <button
              key={a.adset_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(a); setQ(a.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${a.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {a.status ?? "?"}
                </span>
                <span className="font-medium text-slate-900 truncate flex-1" title={a.name}>{a.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                {[a.optimization_goal, a.placement_mode].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}
      {accountId && campaignId && results.length === 0 && !isFetching && q.trim() && (
        <div className="text-sm font-semibold text-slate-500 mt-2 px-2 py-1.5 rounded bg-slate-50 border border-slate-200">
          No matching ad sets
        </div>
      )}
    </div>
  );
}

/**
 * Destination-URL preview block.
 *
 * Shows the FULL URL in a wrapping mono block (no truncation — the user
 * asked to see the whole thing). "Preview link (US visitor)" button POSTs
 * to /api/preview-link which fills in random realistic Meta-style values
 * for {{ad.id}}, {{adset.id}}, {{campaign.id}}, etc., follows the redirect
 * chain through the US VPS, and surfaces (a) the substituted URL it'll
 * open, (b) every hop, (c) the final landing URL. Then opens the
 * substituted URL in a new tab so the user can eyeball the landing page
 * as a US visitor would see it.
 */
/**
 * Cycle 353 — Compact audience picker for the launch-page Step 4
 * targeting overrides. Pulls live audiences from the same endpoint
 * the AccountsPage TargetingTemplates editor uses, but renders a
 * lean inline list (no separate refresh chrome — operator picks +
 * moves on). Selected audience IDs flow up to the parent's override
 * state, which serializes into the launch payload (C345).
 */
function LaunchAudiencePicker({
  accountId, label, selected, onChange,
}: {
  accountId: string;
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useQuery({
    queryKey: ["meta-account-audiences", accountId],
    queryFn: () => api.get<{
      ok: boolean;
      audiences: { audience_id: string; name: string; approximate_count: number | null }[];
    }>(`/api/meta-accounts/${accountId}/audiences`),
    staleTime: 60_000,
    enabled: !!accountId,
  });
  const audiences = data?.audiences ?? [];
  const byId = new Map(audiences.map((a) => [a.audience_id, a]));
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? audiences.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()) || a.audience_id.includes(q))
    : audiences;
  return (
    <div>
      <label className="al-label flex items-baseline justify-between">
        <span>{label}</span>
        <span className="text-[10px] font-mono text-slate-400">{selected.length} picked / {audiences.length} avail</span>
      </label>
      <div className="border border-slate-200 rounded-md bg-slate-50/50 p-2 space-y-1.5">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200">
                {byId.get(id)?.name ?? id.slice(0, 12)}
                <button
                  type="button"
                  className="text-brand-700 hover:text-brand-900"
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          className="al-input text-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={audiences.length ? "Search audiences…" : "Loading…"}
        />
        {audiences.length > 0 && (
          <div className="max-h-32 overflow-auto bg-white border border-slate-200 rounded">
            {filtered.slice(0, 25).map((a) => {
              const checked = selected.includes(a.audience_id);
              return (
                <label key={a.audience_id} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      onChange(e.target.checked
                        ? [...selected, a.audience_id]
                        : selected.filter((x) => x !== a.audience_id));
                    }}
                  />
                  <span className="truncate flex-1">{a.name}</span>
                  {a.approximate_count != null && (
                    <span className="text-[10px] font-mono text-slate-400">{a.approximate_count.toLocaleString()}</span>
                  )}
                </label>
              );
            })}
            {filtered.length > 25 && (
              <div className="text-[10px] text-slate-500 italic px-2 py-1">… {filtered.length - 25} more — refine search</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DestinationPreview({ url, namingCode }: { url: string; namingCode: string | null }) {
  // Cycle 324 — preview state removed (result panel no longer renders).
  // The button auto-opens the resolved URL in a new tab; that's the
  // entire UX surface now.
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.post<any>("/api/preview-link", { url, source: "fb", naming_code: namingCode ?? undefined });
      if (!r.ok) {
        setErr(r.error ?? "Preview failed");
      } else {
        // Open the URL the cloaker chain resolved to. Our VPS is in Boston
        // (ipinfo: 2.24.192.34 → Hostinger US AS47583) so when we hit the
        // cloaker with an iPhone-FB fingerprint, it issues a real VLM
        // session URL (e.g. quiz.trycleantra.com/1b-lymph-quiz?cep=...)
        // with embedded session tokens that authorize the holder past
        // further cloaker checks — meaning the operator can open it from
        // any geo and see the actual funnel. Always use final_url directly
        // (whether funnel or safe_page), never proxy through localhost endpoint.
        window.open(r.final_url, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {/* Cycle 324 — operator pushback: single button only. The button
          itself runs the preview + opens the resolved URL in a new tab
          (cep-token or proxy fallback transparently). No result panel,
          no second "Open via proxy" button, no separate Copy button —
          the raw URL block below the button is the only secondary chrome. */}
      <button
        type="button"
        className="text-[11px] font-medium text-brand-700 hover:bg-brand-50 px-2 py-1 rounded border border-brand-200 inline-flex items-center gap-1.5"
        onClick={run}
        disabled={loading}
        title="Substitutes Meta placeholders with realistic test values, follows the cloaker chain through our US VPS, opens the destination in a new tab. Same effect as an organic FB click from US."
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {loading ? "Testing…" : "Preview as US visitor"}
      </button>
      <div className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 break-all leading-relaxed">
        {url}
      </div>
      {err && <div className="text-[10px] text-red-700">Preview failed: {err}</div>}
    </div>
  );
}

// Cycle 286 — UtmBreakdown removed entirely (see invocation removal above).
// Was a per-variation collapsible URL-parameter chip; the operator finds it
// useless because their funnels intentionally don't use canonical utm_* keys.

type AdmanageAdset = {
  adset_id: string;
  campaign_id: string;
  ad_account_id: string;
  name: string;
  status: string | null;
  optimization_goal: string | null;
  ad_count: number | null;
  destination_type: string | null;
  last_updated: string | null;
};

/**
 * Searchable ad-set picker — once a campaign is selected, the buyer picks
 * which ad-set inside it to launch the new ads INTO. Real-time list from
 * the AdManage adsets mirror with current ACTIVE/PAUSED + ad count per set.
 */
function ExistingAdsetPicker({
  campaignId,
  valueId,
  valueName,
  onChange,
}: {
  campaignId: string;
  valueId: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
}) {
  const [q, setQ] = useState(valueName);
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(valueName);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => { setQ(valueName); }, [valueName]);

  const { data: resultsData, isFetching } = useQuery({
    queryKey: ["admanage-adsets", campaignId, debounced],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set("q", debounced.trim());
      return api.get<{ ok: boolean; adsets: AdmanageAdset[] }>(`/api/admanage/campaigns/${campaignId}/adsets${params.toString() ? `?${params}` : ""}`);
    },
    enabled: Boolean(campaignId),
    staleTime: 60_000,
  });
  const results = (Array.isArray(resultsData) ? resultsData : resultsData?.adsets) ?? [];

  function selectAdset(a: AdmanageAdset) {
    onChange(a.adset_id, a.name);
    setQ(a.name);
    setOpen(false);
  }

  if (!campaignId) {
    return (
      <input
        className="al-input"
        placeholder="Pick a campaign first"
        disabled
        value=""
      />
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          className="al-input flex-1"
          placeholder="Search ad sets in this campaign…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 200)}
        />
        {q !== debounced && !isFetching && (
          <span className="text-xs text-amber-600 font-medium">searching…</span>
        )}
        {isFetching && (
          <span className="text-xs text-blue-600 font-medium">loading…</span>
        )}
      </div>
      {valueId && (
        <div className="text-[10px] text-slate-500 mt-1 font-mono">
          Selected: <span className="text-emerald-700">{valueId}</span>
        </div>
      )}
      {open && (isFetching || results.length > 0) && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-card">
          {isFetching ? (
            <div className="px-3 py-3 text-[11px] text-slate-500">Loading ad sets…</div>
          ) : (
            <>
              {/* Cycle 172 — ACTIVE adsets at the top. Operators pick into
                  live adsets 95% of the time; sorting paused ones below
                  prevents accidentally selecting a paused adset. */}
              {[...results].sort((a, b) => {
                const aActive = a.status === "ACTIVE" ? 0 : 1;
                const bActive = b.status === "ACTIVE" ? 0 : 1;
                return aActive - bActive;
              }).map((a) => {
            const isSelected = a.adset_id === valueId;
            return (
              <button
                key={a.adset_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectAdset(a)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-brand-50 transition-colors border-b border-slate-100 last:border-0 ${isSelected ? "bg-brand-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      a.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.status ?? "?"}
                  </span>
                  <span className="font-medium text-slate-900 truncate flex-1" title={a.name}>{a.name}</span>
                  {a.ad_count != null && (
                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{a.ad_count} ads</span>
                  )}
                </div>
              </button>
            );
          })}
            </>
          )}
        </div>
      )}
      {results.length === 0 && !isFetching && (
        <div className="text-sm font-semibold text-red-600 mt-2 px-2 py-1.5 rounded bg-red-50 border border-red-200">
          {q.trim() ? "No matching ad sets" : "No ad sets available"}
        </div>
      )}
    </div>
  );
}

/**
 * Small corner-button overlaid on the preview that triggers fullscreen on
 * the underlying <video> or <img>. Sits in the top-right of the preview box,
 * fades in on hover so it doesn't fight the native HTML5 video controls.
 */
function FullscreenBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className="absolute top-1.5 right-1.5 w-7 h-7 grid place-items-center rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/75 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/70"
      title="Fullscreen"
      aria-label="Open fullscreen preview"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    </button>
  );
}

/**
 * Snap pixel dimensions to the CLOSEST Meta-supported aspect ratio.
 *
 * Meta's placements accept these canonical ratios:
 *   9:16   — Stories, Reels (full-screen vertical)
 *   4:5    — Feed portrait (the workhorse for Facebook + Instagram feed)
 *   1:1    — Square (universal)
 *   1.91:1 — Link-ad landscape (horizontal feed)
 *   16:9   — Wider landscape (in-stream)
 *
 * Anything else gets mapped to its nearest neighbor. No more raw "1080x1349"
 * strings or `null`s in the UI — operators see a real placement label.
 */
const META_ASPECTS: Array<{ label: string; ratio: number }> = [
  { label: "9x16",   ratio: 9 / 16 },
  { label: "4x5",    ratio: 4 / 5 },
  { label: "1x1",    ratio: 1 },
  { label: "1.91x1", ratio: 1.91 },
  { label: "16x9",   ratio: 16 / 9 },
];
function snapToMetaAspect(w: number, h: number): string | null {
  if (!w || !h) return null;
  const r = w / h;
  // Log-space distance — treats 4:5 vs 9:16 the same way perceptually as
  // 1:1 vs 1.91:1. Without this a tall 1080x1349 (0.80) ends up closer to
  // 9:16 (0.5625) than to 4:5 (0.80) by linear distance, which is wrong.
  const dist = (a: number, b: number) => Math.abs(Math.log(a) - Math.log(b));
  let best = META_ASPECTS[0];
  let bestD = dist(r, best.ratio);
  for (const a of META_ASPECTS.slice(1)) {
    const d = dist(r, a.ratio);
    if (d < bestD) { best = a; bestD = d; }
  }
  return best.label;
}

/**
 * Read a local File's real MIME + dimensions and convert the natural-px
 * ratio to one of the operator-friendly aspect labels (9x16, 1x1, 4x5, 1.91x1, 16x9).
 * Returns null when the file isn't an image/video we can probe.
 * Used by the launcher to overwrite filename-derived aspect guesses with truth.
 */
async function probeAsset(file: File): Promise<{ mime: string; aspect: string | null; duration_sec: number | null } | null> {
  const mime = (file.type || "").toLowerCase();
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(file.name);
  const isVideo = mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);
  if (!isImage && !isVideo) return null;
  const url = URL.createObjectURL(file);
  try {
    const [w, h, duration] = await new Promise<[number, number, number | null]>((resolve, reject) => {
      if (isImage) {
        const img = new Image();
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight, null]);
        img.onerror = reject;
        img.src = url;
      } else {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.muted = true;
        v.onloadedmetadata = () => resolve([v.videoWidth, v.videoHeight, Number.isFinite(v.duration) ? v.duration : null]);
        v.onerror = reject;
        v.src = url;
      }
    });
    if (!w || !h) return { mime: isImage ? "image/?" : "video/?", aspect: null, duration_sec: duration };
    return { mime: mime || (isImage ? "image/?" : "video/?"), aspect: snapToMetaAspect(w, h), duration_sec: duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Field with a live character counter.
 *
 * Two thresholds:
 *   - `soft` (optional) — Meta's feed-display truncation point. Past this
 *     the counter goes amber + shows "feed shows ~N". Ad still launches.
 *   - `max` — Meta's API hard limit. Past this the counter goes red and
 *     the parent validation chip blocks Save.
 */
function CountedField({
  label,
  max,
  value,
  children,
}: {
  label: string;
  max: number;
  // Cycle 326 — `soft` param removed. Operator pushback: no warnings
  // for going past Meta's feed-display threshold. Counter is grey
  // until Meta's actual hard limit is exceeded (red).
  soft?: number; // kept in type for back-compat — ignored.
  value: string;
  children: React.ReactNode;
}) {
  const len = value.length;
  const overHard = len > max;
  const color = overHard ? "text-red-600 font-bold" : "text-slate-400";
  return (
    <div>
      <label className="al-label flex items-center justify-between">
        <span>{label}</span>
        <span
          className={`text-[10px] font-mono ${color}`}
          title={overHard ? `Past Meta's API hard limit of ${max} — launch will be rejected.` : undefined}
        >
          {len}/{max}
        </span>
      </label>
      {children}
    </div>
  );
}

/**
 * Real in-browser video preview for a Frame.io v4 asset.
 *
 * Renders a thin loading bar while we resolve the playable URL via
 * /api/frameio/asset/:id. Once resolved, swaps in an HTML5 <video controls>
 * with `preload="metadata"` so the browser shows the first frame + duration
 * without auto-buffering the whole file. Falls back to the thumbnail tile if
 * the asset has no playable URL yet (e.g. still transcoding) or if we
 * weren't given a file_id (manual filename entry path).
 */
function VariationPreview({
  fileId,
  thumb,
  aspect,
  localUrl,
  localMime,
  onDropFile,
  onAspectProbed,
}: {
  fileId: string | null;
  thumb: string | null;
  aspect: string | null | undefined;
  localUrl?: string | null;
  localMime?: string | null;
  onDropFile?: (file: File) => void;
  // Fires once the <img>/<video> reports its natural pixel dimensions, with
  // the closest Meta-supported aspect label. Lets the parent overwrite a
  // filename-guess aspect with reality. No-ops when an aspect was already
  // detected — the player only ever fills "?" / null aspects in.
  onAspectProbed?: (aspect: string) => void;
}) {
  const enabled = Boolean(fileId) && !localUrl; // skip Frame.io fetch if we have a local blob
  const [dragOver, setDragOver] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  // Tracks a failed <video> load (dead/expired/blocked src) so we degrade to the
  // drop-file fallback tile instead of a silent black player.
  const [videoError, setVideoError] = useState(false);
  // Drop / file-picker handlers — work in EVERY render branch so the user can
  // drop a file onto any state (no preview / loading / error / playable).
  const dropHandlers = onDropFile
    ? {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); },
        onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onDropFile(f);
        },
      }
    : {};
  const { data, isLoading, isError } = useQuery({
    queryKey: ["frameio-asset", fileId],
    queryFn: () => api.get<{ id: string; name: string; mime_type: string | null; size: number | null; thumbnail_url: string | null; playable_url: string | null; view_url: string | null; source?: string }>(`/api/frameio/asset/${fileId}`),
    enabled,
    staleTime: 60_000 * 30, // signed URLs valid for a while; refetch sparingly
    retry: 0,
  });
  // Server-side verification probe — confirms our backend can reach the file.
  const { data: verify } = useQuery({
    queryKey: ["frameio-verify", fileId],
    queryFn: () => api.get<{ ok: boolean; source: string; content_type?: string | null; content_length?: number | null; proxy_url?: string; reason?: string }>(`/api/frameio/asset/${fileId}/verify`),
    enabled: Boolean(data?.playable_url),
    staleTime: 60_000 * 5,
    retry: 0,
  });
  // Clear a prior load failure when the resolved source changes (e.g. a refetch
  // returns a fresh signed URL), so the player gets to retry.
  useEffect(() => { setVideoError(false); }, [data?.playable_url, verify?.proxy_url]);

  // Compute frame size — ~50% bigger than before so operators can actually
  // see the ad content + read on-screen text. 9x16 portrait stays tall,
  // 16x9 and 1.91x1 stay wide, 1x1 stays square.
  const box =
    aspect === "9x16"
      ? "w-40 aspect-[9/16]"
      : aspect === "16x9"
      ? "w-56 aspect-video"
      : aspect === "1.91x1"
      ? "w-56 aspect-[1.91/1]"
      : aspect === "1x1"
      ? "w-40 aspect-square"
      : aspect === "4x5"
      ? "w-40 aspect-[4/5]"
      : "w-40 h-40";

  const poster = data?.thumbnail_url ?? thumb ?? undefined;

  // Element ref + fullscreen handler — used by the corner button so users
  // don't have to hover the native controls to find the fullscreen toggle.
  const mediaRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const goFullscreen = () => {
    const el: any = mediaRef.current;
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el);
  };

  // Local drag-dropped file — instant in-browser preview from the blob URL.
  if (localUrl) {
    const isImage = (localMime ?? "").startsWith("image/");
    return (
      <div className={`${box} shrink-0 rounded-lg overflow-hidden bg-black border border-slate-200 relative group`}>
        {isImage ? (
          <img
            ref={(el) => { mediaRef.current = el; }}
            src={localUrl}
            alt=""
            className="w-full h-full object-contain bg-black"
            onLoad={(e) => {
              setImageLoading(false);
              if (aspect) return;
              const img = e.currentTarget;
              const snapped = snapToMetaAspect(img.naturalWidth, img.naturalHeight);
              if (snapped) onAspectProbed?.(snapped);
            }}
            onError={() => setImageLoading(false)}
          />
        ) : (
          <video
            ref={(el) => { mediaRef.current = el; }}
            className="w-full h-full object-contain bg-black"
            src={localUrl}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => {
              setImageLoading(false);
              if (aspect) return;
              const v = e.currentTarget;
              const snapped = snapToMetaAspect(v.videoWidth, v.videoHeight);
              if (snapped) onAspectProbed?.(snapped);
            }}
            onError={() => setImageLoading(false)}
          />
        )}
        {imageLoading && (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-white font-medium">Loading…</span>
            </div>
          </div>
        )}
        <FullscreenBtn onClick={goFullscreen} />
      </div>
    );
  }

  if (!enabled) {
    return (
      <label
        {...dropHandlers}
        className={`${box} shrink-0 rounded-lg relative cursor-pointer overflow-hidden border-2 border-dashed transition-colors ${
          dragOver ? "border-brand-500 bg-brand-50" : "border-amber-300 bg-gradient-to-br from-slate-900 to-slate-700"
        }`}
        title="Drop a video / image file here, or click to pick — instantly previews + attaches to this row."
      >
        <div className={`absolute inset-0 flex flex-col items-center justify-center text-center px-1 ${dragOver ? "text-brand-700" : "text-white"}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={dragOver ? "opacity-90" : "opacity-80"}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className={`text-[9px] font-mono mt-1 uppercase tracking-widest leading-tight ${dragOver ? "opacity-90" : "opacity-70"}`}>
            {dragOver ? "drop" : "drop / click"}
          </span>
          <span className={`text-[8px] font-mono mt-0.5 ${dragOver ? "opacity-60" : "opacity-50"}`}>
            {aspect ?? "video"}
          </span>
        </div>
        {onDropFile && (
          <input
            type="file"
            accept="video/*,image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onDropFile(f);
              e.target.value = "";
            }}
          />
        )}
      </label>
    );
  }

  if (isLoading) {
    return (
      <div className={`${box} shrink-0 rounded-lg bg-slate-100 overflow-hidden relative border border-slate-200`}>
        {poster ? <img src={poster} alt="" className="w-full h-full object-cover" /> : null}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-200 overflow-hidden">
          <div className="h-full bg-brand-500 animate-[load_1.4s_ease-in-out_infinite]" style={{ width: "40%" }} />
        </div>
        <div className="absolute inset-0 grid place-items-end">
          <span className="m-1.5 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-900/70 text-white">loading</span>
        </div>
        <style>{`@keyframes load { 0% { transform: translateX(-100%);} 50% { transform: translateX(50%);} 100% { transform: translateX(250%);} }`}</style>
      </div>
    );
  }

  if (isError || !data?.playable_url || videoError) {
    const viewUrl = data?.view_url ?? null;
    return (
      <label
        {...dropHandlers}
        className={`${box} shrink-0 rounded-lg overflow-hidden relative cursor-pointer border-2 border-dashed transition-colors ${
          dragOver ? "border-brand-500 bg-brand-50" : "border-amber-300 bg-amber-50/40"
        }`}
        title="Drop your video file here (or click to pick) to attach + preview instantly. The Frame.io draft has no streamable URL at our OAuth scope, so dragging the file in is the way."
      >
        {poster ? <img src={poster} alt="" className="w-full h-full object-cover" /> : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-700 grid place-items-center text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="opacity-90"><path d="M8 5v14l11-7z" /></svg>
          </div>
        )}
        {dragOver ? (
          <div className="absolute inset-0 grid place-items-center bg-brand-50 text-brand-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-gradient-to-t from-black/85 to-transparent text-[8px] font-mono text-white uppercase tracking-widest leading-tight">
            drop file or click ↓
          </div>
        )}
        {onDropFile && (
          <input
            type="file"
            accept="video/*,image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onDropFile(f);
              e.target.value = "";
            }}
          />
        )}
      </label>
    );
  }

  // Play the direct CDN URL. The server-side proxy (verify.proxy_url) is behind
  // authMiddleware and is a root-relative path, so a bare <video src> can neither
  // authenticate to it nor resolve it against the API origin — it only 401s/404s
  // to a black player. `verify` is kept purely as the green "backend can reach it"
  // badge below; playback always uses the signed CDN URL.
  const srcUrl = data.playable_url;
  const sizeMB = verify?.content_length ? (verify.content_length / 1024 / 1024).toFixed(1) : null;
  return (
    <div className={`${box} shrink-0 rounded-lg overflow-hidden bg-black border border-slate-200 relative group`}>
      <video
        ref={(el) => { mediaRef.current = el; }}
        className="w-full h-full object-contain bg-black"
        src={srcUrl}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        onError={() => setVideoError(true)}
        onLoadedMetadata={(e) => {
          // Probe runtime pixel dimensions and overwrite a missing aspect with
          // the closest Meta-supported ratio. Skip if the parent already has
          // one — operator-specified or filename-derived aspect takes priority.
          if (aspect) return;
          const v = e.currentTarget;
          const snapped = snapToMetaAspect(v.videoWidth, v.videoHeight);
          if (snapped) onAspectProbed?.(snapped);
        }}
      />
      <FullscreenBtn onClick={goFullscreen} />
      {verify?.ok && (
        <span
          className="absolute top-1 left-1 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/90 text-white border border-emerald-400"
          title={`Server verified the file is downloadable.\n${verify.content_type ?? ""}${sizeMB ? ` · ${sizeMB} MB` : ""}\nStreamed through our backend, not the original host.`}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          verified
        </span>
      )}
    </div>
  );
}

/**
 * Cycle 155 — group rows by aspect-ratio and surface the breakdown.
 * Meta's Advantage+ placements behave differently for vertical (9x16)
 * vs square (1x1) vs feed (4x5) — mixing them in one ad set means some
 * placements will silently drop ads they don't fit. Surface the mix so
 * the operator can decide whether to split into separate launches.
 */
function AspectMixChip({ rows }: { rows: { aspect?: string | null }[] }) {
  const groups = new Map<string, number>();
  for (const r of rows) {
    const k = r.aspect ?? "unknown";
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  if (rows.length === 0 || groups.size <= 1) return null;
  const summary = Array.from(groups.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n}×${k}`)
    .join(" · ");
  return (
    <span
      className="text-[11px] font-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200"
      title="Mixed aspect ratios in one launch. Meta's Advantage+ placements may silently drop ads that don't fit a placement's required aspect. Consider splitting into separate launches by aspect."
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
      mixed aspects · {summary}
    </span>
  );
}

/**
 * Cycle 145 — sum locally-attached file sizes across all Step-5 rows so
 * the operator sees how big the upload payload is before they hit Save.
 * Frame.io rows (no local file) contribute zero — only dragged/dropped
 * or file-picker rows count. Hidden when total is zero (no local files).
 */
function TotalFileSizeChip({ rows }: { rows: { local_size?: number | null }[] }) {
  const total = rows.reduce((s, r) => s + (r.local_size ?? 0), 0);
  if (total === 0) return null;
  const mb = total / 1024 / 1024;
  const localCount = rows.filter((r) => (r.local_size ?? 0) > 0).length;
  const label = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  // Soft cap: 1 GB upload payload is the comfortable ceiling on a normal
  // office connection (~30s at 30 Mbps). Past that we surface amber so
  // the operator knows to expect a long save.
  const heavy = mb >= 1024;
  return (
    <span
      className={`text-[11px] font-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
        heavy ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-50 text-slate-700 border-slate-200"
      }`}
      title={`${localCount} local file${localCount === 1 ? "" : "s"} attached, totaling ${label}. Uploaded to Meta on Launch (Frame.io rows excluded).`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {label} local
    </span>
  );
}

/**
 * Cycle 138 — tally how many Step-5 rows have a filename that doesn't
 * start with the package's Ad ID. The per-row amber chip already exists,
 * but on a 20-row launch it's easy to miss one. The summary lives in the
 * Step 5 header so the operator sees a single "3 rows · filename mismatch"
 * count at a glance.
 *
 * Hidden when adId is empty (nothing to check against) or when all rows
 * pass.
 */
function AdIdMismatchSummary({
  rows,
  check,
  adId,
}: {
  rows: { file_name: string }[];
  check: (fileName: string) => boolean;
  adId: string;
}) {
  if (!adId.trim() || rows.length === 0) return null;
  const mismatched = rows.filter((r) => check(r.file_name));
  if (mismatched.length === 0) return null;
  return (
    <span
      className="text-[11px] font-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200"
      title={`${mismatched.length} filename${mismatched.length === 1 ? "" : "s"} don't start with the Ad ID "${adId}". Performance reports may not match these ads back to the task.`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
      {mismatched.length} of {rows.length} · filename mismatch
    </span>
  );
}

/**
 * Cycle 132 — surface how many Step-5 rows already have a match in the
 * admanage_library. A match means the variation's filename links back to
 * a known asset → after launch the Log will show ad status + Ads Library
 * URL + AdManage link. A non-match isn't a hard error, but it tells the
 * operator "you won't see live status for these rows until the MCP
 * library refresh catches up."
 *
 * Debounced 400ms to avoid hammering the endpoint while operators rename
 * files or add/remove rows.
 */
function LibraryMatchChip({ rows }: { rows: { file_name: string }[] }) {
  const filenames = useMemo(
    () => rows.map((r) => r.file_name).filter((n) => n && n.trim().length > 0),
    [rows],
  );
  const [debounced, setDebounced] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filenames), 400);
    return () => clearTimeout(t);
  }, [filenames]);
  const key = debounced.join("|");
  const { data, isFetching } = useQuery({
    queryKey: ["library-match", key],
    queryFn: async () => {
      if (debounced.length === 0) return { ok: true, matches: [] as { filename: string; adm_id: number; status: string | null }[] };
      return api.post<{ ok: boolean; matches: { filename: string; adm_id: number; status: string | null }[] }>(
        "/api/launches/library-match",
        { filenames: debounced },
      );
    },
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });
  if (filenames.length === 0) return null;
  const matched = data?.matches?.length ?? 0;
  const total = filenames.length;
  const allMatched = matched === total;
  const noneMatched = matched === 0;
  return (
    <span
      className={`text-[11px] font-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
        isFetching && !data
          ? "bg-slate-50 text-slate-500 border-slate-200"
          : allMatched
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : noneMatched
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-sky-50 text-sky-800 border-sky-200"
      }`}
      title={
        noneMatched
          ? "No filenames found in the AdManage library yet. Live status + Ads Manager links won't appear in the Log until the library catches up."
          : allMatched
            ? "Every filename matches a row in the AdManage library. The Log will surface live status + direct links after launch."
            : `${matched} of ${total} filenames match a row in the AdManage library. Unmatched rows won't show live status until the library catches up.`
      }
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {matched}/{total} matched to library
    </span>
  );
}
