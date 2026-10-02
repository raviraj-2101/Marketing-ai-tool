import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";

export interface GenerationLog {
  id: string;
  display_id: number;
  row_name: string;
  status: string;
  brand_id: string | null;
  brand_name: string;
  product_id: string | null;
  product_name: string;
  theme_id: string | null;
  theme_name: string;
  variant: string;
  cs: string | null;
  concept_name: string | null;
  prompt: string | null;
  selected_images: string[];
  inspo_links: string[];
  drive_link: string | null;
  language: string | null;
  batch_week: string | null;
  file_naming_convention: string | null;
  generation_date: string;
  generation_timestamp: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGenerationLogInput {
  row_name: string;
  status?: string;
  brand_id: string | null;
  brand_name: string;
  product_id: string | null;
  product_name: string;
  theme_id: string | null;
  theme_name: string;
  variant: string;
  cs?: string | null;
  concept_name?: string | null;
  prompt?: string | null;
  selected_images?: string[];
  inspo_links?: string[];
  drive_link?: string | null;
  language?: string | null;
  batch_week?: string | null;
  file_naming_convention?: string | null;
}

export const useGenerationLogs = () => {
  return useQuery({
    queryKey: ["generation_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generation_logs")
        .select("*")
        .order("generation_timestamp", { ascending: false });

      if (error) throw error;
      return data as GenerationLog[];
    },
  });
};

export const useCreateGenerationLog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateGenerationLogInput) => {
      const { data, error } = await supabase
        .from("generation_logs")
        .insert({
          ...input,
          selected_images: input.selected_images || [],
          inspo_links: input.inspo_links || [],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generation_logs"] });
      // Toast is handled in GeneratorForm after API call
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
};

export const useUpdateGenerationLog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<GenerationLog> & { id: string }) => {
      const { data, error } = await supabase
        .from("generation_logs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generation_logs"] });
      toast({
        title: "Log updated",
        description: "Generation log has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
};

export const useDeleteGenerationLog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("generation_logs")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generation_logs"] });
      toast({
        title: "Log deleted",
        description: "Generation log has been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
};
