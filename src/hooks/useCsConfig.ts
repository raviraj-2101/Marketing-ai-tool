import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CsConfig {
  id: string;
  label: string | null;
  value: string | null;
  clickup_user_id: string | null;
}

export const useCsConfig = () =>
  useQuery({
    queryKey: ['cs-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cs_config')
        .select('id, label, value, clickup_user_id')
        .order('label', { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as CsConfig[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
