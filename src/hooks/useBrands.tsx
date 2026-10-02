import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";

export interface Brand {
  id: string;
  name: string;
  brand_code: string;
  black_logo_url: string | null;
  white_logo_url: string | null;
  status: string;
  main_cs: string[];
  secondary_cs: string[];
  main_editor: string[];
  secondary_editor: string[];
  coordinator: string[];
  editor: string[];
  created_at: string;
  updated_at: string;
}

export interface BrandFormData {
  name: string;
  brand_code: string;
  blackLogo: File | null;
  whiteLogo: File | null;
}

const uploadLogo = async (file: File, brandId: string, type: "black" | "white"): Promise<string> => {
  const fileExt = file.name.split(".").pop();
  const fileName = `${brandId}/${type}-logo.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from("brand-logos")
    .upload(fileName, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from("brand-logos")
    .getPublicUrl(fileName);

  return data.publicUrl;
};

const deleteLogo = async (url: string) => {
  const path = url.split("/brand-logos/")[1];
  if (path) {
    await supabase.storage.from("brand-logos").remove([path]);
  }
};

export const useBrands = () => {
  return useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Brand[];
    },
  });
};

// Makes an All-Brands grant cover brands created LATER: every user holding one
// is written into the new brand's CS/Editor column (and its ClickUp group) by
// the manage-users edge function. Fail-soft — brand creation already succeeded
// by the time this runs, so a problem here must never surface as a failed
// create; it only means the backfill has to be re-run.
async function backfillAllBrandsUsers(brandId: string, token: string | null) {
  if (!token) return;
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "backfill-brand", payload: { brandId } }),
      }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      console.warn("[brands] All-Brands backfill failed for new brand", brandId, json?.error);
    }
  } catch (err) {
    console.warn("[brands] All-Brands backfill request failed for new brand", brandId, err);
  }
}

export const useCreateBrand = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (formData: BrandFormData) => {
      // First create the brand to get an ID
      const { data: brand, error } = await supabase
        .from("brands")
        .insert({ name: formData.name, brand_code: formData.brand_code })
        .select()
        .single();

      if (error) throw error;

      // Upload logos if provided
      let blackLogoUrl = null;
      let whiteLogoUrl = null;

      if (formData.blackLogo) {
        blackLogoUrl = await uploadLogo(formData.blackLogo, brand.id, "black");
      }
      if (formData.whiteLogo) {
        whiteLogoUrl = await uploadLogo(formData.whiteLogo, brand.id, "white");
      }

      // Update brand with logo URLs
      if (blackLogoUrl || whiteLogoUrl) {
        const { error: updateError } = await supabase
          .from("brands")
          .update({
            black_logo_url: blackLogoUrl,
            white_logo_url: whiteLogoUrl,
          })
          .eq("id", brand.id);

        if (updateError) throw updateError;
      }

      // Give existing All-Brands users their CS/Editor slot on this new brand.
      // (Cast: the generated Supabase types resolve this insert's row to `{}`.)
      await backfillAllBrandsUsers((brand as { id: string }).id, getToken());

      return brand;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Brand created successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to create brand", description: getErrorMessage(error, "brand"), variant: "destructive" });
    },
  });
};

export const useUpdateBrand = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData, existingBrand }: { id: string; formData: BrandFormData; existingBrand: Brand }) => {
      let blackLogoUrl = existingBrand.black_logo_url;
      let whiteLogoUrl = existingBrand.white_logo_url;

      // Upload new logos if provided
      if (formData.blackLogo) {
        if (existingBrand.black_logo_url) {
          await deleteLogo(existingBrand.black_logo_url);
        }
        blackLogoUrl = await uploadLogo(formData.blackLogo, id, "black");
      }
      if (formData.whiteLogo) {
        if (existingBrand.white_logo_url) {
          await deleteLogo(existingBrand.white_logo_url);
        }
        whiteLogoUrl = await uploadLogo(formData.whiteLogo, id, "white");
      }

      const { error } = await supabase
        .from("brands")
        .update({
          name: formData.name,
          brand_code: formData.brand_code,
          black_logo_url: blackLogoUrl,
          white_logo_url: whiteLogoUrl,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Brand updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to update brand", description: getErrorMessage(error, "brand"), variant: "destructive" });
    },
  });
};

export const useDeleteBrand = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (brand: Brand) => {
      // Delete logos from storage
      if (brand.black_logo_url) {
        await deleteLogo(brand.black_logo_url);
      }
      if (brand.white_logo_url) {
        await deleteLogo(brand.white_logo_url);
      }

      const { error } = await supabase
        .from("brands")
        .delete()
        .eq("id", brand.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({ title: "Brand deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to delete brand", description: getErrorMessage(error, "brand"), variant: "destructive" });
    },
  });
};
