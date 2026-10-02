-- One-off: register the CTA custom field so it flows DB ↔ Ads DB ↔ ClickUp.
--
-- This is NOT an auto-applied migration (it needs a ClickUp ID). Run it ONCE in
-- the Supabase SQL editor AFTER the CTA dropdown field (quiz / shop) has been
-- created in ClickUp and you have its field ID.
--
-- 1. Create the "CTA" dropdown field (options: quiz, shop) in ClickUp (by hand —
--    ClickUp's API can't create fields).
-- 2. Turn CTA on as a column in the main list/board view.
-- 3. Replace <<CTA_CLICKUP_FIELD_ID>> below with the ClickUp custom-field UUID, run.
--
-- You do NOT need the option UUIDs — the syncClickUpFields cron (every 10 min)
-- auto-fills `options` (quiz/shop) from ClickUp by clickup_id.
--
-- After insert:
--   * Ads DB shows an editable CTA dropdown column (data-driven from custom_fields).
--   * Editing CTA (Ads DB or Ads Performance) writes ads.cta AND pushes the value
--     to the ClickUp task's CTA field (is_add_in_clickup = true).

-- Field already created in ClickUp (Workspace-level). Real IDs baked in below.
insert into public.custom_fields
  (name, type, ads_col_name, static_log_col_name, clickup_id,
   is_add_in_clickup, is_update_in_cron, is_editable_fields, options)
values
  ('CTA', 'dropdown', 'cta', 'cta', 'b1826224-6fd7-4fa9-bf39-8ab67dee0781',
   true, true, true,
   '[{"label":"quiz","value":"a65960d4-f5f4-4dd3-9f35-8d4bae2c1a02"},{"label":"shop","value":"b5ac4de5-1fc3-4c60-b9e3-b38edc843aff"}]'::jsonb);
