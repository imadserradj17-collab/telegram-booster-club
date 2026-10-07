CREATE TABLE public.bot_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  referrer_telegram_id bigint NOT NULL,
  referred_telegram_id bigint NOT NULL,
  referred_name text,
  referred_username text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  UNIQUE (bot_token_id, referred_telegram_id)
);
CREATE INDEX idx_bot_referrals_referrer ON public.bot_referrals (bot_token_id, referrer_telegram_id);
GRANT SELECT, DELETE ON public.bot_referrals TO authenticated;
GRANT ALL ON public.bot_referrals TO service_role;
ALTER TABLE public.bot_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view referrals" ON public.bot_referrals FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners delete referrals" ON public.bot_referrals FOR DELETE TO authenticated USING (owner_id = auth.uid());