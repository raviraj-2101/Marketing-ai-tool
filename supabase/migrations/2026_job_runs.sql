-- Robot Health Pop-up — single source of truth for scheduled-robot run status.
-- Every robot (Top-Scripts Refresh GitHub Action + the pipeline-node node-cron jobs)
-- writes ONE row here when it finishes. The /api/robot-health endpoint reads the
-- latest row per job_name to render the health pop-up on marketing.acentecom.com.
--
-- Run ONCE against the marketing Supabase project (the same project that holds
-- acquisition_metrics + ads). Safe to re-run: guarded by IF NOT EXISTS.

create table if not exists public.job_runs (
  id           bigint generated always as identity primary key,
  job_name     text        not null,           -- canonical: top_scripts_refresh | applovin_winner_scraper
                                                --            | applovin_url_backfill | clickup_fields_sync
                                                --            | triplewhale_ad_perf_sync
  started_at   timestamptz,
  finished_at  timestamptz not null default now(),
  status       text        not null check (status in ('success','failed','partial','running')),
  rows_updated integer,
  products     jsonb,                           -- { "<slug>": <scripts_written>, ... }
  counts       jsonb,                           -- robot-specific structured counts (see contract)
  error        text,
  meta         jsonb,                           -- { run_url, commit_sha, freshest_event_date, schedule }
  created_at   timestamptz not null default now()
);

-- Fast "latest row per robot" lookups for the health endpoint.
create index if not exists job_runs_name_finished_idx
  on public.job_runs (job_name, finished_at desc);
