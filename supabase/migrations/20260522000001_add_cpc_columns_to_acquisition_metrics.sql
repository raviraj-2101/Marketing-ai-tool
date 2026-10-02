ALTER TABLE acquisition_metrics
  ADD COLUMN IF NOT EXISTS "cpcSpend"     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cpcOutClicks" numeric DEFAULT 0;
