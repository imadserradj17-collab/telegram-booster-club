-- Fix INSERT policy to prevent users from self-approving
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND is_approved = false AND approved_until IS NULL);