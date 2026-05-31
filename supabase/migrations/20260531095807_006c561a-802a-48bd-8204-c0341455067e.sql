CREATE TABLE public.bot_admin_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  actor_telegram_id bigint NOT NULL,
  actor_role text NOT NULL,
  actor_name text,
  actor_username text,
  action text NOT NULL,
  target_label text,
  target_telegram_id bigint,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_activity_owner_created ON public.bot_admin_activity_log(owner_id, bot_token_id, created_at DESC);

GRANT SELECT ON public.bot_admin_activity_log TO authenticated;
GRANT ALL ON public.bot_admin_activity_log TO service_role;

ALTER TABLE public.bot_admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own bot activity log"
ON public.bot_admin_activity_log
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access on bot activity log"
ON public.bot_admin_activity_log
FOR ALL
TO service_role
USING (true) WITH CHECK (true);