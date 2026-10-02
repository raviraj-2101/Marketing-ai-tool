-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Custom JWT Authentication System
-- Replaces Supabase Auth with custom JWT-based auth
-- ════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 1: Ensure pgcrypto extension
-- ════════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 2: Create public.users table (idempotent)
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password      TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'User',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_users_email UNIQUE (email)
);

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 3: Bcrypt password hashing trigger
-- Automatically hashes plaintext passwords using pgcrypto's crypt() with bcrypt.
-- Skips hashing if the password is already a bcrypt hash (prevents double-hashing).
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.hash_user_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.password IS DISTINCT FROM OLD.password) THEN
    IF NEW.password IS NOT NULL
       AND NEW.password != ''
       AND LEFT(NEW.password, 4) != '$2a$'
       AND LEFT(NEW.password, 4) != '$2b$' THEN
      NEW.password := crypt(NEW.password, gen_salt('bf', 10));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hash_password_before_insert ON public.users;
DROP TRIGGER IF EXISTS hash_password_before_update ON public.users;

CREATE TRIGGER hash_password_before_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.hash_user_password();

CREATE TRIGGER hash_password_before_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.hash_user_password();

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 4: Password verification RPC function
-- Called by the auth-login edge function to validate credentials.
-- SECURITY DEFINER allows anon role to call it without exposing password hashes.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.verify_user_password(
  p_email    TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  email      TEXT,
  role       TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.email,
    u.role,
    u.created_at
  FROM public.users u
  WHERE u.email = p_email
    AND u.password = crypt(p_password, u.password);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_user_password(TEXT, TEXT) TO anon;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 5: Drop auth_user_id column (no longer synced with Supabase Auth)
-- ════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.users DROP COLUMN IF EXISTS auth_user_id;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 6: Enable and lock RLS on public.users table
-- No policies = deny all. The manage-users edge function uses service_role,
-- which bypasses RLS entirely. The anon client has zero access to this table.
-- ════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Authenticated users can view users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can create users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can update users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can delete users" ON public.users;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 7: Update RLS on all other tables
-- Replace "TO authenticated USING (true)" policies with "USING (true)" for anon role.
-- This allows the anon Supabase client (which can no longer present an "authenticated"
-- JWT) to still read/write to these tables.
-- ════════════════════════════════════════════════════════════════════════════════

-- brands
DROP POLICY IF EXISTS "Authenticated users can view brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can create brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can update brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can delete brands" ON public.brands;

CREATE POLICY "anon_view_brands" ON public.brands FOR SELECT USING (true);
CREATE POLICY "anon_insert_brands" ON public.brands FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_brands" ON public.brands FOR UPDATE USING (true);
CREATE POLICY "anon_delete_brands" ON public.brands FOR DELETE USING (true);

-- publishers
DROP POLICY IF EXISTS "Authenticated users can view publishers" ON public.publishers;
DROP POLICY IF EXISTS "Authenticated users can create publishers" ON public.publishers;
DROP POLICY IF EXISTS "Authenticated users can update publishers" ON public.publishers;
DROP POLICY IF EXISTS "Authenticated users can delete publishers" ON public.publishers;

CREATE POLICY "anon_view_publishers" ON public.publishers FOR SELECT USING (true);
CREATE POLICY "anon_insert_publishers" ON public.publishers FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_publishers" ON public.publishers FOR UPDATE USING (true);
CREATE POLICY "anon_delete_publishers" ON public.publishers FOR DELETE USING (true);

-- products
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can create products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;

CREATE POLICY "anon_view_products" ON public.products FOR SELECT USING (true);
CREATE POLICY "anon_insert_products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "anon_delete_products" ON public.products FOR DELETE USING (true);

-- product_images
DROP POLICY IF EXISTS "Authenticated users can view product_images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated users can create product_images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated users can update product_images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated users can delete product_images" ON public.product_images;

CREATE POLICY "anon_all_product_images" ON public.product_images FOR ALL USING (true) WITH CHECK (true);

-- product_comparison_brands
DROP POLICY IF EXISTS "Authenticated users can view product_comparison_brands" ON public.product_comparison_brands;
DROP POLICY IF EXISTS "Authenticated users can create product_comparison_brands" ON public.product_comparison_brands;
DROP POLICY IF EXISTS "Authenticated users can update product_comparison_brands" ON public.product_comparison_brands;
DROP POLICY IF EXISTS "Authenticated users can delete product_comparison_brands" ON public.product_comparison_brands;

CREATE POLICY "anon_all_product_comparison_brands" ON public.product_comparison_brands FOR ALL USING (true) WITH CHECK (true);

-- product_drive_links
DROP POLICY IF EXISTS "Authenticated users can view product_drive_links" ON public.product_drive_links;
DROP POLICY IF EXISTS "Authenticated users can create product_drive_links" ON public.product_drive_links;
DROP POLICY IF EXISTS "Authenticated users can update product_drive_links" ON public.product_drive_links;
DROP POLICY IF EXISTS "Authenticated users can delete product_drive_links" ON public.product_drive_links;

CREATE POLICY "anon_all_product_drive_links" ON public.product_drive_links FOR ALL USING (true) WITH CHECK (true);

-- inspos
DROP POLICY IF EXISTS "Authenticated users can view inspos" ON public.inspos;
DROP POLICY IF EXISTS "Authenticated users can create inspos" ON public.inspos;
DROP POLICY IF EXISTS "Authenticated users can update inspos" ON public.inspos;
DROP POLICY IF EXISTS "Authenticated users can delete inspos" ON public.inspos;

CREATE POLICY "anon_all_inspos" ON public.inspos FOR ALL USING (true) WITH CHECK (true);

-- generation_logs
DROP POLICY IF EXISTS "Authenticated users can view generation_logs" ON public.generation_logs;
DROP POLICY IF EXISTS "Authenticated users can create generation_logs" ON public.generation_logs;
DROP POLICY IF EXISTS "Authenticated users can update generation_logs" ON public.generation_logs;
DROP POLICY IF EXISTS "Authenticated users can delete generation_logs" ON public.generation_logs;

CREATE POLICY "anon_all_generation_logs" ON public.generation_logs FOR ALL USING (true) WITH CHECK (true);

-- avatars
DROP POLICY IF EXISTS "Authenticated users can view avatars" ON public.avatars;
DROP POLICY IF EXISTS "Authenticated users can create avatars" ON public.avatars;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON public.avatars;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON public.avatars;

CREATE POLICY "anon_all_avatars" ON public.avatars FOR ALL USING (true) WITH CHECK (true);

-- scenes
DROP POLICY IF EXISTS "Authenticated users can view scenes" ON public.scenes;
DROP POLICY IF EXISTS "Authenticated users can create scenes" ON public.scenes;
DROP POLICY IF EXISTS "Authenticated users can update scenes" ON public.scenes;
DROP POLICY IF EXISTS "Authenticated users can delete scenes" ON public.scenes;

CREATE POLICY "anon_all_scenes" ON public.scenes FOR ALL USING (true) WITH CHECK (true);

-- avatar_generations
DROP POLICY IF EXISTS "Authenticated users can view avatar_generations" ON public.avatar_generations;
DROP POLICY IF EXISTS "Authenticated users can create avatar_generations" ON public.avatar_generations;
DROP POLICY IF EXISTS "Authenticated users can update avatar_generations" ON public.avatar_generations;
DROP POLICY IF EXISTS "Authenticated users can delete avatar_generations" ON public.avatar_generations;

CREATE POLICY "anon_all_avatar_generations" ON public.avatar_generations FOR ALL USING (true) WITH CHECK (true);

-- scene_generations
DROP POLICY IF EXISTS "Authenticated users can view scene_generations" ON public.scene_generations;
DROP POLICY IF EXISTS "Authenticated users can create scene_generations" ON public.scene_generations;
DROP POLICY IF EXISTS "Authenticated users can update scene_generations" ON public.scene_generations;
DROP POLICY IF EXISTS "Authenticated users can delete scene_generations" ON public.scene_generations;

CREATE POLICY "anon_all_scene_generations" ON public.scene_generations FOR ALL USING (true) WITH CHECK (true);

-- statics_logs
DROP POLICY IF EXISTS "Authenticated users can view statics_logs" ON public.statics_logs;
DROP POLICY IF EXISTS "Authenticated users can create statics_logs" ON public.statics_logs;
DROP POLICY IF EXISTS "Authenticated users can update statics_logs" ON public.statics_logs;
DROP POLICY IF EXISTS "Authenticated users can delete statics_logs" ON public.statics_logs;

CREATE POLICY "anon_all_statics_logs" ON public.statics_logs FOR ALL USING (true) WITH CHECK (true);

-- cs_config
DROP POLICY IF EXISTS "Authenticated users can view cs_config" ON public.cs_config;
DROP POLICY IF EXISTS "Authenticated users can insert cs_config" ON public.cs_config;
DROP POLICY IF EXISTS "Authenticated users can update cs_config" ON public.cs_config;
DROP POLICY IF EXISTS "Authenticated users can delete cs_config" ON public.cs_config;

CREATE POLICY "anon_all_cs_config" ON public.cs_config FOR ALL USING (true) WITH CHECK (true);

-- form_templates
DROP POLICY IF EXISTS "Authenticated users can manage form_templates" ON public.form_templates;

CREATE POLICY "anon_all_form_templates" ON public.form_templates FOR ALL USING (true) WITH CHECK (true);

-- tsl_scripts (keep existing public access if it has it, or update)
DROP POLICY IF EXISTS "Authenticated users can manage tsl_scripts" ON public.tsl_scripts;

CREATE POLICY "anon_all_tsl_scripts" ON public.tsl_scripts FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 8: Update Storage bucket policies
-- Replace "Authenticated users can *" policies with anon-accessible ones.
-- ════════════════════════════════════════════════════════════════════════════════

-- brand-logos
DROP POLICY IF EXISTS "Authenticated users can upload brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete brand logos" ON storage.objects;

CREATE POLICY "anon_upload_brand_logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'brand-logos');
CREATE POLICY "anon_update_brand_logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'brand-logos');
CREATE POLICY "anon_delete_brand_logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'brand-logos');

-- publisher-images
DROP POLICY IF EXISTS "Authenticated users can upload publisher images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update publisher images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete publisher images" ON storage.objects;

CREATE POLICY "anon_upload_publisher_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'publisher-images');
CREATE POLICY "anon_update_publisher_images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'publisher-images');
CREATE POLICY "anon_delete_publisher_images" ON storage.objects
  FOR DELETE USING (bucket_id = 'publisher-images');

-- product-docs
DROP POLICY IF EXISTS "Authenticated users can upload product docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product docs" ON storage.objects;

CREATE POLICY "anon_upload_product_docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-docs');
CREATE POLICY "anon_update_product_docs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-docs');
CREATE POLICY "anon_delete_product_docs" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-docs');

-- product-images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;

CREATE POLICY "anon_upload_product_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "anon_update_product_images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images');
CREATE POLICY "anon_delete_product_images" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images');

-- comparison-images
DROP POLICY IF EXISTS "Authenticated users can upload comparison images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update comparison images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete comparison images" ON storage.objects;

CREATE POLICY "anon_upload_comparison_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'comparison-images');
CREATE POLICY "anon_update_comparison_images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'comparison-images');
CREATE POLICY "anon_delete_comparison_images" ON storage.objects
  FOR DELETE USING (bucket_id = 'comparison-images');

-- ════════════════════════════════════════════════════════════════════════════════
-- End of migration
-- ════════════════════════════════════════════════════════════════════════════════
