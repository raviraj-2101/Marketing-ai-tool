-- Add the Meta ad id to ad_breakdowns so Meta breakdowns join the perf grid on a STABLE key.
--
-- Why: ad_name drifts between launch_variations (template, with unresolved placeholders like
-- "_SS6_" / "ED.[ED]") and acquisition_metrics.adName (resolved / human-named), so a name join is
-- unreliable. The robust per-variation key is the Meta ad id: launch_variations.meta_ad_id (set by
-- the launcher = the created Meta ad id) == acquisition_metrics.fb_ad_id. Stored as text to match
-- fb_ad_id's text comparison in get_ads_performance_v3.
alter table public.ad_breakdowns add column if not exists meta_ad_id text;

create index if not exists ad_breakdowns_meta_ad_id_idx on public.ad_breakdowns(meta_ad_id);
