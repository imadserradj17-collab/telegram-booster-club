
-- Add approved_until column for time-limited activation
ALTER TABLE public.profiles ADD COLUMN approved_until timestamp with time zone DEFAULT NULL;

-- Create a security definer function to get user emails for admins
CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE(id uuid, email text, created_at timestamptz, is_approved boolean, approved_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, u.email::text, p.created_at, p.is_approved, p.approved_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC
$$;
