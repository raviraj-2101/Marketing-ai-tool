import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";

const PIPELINE_API_BASE_URL = import.meta.env.VITE_PIPELINE_API_BASE_URL as string;

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  explanation: string;
  order_index: number;
  created_at: string;
}

/** Real holding/reference example photos (e.g. real people holding the product) —
 *  a separate collection from product_images so packshots and examples never mix.
 *  Used as GPT grip/scale references in the Add-a-Look flow. */
export interface ProductReferenceImage {
  id: string;
  product_id: string;
  image_url: string;
  explanation: string;
  order_index: number;
  created_at: string;
}

export interface ProductComparisonBrand {
  id: string;
  product_id: string;
  image_url: string;
  brand_name: string;
  order_index: number;
  created_at: string;
}

export interface ProductDriveLink {
  id: string;
  product_id: string;
  funnel_type: string;
  drive_link: string;
  created_at: string;
}

export interface Product {
  id: string;
  brand_id: string | null;
  publisher_id: string | null;
  name: string;
  product_code: string;
  docs_file_url: string | null;
  generated_images_drive_link: string | null;
  guidelines: string | null;
  publisher_comparison: string | null;
  product_brief: string | null;
  ad_db_sheet_id: string | null;
  productc_config_url: string | null;
  top_5_comparison_image: string | null;
  created_at: string;
  updated_at: string;
  brands?: { id: string; name: string; black_logo_url: string | null; white_logo_url: string | null } | null;
  publishers?: { id: string; name: string; image_url: string | null } | null;
  product_images?: ProductImage[];
  product_reference_images?: ProductReferenceImage[];
  product_comparison_brands?: ProductComparisonBrand[];
  product_drive_links?: ProductDriveLink[];
}

export interface ProductFormData {
  brand_id: string | null;
  publisher_id: string | null;
  name: string;
  product_code: string;
  docs_file_url: string | null;
  generated_images_drive_link?: string;
  guidelines: string | null;
  publisher_comparison: string | null;
  product_brief?: string | null;
  ad_db_sheet_id?: string | null;
  productc_config_url?: string | null;
  images: { file?: File; url?: string; explanation: string }[];
  referenceImages: { file?: File; url?: string; explanation: string }[];
  comparisonBrands: { file?: File; url?: string; brand_name: string }[];
  driveLinks: { funnel_type: string; drive_link: string }[];
}

async function apiFetch(path: string, token: string | null, options?: RequestInit) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${PIPELINE_API_BASE_URL}${path}`, {
    headers,
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json;
}

export const useProducts = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const token = getToken();
      const result = await apiFetch("/api/products/full", token);
      return (result.data || result) as Product[];
    },
  });

  const uploadFile = async (
    file: File,
    bucket: string,
    pathPrefix: string,
    fileName: string
  ): Promise<string> => {
    const filePath = `${pathPrefix}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const createProduct = useMutation({
    mutationFn: async (formData: ProductFormData) => {
      const token = getToken();
      const tempPathPrefix = `temp-${Date.now()}`;

      // Upload product images to Supabase Storage and collect URLs
      const images = [];
      for (let i = 0; i < formData.images.length; i++) {
        const img = formData.images[i];
        let image_url = img.url;
        if (img.file) {
          image_url = await uploadFile(
            img.file,
            "product-images",
            tempPathPrefix,
            `image-${i}.${img.file.name.split('.').pop()}`
          );
        }
        if (image_url) {
          images.push({
            image_url,
            explanation: img.explanation,
            order_index: i,
          });
        }
      }

      // Upload comparison brand images to Supabase Storage and collect URLs
      const comparison_brands = [];
      for (let i = 0; i < formData.comparisonBrands.length; i++) {
        const comp = formData.comparisonBrands[i];
        let image_url = comp.url;
        if (comp.file) {
          image_url = await uploadFile(
            comp.file,
            "comparison-images",
            tempPathPrefix,
            `comparison-${i}.${comp.file.name.split('.').pop()}`
          );
        }
        if (image_url && comp.brand_name) {
          comparison_brands.push({
            image_url,
            brand_name: comp.brand_name,
            order_index: i + 1,
          });
        }
      }

      // Upload reference example images (real holding photos) — same bucket, reference- prefix
      const reference_images = [];
      for (let i = 0; i < (formData.referenceImages?.length ?? 0); i++) {
        const ref = formData.referenceImages[i];
        let image_url = ref.url;
        if (ref.file) {
          image_url = await uploadFile(
            ref.file,
            "product-images",
            tempPathPrefix,
            `reference-${i}.${ref.file.name.split('.').pop()}`
          );
        }
        if (image_url) {
          reference_images.push({
            image_url,
            explanation: ref.explanation,
            order_index: i,
          });
        }
      }

      // POST to pipeline API
      return await apiFetch("/api/products", token, {
        method: "POST",
        body: JSON.stringify({
          brand_id: formData.brand_id || null,
          publisher_id: formData.publisher_id || null,
          name: formData.name,
          product_code: formData.product_code,
          docs_file_url: formData.docs_file_url || null,
          generated_images_drive_link: formData.generated_images_drive_link || null,
          guidelines: formData.guidelines || null,
          publisher_comparison: formData.publisher_comparison || null,
          product_brief: formData.product_brief ?? null,
          ad_db_sheet_id: formData.ad_db_sheet_id ?? null,
          productc_config_url: formData.productc_config_url ?? null,
          images,
          reference_images,
          comparison_brands,
          drive_links: formData.driveLinks.filter((dl) => dl.drive_link.trim()),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product created successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "product"));
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...formData }: ProductFormData & { id: string }) => {
      const token = getToken();
      const tempPathPrefix = `temp-${Date.now()}`;

      // Upload product images to Supabase Storage and collect URLs
      const images = [];
      for (let i = 0; i < formData.images.length; i++) {
        const img = formData.images[i];
        let image_url = img.url;
        if (img.file) {
          image_url = await uploadFile(
            img.file,
            "product-images",
            tempPathPrefix,
            `image-${i}.${img.file.name.split('.').pop()}`
          );
        }
        if (image_url) {
          images.push({
            image_url,
            explanation: img.explanation,
            order_index: i,
          });
        }
      }

      // Upload comparison brand images to Supabase Storage and collect URLs
      const comparison_brands = [];
      for (let i = 0; i < formData.comparisonBrands.length; i++) {
        const comp = formData.comparisonBrands[i];
        let image_url = comp.url;
        if (comp.file) {
          image_url = await uploadFile(
            comp.file,
            "comparison-images",
            tempPathPrefix,
            `comparison-${i}.${comp.file.name.split('.').pop()}`
          );
        }
        if (image_url && comp.brand_name) {
          comparison_brands.push({
            image_url,
            brand_name: comp.brand_name,
            order_index: i + 1,
          });
        }
      }

      // Upload reference example images (real holding photos) — same bucket, reference- prefix
      const reference_images = [];
      for (let i = 0; i < (formData.referenceImages?.length ?? 0); i++) {
        const ref = formData.referenceImages[i];
        let image_url = ref.url;
        if (ref.file) {
          image_url = await uploadFile(
            ref.file,
            "product-images",
            tempPathPrefix,
            `reference-${i}.${ref.file.name.split('.').pop()}`
          );
        }
        if (image_url) {
          reference_images.push({
            image_url,
            explanation: ref.explanation,
            order_index: i,
          });
        }
      }

      // PUT to pipeline API
      return await apiFetch(`/api/products/${id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          brand_id: formData.brand_id || null,
          publisher_id: formData.publisher_id || null,
          name: formData.name,
          product_code: formData.product_code,
          docs_file_url: formData.docs_file_url || null,
          generated_images_drive_link: formData.generated_images_drive_link || null,
          guidelines: formData.guidelines || null,
          publisher_comparison: formData.publisher_comparison || null,
          product_brief: formData.product_brief ?? null,
          ad_db_sheet_id: formData.ad_db_sheet_id ?? null,
          productc_config_url: formData.productc_config_url ?? null,
          images,
          reference_images,
          comparison_brands,
          drive_links: formData.driveLinks.filter((dl) => dl.drive_link.trim()),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "product"));
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const token = getToken();
      return await apiFetch(`/api/products/${id}`, token, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "product"));
    },
  });

  return {
    products,
    isLoading,
    createProduct,
    updateProduct,
    deleteProduct,
  };
};
