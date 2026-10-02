import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { expandAllowedRoutes } from "@/lib/routeAccess";
import NotFound from "@/pages/NotFound";
import { canAccessRoute, getAccessFlags } from "@/lib/permissions";
import { canSeeBonuses } from "@/lib/bonusesAccess";

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  blockForCustomOnly?: boolean;
  blockForAdminOnly?: boolean;
  devOnly?: boolean;
  adsLauncherOnly?: boolean;
  tslOnly?: boolean;
  bonusesOnly?: boolean;
}

const ProtectedRoute = ({ children, blockForAdminOnly, devOnly, tslOnly, bonusesOnly }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Bonuses (salary data): the email allow-list is the SOLE gate — it both blocks
  // non-listed admins and lets a listed (possibly restricted) user in. Checked before
  // the generic canAccessRoute so neither over-exposes nor wrongly blocks.
  if (bonusesOnly) {
    if (!canSeeBonuses(user)) {
      return <NotFound />;
    }
    return <>{children}</>;
  }

  // Single source of truth: restricted users (pure Custom, or Admin+Custom with
  // checkboxes set) are limited to their allowed routes; admin-core pages
  // (dashboard / users / cs-editors) follow admin status. Admins and
  // unconfigured hybrids pass freely.
  if (!canAccessRoute(user, location.pathname)) {
    return <NotFound />;
  }

  const { hasAdmin, restricted } = getAccessFlags(user);

  if (blockForAdminOnly) {
    const isAdminUser = user.user_type.includes("Admin") && !user.user_type.includes("Super Admin");
    if (isAdminUser) {
      return <NotFound />;
    }
  }

  if (devOnly && !user.user_type.includes("Dev")) {
    return <NotFound />;
  }

  // TSL Builder is admin-only for unrestricted users. Restricted users are
  // already gated by canAccessRoute above (via their allowed_routes).
  if (tslOnly && !restricted && !hasAdmin) {
    return <NotFound />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
