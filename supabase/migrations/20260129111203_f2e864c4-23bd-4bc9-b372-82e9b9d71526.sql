-- Add inspo_links column to generation_logs table for storing selected inspiration drive links
ALTER TABLE public.generation_logs
ADD COLUMN inspo_links text[] DEFAULT '{}';

-- Add a comment for documentation
COMMENT ON COLUMN public.generation_logs.inspo_links IS 'Array of Google Drive links from selected Inspo items';