
CREATE TABLE public.product_drive_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  funnel_type text NOT NULL,
  drive_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, funnel_type)
);

ALTER TABLE public.product_drive_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view product_drive_links" ON public.product_drive_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create product_drive_links" ON public.product_drive_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_drive_links" ON public.product_drive_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete product_drive_links" ON public.product_drive_links FOR DELETE TO authenticated USING (true);
