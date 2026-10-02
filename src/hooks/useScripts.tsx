import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFilteredBrands } from '@/hooks/useFilteredBrands';

const isAdminUser = (userTypes?: string[]) => {
  if (!userTypes) return false;
  return userTypes.some(t => ["Super Admin", "Admin", "Dev"].includes(t));
};

export interface Script {
  id: string;
  script_id: number | null;
  brand: string | null;
  product: string | null;
  ad_id: number | null;
  creation_date: string | null;
  clickup_link: string | null;
  g_drive_link: string | null;
  framer_io_link: string | null;
  ad_brief_doc: string | null;
  created_at: string;
}

export const useScripts = (searchQuery: string = '', brandNames?: string[], brandCodes?: string[]) =>
  useQuery({
    queryKey: ['scripts', searchQuery, brandNames, brandCodes],
    queryFn: async () => {
      let query = supabase
        .from('scripts')
        .select('*')
        .order('script_id', { ascending: false });

      // Server-side filter by brand name or brand code
      if ((brandNames && brandNames.length > 0) || (brandCodes && brandCodes.length > 0)) {
        const orConditions: string[] = [];
        if (brandNames && brandNames.length > 0) {
          orConditions.push(...brandNames.map(name => `brand.eq.${name}`));
        }
        if (brandCodes && brandCodes.length > 0) {
          orConditions.push(...brandCodes.map(code => `brand.eq.${code}`));
        }
        if (orConditions.length > 0) {
          query = query.or(orConditions.join(','));
        }
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      // Client-side filter for search (only on script_id, brand, product, ad_id)
      if (!searchQuery.trim()) {
        return (data || []) as Script[];
      }

      const searchTerm = searchQuery.trim().toLowerCase();
      return (data || []).filter((script) => {
        const scriptIdMatch = String(script.script_id || '').toLowerCase().includes(searchTerm);
        const brandMatch = (script.brand || '').toLowerCase().includes(searchTerm);
        const productMatch = (script.product || '').toLowerCase().includes(searchTerm);
        const adIdMatch = String(script.ad_id || '').toLowerCase().includes(searchTerm);

        return scriptIdMatch || brandMatch || productMatch || adIdMatch;
      }) as Script[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useFilteredScripts = (searchQuery: string = '') => {
  const { user } = useAuth();
  const { data: userBrands = [] } = useFilteredBrands();

  // Check if user is admin/dev/super admin
  const isAdmin = isAdminUser(user?.user_type);

  // For admin/dev/super admin: show all scripts (no brand filtering)
  // For custom users: filter by their assigned brands
  const brandNames = !isAdmin && userBrands.length > 0 ? userBrands.map(b => b.name).filter(Boolean) : undefined;
  const brandCodes = !isAdmin && userBrands.length > 0 ? userBrands.map(b => b.brand_code).filter(Boolean) : undefined;

  const { data: scripts = [], ...rest } = useScripts(searchQuery, brandNames, brandCodes);

  return { ...rest, data: scripts };
};
