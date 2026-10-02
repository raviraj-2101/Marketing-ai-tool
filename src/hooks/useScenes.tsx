import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";

export interface Scene {
  id: string;
  avatar_id: string;
  name: string;
  image_url: string;
  reference_image_url: string | null;
  prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface SceneGeneration {
  id: string;
  avatar_id: string;
  status: string;
  variant_count: number;
  reference_image_url: string | null;
  prompt: string | null;
  result_images: string[];
  created_at: string;
  updated_at: string;
}

export const useScenes = (avatarId?: string) => {
  return useQuery({
    queryKey: ["scenes", avatarId],
    queryFn: async () => {
      let query = supabase
        .from("scenes")
        .select("*")
        .order("created_at", { ascending: false });

      if (avatarId) {
        query = query.eq("avatar_id", avatarId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Scene[];
    },
  });
};

export const useCreateScene = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scene: {
      avatar_id: string;
      name: string;
      image_url: string;
      reference_image_url?: string;
      prompt?: string;
    }) => {
      const { data, error } = await supabase
        .from("scenes")
        .insert(scene)
        .select()
        .single();

      if (error) throw error;
      return data as Scene;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      toast({
        title: "Success",
        description: "Scene saved successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
};

export const useDeleteScene = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scenes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      toast({
        title: "Success",
        description: "Scene deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
};

export const useSceneGenerations = (avatarId?: string) => {
  return useQuery({
    queryKey: ["scene-generations", avatarId],
    queryFn: async () => {
      let query = supabase
        .from("scene_generations")
        .select("*")
        .order("created_at", { ascending: false });

      if (avatarId) {
        query = query.eq("avatar_id", avatarId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []).map((item) => ({
        ...item,
        result_images: (item.result_images as string[]) || [],
      })) as SceneGeneration[];
    },
  });
};

export const useCreateSceneGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (generation: {
      avatar_id: string;
      variant_count: number;
      reference_image_url?: string;
      prompt?: string;
    }) => {
      const { data, error } = await supabase
        .from("scene_generations")
        .insert({
          ...generation,
          status: "pending",
          result_images: [],
        })
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        result_images: (data.result_images as string[]) || [],
      } as SceneGeneration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-generations"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
};

export const useUpdateSceneGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      result_images,
    }: {
      id: string;
      status?: string;
      result_images?: string[];
    }) => {
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (result_images) updateData.result_images = result_images;

      const { data, error } = await supabase
        .from("scene_generations")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        result_images: (data.result_images as string[]) || [],
      } as SceneGeneration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-generations"] });
    },
  });
};

export const useDeleteSceneGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scene_generations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-generations"] });
    },
  });
};
