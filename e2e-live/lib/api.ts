import { getStackConfig } from "./stack";

const tokenCache: Record<string, string> = {};

export function getApiBaseUrl(): string {
  try {
    const config = getStackConfig();
    return `http://127.0.0.1:${config.backendPort}/api`;
  } catch {
    return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100/api";
  }
}

export async function getAuthToken(username: string, password = "1234"): Promise<string> {
  const cacheKey = `${username}:${password}`;
  if (tokenCache[cacheKey]) return tokenCache[cacheKey];

  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Login API failed for ${username}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  tokenCache[cacheKey] = data.token;
  return data.token;
}

export async function apiFetch<T = any>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    params?: Record<string, string | number | boolean>;
  } = {}
): Promise<T> {
  const url = new URL(`${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${options.method || "GET"} ${path} returned ${res.status}: ${errText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : (null as any);
}

export async function listTablesApi(token: string, floorId?: string) {
  return apiFetch<any[]>("/tables", { token, params: floorId ? { floorId } : undefined });
}

export async function getOpenOrderForTableApi(token: string, tableId: string) {
  try {
    return await apiFetch<any>(`/orders/table/${tableId}`, { token });
  } catch {
    return null;
  }
}

export async function listPaidOrdersApi(token: string) {
  return apiFetch<any>("/orders/paid", { token });
}

export async function setItemAvailabilityApi(token: string, itemId: string, available: boolean) {
  return apiFetch<any>(`/menu-items/${itemId}/availability`, {
    method: "PATCH",
    token,
    body: { available },
  });
}

export async function listMenuItemsApi(token: string, floorId = "f1", includeInactive = false) {
  return apiFetch<any[]>("/menu-items", {
    token,
    params: { floorId, includeInactive },
  });
}

export async function cancelAllOpenOrdersApi(token: string): Promise<void> {
  try {
    const orders = await apiFetch<any[]>("/orders", { token });
    for (const o of orders) {
      if (o.status === "open") {
        await apiFetch(`/orders/${o.id}/cancel`, {
          method: "POST",
          token,
          body: { reason: "test cleanup" },
        }).catch(() => {});
      }
    }
  } catch {}
}

