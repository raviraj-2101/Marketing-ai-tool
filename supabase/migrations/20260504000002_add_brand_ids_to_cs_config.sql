-- Add brand_ids column to cs_config table
ALTER TABLE public.cs_config
  ADD COLUMN IF NOT EXISTS brand_ids UUID[] NOT NULL DEFAULT '{}';
