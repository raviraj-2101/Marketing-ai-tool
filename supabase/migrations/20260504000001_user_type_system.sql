-- Migration: Add user_type (multi-select), brand_ids, and custom_role_types columns
-- Replaces the old roles-based system with a new user_type array system

-- Add user_type as TEXT ARRAY (multi-select, can have multiple types)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_type TEXT[] NOT NULL DEFAULT '{}';

-- Add brand_ids for Custom users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS brand_ids UUID[] NOT NULL DEFAULT '{}';

-- Add custom_role_types for Custom users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS custom_role_types TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing data
-- If user has Admin role, set user_type to ['Admin']
UPDATE public.users SET user_type = ARRAY['Admin']
  WHERE 'Admin' = ANY(roles);

-- If user has Static Generator or Video Generator role, set user_type to ['Dev']
UPDATE public.users SET user_type = ARRAY['Dev']
  WHERE user_type = '{}'
    AND ('Static Generator' = ANY(roles) OR 'Video Generator' = ANY(roles));

-- Default remaining users to 'Custom'
UPDATE public.users SET user_type = ARRAY['Custom']
  WHERE user_type = '{}';

-- Update verify_user_password RPC to return user_type, brand_ids, and custom_role_types
CREATE OR REPLACE FUNCTION public.verify_user_password(p_email TEXT, p_password TEXT)
RETURNS TABLE (id UUID, first_name TEXT, last_name TEXT, name TEXT, email TEXT, roles TEXT[], user_type TEXT[], brand_ids UUID[], custom_role_types TEXT[], created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, first_name, last_name, name, email, roles, user_type, brand_ids, custom_role_types, created_at
  FROM public.users
  WHERE email = p_email
    AND password = crypt(p_password, password);
$$;
