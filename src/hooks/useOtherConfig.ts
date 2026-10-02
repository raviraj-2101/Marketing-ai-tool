import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useOtherConfig = () => {
  const query = useQuery({
    queryKey: ['other-config'],
    queryFn: async () => {
      console.log('[useOtherConfig] fetching points_config...');
      const { data, error } = await supabase
        .from('other_config' as any)
        .select('points_config')
        .eq('name', 'product_wise_config')
        .single();
      console.log('[useOtherConfig] fetch response - data:', data, 'error:', error);
      if (error) throw new Error(error.message);
      const result = (data?.points_config ?? []) as string[];
      console.log('[useOtherConfig] parsed result:', result, 'length:', result.length);
      return result;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (query.data) {
    console.log('[useOtherConfig] hook returning data:', query.data);
  }
  return query;
};
