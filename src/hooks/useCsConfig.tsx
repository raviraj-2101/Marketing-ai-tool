import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CsConfigItem {
  id: string;
  label: string;
  value: string;
  clickup_user_id: string | null;
  created_at: string;
}

export const useCsConfig = () => {
  const { data: csConfig = [], isLoading } = useQuery({
    queryKey: ["cs_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_config")
        .select("id, label, value, clickup_user_id, created_at")
        .order("label", { ascending: true });
      if (error) throw error;
      return data as CsConfigItem[];
    },
  });

  return { csConfig, isLoading };
};
