import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaticsLog {
  id: string;
  ad_id: number;
  drive_link: string | null;
  brand_id: string | null;
  brand_name: string;
  product_id: string | null;
  product_name: string;
  cs: string | null;
  number_of_ads: string | null;
  concept_name: string | null;
  funnel: string;
  language: string | null;
  max_variations_per_ad_group: string | null;
  inspo_links: string[] | null;
  title: string | null;
  subtitle: string | null;
  design_elements: string | null;
  is_multiple: boolean;
  logo_name: string | null;
  is_cta_button: boolean;
  cta_button_text: string | null;
  is_badge: boolean;
  badge_text: string | null;
  prompt: string | null;
  prompt_for_images: string | null;
  selected_images: string[] | null;
  generated_images: string[] | null;
  file_naming_convention: string | null;
  description: string | null;
  clickup_task_id: string | null;
  clickup_task_url: string | null;
  image_generation_drive_link: string | null;
  images_folder_link: string | null;
  generation_id: string | null;
  status: string;
  week: string | null;
  creation_method: string | null;
  stage: string | null;
  clickup_task_status: string | null;
  priority: string | null;
  products_to_show: string | null;
  template_id: string | null;
  ad_db_sheet_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStaticsLogInput {
  drive_link?: string | null;
  brand_id?: string | null;
  brand_name: string;
  product_id?: string | null;
  product_name: string;
  cs?: string | null;
  number_of_ads?: string | null;
  concept_name?: string | null;
  funnel: string;
  language?: string | null;
  max_variations_per_ad_group?: string | null;
  inspo_links?: string[];
  title?: string | null;
  subtitle?: string | null;
  design_elements?: string | null;
  is_multiple?: boolean;
  logo_name?: string | null;
  is_cta_button?: boolean;
  cta_button_text?: string | null;
  is_badge?: boolean;
  badge_text?: string | null;
  prompt?: string | null;
  prompt_for_images?: string | null;
  selected_images?: string[];
  generated_images?: string[];
  file_naming_convention?: string | null;
  description?: string | null;
  clickup_task_id?: string | null;
  clickup_task_url?: string | null;
  week?: string | null;
  creation_method?: string | null;
  stage?: string | null;
  clickup_task_status?: string | null;
  generation_id?: string | null;
  status?: string;
  ad_db_sheet_id?: string | null;
}

export const useStaticsLogs = () => {
  return useQuery({
    queryKey: ["statics_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statics_logs")
        .select("*, products(ad_db_sheet_id)")
        .order("ad_id", { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        ad_db_sheet_id: row.products?.ad_db_sheet_id ?? null,
      })) as StaticsLog[];
    },
  });
};

export const useCreateStaticsLog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStaticsLogInput) => {
      const { data, error } = await supabase
        .from("statics_logs")
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data as StaticsLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statics_logs"] });
    },
  });
};

export const useUpdateStaticsLog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<CreateStaticsLogInput>) => {
      const { data, error } = await supabase
        .from("statics_logs")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as StaticsLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statics_logs"] });
    },
  });
};

export const useDeleteStaticsLog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("statics_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statics_logs"] });
    },
  });
};
