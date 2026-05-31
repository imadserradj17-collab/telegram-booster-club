CREATE TABLE public.bot_moderators (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  telegram_user_id bigint NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_token_id, telegram_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_moderators TO authenticated;
GRANT ALL ON public.bot_moderators TO service_role;

ALTER TABLE public.bot_moderators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own bot moderators" ON public.bot_moderators
FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Owners insert own bot moderators" ON public.bot_moderators
FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners delete own bot moderators" ON public.bot_moderators
FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE INDEX idx_bot_moderators_lookup ON public.bot_moderators (bot_token_id, telegram_user_id);