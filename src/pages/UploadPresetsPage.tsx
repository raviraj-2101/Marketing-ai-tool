/**
 * Upload Presets — per-account / per-brand launch defaults that the
 * launcher inherits silently. The operator configures the "boring" stuff
 * here (FB page, IG account, Advantage+ flags, AppLovin API key) so the
 * launcher's Step 1-6 flow stays focused on the per-campaign decisions.
 *
 * Two tabs:
 *   - Meta — mirrored from marketing.acentecom.com via the MCP. Read-only
 *     in this v1; the source of truth lives upstream. We're displaying
 *     here so the operator can confirm what's wired up before saving.
 *   - AppLovin — direct AXON Campaign Management API setup, one key per
 *     brand. The operator drops in a key from ads.axon.ai → API keys; we
 *     ping AXON's /campaign/list to verify.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/features/ads-launcher/lib/api";
import { fmtDateTime } from "@/features/ads-launcher/lib/datetime";

type MetaPreset = {
  account_id: string;
  account_name: string | null;
  workspace_id: string | null;
  facebook_name: string | null;
  instagram_name: string | null;
  default_cta: string | null;
  default_link: string | null;
  url_tags: string | null;
  defaults: Record<string, any>;
  synced_at: string;
  wired_local_id: string | null;
  wired_local_name: string | null;
};
type OrphanAcct = { id: string; name: string; meta_account_id: string };
type MetaPresetsResp = {
  presets: MetaPreset[];
  orphan_local_accounts: OrphanAcct[];
  connection: {
    source: string;
    status: "connected" | "uninitialized";
    account_count: number;
    last_synced_at: string | null;
  };
};

type ApplovinBrand = {
  brand_id: string;
  brand_name: string;
  applovin_account_id: string | null;
  notes: string | null;
  last_tested_at: string | null;
  last_tested_ok: boolean | null;
  last_tested_error: string | null;
  campaign_configured: boolean;
  reporting_configured: boolean;
  event_configured: boolean;
  campaign_key_masked: string | null;
  reporting_key_masked: string | null;
  event_key_masked: string | null;
};
type ApplovinResp = {
  brands: ApplovinBrand[];
  docs: {
    where_to_get_campaign_key: string;
    campaign_api_base: string;
    reporting_api_base: string;
    auth_header: string;
    docs_url?: string;
  };
};

export default function UploadPresetsPage() {
  const [tab, setTab] = useState<"meta" | "applovin">("meta");
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Upload Presets <span className="text-sm font-normal text-slate-500 align-middle">· Admin default</span></h1>
        <p className="text-sm text-slate-500 mt-1">
          Defaults that get copied into every new ad account synced from Meta. Per-account overrides live on each ad account's page under <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Meta Accounts → &lt;account&gt; → Account Preset</span>.
        </p>
        {/* Cycle 352 — admin-only banner. Eventually media buyers won't
            see this page at all; for now it's visually flagged so the
            operator knows what they're editing applies to NEW accounts
            (existing accounts already have their own per-account copy
            seeded via C351). */}
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>Admin-only.</strong> Edits here apply to ad accounts synced from Meta <em>after</em> the change. Existing accounts already have their own copy of this preset — edit those on each account's page.
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabBtn active={tab === "meta"} onClick={() => setTab("meta")}>
          Meta
        </TabBtn>
        <TabBtn active={tab === "applovin"} onClick={() => setTab("applovin")}>
          AppLovin
        </TabBtn>
      </div>

      {tab === "meta" ? <MetaPanel /> : <ApplovinPanel />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
        active ? "bg-white border-x border-t border-slate-200 text-slate-900 -mb-px" : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── META ─────────────────────────── */

export type UniversalPreset = {
  // identity + attribution
  url_tags_template: string | null;
  naming_pattern: string | null;
  naming_separator: string | null;
  // campaign / ad-set spec
  default_campaign_objective: string | null;
  default_buying_type: string | null;
  default_budget_type: string | null;
  default_optimization_goal: string | null;
  default_attribution_setting: string | null;
  default_billing_event: string | null;
  default_bid_strategy: string | null;
  default_bid_amount: number | null;
  default_placement_mode: string | null;
  default_age_min: number | null;
  default_age_max: number | null;
  default_countries: string[];
  special_ad_categories: string[];
  // creative / Advantage+
  launch_paused: boolean | null;
  // Cycle 449 / 450 — per-account default targeting + auto-exclude
  // past purchasers. Audience pickers themselves are deferred to the
  // next cycle; this flag flips the launch-time behavior on/off.
  auto_exclude_past_purchasers?: boolean | null;
  default_genders?: string[] | null;
  default_include_audience_ids?: string[] | null;
  default_exclude_audience_ids?: string[] | null;
  enhanced_creative: boolean | null;
  multi_advertiser: boolean | null;
  instagram_only: boolean | null;
  scale_post_id: boolean | null;
  ad_creation_cutoff: number | null;
  cta_favorites: string[];
  // Cycle 346 — Launch Settings toggles (per operator screenshot).
  website_destination_optimization: boolean | null;
  sitelinks_enabled: boolean | null;
  browser_ad_ons: boolean | null;
  tag_based_localization: boolean | null;
  hide_promo_code_email_signup: boolean | null;
  auto_upload_captions: boolean | null;
  fast_upload: boolean | null;
  launch_one_ad_per_adset: boolean | null;
  launch_ads_as_post_id: boolean | null;
  tracking_specs: boolean | null;
  // Cycle 347 — Creative Enhancements (nested record).
  creative_enhancements: Record<string, boolean | null>;
  updated_at: string;
};

// Meta enum options — kept aligned with Meta's Marketing API v24 docs.
const CAMPAIGN_OBJECTIVES = [
  "OUTCOME_SALES", "OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
  "OUTCOME_APP_PROMOTION", "OUTCOME_AWARENESS",
];
const BUYING_TYPE_OPTS = ["AUCTION", "RESERVED"];
const BUDGET_TYPE_OPTS = ["daily", "lifetime"];
const OPTIMIZATION_GOALS = [
  "OFFSITE_CONVERSIONS", "VALUE", "LANDING_PAGE_VIEWS", "LINK_CLICKS",
  "REACH", "IMPRESSIONS", "POST_ENGAGEMENT", "LEAD_GENERATION",
  "APP_INSTALLS", "THRUPLAY",
];
const ATTRIBUTION_SETTINGS = ["7d_click_or_1d_view", "1d_click", "7d_click"];
const BILLING_EVENTS = ["IMPRESSIONS", "LINK_CLICKS", "VIDEO_VIEWS", "THRUPLAY"];
const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS",
];
const PLACEMENT_MODE_OPTS = ["advantage_plus", "manual"];
const SPECIAL_AD_CATEGORIES = [
  "HOUSING", "EMPLOYMENT", "CREDIT",
  "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING",
];

type CampaignSummary = {
  ad_account_id: string;
  total: number;
  active: number;
  paused: number;
  local_name: string | null;
  adset_count_sum: number;
  error: string | null;
  cached_at: number | null;
};
type LiveCampaign = {
  campaign_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  buying_type: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  spend: number | null;
  ad_set_count: number | null;
  updated_time: string | null;
};

function MetaPanel() {
  const qc = useQueryClient();
  // Universal singleton — what the operator actually edits here.
  const { data: universalData, isLoading: uLoading } = useQuery({
    queryKey: ["launch-presets-meta-universal"],
    queryFn: () => api.get<{ preset: UniversalPreset | null }>("/api/launch-presets/meta/universal"),
  });
  // Per-account upstream mirror — kept available as collapsed reference.
  const { data: presetsRespData } = useQuery({
    queryKey: ["launch-presets-meta"],
    queryFn: () => api.get<{ ok: boolean; data: MetaPresetsResp }>("/api/launch-presets/meta"),
  });
  const presetsData = presetsRespData?.data;
  if (uLoading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (!universalData?.preset) return null;
  return (
    <div>
      <UniversalMetaEditor preset={universalData.preset} onSaved={() => qc.invalidateQueries({ queryKey: ["launch-presets-meta-universal"] })} />
      <CampaignsOverview />
      {presetsData ? (
        <UpstreamMirrorDetails data={presetsData} onSync={() => qc.invalidateQueries({ queryKey: ["launch-presets-meta"] })} />
      ) : null}
    </div>
  );
}

/* ─────────────────── Campaigns overview ─────────────────── */

function CampaignsOverview() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["launch-presets-meta-campaigns-summary"],
    queryFn: () => api.get<{ summary: CampaignSummary[]; source: string; fetched_at: string }>("/api/launch-presets/meta/campaigns-summary"),
    staleTime: 30_000,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading) return <div className="al-card mt-4 text-xs text-slate-500">Loading campaigns from Meta…</div>;
  if (!data || data.summary.length === 0) return null;
  const totalCampaigns = data.summary.reduce((acc, s) => acc + Number(s.total), 0);
  const totalActive = data.summary.reduce((acc, s) => acc + Number(s.active), 0);
  const ageSec = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : 0;
  return (
    <div className="al-card mt-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            All Meta campaigns
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pulled directly from <span className="font-mono">graph.facebook.com</span> — what the launcher's "existing campaign" picker sees in real time. <span className="font-semibold text-emerald-700">{totalActive} active</span> · {totalCampaigns} total across {data.summary.length} accounts.
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            synced {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`} · {data.source}
          </p>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["launch-presets-meta-campaigns-summary"] })}
          disabled={isFetching}
          className="text-[11px] px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 shrink-0"
        >
          {isFetching ? "Syncing…" : "↻ Refresh all"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.summary.map((s) => (
          <div key={s.ad_account_id} className="rounded-md border border-slate-200 bg-slate-50/40">
            <button
              type="button"
              onClick={() => setExpanded(expanded === s.ad_account_id ? null : s.ad_account_id)}
              className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-100/60"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{s.local_name ?? "(unmapped)"}</div>
                <div className="text-[10px] font-mono text-slate-400">{s.ad_account_id}</div>
              </div>
              <div className="text-[11px] flex items-center gap-2 shrink-0">
                {s.error ? (
                  <span className="text-rose-700 font-mono text-[10px]">{s.error.slice(0, 32)}</span>
                ) : (
                  <>
                    <span className="text-emerald-700 font-semibold">{s.active} active</span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-600">{s.total} total</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{s.adset_count_sum} adsets</span>
                  </>
                )}
              </div>
            </button>
            {expanded === s.ad_account_id && <CampaignDrilldown accountId={s.ad_account_id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignDrilldown({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["launch-presets-meta-campaigns", accountId],
    queryFn: () => api.get<{ campaigns: LiveCampaign[]; error: string | null; cached_at: number | null }>(`/api/launch-presets/meta/campaigns?account_id=${encodeURIComponent(accountId)}`),
    staleTime: 30_000,
  });
  const force = useMutation({
    mutationFn: () => api.get<any>(`/api/launch-presets/meta/campaigns?account_id=${encodeURIComponent(accountId)}&force=1`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["launch-presets-meta-campaigns", accountId] }),
  });
  if (isLoading) return <div className="px-3 py-2 text-[11px] text-slate-400">Loading from Meta…</div>;
  if (!data) return null;
  if (data.error) {
    return (
      <div className="px-3 pb-3 pt-2 border-t border-slate-200">
        <div className="text-[11px] text-rose-700">Meta error: {data.error}</div>
      </div>
    );
  }
  return (
    <div className="px-3 pb-3 pt-1 border-t border-slate-200">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-slate-400">
          {data.cached_at ? `synced ${Math.max(0, Math.floor((Date.now() - data.cached_at) / 1000))}s ago` : "fresh"}
        </span>
        <button
          type="button"
          onClick={() => force.mutate()}
          disabled={force.isPending || isFetching}
          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50"
        >
          {force.isPending ? "Refreshing…" : "↻"}
        </button>
      </div>
      <ul className="space-y-0.5 max-h-72 overflow-auto">
        {data.campaigns.map((c) => {
          const tone =
            c.status === "ACTIVE" ? "text-emerald-700"
            : c.status === "PAUSED" ? "text-slate-500"
            : "text-amber-700";
          return (
            <li key={c.campaign_id} className="text-[11px] flex items-baseline gap-2 px-1.5 py-0.5 rounded hover:bg-white">
              <span className={`font-mono text-[9px] uppercase tracking-wider w-14 shrink-0 ${tone}`}>{c.status?.toLowerCase() ?? "?"}</span>
              <span className="font-medium text-slate-800 min-w-0 truncate flex-1">{c.name}</span>
              {c.objective && <span className="font-mono text-[10px] text-slate-500 shrink-0">{c.objective}</span>}
              {c.ad_set_count != null && c.ad_set_count > 0 && (
                <span className="font-mono text-[10px] text-slate-400 shrink-0">{c.ad_set_count} adsets</span>
              )}
              {c.spend != null && c.spend > 0 && (
                <span className="font-mono text-[10px] text-slate-500 shrink-0">${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              )}
            </li>
          );
        })}
        {data.campaigns.length === 0 && <li className="text-[11px] text-slate-400 px-1.5 py-0.5">No campaigns on this account.</li>}
      </ul>
    </div>
  );
}

/* ───────────── Universal editor — the only thing operators usually touch ───────────── */

/**
 * Cycle 356 — `target` prop added so the same editor binds to either
 * the admin singleton (default) OR a per-account preset row. Same
 * shape, different PUT URL. AccountsPage uses target="account" to
 * give media buyers a full editor scoped to their ad account.
 */
type EditorTarget =
  | { kind: "admin" }
  | { kind: "account"; accountId: string };

export function UniversalMetaEditor({
  preset,
  onSaved,
  target = { kind: "admin" },
}: {
  preset: UniversalPreset;
  onSaved: () => void;
  target?: EditorTarget;
}) {
  // Defensive: server should always return [] for these but a stale row
  // from before the column existed could return null/undefined and crash
  // the page on first render.
  const safe: UniversalPreset = {
    ...preset,
    default_countries: Array.isArray(preset.default_countries) ? preset.default_countries : [],
    special_ad_categories: Array.isArray(preset.special_ad_categories) ? preset.special_ad_categories : [],
    cta_favorites: Array.isArray(preset.cta_favorites) ? preset.cta_favorites : [],
    creative_enhancements: typeof preset.creative_enhancements === "object" && preset.creative_enhancements !== null ? preset.creative_enhancements : {},
  };
  const [form, setForm] = useState<UniversalPreset>(safe);
  const [ctaInput, setCtaInput] = useState("");
  // Reset local form whenever the server-returned preset changes (after save).
  useEffect(() => { setForm(safe); }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const putUrl = target.kind === "admin"
    ? "/api/launch-presets/meta/universal"
    : `/api/launch-presets/meta/by-account?meta_account_id=${target.accountId}`;
  const save = useMutation({
    mutationFn: () => api.put<{ ok: boolean }>(putUrl, form),
    onSuccess: onSaved,
  });

  // Dirty = any field changed. Deep-equal via JSON on the array fields.
  const dirty = JSON.stringify(form) !== JSON.stringify(preset);

  const flag = (
    label: string,
    key: keyof UniversalPreset,
    description: string,
  ) => (
    <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-slate-50">
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300"
        checked={Boolean(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked } as UniversalPreset)}
      />
      <span className="text-xs min-w-0">
        <span className="font-semibold text-slate-900 block">{label}</span>
        <span className="text-[10px] text-slate-500">{description}</span>
      </span>
    </label>
  );

  return (
    <div className="al-card">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Universal Meta defaults</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Settings that apply to every Meta launch. FB Page, IG account, default CTA, and destination URLs are configured per-account / per-product elsewhere — this page is for the cross-account plumbing only.
          </p>
        </div>
        <div className="text-[10px] text-slate-400 shrink-0">last edit {fmtDateTime(preset.updated_at)}</div>
      </div>

      {/* SECTION 1 — Identity & attribution. URL tags + naming pattern. */}
      <Section title="Identity & attribution">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldLabel className="md:col-span-2" label="URL tags template (UTM)" hint={`Appended to every destination URL. Meta substitutes {{ad.id}}, {{adset.id}}, etc. server-side.`}>
            <input
              className="al-input font-mono text-xs"
              value={form.url_tags_template ?? ""}
              onChange={(e) => setForm({ ...form, url_tags_template: e.target.value || null })}
              placeholder="tw_source={{site_source_name}}&tw_adid={{ad.id}}"
            />
          </FieldLabel>
          {/* Cycle 337 — naming_pattern + naming_separator removed; the
              ad set name comes from the operator-typed Step 4 input
              and ad names come from filenames (C322/C327). */}
        </div>
      </Section>

      {/* SECTION 2 — Campaign + ad-set spec. The fields Meta's API requires
          on every campaign/adset create call. */}
      <Section title="Campaign defaults">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldLabel label="Campaign objective">
            <Select value={form.default_campaign_objective ?? ""} options={CAMPAIGN_OBJECTIVES} onChange={(v) => setForm({ ...form, default_campaign_objective: v || null })} />
          </FieldLabel>
          <FieldLabel label="Buying type">
            <Select value={form.default_buying_type ?? ""} options={BUYING_TYPE_OPTS} onChange={(v) => setForm({ ...form, default_buying_type: v || null })} />
          </FieldLabel>
          <FieldLabel label="Budget type">
            <Select value={form.default_budget_type ?? ""} options={BUDGET_TYPE_OPTS} onChange={(v) => setForm({ ...form, default_budget_type: v || null })} />
          </FieldLabel>
          <div className="flex gap-3 contents">
            <FieldLabel label="Bid strategy">
              <Select value={form.default_bid_strategy ?? ""} options={BID_STRATEGIES} onChange={(v) => setForm({ ...form, default_bid_strategy: v?.trim() || null })} />
            </FieldLabel>
            {(form.default_bid_strategy?.trim() === "LOWEST_COST_WITH_BID_CAP" || form.default_bid_strategy?.trim() === "COST_CAP") && (
              <FieldLabel label="Bid amount" hint="Required for LOWEST_COST_WITH_BID_CAP and COST_CAP">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="al-input font-mono text-xs"
                  value={form.default_bid_amount ?? ""}
                  onChange={(e) => setForm({ ...form, default_bid_amount: e.target.value ? Number(e.target.value) : null })}
                  placeholder="0.00"
                  required={form.default_bid_strategy?.trim() === "LOWEST_COST_WITH_BID_CAP" || form.default_bid_strategy?.trim() === "COST_CAP"}
                />
              </FieldLabel>
            )}
          </div>
          <FieldLabel label="Optimization goal">
            <Select value={form.default_optimization_goal ?? ""} options={OPTIMIZATION_GOALS} onChange={(v) => setForm({ ...form, default_optimization_goal: v || null })} />
          </FieldLabel>
          <FieldLabel label="Billing event">
            <Select value={form.default_billing_event ?? ""} options={BILLING_EVENTS} onChange={(v) => setForm({ ...form, default_billing_event: v || null })} />
          </FieldLabel>
          {/* Cycle 337 — Attribution + Placement mode removed from upload
              presets. These are per-launch decisions on the launch page
              (Step 4). Operator rule: nothing in the preset that also
              appears as an editable field on the launch flow. */}
        </div>
      </Section>

      {/* SECTION 3 — Default targeting. Sane starting point Meta requires. */}
      <Section title="Default targeting">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FieldLabel label="Age min">
            <input type="number" min={13} max={65} className="al-input font-mono text-xs" value={form.default_age_min ?? ""} onChange={(e) => setForm({ ...form, default_age_min: e.target.value ? Number(e.target.value) : null })} />
          </FieldLabel>
          <FieldLabel label="Age max">
            <input type="number" min={13} max={65} className="al-input font-mono text-xs" value={form.default_age_max ?? ""} onChange={(e) => setForm({ ...form, default_age_max: e.target.value ? Number(e.target.value) : null })} />
          </FieldLabel>
          <FieldLabel label="Countries" hint="ISO 2-letter codes (US, GB, CA…). Press Enter to add.">
            <ChipListInput value={form.default_countries} onChange={(v) => setForm({ ...form, default_countries: v })} placeholder="US" upper minLen={2} maxLen={2} />
          </FieldLabel>
          <FieldLabel className="md:col-span-3" label="Special ad categories" hint="REQUIRED by Meta on every campaign. Leave empty for e-commerce. Check ONLY if your product/lead falls under a regulated category.">
            <div className="flex flex-wrap gap-2">
              {SPECIAL_AD_CATEGORIES.map((cat) => (
                <label key={cat} className="inline-flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded border bg-white hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={form.special_ad_categories.includes(cat)}
                    onChange={(e) => {
                      const set = new Set(form.special_ad_categories);
                      if (e.target.checked) set.add(cat); else set.delete(cat);
                      setForm({ ...form, special_ad_categories: Array.from(set) });
                    }}
                  />
                  <span className="font-mono text-[10px]">{cat}</span>
                </label>
              ))}
            </div>
          </FieldLabel>
        </div>
      </Section>

      {/* SECTION 4 — Advantage+ + launch behavior + CTA favorites. */}
      <Section title="Creative + launch behavior">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldLabel label="Ad creation cutoff" hint="Max ads per launch batch (Meta caps the request).">
            <input type="number" min={1} max={50} className="al-input font-mono text-xs" value={form.ad_creation_cutoff ?? ""} onChange={(e) => setForm({ ...form, ad_creation_cutoff: e.target.value ? Number(e.target.value) : null })} />
          </FieldLabel>
          <div className="md:col-span-2">
            <CtaFavoritesEditor value={form.cta_favorites} onChange={(v) => setForm({ ...form, cta_favorites: v })} input={ctaInput} setInput={setCtaInput} />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Advantage+ flags</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {flag("Enhanced Creative", "enhanced_creative", "Master toggle for Meta's Advantage+ creative enhancements.")}
            {flag("Multi-Advertiser ads", "multi_advertiser", "Opt into Meta's cross-advertiser placements.")}
            {flag("Instagram-only placement", "instagram_only", "Force placements to Instagram only.")}
            {flag("Launch paused", "launch_paused", "New ads launch in PAUSED status by default.")}
            {flag("Scale Post ID", "scale_post_id", "Reuse the same post ID across ad sets for engagement scaling.")}
          </div>
        </div>
      </Section>

      {/* Cycle 347 — Creative Enhancements (Images / Videos / Carousel
          per operator screenshot). Each section is a list of toggles.
          Master enable + "Optimise text per person" sits above. */}
      <Section title="Creative Enhancements">
        <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-1.5 border-b border-slate-100 pb-3">
          {ceFlag(form, setForm, "ce_master_enabled", "Meta Creative Enhancements", "Master on/off for every Creative Enhancement below.")}
          {ceFlag(form, setForm, "ce_master_optimise_text_per_person", "Optimise text per person", "Independent of individual creative-enhancement switches.")}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Images</div>
            <div className="space-y-1">
              {CE_IMG_FIELDS.map(([col, label, hint]) => ceFlag(form, setForm, col, label, hint))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Videos</div>
            <div className="space-y-1">
              {CE_VID_FIELDS.map(([col, label, hint]) => ceFlag(form, setForm, col, label, hint))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Carousel</div>
            <div className="space-y-1">
              {CE_CAR_FIELDS.map(([col, label, hint]) => ceFlag(form, setForm, col, label, hint))}
            </div>
          </div>
        </div>
      </Section>

      {/* Cycle 346 — Launch Settings panel (per operator screenshot).
          Each toggle maps to a Meta-launch-time flag. Mapping to the
          actual Graph API params is deferred — these are stored on the
          singleton today; a future cycle wires them into createAd / Ads
          Manager features per Meta's docs. */}
      <Section title="Launch Settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {flag("Website Destination Optimization", "website_destination_optimization", "Allow Meta to optimize landing page destinations.")}
          {flag("Sitelinks", "sitelinks_enabled", "Add sitelinks to your ads with custom URLs and display labels.")}
          {flag("Browser Ad Ons", "browser_ad_ons", "Add an additional contact method in the browser.")}
          {flag("Tag Based Localization", "tag_based_localization", "Show Tag-Based matcher in launch + save MultiLang.")}
          {flag("Hide Promo Code & Email Sign Up", "hide_promo_code_email_signup", "Prevent promo codes from being used.")}
          {flag("Auto Upload Captions (Meta)", "auto_upload_captions", "Auto-transcribe and upload captions to improve Meta performance for viewers who watch without sound.")}
          {flag("Fast Upload", "fast_upload", "Pre-queue videos to upload to ad account when media is loaded.")}
          {flag("Launch 1 ad per adset (Special Ad Testing)", "launch_one_ad_per_adset", "Enable special ad testing features. Will be visible as a toggle on the launch page after an ad set is selected.")}
          {flag("Launch ads as POST_ID when launched", "launch_ads_as_post_id", "Use POST_ID when recreating ads.")}
          {flag("Tracking Specs", "tracking_specs", "Enable tracking specs to monitor both website events and app installs.")}
          {/* Cycle 449 / 450 — operator-requested: auto-exclude past
              purchasers at launch (mirrors AdManage). When ON, the
              launcher adds the account's past-purchasers custom
              audience to the exclusion list. */}
          {flag("Auto-exclude past purchasers", "auto_exclude_past_purchasers" as any, "When on, the launcher auto-adds the account's 'past purchasers' custom audience to the exclusion list. Same behavior as AdManage.")}
        </div>
      </Section>

      <div className="mt-5 flex items-center justify-end gap-2">
        {save.isError && <span className="text-xs text-rose-700 mr-2">{(save.error as Error).message}</span>}
        {save.isSuccess && !dirty && <span className="text-xs text-emerald-700 mr-2">✓ Saved</span>}
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="btn-primary text-xs disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save defaults"}
        </button>
      </div>
    </div>
  );
}

/* ───── tiny form primitives so the editor stays readable above ───── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 pt-4 border-t border-slate-100 first:mt-0 first:pt-0 first:border-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

function FieldLabel({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`text-xs ${className ?? ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-400 mt-0.5 block">{hint}</span>}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select className="al-input font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function ChipListInput({ value, onChange, placeholder, upper, minLen, maxLen }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; upper?: boolean; minLen?: number; maxLen?: number }) {
  const [input, setInput] = useState("");
  const submit = () => {
    let s = input.trim();
    if (upper) s = s.toUpperCase();
    if (!s) return;
    if (minLen && s.length < minLen) return;
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    if (value.includes(s)) { setInput(""); return; }
    onChange([...value, s]);
    setInput("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200 text-brand-700">
            {c}
            <button type="button" className="opacity-60 hover:opacity-100" onClick={() => onChange(value.filter((x) => x !== c))} aria-label={`Remove ${c}`}>×</button>
          </span>
        ))}
      </div>
      <input
        className="al-input font-mono text-xs"
        value={input}
        onChange={(e) => setInput(upper ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        onBlur={submit}
      />
    </div>
  );
}

/* ─── Cycle 347 — Creative Enhancements helpers (manifests + renderer) ─── */

type CeField = readonly [col: string, label: string, hint: string];

const CE_IMG_FIELDS: CeField[] = [
  ["ce_img_text_translation", "Text translation", "Translate ad text for the viewer's locale."],
  ["ce_img_show_summary", "Show summary", "Display a Meta-generated text summary."],
  ["ce_img_reveal_details_over_time", "Reveal details over time", "Progressive reveal of ad copy."],
  ["ce_img_add_overlays", "Add overlays", "Image overlays (badges, CTAs)."],
  ["ce_img_adjust_brightness_contrast", "Adjust brightness and contrast", "Auto-tune image B/C for the placement."],
  ["ce_img_music", "Music", "Add music to image ads."],
  ["ce_img_image_animation", "Image animation", "Auto-animate static images."],
  ["ce_img_add_site_links", "Add site links", "Inline sitelinks under the ad."],
  ["ce_img_enhance_cta", "Enhance CTA", "Style and emphasize the CTA button."],
  ["ce_img_add_details_to_ad_layout", "Add details to ad layout", "Extra metadata in the ad chrome."],
  ["ce_img_flexible_media", "Flexible Media", "Allow Meta to swap media variants."],
  ["ce_img_advantage_creative", "Advantage+ Creative", "Master Advantage+ creative on."],
  ["ce_img_profile_extension", "Profile extension", "Show profile info under the ad."],
  ["ce_img_store_location", "Store location", "Surface store/location info."],
  ["ce_img_business_ai", "Business AI", "Meta's Business AI features."],
  ["ce_img_show_spotlights", "Show spotlights", "Highlighted product spotlights."],
  ["ce_img_create_sticker_cta", "Create sticker CTA", "Stickerized CTA variants."],
  ["ce_img_relevant_comments", "Relevant comments (deprecated)", "Legacy comments enhancement."],
  ["ce_img_visual_touchups", "Visual touch-ups (deprecated)", "Legacy auto-touchups."],
  ["ce_img_text_improvements", "Text improvements (deprecated)", "Legacy text-improvements enhancement."],
];

const CE_VID_FIELDS: CeField[] = [
  ["ce_vid_text_translation", "Text translation", "Translate ad text for viewer locale."],
  ["ce_vid_add_video_effects", "Add video effects", "Auto-applied video effects."],
  ["ce_vid_add_site_links", "Add site links", "Inline sitelinks under the video."],
  ["ce_vid_enhance_cta", "Enhance CTA", "Style and emphasize the CTA."],
  ["ce_vid_add_details_to_ad_layout", "Add details to ad layout", "Extra metadata in the ad chrome."],
  ["ce_vid_flexible_media", "Flexible Media", "Allow Meta to swap media variants."],
  ["ce_vid_advantage_creative", "Advantage+ Creative", "Master Advantage+ creative on."],
  ["ce_vid_video_to_image", "Video to image", "Auto-derive image variants from the video."],
  ["ce_vid_profile_extension", "Profile extension", "Show profile info under the ad."],
  ["ce_vid_store_location", "Store location", "Surface store/location info."],
  ["ce_vid_business_ai", "Business AI", "Meta's Business AI features."],
  ["ce_vid_show_spotlights", "Show spotlights", "Highlighted product spotlights."],
  ["ce_vid_create_sticker_cta", "Create sticker CTA", "Stickerized CTA variants."],
  ["ce_vid_relevant_comments", "Relevant comments (deprecated)", "Legacy comments enhancement."],
  ["ce_vid_visual_touchups", "Visual touch-ups (deprecated)", "Legacy auto-touchups."],
  ["ce_vid_text_improvements", "Text improvements (deprecated)", "Legacy text-improvements enhancement."],
];

const CE_CAR_FIELDS: CeField[] = [
  ["ce_car_relevant_comments", "Relevant comments", "Show relevant comments on carousel cards."],
  ["ce_car_profile_end_card", "Profile end card", "Add a profile card at the end of the carousel."],
  ["ce_car_highlight_carousel_card", "Highlight carousel card", "Auto-highlight a best-performing card."],
  ["ce_car_format_automation", "Format automation", "Auto-pick carousel format."],
  ["ce_car_dynamic_description", "Dynamic description", "Per-card dynamic descriptions."],
  ["ce_car_enhance_cta", "Enhance CTA", "Style and emphasize the CTA."],
  ["ce_car_adapt_multi_image_format", "Adapt multi-image format", "Auto-adapt multi-image."],
  ["ce_car_advantage_creative", "Advantage+ Creative", "Master Advantage+ creative on."],
  ["ce_car_photos_to_video", "Photos to video", "Auto-stitch photos into video."],
  ["ce_car_profile_extension", "Profile extension", "Show profile info under the carousel."],
  ["ce_car_store_location", "Store location", "Surface store/location info."],
  ["ce_car_business_ai", "Business AI", "Meta's Business AI features."],
  ["ce_car_text_improvements", "Text improvements (deprecated)", "Legacy text-improvements enhancement."],
];

function ceFlag(
  form: UniversalPreset,
  setForm: (next: UniversalPreset) => void,
  col: string,
  label: string,
  hint: string,
) {
  const ce = form.creative_enhancements ?? {};
  const value = !!ce[col];
  return (
    <label key={col} className="flex items-center justify-between gap-2 text-xs py-1 px-1.5 hover:bg-slate-50 rounded cursor-pointer" title={hint}>
      <span className="text-slate-700 truncate">{label}</span>
      <input
        type="checkbox"
        className="rounded border-slate-300"
        checked={value}
        onChange={(e) => setForm({
          ...form,
          creative_enhancements: { ...ce, [col]: e.target.checked },
        })}
      />
    </label>
  );
}

function CtaFavoritesEditor({ value, onChange, input, setInput }: { value: string[]; onChange: (v: string[]) => void; input: string; setInput: (v: string) => void }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">Pinned CTAs</span>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200 text-brand-700">
            {c}
            <button type="button" className="opacity-60 hover:opacity-100" onClick={() => onChange(value.filter((x) => x !== c))} aria-label={`Remove ${c}`}>×</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">No CTAs pinned</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="al-input font-mono text-xs flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="e.g. LEARN_MORE"
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              if (!value.includes(input.trim())) onChange([...value, input.trim()]);
              setInput("");
            }
          }}
        />
        <button
          type="button"
          className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          onClick={() => {
            if (input.trim() && !value.includes(input.trim())) onChange([...value, input.trim()]);
            setInput("");
          }}
        >
          + Add
        </button>
      </div>
      <span className="text-[10px] text-slate-400 mt-0.5 block">CTAs that appear first in the launcher's dropdown.</span>
    </div>
  );
}

/* ───────────── Per-account upstream values (collapsed reference) ───────────── */

function UpstreamMirrorDetails({ data, onSync }: { data: MetaPresetsResp; onSync: () => void }) {
  const [open, setOpen] = useState(false);
  const c = data.connection;
  const sync = useMutation({
    mutationFn: () => api.post<{ ok: boolean; bumped: number; note: string }>("/api/launch-presets/meta/sync"),
    onSettled: onSync,
  });
  return (
    <details className="mt-6 rounded-lg border border-slate-200 bg-slate-50/40" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-emerald-500" />
          <span>Per-account upstream values · {c.account_count} accounts mirrored from marketing.acentecom.com</span>
        </span>
        <span className="text-[10px] text-slate-400 font-normal">
          {c.last_synced_at ? `synced ${fmtDateTime(c.last_synced_at)}` : "never synced"} · click to {open ? "hide" : "view"}
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-slate-500">
            Read-only mirror of <a href="https://marketing.acentecom.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">marketing.acentecom.com</a>'s per-account launch defaults. The launcher uses these to pre-fill FB Page + IG silently when you pick an account; everything else flows through the universal defaults above.
          </p>
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 shrink-0 disabled:opacity-50"
          >
            {sync.isPending ? "Syncing…" : "↻ Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.presets.map((p) => (
            <MetaPresetCard key={p.account_id} preset={p} />
          ))}
        </div>
        {data.orphan_local_accounts.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-amber-900">
              {data.orphan_local_accounts.length} local Meta account{data.orphan_local_accounts.length === 1 ? "" : "s"} have no upstream defaults
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {data.orphan_local_accounts.map((o) => (
                <span key={o.id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-900" title={o.meta_account_id}>
                  {o.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function MetaPresetCard({ preset }: { preset: MetaPreset }) {
  const d = preset.defaults || {};
  const title = preset.account_name ?? d.facebookName ?? preset.account_id;
  const enhancements = Object.entries(d).filter(([k]) =>
    /^(enhancedCreative|multiAdvertiser|instagramOnly|launchPaused|scalePostId)$/.test(k),
  );
  return (
    <div className="al-card">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{title}</div>
          <div className="text-[10px] font-mono text-slate-400">{preset.account_id}</div>
          {preset.wired_local_id ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-800">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Wired to launcher · {preset.wired_local_name}
            </div>
          ) : (
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
              No local Meta account
            </div>
          )}
        </div>
        <div className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">{fmtDateTime(preset.synced_at)}</div>
      </div>
      <dl className="text-xs space-y-1.5">
        <Row label="FB Page" value={d.facebookName ? `${d.facebookName} (${d.page})` : d.page} />
        <Row label="Instagram" value={d.instaName ? `${d.instaName} (${d.insta})` : d.insta} />
        <Row label="Default CTA" value={d.cta} />
        <Row label="Default link" value={d.link} mono />
        <Row label="URL tags" value={d.urlTags} mono />
        {d.naming && <Row label="Naming pattern" value={d.naming} mono />}
      </dl>
      {enhancements.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Advantage+ flags</div>
          <div className="flex flex-wrap gap-1">
            {enhancements.map(([k, v]) => (
              <span
                key={k}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  v === true
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : v === false
                    ? "bg-slate-50 text-slate-500 border-slate-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {k}: {String(v)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold w-28 shrink-0">{label}</dt>
      <dd className={`text-slate-700 min-w-0 truncate ${mono ? "font-mono text-[11px]" : ""}`} title={value ?? ""}>
        {value === null || value === undefined || value === "" ? <span className="text-slate-300">—</span> : String(value)}
      </dd>
    </div>
  );
}

/* ─────────────────────── APPLOVIN ─────────────────────── */

function ApplovinPanel() {
  const qc = useQueryClient();
  const { data: applovinData, isLoading } = useQuery({
    queryKey: ["launch-presets-applovin"],
    queryFn: () => api.get<{ ok: boolean; data: ApplovinResp }>("/api/launch-presets/applovin"),
  });
  const data = applovinData?.data;
  const test = useMutation({
    mutationFn: (brandId: string) => api.post<{ ok: boolean; error: string | null }>(`/api/launch-presets/applovin/${brandId}/test`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["launch-presets-applovin"] }),
  });
  if (isLoading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (!data) return null;
  return (
    <div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3 mb-4 space-y-1.5">
        <div className="font-semibold">AppLovin's AXON platform splits credentials three ways.</div>
        <ul className="list-disc pl-5 space-y-1 leading-snug">
          <li>
            <span className="font-semibold">Campaign Management API key</span> → <span className="font-mono text-[10px]">{data.docs.campaign_api_base}</span>. The only one that creates ads.{" "}
            <span className="bg-amber-200/60 px-1 rounded text-[11px] font-semibold">Whitelist-only beta.</span>{" "}
            {data.docs.where_to_get_campaign_key}
            {data.docs.docs_url && (
              <>
                {" "}
                <a className="underline" href={data.docs.docs_url} target="_blank" rel="noopener noreferrer">
                  Official docs ↗
                </a>
              </>
            )}
          </li>
          <li>
            <span className="font-semibold">Reporting API key</span> → <span className="font-mono text-[10px]">{data.docs.reporting_api_base}</span>. Read-only metrics. Visible in Account Settings → Keys at ads.axon.ai.
          </li>
          <li>
            <span className="font-semibold">Axon Event key</span> → a UUID for pixel events / mobile SDK postbacks. Not an HTTP credential for ad creation.
          </li>
        </ul>
        <div className="text-[10px] italic">
          Auth header (once Campaign Management key is granted): <span className="font-mono">{data.docs.auth_header}</span>. Then 3 calls: upload asset → create creative set → done.
        </div>
      </div>
      {/* Cycle 314 — brand-health rollup. At-a-glance counts of how many
          brands have the Campaign Management key set + tested OK. Operator
          asked for the AXON state to be more visible. */}
      {data.brands.length > 0 && (() => {
        const total = data.brands.length;
        const campaignSet = data.brands.filter((b) => b.campaign_configured).length;
        const reportingSet = data.brands.filter((b) => b.reporting_configured).length;
        const eventSet = data.brands.filter((b) => b.event_configured).length;
        const testedOk = data.brands.filter((b) => b.last_tested_ok === true).length;
        const testedFail = data.brands.filter((b) => b.last_tested_ok === false).length;
        return (
          <div className="rounded-lg border border-slate-200 bg-white p-3 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Brand health · {total} brand{total === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HealthChip label="Campaign Mgmt key" count={campaignSet} total={total} critical={campaignSet < total} />
              <HealthChip label="Reporting key" count={reportingSet} total={total} />
              <HealthChip label="Event key" count={eventSet} total={total} />
              {testedOk + testedFail > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    testedFail > 0
                      ? "bg-rose-50 text-rose-800 border-rose-200"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200"
                  }`}
                  title={
                    testedFail > 0
                      ? `${testedFail} brand${testedFail === 1 ? "" : "s"} failed last AXON key test — click Edit keys on each red row to investigate.`
                      : `${testedOk} brand${testedOk === 1 ? "" : "s"} passed last AXON key test.`
                  }
                >
                  {testedFail > 0 ? `${testedFail} test failures` : `${testedOk} tested OK`}
                </span>
              )}
            </div>
          </div>
        );
      })()}
      <div className="space-y-3">
        {data.brands.map((b) => (
          <ApplovinBrandRow key={b.brand_id} brand={b} onTest={() => test.mutate(b.brand_id)} testing={test.isPending} />
        ))}
      </div>
    </div>
  );
}

function HealthChip({ label, count, total, critical }: { label: string; count: number; total: number; critical?: boolean }) {
  const allSet = count === total;
  const noneSet = count === 0;
  const cls = allSet
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : critical
      ? "bg-amber-50 text-amber-900 border-amber-300"
      : noneSet
        ? "bg-slate-50 text-slate-500 border-slate-200"
        : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}
      title={`${count} of ${total} brand${total === 1 ? "" : "s"} have a ${label} configured.`}
    >
      {label}: {count}/{total}
    </span>
  );
}

function ApplovinBrandRow({
  brand,
  onTest,
  testing,
}: {
  brand: ApplovinBrand;
  onTest: () => void;
  testing: boolean;
}) {
  const qc = useQueryClient();
  const [campaignKey, setCampaignKey] = useState("");
  const [reportingKey, setReportingKey] = useState("");
  const [eventKey, setEventKey] = useState("");
  const [acct, setAcct] = useState(brand.applovin_account_id ?? "");
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      // Only send keys the operator actually typed — empty strings leave the
      // existing value untouched on the server. Account_id always goes
      // through so it can be cleared by submitting blank.
      const body: Record<string, any> = {
        brand_id: brand.brand_id,
        applovin_account_id: acct || null,
      };
      if (campaignKey)  body.campaign_api_key  = campaignKey;
      if (reportingKey) body.reporting_api_key = reportingKey;
      if (eventKey)     body.sdk_event_key     = eventKey;
      return api.put("/api/launch-presets/applovin", body);
    },
    onSuccess: () => {
      setEditing(false);
      setCampaignKey("");
      setReportingKey("");
      setEventKey("");
      qc.invalidateQueries({ queryKey: ["launch-presets-applovin"] });
    },
  });
  return (
    <div className="al-card">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-slate-900">{brand.brand_name}</div>
          <div className="text-[10px] text-slate-400">
            {brand.applovin_account_id ? `Account ${brand.applovin_account_id}` : "No account_id set"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {brand.campaign_configured && (
            <button
              type="button"
              onClick={onTest}
              disabled={testing}
              title="Pings api.ads.axon.ai/manage/v1/campaign/list with the saved Campaign Management key"
              className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-[11px] px-2 py-1 rounded border border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
          >
            {editing ? "Cancel" : "Edit keys"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
        <KeyChip
          label="Campaign Mgmt"
          configured={brand.campaign_configured}
          masked={brand.campaign_key_masked}
          critical
          missingLabel="awaiting whitelist"
          hint="Creates ads (whitelist beta)"
        />
        <KeyChip
          label="Reporting"
          configured={brand.reporting_configured}
          masked={brand.reporting_key_masked}
          hint="Read-only metrics"
        />
        <KeyChip
          label="Axon Event"
          configured={brand.event_configured}
          masked={brand.event_key_masked}
          hint="Pixel / SDK events"
        />
      </div>

      {brand.last_tested_at && (
        <div
          className={`text-[10px] font-mono mt-2 ${
            brand.last_tested_ok ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {brand.last_tested_ok ? "✓" : "✕"} Campaign Mgmt key tested {fmtDateTime(brand.last_tested_at)}
          {brand.last_tested_error ? ` — ${brand.last_tested_error}` : ""}
        </div>
      )}

      {editing && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 items-end pt-3 border-t border-slate-100">
          <label className="text-xs md:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
              Campaign Management key <span className="text-rose-600">(creates ads)</span>
            </span>
            <input
              className="al-input font-mono text-xs"
              type="password"
              value={campaignKey}
              onChange={(e) => setCampaignKey(e.target.value)}
              placeholder={brand.campaign_configured ? "leave blank to keep current" : "appears in Account → Keys once whitelisted"}
            />
          </label>
          <label className="text-xs">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">Reporting key</span>
            <input
              className="al-input font-mono text-xs"
              type="password"
              value={reportingKey}
              onChange={(e) => setReportingKey(e.target.value)}
              placeholder={brand.reporting_configured ? "leave blank to keep current" : "paste reporting key"}
            />
          </label>
          <label className="text-xs">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">Event / SDK key</span>
            <input
              className="al-input font-mono text-xs"
              type="password"
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              placeholder={brand.event_configured ? "leave blank to keep current" : "paste SDK key UUID"}
            />
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">AppLovin account_id</span>
            <input
              className="al-input font-mono text-xs"
              value={acct}
              onChange={(e) => setAcct(e.target.value)}
              placeholder="numeric, e.g. 12345"
            />
          </label>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-primary md:col-span-2 text-xs h-9 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function KeyChip({
  label,
  configured,
  masked,
  hint,
  critical,
  missingLabel,
}: {
  label: string;
  configured: boolean;
  masked: string | null;
  hint: string;
  critical?: boolean;
  missingLabel?: string;
}) {
  const tone = configured
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : critical
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-slate-50 border-slate-200 text-slate-500";
  return (
    <div className={`rounded-md border px-2 py-1.5 ${tone}`}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
        <span>{label}</span>
        <span>{configured ? "✓" : "—"}</span>
      </div>
      <div className="text-[10px] font-mono mt-0.5 truncate">
        {configured ? masked : missingLabel ?? "not set"}
      </div>
      <div className="text-[9px] opacity-70 mt-0.5">{hint}</div>
    </div>
  );
}
