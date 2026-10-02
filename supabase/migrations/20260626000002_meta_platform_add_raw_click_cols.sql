-- Meta in-platform metrics need raw click/impression counts so the ads-performance
-- RPC can correctly recompute CPC / CPC(out) / CTR over a DATE RANGE (Σspend/Σclicks,
-- etc.) instead of averaging per-day ratios. Adds the 3 missing backing columns and
-- extends update_meta_platform_metrics to write them.

alter table public.acquisition_metrics
  add column if not exists "meta_platform_clicks"          numeric,
  add column if not exists "meta_platform_outbound_clicks" numeric,
  add column if not exists "meta_platform_impressions"     numeric;

create or replace function public.update_meta_platform_metrics(p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with v as (
    select * from jsonb_to_recordset(p_rows) as x(
      fb_ad_id        text,
      event_date      date,
      roas            numeric,
      cpa             numeric,
      cpc             numeric,
      cpc_out         numeric,
      ctr             numeric,
      conv_rate       numeric,
      spend           numeric,
      revenue         numeric,
      purchases       numeric,
      link_clicks     numeric,
      currency        text,
      clicks          numeric,
      outbound_clicks numeric,
      impressions     numeric
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
    "meta_platform_clicks"          = v.clicks,
    "meta_platform_outbound_clicks" = v.outbound_clicks,
    "meta_platform_impressions"     = v.impressions,
    "meta_platform_synced_at"       = now()
  from v
  where am.channel = 'facebook-ads'
    and am.fb_ad_id = v.fb_ad_id
    and am."eventDate" = v.event_date;

  get diagnostics n = row_count;
  return n;
end;
$$;
