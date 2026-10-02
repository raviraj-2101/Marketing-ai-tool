-- AppLovin in-platform metrics (Triple Whale backup) on acquisition_metrics.
-- 5 client-facing columns + raw backing fields (audit / recompute) + sync timestamp.
-- Filled by the Pipeline-Node applovinInsights jobs (today every 20 min, backfill daily 14:00).
-- Source: AppLovin advertiser Reporting API (https://r.applovin.com/report?report_type=advertiser).
-- NULL = "AppLovin returned no data for this metric"; a real 0 = genuine zero.
-- NOTE: AppLovin has NO Outbound-CPC equivalent (that is a Meta-only metric), so unlike the
-- Meta backup there is intentionally NO applovin_platform_CPC_out column.

alter table public.acquisition_metrics
  add column if not exists "applovin_platform_ROAS"            numeric,
  add column if not exists "applovin_platform_CPA"             numeric,
  add column if not exists "applovin_platform_CPC"             numeric,
  add column if not exists "applovin_platform_CTR"             numeric,
  add column if not exists "applovin_platform_conversion_rate" numeric,
  add column if not exists "applovin_platform_spend"           numeric,
  add column if not exists "applovin_platform_impressions"     numeric,
  add column if not exists "applovin_platform_clicks"          numeric,
  add column if not exists "applovin_platform_conversions"     numeric,
  add column if not exists "applovin_platform_revenue"         numeric,
  add column if not exists "applovin_platform_synced_at"       timestamptz;

-- Fast match index for the update path: (channel='applovin', adsetId, campaignName, adsetName, eventDate).
create index if not exists idx_acq_metrics_applovin_match
  on public.acquisition_metrics ("adsetId", "campaignName", "adsetName", "eventDate")
  where channel = 'applovin';

-- Bulk match-and-update: one round-trip per batch, returns the matched-row count.
-- Matches on (channel='applovin', campaignName, adsetId=creative_set_id, adsetName=creative_set,
-- eventDate) per the agreed match spec. AppLovin acquisition_metrics rows are 1-per-(campaign,
-- adset, day), so each input row updates exactly its row. UPDATE-only (no insert) => idempotent:
-- re-running the same date overwrites the same rows with the same values, never duplicates.
create or replace function public.update_applovin_platform_metrics(p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with v as (
    select * from jsonb_to_recordset(p_rows) as x(
      campaign_name   text,
      creative_set_id text,
      creative_set    text,
      event_date      date,
      roas            numeric,
      cpa             numeric,
      cpc             numeric,
      ctr             numeric,
      conv_rate       numeric,
      spend           numeric,
      impressions     numeric,
      clicks          numeric,
      conversions     numeric,
      revenue         numeric
    )
  )
  update public.acquisition_metrics am set
    "applovin_platform_ROAS"            = v.roas,
    "applovin_platform_CPA"             = v.cpa,
    "applovin_platform_CPC"             = v.cpc,
    "applovin_platform_CTR"             = v.ctr,
    "applovin_platform_conversion_rate" = v.conv_rate,
    "applovin_platform_spend"           = v.spend,
    "applovin_platform_impressions"     = v.impressions,
    "applovin_platform_clicks"          = v.clicks,
    "applovin_platform_conversions"     = v.conversions,
    "applovin_platform_revenue"         = v.revenue,
    "applovin_platform_synced_at"       = now()
  from v
  where am.channel = 'applovin'
    and am."campaignName" = v.campaign_name
    and am."adsetId"      = v.creative_set_id
    and am."adsetName"    = v.creative_set
    and am."eventDate"    = v.event_date;

  get diagnostics n = row_count;
  return n;
end;
$$;
