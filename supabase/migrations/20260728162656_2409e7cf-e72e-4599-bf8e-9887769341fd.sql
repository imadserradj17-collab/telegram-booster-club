CREATE TABLE public.bot_banned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  first_name text,
  reason text,
  banned_by_telegram_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_token_id, telegram_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_banned_users TO authenticated;
GRANT ALL ON public.bot_banned_users TO service_role;

ALTER TABLE public.bot_banned_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own banned users" ON public.bot_banned_users
FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Owners insert own banned users" ON public.bot_banned_users
FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners delete own banned users" ON public.bot_banned_users
FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access on banned users" ON public.bot_banned_users
FOR ALL TO service_role USING (true) WITH CHECK (true);