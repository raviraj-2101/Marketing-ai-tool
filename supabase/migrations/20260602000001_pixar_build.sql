-- Pixar "Build UGC" — async job tables for the two-step image pipeline.
-- Mirrors the avatar_generations / scene_generations convention:
--   permissive RLS, realtime enabled, updated_at trigger.
-- The Image Builder repo writes results back via the pixar-image-callback
-- edge function (it never touches these tables directly).

-- Step 1: main-character reference generation (returns 3 options).
CREATE TABLE public.pixar_character_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | failed
  product TEXT,
  product_label TEXT,
  style TEXT,
  -- main character meta, pulled from the storyboard meta block
  main_character TEXT,
  main_pain TEXT,
  storyline_pattern TEXT,
  description TEXT,
  variant_count INTEGER NOT NULL DEFAULT 3,
  callback_token TEXT,                     -- verified on callback
  result_avatars JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{url,label,seed?}]
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Step 2: per-scene image generation (4-5 images per scene).
CREATE TABLE public.pixar_scene_image_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | failed
  character_job_id UUID REFERENCES public.pixar_character_jobs(id) ON DELETE SET NULL,
  selected_avatar_url TEXT,
  product TEXT,
  product_label TEXT,
  style TEXT,
  storyboard JSONB NOT NULL DEFAULT '{}'::jsonb,       -- { meta, scenes:[...] }
  result_scenes JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{scene_number, images:[{url,prompt?}]}]
  callback_token TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS (permissive, matches the existing generation tables).
ALTER TABLE public.pixar_character_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixar_scene_image_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pixar_character_jobs" ON public.pixar_character_jobs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create pixar_character_jobs" ON public.pixar_character_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update pixar_character_jobs" ON public.pixar_character_jobs FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete pixar_character_jobs" ON public.pixar_character_jobs FOR DELETE USING (true);

CREATE POLICY "Authenticated users can view pixar_scene_image_jobs" ON public.pixar_scene_image_jobs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create pixar_scene_image_jobs" ON public.pixar_scene_image_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update pixar_scene_image_jobs" ON public.pixar_scene_image_jobs FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete pixar_scene_image_jobs" ON public.pixar_scene_image_jobs FOR DELETE USING (true);

-- Realtime (UI subscribes to UPDATE on these rows).
ALTER PUBLICATION supabase_realtime ADD TABLE public.pixar_character_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pixar_scene_image_jobs;

-- updated_at triggers.
CREATE TRIGGER update_pixar_character_jobs_updated_at BEFORE UPDATE ON public.pixar_character_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pixar_scene_image_jobs_updated_at BEFORE UPDATE ON public.pixar_scene_image_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
