/**
 * Self-hosted data layer — replaces @supabase/supabase-js entirely.
 *
 * Every call goes to the custom Node.js/Express backend on the VPS, which talks
 * directly to the PostgreSQL database restored from database_full.sql.
 *
 * Base URL: VITE_API_BASE_URL (defaults to the same origin under /api).
 *
 * Backend contract (see /mnt/documents/vps-backend for a reference server):
 *   POST {base}/auth/signup   { email, password }            -> { session, user, error }
 *   POST {base}/auth/login    { email, password }            -> { session, user, error }
 *   POST {base}/auth/logout   {}                             -> { error }
 *   GET  {base}/auth/session                                 -> { session }
 *   POST {base}/rpc/:name     { args }                       -> { data, error }
 *   POST {base}/db/query      QueryPayload                   -> { data, count, error }
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

const TOKEN_KEY = "app.session";

/* ------------------------------------------------------------------ types */

export interface AuthUser {
  id: string;
  email: string | null;
  [key: string]: unknown;
}

export interface Session {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  user: AuthUser;
}

export interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

export interface Result<T = any> {
  data: T | null;
  error: DbError | null;
  count?: number | null;
}

type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "is" | "like" | "ilike" | "contains";

interface Filter { column: string; op: FilterOp; value: unknown }

interface QueryPayload {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  columns?: string;
  values?: unknown;
  onConflict?: string;
  filters: Filter[];
  or: string[];
  order: { column: string; ascending: boolean }[];
  limit?: number;
  offset?: number;
  single?: "one" | "maybe";
  count?: "exact" | null;
}

/* --------------------------------------------------------------- session */

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let currentSession: Session | null = typeof localStorage !== "undefined" ? readSession() : null;
type AuthListener = (event: string, session: Session | null) => void;
const listeners = new Set<AuthListener>();

function setSession(session: Session | null, event: string) {
  currentSession = session;
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
  listeners.forEach((cb) => cb(event, session));
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (currentSession?.access_token) h["Authorization"] = `Bearer ${currentSession.access_token}`;
  return h;
}

function toError(e: unknown): DbError {
  return { message: e instanceof Error ? e.message : String(e) };
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { ...headers(init.body !== undefined), ...(init.headers as any) },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }

    if (!res.ok) {
      const message = (body && (body.error?.message || body.error || body.message)) ||
        `Request failed (${res.status})`;
      return { data: null, error: { message: String(message), code: String(res.status) } };
    }
    if (body === null || typeof body !== "object") {
      return {
        data: null,
        error: { message: "الخادم غير متصل (Server not reachable). شغّل الموقع على الـ VPS مع الخادم." },
      };
    }
    if (body.error) {
      const err = body.error;
      return { data: null, error: typeof err === "string" ? { message: err } : err };
    }
    return {
      data: ("data" in body ? body.data : body) as T,
      error: null,
      count: body.count ?? null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/* --------------------------------------------------------- query builder */

class QueryBuilder<T = any> implements PromiseLike<Result<T>> {
  private payload: QueryPayload;

  constructor(table: string) {
    this.payload = { table, op: "select", columns: "*", filters: [], or: [], order: [] };
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    if (this.payload.op === "select") this.payload.columns = columns;
    else this.payload.columns = columns; // returning clause for mutations
    if (options?.count) this.payload.count = options.count;
    return this;
  }

  insert(values: unknown) { this.payload.op = "insert"; this.payload.values = values; return this; }
  update(values: unknown) { this.payload.op = "update"; this.payload.values = values; return this; }
  delete(options?: { count?: "exact" }) {
    this.payload.op = "delete";
    if (options?.count) this.payload.count = options.count;
    return this;
  }
  upsert(values: unknown, options?: { onConflict?: string }) {
    this.payload.op = "upsert";
    this.payload.values = values;
    this.payload.onConflict = options?.onConflict;
    return this;
  }

  private filter(column: string, op: FilterOp, value: unknown) {
    this.payload.filters.push({ column, op, value });
    return this;
  }

  eq(c: string, v: unknown) { return this.filter(c, "eq", v); }
  neq(c: string, v: unknown) { return this.filter(c, "neq", v); }
  gt(c: string, v: unknown) { return this.filter(c, "gt", v); }
  gte(c: string, v: unknown) { return this.filter(c, "gte", v); }
  lt(c: string, v: unknown) { return this.filter(c, "lt", v); }
  lte(c: string, v: unknown) { return this.filter(c, "lte", v); }
  is(c: string, v: unknown) { return this.filter(c, "is", v); }
  like(c: string, v: unknown) { return this.filter(c, "like", v); }
  ilike(c: string, v: unknown) { return this.filter(c, "ilike", v); }
  contains(c: string, v: unknown) { return this.filter(c, "contains", v); }
  in(c: string, v: unknown[]) { return this.filter(c, "in", v); }

  or(expression: string) { this.payload.or.push(expression); return this; }

  order(column: string, options?: { ascending?: boolean }) {
    this.payload.order.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(n: number) { this.payload.limit = n; return this; }

  range(from: number, to: number) {
    this.payload.offset = from;
    this.payload.limit = to - from + 1;
    return this;
  }

  single() { this.payload.single = "one"; return this; }
  maybeSingle() { this.payload.single = "maybe"; return this; }

  private run(): Promise<Result<T>> {
    return request<T>("db/query", { method: "POST", body: JSON.stringify(this.payload) });
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/* ------------------------------------------------------------------ auth */

const auth = {
  async getSession(): Promise<{ data: { session: Session | null }; error: DbError | null }> {
    if (!currentSession) return { data: { session: null }, error: null };
    const res = await request<{ session: Session | null }>("auth/session", { method: "GET" });
    if (res.error) return { data: { session: currentSession }, error: null };
    const session = (res.data as any)?.session ?? (res.data as any) ?? null;
    if (session && session.access_token) setSession(session, "TOKEN_REFRESHED");
    else if (!session) setSession(null, "SIGNED_OUT");
    return { data: { session: currentSession }, error: null };
  },

  async getUser(): Promise<{ data: { user: AuthUser | null }; error: DbError | null }> {
    const { data } = await auth.getSession();
    return { data: { user: data.session?.user ?? null }, error: null };
  },

  async signInWithPassword(credentials: { email: string; password: string }) {
    const res = await request<{ session: Session; user: AuthUser }>("auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (res.error) return { data: { session: null, user: null }, error: res.error };
    const session = (res.data as any)?.session ?? null;
    setSession(session, "SIGNED_IN");
    return { data: { session, user: session?.user ?? null }, error: null };
  },

  async signUp(credentials: { email: string; password: string; options?: unknown }) {
    const res = await request<{ session: Session | null; user: AuthUser | null }>("auth/signup", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (res.error) return { data: { session: null, user: null }, error: res.error };
    const session = (res.data as any)?.session ?? null;
    if (session) setSession(session, "SIGNED_IN");
    return { data: { session, user: (res.data as any)?.user ?? session?.user ?? null }, error: null };
  },

  async signOut() {
    await request("auth/logout", { method: "POST", body: JSON.stringify({}) });
    setSession(null, "SIGNED_OUT");
    return { error: null };
  },

  onAuthStateChange(callback: AuthListener) {
    listeners.add(callback);
    // emit current state asynchronously, like the previous client did
    setTimeout(() => callback(currentSession ? "INITIAL_SESSION" : "SIGNED_OUT", currentSession), 0);
    return {
      data: {
        subscription: {
          unsubscribe() { listeners.delete(callback); },
        },
      },
    };
  },
};

/* -------------------------------------------------- realtime replacement */
/** No-op channel API: live updates are handled by the polling refresh in the UI. */
function channel(_name: string) {
  const api = {
    on() { return api; },
    subscribe() { return api; },
    unsubscribe() { return Promise.resolve("ok"); },
  };
  return api as any;
}

/* ---------------------------------------------------------------- client */

export const db = {
  from<T = any>(table: string) { return new QueryBuilder<T>(table); },
  rpc<T = any>(fn: string, args?: Record<string, unknown>) {
    return request<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args ?? {}) });
  },
  auth,
  channel,
  removeChannel(_ch: unknown) { return Promise.resolve("ok"); },
  getAccessToken() { return currentSession?.access_token ?? null; },
};

/** Backwards-compatible alias so existing components keep working unchanged. */
export const supabase = db;
