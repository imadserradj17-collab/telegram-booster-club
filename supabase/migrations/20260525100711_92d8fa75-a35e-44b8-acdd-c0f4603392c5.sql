ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ar';
CREATE INDEX IF NOT EXISTS idx_bot_users_lookup ON public.bot_users (bot_token_id, telegram_user_id);