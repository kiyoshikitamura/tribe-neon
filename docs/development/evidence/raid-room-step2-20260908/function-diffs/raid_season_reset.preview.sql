CREATE OR REPLACE FUNCTION public.raid_season_reset()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN RAISE EXCEPTION 'admin role required'; END IF;
  DELETE FROM public.raid_damage_logs;
  UPDATE public.raid_bosses SET current_hp = max_hp, status = 'ACTIVE', expires_at = now() + interval '1 day';
END;
$function$
;