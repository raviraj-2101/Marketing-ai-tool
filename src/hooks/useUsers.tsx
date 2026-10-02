import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  roles: string[];
  user_type: string[];
  brand_ids: string[];
  custom_role_types: string[];
  allowed_routes: string[];
  created_at: string;
}

export interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  user_type: string[];
  brand_ids: string[];
  custom_role_types: string[];
  allowed_routes: string[];
}

// ── Helper: call the manage-users Edge Function ────────────────────────────────
// The token is fetched inside the helper via the hook, so we pass getToken as a
// parameter to keep this helper a plain async function (not a hook itself).
async function callManageUsers(
  getToken: () => string | null,
  action: "list" | "create" | "update" | "delete",
  payload?: Record<string, string>
) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ── READ: via edge function list action ────────────────────────────────────────
export const useUsers = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const data = await callManageUsers(getToken, "list");
      return data.users as User[];
    },
  });
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
export const useCreateUser = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (formData: UserFormData) => {
      const isCustomUser = formData.user_type.includes("Custom");
      const payload: Record<string, string> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        user_type: JSON.stringify(formData.user_type),
        brand_ids: JSON.stringify(formData.brand_ids),
        allowed_routes: JSON.stringify(formData.allowed_routes),
      };
      // Only include custom_role_types if user is Custom
      if (isCustomUser) {
        payload.custom_role_types = JSON.stringify(formData.custom_role_types);
      }
      return callManageUsers(getToken, "create", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
        description: getErrorMessage(error, "user"),
        variant: "destructive",
      });
    },
  });
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: UserFormData }) => {
      const isCustomUser = formData.user_type.includes("Custom");
      const payload: Record<string, string> = {
        id,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        user_type: JSON.stringify(formData.user_type),
        brand_ids: JSON.stringify(formData.brand_ids),
        allowed_routes: JSON.stringify(formData.allowed_routes),
      };
      // Only include custom_role_types if user is Custom
      if (isCustomUser) {
        payload.custom_role_types = JSON.stringify(formData.custom_role_types);
      }
      return callManageUsers(getToken, "update", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
        description: getErrorMessage(error, "user"),
        variant: "destructive",
      });
    },
  });
};

// ── DELETE ────────────────────────────────────────────────────────────────────
export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (user: User) =>
      callManageUsers(getToken, "delete", { id: user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete user",
        description: getErrorMessage(error, "user"),
        variant: "destructive",
      });
    },
  });
};
