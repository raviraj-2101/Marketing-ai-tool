-- Create storage bucket for launch assets (uploaded images/videos)
-- Public bucket so uploaded files get a stable public URL.
INSERT INTO storage.buckets (id, name, public) VALUES ('launch-assets', 'launch-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — anon-accessible to match the rest of the project.
-- This app uses custom JWT auth (persistSession: false), so the Supabase
-- client always presents the anon role; "TO authenticated" policies block all uploads.
CREATE POLICY "anon_select_launch_assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'launch-assets');

CREATE POLICY "anon_upload_launch_assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'launch-assets');

CREATE POLICY "anon_update_launch_assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'launch-assets');

CREATE POLICY "anon_delete_launch_assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'launch-assets');
