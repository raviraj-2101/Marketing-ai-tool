-- Migration: Convert role TEXT → roles TEXT[] for RBAC
-- Add roles array column and migrate existing data

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing role data to roles array
UPDATE public.users SET roles = ARRAY['Admin'] WHERE role = 'Admin';
UPDATE public.users SET roles = ARRAY['CS'] WHERE role != 'Admin';

-- Drop the old role column
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

-- Update verify_user_password RPC to return roles[]
CREATE OR REPLACE FUNCTION public.verify_user_password(p_email TEXT, p_password TEXT)
RETURNS TABLE (id UUID, name TEXT, email TEXT, roles TEXT[], created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, name, email, roles, created_at
  FROM public.users
  WHERE email = p_email
    AND password = crypt(p_password, password);
$$;
