CREATE TABLE public.bot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  first_name text,
  last_name text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, telegram_user_id)
);

ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own bot_users" ON public.bot_users
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access on bot_users" ON public.bot_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);