-- Add CTA field (quiz / shop) to the ad record.
--
-- Meaning for the AppLovin team:
--   quiz → upload the ad with a quiz end card
--   shop → upload the ad with a discount/shop CTA end card
--
-- Plain text column, mirrors `funnel` (no CHECK constraint, so it can never
-- block an insert/update). The two allowed values are enforced upstream by the
-- ClickUp/`custom_fields` dropdown options. Added to statics_logs too for parity
-- with the funnel field, since the custom_fields mapping can write both tables.

ALTER TABLE public.ads          ADD COLUMN IF NOT EXISTS cta text;
ALTER TABLE public.statics_logs ADD COLUMN IF NOT EXISTS cta text;
