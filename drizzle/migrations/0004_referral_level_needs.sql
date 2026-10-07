ALTER TABLE public.bot_tokens
  ADD COLUMN IF NOT EXISTS ref_level1_need integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ref_level2_need integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ref_level3_need integer NOT NULL DEFAULT 20;