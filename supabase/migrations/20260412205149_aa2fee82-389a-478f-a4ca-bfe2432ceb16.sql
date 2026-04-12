
ALTER TABLE public.bot_tokens
  ADD COLUMN auto_scan_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_scan_interval integer NOT NULL DEFAULT 60;
