-- ════════════════════════════════════════════════════════════════════════════════
-- Add RLS policies for custom_fields and ads tables
-- These tables need read access for the anon role (public Supabase client)
-- ════════════════════════════════════════════════════════════════════════════════

-- Enable RLS on custom_fields if not already enabled
ALTER TABLE IF EXISTS public.custom_fields ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on custom_fields
DROP POLICY IF EXISTS "anon_view_custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "anon_insert_custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "anon_update_custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "anon_delete_custom_fields" ON public.custom_fields;

-- Create policies for custom_fields (allow anon to read, insert, update, delete)
CREATE POLICY "anon_view_custom_fields" ON public.custom_fields FOR SELECT USING (true);
CREATE POLICY "anon_insert_custom_fields" ON public.custom_fields FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_custom_fields" ON public.custom_fields FOR UPDATE USING (true);
CREATE POLICY "anon_delete_custom_fields" ON public.custom_fields FOR DELETE USING (true);

-- Enable RLS on ads if not already enabled
ALTER TABLE IF EXISTS public.ads ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on ads
DROP POLICY IF EXISTS "anon_view_ads" ON public.ads;
DROP POLICY IF EXISTS "anon_insert_ads" ON public.ads;
DROP POLICY IF EXISTS "anon_update_ads" ON public.ads;
DROP POLICY IF EXISTS "anon_delete_ads" ON public.ads;

-- Create policies for ads (allow anon to read, insert, update, delete)
CREATE POLICY "anon_view_ads" ON public.ads FOR SELECT USING (true);
CREATE POLICY "anon_insert_ads" ON public.ads FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_ads" ON public.ads FOR UPDATE USING (true);
CREATE POLICY "anon_delete_ads" ON public.ads FOR DELETE USING (true);
