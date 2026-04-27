-- Create channel_messages table to archive messages from monitored channels
CREATE TABLE public.channel_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_token_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  telegram_channel_id BIGINT NOT NULL,
  telegram_message_id BIGINT NOT NULL,
  message_text TEXT,
  media_type TEXT,
  media_file_id TEXT,
  media_file_unique_id TEXT,
  media_thumbnail TEXT,
  media_caption TEXT,
  media_mime_type TEXT,
  media_file_size BIGINT,
  media_duration INTEGER,
  media_width INTEGER,
  media_height INTEGER,
  sender_name TEXT,
  sender_username TEXT,
  message_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channel_id, telegram_message_id)
);

CREATE INDEX idx_channel_messages_channel ON public.channel_messages(channel_id, message_date DESC);
CREATE INDEX idx_channel_messages_owner ON public.channel_messages(owner_id);
CREATE INDEX idx_channel_messages_bot ON public.channel_messages(bot_token_id);

ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view channel messages"
ON public.channel_messages FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete channel messages"
ON public.channel_messages FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access on channel_messages"
ON public.channel_messages FOR ALL
TO service_role
USING (true)
WITH CHECK (true);