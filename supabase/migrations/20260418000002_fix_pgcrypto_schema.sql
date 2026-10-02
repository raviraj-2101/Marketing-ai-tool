-- Fix: Supabase installs pgcrypto in the "extensions" schema, not "public".
-- Both functions need "extensions" in their search_path to call crypt() and gen_salt().

-- ── Fix hash_user_password trigger function ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.hash_user_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- ── Fix verify_user_password RPC function ─────────────────────────────────────
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
SET search_path = public, extensions
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
