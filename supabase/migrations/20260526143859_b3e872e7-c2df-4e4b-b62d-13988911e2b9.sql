
ALTER TABLE public.bot_tokens ADD COLUMN IF NOT EXISTS mandatory_chat_id bigint;

UPDATE public.bot_tokens b
SET mandatory_chat_id = c.channel_id
FROM public.telegram_channels c
WHERE b.mandatory_channel_id IS NOT NULL
  AND c.id = b.mandatory_channel_id
  AND b.mandatory_chat_id IS NULL;
