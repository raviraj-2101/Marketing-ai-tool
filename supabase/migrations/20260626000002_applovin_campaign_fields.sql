-- AppLovin (Axon) campaign-form parity — additive campaign-level fields.
-- These mirror the operator-entered Axon campaign settings (targeting countries, bidding
-- strategy, creative-set name) that the launch form now collects, so the AppLovin launch
-- controller can read them off launch_packages instead of falling back to generic columns.
--
-- ADDITIVE ONLY — every statement is idempotent (ADD COLUMN IF NOT EXISTS). No data is modified,
-- no existing column is altered, and the Meta launch path is untouched.

ALTER TABLE launch_packages
  ADD COLUMN IF NOT EXISTS applovin_targeting_countries text[],
  ADD COLUMN IF NOT EXISTS applovin_bidding_strategy    text,
  ADD COLUMN IF NOT EXISTS applovin_creative_set_name   text;
