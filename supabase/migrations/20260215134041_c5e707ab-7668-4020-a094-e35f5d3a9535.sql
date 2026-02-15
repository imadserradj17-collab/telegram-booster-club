
-- Add token update tracking and admin settings
ALTER TABLE public.bot_tokens 
  ADD COLUMN token_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN admin_telegram_id BIGINT,
  ADD COLUMN non_subscriber_message TEXT NOT NULL DEFAULT '❌ أنت غير مشترك. تواصل مع المسؤول للاشتراك.';
