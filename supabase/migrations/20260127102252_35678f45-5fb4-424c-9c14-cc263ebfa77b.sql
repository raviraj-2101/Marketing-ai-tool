-- Create themes table
CREATE TABLE public.themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint on name
ALTER TABLE public.themes ADD CONSTRAINT unique_theme_name UNIQUE (name);

-- Enable RLS
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users
CREATE POLICY "Authenticated users can view themes" 
ON public.themes 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create themes" 
ON public.themes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update themes" 
ON public.themes 
FOR UPDATE 
USING (true);

CREATE POLICY "Authenticated users can delete themes" 
ON public.themes 
FOR DELETE 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_themes_updated_at
BEFORE UPDATE ON public.themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();