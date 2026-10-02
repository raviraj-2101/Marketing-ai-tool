import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessages";

export interface InspoBriefItem {
  name: string;
  description: string;
}

export interface Inspo {
  id: string;
  name: string;
  drive_link: string;
  funnel_type: string[];
  inspo_brief: InspoBriefItem[] | null;
  inspo_brief_status: string | null;
  created_at: string;
  updated_at: string;
}

const triggerInspoBreifGeneration = (inspoId: string, driveLink: string, funnelTypes: string[]) => {
  // Use "adv" if inspo supports it, otherwise use first funnel type or default to "comparison"
  const funnel = funnelTypes?.includes("adv") ? "adv" : (funnelTypes?.[0] || "comparison");
  supabase.functions
    .invoke("generate-inspo-brief", { body: { inspo_id: inspoId, drive_link: driveLink, funnel } })
    .catch((e) => console.error("[useInspos] generate-inspo-brief failed:", e));
};

export const useInspos = () => {
  const queryClient = useQueryClient();

  const { data: inspos, isLoading } = useQuery({
    queryKey: ["inspos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Inspo[];
    },
  });

  const createInspo = useMutation({
    mutationFn: async ({ name, drive_link, funnel_type }: { name: string; drive_link: string; funnel_type: string[] }) => {
      const { data, error } = await supabase
        .from("inspos")
        .insert([{ name, drive_link, funnel_type }])
        .select()
        .single();

      if (error) throw error;
      return data as Inspo;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["inspos"] });
      toast.success("Inspo created successfully");
      // Trigger brief generation in the background; re-fetch after a delay to pick up status
      triggerInspoBreifGeneration(data.id, data.drive_link, data.funnel_type);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["inspos"] }), 3000);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "inspiration"));
    },
  });

  const updateInspo = useMutation({
    mutationFn: async ({ id, name, drive_link, funnel_type }: { id: string; name: string; drive_link: string; funnel_type: string[] }) => {
      const { data, error } = await supabase
        .from("inspos")
        .update({ name, drive_link, funnel_type })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Inspo;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["inspos"] });
      toast.success("Inspo updated successfully");
      // Re-generate brief whenever drive link or name changes
      triggerInspoBreifGeneration(data.id, data.drive_link, data.funnel_type);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["inspos"] }), 3000);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "inspiration"));
    },
  });

  const deleteInspo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inspos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspos"] });
      toast.success("Inspo deleted successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "inspiration"));
    },
  });

  return {
    inspos,
    isLoading,
    createInspo,
    updateInspo,
    deleteInspo,
  };
};
