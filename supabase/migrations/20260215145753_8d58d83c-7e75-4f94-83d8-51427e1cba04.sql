
-- Fix bot_pending_states overly permissive policy
DROP POLICY IF EXISTS "Service role full access" ON public.bot_pending_states;

CREATE POLICY "Service role full access"
ON public.bot_pending_states FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
