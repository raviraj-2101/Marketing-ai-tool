-- Migration: Add first_name and last_name columns with trigger to compute name

-- Add first_name and last_name columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Migrate existing data: split the name column into first_name and last_name
UPDATE public.users
SET
  first_name = TRIM(SPLIT_PART(COALESCE(name, ''), ' ', 1)),
  last_name = TRIM(SUBSTRING(COALESCE(name, '') FROM POSITION(' ' IN COALESCE(name, '')) + 1))
WHERE first_name IS NULL AND last_name IS NULL;

-- Create or replace trigger function to compute name from first_name and last_name
CREATE OR REPLACE FUNCTION public.compute_user_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Compute name from first_name and last_name
  NEW.name := TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name));

  -- Ensure name is never empty (fallback to email if needed)
  IF NEW.name = '' OR NEW.name IS NULL THEN
    NEW.name := NEW.email;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old triggers if they exist
DROP TRIGGER IF EXISTS compute_name_before_insert ON public.users;
DROP TRIGGER IF EXISTS compute_name_before_update ON public.users;

-- Create triggers to compute name before insert and update
CREATE TRIGGER compute_name_before_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.compute_user_name();

CREATE TRIGGER compute_name_before_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.compute_user_name();

-- Update verify_user_password function to ensure first_name and last_name are returned
CREATE OR REPLACE FUNCTION public.verify_user_password(p_email TEXT, p_password TEXT)
RETURNS TABLE (id UUID, first_name TEXT, last_name TEXT, name TEXT, email TEXT, roles TEXT[], user_type TEXT[], brand_ids UUID[], custom_role_types TEXT[], created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, first_name, last_name, name, email, roles, user_type, brand_ids, custom_role_types, created_at
  FROM public.users
  WHERE email = p_email
    AND password = crypt(p_password, password);
$$;
