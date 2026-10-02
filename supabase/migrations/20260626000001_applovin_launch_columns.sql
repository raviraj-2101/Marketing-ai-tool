-- AppLovin (Axon) launch parity — additive per-variation + per-package launch columns.
-- Mirrors the Meta launch lifecycle columns (meta_video_id / meta_ad_id / meta_launch_error /
-- meta_launched_at on launch_variations, meta_campaign_id on launch_packages) so the AppLovin
-- launch flow can persist its 3-step Axon chain ids (asset -> campaign -> creative_set), errors,
-- and timestamps, and support resume/idempotency.
--
-- ADDITIVE ONLY — every statement is idempotent (ADD COLUMN IF NOT EXISTS). No data is modified,
-- no existing column is altered, and the Meta launch path is untouched.

ALTER TABLE launch_variations
  ADD COLUMN IF NOT EXISTS applovin_asset_id        text,
  ADD COLUMN IF NOT EXISTS applovin_campaign_id     text,
  ADD COLUMN IF NOT EXISTS applovin_creative_set_id text,
  ADD COLUMN IF NOT EXISTS applovin_launch_error    text,
  ADD COLUMN IF NOT EXISTS applovin_launched_at     timestamptz;

-- Partial index to make resume lookups (skip already-uploaded assets) cheap.
CREATE INDEX IF NOT EXISTS idx_launch_variations_applovin_asset_id
  ON launch_variations (applovin_asset_id) WHERE applovin_asset_id IS NOT NULL;

ALTER TABLE launch_packages
  ADD COLUMN IF NOT EXISTS applovin_campaign_id text;
