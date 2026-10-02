import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";

export interface FormTemplate {
  id: string;
  name: string;
  funnel: string;
  brand_id: string | null;
  product_id: string | null;
  cs: string | null;
  concept_name: string | null;
  title: string | null;
  subtitle: string | null;
  design_elements: string | null;
  prompt_for_images: string | null;
  number_of_ads: string | null;
  max_variations_per_ad_group: string | null;
  logo_name: string | null;
  is_cta_button: boolean | null;
  cta_button_text: string | null;
  is_multiple: boolean | null;
  is_badge: boolean | null;
  badge_text: string | null;
  inspo_ids: string[] | null;
  selected_image_urls: string[] | null;
  products_to_show: string | null;
  created_at: string;
  updated_at: string;
}

export type FormTemplateFormData = Omit<FormTemplate, "id" | "created_at" | "updated_at">;

export const useFormTemplates = (funnel?: string) => {
  return useQuery({
    queryKey: ["form_templates", funnel],
    queryFn: async () => {
      let query = supabase
        .from("form_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (funnel) {
        query = query.eq("funnel", funnel);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FormTemplate[];
    },
  });
};

export const useCreateFormTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormTemplateFormData) => {
      const { data, error } = await supabase
        .from("form_templates")
        .insert(formData as any)
        .select()
        .single();

      if (error) throw error;
      return data as FormTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_templates"] });
      toast({ title: "Template created successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to create template", description: getErrorMessage(error, "template"), variant: "destructive" });
    },
  });
};

export const useUpdateFormTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<FormTemplateFormData> }) => {
      const { error } = await supabase
        .from("form_templates")
        .update(formData as any)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_templates"] });
      toast({ title: "Template updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to update template", description: getErrorMessage(error, "template"), variant: "destructive" });
    },
  });
};

export const useDeleteFormTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("form_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_templates"] });
      toast({ title: "Template deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to delete template", description: getErrorMessage(error, "template"), variant: "destructive" });
    },
  });
};
