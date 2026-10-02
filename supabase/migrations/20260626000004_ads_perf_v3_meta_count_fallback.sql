-- Make CPC / CPC(out) / CTR display for rows ingested BEFORE the raw count columns
-- existed: use the real meta_platform_clicks/outbound_clicks/impressions when present,
-- else derive the count from the stored per-day ratio (clicks = spend/cpc, etc.).
-- Same return shape as the prior version -> CREATE OR REPLACE (no DROP needed).
CREATE OR REPLACE FUNCTION public.get_ads_performance_v3(
  p_start_date          date,
  p_end_date            date,
  p_channels            text[],
  p_page                int      DEFAULT 1,
  p_page_size           int      DEFAULT 25,
  p_sort_key            text     DEFAULT NULL,
  p_sort_dir            text     DEFAULT 'desc',
  p_effective_brands    text[]   DEFAULT NULL,
  p_search              text     DEFAULT NULL,
  p_ad_id               bigint   DEFAULT NULL,
  p_script_id           text     DEFAULT NULL,
  p_concept             text     DEFAULT NULL,
  p_format              text[]   DEFAULT NULL,
  p_it_or_nn            text     DEFAULT NULL,
  p_cs                  text     DEFAULT NULL,
  p_editor              text     DEFAULT NULL,
  p_root_causes         text[]   DEFAULT NULL,
  p_main_pain_points    text[]   DEFAULT NULL,
  p_min_roas            numeric  DEFAULT NULL,
  p_launch_start        date     DEFAULT NULL,
  p_launch_end          date     DEFAULT NULL,
  p_products            text[]   DEFAULT NULL,
  p_product_identifiers jsonb    DEFAULT NULL,
  p_ad_name             text     DEFAULT NULL,
  p_funnels             text[]   DEFAULT NULL,
  p_ad_types            text[]   DEFAULT NULL,
  p_sub_angles          text[]   DEFAULT NULL,
  p_ctas                text[]   DEFAULT NULL,
  p_cta_themes          text[]   DEFAULT NULL,
  p_angles              text[]   DEFAULT NULL,
  p_edit_type           text     DEFAULT NULL
)
 RETURNS TABLE(ad_id bigint, channel text, campaign_name text, adset_name text, ad_name text, ad_image_url text, ad_video_url text, fb_ad_id text, product text, spend numeric, nc_revenue numeric, nc_orders numeric, new_customers numeric, out_clicks numeric, impressions numeric, clicks numeric, orders numeric, nc_roas numeric, nc_aov numeric, nc_cvr numeric, nc_cpa numeric, ocpc numeric, octr numeric, cpm numeric, nv_pct numeric, script_id text, launch_date_meta text, launch_date_applovin text, cs text, concept_name text, editor text, ad_format text, funnel text, cta text, it_or_nn text, clickup_link text, root_cause text, sub_angle text, sub_angle_detail text, main_pain_point text, ad_type text, notes text, points text, brief text, ad_length numeric, ad_source_link text, edit_type text, breakdown_url text, breakdown_ready boolean, creative_set_id text, total_count bigint, total_spend numeric, total_nc_revenue numeric, avg_nc_roas numeric, avg_nc_cpa numeric, avg_nc_aov numeric, avg_ocpc numeric, avg_octr numeric, avg_nc_cvr numeric, avg_clicks numeric, avg_orders numeric, avg_cpm numeric, avg_nv_pct numeric, meta_roas numeric, meta_cpa numeric, meta_cpc numeric, meta_cpc_out numeric, meta_ctr numeric, meta_conv_rate numeric, avg_meta_roas numeric, avg_meta_cpa numeric, avg_meta_cpc numeric, avg_meta_cpc_out numeric, avg_meta_ctr numeric, avg_meta_conv_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET statement_timeout TO '0'
AS $function$
DECLARE
  v_offset    int := (GREATEST(p_page, 1) - 1) * GREATEST(LEAST(p_page_size, 10000), 1);
  v_page_size int := LEAST(GREATEST(p_page_size, 1), 10000);
BEGIN
  RETURN QUERY
  WITH

  base AS (
    SELECT
      m.*,
      SUM(m.spend) OVER (PARTITION BY
        m.brand, m.channel, m."campaignName", m."adsetName",
        CASE WHEN m.channel = 'applovin' THEN NULL ELSE m."adName" END,
        NULLIF(m."adVideoURL", 'NULL')
      ) AS video_url_spend,
      SUM(m."ncRevenue") OVER (PARTITION BY
        m.brand, m.channel, m."campaignName", m."adsetName",
        CASE WHEN m.channel = 'applovin' THEN NULL ELSE m."adName" END,
        NULLIF(m."adVideoURL", 'NULL')
      ) AS video_url_revenue,
      SUM(m.spend) OVER (PARTITION BY
        m.brand, m.channel, m."campaignName", m."adsetName",
        CASE WHEN m.channel = 'applovin' THEN NULL ELSE m."adName" END,
        NULLIF(m."adImageURL", 'NULL')
      ) AS image_url_spend,
      SUM(m."ncRevenue") OVER (PARTITION BY
        m.brand, m.channel, m."campaignName", m."adsetName",
        CASE WHEN m.channel = 'applovin' THEN NULL ELSE m."adName" END,
        NULLIF(m."adImageURL", 'NULL')
      ) AS image_url_revenue
    FROM acquisition_metrics m
    WHERE
      m.channel = ANY(p_channels)
      AND m."eventDate" BETWEEN p_start_date AND p_end_date
      AND (p_effective_brands IS NULL OR m.brand = ANY(p_effective_brands))
  ),

  aggregated AS (
    SELECT
      m.channel,
      m."campaignName"                                                         AS campaign_name,
      m."adsetName"                                                            AS adset_name,
      MAX(m."adName")                                                          AS ad_name,
      MAX(m."adsetId")                                                         AS adset_id_raw,
      (array_agg(NULLIF(m."adImageURL", 'NULL')
         ORDER BY
           m.image_url_spend DESC NULLS LAST,
           CASE WHEN m.image_url_spend > 0
                THEN m.image_url_revenue / m.image_url_spend ELSE 0 END DESC NULLS LAST,
           NULLIF(m."adImageURL", 'NULL') DESC
       ) FILTER (WHERE NULLIF(m."adImageURL", 'NULL') IS NOT NULL))[1]         AS ad_image_url,
      (array_agg(NULLIF(m."adVideoURL", 'NULL')
         ORDER BY
           m.video_url_spend DESC NULLS LAST,
           CASE WHEN m.video_url_spend > 0
                THEN m.video_url_revenue / m.video_url_spend ELSE 0 END DESC NULLS LAST,
           NULLIF(m."adVideoURL", 'NULL') DESC
       ) FILTER (WHERE NULLIF(m."adVideoURL", 'NULL') IS NOT NULL))[1]         AS ad_video_url,
      MAX(NULLIF(m."fb_ad_id",   ''))                                          AS fb_ad_id,
      MAX(m.launch_date)                                                       AS launch_date,
      MAX(
        CASE
          WHEN m.channel = 'applovin'
          THEN (regexp_match(m."adsetName", '(\d{3,})'))[1]::bigint
          ELSE (regexp_match(m."adName",    '(\d{3,})'))[1]::bigint
        END
      )                                                                        AS numeric_id,
      SUM(m.spend)::numeric              AS spend,
      SUM(m."ncRevenue")::numeric        AS nc_revenue,
      SUM(m."ncOrders")::numeric         AS nc_orders,
      SUM(m."newCustomers")::numeric     AS new_customers,
      SUM(m."uniqueVisitors")::numeric   AS unique_visitors,
      SUM(m."outClicks")::numeric        AS out_clicks,
      SUM(m.impressions)::numeric        AS impressions,
      SUM(m.clicks)::numeric             AS clicks,
      SUM(m.orders)::numeric             AS orders,
      SUM(m."cpcSpend")::numeric         AS cpc_spend,
      SUM(m."cpcOutClicks")::numeric     AS cpc_out_clicks,
      -- Meta in-platform raw components (summed; ratios derived in `joined`)
      SUM(m."meta_platform_spend")::numeric          AS meta_spend,
      SUM(m."meta_platform_revenue")::numeric        AS meta_revenue,
      SUM(m."meta_platform_purchases")::numeric      AS meta_purchases,
      SUM(m."meta_platform_link_clicks")::numeric    AS meta_link_clicks,
      -- effective counts: prefer real raw counts (post re-ingest); else derive from the
      -- stored per-day ratio so CPC/CPC(out)/CTR show without a re-ingest of old rows.
      SUM(COALESCE(m."meta_platform_clicks",
            CASE WHEN m."meta_platform_CPC" > 0 THEN m."meta_platform_spend" / m."meta_platform_CPC" END))::numeric AS meta_clicks,
      SUM(COALESCE(m."meta_platform_outbound_clicks",
            CASE WHEN m."meta_platform_CPC_out" > 0 THEN m."meta_platform_spend" / m."meta_platform_CPC_out" END))::numeric AS meta_outbound_clicks,
      SUM(COALESCE(m."meta_platform_impressions",
            CASE WHEN m."meta_platform_CPC" > 0 AND m."meta_platform_CTR" > 0
                 THEN (m."meta_platform_spend" / m."meta_platform_CPC") / m."meta_platform_CTR" * 100 END))::numeric AS meta_impressions
    FROM base m
    GROUP BY
      m.brand,
      m.channel,
      m."campaignName",
      m."adsetName",
      CASE WHEN m.channel = 'applovin' THEN NULL ELSE m."adName" END
  ),

  joined AS (
    SELECT
      COALESCE(ads.ad_id::bigint, a.numeric_id)                                          AS ad_id,
      CASE WHEN a.channel = 'facebook-ads' THEN 'Meta' ELSE 'Applovin' END              AS channel,
      a.campaign_name,
      a.adset_name,
      CASE
        WHEN LOWER(TRIM(a.ad_name)) = 'applovin' THEN '-'
        ELSE COALESCE(a.ad_name, '')
      END                                                                                AS ad_name,
      a.ad_image_url,
      a.ad_video_url,
      a.fb_ad_id,
      COALESCE(
        (
          SELECT pi->>'product'
          FROM jsonb_array_elements(COALESCE(p_product_identifiers, '[]'::jsonb)) AS pi
          WHERE
            CASE
              WHEN a.channel = 'applovin' THEN
                (
                  NULLIF(pi->>'applovin_onbrand', '') IS NOT NULL
                  AND a.campaign_name ILIKE '%' || (pi->>'applovin_onbrand') || '%'
                )
                OR
                (
                  NULLIF(pi->>'applovin_comparison', '') IS NOT NULL
                  AND a.campaign_name ILIKE '%' || (pi->>'applovin_comparison') || '%'
                )
              ELSE
                (NULLIF(pi->>'meta_onbrand',    '') IS NOT NULL
                  AND a.campaign_name ILIKE '%' || (pi->>'meta_onbrand')    || '%')
                OR
                (NULLIF(pi->>'meta_comparison', '') IS NOT NULL
                  AND a.campaign_name ILIKE '%' || (pi->>'meta_comparison') || '%')
            END
          LIMIT 1
        ),
        NULLIF(ads.product, ''),
        ''
      )                                                                                  AS product,
      a.spend,
      a.nc_revenue,
      a.nc_orders,
      a.new_customers,
      a.unique_visitors,
      a.out_clicks,
      a.impressions,
      a.clicks,
      a.orders,
      a.cpc_spend,
      a.cpc_out_clicks,
      -- Meta raw sums carried through for the rollup totals window in `counted`
      a.meta_spend,
      a.meta_revenue,
      a.meta_purchases,
      a.meta_link_clicks,
      a.meta_clicks,
      a.meta_outbound_clicks,
      a.meta_impressions,
      -- Meta per-row metrics derived from window-correct summed components (NULL = no Meta data)
      CASE WHEN a.meta_spend           > 0 THEN a.meta_revenue / a.meta_spend                  ELSE NULL END AS meta_roas,
      CASE WHEN a.meta_purchases       > 0 THEN a.meta_spend   / a.meta_purchases               ELSE NULL END AS meta_cpa,
      CASE WHEN a.meta_clicks          > 0 THEN a.meta_spend   / a.meta_clicks                  ELSE NULL END AS meta_cpc,
      CASE WHEN a.meta_outbound_clicks > 0 THEN a.meta_spend   / a.meta_outbound_clicks         ELSE NULL END AS meta_cpc_out,
      CASE WHEN a.meta_impressions     > 0 THEN (a.meta_clicks    / a.meta_impressions) * 100   ELSE NULL END AS meta_ctr,
      CASE WHEN a.meta_link_clicks     > 0 THEN (a.meta_purchases / a.meta_link_clicks) * 100   ELSE NULL END AS meta_conv_rate,
      CASE WHEN a.spend           > 0 THEN a.nc_revenue    / a.spend               ELSE 0 END AS nc_roas,
      CASE WHEN a.nc_orders       > 0 THEN a.nc_revenue    / a.nc_orders            ELSE 0 END AS nc_aov,
      CASE WHEN a.new_customers   > 0 THEN (a.nc_orders    / a.new_customers) * 100 ELSE 0 END AS nc_cvr,
      CASE WHEN a.nc_orders       > 0 THEN a.spend         / a.nc_orders            ELSE 0 END AS nc_cpa,
      CASE
        WHEN a.cpc_out_clicks > 0 THEN a.cpc_spend / a.cpc_out_clicks
        WHEN a.out_clicks     > 0 THEN a.spend      / a.out_clicks
        ELSE 0
      END AS ocpc,
      CASE WHEN a.impressions     > 0 THEN (a.out_clicks   / a.impressions)   * 100 ELSE 0 END AS octr,
      CASE WHEN a.impressions     > 0 THEN (a.spend        / a.impressions)   * 1000 ELSE 0 END AS cpm,
      CASE WHEN a.unique_visitors > 0 THEN (a.new_customers / a.unique_visitors) * 100 ELSE 0 END AS nv_pct,
      ads.script_id::text                                                                 AS script_id,
      CASE WHEN a.channel != 'applovin'
        THEN COALESCE(a.launch_date::text, ads.launch_date_meta::text)
        ELSE ads.launch_date_meta::text
      END                                                                                 AS launch_date_meta,
      CASE WHEN a.channel = 'applovin'
        THEN COALESCE(a.launch_date::text, ads.launch_date_applovin::text)
        ELSE ads.launch_date_applovin::text
      END                                                                                 AS launch_date_applovin,
      ads.cs,
      ads.concept_name,
      ads.editor,
      ads.ad_format,
      ads.funnel,
      ads.cta,
      ads.it_or_nn,
      ads.clickup_link,
      ads.root_cause,
      ads.sub_angle,
      ads.sub_angle_detail,
      ads.main_pains                                                                      AS main_pain_point,
      ads.ad_type,
      ads.notes,
      ads.points::text                                                                    AS points,
      ads.ad_brief_doc                                                                    AS brief,
      ads.ss_count                                                                        AS ad_length,
      NULLIF(COALESCE(NULLIF(ads.framer_io_link, ''), NULLIF(ads.g_drive_link, '')), '') AS ad_source_link,
      COALESCE(ads.edit_type, 'Editor-Edited')                                            AS edit_type,
      (
        SELECT b.md_url
        FROM public.ad_breakdowns b
        WHERE b.status = 'done' AND b.md_url IS NOT NULL
          AND (
            (b.meta_ad_id     IS NOT NULL AND b.meta_ad_id     = a.fb_ad_id)
            OR (b.creative_set_id IS NOT NULL AND b.creative_set_id = a.adset_id_raw)
          )
        ORDER BY b.analyzed_at DESC
        LIMIT 1
      )                                                                                   AS breakdown_url,
      CASE WHEN a.channel = 'applovin' THEN a.adset_id_raw::text ELSE NULL END           AS creative_set_id,
      COALESCE(a.launch_date, ads.launch_date_meta, ads.launch_date_applovin)            AS parsed_launch_date
    FROM aggregated a
    LEFT JOIN ads ON ads.ad_id::bigint = a.numeric_id
    WHERE
      (p_search IS NULL OR (
        a.ad_name           ILIKE '%' || p_search || '%' OR
        a.campaign_name     ILIKE '%' || p_search || '%' OR
        ads.concept_name    ILIKE '%' || p_search || '%' OR
        ads.script_id::text ILIKE '%' || p_search || '%'
      ))
      AND (p_ad_id     IS NULL OR ads.ad_id::bigint = p_ad_id)
      AND (p_script_id IS NULL OR ads.script_id::text ILIKE '%' || p_script_id || '%')
      AND (p_concept   IS NULL OR ads.concept_name ILIKE '%' || p_concept || '%')
      AND (p_ad_name   IS NULL OR
           a.ad_name    ILIKE '%' || p_ad_name || '%' OR
           a.adset_name ILIKE '%' || p_ad_name || '%')
      AND (p_format    IS NULL OR LOWER(ads.ad_format) = ANY(p_format))
      AND (p_it_or_nn  IS NULL OR LOWER(ads.it_or_nn) = LOWER(p_it_or_nn))
      AND (
        p_cs IS NULL OR
        CASE
          WHEN p_cs = 'missing' THEN (ads.cs IS NULL OR TRIM(ads.cs) = '')
          ELSE ads.cs ILIKE '%' || p_cs || '%'
        END
      )
      AND (
        p_editor IS NULL OR
        CASE
          WHEN p_editor = 'missing' THEN (ads.editor IS NULL OR TRIM(ads.editor) = '')
          ELSE ads.editor ILIKE '%' || p_editor || '%'
        END
      )
      AND (
        p_root_causes IS NULL OR EXISTS (
          SELECT 1
          FROM   unnest(string_to_array(lower(coalesce(ads.root_cause, '')), ',')) AS part
          WHERE  trim(part) = ANY (p_root_causes)
        )
      )
      AND (
        p_main_pain_points IS NULL OR EXISTS (
          SELECT 1
          FROM   unnest(string_to_array(lower(coalesce(ads.main_pains, '')), ',')) AS part
          WHERE  trim(part) = ANY (p_main_pain_points)
        )
      )
      AND (
        p_min_roas IS NULL OR
        CASE WHEN a.spend > 0 THEN a.nc_revenue / a.spend ELSE 0 END >= p_min_roas
      )
      AND (p_funnels   IS NULL OR ads.funnel   = ANY(p_funnels))
      AND (p_ctas      IS NULL OR ads.cta      = ANY(p_ctas))
      AND (p_ad_types  IS NULL OR ads.ad_type  = ANY(p_ad_types))
      AND (p_sub_angles IS NULL OR ads.sub_angle = ANY(p_sub_angles))
      AND (
        p_cta_themes IS NULL OR EXISTS (
          SELECT 1
          FROM   unnest(string_to_array(lower(coalesce(ads.cta, '')), ',')) AS part
          WHERE  trim(part) = ANY (p_cta_themes)
        )
      )
      AND (
        p_angles IS NULL OR EXISTS (
          SELECT 1
          FROM   unnest(string_to_array(lower(coalesce(ads.sub_angle, '')), ',')) AS part
          WHERE  trim(part) = ANY (p_angles)
        )
      )
      AND (p_edit_type IS NULL OR COALESCE(ads.edit_type, 'Editor-Edited') = p_edit_type)
  ),

  filtered_product AS (
    SELECT j.* FROM joined j
    WHERE
      p_products IS NULL OR j.product = ANY(p_products)
  ),

  filtered_launch AS (
    SELECT * FROM filtered_product
    WHERE
      (p_launch_start IS NULL AND p_launch_end IS NULL)
      OR (
        parsed_launch_date IS NOT NULL
        AND (p_launch_start IS NULL OR parsed_launch_date >= p_launch_start)
        AND (p_launch_end   IS NULL OR parsed_launch_date <= p_launch_end)
      )
  ),

  counted AS (
    SELECT
      fl.*,
      COUNT(*)                  OVER() AS total_count,
      SUM(fl.spend)             OVER() AS total_spend,
      SUM(fl.nc_revenue)        OVER() AS total_nc_revenue,
      SUM(fl.clicks)            OVER() AS avg_clicks,
      SUM(fl.orders)            OVER() AS avg_orders,
      CASE WHEN SUM(fl.spend)           OVER() > 0
        THEN SUM(fl.nc_revenue)         OVER() / SUM(fl.spend)           OVER()
      END                              AS avg_nc_roas,
      CASE WHEN SUM(fl.nc_orders)       OVER() > 0
        THEN SUM(fl.spend)              OVER() / SUM(fl.nc_orders)       OVER()
      END                              AS avg_nc_cpa,
      CASE WHEN SUM(fl.nc_orders)       OVER() > 0
        THEN SUM(fl.nc_revenue)         OVER() / SUM(fl.nc_orders)       OVER()
      END                              AS avg_nc_aov,
      CASE
        WHEN SUM(fl.cpc_out_clicks) OVER() > 0 THEN SUM(fl.cpc_spend) OVER() / SUM(fl.cpc_out_clicks) OVER()
        WHEN SUM(fl.out_clicks)     OVER() > 0 THEN SUM(fl.spend)     OVER() / SUM(fl.out_clicks)     OVER()
      END                              AS avg_ocpc,
      CASE WHEN SUM(fl.impressions)     OVER() > 0
        THEN (SUM(fl.out_clicks)        OVER() / SUM(fl.impressions)     OVER()) * 100
      END                              AS avg_octr,
      CASE WHEN SUM(fl.new_customers)   OVER() > 0
        THEN (SUM(fl.nc_orders)         OVER() / SUM(fl.new_customers)   OVER()) * 100
      END                              AS avg_nc_cvr,
      CASE WHEN SUM(fl.impressions)     OVER() > 0
        THEN (SUM(fl.spend)             OVER() / SUM(fl.impressions)     OVER()) * 1000
      END                              AS avg_cpm,
      CASE WHEN SUM(fl.unique_visitors) OVER() > 0
        THEN (SUM(fl.new_customers)     OVER() / SUM(fl.unique_visitors) OVER()) * 100
      END                              AS avg_nv_pct,
      -- Meta in-platform rollup totals (recomputed from summed raw components)
      CASE WHEN SUM(fl.meta_spend)           OVER() > 0
        THEN SUM(fl.meta_revenue)            OVER() / SUM(fl.meta_spend)           OVER()
      END                              AS avg_meta_roas,
      CASE WHEN SUM(fl.meta_purchases)       OVER() > 0
        THEN SUM(fl.meta_spend)              OVER() / SUM(fl.meta_purchases)       OVER()
      END                              AS avg_meta_cpa,
      CASE WHEN SUM(fl.meta_clicks)          OVER() > 0
        THEN SUM(fl.meta_spend)              OVER() / SUM(fl.meta_clicks)          OVER()
      END                              AS avg_meta_cpc,
      CASE WHEN SUM(fl.meta_outbound_clicks) OVER() > 0
        THEN SUM(fl.meta_spend)              OVER() / SUM(fl.meta_outbound_clicks) OVER()
      END                              AS avg_meta_cpc_out,
      CASE WHEN SUM(fl.meta_impressions)     OVER() > 0
        THEN (SUM(fl.meta_clicks)            OVER() / SUM(fl.meta_impressions)     OVER()) * 100
      END                              AS avg_meta_ctr,
      CASE WHEN SUM(fl.meta_link_clicks)     OVER() > 0
        THEN (SUM(fl.meta_purchases)         OVER() / SUM(fl.meta_link_clicks)     OVER()) * 100
      END                              AS avg_meta_conv_rate
    FROM filtered_launch fl
  )

  SELECT
    t.ad_id, t.channel, t.campaign_name, t.adset_name, t.ad_name,
    t.ad_image_url, t.ad_video_url, t.fb_ad_id, t.product,
    t.spend, t.nc_revenue, t.nc_orders, t.new_customers, t.out_clicks,
    t.impressions, t.clicks, t.orders,
    t.nc_roas, t.nc_aov, t.nc_cvr, t.nc_cpa, t.ocpc, t.octr, t.cpm, t.nv_pct,
    t.script_id, t.launch_date_meta, t.launch_date_applovin,
    t.cs, t.concept_name, t.editor, t.ad_format, t.funnel, t.cta, t.it_or_nn,
    t.clickup_link, t.root_cause, t.sub_angle, t.sub_angle_detail, t.main_pain_point,
    t.ad_type, t.notes, t.points, t.brief, t.ad_length, t.ad_source_link, t.edit_type,
    t.breakdown_url, (t.breakdown_url IS NOT NULL) AS breakdown_ready,
    t.creative_set_id,
    t.total_count,
    t.total_spend, t.total_nc_revenue,
    t.avg_nc_roas, t.avg_nc_cpa, t.avg_nc_aov,
    t.avg_ocpc, t.avg_octr, t.avg_nc_cvr,
    t.avg_clicks, t.avg_orders, t.avg_cpm, t.avg_nv_pct,
    t.meta_roas, t.meta_cpa, t.meta_cpc, t.meta_cpc_out, t.meta_ctr, t.meta_conv_rate,
    t.avg_meta_roas, t.avg_meta_cpa, t.avg_meta_cpc, t.avg_meta_cpc_out, t.avg_meta_ctr, t.avg_meta_conv_rate
  FROM counted t
  ORDER BY
    (CASE p_sort_key
      WHEN 'spend'        THEN t.spend
      WHEN 'ncRevenue'    THEN t.nc_revenue
      WHEN 'ncOrders'     THEN t.nc_orders
      WHEN 'newCustomers' THEN t.new_customers
      WHEN 'outClicks'    THEN t.out_clicks
      WHEN 'clicks'       THEN t.clicks
      WHEN 'impressions'  THEN t.impressions
      WHEN 'orders'       THEN t.orders
      WHEN 'ncROAS'       THEN t.nc_roas
      WHEN 'ncAOV'        THEN t.nc_aov
      WHEN 'ncCVR'        THEN t.nc_cvr
      WHEN 'ncCPA'        THEN t.nc_cpa
      WHEN 'OCPC'         THEN t.ocpc
      WHEN 'OCTR'         THEN t.octr
      WHEN 'CPM'          THEN t.cpm
      WHEN 'metaROAS'     THEN t.meta_roas
      WHEN 'metaCPA'      THEN t.meta_cpa
      WHEN 'metaCPC'      THEN t.meta_cpc
      WHEN 'metaCPCOut'   THEN t.meta_cpc_out
      WHEN 'metaCTR'      THEN t.meta_ctr
      WHEN 'metaConvRate' THEN t.meta_conv_rate
      ELSE t.nc_roas
    END) * CASE WHEN p_sort_dir = 'asc' THEN -1 ELSE 1 END DESC NULLS LAST
  LIMIT  v_page_size
  OFFSET v_offset;
END;
$function$;
