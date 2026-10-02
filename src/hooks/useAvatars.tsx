import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";

export interface Avatar {
  id: string;
  name: string;
  image_url: string;
  reference_image_url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvatarGeneration {
  id: string;
  status: string;
  variant_count: number;
  reference_image_url: string | null;
  description: string | null;
  result_images: string[];
  created_at: string;
  updated_at: string;
}

export const useAvatars = () => {
  return useQuery({
    queryKey: ["avatars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avatars")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Avatar[];
    },
  });
};

export const useCreateAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (avatar: {
      name: string;
      image_url: string;
      reference_image_url?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from("avatars")
        .insert(avatar)
        .select()
        .single();

      if (error) throw error;
      return data as Avatar;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatars"] });
      toast({
        title: "Success",
        description: "Avatar saved successfully",
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

export const useDeleteAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("avatars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatars"] });
      toast({
        title: "Success",
        description: "Avatar deleted successfully",
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

export const useAvatarGenerations = () => {
  return useQuery({
    queryKey: ["avatar-generations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avatar_generations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((item) => ({
        ...item,
        result_images: (item.result_images as string[]) || [],
      })) as AvatarGeneration[];
    },
  });
};

export const useCreateAvatarGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (generation: {
      variant_count: number;
      reference_image_url?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from("avatar_generations")
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
      } as AvatarGeneration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar-generations"] });
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

export const useUpdateAvatarGeneration = () => {
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
        .from("avatar_generations")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        result_images: (data.result_images as string[]) || [],
      } as AvatarGeneration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar-generations"] });
    },
  });
};

export const useDeleteAvatarGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("avatar_generations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar-generations"] });
    },
  });
};
