-- Preview-only reconciliation of the Production Auth -> tutorial binding contract.
-- Anonymous accounts are not inserted into public.users directly by QA fixtures.
-- The client completes the tutorial, then calls this SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.defer_tutorial_authentication()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_progress public.tutorial_progress%rowtype;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING errcode = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT * INTO v_progress
  FROM public.tutorial_progress
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_progress.step_id <> 'COMPLETE' THEN
    RAISE EXCEPTION 'Tutorial completion is required' USING errcode = '23514';
  END IF;
  IF v_progress.authentication_pending THEN
    RETURN 'COMPLETE';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id AND is_anonymous IS TRUE) THEN
    RAISE EXCEPTION 'Only the current anonymous account can defer authentication' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_account_auth_methods WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider <> 'anonymous') THEN
    RAISE EXCEPTION 'A connected identity cannot defer authentication' USING errcode = '42501';
  END IF;

  UPDATE public.tutorial_progress
  SET authentication_pending = true,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN 'COMPLETE';
END;
$function$;

REVOKE ALL ON FUNCTION public.defer_tutorial_authentication() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.defer_tutorial_authentication() TO authenticated;
