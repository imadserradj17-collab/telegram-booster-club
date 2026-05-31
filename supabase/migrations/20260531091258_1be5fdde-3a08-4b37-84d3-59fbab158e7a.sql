-- 1. Add moderator to app_role enum (idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';

-- 2. Activity log table
CREATE TABLE public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text,
  action text NOT NULL,
  target_user_id uuid,
  target_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_activity_log TO authenticated;
GRANT ALL ON public.admin_activity_log TO service_role;

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all activity"
ON public.admin_activity_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Moderators view own activity"
ON public.admin_activity_log FOR SELECT
TO authenticated
USING (
  actor_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'moderator')
);

CREATE POLICY "Staff insert own activity"
ON public.admin_activity_log FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'moderator')
  )
);

CREATE INDEX idx_admin_activity_created ON public.admin_activity_log (created_at DESC);
CREATE INDEX idx_admin_activity_actor ON public.admin_activity_log (actor_id);

-- 3. Allow moderators to update profile approval state
CREATE POLICY "Moderators can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'moderator'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'moderator'));

-- 4. Update get_users_with_email to allow moderators too
CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, is_approved boolean, approved_until timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'moderator')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id, u.email::text, p.created_at, p.is_approved, p.approved_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$function$;

-- 5. List moderators (admin only)
CREATE OR REPLACE FUNCTION public.get_moderators()
RETURNS TABLE(user_id uuid, email text, added_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;

  RETURN QUERY
  SELECT ur.user_id, u.email::text, p.created_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role::text = 'moderator'
  ORDER BY u.email;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_moderators() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_moderators() TO authenticated;

-- 6. Log helper
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _target_user_id uuid DEFAULT NULL,
  _target_label text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT email::text INTO _actor_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.admin_activity_log (actor_id, actor_email, action, target_user_id, target_label, details)
  VALUES (auth.uid(), _actor_email, _action, _target_user_id, _target_label, COALESCE(_details, '{}'::jsonb));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, uuid, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, uuid, text, jsonb) TO authenticated;