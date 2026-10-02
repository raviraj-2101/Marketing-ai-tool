// Shared brand-access gating helper.
//
// User.brand_ids / user.custom_role_types are snapshot arrays captured at
// user-save time. To let a Custom user be granted access to EVERY brand —
// including brands created after the grant was saved — without re-editing
// that user, we use a distinguished sentinel value inside custom_role_types
// (as a "<sentinel>:<role>" entry) instead of a snapshot of today's brand ids.
//
// NOTE: the sentinel is carried ONLY in custom_role_types, never in
// brand_ids. users.brand_ids is a Postgres UUID[] column (see
// supabase/migrations/20260504000001_user_type_system.sql) and cannot store
// a non-UUID string — manage-users/index.ts deliberately excludes the
// sentinel when it rebuilds brand_ids from custom_role_types server-side.
// custom_role_types is a TEXT[] column, so it has no such restriction.
//
// IMPORTANT: this literal value is duplicated (by necessity — Deno edge
// functions cannot import from src/) in
// supabase/functions/manage-users/index.ts. Keep both in sync if it ever
// changes.
export const ALL_BRANDS_SENTINEL = "__ALL_BRANDS__";

export interface BrandAccessUser {
  user_type?: string[] | null;
  brand_ids?: string[] | null;
  custom_role_types?: string[] | null;
}

// The set of user_type values that already bypass all brand scoping across
// the app (mirrors the identical check duplicated today in
// useFilteredBrands.tsx, Brands.tsx, CreateVideos.tsx, FormTemplates.tsx,
// StaticsLogsTable.tsx, ProductDialog.tsx, ScriptChat.tsx).
const BYPASS_USER_TYPES = ["Super Admin", "Admin", "Dev"];

/**
 * True when the user should never be filtered by brand — either because
 * their user_type is one of the standing full-access types, or because they
 * hold the All-Brands sentinel grant (current & future brands).
 */
export function isAllBrandsAccessUser(user?: BrandAccessUser | null): boolean {
  if (!user) return false;
  const hasBypassType = user.user_type?.some((t) => BYPASS_USER_TYPES.includes(t)) ?? false;
  // The sentinel lives in custom_role_types ("<sentinel>:<role>"), not
  // brand_ids — see the module comment above for why.
  const hasSentinel =
    user.custom_role_types?.some((rt) => rt.startsWith(`${ALL_BRANDS_SENTINEL}:`)) ?? false;
  return hasBypassType || hasSentinel;
}

export interface BrandAccessOptions {
  /**
   * How to treat a non-All-Brands user with an empty brand_ids array.
   * Sites disagree today (some show everything, some show nothing) —
   * this preserves each site's pre-existing behavior; it does not unify it.
   * Defaults to false ("empty means no brands"), matching the more common
   * / more restrictive existing behavior.
   */
  emptyMeansAll?: boolean;
}

/**
 * Whether `user` has access to `brandId`, honoring the All-Brands bypass
 * before falling back to the caller's existing empty-array semantics.
 */
export function userHasBrandAccess(
  user: BrandAccessUser | null | undefined,
  brandId: string | null | undefined,
  options: BrandAccessOptions = {}
): boolean {
  if (isAllBrandsAccessUser(user)) return true;
  const brandIds = user?.brand_ids ?? [];
  if (brandIds.length === 0) return options.emptyMeansAll ?? false;
  if (!brandId) return false;
  return brandIds.includes(brandId);
}

/**
 * Convenience wrapper for the common `.filter(item => user.brand_ids.includes(getBrandId(item)))`
 * call sites: returns every item unfiltered for an All-Brands user, otherwise
 * applies userHasBrandAccess per item.
 */
export function filterBrandScoped<T>(
  user: BrandAccessUser | null | undefined,
  items: T[],
  getBrandId: (item: T) => string | null | undefined,
  options: BrandAccessOptions = {}
): T[] {
  if (isAllBrandsAccessUser(user)) return items;
  return items.filter((item) => userHasBrandAccess(user, getBrandId(item), options));
}
