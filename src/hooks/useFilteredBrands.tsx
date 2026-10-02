import { useAuth } from "@/hooks/useAuth";
import { useBrands } from "@/hooks/useBrands";
import { filterBrandScoped } from "@/lib/brandAccess";

export function useFilteredBrands() {
  const { user } = useAuth();
  const { data: allBrands = [], ...rest } = useBrands();

  // Super Admin/Admin/Dev users and All-Brands sentinel users see all brands
  // (current and future). Other users see only their assigned brands; an
  // empty brand_ids array falls back to "show everything" here (unchanged
  // from prior behavior).
  const data = filterBrandScoped(user, allBrands, (b) => b.id, { emptyMeansAll: true });

  return { ...rest, data };
}
