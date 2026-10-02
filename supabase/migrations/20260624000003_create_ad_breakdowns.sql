-- Ad Analyzer Breakdown — one deep AI video breakdown per launched variation.
--
-- Background: every ad VARIATION (launch_variations row) that goes live gets its own
-- paste-ready .md breakdown (stored video link -> deep analysis -> transcript), produced by a
-- backend cron worker (breakdownWorkerService) using the ported reference-analyzer Gemini engine.
-- This table stores one row per variation, joined to the Ads Performance grid by ad_name.
--
-- DURABILITY: insert-only. The worker never re-analyzes a variation that already has a row
-- (unique(variation_id)) and never deletes a breakdown.
create table if not exists public.ad_breakdowns (
  id            uuid primary key default gen_random_uuid(),
  variation_id  uuid references public.launch_variations(id),
  ad_name       text not null,            -- join key to the grid row (Ad-name variation token)
  ad_id         bigint,                   -- parsed parent Ad ID (AppLovin fallback / roll-up)
  package_id    uuid,                     -- launch_packages.id (roll-up to the Ad ID bundle)
  md_url        text,                     -- public .md URL — what the Download button serves
  analysis_json jsonb,                    -- structured sidecar (model, dims, analysis body) for §5 aggregation
  model         text,
  status        text not null default 'done',  -- 'processing' | 'done' | 'failed'
  error         text,
  analyzed_at   timestamptz not null default now()
);

-- Idempotency: at most one breakdown per variation (the worker upserts on this).
create unique index if not exists ad_breakdowns_variation_uniq on public.ad_breakdowns(variation_id);
-- Fast join from the Ads Performance RPC.
create index if not exists ad_breakdowns_ad_name_idx on public.ad_breakdowns(ad_name);
create index if not exists ad_breakdowns_ad_id_idx on public.ad_breakdowns(ad_id);
