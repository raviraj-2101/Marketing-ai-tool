-- Add ad_db_sheet_id column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ad_db_sheet_id TEXT NULL;
