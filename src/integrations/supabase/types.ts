// Generated from the live PostgREST OpenAPI schema.
//
// WHY THIS FILE IS GENERATED THIS WAY: the previous contents of this file were a Supabase
// CLI error string ("Access token not provided...", dated 2026/05/05), which is not valid
// TypeScript. It failed to parse, so `tsc` aborted before semantic analysis and the entire
// repo was effectively unchecked — that is how a real TS2339 (BatchCreator reading
// `subAngleDetail` off a type that never declared it) shipped to production unnoticed.
//
// Regenerating with the Supabase CLI (`supabase gen types typescript`) requires a CLI login
// that was not available, so these types were derived from the database's own PostgREST
// OpenAPI document instead — the same authoritative source, fetched read-only.
//
// KNOWN LIMITATIONS versus a real `supabase gen types` run:
//   1. Nullability is inferred from PostgREST's `required` set, which means "NOT NULL and no
//      default". A NOT NULL column that HAS a default is therefore typed as nullable. This is
//      conservative in the safe direction: an extra null-check, never a hidden null.
//   2. `Relationships` are emitted empty. Foreign keys exist in the database and are visible
//      in the OpenAPI descriptions, but relationship typing is not reconstructed here.
//   3. Views and tables are not distinguished; every exposed relation appears under `Tables`.
//   4. `Enums` and `CompositeTypes` are empty; enum-typed columns widen to `string`.
//
// Prefer replacing this with a real `supabase gen types typescript --project-id <id>` run
// when a CLI login is available.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      acquisition_metrics: {
        Row: {
          created_at: string
          brand: string | null
          channel: string | null
          spend: number | null
          ncRevenue: number | null
          ncOrders: number | null
          ncROAS: number | null
          ncAOV: number | null
          CPC: number | null
          CPM: number | null
          ncCVR: number | null
          eventDate: string | null
          id: string
          ncCPA: number
          OCPC: number
          OCTR: number
          campaignName: string
          adName: string | null
          clicks: number
          impressions: number
          outClicks: number
          newCustomers: number
          adsetName: string | null
          revenue: number
          orders: number
          refunds: number
          cogs: number
          adImageURL: string | null
          adVideoURL: string | null
          adsetId: string | null
          uniqueVisitors: number | null
          NVPercent: number | null
          fb_ad_id: string | null
          launch_date: string | null
          cpcSpend: number | null
          cpcOutClicks: number | null
          meta_platform_ROAS: number | null
          meta_platform_CPA: number | null
          meta_platform_CPC: number | null
          meta_platform_CPC_out: number | null
          meta_platform_CTR: number | null
          meta_platform_conversion_rate: number | null
          meta_platform_spend: number | null
          meta_platform_revenue: number | null
          meta_platform_purchases: number | null
          meta_platform_link_clicks: number | null
          meta_platform_currency: string | null
          meta_platform_synced_at: string | null
          applovin_platform_ROAS: number | null
          applovin_platform_CPA: number | null
          applovin_platform_CPC: number | null
          applovin_platform_CTR: number | null
          applovin_platform_conversion_rate: number | null
          applovin_platform_spend: number | null
          applovin_platform_impressions: number | null
          applovin_platform_clicks: number | null
          applovin_platform_conversions: number | null
          applovin_platform_revenue: number | null
          applovin_platform_synced_at: string | null
          meta_platform_clicks: number | null
          meta_platform_outbound_clicks: number | null
          meta_platform_impressions: number | null
          applovin_preview_synced_at: string | null
        }
        Insert: {
          created_at: string
          brand?: string | null
          channel?: string | null
          spend?: number | null
          ncRevenue?: number | null
          ncOrders?: number | null
          ncROAS?: number | null
          ncAOV?: number | null
          CPC?: number | null
          CPM?: number | null
          ncCVR?: number | null
          eventDate?: string | null
          id: string
          ncCPA: number
          OCPC: number
          OCTR: number
          campaignName: string
          adName?: string | null
          clicks: number
          impressions: number
          outClicks: number
          newCustomers: number
          adsetName?: string | null
          revenue: number
          orders: number
          refunds: number
          cogs: number
          adImageURL?: string | null
          adVideoURL?: string | null
          adsetId?: string | null
          uniqueVisitors?: number | null
          NVPercent?: number | null
          fb_ad_id?: string | null
          launch_date?: string | null
          cpcSpend?: number | null
          cpcOutClicks?: number | null
          meta_platform_ROAS?: number | null
          meta_platform_CPA?: number | null
          meta_platform_CPC?: number | null
          meta_platform_CPC_out?: number | null
          meta_platform_CTR?: number | null
          meta_platform_conversion_rate?: number | null
          meta_platform_spend?: number | null
          meta_platform_revenue?: number | null
          meta_platform_purchases?: number | null
          meta_platform_link_clicks?: number | null
          meta_platform_currency?: string | null
          meta_platform_synced_at?: string | null
          applovin_platform_ROAS?: number | null
          applovin_platform_CPA?: number | null
          applovin_platform_CPC?: number | null
          applovin_platform_CTR?: number | null
          applovin_platform_conversion_rate?: number | null
          applovin_platform_spend?: number | null
          applovin_platform_impressions?: number | null
          applovin_platform_clicks?: number | null
          applovin_platform_conversions?: number | null
          applovin_platform_revenue?: number | null
          applovin_platform_synced_at?: string | null
          meta_platform_clicks?: number | null
          meta_platform_outbound_clicks?: number | null
          meta_platform_impressions?: number | null
          applovin_preview_synced_at?: string | null
        }
        Update: {
          created_at?: string
          brand?: string | null
          channel?: string | null
          spend?: number | null
          ncRevenue?: number | null
          ncOrders?: number | null
          ncROAS?: number | null
          ncAOV?: number | null
          CPC?: number | null
          CPM?: number | null
          ncCVR?: number | null
          eventDate?: string | null
          id?: string
          ncCPA?: number
          OCPC?: number
          OCTR?: number
          campaignName?: string
          adName?: string | null
          clicks?: number
          impressions?: number
          outClicks?: number
          newCustomers?: number
          adsetName?: string | null
          revenue?: number
          orders?: number
          refunds?: number
          cogs?: number
          adImageURL?: string | null
          adVideoURL?: string | null
          adsetId?: string | null
          uniqueVisitors?: number | null
          NVPercent?: number | null
          fb_ad_id?: string | null
          launch_date?: string | null
          cpcSpend?: number | null
          cpcOutClicks?: number | null
          meta_platform_ROAS?: number | null
          meta_platform_CPA?: number | null
          meta_platform_CPC?: number | null
          meta_platform_CPC_out?: number | null
          meta_platform_CTR?: number | null
          meta_platform_conversion_rate?: number | null
          meta_platform_spend?: number | null
          meta_platform_revenue?: number | null
          meta_platform_purchases?: number | null
          meta_platform_link_clicks?: number | null
          meta_platform_currency?: string | null
          meta_platform_synced_at?: string | null
          applovin_platform_ROAS?: number | null
          applovin_platform_CPA?: number | null
          applovin_platform_CPC?: number | null
          applovin_platform_CTR?: number | null
          applovin_platform_conversion_rate?: number | null
          applovin_platform_spend?: number | null
          applovin_platform_impressions?: number | null
          applovin_platform_clicks?: number | null
          applovin_platform_conversions?: number | null
          applovin_platform_revenue?: number | null
          applovin_platform_synced_at?: string | null
          meta_platform_clicks?: number | null
          meta_platform_outbound_clicks?: number | null
          meta_platform_impressions?: number | null
          applovin_preview_synced_at?: string | null
        }
        Relationships: []
      }
      ad_breakdowns: {
        Row: {
          id: string
          variation_id: string | null
          ad_name: string
          ad_id: number | null
          package_id: string | null
          md_url: string | null
          analysis_json: Json | null
          model: string | null
          status: string
          error: string | null
          analyzed_at: string
          creative_set_id: string | null
          meta_ad_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          variation_id?: string | null
          ad_name: string
          ad_id?: number | null
          package_id?: string | null
          md_url?: string | null
          analysis_json?: Json | null
          model?: string | null
          status: string
          error?: string | null
          analyzed_at: string
          creative_set_id?: string | null
          meta_ad_id?: string | null
          created_at: string
        }
        Update: {
          id?: string
          variation_id?: string | null
          ad_name?: string
          ad_id?: number | null
          package_id?: string | null
          md_url?: string | null
          analysis_json?: Json | null
          model?: string | null
          status?: string
          error?: string | null
          analyzed_at?: string
          creative_set_id?: string | null
          meta_ad_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ad_creation_jobs: {
        Row: {
          job_id: string
          status: string
          result: Json | null
          error: string | null
          created: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          job_id: string
          status: string
          result?: Json | null
          error?: string | null
          created?: Json | null
          created_at: string
          updated_at: string
        }
        Update: {
          job_id?: string
          status?: string
          result?: Json | null
          error?: string | null
          created?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admanage_accounts: {
        Row: {
          id: string
          account_id: string
          name: string | null
          meta_account_id: string | null
          is_active: boolean | null
          raw_data: Json | null
          synced_at: string | null
          created_at: string
          currency: string | null
          business_id: string | null
          timezone_name: string | null
          last_synced: string | null
          status: string | null
        }
        Insert: {
          id: string
          account_id: string
          name?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at: string
          currency?: string | null
          business_id?: string | null
          timezone_name?: string | null
          last_synced?: string | null
          status?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          name?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at?: string
          currency?: string | null
          business_id?: string | null
          timezone_name?: string | null
          last_synced?: string | null
          status?: string | null
        }
        Relationships: []
      }
      admanage_adsets: {
        Row: {
          id: string
          adset_id: string
          name: string | null
          status: string | null
          campaign_id: string | null
          meta_account_id: string | null
          raw_data: Json | null
          synced_at: string | null
          created_at: string
          effective_status: string | null
          optimization_goal: string | null
          budget_amount: number | null
          budget_type: string | null
          ad_count: number | null
          destination_type: string | null
          ad_account_id: string | null
          last_updated: string | null
          pulled_at: string | null
        }
        Insert: {
          id: string
          adset_id: string
          name?: string | null
          status?: string | null
          campaign_id?: string | null
          meta_account_id?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at: string
          effective_status?: string | null
          optimization_goal?: string | null
          budget_amount?: number | null
          budget_type?: string | null
          ad_count?: number | null
          destination_type?: string | null
          ad_account_id?: string | null
          last_updated?: string | null
          pulled_at?: string | null
        }
        Update: {
          id?: string
          adset_id?: string
          name?: string | null
          status?: string | null
          campaign_id?: string | null
          meta_account_id?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at?: string
          effective_status?: string | null
          optimization_goal?: string | null
          budget_amount?: number | null
          budget_type?: string | null
          ad_count?: number | null
          destination_type?: string | null
          ad_account_id?: string | null
          last_updated?: string | null
          pulled_at?: string | null
        }
        Relationships: []
      }
      admanage_campaigns: {
        Row: {
          id: string
          campaign_id: string
          name: string | null
          status: string | null
          effective_status: string | null
          objective: string | null
          buying_type: string | null
          meta_account_id: string | null
          raw_data: Json | null
          synced_at: string | null
          created_at: string
          ad_account_id: string | null
          platform: string | null
          total_spend: number | null
          ad_set_count: number | null
          last_updated: string | null
          pulled_at: string | null
        }
        Insert: {
          id: string
          campaign_id: string
          name?: string | null
          status?: string | null
          effective_status?: string | null
          objective?: string | null
          buying_type?: string | null
          meta_account_id?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at: string
          ad_account_id?: string | null
          platform?: string | null
          total_spend?: number | null
          ad_set_count?: number | null
          last_updated?: string | null
          pulled_at?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string
          name?: string | null
          status?: string | null
          effective_status?: string | null
          objective?: string | null
          buying_type?: string | null
          meta_account_id?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at?: string
          ad_account_id?: string | null
          platform?: string | null
          total_spend?: number | null
          ad_set_count?: number | null
          last_updated?: string | null
          pulled_at?: string | null
        }
        Relationships: []
      }
      admanage_ig_accounts: {
        Row: {
          id: string
          ig_id: string
          name: string | null
          handle: string | null
          meta_account_id: string | null
          is_active: boolean | null
          raw_data: Json | null
          synced_at: string | null
          created_at: string
          ad_account_ids: Json | null
          last_synced: string | null
        }
        Insert: {
          id: string
          ig_id: string
          name?: string | null
          handle?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at: string
          ad_account_ids?: Json | null
          last_synced?: string | null
        }
        Update: {
          id?: string
          ig_id?: string
          name?: string | null
          handle?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at?: string
          ad_account_ids?: Json | null
          last_synced?: string | null
        }
        Relationships: []
      }
      admanage_library: {
        Row: {
          id: string
          ad_id: string | null
          asset_name: string | null
          ai_name: string | null
          status: string | null
          uploaded_by: string | null
          tags: Json | null
          smart_tags: Json | null
          meta_ad_id: string | null
          brand_id: string | null
          product_id: string | null
          funnel: string | null
          platform: string | null
          transcript: string | null
          admanage_data: Json | null
          synced_at: string | null
          created_at: string
          adm_id: string | null
          filename: string | null
          url: string | null
          thumbnail_url: string | null
          mime_type: string | null
          duration_sec: number | null
          width: number | null
          height: number | null
          size_bytes: number | null
          source: string | null
          date_added: string | null
          adm_account_id: string | null
          adm_account_ad_id: string | null
          meta_ad_ids: Json | null
          pulled_at: string | null
        }
        Insert: {
          id: string
          ad_id?: string | null
          asset_name?: string | null
          ai_name?: string | null
          status?: string | null
          uploaded_by?: string | null
          tags?: Json | null
          smart_tags?: Json | null
          meta_ad_id?: string | null
          brand_id?: string | null
          product_id?: string | null
          funnel?: string | null
          platform?: string | null
          transcript?: string | null
          admanage_data?: Json | null
          synced_at?: string | null
          created_at: string
          adm_id?: string | null
          filename?: string | null
          url?: string | null
          thumbnail_url?: string | null
          mime_type?: string | null
          duration_sec?: number | null
          width?: number | null
          height?: number | null
          size_bytes?: number | null
          source?: string | null
          date_added?: string | null
          adm_account_id?: string | null
          adm_account_ad_id?: string | null
          meta_ad_ids?: Json | null
          pulled_at?: string | null
        }
        Update: {
          id?: string
          ad_id?: string | null
          asset_name?: string | null
          ai_name?: string | null
          status?: string | null
          uploaded_by?: string | null
          tags?: Json | null
          smart_tags?: Json | null
          meta_ad_id?: string | null
          brand_id?: string | null
          product_id?: string | null
          funnel?: string | null
          platform?: string | null
          transcript?: string | null
          admanage_data?: Json | null
          synced_at?: string | null
          created_at?: string
          adm_id?: string | null
          filename?: string | null
          url?: string | null
          thumbnail_url?: string | null
          mime_type?: string | null
          duration_sec?: number | null
          width?: number | null
          height?: number | null
          size_bytes?: number | null
          source?: string | null
          date_added?: string | null
          adm_account_id?: string | null
          adm_account_ad_id?: string | null
          meta_ad_ids?: Json | null
          pulled_at?: string | null
        }
        Relationships: []
      }
      admanage_pages: {
        Row: {
          id: string
          page_id: string
          name: string | null
          meta_account_id: string | null
          is_active: boolean | null
          raw_data: Json | null
          synced_at: string | null
          created_at: string
          category: string | null
          managed_workspaces: Json | null
          ad_account_ids: Json | null
          live_ads_count: number | null
          ads_limit: number | null
          last_synced: string | null
        }
        Insert: {
          id: string
          page_id: string
          name?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at: string
          category?: string | null
          managed_workspaces?: Json | null
          ad_account_ids?: Json | null
          live_ads_count?: number | null
          ads_limit?: number | null
          last_synced?: string | null
        }
        Update: {
          id?: string
          page_id?: string
          name?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at?: string
          category?: string | null
          managed_workspaces?: Json | null
          ad_account_ids?: Json | null
          live_ads_count?: number | null
          ads_limit?: number | null
          last_synced?: string | null
        }
        Relationships: []
      }
      admanage_pixels: {
        Row: {
          id: string
          pixel_id: string
          name: string | null
          meta_account_id: string | null
          is_active: boolean | null
          raw_data: Json | null
          synced_at: string | null
          created_at: string
          ad_account_id: string | null
          last_synced: string | null
        }
        Insert: {
          id: string
          pixel_id: string
          name?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at: string
          ad_account_id?: string | null
          last_synced?: string | null
        }
        Update: {
          id?: string
          pixel_id?: string
          name?: string | null
          meta_account_id?: string | null
          is_active?: boolean | null
          raw_data?: Json | null
          synced_at?: string | null
          created_at?: string
          ad_account_id?: string | null
          last_synced?: string | null
        }
        Relationships: []
      }
      admanage_refresh_requests: {
        Row: {
          id: string
          scope: string
          requested_by: string | null
          status: string
          note: string | null
          requested_at: string
          completed_at: string | null
        }
        Insert: {
          id: string
          scope: string
          requested_by?: string | null
          status: string
          note?: string | null
          requested_at: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          scope?: string
          requested_by?: string | null
          status?: string
          note?: string | null
          requested_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      ads: {
        Row: {
          id: string
          created_at: string
          ad_id: number
          script_id: string
          brand: string | null
          product: string | null
          cs: string | null
          batch_week: string | null
          created_date: string | null
          clickup_link: string | null
          clickup_task_id: string | null
          ss_count: number | null
          concept_name: string | null
          ad_format: string | null
          funnel: string | null
          it_or_nn: string | null
          weight: string | null
          language: string | null
          intended_platform: string | null
          editor: string | null
          status: string | null
          launch_date_meta: string | null
          launch_date_applovin: string | null
          platforms: string | null
          g_drive_link: string | null
          framer_io_link: string | null
          pipeline_status: string | null
          ad_brief_doc: string | null
          notes: string | null
          duration: string | null
          list_status: string | null
          ad_type: string | null
          priority: string | null
          pod: string | null
          creator: string | null
          mass_desire: string | null
          sub_angle: string | null
          performance: string | null
          awareness_lvl: string | null
          persona: string | null
          points: number | null
          audience_segment: string | null
          main_pains: string | null
          root_cause: string | null
          ucg_sourcing_needed: string | null
          first_pending_review_date: string | null
          first_approved_date: string | null
          creation_method: string | null
          cta: string | null
          created_by: string | null
          first_editing_date: string | null
          sub_angle_detail: string | null
          edit_type: string
        }
        Insert: {
          id: string
          created_at: string
          ad_id: number
          script_id: string
          brand?: string | null
          product?: string | null
          cs?: string | null
          batch_week?: string | null
          created_date?: string | null
          clickup_link?: string | null
          clickup_task_id?: string | null
          ss_count?: number | null
          concept_name?: string | null
          ad_format?: string | null
          funnel?: string | null
          it_or_nn?: string | null
          weight?: string | null
          language?: string | null
          intended_platform?: string | null
          editor?: string | null
          status?: string | null
          launch_date_meta?: string | null
          launch_date_applovin?: string | null
          platforms?: string | null
          g_drive_link?: string | null
          framer_io_link?: string | null
          pipeline_status?: string | null
          ad_brief_doc?: string | null
          notes?: string | null
          duration?: string | null
          list_status?: string | null
          ad_type?: string | null
          priority?: string | null
          pod?: string | null
          creator?: string | null
          mass_desire?: string | null
          sub_angle?: string | null
          performance?: string | null
          awareness_lvl?: string | null
          persona?: string | null
          points?: number | null
          audience_segment?: string | null
          main_pains?: string | null
          root_cause?: string | null
          ucg_sourcing_needed?: string | null
          first_pending_review_date?: string | null
          first_approved_date?: string | null
          creation_method?: string | null
          cta?: string | null
          created_by?: string | null
          first_editing_date?: string | null
          sub_angle_detail?: string | null
          edit_type: string
        }
        Update: {
          id?: string
          created_at?: string
          ad_id?: number
          script_id?: string
          brand?: string | null
          product?: string | null
          cs?: string | null
          batch_week?: string | null
          created_date?: string | null
          clickup_link?: string | null
          clickup_task_id?: string | null
          ss_count?: number | null
          concept_name?: string | null
          ad_format?: string | null
          funnel?: string | null
          it_or_nn?: string | null
          weight?: string | null
          language?: string | null
          intended_platform?: string | null
          editor?: string | null
          status?: string | null
          launch_date_meta?: string | null
          launch_date_applovin?: string | null
          platforms?: string | null
          g_drive_link?: string | null
          framer_io_link?: string | null
          pipeline_status?: string | null
          ad_brief_doc?: string | null
          notes?: string | null
          duration?: string | null
          list_status?: string | null
          ad_type?: string | null
          priority?: string | null
          pod?: string | null
          creator?: string | null
          mass_desire?: string | null
          sub_angle?: string | null
          performance?: string | null
          awareness_lvl?: string | null
          persona?: string | null
          points?: number | null
          audience_segment?: string | null
          main_pains?: string | null
          root_cause?: string | null
          ucg_sourcing_needed?: string | null
          first_pending_review_date?: string | null
          first_approved_date?: string | null
          creation_method?: string | null
          cta?: string | null
          created_by?: string | null
          first_editing_date?: string | null
          sub_angle_detail?: string | null
          edit_type?: string
        }
        Relationships: []
      }
      ads_backup_full: {
        Row: {
          id: string | null
          created_at: string | null
          ad_id: number | null
          script_id: string | null
          brand: string | null
          product: string | null
          cs: string | null
          batch_week: string | null
          created_date: string | null
          clickup_link: string | null
          clickup_task_id: string | null
          ss_count: number | null
          concept_name: string | null
          ad_format: string | null
          funnel: string | null
          it_or_nn: string | null
          weight: string | null
          language: string | null
          intended_platform: string | null
          editor: string | null
          status: string | null
          launch_date_meta: string | null
          launch_date_applovin: string | null
          platforms: string | null
          g_drive_link: string | null
          framer_io_link: string | null
          pipeline_status: string | null
          ad_brief_doc: string | null
          notes: string | null
          duration: string | null
          list_status: string | null
          ad_type: string | null
          priority: string | null
          pod: string | null
          creator: string | null
          mass_desire: string | null
          sub_angle: string | null
          performance: string | null
          awareness_lvl: string | null
          persona: string | null
          points: number | null
          audience_segment: string | null
          main_pains: string | null
          root_cause: string | null
          ucg_sourcing_needed: string | null
          first_pending_review_date: string | null
          first_approved_date: string | null
        }
        Insert: {
          id?: string | null
          created_at?: string | null
          ad_id?: number | null
          script_id?: string | null
          brand?: string | null
          product?: string | null
          cs?: string | null
          batch_week?: string | null
          created_date?: string | null
          clickup_link?: string | null
          clickup_task_id?: string | null
          ss_count?: number | null
          concept_name?: string | null
          ad_format?: string | null
          funnel?: string | null
          it_or_nn?: string | null
          weight?: string | null
          language?: string | null
          intended_platform?: string | null
          editor?: string | null
          status?: string | null
          launch_date_meta?: string | null
          launch_date_applovin?: string | null
          platforms?: string | null
          g_drive_link?: string | null
          framer_io_link?: string | null
          pipeline_status?: string | null
          ad_brief_doc?: string | null
          notes?: string | null
          duration?: string | null
          list_status?: string | null
          ad_type?: string | null
          priority?: string | null
          pod?: string | null
          creator?: string | null
          mass_desire?: string | null
          sub_angle?: string | null
          performance?: string | null
          awareness_lvl?: string | null
          persona?: string | null
          points?: number | null
          audience_segment?: string | null
          main_pains?: string | null
          root_cause?: string | null
          ucg_sourcing_needed?: string | null
          first_pending_review_date?: string | null
          first_approved_date?: string | null
        }
        Update: {
          id?: string | null
          created_at?: string | null
          ad_id?: number | null
          script_id?: string | null
          brand?: string | null
          product?: string | null
          cs?: string | null
          batch_week?: string | null
          created_date?: string | null
          clickup_link?: string | null
          clickup_task_id?: string | null
          ss_count?: number | null
          concept_name?: string | null
          ad_format?: string | null
          funnel?: string | null
          it_or_nn?: string | null
          weight?: string | null
          language?: string | null
          intended_platform?: string | null
          editor?: string | null
          status?: string | null
          launch_date_meta?: string | null
          launch_date_applovin?: string | null
          platforms?: string | null
          g_drive_link?: string | null
          framer_io_link?: string | null
          pipeline_status?: string | null
          ad_brief_doc?: string | null
          notes?: string | null
          duration?: string | null
          list_status?: string | null
          ad_type?: string | null
          priority?: string | null
          pod?: string | null
          creator?: string | null
          mass_desire?: string | null
          sub_angle?: string | null
          performance?: string | null
          awareness_lvl?: string | null
          persona?: string | null
          points?: number | null
          audience_segment?: string | null
          main_pains?: string | null
          root_cause?: string | null
          ucg_sourcing_needed?: string | null
          first_pending_review_date?: string | null
          first_approved_date?: string | null
        }
        Relationships: []
      }
      ads_editor_backup: {
        Row: {
          id: string | null
          ad_id: number | null
          editor: string | null
        }
        Insert: {
          id?: string | null
          ad_id?: number | null
          editor?: string | null
        }
        Update: {
          id?: string | null
          ad_id?: number | null
          editor?: string | null
        }
        Relationships: []
      }
      ads_pending_date_backfill_20260702: {
        Row: {
          id: string | null
          clickup_task_id: string | null
          first_pending_review_date: string | null
          first_approved_date: string | null
        }
        Insert: {
          id?: string | null
          clickup_task_id?: string | null
          first_pending_review_date?: string | null
          first_approved_date?: string | null
        }
        Update: {
          id?: string | null
          clickup_task_id?: string | null
          first_pending_review_date?: string | null
          first_approved_date?: string | null
        }
        Relationships: []
      }
      ads_points_sync_20260703: {
        Row: {
          ad_id: number | null
          clickup_task_id: string | null
          points: number | null
          backed_up_at: string | null
        }
        Insert: {
          ad_id?: number | null
          clickup_task_id?: string | null
          points?: number | null
          backed_up_at?: string | null
        }
        Update: {
          ad_id?: number | null
          clickup_task_id?: string | null
          points?: number | null
          backed_up_at?: string | null
        }
        Relationships: []
      }
      agents: {
        Row: {
          id: string
          name: string | null
          email: string | null
          role: string | null
        }
        Insert: {
          id: string
          name?: string | null
          email?: string | null
          role?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          email?: string | null
          role?: string | null
        }
        Relationships: []
      }
      app_logs: {
        Row: {
          id: number
          ts: string
          level: string
          project: string
          service: string | null
          correlation_id: string | null
          message: string | null
          context: Json | null
          err: Json | null
        }
        Insert: {
          id: number
          ts: string
          level: string
          project: string
          service?: string | null
          correlation_id?: string | null
          message?: string | null
          context?: Json | null
          err?: Json | null
        }
        Update: {
          id?: number
          ts?: string
          level?: string
          project?: string
          service?: string | null
          correlation_id?: string | null
          message?: string | null
          context?: Json | null
          err?: Json | null
        }
        Relationships: []
      }
      applovin_brand_keys: {
        Row: {
          id: string
          brand_id: string | null
          report_key_enc: string | null
          campaign_key_enc: string | null
          reporting_key_enc: string | null
          updated_at: string
          campaign_api_key: string | null
          reporting_api_key: string | null
          sdk_event_key: string | null
          applovin_account_id: string | null
          notes: string | null
          last_tested_at: string | null
          last_tested_ok: boolean | null
          last_tested_error: string | null
        }
        Insert: {
          id: string
          brand_id?: string | null
          report_key_enc?: string | null
          campaign_key_enc?: string | null
          reporting_key_enc?: string | null
          updated_at: string
          campaign_api_key?: string | null
          reporting_api_key?: string | null
          sdk_event_key?: string | null
          applovin_account_id?: string | null
          notes?: string | null
          last_tested_at?: string | null
          last_tested_ok?: boolean | null
          last_tested_error?: string | null
        }
        Update: {
          id?: string
          brand_id?: string | null
          report_key_enc?: string | null
          campaign_key_enc?: string | null
          reporting_key_enc?: string | null
          updated_at?: string
          campaign_api_key?: string | null
          reporting_api_key?: string | null
          sdk_event_key?: string | null
          applovin_account_id?: string | null
          notes?: string | null
          last_tested_at?: string | null
          last_tested_ok?: boolean | null
          last_tested_error?: string | null
        }
        Relationships: []
      }
      applovin_winners: {
        Row: {
          id: string
          created_at: string
          creative_set_id: string | null
          creative_set: string | null
          ad_id_extracted: number | null
          brand: string | null
          campaign_id: string | null
          campaign: string | null
          winner_asset_id: string | null
          winner_asset_name: string | null
          winner_asset_url: string | null
          winner_cost: number | null
          winner_impressions: number | null
          winner_clicks: number | null
          last_updated: string | null
          eventDate: string | null
          launch_date: string | null
          launch_date_checked_at: string | null
          applovin_platform_ROAS: number | null
          applovin_platform_CPA: number | null
          applovin_platform_CPC: number | null
          applovin_platform_CTR: number | null
          applovin_platform_conversion_rate: number | null
          applovin_platform_spend: number | null
          applovin_platform_impressions: number | null
          applovin_platform_clicks: number | null
          applovin_platform_conversions: number | null
          applovin_platform_revenue: number | null
          applovin_platform_synced_at: string | null
        }
        Insert: {
          id: string
          created_at: string
          creative_set_id?: string | null
          creative_set?: string | null
          ad_id_extracted?: number | null
          brand?: string | null
          campaign_id?: string | null
          campaign?: string | null
          winner_asset_id?: string | null
          winner_asset_name?: string | null
          winner_asset_url?: string | null
          winner_cost?: number | null
          winner_impressions?: number | null
          winner_clicks?: number | null
          last_updated?: string | null
          eventDate?: string | null
          launch_date?: string | null
          launch_date_checked_at?: string | null
          applovin_platform_ROAS?: number | null
          applovin_platform_CPA?: number | null
          applovin_platform_CPC?: number | null
          applovin_platform_CTR?: number | null
          applovin_platform_conversion_rate?: number | null
          applovin_platform_spend?: number | null
          applovin_platform_impressions?: number | null
          applovin_platform_clicks?: number | null
          applovin_platform_conversions?: number | null
          applovin_platform_revenue?: number | null
          applovin_platform_synced_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          creative_set_id?: string | null
          creative_set?: string | null
          ad_id_extracted?: number | null
          brand?: string | null
          campaign_id?: string | null
          campaign?: string | null
          winner_asset_id?: string | null
          winner_asset_name?: string | null
          winner_asset_url?: string | null
          winner_cost?: number | null
          winner_impressions?: number | null
          winner_clicks?: number | null
          last_updated?: string | null
          eventDate?: string | null
          launch_date?: string | null
          launch_date_checked_at?: string | null
          applovin_platform_ROAS?: number | null
          applovin_platform_CPA?: number | null
          applovin_platform_CPC?: number | null
          applovin_platform_CTR?: number | null
          applovin_platform_conversion_rate?: number | null
          applovin_platform_spend?: number | null
          applovin_platform_impressions?: number | null
          applovin_platform_clicks?: number | null
          applovin_platform_conversions?: number | null
          applovin_platform_revenue?: number | null
          applovin_platform_synced_at?: string | null
        }
        Relationships: []
      }
      associated_orders: {
        Row: {
          id: string
          conversation_id: string
          source: string
          source_order_id: string
          order_number: string | null
          order_date: string | null
          total: number | null
          refunded: number | null
          refund_date: string | null
          financial_status: string | null
          fulfillment_status: string | null
          order_type: string | null
          shopify_tags: string | null
          is_primary: boolean | null
        }
        Insert: {
          id: string
          conversation_id: string
          source: string
          source_order_id: string
          order_number?: string | null
          order_date?: string | null
          total?: number | null
          refunded?: number | null
          refund_date?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          order_type?: string | null
          shopify_tags?: string | null
          is_primary?: boolean | null
        }
        Update: {
          id?: string
          conversation_id?: string
          source?: string
          source_order_id?: string
          order_number?: string | null
          order_date?: string | null
          total?: number | null
          refunded?: number | null
          refund_date?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          order_type?: string | null
          shopify_tags?: string | null
          is_primary?: boolean | null
        }
        Relationships: []
      }
      audience_templates: {
        Row: {
          id: string
          name: string
          meta_account_id: string | null
          pixel_id: string | null
          targeting: Json
          notes: string | null
          created_at: string
          include_audiences: Json | null
          exclude_audiences: Json | null
        }
        Insert: {
          id: string
          name: string
          meta_account_id?: string | null
          pixel_id?: string | null
          targeting: Json
          notes?: string | null
          created_at: string
          include_audiences?: Json | null
          exclude_audiences?: Json | null
        }
        Update: {
          id?: string
          name?: string
          meta_account_id?: string | null
          pixel_id?: string | null
          targeting?: Json
          notes?: string | null
          created_at?: string
          include_audiences?: Json | null
          exclude_audiences?: Json | null
        }
        Relationships: []
      }
      avatar_generations: {
        Row: {
          id: string
          status: string
          variant_count: number
          reference_image_url: string | null
          description: string | null
          result_images: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          status: string
          variant_count: number
          reference_image_url?: string | null
          description?: string | null
          result_images?: Json | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          status?: string
          variant_count?: number
          reference_image_url?: string | null
          description?: string | null
          result_images?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      avatars: {
        Row: {
          id: string
          name: string
          image_url: string
          description: string | null
          created_at: string
          updated_at: string
          heygen_avatar_id: string | null
          heygen_voice_id: string | null
          is_configure: boolean | null
          voice_name: string | null
          quality_status: string | null
          avatar_type_override: string | null
          avatar_type: string | null
          gender: string | null
          gender_confidence: number | null
          gender_inferred_at: string | null
          is_deleted: boolean
          elevenlabs_voice_id: string | null
          voice_clone_status: string | null
          voice_clone_error: string | null
          is_error: boolean | null
          voice_speed: number | null
        }
        Insert: {
          id: string
          name: string
          image_url: string
          description?: string | null
          created_at: string
          updated_at: string
          heygen_avatar_id?: string | null
          heygen_voice_id?: string | null
          is_configure?: boolean | null
          voice_name?: string | null
          quality_status?: string | null
          avatar_type_override?: string | null
          avatar_type?: string | null
          gender?: string | null
          gender_confidence?: number | null
          gender_inferred_at?: string | null
          is_deleted: boolean
          elevenlabs_voice_id?: string | null
          voice_clone_status?: string | null
          voice_clone_error?: string | null
          is_error?: boolean | null
          voice_speed?: number | null
        }
        Update: {
          id?: string
          name?: string
          image_url?: string
          description?: string | null
          created_at?: string
          updated_at?: string
          heygen_avatar_id?: string | null
          heygen_voice_id?: string | null
          is_configure?: boolean | null
          voice_name?: string | null
          quality_status?: string | null
          avatar_type_override?: string | null
          avatar_type?: string | null
          gender?: string | null
          gender_confidence?: number | null
          gender_inferred_at?: string | null
          is_deleted?: boolean
          elevenlabs_voice_id?: string | null
          voice_clone_status?: string | null
          voice_clone_error?: string | null
          is_error?: boolean | null
          voice_speed?: number | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          id: string
          name: string
          black_logo_url: string | null
          white_logo_url: string | null
          status: string
          created_at: string
          updated_at: string
          brand_code: string
          main_cs: string[] | null
          secondary_cs: string[] | null
          main_editor: string[] | null
          secondary_editor: string[] | null
          default_meta_account_id: string | null
          default_audience_template: string | null
          default_call_to_action: string | null
          default_primary_text: string | null
          deleted_at: string | null
          notes: string | null
        }
        Insert: {
          id: string
          name: string
          black_logo_url?: string | null
          white_logo_url?: string | null
          status: string
          created_at: string
          updated_at: string
          brand_code: string
          main_cs?: string[] | null
          secondary_cs?: string[] | null
          main_editor?: string[] | null
          secondary_editor?: string[] | null
          default_meta_account_id?: string | null
          default_audience_template?: string | null
          default_call_to_action?: string | null
          default_primary_text?: string | null
          deleted_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          name?: string
          black_logo_url?: string | null
          white_logo_url?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          brand_code?: string
          main_cs?: string[] | null
          secondary_cs?: string[] | null
          main_editor?: string[] | null
          secondary_editor?: string[] | null
          default_meta_account_id?: string | null
          default_audience_template?: string | null
          default_call_to_action?: string | null
          default_primary_text?: string | null
          deleted_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_key: string
          display_name: string
          description: string | null
          total_count: number | null
          refunded_count: number | null
          total_order_value: number | null
          total_refund_value: number | null
          avg_refund_pct_when_refunded: number | null
        }
        Insert: {
          category_key: string
          display_name: string
          description?: string | null
          total_count?: number | null
          refunded_count?: number | null
          total_order_value?: number | null
          total_refund_value?: number | null
          avg_refund_pct_when_refunded?: number | null
        }
        Update: {
          category_key?: string
          display_name?: string
          description?: string | null
          total_count?: number | null
          refunded_count?: number | null
          total_order_value?: number | null
          total_refund_value?: number | null
          avg_refund_pct_when_refunded?: number | null
        }
        Relationships: []
      }
      conversation_orders: {
        Row: {
          conversation_id: string
          order_id: string
          is_primary: boolean
        }
        Insert: {
          conversation_id: string
          order_id: string
          is_primary: boolean
        }
        Update: {
          conversation_id?: string
          order_id?: string
          is_primary?: boolean
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          brand_key: string
          richpanel_ticket_id: string
          conversation_no: number | null
          customer_email: string | null
          customer_name: string | null
          subject: string | null
          status: string | null
          priority: string | null
          recipient: string | null
          created_at: string | null
          updated_at: string | null
          closed_at: string | null
          category: string | null
          category_confidence: string | null
          primary_order_number: string | null
          primary_order_tag: string | null
          summary_about: string | null
          summary_highlights: string | null
          total_order_value: number | null
          total_refunded: number | null
          refund_pct: number | null
          source_first_message_excerpt: string | null
          customer_intent: string | null
          first_response: string | null
          final_outcome: string | null
          classification_notes: string | null
          assignee_id: string | null
          first_response_seconds: number | null
          first_response_at: string | null
          comment_count: number | null
          has_human_response: boolean | null
          first_human_seconds: number | null
          had_auto_reply: boolean | null
          human_response_count: number | null
          last_classified_at: string | null
          classification_version: number
          comment_count_at_classification: number | null
        }
        Insert: {
          id: string
          brand_key: string
          richpanel_ticket_id: string
          conversation_no?: number | null
          customer_email?: string | null
          customer_name?: string | null
          subject?: string | null
          status?: string | null
          priority?: string | null
          recipient?: string | null
          created_at?: string | null
          updated_at?: string | null
          closed_at?: string | null
          category?: string | null
          category_confidence?: string | null
          primary_order_number?: string | null
          primary_order_tag?: string | null
          summary_about?: string | null
          summary_highlights?: string | null
          total_order_value?: number | null
          total_refunded?: number | null
          refund_pct?: number | null
          source_first_message_excerpt?: string | null
          customer_intent?: string | null
          first_response?: string | null
          final_outcome?: string | null
          classification_notes?: string | null
          assignee_id?: string | null
          first_response_seconds?: number | null
          first_response_at?: string | null
          comment_count?: number | null
          has_human_response?: boolean | null
          first_human_seconds?: number | null
          had_auto_reply?: boolean | null
          human_response_count?: number | null
          last_classified_at?: string | null
          classification_version: number
          comment_count_at_classification?: number | null
        }
        Update: {
          id?: string
          brand_key?: string
          richpanel_ticket_id?: string
          conversation_no?: number | null
          customer_email?: string | null
          customer_name?: string | null
          subject?: string | null
          status?: string | null
          priority?: string | null
          recipient?: string | null
          created_at?: string | null
          updated_at?: string | null
          closed_at?: string | null
          category?: string | null
          category_confidence?: string | null
          primary_order_number?: string | null
          primary_order_tag?: string | null
          summary_about?: string | null
          summary_highlights?: string | null
          total_order_value?: number | null
          total_refunded?: number | null
          refund_pct?: number | null
          source_first_message_excerpt?: string | null
          customer_intent?: string | null
          first_response?: string | null
          final_outcome?: string | null
          classification_notes?: string | null
          assignee_id?: string | null
          first_response_seconds?: number | null
          first_response_at?: string | null
          comment_count?: number | null
          has_human_response?: boolean | null
          first_human_seconds?: number | null
          had_auto_reply?: boolean | null
          human_response_count?: number | null
          last_classified_at?: string | null
          classification_version?: number
          comment_count_at_classification?: number | null
        }
        Relationships: []
      }
      creative_templates: {
        Row: {
          id: string
          name: string
          product_id: string | null
          funnel: string | null
          is_default: boolean
          template_data: Json
          notes: string | null
          created_at: string
          asset_type: string | null
          call_to_action: string | null
          primary_text: string | null
          headline: string | null
          description: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          name: string
          product_id?: string | null
          funnel?: string | null
          is_default: boolean
          template_data: Json
          notes?: string | null
          created_at: string
          asset_type?: string | null
          call_to_action?: string | null
          primary_text?: string | null
          headline?: string | null
          description?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          product_id?: string | null
          funnel?: string | null
          is_default?: boolean
          template_data?: Json
          notes?: string | null
          created_at?: string
          asset_type?: string | null
          call_to_action?: string | null
          primary_text?: string | null
          headline?: string | null
          description?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      credentials: {
        Row: {
          id: number
          created_at: string
          access_token: string | null
          refresh_token: string | null
          client_id: string | null
          client_secret: string | null
        }
        Insert: {
          id: number
          created_at: string
          access_token?: string | null
          refresh_token?: string | null
          client_id?: string | null
          client_secret?: string | null
        }
        Update: {
          id?: number
          created_at?: string
          access_token?: string | null
          refresh_token?: string | null
          client_id?: string | null
          client_secret?: string | null
        }
        Relationships: []
      }
      cs_config: {
        Row: {
          id: string
          created_at: string
          label: string | null
          value: string | null
          clickup_user_id: string | null
        }
        Insert: {
          id: string
          created_at: string
          label?: string | null
          value?: string | null
          clickup_user_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          label?: string | null
          value?: string | null
          clickup_user_id?: string | null
        }
        Relationships: []
      }
      cs_kpi_angles: {
        Row: {
          id: string
          product_id: string
          name: string
          angle_key: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          name: string
          angle_key: string
          sort_order: number
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          name?: string
          angle_key?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      cs_kpi_cs: {
        Row: {
          id: string
          product_id: string
          cs_label: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          cs_label: string
          sort_order: number
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          cs_label?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      cs_kpi_sub_angles: {
        Row: {
          id: string
          product_id: string
          angle_id: string
          name: string
          sub_angle_key: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          angle_id: string
          name: string
          sub_angle_key: string
          sort_order: number
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          angle_id?: string
          name?: string
          sub_angle_key?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      cs_kpi_targets: {
        Row: {
          id: string
          product_id: string
          angle_key: string
          sub_angle_key: string
          cs_label: string
          batch_week: string
          target: number | null
          updated_by: string | null
          updated_at: string
          edit_type: string
        }
        Insert: {
          id: string
          product_id: string
          angle_key: string
          sub_angle_key: string
          cs_label: string
          batch_week: string
          target?: number | null
          updated_by?: string | null
          updated_at: string
          edit_type: string
        }
        Update: {
          id?: string
          product_id?: string
          angle_key?: string
          sub_angle_key?: string
          cs_label?: string
          batch_week?: string
          target?: number | null
          updated_by?: string | null
          updated_at?: string
          edit_type?: string
        }
        Relationships: []
      }
      csr_brands: {
        Row: {
          brand_key: string
          display_name: string
          shopify_domain: string
          storefront_url: string
          support_email: string
          ckc_campaign_id: number | null
          ckc_campaign_name: string | null
          uses_ckc_subscriptions: boolean | null
          uses_loop_subscriptions: boolean | null
          active: boolean | null
          created_at: string | null
        }
        Insert: {
          brand_key: string
          display_name: string
          shopify_domain: string
          storefront_url: string
          support_email: string
          ckc_campaign_id?: number | null
          ckc_campaign_name?: string | null
          uses_ckc_subscriptions?: boolean | null
          uses_loop_subscriptions?: boolean | null
          active?: boolean | null
          created_at?: string | null
        }
        Update: {
          brand_key?: string
          display_name?: string
          shopify_domain?: string
          storefront_url?: string
          support_email?: string
          ckc_campaign_id?: number | null
          ckc_campaign_name?: string | null
          uses_ckc_subscriptions?: boolean | null
          uses_loop_subscriptions?: boolean | null
          active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      csr_conversations: {
        Row: {
          id: string
          brand_key: string
          customer_id: string | null
          richpanel_ticket_id: string
          conversation_no: number | null
          subject: string | null
          status: string | null
          priority: string | null
          channel: string | null
          recipient: string | null
          assignee_id: string | null
          tags: string[] | null
          message_count: number | null
          first_response_duration_ms: number | null
          resolution_duration_ms: number | null
          created_at: string | null
          updated_at: string | null
          first_response_at: string | null
          closed_at: string | null
          synced_at: string | null
        }
        Insert: {
          id: string
          brand_key: string
          customer_id?: string | null
          richpanel_ticket_id: string
          conversation_no?: number | null
          subject?: string | null
          status?: string | null
          priority?: string | null
          channel?: string | null
          recipient?: string | null
          assignee_id?: string | null
          tags?: string[] | null
          message_count?: number | null
          first_response_duration_ms?: number | null
          resolution_duration_ms?: number | null
          created_at?: string | null
          updated_at?: string | null
          first_response_at?: string | null
          closed_at?: string | null
          synced_at?: string | null
        }
        Update: {
          id?: string
          brand_key?: string
          customer_id?: string | null
          richpanel_ticket_id?: string
          conversation_no?: number | null
          subject?: string | null
          status?: string | null
          priority?: string | null
          channel?: string | null
          recipient?: string | null
          assignee_id?: string | null
          tags?: string[] | null
          message_count?: number | null
          first_response_duration_ms?: number | null
          resolution_duration_ms?: number | null
          created_at?: string | null
          updated_at?: string | null
          first_response_at?: string | null
          closed_at?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      csr_customers: {
        Row: {
          id: string
          brand_key: string
          email: string
          name: string | null
          shopify_customer_id: string | null
          ckc_customer_id: string | null
          richpanel_profile_id: string | null
          first_seen_at: string | null
          last_seen_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          brand_key: string
          email: string
          name?: string | null
          shopify_customer_id?: string | null
          ckc_customer_id?: string | null
          richpanel_profile_id?: string | null
          first_seen_at?: string | null
          last_seen_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          brand_key?: string
          email?: string
          name?: string | null
          shopify_customer_id?: string | null
          ckc_customer_id?: string | null
          richpanel_profile_id?: string | null
          first_seen_at?: string | null
          last_seen_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      csr_messages: {
        Row: {
          id: string
          conversation_id: string
          brand_key: string
          source_message_id: string
          author_id: string | null
          is_operator: boolean | null
          body_plain: string | null
          body_html: string | null
          channel: string | null
          created_at: string
          synced_at: string | null
        }
        Insert: {
          id: string
          conversation_id: string
          brand_key: string
          source_message_id: string
          author_id?: string | null
          is_operator?: boolean | null
          body_plain?: string | null
          body_html?: string | null
          channel?: string | null
          created_at: string
          synced_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          brand_key?: string
          source_message_id?: string
          author_id?: string | null
          is_operator?: boolean | null
          body_plain?: string | null
          body_html?: string | null
          channel?: string | null
          created_at?: string
          synced_at?: string | null
        }
        Relationships: []
      }
      csr_orders: {
        Row: {
          id: string
          brand_key: string
          customer_id: string | null
          source: string
          source_order_id: string
          order_number: string | null
          order_date: string | null
          total: number | null
          refunded: number | null
          financial_status: string | null
          refund_date: string | null
          order_type: string | null
          tags: string[] | null
          raw: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          brand_key: string
          customer_id?: string | null
          source: string
          source_order_id: string
          order_number?: string | null
          order_date?: string | null
          total?: number | null
          refunded?: number | null
          financial_status?: string | null
          refund_date?: string | null
          order_type?: string | null
          tags?: string[] | null
          raw?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          brand_key?: string
          customer_id?: string | null
          source?: string
          source_order_id?: string
          order_number?: string | null
          order_date?: string | null
          total?: number | null
          refunded?: number | null
          financial_status?: string | null
          refund_date?: string | null
          order_type?: string | null
          tags?: string[] | null
          raw?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      csr_refund_reason_categories: {
        Row: {
          category_key: string
          label: string
          description: string | null
          patterns: string[] | null
          sort_order: number | null
        }
        Insert: {
          category_key: string
          label: string
          description?: string | null
          patterns?: string[] | null
          sort_order?: number | null
        }
        Update: {
          category_key?: string
          label?: string
          description?: string | null
          patterns?: string[] | null
          sort_order?: number | null
        }
        Relationships: []
      }
      csr_subscriptions: {
        Row: {
          id: string
          brand_key: string
          customer_id: string | null
          source: string
          source_subscription_id: string
          status: string | null
          cycle_count: number | null
          amount: number | null
          currency: string | null
          product_titles: string[] | null
          started_at: string | null
          cancelled_at: string | null
          next_bill_at: string | null
          raw: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          brand_key: string
          customer_id?: string | null
          source: string
          source_subscription_id: string
          status?: string | null
          cycle_count?: number | null
          amount?: number | null
          currency?: string | null
          product_titles?: string[] | null
          started_at?: string | null
          cancelled_at?: string | null
          next_bill_at?: string | null
          raw?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          brand_key?: string
          customer_id?: string | null
          source?: string
          source_subscription_id?: string
          status?: string | null
          cycle_count?: number | null
          amount?: number | null
          currency?: string | null
          product_titles?: string[] | null
          started_at?: string | null
          cancelled_at?: string | null
          next_bill_at?: string | null
          raw?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      csr_sync_jobs: {
        Row: {
          job_key: string
          brand_key: string | null
          source: string
          last_synced_at: string | null
          last_cursor: string | null
          last_status: string | null
          last_error: string | null
          rows_last_run: number | null
          updated_at: string | null
        }
        Insert: {
          job_key: string
          brand_key?: string | null
          source: string
          last_synced_at?: string | null
          last_cursor?: string | null
          last_status?: string | null
          last_error?: string | null
          rows_last_run?: number | null
          updated_at?: string | null
        }
        Update: {
          job_key?: string
          brand_key?: string | null
          source?: string
          last_synced_at?: string | null
          last_cursor?: string | null
          last_status?: string | null
          last_error?: string | null
          rows_last_run?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          id: string
          created_at: string
          name: string | null
          options: Json | null
          is_add_in_clickup: boolean | null
          clickup_id: string | null
          type: string | null
          is_update_in_cron: boolean | null
          ads_col_name: string | null
          static_log_col_name: string | null
          contains: Json | null
          is_show_as_link: boolean | null
          is_editable_fields: boolean | null
          width: number | null
          order: number | null
          is_multi_select: boolean | null
          is_option_product_level: boolean | null
        }
        Insert: {
          id: string
          created_at: string
          name?: string | null
          options?: Json | null
          is_add_in_clickup?: boolean | null
          clickup_id?: string | null
          type?: string | null
          is_update_in_cron?: boolean | null
          ads_col_name?: string | null
          static_log_col_name?: string | null
          contains?: Json | null
          is_show_as_link?: boolean | null
          is_editable_fields?: boolean | null
          width?: number | null
          order?: number | null
          is_multi_select?: boolean | null
          is_option_product_level?: boolean | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string | null
          options?: Json | null
          is_add_in_clickup?: boolean | null
          clickup_id?: string | null
          type?: string | null
          is_update_in_cron?: boolean | null
          ads_col_name?: string | null
          static_log_col_name?: string | null
          contains?: Json | null
          is_show_as_link?: boolean | null
          is_editable_fields?: boolean | null
          width?: number | null
          order?: number | null
          is_multi_select?: boolean | null
          is_option_product_level?: boolean | null
        }
        Relationships: []
      }
      daily_summary: {
        Row: {
          id: number
          store_id: string | null
          date: string
          total_revenue: number | null
          total_ad_spend: number | null
          cogs: number | null
          shipping_cost_paid: number | null
          refunds: number | null
          payment_processing: number | null
          gross_profit: number | null
          net_profit: number | null
          nc_revenue: number | null
          nc_orders: number | null
          nc_aov: number | null
          nc_roas: number | null
          nc_subs_revenue: number | null
          returning_revenue: number | null
          returning_orders: number | null
          rebuild_revenue: number | null
          rebuild_orders: number | null
          total_roas: number | null
          computed_at: string | null
        }
        Insert: {
          id: number
          store_id?: string | null
          date: string
          total_revenue?: number | null
          total_ad_spend?: number | null
          cogs?: number | null
          shipping_cost_paid?: number | null
          refunds?: number | null
          payment_processing?: number | null
          gross_profit?: number | null
          net_profit?: number | null
          nc_revenue?: number | null
          nc_orders?: number | null
          nc_aov?: number | null
          nc_roas?: number | null
          nc_subs_revenue?: number | null
          returning_revenue?: number | null
          returning_orders?: number | null
          rebuild_revenue?: number | null
          rebuild_orders?: number | null
          total_roas?: number | null
          computed_at?: string | null
        }
        Update: {
          id?: number
          store_id?: string | null
          date?: string
          total_revenue?: number | null
          total_ad_spend?: number | null
          cogs?: number | null
          shipping_cost_paid?: number | null
          refunds?: number | null
          payment_processing?: number | null
          gross_profit?: number | null
          net_profit?: number | null
          nc_revenue?: number | null
          nc_orders?: number | null
          nc_aov?: number | null
          nc_roas?: number | null
          nc_subs_revenue?: number | null
          returning_revenue?: number | null
          returning_orders?: number | null
          rebuild_revenue?: number | null
          rebuild_orders?: number | null
          total_roas?: number | null
          computed_at?: string | null
        }
        Relationships: []
      }
      dashboard_shopify_data: {
        Row: {
          id: string
          created_at: string
          brand: string | null
          order_number: number | null
          order_date: string | null
          refund_date: string | null
          financial_status: string | null
          total: number | null
          refunded: number | null
          order_type: string | null
          tags: string | null
        }
        Insert: {
          id: string
          created_at: string
          brand?: string | null
          order_number?: number | null
          order_date?: string | null
          refund_date?: string | null
          financial_status?: string | null
          total?: number | null
          refunded?: number | null
          order_type?: string | null
          tags?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          brand?: string | null
          order_number?: number | null
          order_date?: string | null
          refund_date?: string | null
          financial_status?: string | null
          total?: number | null
          refunded?: number | null
          order_type?: string | null
          tags?: string | null
        }
        Relationships: []
      }
      destination_urls: {
        Row: {
          id: string
          product_id: string | null
          url: string
          funnel: string | null
          platform: string | null
          is_default: boolean
          notes: string | null
          created_at: string
          name: string | null
          preview_url: string | null
        }
        Insert: {
          id: string
          product_id?: string | null
          url: string
          funnel?: string | null
          platform?: string | null
          is_default: boolean
          notes?: string | null
          created_at: string
          name?: string | null
          preview_url?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          url?: string
          funnel?: string | null
          platform?: string | null
          is_default?: boolean
          notes?: string | null
          created_at?: string
          name?: string | null
          preview_url?: string | null
        }
        Relationships: []
      }
      fb_ads_data: {
        Row: {
          id: string
          created_at: string
          ad_id: string | null
          launch_date: string | null
        }
        Insert: {
          id: string
          created_at: string
          ad_id?: string | null
          launch_date?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          ad_id?: string | null
          launch_date?: string | null
        }
        Relationships: []
      }
      fb_pages: {
        Row: {
          id: string
          name: string
          page_id: string
          meta_account_id: string | null
          product_id: string | null
          notes: string | null
          created_at: string
          helper_copy: string | null
        }
        Insert: {
          id: string
          name: string
          page_id: string
          meta_account_id?: string | null
          product_id?: string | null
          notes?: string | null
          created_at: string
          helper_copy?: string | null
        }
        Update: {
          id?: string
          name?: string
          page_id?: string
          meta_account_id?: string | null
          product_id?: string | null
          notes?: string | null
          created_at?: string
          helper_copy?: string | null
        }
        Relationships: []
      }
      form_templates: {
        Row: {
          id: string
          name: string
          funnel: string
          brand_id: string | null
          product_id: string | null
          cs: string | null
          concept_name: string | null
          title: string | null
          subtitle: string | null
          design_elements: string | null
          prompt_for_images: string | null
          number_of_ads: string | null
          max_variations_per_ad_group: string | null
          logo_name: string | null
          is_cta_button: boolean | null
          cta_button_text: string | null
          is_multiple: boolean | null
          is_badge: boolean | null
          badge_text: string | null
          inspo_ids: string[] | null
          selected_image_urls: string[] | null
          created_at: string
          updated_at: string
          products_to_show: string | null
        }
        Insert: {
          id: string
          name: string
          funnel: string
          brand_id?: string | null
          product_id?: string | null
          cs?: string | null
          concept_name?: string | null
          title?: string | null
          subtitle?: string | null
          design_elements?: string | null
          prompt_for_images?: string | null
          number_of_ads?: string | null
          max_variations_per_ad_group?: string | null
          logo_name?: string | null
          is_cta_button?: boolean | null
          cta_button_text?: string | null
          is_multiple?: boolean | null
          is_badge?: boolean | null
          badge_text?: string | null
          inspo_ids?: string[] | null
          selected_image_urls?: string[] | null
          created_at: string
          updated_at: string
          products_to_show?: string | null
        }
        Update: {
          id?: string
          name?: string
          funnel?: string
          brand_id?: string | null
          product_id?: string | null
          cs?: string | null
          concept_name?: string | null
          title?: string | null
          subtitle?: string | null
          design_elements?: string | null
          prompt_for_images?: string | null
          number_of_ads?: string | null
          max_variations_per_ad_group?: string | null
          logo_name?: string | null
          is_cta_button?: boolean | null
          cta_button_text?: string | null
          is_multiple?: boolean | null
          is_badge?: boolean | null
          badge_text?: string | null
          inspo_ids?: string[] | null
          selected_image_urls?: string[] | null
          created_at?: string
          updated_at?: string
          products_to_show?: string | null
        }
        Relationships: []
      }
      frameio_oauth: {
        Row: {
          id: number
          access_token: string | null
          refresh_token: string | null
          expires_at: string | null
          scope: string | null
          user_email: string | null
          account_id: string | null
          updated_at: string
        }
        Insert: {
          id: number
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          scope?: string | null
          user_email?: string | null
          account_id?: string | null
          updated_at: string
        }
        Update: {
          id?: number
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          scope?: string | null
          user_email?: string | null
          account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      "framer-auth": {
        Row: {
          id: string
          created_at: string
          access_token: string | null
          refresh_token: string | null
          expires_in: string | null
          expires_at: string | null
        }
        Insert: {
          id: string
          created_at: string
          access_token?: string | null
          refresh_token?: string | null
          expires_in?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          access_token?: string | null
          refresh_token?: string | null
          expires_in?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
      generation_logs: {
        Row: {
          id: string
          row_name: string
          status: string
          brand_id: string | null
          brand_name: string
          product_id: string | null
          product_name: string
          theme_id: string | null
          theme_name: string
          variant: string
          cs: string | null
          concept_name: string | null
          prompt: string | null
          selected_images: Json | null
          drive_link: string | null
          language: string | null
          batch_week: string | null
          generation_date: string
          generation_timestamp: string
          created_at: string
          updated_at: string
          display_id: number
          file_naming_convention: string | null
          inspo_links: string[] | null
        }
        Insert: {
          id: string
          row_name: string
          status: string
          brand_id?: string | null
          brand_name: string
          product_id?: string | null
          product_name: string
          theme_id?: string | null
          theme_name: string
          variant: string
          cs?: string | null
          concept_name?: string | null
          prompt?: string | null
          selected_images?: Json | null
          drive_link?: string | null
          language?: string | null
          batch_week?: string | null
          generation_date: string
          generation_timestamp: string
          created_at: string
          updated_at: string
          display_id: number
          file_naming_convention?: string | null
          inspo_links?: string[] | null
        }
        Update: {
          id?: string
          row_name?: string
          status?: string
          brand_id?: string | null
          brand_name?: string
          product_id?: string | null
          product_name?: string
          theme_id?: string | null
          theme_name?: string
          variant?: string
          cs?: string | null
          concept_name?: string | null
          prompt?: string | null
          selected_images?: Json | null
          drive_link?: string | null
          language?: string | null
          batch_week?: string | null
          generation_date?: string
          generation_timestamp?: string
          created_at?: string
          updated_at?: string
          display_id?: number
          file_naming_convention?: string | null
          inspo_links?: string[] | null
        }
        Relationships: []
      }
      guardrails: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string | null
          updated_at: string | null
          funnel: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          funnel: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          funnel?: string
        }
        Relationships: []
      }
      heygen_renders: {
        Row: {
          id: number
          dedup_key: string
          run_id: string
          generation_id: string | null
          avatar_id: string | null
          clip_slot: string | null
          attempt_no: number
          state: string
          heygen_video_id: string | null
          worker_id: string | null
          claim_lease_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          id: number
          dedup_key: string
          run_id: string
          generation_id?: string | null
          avatar_id?: string | null
          clip_slot?: string | null
          attempt_no: number
          state: string
          heygen_video_id?: string | null
          worker_id?: string | null
          claim_lease_at?: string | null
          last_error?: string | null
          created_at: string
          updated_at: string
          user_id?: string | null
        }
        Update: {
          id?: number
          dedup_key?: string
          run_id?: string
          generation_id?: string | null
          avatar_id?: string | null
          clip_slot?: string | null
          attempt_no?: number
          state?: string
          heygen_video_id?: string | null
          worker_id?: string | null
          claim_lease_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ig_accounts: {
        Row: {
          id: string
          name: string
          instagram_id: string
          handle: string | null
          meta_account_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          instagram_id: string
          handle?: string | null
          meta_account_id?: string | null
          notes?: string | null
          created_at: string
        }
        Update: {
          id?: string
          name?: string
          instagram_id?: string
          handle?: string | null
          meta_account_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      important_resources: {
        Row: {
          id: string
          category: string
          subcategory: string | null
          name: string
          resource_type: string
          platform: string
          url: string | null
          value_json: Json | null
          description: string | null
          is_secret: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          category: string
          subcategory?: string | null
          name: string
          resource_type: string
          platform: string
          url?: string | null
          value_json?: Json | null
          description?: string | null
          is_secret: boolean
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          category?: string
          subcategory?: string | null
          name?: string
          resource_type?: string
          platform?: string
          url?: string | null
          value_json?: Json | null
          description?: string | null
          is_secret?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inspos: {
        Row: {
          id: string
          name: string
          drive_link: string
          created_at: string
          updated_at: string
          funnel_type: string[]
          inspo_brief: Json | null
          inspo_brief_status: string | null
        }
        Insert: {
          id: string
          name: string
          drive_link: string
          created_at: string
          updated_at: string
          funnel_type: string[]
          inspo_brief?: Json | null
          inspo_brief_status?: string | null
        }
        Update: {
          id?: string
          name?: string
          drive_link?: string
          created_at?: string
          updated_at?: string
          funnel_type?: string[]
          inspo_brief?: Json | null
          inspo_brief_status?: string | null
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          id: number
          job_name: string
          started_at: string | null
          finished_at: string
          status: string
          rows_updated: number | null
          products: Json | null
          counts: Json | null
          error: string | null
          meta: Json | null
          created_at: string
        }
        Insert: {
          id: number
          job_name: string
          started_at?: string | null
          finished_at: string
          status: string
          rows_updated?: number | null
          products?: Json | null
          counts?: Json | null
          error?: string | null
          meta?: Json | null
          created_at: string
        }
        Update: {
          id?: number
          job_name?: string
          started_at?: string | null
          finished_at?: string
          status?: string
          rows_updated?: number | null
          products?: Json | null
          counts?: Json | null
          error?: string | null
          meta?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      label_meta: {
        Row: {
          bucket_key: string
          bucket_layer: string
          display_name: string
          explanation: string
        }
        Insert: {
          bucket_key: string
          bucket_layer: string
          display_name: string
          explanation: string
        }
        Update: {
          bucket_key?: string
          bucket_layer?: string
          display_name?: string
          explanation?: string
        }
        Relationships: []
      }
      launch_audit_log: {
        Row: {
          id: number
          package_id: string | null
          actor: string | null
          action: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id: number
          package_id?: string | null
          actor?: string | null
          action?: string | null
          details: Json
          created_at: string
        }
        Update: {
          id?: number
          package_id?: string | null
          actor?: string | null
          action?: string | null
          details?: Json
          created_at?: string
        }
        Relationships: []
      }
      launch_jobs: {
        Row: {
          id: string
          package_id: string
          platform: string
          status: string
          run_at: string
          actor: string | null
          attempts: number
          max_attempts: number
          claimed_at: string | null
          lease_until: string | null
          worker_id: string | null
          total: number | null
          completed: number
          failed: number
          current_step: string | null
          result: Json | null
          error: string | null
          source: string | null
          brand_id: string | null
          product_id: string | null
          ad_id: string | null
          started_at: string | null
          finished_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          package_id: string
          platform: string
          status: string
          run_at: string
          actor?: string | null
          attempts: number
          max_attempts: number
          claimed_at?: string | null
          lease_until?: string | null
          worker_id?: string | null
          total?: number | null
          completed: number
          failed: number
          current_step?: string | null
          result?: Json | null
          error?: string | null
          source?: string | null
          brand_id?: string | null
          product_id?: string | null
          ad_id?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          package_id?: string
          platform?: string
          status?: string
          run_at?: string
          actor?: string | null
          attempts?: number
          max_attempts?: number
          claimed_at?: string | null
          lease_until?: string | null
          worker_id?: string | null
          total?: number | null
          completed?: number
          failed?: number
          current_step?: string | null
          result?: Json | null
          error?: string | null
          source?: string | null
          brand_id?: string | null
          product_id?: string | null
          ad_id?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      launch_packages: {
        Row: {
          id: string
          brand_id: string | null
          product_id: string | null
          meta_account_id: string | null
          name: string
          ad_id: string | null
          status: string
          platform: string | null
          funnel: string | null
          operator_notes: string | null
          created_by: string | null
          tags: Json
          meta_upload_status: string | null
          applovin_upload_status: string | null
          meta_launched_count: number | null
          meta_rejected_count: number | null
          applovin_launched_count: number | null
          applovin_rejected_count: number | null
          meta_launched_at: string | null
          applovin_launched_at: string | null
          scheduled_for: string | null
          scheduled_fired_at: string | null
          clickup_task_url: string | null
          existing_campaign_id: string | null
          archived_at: string | null
          deleted_at: string | null
          created_at: string
          audience_template: string | null
          asset_type: string | null
          frameio_folder_url: string | null
          frameio_folder_url_suggested: string | null
          ad_set_name_override: string | null
          apply_to_all_ad_copy: boolean | null
          campaign_mode: string | null
          campaign_name: string | null
          existing_campaign_name: string | null
          existing_adset_id: string | null
          existing_adset_name: string | null
          campaign_objective: string | null
          buying_type: string | null
          budget_type: string | null
          budget_amount: number | null
          optimization_goal: string | null
          attribution_setting: string | null
          placement_mode: string | null
          manual_placements: Json | null
          launch_paused: boolean | null
          targeting_template_id: string | null
          targeting_age_min: number | null
          targeting_age_max: number | null
          targeting_genders: Json | null
          targeting_include_audience_ids: Json | null
          targeting_exclude_audience_ids: Json | null
          audience_template_id: string | null
          pixel_id: string | null
          fb_page_id: string | null
          ig_account_id: string | null
          creative_template_id: string | null
          launched_count: number | null
          rejected_count: number | null
          meta_campaign_id: string | null
          meta_adset_id: string | null
          bid_amount: number | null
          tracking_action_type: string | null
          meta_campaign_effective_status: string | null
          meta_adset_effective_status: string | null
          meta_status_synced_at: string | null
          applovin_campaign_id: string | null
          applovin_build_mode: string
          applovin_source_creative_set_id: string | null
          applovin_source_end_card_asset_id: string | null
        }
        Insert: {
          id: string
          brand_id?: string | null
          product_id?: string | null
          meta_account_id?: string | null
          name: string
          ad_id?: string | null
          status: string
          platform?: string | null
          funnel?: string | null
          operator_notes?: string | null
          created_by?: string | null
          tags: Json
          meta_upload_status?: string | null
          applovin_upload_status?: string | null
          meta_launched_count?: number | null
          meta_rejected_count?: number | null
          applovin_launched_count?: number | null
          applovin_rejected_count?: number | null
          meta_launched_at?: string | null
          applovin_launched_at?: string | null
          scheduled_for?: string | null
          scheduled_fired_at?: string | null
          clickup_task_url?: string | null
          existing_campaign_id?: string | null
          archived_at?: string | null
          deleted_at?: string | null
          created_at: string
          audience_template?: string | null
          asset_type?: string | null
          frameio_folder_url?: string | null
          frameio_folder_url_suggested?: string | null
          ad_set_name_override?: string | null
          apply_to_all_ad_copy?: boolean | null
          campaign_mode?: string | null
          campaign_name?: string | null
          existing_campaign_name?: string | null
          existing_adset_id?: string | null
          existing_adset_name?: string | null
          campaign_objective?: string | null
          buying_type?: string | null
          budget_type?: string | null
          budget_amount?: number | null
          optimization_goal?: string | null
          attribution_setting?: string | null
          placement_mode?: string | null
          manual_placements?: Json | null
          launch_paused?: boolean | null
          targeting_template_id?: string | null
          targeting_age_min?: number | null
          targeting_age_max?: number | null
          targeting_genders?: Json | null
          targeting_include_audience_ids?: Json | null
          targeting_exclude_audience_ids?: Json | null
          audience_template_id?: string | null
          pixel_id?: string | null
          fb_page_id?: string | null
          ig_account_id?: string | null
          creative_template_id?: string | null
          launched_count?: number | null
          rejected_count?: number | null
          meta_campaign_id?: string | null
          meta_adset_id?: string | null
          bid_amount?: number | null
          tracking_action_type?: string | null
          meta_campaign_effective_status?: string | null
          meta_adset_effective_status?: string | null
          meta_status_synced_at?: string | null
          applovin_campaign_id?: string | null
          applovin_build_mode: string
          applovin_source_creative_set_id?: string | null
          applovin_source_end_card_asset_id?: string | null
        }
        Update: {
          id?: string
          brand_id?: string | null
          product_id?: string | null
          meta_account_id?: string | null
          name?: string
          ad_id?: string | null
          status?: string
          platform?: string | null
          funnel?: string | null
          operator_notes?: string | null
          created_by?: string | null
          tags?: Json
          meta_upload_status?: string | null
          applovin_upload_status?: string | null
          meta_launched_count?: number | null
          meta_rejected_count?: number | null
          applovin_launched_count?: number | null
          applovin_rejected_count?: number | null
          meta_launched_at?: string | null
          applovin_launched_at?: string | null
          scheduled_for?: string | null
          scheduled_fired_at?: string | null
          clickup_task_url?: string | null
          existing_campaign_id?: string | null
          archived_at?: string | null
          deleted_at?: string | null
          created_at?: string
          audience_template?: string | null
          asset_type?: string | null
          frameio_folder_url?: string | null
          frameio_folder_url_suggested?: string | null
          ad_set_name_override?: string | null
          apply_to_all_ad_copy?: boolean | null
          campaign_mode?: string | null
          campaign_name?: string | null
          existing_campaign_name?: string | null
          existing_adset_id?: string | null
          existing_adset_name?: string | null
          campaign_objective?: string | null
          buying_type?: string | null
          budget_type?: string | null
          budget_amount?: number | null
          optimization_goal?: string | null
          attribution_setting?: string | null
          placement_mode?: string | null
          manual_placements?: Json | null
          launch_paused?: boolean | null
          targeting_template_id?: string | null
          targeting_age_min?: number | null
          targeting_age_max?: number | null
          targeting_genders?: Json | null
          targeting_include_audience_ids?: Json | null
          targeting_exclude_audience_ids?: Json | null
          audience_template_id?: string | null
          pixel_id?: string | null
          fb_page_id?: string | null
          ig_account_id?: string | null
          creative_template_id?: string | null
          launched_count?: number | null
          rejected_count?: number | null
          meta_campaign_id?: string | null
          meta_adset_id?: string | null
          bid_amount?: number | null
          tracking_action_type?: string | null
          meta_campaign_effective_status?: string | null
          meta_adset_effective_status?: string | null
          meta_status_synced_at?: string | null
          applovin_campaign_id?: string | null
          applovin_build_mode?: string
          applovin_source_creative_set_id?: string | null
          applovin_source_end_card_asset_id?: string | null
        }
        Relationships: []
      }
      launch_variations: {
        Row: {
          id: string
          package_id: string
          asset_url: string | null
          asset_name: string | null
          asset_type: string | null
          headline: string | null
          primary_text: string | null
          description: string | null
          call_to_action: string | null
          destination_url: string | null
          url_tags: string | null
          fb_page_id: string | null
          ig_account_id: string | null
          pixel_id: string | null
          meta_ad_id: string | null
          meta_video_id: string | null
          meta_creative_id: string | null
          applovin_ad_id: string | null
          rejected: boolean
          rejection_reasons: Json
          error_message: string | null
          created_at: string
          position: number | null
          file_id: string | null
          file_name: string | null
          ad_name: string | null
          meta_launch_error: string | null
          preview_url: string | null
          thumb: string | null
          meta_launched_at: string | null
          gdrive_file_id: string | null
          upload_url: string | null
          asset_source: string | null
          meta_ad_effective_status: string | null
          meta_status_synced_at: string | null
          applovin_asset_id: string | null
          applovin_end_card_asset_id: string | null
          applovin_end_card_source: string | null
          applovin_end_card_file_id: string | null
          applovin_end_card_upload_url: string | null
          applovin_creative_set_id: string | null
          applovin_status: string
          applovin_launched_at: string | null
          applovin_launch_error: string | null
        }
        Insert: {
          id: string
          package_id: string
          asset_url?: string | null
          asset_name?: string | null
          asset_type?: string | null
          headline?: string | null
          primary_text?: string | null
          description?: string | null
          call_to_action?: string | null
          destination_url?: string | null
          url_tags?: string | null
          fb_page_id?: string | null
          ig_account_id?: string | null
          pixel_id?: string | null
          meta_ad_id?: string | null
          meta_video_id?: string | null
          meta_creative_id?: string | null
          applovin_ad_id?: string | null
          rejected: boolean
          rejection_reasons: Json
          error_message?: string | null
          created_at: string
          position?: number | null
          file_id?: string | null
          file_name?: string | null
          ad_name?: string | null
          meta_launch_error?: string | null
          preview_url?: string | null
          thumb?: string | null
          meta_launched_at?: string | null
          gdrive_file_id?: string | null
          upload_url?: string | null
          asset_source?: string | null
          meta_ad_effective_status?: string | null
          meta_status_synced_at?: string | null
          applovin_asset_id?: string | null
          applovin_end_card_asset_id?: string | null
          applovin_end_card_source?: string | null
          applovin_end_card_file_id?: string | null
          applovin_end_card_upload_url?: string | null
          applovin_creative_set_id?: string | null
          applovin_status: string
          applovin_launched_at?: string | null
          applovin_launch_error?: string | null
        }
        Update: {
          id?: string
          package_id?: string
          asset_url?: string | null
          asset_name?: string | null
          asset_type?: string | null
          headline?: string | null
          primary_text?: string | null
          description?: string | null
          call_to_action?: string | null
          destination_url?: string | null
          url_tags?: string | null
          fb_page_id?: string | null
          ig_account_id?: string | null
          pixel_id?: string | null
          meta_ad_id?: string | null
          meta_video_id?: string | null
          meta_creative_id?: string | null
          applovin_ad_id?: string | null
          rejected?: boolean
          rejection_reasons?: Json
          error_message?: string | null
          created_at?: string
          position?: number | null
          file_id?: string | null
          file_name?: string | null
          ad_name?: string | null
          meta_launch_error?: string | null
          preview_url?: string | null
          thumb?: string | null
          meta_launched_at?: string | null
          gdrive_file_id?: string | null
          upload_url?: string | null
          asset_source?: string | null
          meta_ad_effective_status?: string | null
          meta_status_synced_at?: string | null
          applovin_asset_id?: string | null
          applovin_end_card_asset_id?: string | null
          applovin_end_card_source?: string | null
          applovin_end_card_file_id?: string | null
          applovin_end_card_upload_url?: string | null
          applovin_creative_set_id?: string | null
          applovin_status?: string
          applovin_launched_at?: string | null
          applovin_launch_error?: string | null
        }
        Relationships: []
      }
      mcp_audit_log: {
        Row: {
          id: string
          user_id: string | null
          token_id: string | null
          tool: string | null
          endpoint: string | null
          method: string | null
          params: Json | null
          brands_requested: string[] | null
          row_count: number | null
          status_code: number | null
          ip: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id: string
          user_id?: string | null
          token_id?: string | null
          tool?: string | null
          endpoint?: string | null
          method?: string | null
          params?: Json | null
          brands_requested?: string[] | null
          row_count?: number | null
          status_code?: number | null
          ip?: string | null
          user_agent?: string | null
          created_at: string
        }
        Update: {
          id?: string
          user_id?: string | null
          token_id?: string | null
          tool?: string | null
          endpoint?: string | null
          method?: string | null
          params?: Json | null
          brands_requested?: string[] | null
          row_count?: number | null
          status_code?: number | null
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          source_message_id: string
          author_id: string | null
          is_operator: boolean
          is_auto_reply: boolean
          created_at: string
          body_plain: string | null
          body_html: string | null
          attachments: Json | null
          via: Json | null
        }
        Insert: {
          id: string
          conversation_id: string
          source_message_id: string
          author_id?: string | null
          is_operator: boolean
          is_auto_reply: boolean
          created_at: string
          body_plain?: string | null
          body_html?: string | null
          attachments?: Json | null
          via?: Json | null
        }
        Update: {
          id?: string
          conversation_id?: string
          source_message_id?: string
          author_id?: string | null
          is_operator?: boolean
          is_auto_reply?: boolean
          created_at?: string
          body_plain?: string | null
          body_html?: string | null
          attachments?: Json | null
          via?: Json | null
        }
        Relationships: []
      }
      meta_accounts: {
        Row: {
          id: string
          name: string
          meta_account_id: string
          page_id: string | null
          instagram_id: string | null
          pixel_id: string | null
          notes: string | null
          allowed_brand_ids: Json
          allowed_product_ids: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          meta_account_id: string
          page_id?: string | null
          instagram_id?: string | null
          pixel_id?: string | null
          notes?: string | null
          allowed_brand_ids: Json
          allowed_product_ids: Json
          created_at: string
        }
        Update: {
          id?: string
          name?: string
          meta_account_id?: string
          page_id?: string | null
          instagram_id?: string | null
          pixel_id?: string | null
          notes?: string | null
          allowed_brand_ids?: Json
          allowed_product_ids?: Json
          created_at?: string
        }
        Relationships: []
      }
      meta_ad_downloads: {
        Row: {
          id: string
          ad_url: string
          ad_id: string
          status: string
          file_url: string | null
          file_key: string | null
          file_name: string | null
          file_size_bytes: number | null
          error_message: string | null
          requested_by: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
          progress_pct: number
          status_detail: string | null
        }
        Insert: {
          id: string
          ad_url: string
          ad_id: string
          status: string
          file_url?: string | null
          file_key?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          error_message?: string | null
          requested_by?: string | null
          created_at: string
          updated_at: string
          completed_at?: string | null
          progress_pct: number
          status_detail?: string | null
        }
        Update: {
          id?: string
          ad_url?: string
          ad_id?: string
          status?: string
          file_url?: string | null
          file_key?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          error_message?: string | null
          requested_by?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          progress_pct?: number
          status_detail?: string | null
        }
        Relationships: []
      }
      meta_ad_status: {
        Row: {
          id: string
          meta_ad_id: string
          package_id: string | null
          status: string | null
          effective_status: string | null
          name: string | null
          last_polled: string
        }
        Insert: {
          id: string
          meta_ad_id: string
          package_id?: string | null
          status?: string | null
          effective_status?: string | null
          name?: string | null
          last_polled: string
        }
        Update: {
          id?: string
          meta_ad_id?: string
          package_id?: string | null
          status?: string | null
          effective_status?: string | null
          name?: string | null
          last_polled?: string
        }
        Relationships: []
      }
      meta_launch_presets: {
        Row: {
          id: string
          account_id: string | null
          account_name: string | null
          workspace_id: string | null
          facebook_name: string | null
          instagram_name: string | null
          default_cta: string | null
          default_link: string | null
          url_tags: string | null
          defaults_json: Json | null
          synced_at: string | null
        }
        Insert: {
          id: string
          account_id?: string | null
          account_name?: string | null
          workspace_id?: string | null
          facebook_name?: string | null
          instagram_name?: string | null
          default_cta?: string | null
          default_link?: string | null
          url_tags?: string | null
          defaults_json?: Json | null
          synced_at?: string | null
        }
        Update: {
          id?: string
          account_id?: string | null
          account_name?: string | null
          workspace_id?: string | null
          facebook_name?: string | null
          instagram_name?: string | null
          default_cta?: string | null
          default_link?: string | null
          url_tags?: string | null
          defaults_json?: Json | null
          synced_at?: string | null
        }
        Relationships: []
      }
      meta_universal_preset: {
        Row: {
          id: string
          meta_account_id: string | null
          url_tags_template: string | null
          naming_pattern: string | null
          naming_separator: string | null
          default_campaign_objective: string | null
          default_buying_type: string | null
          default_budget_type: string | null
          default_optimization_goal: string | null
          default_attribution_setting: string | null
          default_billing_event: string | null
          default_bid_strategy: string | null
          default_placement_mode: string | null
          default_age_min: number | null
          default_age_max: number | null
          default_countries: Json | null
          default_genders: Json | null
          default_include_audience_ids: Json | null
          default_exclude_audience_ids: Json | null
          auto_exclude_past_purchasers: boolean | null
          special_ad_categories: Json | null
          launch_paused: boolean | null
          enhanced_creative: boolean | null
          multi_advertiser: boolean | null
          instagram_only: boolean | null
          scale_post_id: boolean | null
          ad_creation_cutoff: number | null
          cta_favorites: Json | null
          website_destination_optimization: boolean | null
          sitelinks_enabled: boolean | null
          browser_ad_ons: boolean | null
          tag_based_localization: boolean | null
          hide_promo_code_email_signup: boolean | null
          auto_upload_captions: boolean | null
          fast_upload: boolean | null
          launch_one_ad_per_adset: boolean | null
          launch_ads_as_post_id: boolean | null
          tracking_specs: boolean | null
          ce_master_enabled: boolean | null
          ce_master_optimise_text_per_person: boolean | null
          ce_img_text_translation: boolean | null
          ce_img_show_summary: boolean | null
          ce_img_reveal_details_over_time: boolean | null
          ce_img_add_overlays: boolean | null
          ce_img_adjust_brightness_contrast: boolean | null
          ce_img_music: boolean | null
          ce_img_image_animation: boolean | null
          ce_img_add_site_links: boolean | null
          ce_img_enhance_cta: boolean | null
          ce_img_add_details_to_ad_layout: boolean | null
          ce_img_flexible_media: boolean | null
          ce_img_advantage_creative: boolean | null
          ce_img_profile_extension: boolean | null
          ce_img_store_location: boolean | null
          ce_img_business_ai: boolean | null
          ce_img_show_spotlights: boolean | null
          ce_img_create_sticker_cta: boolean | null
          ce_img_relevant_comments: boolean | null
          ce_img_visual_touchups: boolean | null
          ce_img_text_improvements: boolean | null
          ce_vid_text_translation: boolean | null
          ce_vid_add_video_effects: boolean | null
          ce_vid_add_site_links: boolean | null
          ce_vid_enhance_cta: boolean | null
          ce_vid_add_details_to_ad_layout: boolean | null
          ce_vid_flexible_media: boolean | null
          ce_vid_advantage_creative: boolean | null
          ce_vid_video_to_image: boolean | null
          ce_vid_profile_extension: boolean | null
          ce_vid_store_location: boolean | null
          ce_vid_business_ai: boolean | null
          ce_vid_show_spotlights: boolean | null
          ce_vid_create_sticker_cta: boolean | null
          ce_vid_relevant_comments: boolean | null
          ce_vid_visual_touchups: boolean | null
          ce_vid_text_improvements: boolean | null
          ce_car_relevant_comments: boolean | null
          ce_car_profile_end_card: boolean | null
          ce_car_highlight_carousel_card: boolean | null
          ce_car_format_automation: boolean | null
          ce_car_dynamic_description: boolean | null
          ce_car_enhance_cta: boolean | null
          ce_car_adapt_multi_image_format: boolean | null
          ce_car_advantage_creative: boolean | null
          ce_car_photos_to_video: boolean | null
          ce_car_profile_extension: boolean | null
          ce_car_store_location: boolean | null
          ce_car_business_ai: boolean | null
          ce_car_text_improvements: boolean | null
          updated_at: string | null
        }
        Insert: {
          id: string
          meta_account_id?: string | null
          url_tags_template?: string | null
          naming_pattern?: string | null
          naming_separator?: string | null
          default_campaign_objective?: string | null
          default_buying_type?: string | null
          default_budget_type?: string | null
          default_optimization_goal?: string | null
          default_attribution_setting?: string | null
          default_billing_event?: string | null
          default_bid_strategy?: string | null
          default_placement_mode?: string | null
          default_age_min?: number | null
          default_age_max?: number | null
          default_countries?: Json | null
          default_genders?: Json | null
          default_include_audience_ids?: Json | null
          default_exclude_audience_ids?: Json | null
          auto_exclude_past_purchasers?: boolean | null
          special_ad_categories?: Json | null
          launch_paused?: boolean | null
          enhanced_creative?: boolean | null
          multi_advertiser?: boolean | null
          instagram_only?: boolean | null
          scale_post_id?: boolean | null
          ad_creation_cutoff?: number | null
          cta_favorites?: Json | null
          website_destination_optimization?: boolean | null
          sitelinks_enabled?: boolean | null
          browser_ad_ons?: boolean | null
          tag_based_localization?: boolean | null
          hide_promo_code_email_signup?: boolean | null
          auto_upload_captions?: boolean | null
          fast_upload?: boolean | null
          launch_one_ad_per_adset?: boolean | null
          launch_ads_as_post_id?: boolean | null
          tracking_specs?: boolean | null
          ce_master_enabled?: boolean | null
          ce_master_optimise_text_per_person?: boolean | null
          ce_img_text_translation?: boolean | null
          ce_img_show_summary?: boolean | null
          ce_img_reveal_details_over_time?: boolean | null
          ce_img_add_overlays?: boolean | null
          ce_img_adjust_brightness_contrast?: boolean | null
          ce_img_music?: boolean | null
          ce_img_image_animation?: boolean | null
          ce_img_add_site_links?: boolean | null
          ce_img_enhance_cta?: boolean | null
          ce_img_add_details_to_ad_layout?: boolean | null
          ce_img_flexible_media?: boolean | null
          ce_img_advantage_creative?: boolean | null
          ce_img_profile_extension?: boolean | null
          ce_img_store_location?: boolean | null
          ce_img_business_ai?: boolean | null
          ce_img_show_spotlights?: boolean | null
          ce_img_create_sticker_cta?: boolean | null
          ce_img_relevant_comments?: boolean | null
          ce_img_visual_touchups?: boolean | null
          ce_img_text_improvements?: boolean | null
          ce_vid_text_translation?: boolean | null
          ce_vid_add_video_effects?: boolean | null
          ce_vid_add_site_links?: boolean | null
          ce_vid_enhance_cta?: boolean | null
          ce_vid_add_details_to_ad_layout?: boolean | null
          ce_vid_flexible_media?: boolean | null
          ce_vid_advantage_creative?: boolean | null
          ce_vid_video_to_image?: boolean | null
          ce_vid_profile_extension?: boolean | null
          ce_vid_store_location?: boolean | null
          ce_vid_business_ai?: boolean | null
          ce_vid_show_spotlights?: boolean | null
          ce_vid_create_sticker_cta?: boolean | null
          ce_vid_relevant_comments?: boolean | null
          ce_vid_visual_touchups?: boolean | null
          ce_vid_text_improvements?: boolean | null
          ce_car_relevant_comments?: boolean | null
          ce_car_profile_end_card?: boolean | null
          ce_car_highlight_carousel_card?: boolean | null
          ce_car_format_automation?: boolean | null
          ce_car_dynamic_description?: boolean | null
          ce_car_enhance_cta?: boolean | null
          ce_car_adapt_multi_image_format?: boolean | null
          ce_car_advantage_creative?: boolean | null
          ce_car_photos_to_video?: boolean | null
          ce_car_profile_extension?: boolean | null
          ce_car_store_location?: boolean | null
          ce_car_business_ai?: boolean | null
          ce_car_text_improvements?: boolean | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          meta_account_id?: string | null
          url_tags_template?: string | null
          naming_pattern?: string | null
          naming_separator?: string | null
          default_campaign_objective?: string | null
          default_buying_type?: string | null
          default_budget_type?: string | null
          default_optimization_goal?: string | null
          default_attribution_setting?: string | null
          default_billing_event?: string | null
          default_bid_strategy?: string | null
          default_placement_mode?: string | null
          default_age_min?: number | null
          default_age_max?: number | null
          default_countries?: Json | null
          default_genders?: Json | null
          default_include_audience_ids?: Json | null
          default_exclude_audience_ids?: Json | null
          auto_exclude_past_purchasers?: boolean | null
          special_ad_categories?: Json | null
          launch_paused?: boolean | null
          enhanced_creative?: boolean | null
          multi_advertiser?: boolean | null
          instagram_only?: boolean | null
          scale_post_id?: boolean | null
          ad_creation_cutoff?: number | null
          cta_favorites?: Json | null
          website_destination_optimization?: boolean | null
          sitelinks_enabled?: boolean | null
          browser_ad_ons?: boolean | null
          tag_based_localization?: boolean | null
          hide_promo_code_email_signup?: boolean | null
          auto_upload_captions?: boolean | null
          fast_upload?: boolean | null
          launch_one_ad_per_adset?: boolean | null
          launch_ads_as_post_id?: boolean | null
          tracking_specs?: boolean | null
          ce_master_enabled?: boolean | null
          ce_master_optimise_text_per_person?: boolean | null
          ce_img_text_translation?: boolean | null
          ce_img_show_summary?: boolean | null
          ce_img_reveal_details_over_time?: boolean | null
          ce_img_add_overlays?: boolean | null
          ce_img_adjust_brightness_contrast?: boolean | null
          ce_img_music?: boolean | null
          ce_img_image_animation?: boolean | null
          ce_img_add_site_links?: boolean | null
          ce_img_enhance_cta?: boolean | null
          ce_img_add_details_to_ad_layout?: boolean | null
          ce_img_flexible_media?: boolean | null
          ce_img_advantage_creative?: boolean | null
          ce_img_profile_extension?: boolean | null
          ce_img_store_location?: boolean | null
          ce_img_business_ai?: boolean | null
          ce_img_show_spotlights?: boolean | null
          ce_img_create_sticker_cta?: boolean | null
          ce_img_relevant_comments?: boolean | null
          ce_img_visual_touchups?: boolean | null
          ce_img_text_improvements?: boolean | null
          ce_vid_text_translation?: boolean | null
          ce_vid_add_video_effects?: boolean | null
          ce_vid_add_site_links?: boolean | null
          ce_vid_enhance_cta?: boolean | null
          ce_vid_add_details_to_ad_layout?: boolean | null
          ce_vid_flexible_media?: boolean | null
          ce_vid_advantage_creative?: boolean | null
          ce_vid_video_to_image?: boolean | null
          ce_vid_profile_extension?: boolean | null
          ce_vid_store_location?: boolean | null
          ce_vid_business_ai?: boolean | null
          ce_vid_show_spotlights?: boolean | null
          ce_vid_create_sticker_cta?: boolean | null
          ce_vid_relevant_comments?: boolean | null
          ce_vid_visual_touchups?: boolean | null
          ce_vid_text_improvements?: boolean | null
          ce_car_relevant_comments?: boolean | null
          ce_car_profile_end_card?: boolean | null
          ce_car_highlight_carousel_card?: boolean | null
          ce_car_format_automation?: boolean | null
          ce_car_dynamic_description?: boolean | null
          ce_car_enhance_cta?: boolean | null
          ce_car_adapt_multi_image_format?: boolean | null
          ce_car_advantage_creative?: boolean | null
          ce_car_photos_to_video?: boolean | null
          ce_car_profile_extension?: boolean | null
          ce_car_store_location?: boolean | null
          ce_car_business_ai?: boolean | null
          ce_car_text_improvements?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      operator_leakage: {
        Row: {
          assignee_id: string | null
          agent_name: string | null
          agent_email: string | null
          agent_role: string | null
          total_cancels: number | null
          pure_cancels: number | null
          pure_cancels_refunded: number | null
          pure_cancel_refund_rate_pct: number | null
          leaked_dollars: number | null
          avg_refund_pct_when_granted: number | null
          full_refunds_on_pure_cancels: number | null
          refund_30pct_on_pure_cancels: number | null
          refund_40_50pct_on_pure_cancels: number | null
        }
        Insert: {
          assignee_id?: string | null
          agent_name?: string | null
          agent_email?: string | null
          agent_role?: string | null
          total_cancels?: number | null
          pure_cancels?: number | null
          pure_cancels_refunded?: number | null
          pure_cancel_refund_rate_pct?: number | null
          leaked_dollars?: number | null
          avg_refund_pct_when_granted?: number | null
          full_refunds_on_pure_cancels?: number | null
          refund_30pct_on_pure_cancels?: number | null
          refund_40_50pct_on_pure_cancels?: number | null
        }
        Update: {
          assignee_id?: string | null
          agent_name?: string | null
          agent_email?: string | null
          agent_role?: string | null
          total_cancels?: number | null
          pure_cancels?: number | null
          pure_cancels_refunded?: number | null
          pure_cancel_refund_rate_pct?: number | null
          leaked_dollars?: number | null
          avg_refund_pct_when_granted?: number | null
          full_refunds_on_pure_cancels?: number | null
          refund_30pct_on_pure_cancels?: number | null
          refund_40_50pct_on_pure_cancels?: number | null
        }
        Relationships: []
      }
      operator_prefs: {
        Row: {
          id: string
          email: string
          prefs: Json
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          prefs: Json
          updated_at: string
        }
        Update: {
          id?: string
          email?: string
          prefs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      operator_sla: {
        Row: {
          assignee_id: string | null
          agent_name: string | null
          agent_email: string | null
          agent_role: string | null
          assigned_total: number | null
          no_human_response: number | null
          pct_no_human: number | null
          median_hours_to_respond: number | null
          p90_hours_to_respond: number | null
          chargebacks_ignored: number | null
          medical_ignored: number | null
          didnt_authorize_ignored: number | null
        }
        Insert: {
          assignee_id?: string | null
          agent_name?: string | null
          agent_email?: string | null
          agent_role?: string | null
          assigned_total?: number | null
          no_human_response?: number | null
          pct_no_human?: number | null
          median_hours_to_respond?: number | null
          p90_hours_to_respond?: number | null
          chargebacks_ignored?: number | null
          medical_ignored?: number | null
          didnt_authorize_ignored?: number | null
        }
        Update: {
          assignee_id?: string | null
          agent_name?: string | null
          agent_email?: string | null
          agent_role?: string | null
          assigned_total?: number | null
          no_human_response?: number | null
          pct_no_human?: number | null
          median_hours_to_respond?: number | null
          p90_hours_to_respond?: number | null
          chargebacks_ignored?: number | null
          medical_ignored?: number | null
          didnt_authorize_ignored?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          order_number: string | null
          order_date: string | null
          customer_email: string | null
          total: number | null
          refunded: number | null
          refund_date: string | null
          financial_status: string | null
          fulfillment_status: string | null
          shopify_tags: string | null
          rebill_n: number | null
        }
        Insert: {
          id: string
          order_number?: string | null
          order_date?: string | null
          customer_email?: string | null
          total?: number | null
          refunded?: number | null
          refund_date?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          shopify_tags?: string | null
          rebill_n?: number | null
        }
        Update: {
          id?: string
          order_number?: string | null
          order_date?: string | null
          customer_email?: string | null
          total?: number | null
          refunded?: number | null
          refund_date?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          shopify_tags?: string | null
          rebill_n?: number | null
        }
        Relationships: []
      }
      other_config: {
        Row: {
          id: string
          created_at: string
          name: string | null
          data: Json | null
          points_config: string[] | null
        }
        Insert: {
          id: string
          created_at: string
          name?: string | null
          data?: Json | null
          points_config?: string[] | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string | null
          data?: Json | null
          points_config?: string[] | null
        }
        Relationships: []
      }
      path_steps: {
        Row: {
          id: string
          category_key: string
          step_order: number
          step_label: string
          parent_step_id: string | null
          case_count: number | null
          case_pct: number | null
          explanation: string | null
        }
        Insert: {
          id: string
          category_key: string
          step_order: number
          step_label: string
          parent_step_id?: string | null
          case_count?: number | null
          case_pct?: number | null
          explanation?: string | null
        }
        Update: {
          id?: string
          category_key?: string
          step_order?: number
          step_label?: string
          parent_step_id?: string | null
          case_count?: number | null
          case_pct?: number | null
          explanation?: string | null
        }
        Relationships: []
      }
      personal_access_tokens: {
        Row: {
          id: string
          user_id: string
          name: string
          token_hash: string
          created_at: string
          last_used_at: string | null
          expires_at: string
          revoked_at: string | null
          metadata: Json
        }
        Insert: {
          id: string
          user_id: string
          name: string
          token_hash: string
          created_at: string
          last_used_at?: string | null
          expires_at: string
          revoked_at?: string | null
          metadata: Json
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          token_hash?: string
          created_at?: string
          last_used_at?: string | null
          expires_at?: string
          revoked_at?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      pixar_character_jobs: {
        Row: {
          id: string
          status: string
          product: string | null
          product_label: string | null
          style: string | null
          main_character: string | null
          main_pain: string | null
          storyline_pattern: string | null
          description: string | null
          variant_count: number
          callback_token: string | null
          result_avatars: Json
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          status: string
          product?: string | null
          product_label?: string | null
          style?: string | null
          main_character?: string | null
          main_pain?: string | null
          storyline_pattern?: string | null
          description?: string | null
          variant_count: number
          callback_token?: string | null
          result_avatars: Json
          error?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          status?: string
          product?: string | null
          product_label?: string | null
          style?: string | null
          main_character?: string | null
          main_pain?: string | null
          storyline_pattern?: string | null
          description?: string | null
          variant_count?: number
          callback_token?: string | null
          result_avatars?: Json
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pixar_scene_image_jobs: {
        Row: {
          id: string
          status: string
          character_job_id: string | null
          selected_avatar_url: string | null
          product: string | null
          product_label: string | null
          style: string | null
          storyboard: Json
          result_scenes: Json
          callback_token: string | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          status: string
          character_job_id?: string | null
          selected_avatar_url?: string | null
          product?: string | null
          product_label?: string | null
          style?: string | null
          storyboard: Json
          result_scenes: Json
          callback_token?: string | null
          error?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          status?: string
          character_job_id?: string | null
          selected_avatar_url?: string | null
          product?: string | null
          product_label?: string | null
          style?: string | null
          storyboard?: Json
          result_scenes?: Json
          callback_token?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pixar_video_jobs: {
        Row: {
          id: string
          callback_token: string | null
          status: string
          final_video_url: string | null
          error: string | null
          payload: Json | null
          created_at: string
          scene_image_job_id: string | null
          character_job_id: string | null
          selected_avatar_url: string | null
          product: string | null
          product_label: string | null
          style: string | null
          with_audio: boolean
          music: string | null
          scenes: Json
          updated_at: string
        }
        Insert: {
          id: string
          callback_token?: string | null
          status: string
          final_video_url?: string | null
          error?: string | null
          payload?: Json | null
          created_at: string
          scene_image_job_id?: string | null
          character_job_id?: string | null
          selected_avatar_url?: string | null
          product?: string | null
          product_label?: string | null
          style?: string | null
          with_audio: boolean
          music?: string | null
          scenes: Json
          updated_at: string
        }
        Update: {
          id?: string
          callback_token?: string | null
          status?: string
          final_video_url?: string | null
          error?: string | null
          payload?: Json | null
          created_at?: string
          scene_image_job_id?: string | null
          character_job_id?: string | null
          selected_avatar_url?: string | null
          product?: string | null
          product_label?: string | null
          style?: string | null
          with_audio?: boolean
          music?: string | null
          scenes?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pixels: {
        Row: {
          id: string
          name: string
          pixel_id: string
          meta_account_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          pixel_id: string
          meta_account_id?: string | null
          notes?: string | null
          created_at: string
        }
        Update: {
          id?: string
          name?: string
          pixel_id?: string
          meta_account_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      pl_data: {
        Row: {
          id: string
          created_at: string
          eventDate: string
          brand: string
          revenue: number
          paymentProcessing: number
          shipping: number
          refund: number
          spend: number
          totalCosts: number
          cogs: number
          orders: number
          profit: number
        }
        Insert: {
          id: string
          created_at: string
          eventDate: string
          brand: string
          revenue: number
          paymentProcessing: number
          shipping: number
          refund: number
          spend: number
          totalCosts: number
          cogs: number
          orders: number
          profit: number
        }
        Update: {
          id?: string
          created_at?: string
          eventDate?: string
          brand?: string
          revenue?: number
          paymentProcessing?: number
          shipping?: number
          refund?: number
          spend?: number
          totalCosts?: number
          cogs?: number
          orders?: number
          profit?: number
        }
        Relationships: []
      }
      product_comparison_brands: {
        Row: {
          id: string
          product_id: string
          image_url: string
          brand_name: string
          order_index: number
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          image_url: string
          brand_name: string
          order_index: number
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          image_url?: string
          brand_name?: string
          order_index?: number
          created_at?: string
        }
        Relationships: []
      }
      product_drive_links: {
        Row: {
          id: string
          product_id: string
          funnel_type: string
          drive_link: string
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          funnel_type: string
          drive_link: string
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          funnel_type?: string
          drive_link?: string
          created_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          id: string
          product_id: string
          image_url: string
          explanation: string
          order_index: number
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          image_url: string
          explanation: string
          order_index: number
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          image_url?: string
          explanation?: string
          order_index?: number
          created_at?: string
        }
        Relationships: []
      }
      product_reference_images: {
        Row: {
          id: string
          product_id: string
          image_url: string
          explanation: string
          order_index: number
          created_at: string
        }
        Insert: {
          id: string
          product_id: string
          image_url: string
          explanation: string
          order_index: number
          created_at: string
        }
        Update: {
          id?: string
          product_id?: string
          image_url?: string
          explanation?: string
          order_index?: number
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          brand_id: string | null
          name: string
          docs_file_url: string | null
          guidelines: string | null
          publisher_comparison: string | null
          created_at: string
          updated_at: string
          publisher_id: string | null
          generated_images_drive_link: string | null
          product_code: string
          product_brief: string
          ad_db_sheet_id: string | null
          comparison_code: string | null
          onbrand_code: string | null
          meta_destination_onbrand: string | null
          meta_destination_comparison: string | null
          applovin_destination_onbrand: string | null
          applovin_destination_comparison: string | null
          deleted_at: string | null
          default_headline: string | null
          default_primary_text: string | null
          default_description: string | null
          default_call_to_action: string | null
          default_destination_url: string | null
          productc_config_url: string | null
          top_5_comparison_image: string | null
        }
        Insert: {
          id: string
          brand_id?: string | null
          name: string
          docs_file_url?: string | null
          guidelines?: string | null
          publisher_comparison?: string | null
          created_at: string
          updated_at: string
          publisher_id?: string | null
          generated_images_drive_link?: string | null
          product_code: string
          product_brief: string
          ad_db_sheet_id?: string | null
          comparison_code?: string | null
          onbrand_code?: string | null
          meta_destination_onbrand?: string | null
          meta_destination_comparison?: string | null
          applovin_destination_onbrand?: string | null
          applovin_destination_comparison?: string | null
          deleted_at?: string | null
          default_headline?: string | null
          default_primary_text?: string | null
          default_description?: string | null
          default_call_to_action?: string | null
          default_destination_url?: string | null
          productc_config_url?: string | null
          top_5_comparison_image?: string | null
        }
        Update: {
          id?: string
          brand_id?: string | null
          name?: string
          docs_file_url?: string | null
          guidelines?: string | null
          publisher_comparison?: string | null
          created_at?: string
          updated_at?: string
          publisher_id?: string | null
          generated_images_drive_link?: string | null
          product_code?: string
          product_brief?: string
          ad_db_sheet_id?: string | null
          comparison_code?: string | null
          onbrand_code?: string | null
          meta_destination_onbrand?: string | null
          meta_destination_comparison?: string | null
          applovin_destination_onbrand?: string | null
          applovin_destination_comparison?: string | null
          deleted_at?: string | null
          default_headline?: string | null
          default_primary_text?: string | null
          default_description?: string | null
          default_call_to_action?: string | null
          default_destination_url?: string | null
          productc_config_url?: string | null
          top_5_comparison_image?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          user_id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      publishers: {
        Row: {
          id: string
          name: string
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          image_url?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          name?: string
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      routing_rules: {
        Row: {
          id: string
          priority: number
          rule_name: string
          category_scope: string[]
          trigger_intent: string | null
          trigger_keywords: string[] | null
          trigger_shopify_tags: string[] | null
          trigger_negation_keywords: string[] | null
          action_type: string
          action_label: string
          action_message_template: string | null
          action_followup: string | null
          rationale: string
          expected_volume_per_week: number | null
          estimated_dollar_impact_per_week: number | null
          enabled: boolean | null
          created_at: string | null
        }
        Insert: {
          id: string
          priority: number
          rule_name: string
          category_scope: string[]
          trigger_intent?: string | null
          trigger_keywords?: string[] | null
          trigger_shopify_tags?: string[] | null
          trigger_negation_keywords?: string[] | null
          action_type: string
          action_label: string
          action_message_template?: string | null
          action_followup?: string | null
          rationale: string
          expected_volume_per_week?: number | null
          estimated_dollar_impact_per_week?: number | null
          enabled?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          priority?: number
          rule_name?: string
          category_scope?: string[]
          trigger_intent?: string | null
          trigger_keywords?: string[] | null
          trigger_shopify_tags?: string[] | null
          trigger_negation_keywords?: string[] | null
          action_type?: string
          action_label?: string
          action_message_template?: string | null
          action_followup?: string | null
          rationale?: string
          expected_volume_per_week?: number | null
          estimated_dollar_impact_per_week?: number | null
          enabled?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      scene_generations: {
        Row: {
          id: string
          avatar_id: string
          status: string
          variant_count: number
          reference_image_url: string | null
          prompt: string | null
          result_images: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          avatar_id: string
          status: string
          variant_count: number
          reference_image_url?: string | null
          prompt?: string | null
          result_images?: Json | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          avatar_id?: string
          status?: string
          variant_count?: number
          reference_image_url?: string | null
          prompt?: string | null
          result_images?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          id: string
          avatar_id: string
          name: string
          image_url: string
          prompt: string | null
          created_at: string
          updated_at: string
          heygen_avatar_id: string | null
          scene_group_id: string | null
          is_product: boolean
          product_tags: string[] | null
          heygen_scene_id: string | null
          is_deleted: boolean | null
        }
        Insert: {
          id: string
          avatar_id: string
          name: string
          image_url: string
          prompt?: string | null
          created_at: string
          updated_at: string
          heygen_avatar_id?: string | null
          scene_group_id?: string | null
          is_product: boolean
          product_tags?: string[] | null
          heygen_scene_id?: string | null
          is_deleted?: boolean | null
        }
        Update: {
          id?: string
          avatar_id?: string
          name?: string
          image_url?: string
          prompt?: string | null
          created_at?: string
          updated_at?: string
          heygen_avatar_id?: string | null
          scene_group_id?: string | null
          is_product?: boolean
          product_tags?: string[] | null
          heygen_scene_id?: string | null
          is_deleted?: boolean | null
        }
        Relationships: []
      }
      scripts: {
        Row: {
          id: string
          created_at: string
          script_id: number
          brand: string | null
          product: string | null
          ad_id: number | null
          creation_date: string | null
          clickup_link: string | null
          g_drive_link: string | null
          framer_io_link: string | null
          ad_brief_doc: string | null
        }
        Insert: {
          id: string
          created_at: string
          script_id: number
          brand?: string | null
          product?: string | null
          ad_id?: number | null
          creation_date?: string | null
          clickup_link?: string | null
          g_drive_link?: string | null
          framer_io_link?: string | null
          ad_brief_doc?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          script_id?: number
          brand?: string | null
          product?: string | null
          ad_id?: number | null
          creation_date?: string | null
          clickup_link?: string | null
          g_drive_link?: string | null
          framer_io_link?: string | null
          ad_brief_doc?: string | null
        }
        Relationships: []
      }
      shopify_line_items: {
        Row: {
          id: string
          order_id: string | null
          store_id: string | null
          product_id: string | null
          product_title: string | null
          variant_id: string | null
          variant_title: string | null
          quantity: number | null
          price: number | null
          total_discount: number | null
          selling_plan_id: string | null
          selling_plan_name: string | null
          is_subscription: boolean | null
          created_at: string | null
          ckc_product_type: string | null
        }
        Insert: {
          id: string
          order_id?: string | null
          store_id?: string | null
          product_id?: string | null
          product_title?: string | null
          variant_id?: string | null
          variant_title?: string | null
          quantity?: number | null
          price?: number | null
          total_discount?: number | null
          selling_plan_id?: string | null
          selling_plan_name?: string | null
          is_subscription?: boolean | null
          created_at?: string | null
          ckc_product_type?: string | null
        }
        Update: {
          id?: string
          order_id?: string | null
          store_id?: string | null
          product_id?: string | null
          product_title?: string | null
          variant_id?: string | null
          variant_title?: string | null
          quantity?: number | null
          price?: number | null
          total_discount?: number | null
          selling_plan_id?: string | null
          selling_plan_name?: string | null
          is_subscription?: boolean | null
          created_at?: string | null
          ckc_product_type?: string | null
        }
        Relationships: []
      }
      shopify_order_metrics: {
        Row: {
          id: string
          created_at: string
          orderId: number
          orderDate: string
          email: string | null
          financialStatus: string
          fulfillmentStatus: string
          tags: string
          orderPrice: number
          customerName: string | null
          countryCode: string | null
          refundAmount: number
          orderName: string
          brand: string
          refundDate: string | null
        }
        Insert: {
          id: string
          created_at: string
          orderId: number
          orderDate: string
          email?: string | null
          financialStatus: string
          fulfillmentStatus: string
          tags: string
          orderPrice: number
          customerName?: string | null
          countryCode?: string | null
          refundAmount: number
          orderName: string
          brand: string
          refundDate?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          orderId?: number
          orderDate?: string
          email?: string | null
          financialStatus?: string
          fulfillmentStatus?: string
          tags?: string
          orderPrice?: number
          customerName?: string | null
          countryCode?: string | null
          refundAmount?: number
          orderName?: string
          brand?: string
          refundDate?: string | null
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          id: string
          store_id: string | null
          order_number: string | null
          created_at: string
          total_price: number | null
          subtotal_price: number | null
          total_tax: number | null
          total_discounts: number | null
          total_shipping: number | null
          customer_id: string | null
          customer_order_number: number | null
          is_new_customer: boolean | null
          refund_amount: number | null
          financial_status: string | null
          fulfillment_status: string | null
          has_subscription_items: boolean | null
          is_rebuild: boolean | null
          fetched_at: string | null
          tags: string | null
          ckc_order_type: string | null
          ckc_funnel: string | null
          ckc_checkout_type: string | null
        }
        Insert: {
          id: string
          store_id?: string | null
          order_number?: string | null
          created_at: string
          total_price?: number | null
          subtotal_price?: number | null
          total_tax?: number | null
          total_discounts?: number | null
          total_shipping?: number | null
          customer_id?: string | null
          customer_order_number?: number | null
          is_new_customer?: boolean | null
          refund_amount?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          has_subscription_items?: boolean | null
          is_rebuild?: boolean | null
          fetched_at?: string | null
          tags?: string | null
          ckc_order_type?: string | null
          ckc_funnel?: string | null
          ckc_checkout_type?: string | null
        }
        Update: {
          id?: string
          store_id?: string | null
          order_number?: string | null
          created_at?: string
          total_price?: number | null
          subtotal_price?: number | null
          total_tax?: number | null
          total_discounts?: number | null
          total_shipping?: number | null
          customer_id?: string | null
          customer_order_number?: number | null
          is_new_customer?: boolean | null
          refund_amount?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          has_subscription_items?: boolean | null
          is_rebuild?: boolean | null
          fetched_at?: string | null
          tags?: string | null
          ckc_order_type?: string | null
          ckc_funnel?: string | null
          ckc_checkout_type?: string | null
        }
        Relationships: []
      }
      shopify_transactions: {
        Row: {
          id: string
          order_id: string | null
          store_id: string | null
          kind: string | null
          gateway: string | null
          amount: number | null
          status: string | null
          created_at: string | null
        }
        Insert: {
          id: string
          order_id?: string | null
          store_id?: string | null
          kind?: string | null
          gateway?: string | null
          amount?: number | null
          status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          order_id?: string | null
          store_id?: string | null
          kind?: string | null
          gateway?: string | null
          amount?: number | null
          status?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      statics_logs: {
        Row: {
          id: string
          ad_id: number
          drive_link: string | null
          brand_id: string | null
          brand_name: string
          product_id: string | null
          product_name: string
          cs: string | null
          number_of_ads: string | null
          concept_name: string | null
          funnel: string
          language: string | null
          max_variations_per_ad_group: string | null
          inspo_links: string[] | null
          title: string | null
          subtitle: string | null
          design_elements: string | null
          is_multiple: boolean | null
          logo_name: string | null
          is_cta_button: boolean | null
          cta_button_text: string | null
          is_badge: boolean | null
          badge_text: string | null
          prompt: string | null
          selected_images: Json | null
          status: string
          created_at: string
          updated_at: string
          file_naming_convention: string | null
          description: string | null
          clickup_task_id: string | null
          clickup_task_url: string | null
          generation_id: string | null
          image_generation_drive_link: string | null
          prompt_for_images: string | null
          week: string | null
          creation_method: string | null
          stage: string | null
          clickup_task_status: string | null
          priority: string | null
          tsl_script_id: string | null
          products_to_show: string | null
          template_id: string | null
          intended_chanel: string | null
          images_folder_link: string | null
          image_brief_link: string | null
          generated_images: string[] | null
          ad_type: string | null
          notes: string | null
          launch_date_meta: string | null
          launch_date_applovin: string | null
          cta: string | null
          edit_type: string
          sub_angle: string | null
          sub_angle_detail: string | null
        }
        Insert: {
          id: string
          ad_id: number
          drive_link?: string | null
          brand_id?: string | null
          brand_name: string
          product_id?: string | null
          product_name: string
          cs?: string | null
          number_of_ads?: string | null
          concept_name?: string | null
          funnel: string
          language?: string | null
          max_variations_per_ad_group?: string | null
          inspo_links?: string[] | null
          title?: string | null
          subtitle?: string | null
          design_elements?: string | null
          is_multiple?: boolean | null
          logo_name?: string | null
          is_cta_button?: boolean | null
          cta_button_text?: string | null
          is_badge?: boolean | null
          badge_text?: string | null
          prompt?: string | null
          selected_images?: Json | null
          status: string
          created_at: string
          updated_at: string
          file_naming_convention?: string | null
          description?: string | null
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          generation_id?: string | null
          image_generation_drive_link?: string | null
          prompt_for_images?: string | null
          week?: string | null
          creation_method?: string | null
          stage?: string | null
          clickup_task_status?: string | null
          priority?: string | null
          tsl_script_id?: string | null
          products_to_show?: string | null
          template_id?: string | null
          intended_chanel?: string | null
          images_folder_link?: string | null
          image_brief_link?: string | null
          generated_images?: string[] | null
          ad_type?: string | null
          notes?: string | null
          launch_date_meta?: string | null
          launch_date_applovin?: string | null
          cta?: string | null
          edit_type: string
          sub_angle?: string | null
          sub_angle_detail?: string | null
        }
        Update: {
          id?: string
          ad_id?: number
          drive_link?: string | null
          brand_id?: string | null
          brand_name?: string
          product_id?: string | null
          product_name?: string
          cs?: string | null
          number_of_ads?: string | null
          concept_name?: string | null
          funnel?: string
          language?: string | null
          max_variations_per_ad_group?: string | null
          inspo_links?: string[] | null
          title?: string | null
          subtitle?: string | null
          design_elements?: string | null
          is_multiple?: boolean | null
          logo_name?: string | null
          is_cta_button?: boolean | null
          cta_button_text?: string | null
          is_badge?: boolean | null
          badge_text?: string | null
          prompt?: string | null
          selected_images?: Json | null
          status?: string
          created_at?: string
          updated_at?: string
          file_naming_convention?: string | null
          description?: string | null
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          generation_id?: string | null
          image_generation_drive_link?: string | null
          prompt_for_images?: string | null
          week?: string | null
          creation_method?: string | null
          stage?: string | null
          clickup_task_status?: string | null
          priority?: string | null
          tsl_script_id?: string | null
          products_to_show?: string | null
          template_id?: string | null
          intended_chanel?: string | null
          images_folder_link?: string | null
          image_brief_link?: string | null
          generated_images?: string[] | null
          ad_type?: string | null
          notes?: string | null
          launch_date_meta?: string | null
          launch_date_applovin?: string | null
          cta?: string | null
          edit_type?: string
          sub_angle?: string | null
          sub_angle_detail?: string | null
        }
        Relationships: []
      }
      stores: {
        Row: {
          id: string
          name: string
          shopify_domain: string | null
          tw_shop_domain: string | null
          created_at: string | null
        }
        Insert: {
          id: string
          name: string
          shopify_domain?: string | null
          tw_shop_domain?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          shopify_domain?: string | null
          tw_shop_domain?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          id: number
          store_id: string | null
          source: string | null
          sync_type: string | null
          status: string | null
          records_synced: number | null
          error_message: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id: number
          store_id?: string | null
          source?: string | null
          sync_type?: string | null
          status?: string | null
          records_synced?: number | null
          error_message?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: number
          store_id?: string | null
          source?: string | null
          sync_type?: string | null
          status?: string | null
          records_synced?: number | null
          error_message?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      sync_metadata: {
        Row: {
          key: string
          last_synced_at: string
          status: string
        }
        Insert: {
          key: string
          last_synced_at: string
          status: string
        }
        Update: {
          key?: string
          last_synced_at?: string
          status?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          job_name: string
          last_synced_until: string | null
          last_run_at: string | null
          last_status: string | null
          last_error: string | null
        }
        Insert: {
          job_name: string
          last_synced_until?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_error?: string | null
        }
        Update: {
          job_name?: string
          last_synced_until?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_error?: string | null
        }
        Relationships: []
      }
      tags_cache: {
        Row: {
          tag: string
        }
        Insert: {
          tag: string
        }
        Update: {
          tag?: string
        }
        Relationships: []
      }
      targeting_templates: {
        Row: {
          id: string
          name: string
          meta_account_id: string | null
          is_default: boolean
          targeting: Json
          notes: string | null
          created_at: string
          include_audience_ids: Json | null
          exclude_audience_ids: Json | null
          age_min: number | null
          age_max: number | null
          genders: Json | null
          countries: Json | null
          updated_at: string | null
        }
        Insert: {
          id: string
          name: string
          meta_account_id?: string | null
          is_default: boolean
          targeting: Json
          notes?: string | null
          created_at: string
          include_audience_ids?: Json | null
          exclude_audience_ids?: Json | null
          age_min?: number | null
          age_max?: number | null
          genders?: Json | null
          countries?: Json | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          meta_account_id?: string | null
          is_default?: boolean
          targeting?: Json
          notes?: string | null
          created_at?: string
          include_audience_ids?: Json | null
          exclude_audience_ids?: Json | null
          age_min?: number | null
          age_max?: number | null
          genders?: Json | null
          countries?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      themes: {
        Row: {
          id: string
          name: string
          content: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          content?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          name?: string
          content?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      timeline: {
        Row: {
          id: string
          conversation_id: string
          event_time: string
          event_type: string
          source_id: string | null
          body_plain: string | null
          body_html: string | null
          amount: number | null
          metadata: Json | null
        }
        Insert: {
          id: string
          conversation_id: string
          event_time: string
          event_type: string
          source_id?: string | null
          body_plain?: string | null
          body_html?: string | null
          amount?: number | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          conversation_id?: string
          event_time?: string
          event_type?: string
          source_id?: string | null
          body_plain?: string | null
          body_html?: string | null
          amount?: number | null
          metadata?: Json | null
        }
        Relationships: []
      }
      tsl_builds: {
        Row: {
          id: string
          user_email: string
          product_slug: string
          concept_name: string
          cs: string | null
          funnel: string
          tsl_script_body: string | null
          images_json: Json | null
          ad_ids_json: Json | null
          ad_groups_json: Json | null
          ads_per_adset: number
          images_per_adset: number
          pipeline_status: string
          pipeline_push_enabled: boolean
          brief_doc_url: string | null
          drive_folder_url: string | null
          clickup_task_url: string | null
          persona: string | null
          angle: string | null
          main_pains_json: Json | null
          existing_script_id: string | null
          created_at: number
          updated_at: number
          sub_angle: string | null
        }
        Insert: {
          id: string
          user_email: string
          product_slug: string
          concept_name: string
          cs?: string | null
          funnel: string
          tsl_script_body?: string | null
          images_json?: Json | null
          ad_ids_json?: Json | null
          ad_groups_json?: Json | null
          ads_per_adset: number
          images_per_adset: number
          pipeline_status: string
          pipeline_push_enabled: boolean
          brief_doc_url?: string | null
          drive_folder_url?: string | null
          clickup_task_url?: string | null
          persona?: string | null
          angle?: string | null
          main_pains_json?: Json | null
          existing_script_id?: string | null
          created_at: number
          updated_at: number
          sub_angle?: string | null
        }
        Update: {
          id?: string
          user_email?: string
          product_slug?: string
          concept_name?: string
          cs?: string | null
          funnel?: string
          tsl_script_body?: string | null
          images_json?: Json | null
          ad_ids_json?: Json | null
          ad_groups_json?: Json | null
          ads_per_adset?: number
          images_per_adset?: number
          pipeline_status?: string
          pipeline_push_enabled?: boolean
          brief_doc_url?: string | null
          drive_folder_url?: string | null
          clickup_task_url?: string | null
          persona?: string | null
          angle?: string | null
          main_pains_json?: Json | null
          existing_script_id?: string | null
          created_at?: number
          updated_at?: number
          sub_angle?: string | null
        }
        Relationships: []
      }
      tsl_chat_jobs: {
        Row: {
          id: string
          chat_id: string
          user_email: string
          status: string
          title: string | null
          message: string | null
          format: string | null
          result: Json | null
          error: string | null
          cancelled: boolean
          created_at: number
          updated_at: number
        }
        Insert: {
          id: string
          chat_id: string
          user_email: string
          status: string
          title?: string | null
          message?: string | null
          format?: string | null
          result?: Json | null
          error?: string | null
          cancelled: boolean
          created_at: number
          updated_at: number
        }
        Update: {
          id?: string
          chat_id?: string
          user_email?: string
          status?: string
          title?: string | null
          message?: string | null
          format?: string | null
          result?: Json | null
          error?: string | null
          cancelled?: boolean
          created_at?: number
          updated_at?: number
        }
        Relationships: []
      }
      tsl_chats: {
        Row: {
          id: string
          user_email: string
          title: string
          product: string
          created_at: number
          updated_at: number
          format: string
          mode: string
          awareness_level: string | null
          checkpoint_state: Json | null
        }
        Insert: {
          id: string
          user_email: string
          title: string
          product: string
          created_at: number
          updated_at: number
          format: string
          mode: string
          awareness_level?: string | null
          checkpoint_state?: Json | null
        }
        Update: {
          id?: string
          user_email?: string
          title?: string
          product?: string
          created_at?: number
          updated_at?: number
          format?: string
          mode?: string
          awareness_level?: string | null
          checkpoint_state?: Json | null
        }
        Relationships: []
      }
      tsl_messages: {
        Row: {
          id: string
          chat_id: string
          role: string
          content: string
          created_at: number
        }
        Insert: {
          id: string
          chat_id: string
          role: string
          content: string
          created_at: number
        }
        Update: {
          id?: string
          chat_id?: string
          role?: string
          content?: string
          created_at?: number
        }
        Relationships: []
      }
      tsl_script_registry: {
        Row: {
          id: string
          product: string
          angle: string | null
          mechanism_rotation_slot: string | null
          opener_shape: string | null
          reveal_shape: string | null
          cta_kicker: string | null
          first_8_words: string | null
          named_threat_term: string | null
          duration_selected: number | null
          speaker_type: string | null
          lymph_metaphor: string | null
          p2_close_shape: string | null
          created_at: number
        }
        Insert: {
          id: string
          product: string
          angle?: string | null
          mechanism_rotation_slot?: string | null
          opener_shape?: string | null
          reveal_shape?: string | null
          cta_kicker?: string | null
          first_8_words?: string | null
          named_threat_term?: string | null
          duration_selected?: number | null
          speaker_type?: string | null
          lymph_metaphor?: string | null
          p2_close_shape?: string | null
          created_at: number
        }
        Update: {
          id?: string
          product?: string
          angle?: string | null
          mechanism_rotation_slot?: string | null
          opener_shape?: string | null
          reveal_shape?: string | null
          cta_kicker?: string | null
          first_8_words?: string | null
          named_threat_term?: string | null
          duration_selected?: number | null
          speaker_type?: string | null
          lymph_metaphor?: string | null
          p2_close_shape?: string | null
          created_at?: number
        }
        Relationships: []
      }
      tsl_scripts: {
        Row: {
          id: string
          tsl_script_id: string
          created_date: string
          gfolder_link: string | null
          created_at: string
          gdoc_link: string | null
          core_id: number
          variation: number
          brand_code: string
          product_code: string
          angle: string
          summary: string
          cs: string
          language: string
          variation_update: string
        }
        Insert: {
          id: string
          tsl_script_id: string
          created_date: string
          gfolder_link?: string | null
          created_at: string
          gdoc_link?: string | null
          core_id: number
          variation: number
          brand_code: string
          product_code: string
          angle: string
          summary: string
          cs: string
          language: string
          variation_update: string
        }
        Update: {
          id?: string
          tsl_script_id?: string
          created_date?: string
          gfolder_link?: string | null
          created_at?: string
          gdoc_link?: string | null
          core_id?: number
          variation?: number
          brand_code?: string
          product_code?: string
          angle?: string
          summary?: string
          cs?: string
          language?: string
          variation_update?: string
        }
        Relationships: []
      }
      tw_attributed_orders: {
        Row: {
          id: number
          store_id: string | null
          order_id: string | null
          order_total: number | null
          created_at: string | null
          source: string | null
          campaign_id: string | null
          campaign_name: string | null
          adset_id: string | null
          adset_name: string | null
          ad_id: string | null
          ad_name: string | null
          fetched_at: string | null
        }
        Insert: {
          id: number
          store_id?: string | null
          order_id?: string | null
          order_total?: number | null
          created_at?: string | null
          source?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          ad_id?: string | null
          ad_name?: string | null
          fetched_at?: string | null
        }
        Update: {
          id?: number
          store_id?: string | null
          order_id?: string | null
          order_total?: number | null
          created_at?: string | null
          source?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          ad_id?: string | null
          ad_name?: string | null
          fetched_at?: string | null
        }
        Relationships: []
      }
      tw_daily_metrics: {
        Row: {
          id: number
          store_id: string | null
          date: string
          total_sales: number | null
          new_customer_sales: number | null
          returning_customer_sales: number | null
          total_orders: number | null
          new_customer_orders: number | null
          returning_customer_orders: number | null
          aov: number | null
          new_customer_aov: number | null
          total_ad_spend: number | null
          fb_spend: number | null
          google_spend: number | null
          tiktok_spend: number | null
          total_roas: number | null
          new_customer_roas: number | null
          cogs: number | null
          shipping_costs: number | null
          payment_gateway_costs: number | null
          gross_profit: number | null
          net_profit: number | null
          total_refunds: number | null
          fetched_at: string | null
        }
        Insert: {
          id: number
          store_id?: string | null
          date: string
          total_sales?: number | null
          new_customer_sales?: number | null
          returning_customer_sales?: number | null
          total_orders?: number | null
          new_customer_orders?: number | null
          returning_customer_orders?: number | null
          aov?: number | null
          new_customer_aov?: number | null
          total_ad_spend?: number | null
          fb_spend?: number | null
          google_spend?: number | null
          tiktok_spend?: number | null
          total_roas?: number | null
          new_customer_roas?: number | null
          cogs?: number | null
          shipping_costs?: number | null
          payment_gateway_costs?: number | null
          gross_profit?: number | null
          net_profit?: number | null
          total_refunds?: number | null
          fetched_at?: string | null
        }
        Update: {
          id?: number
          store_id?: string | null
          date?: string
          total_sales?: number | null
          new_customer_sales?: number | null
          returning_customer_sales?: number | null
          total_orders?: number | null
          new_customer_orders?: number | null
          returning_customer_orders?: number | null
          aov?: number | null
          new_customer_aov?: number | null
          total_ad_spend?: number | null
          fb_spend?: number | null
          google_spend?: number | null
          tiktok_spend?: number | null
          total_roas?: number | null
          new_customer_roas?: number | null
          cogs?: number | null
          shipping_costs?: number | null
          payment_gateway_costs?: number | null
          gross_profit?: number | null
          net_profit?: number | null
          total_refunds?: number | null
          fetched_at?: string | null
        }
        Relationships: []
      }
      ugc_automation_runs: {
        Row: {
          id: string
          automation_id: string
          user_id: string
          status: string
          thought_process: string | null
          inspo_summary: string | null
          scripts_json: Json | null
          lineage_json: Json | null
          error: string | null
          started_at: string | null
          finished_at: string | null
          ads_query_applied: Json | null
          ad_ids_pulled: Json | null
          ads_count: number | null
          fallback_reason: string | null
          custom_prompt: string | null
        }
        Insert: {
          id: string
          automation_id: string
          user_id: string
          status: string
          thought_process?: string | null
          inspo_summary?: string | null
          scripts_json?: Json | null
          lineage_json?: Json | null
          error?: string | null
          started_at?: string | null
          finished_at?: string | null
          ads_query_applied?: Json | null
          ad_ids_pulled?: Json | null
          ads_count?: number | null
          fallback_reason?: string | null
          custom_prompt?: string | null
        }
        Update: {
          id?: string
          automation_id?: string
          user_id?: string
          status?: string
          thought_process?: string | null
          inspo_summary?: string | null
          scripts_json?: Json | null
          lineage_json?: Json | null
          error?: string | null
          started_at?: string | null
          finished_at?: string | null
          ads_query_applied?: Json | null
          ad_ids_pulled?: Json | null
          ads_count?: number | null
          fallback_reason?: string | null
          custom_prompt?: string | null
        }
        Relationships: []
      }
      ugc_automations: {
        Row: {
          id: string
          user_id: string
          name: string
          mode: string
          product: string
          angle: string | null
          persona: string | null
          pain_points: Json | null
          sub_angle: string | null
          avatar_type: string
          avatar_pool: Json | null
          scripts_per_run: number
          avatars_per_script: number
          iterate_from_ad_id: string | null
          iterate_criteria: Json | null
          cs_owner: string
          interval_minutes: number
          enabled: boolean
          created_at: string | null
          last_run_at: string | null
          next_run_at: string | null
          prompt_guide: string | null
          intended_platform: string | null
          static_bar_enabled: boolean | null
          static_bar_bg_color: string | null
          static_bar_text_color: string | null
          static_bar_duration_sec: number | null
          length_scope: string | null
          video_mode: string | null
          static_bar_schemes: Json | null
          static_bar_scheme_mode: string | null
          static_bar_scheme_pos: number | null
          avatar_types: Json | null
          idempotency_key: string | null
          saved_prompt: string | null
          saved_ads: Json | null
          saved_query: Json | null
          saved_at: string | null
          draft: boolean
        }
        Insert: {
          id: string
          user_id: string
          name: string
          mode: string
          product: string
          angle?: string | null
          persona?: string | null
          pain_points?: Json | null
          sub_angle?: string | null
          avatar_type: string
          avatar_pool?: Json | null
          scripts_per_run: number
          avatars_per_script: number
          iterate_from_ad_id?: string | null
          iterate_criteria?: Json | null
          cs_owner: string
          interval_minutes: number
          enabled: boolean
          created_at?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          prompt_guide?: string | null
          intended_platform?: string | null
          static_bar_enabled?: boolean | null
          static_bar_bg_color?: string | null
          static_bar_text_color?: string | null
          static_bar_duration_sec?: number | null
          length_scope?: string | null
          video_mode?: string | null
          static_bar_schemes?: Json | null
          static_bar_scheme_mode?: string | null
          static_bar_scheme_pos?: number | null
          avatar_types?: Json | null
          idempotency_key?: string | null
          saved_prompt?: string | null
          saved_ads?: Json | null
          saved_query?: Json | null
          saved_at?: string | null
          draft: boolean
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          mode?: string
          product?: string
          angle?: string | null
          persona?: string | null
          pain_points?: Json | null
          sub_angle?: string | null
          avatar_type?: string
          avatar_pool?: Json | null
          scripts_per_run?: number
          avatars_per_script?: number
          iterate_from_ad_id?: string | null
          iterate_criteria?: Json | null
          cs_owner?: string
          interval_minutes?: number
          enabled?: boolean
          created_at?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          prompt_guide?: string | null
          intended_platform?: string | null
          static_bar_enabled?: boolean | null
          static_bar_bg_color?: string | null
          static_bar_text_color?: string | null
          static_bar_duration_sec?: number | null
          length_scope?: string | null
          video_mode?: string | null
          static_bar_schemes?: Json | null
          static_bar_scheme_mode?: string | null
          static_bar_scheme_pos?: number | null
          avatar_types?: Json | null
          idempotency_key?: string | null
          saved_prompt?: string | null
          saved_ads?: Json | null
          saved_query?: Json | null
          saved_at?: string | null
          draft?: boolean
        }
        Relationships: []
      }
      ugc_builds: {
        Row: {
          id: string
          user_id: string
          product: string
          cs: string
          funnel: string
          phase: string
          status: string
          lineage_json: Json
          persona: string | null
          sub_angle: string | null
          main_pains: Json | null
          intended_platform: string | null
          error: string | null
          started_at: string | null
          finished_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          product: string
          cs: string
          funnel: string
          phase: string
          status: string
          lineage_json: Json
          persona?: string | null
          sub_angle?: string | null
          main_pains?: Json | null
          intended_platform?: string | null
          error?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at: string
          updated_at: string
        }
        Update: {
          id?: string
          user_id?: string
          product?: string
          cs?: string
          funnel?: string
          phase?: string
          status?: string
          lineage_json?: Json
          persona?: string | null
          sub_angle?: string | null
          main_pains?: Json | null
          intended_platform?: string | null
          error?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ugc_chats: {
        Row: {
          id: string
          user_id: string
          title: string
          product: string
          length_scope: string
          created_at: string
          updated_at: string
          format: string
          is_title_manually_edited: boolean | null
        }
        Insert: {
          id: string
          user_id: string
          title: string
          product: string
          length_scope: string
          created_at: string
          updated_at: string
          format: string
          is_title_manually_edited?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          product?: string
          length_scope?: string
          created_at?: string
          updated_at?: string
          format?: string
          is_title_manually_edited?: boolean | null
        }
        Relationships: []
      }
      ugc_messages: {
        Row: {
          id: string
          chat_id: string
          role: string
          content: string
          created_at: string
        }
        Insert: {
          id: string
          chat_id: string
          role: string
          content: string
          created_at: string
        }
        Update: {
          id?: string
          chat_id?: string
          role?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      ugc_script_registry: {
        Row: {
          id: string
          product: string
          skeleton: string
          chat_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          product: string
          skeleton: string
          chat_id?: string | null
          created_at: string
        }
        Update: {
          id?: string
          product?: string
          skeleton?: string
          chat_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: string
        }
        Insert: {
          id: string
          user_id: string
          role: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          name: string
          email: string
          password: string
          created_at: string
          roles: string[] | null
          user_type: string[]
          brand_ids: string[]
          custom_role_types: string[]
          first_name: string
          last_name: string
          allowed_routes: string[]
        }
        Insert: {
          id: string
          name: string
          email: string
          password: string
          created_at: string
          roles?: string[] | null
          user_type: string[]
          brand_ids: string[]
          custom_role_types: string[]
          first_name: string
          last_name: string
          allowed_routes: string[]
        }
        Update: {
          id?: string
          name?: string
          email?: string
          password?: string
          created_at?: string
          roles?: string[] | null
          user_type?: string[]
          brand_ids?: string[]
          custom_role_types?: string[]
          first_name?: string
          last_name?: string
          allowed_routes?: string[]
        }
        Relationships: []
      }
      v_conversation_thread: {
        Row: {
          conversation_id: string | null
          sender_label: string | null
          created_at: string | null
          is_operator: boolean | null
          is_auto_reply: boolean | null
          author_id: string | null
          body_plain: string | null
        }
        Insert: {
          conversation_id?: string | null
          sender_label?: string | null
          created_at?: string | null
          is_operator?: boolean | null
          is_auto_reply?: boolean | null
          author_id?: string | null
          body_plain?: string | null
        }
        Update: {
          conversation_id?: string | null
          sender_label?: string | null
          created_at?: string | null
          is_operator?: boolean | null
          is_auto_reply?: boolean | null
          author_id?: string | null
          body_plain?: string | null
        }
        Relationships: []
      }
      v_first_response: {
        Row: {
          conversation_id: string | null
          first_human_response_at: string | null
          first_responder_id: string | null
          first_response_body: string | null
        }
        Insert: {
          conversation_id?: string | null
          first_human_response_at?: string | null
          first_responder_id?: string | null
          first_response_body?: string | null
        }
        Update: {
          conversation_id?: string | null
          first_human_response_at?: string | null
          first_responder_id?: string | null
          first_response_body?: string | null
        }
        Relationships: []
      }
      v_message_counts: {
        Row: {
          conversation_id: string | null
          total_messages: number | null
          customer_messages: number | null
          human_replies: number | null
          auto_replies: number | null
        }
        Insert: {
          conversation_id?: string | null
          total_messages?: number | null
          customer_messages?: number | null
          human_replies?: number | null
          auto_replies?: number | null
        }
        Update: {
          conversation_id?: string | null
          total_messages?: number | null
          customer_messages?: number | null
          human_replies?: number | null
          auto_replies?: number | null
        }
        Relationships: []
      }
      video_generation_logs: {
        Row: {
          id: string
          created_at: string
          avatar_id: string | null
          generation_id: string
          scene_id: string | null
          product_name: string
          brand: string
          script: string
          cs: string | null
          generated_video_url: string
          final_video_url: string | null
          status: string
          in_pipeline: string
          is_product: boolean
          ads_script_id: number | null
          funnel: string | null
          scene_selection: string | null
          ad_id: string | null
          clickup_url: string | null
          concept: string | null
          intended_platform: string
          heygen_video_id: string
          pipeline_job_id: string
          caption_placement: string | null
          product_placement: string | null
          productc_config_url: string | null
          static_title_bar: Json | null
          static_bar_placement: string | null
          targeting_metadata: Json | null
          updated_at: string | null
          error_stage: string | null
          error_message: string | null
          failed_at: string | null
          preview_video_url: string | null
          pushed_at: string | null
          top_5_comparison_image: string | null
          scene_index: number | null
          playback_speed: number | null
          created_by: string | null
          video_format: string
          provider: string
          provider_job_id: string | null
          prompt: string | null
          fal_reference_image_url: Json | null
          origin: string | null
          original_final_video_url: string | null
          original_preview_video_url: string | null
          final_video_duration_sec: number | null
          final_playback_speed: number | null
          voice_speed: number | null
        }
        Insert: {
          id: string
          created_at: string
          avatar_id?: string | null
          generation_id: string
          scene_id?: string | null
          product_name: string
          brand: string
          script: string
          cs?: string | null
          generated_video_url: string
          final_video_url?: string | null
          status: string
          in_pipeline: string
          is_product: boolean
          ads_script_id?: number | null
          funnel?: string | null
          scene_selection?: string | null
          ad_id?: string | null
          clickup_url?: string | null
          concept?: string | null
          intended_platform: string
          heygen_video_id: string
          pipeline_job_id: string
          caption_placement?: string | null
          product_placement?: string | null
          productc_config_url?: string | null
          static_title_bar?: Json | null
          static_bar_placement?: string | null
          targeting_metadata?: Json | null
          updated_at?: string | null
          error_stage?: string | null
          error_message?: string | null
          failed_at?: string | null
          preview_video_url?: string | null
          pushed_at?: string | null
          top_5_comparison_image?: string | null
          scene_index?: number | null
          playback_speed?: number | null
          created_by?: string | null
          video_format: string
          provider: string
          provider_job_id?: string | null
          prompt?: string | null
          fal_reference_image_url?: Json | null
          origin?: string | null
          original_final_video_url?: string | null
          original_preview_video_url?: string | null
          final_video_duration_sec?: number | null
          final_playback_speed?: number | null
          voice_speed?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          avatar_id?: string | null
          generation_id?: string
          scene_id?: string | null
          product_name?: string
          brand?: string
          script?: string
          cs?: string | null
          generated_video_url?: string
          final_video_url?: string | null
          status?: string
          in_pipeline?: string
          is_product?: boolean
          ads_script_id?: number | null
          funnel?: string | null
          scene_selection?: string | null
          ad_id?: string | null
          clickup_url?: string | null
          concept?: string | null
          intended_platform?: string
          heygen_video_id?: string
          pipeline_job_id?: string
          caption_placement?: string | null
          product_placement?: string | null
          productc_config_url?: string | null
          static_title_bar?: Json | null
          static_bar_placement?: string | null
          targeting_metadata?: Json | null
          updated_at?: string | null
          error_stage?: string | null
          error_message?: string | null
          failed_at?: string | null
          preview_video_url?: string | null
          pushed_at?: string | null
          top_5_comparison_image?: string | null
          scene_index?: number | null
          playback_speed?: number | null
          created_by?: string | null
          video_format?: string
          provider?: string
          provider_job_id?: string | null
          prompt?: string | null
          fal_reference_image_url?: Json | null
          origin?: string | null
          original_final_video_url?: string | null
          original_preview_video_url?: string | null
          final_video_duration_sec?: number | null
          final_playback_speed?: number | null
          voice_speed?: number | null
        }
        Relationships: []
      }
      weekly_sheets: {
        Row: {
          id: number
          created_at: string
          weekly_batch: string | null
          sheet_name: string | null
          sheet_id: string | null
          sheet_url: string | null
          pod: string | null
          pod_link: string | null
          products: string[] | null
          slack_channel_id: string | null
        }
        Insert: {
          id: number
          created_at: string
          weekly_batch?: string | null
          sheet_name?: string | null
          sheet_id?: string | null
          sheet_url?: string | null
          pod?: string | null
          pod_link?: string | null
          products?: string[] | null
          slack_channel_id?: string | null
        }
        Update: {
          id?: number
          created_at?: string
          weekly_batch?: string | null
          sheet_name?: string | null
          sheet_id?: string | null
          sheet_url?: string | null
          pod?: string | null
          pod_link?: string | null
          products?: string[] | null
          slack_channel_id?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
