import { db, API_BASE_URL } from "@/lib/db";

export { API_BASE_URL };

export type ApiResult<T = any> = { data: T | null; error: Error | null };

function authHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = db.getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * Calls the custom Node.js/Express backend on the VPS.
 * POST {API_BASE_URL}/{name}
 */
export async function invokeFunction<T = any>(
  name: "telegram-bot" | "manage-bot" | "auto-scan" | "get-channel-file",
  options: { body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}/${name}`, {
      method: "POST",
      headers: authHeaders(),
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
  const res = await fetch(apiUrl(path, params), { headers: authHeaders(false) });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.blob();
}
