-- Add file_naming_convention column to generation_logs table
ALTER TABLE public.generation_logs 
ADD COLUMN file_naming_convention text;