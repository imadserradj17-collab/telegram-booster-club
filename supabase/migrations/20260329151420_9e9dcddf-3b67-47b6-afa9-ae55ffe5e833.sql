
-- Add free trial toggle to bot_tokens
ALTER TABLE public.bot_tokens ADD COLUMN IF NOT EXISTS free_trial_enabled boolean NOT NULL DEFAULT false;

-- Create free trial users table
CREATE TABLE public.free_trial_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  first_name text,
  last_name text,
  activated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  UNIQUE(owner_id, telegram_user_id)
);

ALTER TABLE public.free_trial_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own free trial users" ON public.free_trial_users FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete own free trial users" ON public.free_trial_users FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Service role full access on free_trial_users" ON public.free_trial_users FOR ALL TO service_role USING (true) WITH CHECK (true);
