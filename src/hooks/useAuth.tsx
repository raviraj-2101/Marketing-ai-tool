import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from "react";
import { clearDraft } from "@/features/ads-launcher/lib/draftStore";
import { queryClient } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  user_type: string[];
  brand_ids: string[];
  custom_role_types: string[];
  allowed_routes: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  getToken: () => string | null;
  hasPermission: (permission: string) => boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TOKEN_KEY = "auth_jwt_token";
const LOGIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`;

// ── JWT helpers ───────────────────────────────────────────────────────────────
// Decode JWT payload without a library using atob().
// The payload is the second segment (index 1) of the dot-separated JWT.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Returns true if the token exists and its exp claim is still in the future.
function isTokenValid(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  // exp is seconds since epoch; Date.now() is milliseconds
  return payload.exp * 1000 > Date.now();
}

// Extract the AuthUser from a stored token (no network call).
function getUserFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    !Array.isArray(payload.roles) ||
    !Array.isArray(payload.user_type)
  ) {
    return null;
  }
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    roles: payload.roles as string[],
    user_type: payload.user_type as string[],
    brand_ids: Array.isArray(payload.brand_ids) ? (payload.brand_ids as string[]) : [],
    custom_role_types: Array.isArray(payload.custom_role_types) ? (payload.custom_role_types as string[]) : [],
    allowed_routes: Array.isArray(payload.allowed_routes) ? (payload.allowed_routes as string[]) : [],
  };
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // ── On mount: restore session from localStorage ───────────────────────────
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && isTokenValid(token)) {
      const restoredUser = getUserFromToken(token);
      setUser(restoredUser);
    } else {
      // Token missing or expired — clear it to ensure clean state
      if (token) {
        localStorage.removeItem(TOKEN_KEY);
      }
      setUser(null);
    }
    setLoading(false);
  }, []);

  // ── Sign in ───────────────────────────────────────────────────────────────
  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: Error | null }> => {
      try {
        const res = await fetch(LOGIN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const json = await res.json();

        if (!res.ok) {
          return { error: new Error(json.error || "Sign in failed") };
        }

        const { token, user: userData } = json as {
          token: string;
          user: AuthUser;
        };

        localStorage.setItem(TOKEN_KEY, token);
        setUser(userData);
        return { error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        return { error: new Error(message) };
      }
    },
    []
  );

  // ── Sign out ──────────────────────────────────────────────────────────────
  const signOut = useCallback(async (): Promise<void> => {
    // Clear launch draft on logout
    clearDraft("ads-uploader.launch-draft.v1");
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    // Clear all cached query data so the next user never sees stale data
    queryClient.clear();
  }, []);

  // ── Get token (for edge function calls) ───────────────────────────────────
  const getToken = useCallback((): string | null => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    // EDGE CASE: if token expired mid-session, clear state and force re-login
    if (!isTokenValid(token)) {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      return null;
    }
    return token;
  }, []);

  // ── Check permission ───────────────────────────────────────────────────
  // All authenticated users have all page permissions. Access control is now role-based on user_type.
  const hasPermission = useCallback((): boolean => {
    return !!user;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getToken, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
