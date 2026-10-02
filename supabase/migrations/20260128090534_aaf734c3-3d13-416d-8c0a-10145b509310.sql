-- Create sequence starting at 1
CREATE SEQUENCE IF NOT EXISTS generation_logs_display_id_seq START WITH 1;

-- Add display_id column with auto-increment
ALTER TABLE public.generation_logs 
ADD COLUMN display_id INTEGER NOT NULL DEFAULT nextval('generation_logs_display_id_seq');

-- Create index for faster lookups
CREATE INDEX idx_generation_logs_display_id ON public.generation_logs(display_id);