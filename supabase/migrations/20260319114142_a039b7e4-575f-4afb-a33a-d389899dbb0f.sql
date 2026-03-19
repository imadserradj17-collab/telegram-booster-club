-- Drop the overly broad user update policy that allows privilege escalation
DROP POLICY IF EXISTS "Users can update their own language preference" ON public.profiles;

-- Create a security definer function to safely update only language preference
CREATE OR REPLACE FUNCTION public.update_preferred_language(_lang text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET preferred_language = _lang
  WHERE id = auth.uid();
END;
$$;