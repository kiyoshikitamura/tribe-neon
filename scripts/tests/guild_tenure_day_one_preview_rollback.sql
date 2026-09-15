-- Preview-only integration regression. ALL changes, including function replacement, roll back.
BEGIN;
SET LOCAL statement_timeout='30s';
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

DO $test$
DECLARE
  v_user uuid;
  v_mid uuid;
  v_guild uuid;
  v_day integer;
  v_progress integer;
  v_status text;
  v_before jsonb;
  v_after jsonb;
  v_claimed jsonb;
  v_tz text;
  v_expected integer;
BEGIN
  SELECT user_id,id,guild_id INTO STRICT v_user,v_mid,v_guild
  FROM public.guild_members
  ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  -- Work on existing Preview account only inside this rollback transaction.
  INSERT INTO public.user_missions(user_id,mission_id,current_progress,progress_val,status,cycle_date)
  VALUES(v_user,'MIS_N_U005',0,0,'PROGRESS',null)
  ON CONFLICT(user_id,mission_id) DO UPDATE SET current_progress=0,progress_val=0,status='PROGRESS',claimed_at=null;

  FOREACH v_day IN ARRAY ARRAY[1,29,30] LOOP
    UPDATE public.guild_members SET joined_at=(
      (statement_timestamp() at time zone 'Asia/Tokyo')::date-(v_day-1)
    )::timestamp at time zone 'Asia/Tokyo' WHERE id=v_mid;
    PERFORM public.sync_current_missions();
    SELECT current_progress,status INTO v_progress,v_status FROM public.user_missions
    WHERE user_id=v_user AND mission_id='MIS_N_U005';
    IF v_progress<>v_day OR v_status<>(CASE WHEN v_day=30 THEN 'CLEAR' ELSE 'PROGRESS' END) THEN
      RAISE EXCEPTION 'Day %: unexpected 30-day projection % / %',v_day,v_progress,v_status;
    END IF;
    SELECT to_jsonb(um) INTO v_before FROM public.user_missions um WHERE user_id=v_user AND mission_id='MIS_N_U005';
    PERFORM public.sync_current_missions();
    SELECT to_jsonb(um) INTO v_after FROM public.user_missions um WHERE user_id=v_user AND mission_id='MIS_N_U005';
    IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Same-day repeat changed tenure row'; END IF;
  END LOOP;
  -- Existing attained CLEAR is permanent under current mission authority.
  UPDATE public.guild_members SET joined_at=statement_timestamp() WHERE id=v_mid;
  PERFORM public.sync_current_missions();
  SELECT current_progress,status INTO v_progress,v_status FROM public.user_missions WHERE user_id=v_user AND mission_id='MIS_N_U005';
  IF v_progress<>30 OR v_status<>'CLEAR' THEN RAISE EXCEPTION 'Attained CLEAR not preserved'; END IF;

  -- Simulate previously received reward state; trigger must unlock the 90-day child.
  UPDATE public.user_missions SET status='CLAIMED',claimed_at=statement_timestamp()
  WHERE user_id=v_user AND mission_id='MIS_N_U005';
  SELECT to_jsonb(um) INTO v_claimed FROM public.user_missions um WHERE user_id=v_user AND mission_id='MIS_N_U005';
  UPDATE public.user_missions SET status='PROGRESS',current_progress=0,progress_val=0,claimed_at=null
  WHERE user_id=v_user AND mission_id='MIS_N_U006';

  FOREACH v_day IN ARRAY ARRAY[1,89,90] LOOP
    UPDATE public.guild_members SET joined_at=(
      (statement_timestamp() at time zone 'Asia/Tokyo')::date-(v_day-1)
    )::timestamp at time zone 'Asia/Tokyo' WHERE id=v_mid;
    PERFORM public.sync_current_missions();
    SELECT current_progress,status INTO v_progress,v_status FROM public.user_missions WHERE user_id=v_user AND mission_id='MIS_N_U006';
    IF v_progress<>v_day OR v_status<>(CASE WHEN v_day=90 THEN 'CLEAR' ELSE 'PROGRESS' END) THEN
      RAISE EXCEPTION 'Day %: unexpected 90-day projection % / %',v_day,v_progress,v_status;
    END IF;
  END LOOP;
  SELECT to_jsonb(um) INTO v_after FROM public.user_missions um WHERE user_id=v_user AND mission_id='MIS_N_U005';
  IF v_claimed IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'CLAIMED was changed'; END IF;

  -- Current membership origin replaces unfinished progress rather than summing.
  UPDATE public.user_missions SET status='PROGRESS',current_progress=29,progress_val=29 WHERE user_id=v_user AND mission_id='MIS_N_U006';
  UPDATE public.guild_members SET joined_at=statement_timestamp() WHERE id=v_mid;
  PERFORM public.sync_current_missions();
  SELECT current_progress INTO v_progress FROM public.user_missions WHERE user_id=v_user AND mission_id='MIS_N_U006';
  IF v_progress<>1 THEN RAISE EXCEPTION 'New current-membership origin did not reset unfinished tenure'; END IF;

  -- Leaving stops tenure; exception rolls back membership removal and its triggers.
  BEGIN
    DELETE FROM public.guild_members WHERE id=v_mid;
    PERFORM public.sync_current_missions();
    SELECT current_progress INTO v_progress FROM public.user_missions WHERE user_id=v_user AND mission_id='MIS_N_U006';
    IF v_progress<>1 THEN RAISE EXCEPTION 'Leaving did not freeze progress'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback departure fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;

  -- JST midnight, independent of database session timezone.
  FOREACH v_tz IN ARRAY ARRAY['UTC','America/Los_Angeles','Asia/Tokyo'] LOOP
    PERFORM set_config('TimeZone',v_tz,true);
    SELECT ('2026-09-14 15:00:00+00'::timestamptz at time zone 'Asia/Tokyo')::date
      - ('2026-09-14 14:59:59+00'::timestamptz at time zone 'Asia/Tokyo')::date+1 INTO v_expected;
    IF v_expected<>2 THEN RAISE EXCEPTION 'JST midnight boundary wrong in %',v_tz; END IF;
  END LOOP;

  -- Owner mismatch continues to fail.
  BEGIN
    PERFORM public.refresh_normal_mission_owned_state(gen_random_uuid());
    RAISE EXCEPTION 'Owner guard did not reject mismatch';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
SELECT 'PASS: Day1/29/30/89/90, same-day idempotence, CLEAR/CLAIMED preservation, child unlock, membership reset, departure freeze, JST midnight, owner guard' AS result;
ROLLBACK;
