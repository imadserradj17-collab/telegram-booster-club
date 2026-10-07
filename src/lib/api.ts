import { supabase, API_BASE_URL } from "@/lib/db";

export { API_BASE_URL };

export type ApiResult<T = any> = { data: T | null; error: Error | null };

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Calls a backend function. */
export async function invokeFunction<T = any>(
  name: "telegram-bot" | "manage-bot" | "auto-scan" | "get-channel-file",
  options: { body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}/${name}`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(options.body ?? {}),
    });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!res.ok) {
      const message = (payload && (payload.error || payload.message)) || `Request failed (${res.status})`;
      return { data: payload, error: new Error(String(message)) };
    }
    return { data: payload as T, error: null };
  } catch (e: any) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function apiUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const query = qs.toString();
  return `${API_BASE_URL}/${path.replace(/^\//, "")}${query ? `?${query}` : ""}`;
}

export async function apiFetchBlob(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<Blob> {
  const res = await fetch(apiUrl(path, params), { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.blob();
}
