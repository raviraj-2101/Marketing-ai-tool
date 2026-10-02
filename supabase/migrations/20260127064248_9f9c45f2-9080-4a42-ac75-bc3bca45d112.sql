-- Create brands table
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  black_logo_url TEXT,
  white_logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view brands"
ON public.brands FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create brands"
ON public.brands FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update brands"
ON public.brands FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete brands"
ON public.brands FOR DELETE
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for brand logos
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-logos', 'brand-logos', true);

-- Storage policies
CREATE POLICY "Anyone can view brand logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated users can upload brand logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated users can update brand logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated users can delete brand logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand-logos');