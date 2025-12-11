// LervIT final hardening: Added retry logic for transient API failures
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fetchWithRetry } from "./fetchWithRetry";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Use fetchWithRetry for GET requests (safe to retry)
  // For mutations (POST/PUT/DELETE), use standard fetch to avoid duplicates
  const fetchFn = method.toUpperCase() === 'GET' ? fetchWithRetry : fetch;
  
  const res = await fetchFn(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Use fetchWithRetry for query functions (all GET requests)
    // This provides automatic retry with exponential backoff for 5xx errors
    const res = await fetchWithRetry(queryKey.join("/") as string, {
      credentials: "include",
    });

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
      refetchInterval: false, // Disabled - use manual invalidation after mutations
      refetchOnWindowFocus: false, // Disabled - prevents skeleton flash on tab switch
      staleTime: Infinity, // Data stays fresh until manually invalidated
      gcTime: 1000 * 60 * 10, // Keep cached data for 10 minutes
      retry: false, // We handle retries in fetchWithRetry for transient failures
    },
    mutations: {
      retry: false, // NEVER auto-retry mutations to prevent duplicates
    },
  },
});
