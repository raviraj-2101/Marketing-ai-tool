CREATE TABLE public.cs_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL,
  clickup_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (value)
);

ALTER TABLE public.cs_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cs_config" ON public.cs_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cs_config" ON public.cs_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update cs_config" ON public.cs_config FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete cs_config" ON public.cs_config FOR DELETE TO authenticated USING (true);