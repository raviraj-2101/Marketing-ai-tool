import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";

export interface Theme {
  id: string;
  name: string;
  content: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeFormData {
  name: string;
  content: string;
}

export const useThemes = () => {
  return useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Theme[];
    },
  });
};

export const useCreateTheme = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: ThemeFormData) => {
      const { data, error } = await supabase
        .from("themes")
        .insert({ name: formData.name, content: formData.content })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themes"] });
      toast({ title: "Theme created successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to create theme", description: getErrorMessage(error, "theme"), variant: "destructive" });
    },
  });
};

export const useUpdateTheme = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: ThemeFormData }) => {
      const { error } = await supabase
        .from("themes")
        .update({ name: formData.name, content: formData.content })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themes"] });
      toast({ title: "Theme updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to update theme", description: getErrorMessage(error, "theme"), variant: "destructive" });
    },
  });
};

export const useDeleteTheme = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("themes")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themes"] });
      toast({ title: "Theme deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to delete theme", description: getErrorMessage(error, "theme"), variant: "destructive" });
    },
  });
};
