
CREATE TABLE public.scan_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  bot_token_id uuid NOT NULL,
  kicked_non_subscribers integer NOT NULL DEFAULT 0,
  kicked_expired integer NOT NULL DEFAULT 0,
  details jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own scan logs"
  ON public.scan_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access on scan_logs"
  ON public.scan_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_scan_logs_owner ON public.scan_logs (owner_id, created_at DESC);
