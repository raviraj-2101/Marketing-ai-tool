export type ApiError = { error: string };

const BASE_URL = (import.meta.env.VITE_PIPELINE_API_BASE_URL ?? '').replace(/\/$/, '');

function getToken(): string | null {
  return localStorage.getItem('auth_jwt_token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // Guard the parse: a gateway/proxy timeout returns an HTML (or empty) body, and a raw
  // JSON.parse on that throws a SyntaxError that masks the real HTTP error. Keep the raw text
  // so a meaningful message can still be surfaced instead of a bare "502 Bad Gateway".
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/auth';
    }
    // Prefer the server's real error message; else a short non-JSON body; else the status line.
    const serverMsg = data && (data.error || data.message);
    const bodyMsg = !data && text && text.trim().length > 0 && text.trim().length < 300 ? text.trim() : '';
    const msg = serverMsg || bodyMsg || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, body?: unknown) => request<T>("POST", p, body),
  put: <T>(p: string, body?: unknown) => request<T>("PUT", p, body),
  del: <T>(p: string) => request<T>("DELETE", p),
};

export type Brand = {
  id: string;
  name: string;
  notes: string | null;
  default_meta_account_id: string | null;
  default_audience_template: string | null;
  default_call_to_action: string | null;
  default_primary_text: string | null;
  created_at: string;
  account_count?: number;
  launch_count?: number;
  deleted_at?: string | null;
};

export type Product = {
  id: string;
  brand_id: string;
  brand_name?: string;
  name: string;
  default_headline: string | null;
  default_primary_text: string | null;
  default_description: string | null;
  default_call_to_action: string | null;
  default_destination_url: string | null;
  comparison_code: string | null;
  onbrand_code: string | null;
  top_5_comparison_image: string | null;
  meta_destination_onbrand: string | null;
  meta_destination_comparison: string | null;
  applovin_destination_onbrand: string | null;
  applovin_destination_comparison: string | null;
  created_at: string;
};

export type MetaAccount = {
  id: string;
  name: string;
  meta_account_id: string;
  timezone_name?: string | null;
  admanage_last_synced?: string | null;
  last_launched_at?: string | null;
  launches_last_7d?: number;
  launches_total?: number;
  page_id: string | null;
  instagram_id: string | null;
  pixel_id: string | null;
  notes: string | null;
  allowed_product_ids?: string[];
  allowed_brand_ids?: string[];
  pixel_count?: number;
  fb_page_count?: number;
  ig_count?: number;
  audience_count?: number;
};

export type Pixel = {
  id: string;
  meta_account_id: string;
  name: string;
  pixel_id: string;
  notes: string | null;
  admanage_is_active?: boolean | null;
};

export type FbPage = {
  id: string;
  meta_account_id: string;
  name: string;
  page_id: string;
  helper_copy: string | null;
  live_ads_count?: number | null;
  ads_limit?: number | null;
  ad_account_count?: number | null;
};

export type IgAccount = {
  id: string;
  meta_account_id: string;
  handle: string;
  instagram_id: string;
  helper_copy: string | null;
};

export type AudienceTemplate = {
  id: string;
  meta_account_id: string;
  pixel_id: string | null;
  name: string;
  include_audiences: string[];
  exclude_audiences: string[];
  pixel_name?: string;
  account_name?: string;
};

export type CreativeTemplate = {
  id: string;
  product_id: string;
  product_name?: string;
  name: string;
  asset_type: "Video" | "Image" | "TSL";
  funnel: "Comparison" | "Onbrand";
  call_to_action: string | null;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  is_default: boolean;
};

export type FrameioFile = {
  id: string;
  name: string;
  filetype: string | null;
  size: number | null;
  thumb: string | null;
  source: "api" | "manual";
  download_url?: string | null;
  inline_url?: string | null;
};

export type LaunchVariation = {
  id?: string;
  file_id: string | null;
  file_name: string;
  ad_name: string;
  call_to_action: string;
  primary_text: string;
  headline: string;
  description: string;
  destination_url: string;
  preview_url?: string | null;
  thumb: string | null;
  meta_ad_id?: string | null;
  meta_launch_error?: string | null;
  meta_ad_effective_status?: string | null;
  // AppLovin (Axon) launch lifecycle — mirrors the meta_* fields above.
  // Populated by the AppLovin launch flow (POST /api/launches/:id/launch-applovin).
  applovin_asset_id?: string | null;
  applovin_campaign_id?: string | null;
  applovin_creative_set_id?: string | null;
  applovin_launch_error?: string | null;
  applovin_launched_at?: string | null;
  // Set(s) launch PAUSED; a separate Enable action flips them to LIVE.
  applovin_status?: "PAUSED" | "LIVE" | null;
  // Per-variation END-CARD image (Axon IMG_INTER_P). Operator-uploaded (or sourced from
  // Frame.io / Google Drive). Exactly one of file_id / upload_url is set once resolved.
  applovin_end_card_source?: "frameio" | "gdrive" | "upload" | null;
  applovin_end_card_file_id?: string | null;
  applovin_end_card_upload_url?: string | null;
  // Clone mode: the source-set end-card asset id to REUSE for this row (picked per row from the
  // source set's HOSTED_HTML / image assets). Reused by id on the backend — swaps only the video.
  applovin_end_card_asset_id?: string | null;
};

export type LaunchPackage = {
  id: string;
  ad_id: string | null;
  clickup_task_url?: string | null;
  name: string;
  brand_id: string | null;
  brand_name: string | null;
  product_id: string | null;
  product_name: string | null;
  meta_account_id: string | null;
  audience_template: string | null;
  funnel: "Comparison" | "Onbrand" | null;
  asset_type: string;
  frameio_folder_url: string | null;
  status: string;
  // Meta campaign-level effective status (ACTIVE/PAUSED/WITH_ISSUES/…).
  // Nullable — the API may omit it (e.g. not-yet-launched packages), so
  // every consumer must handle null.
  meta_campaign_effective_status?: string | null;
  meta_upload_status: "Pending" | "Live" | "Rejected" | null;
  applovin_upload_status: "Pending" | "Live" | "Rejected" | null;
  meta_launched_at: string | null;
  applovin_launched_at: string | null;
  // AppLovin (Axon) campaign id — the EXISTING campaign the operator picks from the live
  // Axon list. The tool reuses this campaign; it never creates one.
  applovin_campaign_id?: string | null;
  // AppLovin build mode: "create" (new creative set from video + end-card) or "clone"
  // (clone a proven source set, then swap in the new video + end-card).
  applovin_build_mode?: "create" | "clone" | null;
  // Source creative set to clone when applovin_build_mode === "clone".
  applovin_source_creative_set_id?: string | null;
  // AppLovin (Axon) campaign-form fields (operator-entered on the launch form).
  // DEPRECATED / out-of-spec — the AppLovin path no longer collects targeting, budget,
  // goal or bidding (those live on the reused campaign). Kept for back-compat only.
  applovin_targeting_countries?: string[] | null;
  applovin_bidding_strategy?: string | null;
  applovin_creative_set_name?: string | null;
  rejected_count: number | null;
  launched_count: number | null;
  variation_count: number;
  lib_rejected_count?: number;
  meta_external_account_id?: string | null;
  scheduled_for?: string | null;
  scheduled_fired_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  operator_notes?: string | null;
  tags?: string[] | null;
  created_at: string;
  created_by: string | null;
};

export type PriorLaunch = {
  id: string;
  name: string;
  created_at: string;
  variation_count: number;
  meta_upload_status: string | null;
  applovin_upload_status: string | null;
};

export type AdLookupResult = {
  ad_id: string;
  brand_id: string | null;
  brand_name: string | null;
  product_id: string | null;
  product_name: string | null;
  funnel: "Onbrand" | "Comparison" | null;
  platform: "Meta" | "Applovin";
  suggested_frameio_folder_url: string | null;
  suggested_clickup_task_url: string | null;
  clickup_task_url: string | null;
  resolved_destination_url: { id: string; name: string; url: string; is_default: boolean } | null;
  resolved_creative_template: { id: string; name: string } | null;
  library_ref: {
    adm_id: number;
    filename: string;
    meta_ad_ids: string[] | null;
    meta_ad_library_urls: string[] | null;
    admanage_manage_url: string | null;
    adm_account_id: string | null;
  } | null;
  prior_launches: PriorLaunch[];
  notes: string | null;
  is_mock: boolean;
  source: "admanage_library" | "prefix" | "ads" | "statics_logs" | "unknown";
  ad_type: "VID" | "TSL" | "IMG" | null;
  frameio_url: string | null;
  gdrive_url: string | null;
  ad_set_name: string | null;
};

export type LaunchPackageDetail = LaunchPackage & {
  variations: LaunchVariation[];
  brand_name?: string | null;
  product_name?: string | null;
  account_name?: string | null;
  audience_template_name?: string | null;
  pixel_name?: string | null;
  fb_page_name?: string | null;
  ig_handle?: string | null;
  creative_template_name?: string | null;
  audience_template_id?: string | null;
  pixel_id?: string | null;
  fb_page_id?: string | null;
  ig_account_id?: string | null;
  creative_template_id?: string | null;
  ad_set_name_override?: string | null;
  apply_to_all_ad_copy?: boolean;
  campaign_mode?: string | null;
  campaign_name?: string | null;
  existing_campaign_name?: string | null;
  campaign_objective?: string | null;
  buying_type?: string | null;
  budget_type?: string | null;
  budget_amount?: string | null;
  optimization_goal?: string | null;
  attribution_setting?: string | null;
  placement_mode?: string | null;
  manual_placements?: string[] | null;
  // AppLovin (Axon) launch goal fields. Present only on AppLovin packages.
  platform?: "Meta" | "Applovin" | null;
  goal_type?: ApplovinGoalType | null;
  roas_day_target?: RoasDayTarget | null;
  event_target?: string | null;
  applovin_campaign_id?: string | null;
  // AppLovin build mode + clone source (spec: reuse existing campaign; Create vs Clone).
  applovin_build_mode?: "create" | "clone" | null;
  applovin_source_creative_set_id?: string | null;
  // AppLovin (Axon) campaign-form fields (operator-entered). Additive; present only on
  // AppLovin packages. Inherited from LaunchPackage above; restated here for locality.
  // DEPRECATED / out-of-spec (see LaunchPackage) — no longer collected by the UI.
  applovin_targeting_countries?: string[] | null;
  applovin_bidding_strategy?: string | null;
  applovin_creative_set_name?: string | null;
};

export const CTA_OPTIONS = ["Learn more", "Shop now", "Get offer", "Order now", "Sign up"] as const;
export const ASSET_TYPES = ["Video", "Image", "TSL"] as const;
export const FUNNELS = ["Onbrand", "Comparison", "TSL", "Adv"] as const;
export const PLATFORMS = ["Meta", "Applovin"] as const;

export type DestinationUrl = {
  id: string;
  product_id: string;
  product_name: string | null;
  brand_name: string | null;
  funnel: "Onbrand" | "Comparison";
  platform: "Meta" | "Applovin";
  name: string;
  url: string;
  preview_url: string | null;
  is_default: boolean;
  created_at: string;
};

export const CHAR_LIMITS = { primary_text: 30000, headline: 255, description: 200, ad_name: 512 };
export const SOFT_LIMITS = { primary_text: 125, headline: 40, description: 30 };
export const CAMPAIGN_MODES = [
  { value: "new_per_adset", label: "New campaign per ad set" },
  { value: "existing_abo", label: "Existing ABO campaign" },
  { value: "existing_cbo", label: "Existing CBO campaign" },
] as const;
export const OBJECTIVES = ["OUTCOME_LEADS", "OUTCOME_SALES","OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
  "OUTCOME_APP_PROMOTION", "OUTCOME_AWARENESS"] as const;
export const BUYING_TYPES = ["AUCTION", "RESERVED"] as const;
export const BUDGET_TYPES = ["daily", "lifetime"] as const;
export const OPTIMIZATIONS = [
  "Maximize number of leads",
  "Maximize number of conversions",
  "Maximize value of conversions",
  "Maximize landing page views",
] as const;
export const ATTRIBUTIONS = ["7-day click or 1-day view", "1-day click", "7-day click"] as const;
export const PLACEMENT_MODES = ["Advantage+ placements", "manual placements"] as const;
export const PLACEMENT_OPTIONS = [
  "Facebook Feed",
  "Instagram Feed",
  "Instagram Stories",
  "Facebook Reels",
  "Instagram Reels",
] as const;

// --- AppLovin (Axon) launch goal enums ---
// goal_type drives which sub-field is shown:
//   CPP / CHK_ROAS -> roas_day_target (DAY0 | DAY7)
//   CPE            -> event_target (free-text event name)
export const APPLOVIN_GOAL_TYPES = [
  { value: "CPP", label: "CPP (cost per purchase)" },
  { value: "CHK_ROAS", label: "CHK_ROAS (checkout ROAS)" },
  { value: "CPE", label: "CPE (cost per event)" },
] as const;
export type ApplovinGoalType = (typeof APPLOVIN_GOAL_TYPES)[number]["value"];

export const ROAS_DAY_TARGETS = [
  { value: "DAY0", label: "DAY0 (same-day ROAS)" },
  { value: "DAY7", label: "DAY7 (7-day ROAS)" },
] as const;
export type RoasDayTarget = (typeof ROAS_DAY_TARGETS)[number]["value"];

// goal_type values that use the roas_day_target sub-field.
export const APPLOVIN_GOAL_TYPES_WITH_ROAS = ["CPP", "CHK_ROAS"] as const;

// Axon bidding strategies. The backend default is AUTO_BIDDING_WITH_CPM_BILLING.
// TODO: expand this enum once the full valid set is confirmed against the live Axon account
// (Campaign Mgmt API is whitelist-only beta — only the auto-bidding option is confirmed for now).
export const APPLOVIN_BIDDING_STRATEGIES = [
  { value: "AUTO_BIDDING_WITH_CPM_BILLING", label: "Auto bidding (CPM billing)" },
] as const;
export type ApplovinBiddingStrategy = (typeof APPLOVIN_BIDDING_STRATEGIES)[number]["value"];
export const APPLOVIN_DEFAULT_BIDDING_STRATEGY: ApplovinBiddingStrategy = "AUTO_BIDDING_WITH_CPM_BILLING";

// Shape of a single result item returned by POST /api/launches/:id/launch-applovin.
// Mirrors the Meta launch result item (see MetaLaunchCard) so the results[] strip
// renders identically.
export type ApplovinLaunchResultItem = {
  variation_id: string;
  position: number;
  ad_name: string;
  status: "launched" | "skipped" | "error";
  applovin_asset_id?: string | null;
  applovin_creative_set_id?: string | null;
  error?: string | null;
  elapsed_ms?: number | null;
};

// Full response of the AppLovin launch endpoint (mirrors the Meta launch response).
export type ApplovinLaunchResult = {
  ok: boolean;
  package_id: string;
  account_id?: string | null;
  launched: number;
  errors: number;
  total_ms?: number | null;
  results: ApplovinLaunchResultItem[];
};

// AppLovin real-launch client — POSTs to pipeline-node (PIPELINE_API_BASE via api client).
// Mirrors the Meta launch call used in MetaLaunchCard (api.post("/api/launches/:id/launch-meta")).
export function launchApplovin(id: string) {
  return api.post<ApplovinLaunchResult>(`/api/launches/${id}/launch-applovin`);
}

// --- AppLovin (Axon) campaign + creative-set pickers ---
// The tool REUSES an existing Axon campaign (operator picks from a LIVE list) and, in Clone
// mode, an existing source creative set. These fetch the live lists from pipeline-node.
export type ApplovinCampaign = {
  id: string;
  name: string;
  status: string;
  type?: string | null;
};

export type ApplovinCreativeSet = {
  id: string;
  name: string;
  status: string;
};

// GET /api/launches/applovin/campaigns?brand_id=<id> -> { campaigns: [...] }
export function getApplovinCampaigns(brandId: string) {
  return api.get<{ campaigns: ApplovinCampaign[] }>(
    `/api/launches/applovin/campaigns?brand_id=${encodeURIComponent(brandId)}`,
  );
}

// GET /api/launches/applovin/creative-sets?brand_id=<id>&campaign_id=<id> -> { creative_sets: [...] }
export function getApplovinCreativeSets(brandId: string, campaignId: string) {
  return api.get<{ creative_sets: ApplovinCreativeSet[] }>(
    `/api/launches/applovin/creative-sets?brand_id=${encodeURIComponent(brandId)}&campaign_id=${encodeURIComponent(campaignId)}`,
  );
}

// GET /api/launches/applovin/creative-set-endcard?brand_id=<id>&creative_set_id=<id>
//   -> { end_card: { asset_id, type, url } | null }
// Clone mode uses this to PREVIEW the winning source set's end-card (HOSTED_HTML playable or image)
// that will be reused by id at launch. `type` is the Axon asset type (e.g. HOSTED_HTML, IMG_INTER_P).
export function getApplovinSourceEndCard(brandId: string, creativeSetId: string) {
  return api.get<{ end_card: { asset_id: string | null; type: string | null; url: string | null } | null }>(
    `/api/launches/applovin/creative-set-endcard?brand_id=${encodeURIComponent(brandId)}&creative_set_id=${encodeURIComponent(creativeSetId)}`,
  );
}

export type ApplovinEndCardAsset = { asset_id: string; type: string | null; url: string | null; status: string | null };

// GET /api/launches/applovin/creative-set-endcards?brand_id=<id>&creative_set_id=<id>
//   -> { end_cards: [{ asset_id, type, url, status }] }
// Clone mode lists the source set's end-card assets so the operator can PICK which one to reuse
// (a set may have several HOSTED_HTML playables).
export function getApplovinSourceEndCards(brandId: string, creativeSetId: string) {
  return api.get<{ end_cards: ApplovinEndCardAsset[] }>(
    `/api/launches/applovin/creative-set-endcards?brand_id=${encodeURIComponent(brandId)}&creative_set_id=${encodeURIComponent(creativeSetId)}`,
  );
}

// --- AppLovin Enable (PAUSED -> LIVE) ---
// A single created creative set's enable result.
export type ApplovinEnableResultItem = {
  variation_id?: string | null;
  creative_set_id?: string | null;
  ad_name?: string | null;
  ok: boolean;
  status?: "LIVE" | "PAUSED" | null;
  error?: string | null;
};

// POST /api/launches/:id/enable-applovin -> { ok, enabled, errors, results:[...] }
export type ApplovinEnableResult = {
  ok: boolean;
  enabled: number;
  errors: number;
  results: ApplovinEnableResultItem[];
};

// Flips this package's created (PAUSED) Axon creative set(s) to LIVE.
export function enableApplovin(packageId: string) {
  return api.post<ApplovinEnableResult>(`/api/launches/${packageId}/enable-applovin`);
}

// --- Background launch jobs (Meta + AppLovin) ---
// The launch endpoints now ENQUEUE a background job and return 202 immediately; the actual
// launch progress + final result are read from these poll endpoints instead of the POST body.
export type LaunchJobStatus = { job_id?: string; status: 'none'|'queued'|'running'|'succeeded'|'partial'|'failed'|'canceled'; total?: number|null; completed?: number; failed?: number; current_step?: string|null; result?: any; error?: string|null; updated_at?: string; };
export function getLaunchStatus(id: string, platform?: "meta" | "applovin") { const q = platform ? `?platform=${platform}` : ""; return api.get<LaunchJobStatus>(`/api/launches/${id}/launch-status${q}`); }
export function listActiveLaunchJobs() { return api.get<any[]>(`/api/launches/launch-jobs?active=1`); }

// Launch-queue panel feed: active (queued/running) + recently-finished jobs, enriched
// with who launched it + readable brand/product/ad labels.
export type LaunchQueueJob = {
  job_id: string;
  package_id: string;
  label: string;
  brand_name: string | null;
  product_name: string | null;
  platform: "meta" | "applovin";
  status: 'queued'|'running'|'succeeded'|'partial'|'failed'|'canceled';
  total?: number | null;
  completed?: number;
  failed?: number;
  current_step?: string | null;
  actor: string | null;
  source: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at?: string;
};
export function listQueueJobs() { return api.get<LaunchQueueJob[]>(`/api/launches/launch-jobs?scope=queue`); }
