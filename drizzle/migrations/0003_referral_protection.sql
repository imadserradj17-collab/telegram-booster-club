CREATE TABLE public.bot_referral_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  telegram_user_id bigint NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_token_id, telegram_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.bot_referral_blocks TO authenticated;
GRANT ALL ON public.bot_referral_blocks TO service_role;
ALTER TABLE public.bot_referral_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view blocks" ON public.bot_referral_blocks FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners add blocks" ON public.bot_referral_blocks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners remove blocks" ON public.bot_referral_blocks FOR DELETE TO authenticated USING (owner_id = auth.uid());
GRANT UPDATE ON public.bot_referrals TO authenticated;
CREATE POLICY "Owners update referrals" ON public.bot_referrals FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE public.bot_tokens ADD COLUMN IF NOT EXISTS referral_daily_limit integer NOT NULL DEFAULT 20;