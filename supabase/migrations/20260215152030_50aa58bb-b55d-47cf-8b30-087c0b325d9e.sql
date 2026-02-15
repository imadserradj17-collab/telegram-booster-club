ALTER TABLE public.profiles ADD COLUMN preferred_language text NOT NULL DEFAULT 'ar';

-- Allow users to update their own preferred_language
CREATE POLICY "Users can update their own language preference"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);