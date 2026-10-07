CREATE TABLE public.bot_referrer_stats (
  bot_token_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  referrer_telegram_id bigint NOT NULL,
  rewarded_days integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_token_id, referrer_telegram_id)
);
GRANT SELECT ON public.bot_referrer_stats TO authenticated;
GRANT ALL ON public.bot_referrer_stats TO service_role;
ALTER TABLE public.bot_referrer_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view referrer stats" ON public.bot_referrer_stats FOR SELECT TO authenticated USING (owner_id = auth.uid());
INSERT INTO public.bot_referrer_stats (bot_token_id, owner_id, referrer_telegram_id, rewarded_days)
SELECT bot_token_id, owner_id, referrer_telegram_id, (count(*) / 5) * 3
FROM public.bot_referrals WHERE status <> 'revoked'
GROUP BY bot_token_id, owner_id, referrer_telegram_id;