import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCsConfig, CsConfigItem } from "@/hooks/useCsConfig";
import { isAllBrandsAccessUser } from "@/lib/brandAccess";

export function useFilteredCsConfig() {
  const { user, getToken } = useAuth();
  const { csConfig, isLoading } = useCsConfig();
  const [mainAndSecondaryEmails, setMainAndSecondaryEmails] = useState<string[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);

  const hasCustomType = user?.user_type?.includes("Custom");
  const isAllBrandsUser = isAllBrandsAccessUser(user);

  // Fetch brands and extract main_cs + secondary_cs emails
  useEffect(() => {
    if (!hasCustomType) {
      setMainAndSecondaryEmails([]);
      return;
    }
    if (!isAllBrandsUser && (!user?.brand_ids || user.brand_ids.length === 0)) {
      setMainAndSecondaryEmails([]);
      return;
    }

    const fetchBrandRoles = async () => {
      setIsLoadingBrands(true);
      try {
        const token = getToken();
        // All-Brands users fetch every brand row live (no id filter) so a
        // brand created after the grant was saved is picked up without
        // re-editing the user; scoped users keep the existing id-list query.
        const url = isAllBrandsUser
          ? `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/brands?select=main_cs,secondary_cs`
          : `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/brands?id=in.(${user.brand_ids.join(",")})`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });

        if (response.ok) {
          const brands = await response.json();
          // Collect all main_cs and secondary_cs emails from assigned brands
          const emails = new Set<string>();
          brands.forEach((brand: any) => {
            [...(brand.main_cs || []), ...(brand.secondary_cs || [])].forEach(
              (email: string) => emails.add(email)
            );
          });
          setMainAndSecondaryEmails(Array.from(emails));
        }
      } catch (err) {
        console.error("Failed to fetch brand roles:", err);
      } finally {
        setIsLoadingBrands(false);
      }
    };

    fetchBrandRoles();
  }, [user?.brand_ids, hasCustomType, isAllBrandsUser, getToken]);

  // Filter cs_config based on user type
  const filteredCsConfig = hasCustomType
    ? csConfig.filter((cs: CsConfigItem) =>
        mainAndSecondaryEmails.includes(cs.value)
      )
    : csConfig;

  return { csConfig: filteredCsConfig, isLoading: isLoading || isLoadingBrands };
}
