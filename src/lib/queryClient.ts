import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const API_BASE = (import.meta.env.VITE_SERVER_URL as string) || "";

// pipeline-node lives on a different port from the image-builder (VITE_SERVER_URL).
// All /api/tsl/* routes must use this base URL.
export const PIPELINE_API_BASE = (import.meta.env.VITE_PIPELINE_API_BASE_URL as string) || API_BASE;

const TOKEN_KEY = "auth_jwt_token";

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { ...extra };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = authHeaders(data ? { "Content-Type": "application/json" } : {});
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

export async function pipelineApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = authHeaders(data ? { "Content-Type": "application/json" } : {});
  const res = await fetch(`${PIPELINE_API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pipelineQueryFn: QueryFunction<any> = async ({ queryKey }) => {
  const url = (queryKey as string[]).join("/");
  const res = await fetch(`${PIPELINE_API_BASE}${url}`, { headers: authHeaders() });
  if (res.status === 401) throw new Error("401: Unauthorized");
  await throwIfResNotOk(res);
  return res.json();
};

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = (queryKey as string[]).join("/");
    const res = await fetch(`${API_BASE}${url}`, { headers: authHeaders() });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
