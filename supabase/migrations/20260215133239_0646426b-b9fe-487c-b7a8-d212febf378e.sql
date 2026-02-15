
-- Telegram subscribers managed by each bot owner
CREATE TABLE public.telegram_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  subscription_days INTEGER, -- NULL means permanent
  expires_at TIMESTAMP WITH TIME ZONE,
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own subscribers" ON public.telegram_subscribers FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert own subscribers" ON public.telegram_subscribers FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own subscribers" ON public.telegram_subscribers FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete own subscribers" ON public.telegram_subscribers FOR DELETE USING (auth.uid() = owner_id);

CREATE UNIQUE INDEX idx_telegram_subscribers_unique ON public.telegram_subscribers (owner_id, telegram_user_id);

-- Telegram channels managed by each bot owner
CREATE TABLE public.telegram_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id BIGINT NOT NULL,
  channel_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own channels" ON public.telegram_channels FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert own channels" ON public.telegram_channels FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own channels" ON public.telegram_channels FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete own channels" ON public.telegram_channels FOR DELETE USING (auth.uid() = owner_id);

CREATE UNIQUE INDEX idx_telegram_channels_unique ON public.telegram_channels (owner_id, channel_id);

-- Drop old subscriptions table (replaced by telegram_channels)
DROP TABLE IF EXISTS public.subscriptions;
