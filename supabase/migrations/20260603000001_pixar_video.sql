-- Pixar "Build UGC" — final video job (step 3). One keyframe per scene is
-- animated + stitched + audio-mixed by the Image Builder into a single mp4.
-- Same async + realtime convention as the character / scene-image job tables.

CREATE TABLE public.pixar_video_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | failed
  scene_image_job_id UUID REFERENCES public.pixar_scene_image_jobs(id) ON DELETE SET NULL,
  character_job_id UUID REFERENCES public.pixar_character_jobs(id) ON DELETE SET NULL,
  selected_avatar_url TEXT,
  product TEXT,
  product_label TEXT,
  style TEXT,
  with_audio BOOLEAN NOT NULL DEFAULT true,
  music TEXT,
  -- the per-scene keyframes + metadata sent to the Image Builder
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{scene_number, keyframe_url, duration_s, spoken_line}]
  final_video_url TEXT,
  callback_token TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pixar_video_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view pixar_video_jobs"   ON public.pixar_video_jobs FOR SELECT USING (true);
CREATE POLICY "create pixar_video_jobs" ON public.pixar_video_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "update pixar_video_jobs" ON public.pixar_video_jobs FOR UPDATE USING (true);
CREATE POLICY "delete pixar_video_jobs" ON public.pixar_video_jobs FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pixar_video_jobs;

CREATE TRIGGER update_pixar_video_jobs_updated_at BEFORE UPDATE ON public.pixar_video_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
