
CREATE TABLE IF NOT EXISTS public.channel_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  bot_token_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  telegram_channel_id BIGINT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(owner_id, channel_id, telegram_user_id)
);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on channel_members"
  ON public.channel_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Owners can view channel members"
  ON public.channel_members FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete channel members"
  ON public.channel_members FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);
