-- Meta in-platform metrics (Triple Whale backup) on acquisition_metrics.
-- 6 client-facing columns + raw backing fields (audit / recompute) + sync timestamp.
-- Filled by the Pipeline-Node metaInsights jobs (today every 30 min, backfill daily 15:00).
-- NULL = "Meta returned no data for this metric"; a real 0 = genuine zero.

alter table public.acquisition_metrics
  add column if not exists "meta_platform_ROAS"            numeric,
  add column if not exists "meta_platform_CPA"             numeric,
  add column if not exists "meta_platform_CPC"             numeric,
  add column if not exists "meta_platform_CPC_out"         numeric,
  add column if not exists "meta_platform_CTR"             numeric,
  add column if not exists "meta_platform_conversion_rate" numeric,
  add column if not exists "meta_platform_spend"           numeric,
  add column if not exists "meta_platform_revenue"         numeric,
  add column if not exists "meta_platform_purchases"       numeric,
  add column if not exists "meta_platform_link_clicks"     numeric,
  add column if not exists "meta_platform_currency"        text,
  add column if not exists "meta_platform_synced_at"       timestamptz;

-- Fast match index for the update path: (channel='facebook-ads', fb_ad_id, eventDate).
create index if not exists idx_acq_metrics_fbid_date
  on public.acquisition_metrics (fb_ad_id, "eventDate")
  where channel = 'facebook-ads';

-- Bulk match-and-update: one round-trip per batch, returns the matched-row count.
-- Matches on (channel='facebook-ads', fb_ad_id, eventDate) — fb_ad_id is globally
-- unique per ad and eventDate pins the day, so each input row updates exactly its row.
create or replace function public.update_meta_platform_metrics(p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with v as (
    select * from jsonb_to_recordset(p_rows) as x(
      fb_ad_id    text,
      event_date  date,
      roas        numeric,
      cpa         numeric,
      cpc         numeric,
      cpc_out     numeric,
      ctr         numeric,
      conv_rate   numeric,
      spend       numeric,
      revenue     numeric,
      purchases   numeric,
      link_clicks numeric,
      currency    text
    )
  )
  update public.acquisition_metrics am set
    "meta_platform_ROAS"            = v.roas,
    "meta_platform_CPA"             = v.cpa,
    "meta_platform_CPC"             = v.cpc,
    "meta_platform_CPC_out"         = v.cpc_out,
    "meta_platform_CTR"             = v.ctr,
    "meta_platform_conversion_rate" = v.conv_rate,
    "meta_platform_spend"           = v.spend,
    "meta_platform_revenue"         = v.revenue,
    "meta_platform_purchases"       = v.purchases,
    "meta_platform_link_clicks"     = v.link_clicks,
    "meta_platform_currency"        = v.currency,
    "meta_platform_synced_at"       = now()
  from v
  where am.channel = 'facebook-ads'
    and am.fb_ad_id = v.fb_ad_id
    and am."eventDate" = v.event_date;

  get diagnostics n = row_count;
  return n;
end;
$$;
