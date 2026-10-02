-- Create avatars table
CREATE TABLE public.avatars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  reference_image_url TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scenes table
CREATE TABLE public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  avatar_id UUID NOT NULL REFERENCES public.avatars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  reference_image_url TEXT,
  prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(avatar_id, name)
);

-- Create avatar_generations table for tracking pending generations
CREATE TABLE public.avatar_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  variant_count INTEGER NOT NULL DEFAULT 1,
  reference_image_url TEXT,
  description TEXT,
  result_images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scene_generations table for tracking pending generations
CREATE TABLE public.scene_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  avatar_id UUID NOT NULL REFERENCES public.avatars(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  variant_count INTEGER NOT NULL DEFAULT 1,
  reference_image_url TEXT,
  prompt TEXT,
  result_images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_generations ENABLE ROW LEVEL SECURITY;

-- RLS policies for avatars
CREATE POLICY "Authenticated users can view avatars" ON public.avatars FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create avatars" ON public.avatars FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update avatars" ON public.avatars FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete avatars" ON public.avatars FOR DELETE USING (true);

-- RLS policies for scenes
CREATE POLICY "Authenticated users can view scenes" ON public.scenes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create scenes" ON public.scenes FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update scenes" ON public.scenes FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete scenes" ON public.scenes FOR DELETE USING (true);

-- RLS policies for avatar_generations
CREATE POLICY "Authenticated users can view avatar_generations" ON public.avatar_generations FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create avatar_generations" ON public.avatar_generations FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update avatar_generations" ON public.avatar_generations FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete avatar_generations" ON public.avatar_generations FOR DELETE USING (true);

-- RLS policies for scene_generations
CREATE POLICY "Authenticated users can view scene_generations" ON public.scene_generations FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create scene_generations" ON public.scene_generations FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update scene_generations" ON public.scene_generations FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete scene_generations" ON public.scene_generations FOR DELETE USING (true);

-- Enable realtime for generation tables (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.avatar_generations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scene_generations;

-- Create triggers for updated_at
CREATE TRIGGER update_avatars_updated_at BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON public.scenes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_avatar_generations_updated_at BEFORE UPDATE ON public.avatar_generations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scene_generations_updated_at BEFORE UPDATE ON public.scene_generations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();