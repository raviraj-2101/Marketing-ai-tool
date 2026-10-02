-- AppLovin breakdown support: add a creative-set idempotency key to ad_breakdowns.
--
-- Background: AppLovin-only ads have no launch_variations row, so the breakdown worker can't key
-- them on variation_id. Their per-creative video comes from applovin_winners (the top-spending
-- asset per creative set). We key those breakdown rows on creative_set_id instead.
--
-- A plain UNIQUE index is used (not partial): Postgres treats NULLs as distinct, so the many
-- Meta rows (creative_set_id IS NULL) are all allowed, while non-null creative_set_ids stay
-- unique — and `ON CONFLICT (creative_set_id)` upserts infer this index cleanly.
alter table public.ad_breakdowns add column if not exists creative_set_id text;

create unique index if not exists ad_breakdowns_creative_set_uniq
  on public.ad_breakdowns(creative_set_id);
