
CREATE TABLE public.tsl_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tsl_script_id integer NOT NULL UNIQUE,
  created_date text NOT NULL,
  gdrive_link text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tsl_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tsl_scripts" ON public.tsl_scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create tsl_scripts" ON public.tsl_scripts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update tsl_scripts" ON public.tsl_scripts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete tsl_scripts" ON public.tsl_scripts FOR DELETE TO authenticated USING (true);
CREATE POLICY "Public can insert tsl_scripts" ON public.tsl_scripts FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public can select tsl_scripts" ON public.tsl_scripts FOR SELECT TO public USING (true);
