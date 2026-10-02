-- ============================================================================
-- CS KPIs tab — new tables. Run MANUALLY against the marketing Supabase
-- (no drizzle-kit push). Reads the EXISTING `ads`, `brands`, `products`,
-- `cs_config` tables; adds the three below. Idempotent (IF NOT EXISTS).
-- ============================================================================

-- 1) Angle rows configured per product (admin-managed; seeded from sub_angle).
--    `sub_angle` is the value matched against ads.sub_angle to pull stats.
CREATE TABLE IF NOT EXISTS public.cs_kpi_angles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sub_angle   text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, sub_angle)
);

-- 2) CS columns shown for a product (admin-managed; chosen from the CS bank).
CREATE TABLE IF NOT EXISTS public.cs_kpi_cs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  cs_label    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, cs_label)
);

-- 3) The editable KPI targets — "ads required" per (product, angle, CS, week).
--    angle_key = the angle's sub_angle value, or '__no_angle__' for the catch-all row.
--    batch_week = ads.batch_week format `Y26W27`.
CREATE TABLE IF NOT EXISTS public.cs_kpi_targets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  angle_key   text NOT NULL,
  cs_label    text NOT NULL,
  batch_week  text NOT NULL,
  target      integer,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, angle_key, cs_label, batch_week)   -- supports upsert onConflict
);

CREATE INDEX IF NOT EXISTS idx_cs_kpi_targets_product ON public.cs_kpi_targets (product_id);
CREATE INDEX IF NOT EXISTS idx_cs_kpi_angles_product  ON public.cs_kpi_angles (product_id);
CREATE INDEX IF NOT EXISTS idx_cs_kpi_cs_product       ON public.cs_kpi_cs (product_id);

-- ── Optional seed for Lymphatic Drainage Drops (replace <PRODUCT_UUID>) ───────
-- INSERT INTO public.cs_kpi_angles (product_id, name, sub_angle, sort_order) VALUES
--   ('<PRODUCT_UUID>', 'Kidney', 'Kidney', 1),
--   ('<PRODUCT_UUID>', 'Man Boobs', 'Man Boobs', 2),
--   ('<PRODUCT_UUID>', 'Cholesterol', 'Cholesterol', 3),
--   ('<PRODUCT_UUID>', 'Blood Pressure', 'Blood Pressure', 4)
-- ON CONFLICT DO NOTHING;
