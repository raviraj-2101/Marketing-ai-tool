ALTER TABLE public.tsl_scripts RENAME COLUMN gdrive_link TO gfolder_link;
ALTER TABLE public.tsl_scripts ADD COLUMN gdoc_link text;
ALTER TABLE public.tsl_scripts DROP COLUMN IF EXISTS note;