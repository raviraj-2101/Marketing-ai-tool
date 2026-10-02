-- Repair pixar_video_jobs schema drift. The live table was created from an older
-- definition and is missing most columns that the app (useStartPixarVideo) inserts,
-- surfacing as PGRST204 "Could not find the 'character_job_id' column". This adds
-- every expected column idempotently so the remote matches 20260603000001_pixar_video.sql.

ALTER TABLE public.pixar_video_jobs
  ADD COLUMN IF NOT EXISTS scene_image_job_id  UUID REFERENCES public.pixar_scene_image_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS character_job_id    UUID REFERENCES public.pixar_character_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS product             TEXT,
  ADD COLUMN IF NOT EXISTS product_label       TEXT,
  ADD COLUMN IF NOT EXISTS style               TEXT,
  ADD COLUMN IF NOT EXISTS with_audio          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS music               TEXT,
  -- per-scene frames + metadata sent to Image Builder
  -- [{scene_number, keyframe_url, frame_urls, duration_s, spoken_line}]
  ADD COLUMN IF NOT EXISTS scenes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- updated_at was missing, so its trigger may be absent too. Recreate it idempotently.
DROP TRIGGER IF EXISTS update_pixar_video_jobs_updated_at ON public.pixar_video_jobs;
CREATE TRIGGER update_pixar_video_jobs_updated_at
  BEFORE UPDATE ON public.pixar_video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure realtime is publishing this table (no-op if already added).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pixar_video_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pixar_video_jobs;
  END IF;
END $$;

-- Refresh PostgREST's cached schema so the new columns are visible immediately.
NOTIFY pgrst, 'reload schema';
