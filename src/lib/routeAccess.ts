import type { AuthUser } from "@/hooks/useAuth";

// Granted "hub" pages imply access to related sub-pages that aren't listed
// separately in the route-permission registry. Granting the hub route implies
// access to these. Each alias is matched by exact path OR prefix.
//
// SINGLE SOURCE OF TRUTH for route-access aliasing — imported by
// ProtectedRoute.tsx. Keep in sync with the registry in
// src/components/users/UserDialog.tsx.
export const ROUTE_ACCESS_ALIASES: Record<string, string[]> = {
  // "Brands & Products" embeds the Brands + Products tabs, whose rows link to
  // the standalone brand/product pages and the product editor.
  "/ads-launcher/brands-products": [
    "/ads-launcher/brands",
    "/ads-launcher/products",
  ],
  // The Launch Module flow deep-links to destination config.
  "/ads-launcher/launch": [
    "/ads-launcher/destinations",
  ],
};

export function expandAllowedRoutes(routes: string[]): string[] {
  const set = new Set(routes);
  for (const r of routes) {
    for (const alias of ROUTE_ACCESS_ALIASES[r] ?? []) set.add(alias);
  }
  return [...set];
}

/** A user is "custom-only" when they have at least one user_type and every one
 *  of them is "Custom". Such users are restricted to their allowed_routes;
 *  any other user_type (Admin / Super Admin / Dev) has full access. */
export function isCustomOnly(user: AuthUser | null | undefined): boolean {
  return !!user && user.user_type.length > 0 && user.user_type.every((t) => t === "Custom");
}

/** Non-custom users (Admin / Super Admin / Dev) can access everything;
 *  custom-only users can access `route` only if it is covered by their
 *  allowed_routes.
 *
 *  `expandAliases` (default true) mirrors ProtectedRoute for route VIEWING —
 *  e.g. the "Brands & Products" hub implies access to /brands and /products.
 *
 *  Pass `expandAliases: false` for module ACTIONS like "Add Brand"/"Add
 *  Product": a custom user must be granted that specific module route, NOT
 *  merely the hub. Since the launcher only grants the hub to custom users,
 *  this means Add actions are effectively Admin/Super Admin/Dev only, while
 *  custom users can still browse via the hub. */
export function canAccessRoute(
  user: AuthUser | null | undefined,
  route: string,
  opts: { expandAliases?: boolean } = {},
): boolean {
  if (!user) return false;
  if (!isCustomOnly(user)) return true;
  const granted = opts.expandAliases === false
    ? (user.allowed_routes ?? [])
    : expandAllowedRoutes(user.allowed_routes ?? []);
  return granted.some((r) => route === r || route.startsWith(r + "/"));
}
