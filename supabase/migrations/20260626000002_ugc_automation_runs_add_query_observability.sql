-- Adds live-ads query observability columns to ugc_automation_runs (created in
-- 20260521065006_ugc_automations.sql) so the AI UGC Automations custom-prompt
-- path can record what the model actually queried, how many live ads it pulled,
-- and whether scripts fell back to the static default instead of live ads.
-- Idempotent (ADD COLUMN IF NOT EXISTS) so it is safe to re-run. These column
-- names are the shared contract used by image-builder/automationsService.js.
ALTER TABLE ugc_automation_runs
  ADD COLUMN IF NOT EXISTS ads_query_applied JSONB,
  ADD COLUMN IF NOT EXISTS ad_ids_pulled     JSONB,
  ADD COLUMN IF NOT EXISTS ads_count         INTEGER,
  ADD COLUMN IF NOT EXISTS fallback_reason   TEXT,
  ADD COLUMN IF NOT EXISTS custom_prompt     TEXT;

COMMENT ON COLUMN ugc_automation_runs.ads_query_applied IS 'Filters the model actually applied (= executeAdsQuery result.applied, same object buildAdsMarker stores under "query"); NULL when no ads query ran.';
COMMENT ON COLUMN ugc_automation_runs.ad_ids_pulled     IS 'JSON array of ad_id pulled by the live query; NULL when none ([] allowed).';
COMMENT ON COLUMN ugc_automation_runs.ads_count         IS 'Number of live ads pulled (0 on a miss; NULL when no query was attempted).';
COMMENT ON COLUMN ugc_automation_runs.fallback_reason   IS 'NULL on live-ads success. Set only on the ads-driven path when scripts were written from the static default: live_query_returned_zero (query ran, 0 rows) | ads_query_failed (query attempted but errored, e.g. missing token/RPC error; ads_query_applied carries {error}) | no_ads_query_attempted (adsDriven but tool never called).';
COMMENT ON COLUMN ugc_automation_runs.custom_prompt     IS 'The automation.prompt_guide used for this run, verbatim (for display).';
