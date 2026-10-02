import { useMemo } from "react";
import { useCsConfig } from "@/hooks/useCsConfig";

interface Brand {
  id: string;
  main_cs?: string[];
  secondary_cs?: string[];
}

interface CsConfigItem {
  id: string;
  label: string;
  value: string;
}

export function useSelectedBrandCsConfig(selectedBrandId: string, brands: Brand[] = []) {
  const { csConfig = [], isLoading } = useCsConfig();

  // Get main_cs and secondary_cs emails from selected brand
  const mainAndSecondaryEmails = useMemo(() => {
    if (!selectedBrandId || brands.length === 0) {
      return [];
    }

    const brand = brands.find((b) => b.id === selectedBrandId);
    if (!brand) {
      return [];
    }

    return [
      ...(brand.main_cs || []),
      ...(brand.secondary_cs || []),
    ];
  }, [selectedBrandId, brands]);

  // Filter cs_config to show only main_cs and secondary_cs from selected brand
  // Same logic as AddAdDialog: if brand has no main/secondary CS emails, show no options
  const filteredCsConfig = useMemo(() => {
    return selectedBrandId && mainAndSecondaryEmails.length > 0
      ? csConfig.filter((cs: CsConfigItem) =>
          mainAndSecondaryEmails.some(
            (email) => cs.value?.toLowerCase().trim() === email.toLowerCase().trim()
          )
        )
      : [];
  }, [selectedBrandId, mainAndSecondaryEmails, csConfig]);

  return { csConfig: filteredCsConfig, isLoading };
}
