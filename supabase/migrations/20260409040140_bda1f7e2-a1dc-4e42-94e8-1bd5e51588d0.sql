ALTER TABLE public.inspos
  ALTER COLUMN funnel_type DROP DEFAULT,
  ALTER COLUMN funnel_type TYPE text[]
    USING ARRAY[funnel_type],
  ALTER COLUMN funnel_type SET DEFAULT '{onbrand}'::text[];