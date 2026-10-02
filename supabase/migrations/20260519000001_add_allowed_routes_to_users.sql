-- Migration: Add allowed_routes column to users table for Custom user route-based permissions

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS allowed_routes TEXT[] NOT NULL DEFAULT '{}';

-- Must DROP first — CREATE OR REPLACE cannot change RETURNS TABLE column list
DROP FUNCTION IF EXISTS public.verify_user_password(TEXT, TEXT);

CREATE FUNCTION public.verify_user_password(p_email TEXT, p_password TEXT)
RETURNS TABLE (
  id               UUID,
  first_name       TEXT,
  last_name        TEXT,
  name             TEXT,
  email            TEXT,
  roles            TEXT[],
  user_type        TEXT[],
  brand_ids        UUID[],
  custom_role_types TEXT[],
  allowed_routes   TEXT[],
  created_at       TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, first_name, last_name, name, email, roles, user_type, brand_ids, custom_role_types, allowed_routes, created_at
  FROM public.users
  WHERE email = p_email
    AND password = crypt(p_password, password)
  ORDER BY created_at DESC
  LIMIT 1;
$$;
