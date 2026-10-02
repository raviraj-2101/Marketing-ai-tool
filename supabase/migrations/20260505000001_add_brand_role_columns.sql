-- Add role assignment columns to brands table
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS main_cs text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS secondary_cs text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS coordinator text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS editor text[] DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN public.brands.main_cs IS 'Array of user emails assigned as Main CS';
COMMENT ON COLUMN public.brands.secondary_cs IS 'Array of user emails assigned as Secondary CS';
COMMENT ON COLUMN public.brands.coordinator IS 'Array of user emails assigned as Coordinator';
COMMENT ON COLUMN public.brands.editor IS 'Array of user emails assigned as Editor';
