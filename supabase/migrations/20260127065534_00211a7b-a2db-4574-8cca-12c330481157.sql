-- Create inspos table
CREATE TABLE public.inspos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  drive_link TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inspos ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view inspos"
ON public.inspos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create inspos"
ON public.inspos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update inspos"
ON public.inspos FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete inspos"
ON public.inspos FOR DELETE
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_inspos_updated_at
BEFORE UPDATE ON public.inspos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();