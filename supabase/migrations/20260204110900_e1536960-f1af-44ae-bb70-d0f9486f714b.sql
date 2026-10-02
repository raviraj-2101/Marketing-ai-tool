-- Create storage buckets for avatar and scene images
INSERT INTO storage.buckets (id, name, public) VALUES ('avatar-images', 'avatar-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('scene-images', 'scene-images', true);

-- Create storage policies for avatar-images
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatar-images');
CREATE POLICY "Authenticated users can upload avatar images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatar-images');
CREATE POLICY "Authenticated users can update avatar images" ON storage.objects FOR UPDATE USING (bucket_id = 'avatar-images');
CREATE POLICY "Authenticated users can delete avatar images" ON storage.objects FOR DELETE USING (bucket_id = 'avatar-images');

-- Create storage policies for scene-images
CREATE POLICY "Scene images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'scene-images');
CREATE POLICY "Authenticated users can upload scene images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'scene-images');
CREATE POLICY "Authenticated users can update scene images" ON storage.objects FOR UPDATE USING (bucket_id = 'scene-images');
CREATE POLICY "Authenticated users can delete scene images" ON storage.objects FOR DELETE USING (bucket_id = 'scene-images');