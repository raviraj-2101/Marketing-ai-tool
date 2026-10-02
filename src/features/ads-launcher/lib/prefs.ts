import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type OperatorPrefs = {
  default_brand_id?: string | null;
  default_funnel?: "Onbrand" | "Comparison" | "TSL" | "Adv" | null;
  schedule_offset_hours?: number | null;
  default_launch_paused?: boolean | null;
  default_log_sort?: "" | "ad_id" | "name" | "status" | "variations" | null;
};

export function usePrefs() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["operator-prefs"],
    queryFn: () => api.get<{ ok: boolean; prefs: OperatorPrefs }>("/api/prefs"),
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (prefs: OperatorPrefs) =>
      api.put<{ ok: boolean }>("/api/prefs", { prefs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-prefs"] }),
  });
  return {
    prefs: data?.prefs ?? {},
    isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}
