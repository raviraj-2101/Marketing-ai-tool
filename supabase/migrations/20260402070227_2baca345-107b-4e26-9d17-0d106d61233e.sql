
CREATE TABLE public.statics_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id serial NOT NULL,
  drive_link text,
  brand_id uuid REFERENCES public.brands(id),
  brand_name text NOT NULL,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  cs text,
  number_of_ads text,
  concept_name text,
  funnel text NOT NULL,
  language text,
  max_variations_per_ad_group text,
  inspo_links text[] DEFAULT '{}'::text[],
  title text,
  subtitle text,
  design_elements text,
  is_multiple boolean DEFAULT false,
  logo_name text,
  is_cta_button boolean DEFAULT false,
  cta_button_text text,
  is_badge boolean DEFAULT false,
  badge_text text,
  prompt text,
  selected_images jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'In Work'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.statics_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view statics_logs" ON public.statics_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create statics_logs" ON public.statics_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update statics_logs" ON public.statics_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete statics_logs" ON public.statics_logs FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_statics_logs_updated_at BEFORE UPDATE ON public.statics_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
