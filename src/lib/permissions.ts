// ── Default route based on user_type ────────────────────────────────────
export function getDefaultRoute(user_type: string[], custom_role_types: string[] = []): string {
  if (user_type.includes("Super Admin") || user_type.includes("Admin"))
    return "/dashboard";
  if (user_type.includes("Dev")) return "/dashboard";
  if (user_type.includes("Custom")) {
    // Matches "Editor", "brandId:Editor", "brandId:Main Editor", "brandId:Secondary Editor".
    const isEditor = custom_role_types.some((t) => t === "Editor" || t.endsWith("Editor"));
    return isEditor ? "/editors-pace" : "/ads-performance";
  }
  return "/auth";
}

// ── All users have all permissions (page-wise access control removed) ────
export function getPermissions(): string[] {
  return [
    "DASHBOARD",
    "USER_MANAGEMENT",
    "STATIC_GENERATOR",
    "VIDEO_BUILDER",
    "ADMIN_ONLY",
  ];
}

// ── Route access (single source of truth for sidebar + ProtectedRoute) ───
// Used by BOTH the sidebar (which menu items to show) and ProtectedRoute (which
// pages a direct URL can open) so they can never drift apart.

interface AccessUser {
  user_type?: string[];
  allowed_routes?: string[];
}

const ADMIN_ROLES = ["Admin", "Super Admin", "Dev"];

// Pages that are NOT controlled by the access checkboxes (they have no entry in
// the route-permission registry in UserDialog.tsx). They follow admin status,
// not allowed_routes. Keep in sync with the routes marked `blockForCustomOnly`
// in App.tsx.
const ADMIN_CORE_ROUTES = ["/dashboard", "/users", "/cs-editors"];

// Some granted "hub" pages deep-link into related sub-pages that are NOT listed
// separately in the route-permission registry. Granting the hub route implies
// access to these. Keep keys/values in sync with the registry in UserDialog.tsx.
const ROUTE_ACCESS_ALIASES: Record<string, string[]> = {
  "/ads-launcher/brands-products": [
    "/ads-launcher/brands",
    "/ads-launcher/products",
  ],
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

function matchesRoute(routes: string[], path: string): boolean {
  return routes.some((route) => path === route || path.startsWith(route + "/"));
}

/**
 * Classify a user for access purposes.
 * - pureCustom: "Custom" with no admin role -> fully gated by checkboxes (legacy CS).
 * - restrictedHybrid: admin + "Custom" WITH at least one checkbox set -> gated by
 *   checkboxes for tool tabs, but keeps admin-core pages (dashboard, users, roles).
 *   With NO checkboxes set, a hybrid is treated as a full admin (safe default).
 */
export function getAccessFlags(user?: AccessUser) {
  const types = user?.user_type ?? [];
  const allowed = user?.allowed_routes ?? [];
  const hasAdmin = types.some((t) => ADMIN_ROLES.includes(t));
  const hasCustom = types.includes("Custom");
  const pureCustom = hasCustom && !hasAdmin;
  const restrictedHybrid = hasCustom && hasAdmin && allowed.length > 0;
  const restricted = pureCustom || restrictedHybrid;
  return { hasAdmin, hasCustom, pureCustom, restrictedHybrid, restricted, allowed };
}

/** Can this user open the given route path? Shared by sidebar + ProtectedRoute. */
export function canAccessRoute(user: AccessUser | undefined, path: string): boolean {
  const { hasAdmin, restricted, allowed } = getAccessFlags(user);
  if (!restricted) return true; // admins / unconfigured hybrids see everything
  if (matchesRoute(ADMIN_CORE_ROUTES, path)) {
    return hasAdmin; // hybrids keep dashboard + admin pages; pure custom does not
  }
  return matchesRoute(expandAllowedRoutes(allowed), path);
}
