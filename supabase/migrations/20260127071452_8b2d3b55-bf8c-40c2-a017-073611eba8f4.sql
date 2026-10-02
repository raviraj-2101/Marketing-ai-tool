-- Create publishers table
CREATE TABLE public.publishers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;

-- RLS policies for publishers
CREATE POLICY "Authenticated users can view publishers" ON public.publishers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create publishers" ON public.publishers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update publishers" ON public.publishers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete publishers" ON public.publishers FOR DELETE TO authenticated USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_publishers_updated_at BEFORE UPDATE ON public.publishers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for publisher images
INSERT INTO storage.buckets (id, name, public) VALUES ('publisher-images', 'publisher-images', true);

-- Storage policies for publisher-images
CREATE POLICY "Authenticated users can upload publisher images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'publisher-images');
CREATE POLICY "Authenticated users can update publisher images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'publisher-images');
CREATE POLICY "Authenticated users can delete publisher images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'publisher-images');
CREATE POLICY "Anyone can view publisher images" ON storage.objects FOR SELECT USING (bucket_id = 'publisher-images');