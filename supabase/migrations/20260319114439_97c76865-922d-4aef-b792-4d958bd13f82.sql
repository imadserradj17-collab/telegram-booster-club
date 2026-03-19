-- Fix bot_tokens policies: change from public to authenticated
DROP POLICY IF EXISTS "Users can delete own bot token" ON public.bot_tokens;
DROP POLICY IF EXISTS "Users can insert own bot token" ON public.bot_tokens;
DROP POLICY IF EXISTS "Users can update own bot token" ON public.bot_tokens;
DROP POLICY IF EXISTS "Users can view own bot token" ON public.bot_tokens;

CREATE POLICY "Users can delete own bot token" ON public.bot_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bot token" ON public.bot_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bot token" ON public.bot_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own bot token" ON public.bot_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Fix telegram_subscribers policies
DROP POLICY IF EXISTS "Owners can delete own subscribers" ON public.telegram_subscribers;
DROP POLICY IF EXISTS "Owners can insert own subscribers" ON public.telegram_subscribers;
DROP POLICY IF EXISTS "Owners can update own subscribers" ON public.telegram_subscribers;
DROP POLICY IF EXISTS "Owners can view own subscribers" ON public.telegram_subscribers;

CREATE POLICY "Owners can delete own subscribers" ON public.telegram_subscribers FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert own subscribers" ON public.telegram_subscribers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own subscribers" ON public.telegram_subscribers FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can view own subscribers" ON public.telegram_subscribers FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Fix telegram_channels policies
DROP POLICY IF EXISTS "Owners can delete own channels" ON public.telegram_channels;
DROP POLICY IF EXISTS "Owners can insert own channels" ON public.telegram_channels;
DROP POLICY IF EXISTS "Owners can update own channels" ON public.telegram_channels;
DROP POLICY IF EXISTS "Owners can view own channels" ON public.telegram_channels;

CREATE POLICY "Owners can delete own channels" ON public.telegram_channels FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert own channels" ON public.telegram_channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own channels" ON public.telegram_channels FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can view own channels" ON public.telegram_channels FOR SELECT TO authenticated USING (auth.uid() = owner_id);