-- ════════════════════════════════════════════════════════════════════════════════
-- Add RLS policy for scripts table
-- This table needs read access for the anon role (public Supabase client)
-- ════════════════════════════════════════════════════════════════════════════════

-- Enable RLS on scripts if not already enabled
ALTER TABLE IF EXISTS public.scripts ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on scripts
DROP POLICY IF EXISTS "anon_view_scripts" ON public.scripts;
DROP POLICY IF EXISTS "anon_insert_scripts" ON public.scripts;
DROP POLICY IF EXISTS "anon_update_scripts" ON public.scripts;
DROP POLICY IF EXISTS "anon_delete_scripts" ON public.scripts;

-- Create policies for scripts (allow anon to read, insert, update, delete)
CREATE POLICY "anon_view_scripts" ON public.scripts FOR SELECT USING (true);
CREATE POLICY "anon_insert_scripts" ON public.scripts FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_scripts" ON public.scripts FOR UPDATE USING (true);
CREATE POLICY "anon_delete_scripts" ON public.scripts FOR DELETE USING (true);
