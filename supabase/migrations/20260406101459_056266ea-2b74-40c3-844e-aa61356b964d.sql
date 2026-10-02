CREATE TABLE public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  funnel text NOT NULL,
  brand_id uuid,
  product_id uuid,
  cs text,
  concept_name text,
  title text,
  subtitle text,
  design_elements text,
  prompt_for_images text,
  number_of_ads text,
  max_variations_per_ad_group text,
  logo_name text,
  is_cta_button boolean DEFAULT false,
  cta_button_text text,
  is_multiple boolean DEFAULT false,
  is_badge boolean DEFAULT false,
  badge_text text,
  inspo_ids text[] DEFAULT '{}',
  selected_image_urls text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage form_templates" ON public.form_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);