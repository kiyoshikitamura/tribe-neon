-- Guild tenure: approved joining day = Day 1 (JST).
-- No bulk data rewrite. Existing sync_current_missions invokes this projection.
-- Existing CLEAR/CLAIMED and reward ledgers remain unchanged.
BEGIN;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.refresh_normal_mission_owned_state(uuid)'::regprocedure)) <> '644ac650621ae488a106d37d162dba94' THEN
    RAISE EXCEPTION 'Guild tenure migration: refresh_normal_mission_owned_state definition drift';
  END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.refresh_normal_mission_owned_state(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception 'Mission progress owner mismatch' using errcode='42501';
  end if;
  with observed(trigger_type, value) as (
    select 'CHARACTER_LEVEL_AT_LEAST', coalesce(max(level),0) from public.user_characters where user_id=p_user_id
    union all select 'CHARACTER_AWAKENING_AT_LEAST',coalesce(max(awakening_level),0) from public.user_characters where user_id=p_user_id
    union all select 'SKILL_AWAKENING_AT_LEAST',coalesce(max(plus_val),0) from public.user_skills where user_id=p_user_id
    union all select 'EQUIPMENT_LIMIT_BREAK_AT_LEAST',coalesce(max(plus_val),0) from public.user_equipments where user_id=p_user_id
    -- Approved 2026-09-14: membership joining date is Day 1, in JST.
    -- No current membership => no observation, so progress stops on leaving.
    -- A new membership's joined_at projects its own tenure (no accumulated login count).
    union all select 'GUILD_TENURE_DAYS',
      (statement_timestamp() at time zone 'Asia/Tokyo')::date
        - (joined_at at time zone 'Asia/Tokyo')::date + 1
    from public.guild_members
    where user_id=p_user_id and joined_at is not null and joined_at<=statement_timestamp()
  )
  update public.user_missions um
  set current_progress=least(m.target_value,greatest(o.value,0)),
      progress_val=least(m.target_value,greatest(o.value,0)),
      status=case when o.value>=m.target_value then 'CLEAR' else 'PROGRESS' end,
      updated_at=clock_timestamp()
  from public.missions m join observed o on o.trigger_type=m.trigger_type
  where um.user_id=p_user_id and um.mission_id=m.id and m.is_enabled and m.category='NORMAL'
    -- Once authoritatively attained, keep CLEAR even if an item is later consumed.
    -- Existing suspect CLEAR rows are blocked by the apply-time impact guard above.
    and um.status = 'PROGRESS'
    and (um.current_progress is distinct from least(m.target_value,greatest(o.value,0))
      or um.status is distinct from case when o.value>=m.target_value then 'CLEAR' else 'PROGRESS' end);
end;
$function$;

COMMIT;
