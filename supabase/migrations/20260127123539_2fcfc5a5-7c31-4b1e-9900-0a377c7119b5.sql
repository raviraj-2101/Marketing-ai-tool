-- Create generation_logs table for storing generation history
CREATE TABLE public.generation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  row_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'In Work',
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  brand_name TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  theme_id UUID REFERENCES public.themes(id) ON DELETE SET NULL,
  theme_name TEXT NOT NULL,
  variant TEXT NOT NULL,
  cs TEXT,
  concept_name TEXT,
  prompt TEXT,
  selected_images JSONB DEFAULT '[]'::jsonb,
  drive_link TEXT,
  language TEXT,
  batch_week TEXT,
  generation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  generation_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view generation_logs"
ON public.generation_logs FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create generation_logs"
ON public.generation_logs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update generation_logs"
ON public.generation_logs FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete generation_logs"
ON public.generation_logs FOR DELETE
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_generation_logs_updated_at
BEFORE UPDATE ON public.generation_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();