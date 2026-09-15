-- Mission期限はサーバー付与直前に検証。NULLは無期限を維持。
-- Preview監査時の3関数のみ変更。既存配布・ロック・所有状態判定を保持。
DO $guard$
BEGIN
  IF md5(replace(pg_get_functiondef('public.claim_mission_reward(text)'::regprocedure),chr(13),'')) <> 'a7b334177e8a09d4a60f5cde4ac1a3a8' THEN
    RAISE EXCEPTION 'Function drift: claim_mission_reward; re-review current definition';
  END IF;
  IF md5(replace(pg_get_functiondef('public.claim_all_mission_rewards(text[])'::regprocedure),chr(13),'')) <> '982928e04a280ca4faefd13ebb5391d6' THEN
    RAISE EXCEPTION 'Function drift: claim_all_mission_rewards; re-review current definition';
  END IF;
  IF md5(replace(pg_get_functiondef('public.get_active_mission_events()'::regprocedure),chr(13),'')) <> '75da082869fde01ebcf45a243c230fdb' THEN
    RAISE EXCEPTION 'Function drift: get_active_mission_events; re-review current definition';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.claim_mission_reward(p_mission_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_progress public.user_missions%rowtype;
  v_claim_key text;
  v_ledger_id uuid;
  v_rewards jsonb;
begin
  if v_uid is null or p_mission_id is null then
    raise exception 'Player authentication required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':missions',0));
  perform public.sync_current_missions();
  select * into v_progress from public.user_missions
    where user_id=v_uid and mission_id=p_mission_id for update;
  if not found or v_progress.status<>'CLEAR' then
    raise exception 'Mission reward is not claimable' using errcode='23514';
  end if;
  select * into strict v_mission from public.missions where id=p_mission_id and is_enabled;
  if exists(select 1 from public.mission_events event
    where event.id=v_mission.event_id and event.claim_deadline is not null
      and clock_timestamp()>=event.claim_deadline) then
    raise exception 'Mission reward claim deadline has passed' using errcode='23514';
  end if;
  v_claim_key := concat_ws(':',v_uid::text,p_mission_id,coalesce(v_progress.cycle_date::text,'ONCE'));
  insert into public.mission_reward_delivery_ledger(
    claim_key,user_mission_id,user_id,mission_id,cycle_date,resolved_item_id,
    item_quantity,cash_quantity,delivery_status
  ) values (
    v_claim_key,v_progress.id,v_uid,p_mission_id,v_progress.cycle_date,
    public.resolve_canonical_reward_item(v_mission.reward_item_id),v_mission.reward_quantity,
    greatest(coalesce(v_mission.cash_reward,0),0),'PENDING'
  ) returning id into v_ledger_id;
  v_rewards := public.grant_mission_reward_bundle(v_ledger_id,v_uid,p_mission_id);
  update public.user_missions set status='CLAIMED',claimed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_progress.id;
  insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
  select v_uid,next.id,0,0,'PROGRESS' from public.missions next
  where next.is_enabled and next.category='NORMAL' and next.prerequisite_mission_id=p_mission_id
  on conflict(user_id,mission_id) do nothing;
  update public.mission_reward_delivery_ledger set delivery_status='DELIVERED',delivered_at=clock_timestamp()
    where id=v_ledger_id;
  if v_mission.event_id is not null then
    insert into public.mission_event_telemetry(event_id,user_id,event_name,mission_id,jst_date,source)
    values(v_mission.event_id,v_uid,
      case when v_mission.trigger_type='GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
        then 'complete_reward_claimed' else 'mission_reward_claimed' end,
      p_mission_id,(clock_timestamp() at time zone 'Asia/Tokyo')::date,'individual_claim');
  end if;
  perform public.refresh_normal_mission_owned_state(v_uid);
  return jsonb_build_object('claimed',true,'mission_id',p_mission_id,'delivery','DIRECT','rewards',v_rewards);
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_all_mission_rewards(p_mission_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_entry record;
  v_count integer := 0;
  v_claim_key text;
  v_ledger_id uuid;
  v_entry_rewards jsonb;
  v_rewards jsonb := '[]'::jsonb;
begin
  if v_uid is null or p_mission_ids is null or cardinality(p_mission_ids) not between 1 and 100 then
    raise exception 'Invalid mission claim request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':missions',0));
  perform public.sync_current_missions();
  for v_entry in
    select um.id user_mission_id,um.cycle_date,um.mission_id,m.*
    from public.user_missions um join public.missions m on m.id=um.mission_id and m.is_enabled
    where um.user_id=v_uid and um.status='CLEAR'
      and um.mission_id in(select distinct unnest(p_mission_ids))
    order by m.display_order,um.mission_id for update of um
  loop
    -- Recheck per grant, including after waiting for the user mission lock.
    if exists(select 1 from public.mission_events event
      where event.id=v_entry.event_id and event.claim_deadline is not null
        and clock_timestamp()>=event.claim_deadline) then
      continue;
    end if;
    v_claim_key:=concat_ws(':',v_uid::text,v_entry.mission_id,coalesce(v_entry.cycle_date::text,'ONCE'));
    insert into public.mission_reward_delivery_ledger(
      claim_key,user_mission_id,user_id,mission_id,cycle_date,resolved_item_id,
      item_quantity,cash_quantity,delivery_status
    ) values (
      v_claim_key,v_entry.user_mission_id,v_uid,v_entry.mission_id,v_entry.cycle_date,
      public.resolve_canonical_reward_item(v_entry.reward_item_id),v_entry.reward_quantity,
      greatest(coalesce(v_entry.cash_reward,0),0),'PENDING'
    ) returning id into v_ledger_id;
    v_entry_rewards:=public.grant_mission_reward_bundle(v_ledger_id,v_uid,v_entry.mission_id);
    select coalesce(jsonb_agg(value||jsonb_build_object('mission_id',v_entry.mission_id)),'[]'::jsonb)
      into v_entry_rewards from jsonb_array_elements(v_entry_rewards) item(value);
    v_rewards:=v_rewards||v_entry_rewards;
    update public.user_missions set status='CLAIMED',claimed_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=v_entry.user_mission_id;
    insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
    select v_uid,next.id,0,0,'PROGRESS' from public.missions next
    where next.is_enabled and next.category='NORMAL' and next.prerequisite_mission_id=v_entry.mission_id
    on conflict(user_id,mission_id) do nothing;
    update public.mission_reward_delivery_ledger set delivery_status='DELIVERED',delivered_at=clock_timestamp()
      where id=v_ledger_id;
    if v_entry.event_id is not null then
      insert into public.mission_event_telemetry(event_id,user_id,event_name,mission_id,jst_date,source)
      values(v_entry.event_id,v_uid,
        case when v_entry.trigger_type='GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
          then 'complete_reward_claimed' else 'mission_reward_claimed' end,
        v_entry.mission_id,(clock_timestamp() at time zone 'Asia/Tokyo')::date,'bulk_claim');
    end if;
    v_count:=v_count+1;
  end loop;
  if exists(select 1 from public.missions where id=any(p_mission_ids) and event_id is not null) then
    insert into public.mission_event_telemetry(event_id,user_id,event_name,jst_date,source,metadata)
    values('GVG_PREP_20260904',v_uid,'bulk_claim',(clock_timestamp() at time zone 'Asia/Tokyo')::date,
      'bulk_claim',jsonb_build_object('claimed_count',v_count));
  end if;
  perform public.refresh_normal_mission_owned_state(v_uid);
  return jsonb_build_object('claimed_count',v_count,'delivery','DIRECT','rewards',v_rewards);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_mission_events()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',event.id,'display_name',event.display_name,'start_at',event.start_at,
    'progress_end_at',event.progress_end_at,'claim_deadline',event.claim_deadline,
    'banner_image_url',event.banner_image_url,'banner_title',event.banner_title,
    'banner_subtitle',event.banner_subtitle,'banner_cta_label',event.banner_cta_label,
    'progress_open',clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at,
    'is_progress_active',clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at,
    'has_claimable_rewards',exists(
      select 1 from public.user_missions um join public.missions m on m.id=um.mission_id
      where um.user_id=v_uid and m.event_id=event.id and m.is_enabled and um.status='CLEAR'
        and (event.claim_deadline is null or clock_timestamp()<event.claim_deadline)
    )
  ) order by event.start_at),'[]'::jsonb) into v_result
  from public.mission_events event
  where event.is_enabled and (
    (clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at)
    or exists(
      select 1 from public.user_missions um join public.missions m on m.id=um.mission_id
      where um.user_id=v_uid and m.event_id=event.id and um.status in ('CLEAR','CLAIMED')
    )
  );
  return v_result;
end;
$function$;
