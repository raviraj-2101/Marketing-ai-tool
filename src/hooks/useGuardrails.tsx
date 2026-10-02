import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type GuardrailFunnel = "Comparison" | "Onbrand" | "TSL";

export interface Guardrail {
  id: string;
  name: string;
  description: string | null;
  funnel: GuardrailFunnel;
  created_at: string;
  updated_at: string;
}

export const useGuardrails = (funnel?: GuardrailFunnel) => {
  return useQuery({
    queryKey: ["guardrails", funnel ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("guardrails")
        .select("*")
        .order("created_at", { ascending: true });

      if (funnel) query = query.eq("funnel", funnel);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Guardrail[];
    },
  });
};

export const useCreateGuardrail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; funnel: GuardrailFunnel }) => {
      const { data, error } = await supabase
        .from("guardrails")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Guardrail;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guardrails"] });
      toast({ title: "Guardrail added" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
};

export const useUpdateGuardrail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      description?: string;
      funnel?: GuardrailFunnel;
    }) => {
      const { data, error } = await supabase
        .from("guardrails")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Guardrail;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guardrails"] });
      toast({ title: "Guardrail updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
};

export const useDeleteGuardrail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("guardrails").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guardrails"] });
      toast({ title: "Guardrail deleted" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
};
