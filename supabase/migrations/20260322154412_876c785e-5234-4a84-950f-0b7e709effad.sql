
CREATE TABLE public.public_channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  bot_token_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  first_name text,
  last_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, channel_id, telegram_user_id)
);

ALTER TABLE public.public_channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view public channel members"
  ON public.public_channel_members FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete public channel members"
  ON public.public_channel_members FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access on public_channel_members"
  ON public.public_channel_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);
