/** Data layer: Lovable Cloud client. */
import { supabase } from "@/integrations/supabase/client";
export type { Session } from "@supabase/supabase-js";

export const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export const db = Object.assign(supabase, {
  getAccessToken: () => currentToken,
});

let currentToken: string | null = null;
supabase.auth.getSession().then(({ data }) => { currentToken = data.session?.access_token ?? null; });
supabase.auth.onAuthStateChange((_e, s) => { currentToken = s?.access_token ?? null; });

export { supabase };
