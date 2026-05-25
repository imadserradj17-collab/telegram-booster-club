
-- Add admin enforcement inside get_users_with_email
CREATE OR REPLACE FUNCTION public.get_users_with_email()
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, is_approved boolean, approved_until timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT p.id, u.email::text, p.created_at, p.is_approved, p.approved_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$function$;

-- Revoke anon access from SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_users_with_email() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_preferred_language(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;

-- Ensure authenticated users can still call the functions they need
GRANT EXECUTE ON FUNCTION public.get_users_with_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_preferred_language(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
