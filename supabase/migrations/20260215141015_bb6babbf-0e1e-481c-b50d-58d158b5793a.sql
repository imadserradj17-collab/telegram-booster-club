CREATE TABLE public.bot_pending_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id bigint NOT NULL,
  bot_token_id text NOT NULL,
  state text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint so we only have one state per chat per bot
CREATE UNIQUE INDEX idx_pending_state_unique ON public.bot_pending_states (chat_id, bot_token_id);

-- Auto-delete states older than 5 minutes (cleanup via query)
ALTER TABLE public.bot_pending_states ENABLE ROW LEVEL SECURITY;

-- Service role only (edge function uses service role key)
CREATE POLICY "Service role full access" ON public.bot_pending_states
  FOR ALL USING (true) WITH CHECK (true);