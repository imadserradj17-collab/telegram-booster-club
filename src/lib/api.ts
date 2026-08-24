import { supabase } from "@/integrations/supabase/client";

/**
 * Base URL of the custom backend (Node.js / Express on the VPS).
 * Defaults to the same origin under /api, so nginx can proxy it.
 * Override with VITE_API_BASE_URL (e.g. https://api.example.com/api).
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export type ApiResult<T = any> = { data: T | null; error: Error | null };

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (apikey) headers["apikey"] = apikey;
  return headers;
}

/**
 * Drop-in replacement for supabase.functions.invoke(name, { body }).
 * Calls POST {API_BASE_URL}/{name} on the self-hosted backend.
 */
export async function invokeFunction<T = any>(
  name: "telegram-bot" | "manage-bot" | "auto-scan" | "get-channel-file",
  options: { body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}/${name}`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(options.body ?? {}),
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!res.ok) {
      const message =
        (payload && (payload.error || payload.message)) || `Request failed (${res.status})`;
      return { data: payload, error: new Error(String(message)) };
    }

    return { data: payload as T, error: null };
  } catch (e: any) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Build a GET URL on the custom backend (used for media streaming). */
export function apiUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const query = qs.toString();
  return `${API_BASE_URL}/${path.replace(/^\//, "")}${query ? `?${query}` : ""}`;
}

/** Authenticated GET returning a Blob (media files proxied by the backend). */
export async function apiFetchBlob(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<Blob> {
  const headers = await authHeaders();
  delete headers["Content-Type"];
  const res = await fetch(apiUrl(path, params), { headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.blob();
}
