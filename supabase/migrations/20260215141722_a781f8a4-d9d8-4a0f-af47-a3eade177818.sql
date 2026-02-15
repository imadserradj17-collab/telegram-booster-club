-- Add bot_token_id to telegram_channels
ALTER TABLE public.telegram_channels ADD COLUMN bot_token_id uuid REFERENCES public.bot_tokens(id) ON DELETE CASCADE;

-- Add bot_token_id to telegram_subscribers  
ALTER TABLE public.telegram_subscribers ADD COLUMN bot_token_id uuid REFERENCES public.bot_tokens(id) ON DELETE CASCADE;