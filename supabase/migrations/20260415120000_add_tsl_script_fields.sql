ALTER TABLE public.tsl_scripts
  ADD COLUMN IF NOT EXISTS angle text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS variation_update text,
  ADD COLUMN IF NOT EXISTS cs text,
  ADD COLUMN IF NOT EXISTS language text;