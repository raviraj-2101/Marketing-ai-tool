import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";
import { useBrands } from "@/hooks/useBrands";
import { useUsers } from "@/hooks/useUsers";
import { User } from "@/hooks/useUsers";
import { ALL_BRANDS_SENTINEL, isAllBrandsAccessUser } from "@/lib/brandAccess";

export const useBrandCsAssignment = () => {
  const queryClient = useQueryClient();
  const { data: brands = [], isLoading: brandsLoading } = useBrands();
  const { data: users = [], isLoading: usersLoading } = useUsers();

  const getEligibleCsUsers = (brandId: string): User[] => {
    return users.filter((u) => {
      const isCustom = u.user_type?.includes("Custom");
      const isAllBrandsUser = isAllBrandsAccessUser(u);
      const hasBrandAccess = isAllBrandsUser || u.brand_ids?.includes(brandId);
      const hasRoleType = isAllBrandsUser
        ? u.custom_role_types?.some((rt) => rt.startsWith(`${ALL_BRANDS_SENTINEL}:`))
        : u.custom_role_types?.some((rt) => rt.startsWith(`${brandId}:`));
      return isCustom && hasBrandAccess && hasRoleType;
    });
  };

  const assignMainCs = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedMainCs = Array.from(
        new Set([...(brand.main_cs || []), normalizedEmail])
      );

      const { error } = await supabase
        .from("brands")
        .update({ main_cs: updatedMainCs })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Main CS assigned successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to assign Main CS",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const removeMainCs = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedMainCs = (brand.main_cs || []).filter(
        (e) => e.toLowerCase().trim() !== normalizedEmail
      );

      const { error } = await supabase
        .from("brands")
        .update({ main_cs: updatedMainCs })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Main CS removed successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove Main CS",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const assignSecondaryCs = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedSecondaryCs = Array.from(
        new Set([...(brand.secondary_cs || []), normalizedEmail])
      );

      const { error } = await supabase
        .from("brands")
        .update({ secondary_cs: updatedSecondaryCs })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Secondary CS added successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to add Secondary CS",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const removeSecondaryCs = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedSecondaryCs = (brand.secondary_cs || []).filter(
        (e) => e.toLowerCase().trim() !== normalizedEmail
      );

      const { error } = await supabase
        .from("brands")
        .update({ secondary_cs: updatedSecondaryCs })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Secondary CS removed successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove Secondary CS",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const assignMainEditor = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedMainEditor = Array.from(
        new Set([...(brand.main_editor || []), normalizedEmail])
      );

      const { error } = await supabase
        .from("brands")
        .update({ main_editor: updatedMainEditor })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Main Editor assigned successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to assign Main Editor",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const removeMainEditor = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedMainEditor = (brand.main_editor || []).filter(
        (e) => e.toLowerCase().trim() !== normalizedEmail
      );

      const { error } = await supabase
        .from("brands")
        .update({ main_editor: updatedMainEditor })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Main Editor removed successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove Main Editor",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const assignSecondaryEditor = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedSecondaryEditor = Array.from(
        new Set([...(brand.secondary_editor || []), normalizedEmail])
      );

      const { error } = await supabase
        .from("brands")
        .update({ secondary_editor: updatedSecondaryEditor })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Secondary Editor added successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to add Secondary Editor",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  const removeSecondaryEditor = useMutation({
    mutationFn: async ({ brandId, email }: { brandId: string; email: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const brand = brands.find((b) => b.id === brandId);
      if (!brand) throw new Error("Brand not found");

      const updatedSecondaryEditor = (brand.secondary_editor || []).filter(
        (e) => e.toLowerCase().trim() !== normalizedEmail
      );

      const { error } = await supabase
        .from("brands")
        .update({ secondary_editor: updatedSecondaryEditor })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Secondary Editor removed successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove Secondary Editor",
        description: getErrorMessage(error, "brand"),
        variant: "destructive",
      });
    },
  });

  return {
    brands,
    users,
    brandsLoading,
    usersLoading,
    getEligibleCsUsers,
    assignMainCs,
    removeMainCs,
    assignSecondaryCs,
    removeSecondaryCs,
    assignMainEditor,
    removeMainEditor,
    assignSecondaryEditor,
    removeSecondaryEditor,
  };
};
