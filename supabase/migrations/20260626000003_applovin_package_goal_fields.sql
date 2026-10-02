-- AppLovin (Axon) package goal/platform fields — additive.
-- The launch form collects platform + goal settings (goal_type, roas_day_target, event_target)
-- and the createPackage save path now persists them for AppLovin packages. These columns were
-- referenced by the FE types + the launch controller but never created — this migration adds them.
--
-- ADDITIVE ONLY — every statement is idempotent (ADD COLUMN IF NOT EXISTS). No data is modified,
-- no existing column is altered, and the Meta launch/save path is untouched (Meta inserts never
-- reference these columns).

ALTER TABLE launch_packages
  ADD COLUMN IF NOT EXISTS platform         text,
  ADD COLUMN IF NOT EXISTS goal_type        text,
  ADD COLUMN IF NOT EXISTS roas_day_target  text,
  ADD COLUMN IF NOT EXISTS event_target     text;
