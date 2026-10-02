import type { Product } from "@/hooks/useProducts";

export interface PickerImage {
  url: string;
  source: "packshot" | "reference";
  explanation?: string;
}

// Last path segment of a productc_config_url — the STABLE product key
// (never products.name, which is user-editable). Mirrors /api/tsl/products and
// the backend tslProductReference.slugFromConfigUrl.
export function slugFromConfigUrl(url: string | null | undefined): string | null {
  const m = (url || "").match(/\/([^/?#]+?)(?:\.json)?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

// Find the product whose config-slug matches the TSL dropdown slug.
export function findProductBySlug(
  products: Product[] | undefined,
  slug: string | null,
): Product | undefined {
  if (!products || !slug) return undefined;
  return products.find((p) => slugFromConfigUrl(p.productc_config_url) === slug);
}

// The product-image picker shows the catalog PRODUCT images (packshots) only — NOT the
// reference/holding photos (product_reference_images). The "Product image" is the label
// authority, so the operator picks from clean product shots.
export function pickerImagesForProduct(product: Product | undefined): PickerImage[] {
  if (!product) return [];
  // Sort by order_index so the picker shows the curated order (the API returns them
  // unordered); the operator sees the intended image first.
  return [...(product.product_images || [])]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((im) => ({
      url: im.image_url,
      source: "packshot" as const,
      explanation: im.explanation,
    }));
}
