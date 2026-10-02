-- Adds Angle + Sub-angle columns to statics_logs (the TSL / static ad rows).
--
-- Background: regular ads carry two angle levels on the `ads` table — the UI
-- "Angle" is stored (legacy name) as `ads.sub_angle`, and the newer "Sub Angle"
-- as `ads.sub_angle_detail`. TSL ads live in `statics_logs` instead and so far
-- carried NEITHER value — the angle only lived on the linked `tsl_scripts` row,
-- so it never surfaced in the Ads DB, Ads Performance, or ClickUp.
--
-- This migration mirrors the `ads` shape onto statics_logs so the TSL final form
-- can populate both and they show up everywhere the regular ads do:
--   sub_angle        = the "Angle"      (legacy name, kept for consistency)
--   sub_angle_detail = the "Sub Angle"  (new level)
--
-- Both are nullable text and guarded with IF NOT EXISTS so the migration is
-- self-contained and safe to re-run.

ALTER TABLE public.statics_logs ADD COLUMN IF NOT EXISTS sub_angle text;
ALTER TABLE public.statics_logs ADD COLUMN IF NOT EXISTS sub_angle_detail text;
