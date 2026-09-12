-- Fail closed if function definitions changed since the Preview read-only review.
DO $guard$
begin
  if md5(replace(pg_get_functiondef('public.claim_all_mission_rewards(text[])'::regprocedure),chr(13),'')) <> 'd51b01aa921b8f2e1469638a9c464db4' then raise exception 'Preview mission function drift: claim_all_mission_rewards(text[])'; end if;
  if md5(replace(pg_get_functiondef('public.claim_mission_reward(text)'::regprocedure),chr(13),'')) <> 'cf5a920c1a26cecad30e7d248e098971' then raise exception 'Preview mission function drift: claim_mission_reward(text)'; end if;
  if md5(replace(pg_get_functiondef('public.evaluate_mission_progress(uuid,text,integer)'::regprocedure),chr(13),'')) <> 'acf5fdb508691d93d887b122ceacb4df' then raise exception 'Preview mission function drift: evaluate_mission_progress(uuid,text,integer)'; end if;
  if md5(replace(pg_get_functiondef('public.sync_current_missions()'::regprocedure),chr(13),'')) <> '2eeb9ec0c795486cac7961edb0c45783' then raise exception 'Preview mission function drift: sync_current_missions()'; end if;
end;
$guard$;

-- Do not downgrade potentially legitimate historical achievements without review.
DO $impact_guard$
begin
  if exists (
    select 1 from public.user_missions um join public.missions m on m.id=um.mission_id
    where m.is_enabled and m.category='NORMAL' and um.status='CLEAR'
    and case m.trigger_type
      when 'CHARACTER_LEVEL_AT_LEAST' then (select coalesce(max(level),0) from public.user_characters where user_id=um.user_id)
      when 'CHARACTER_AWAKENING_AT_LEAST' then (select coalesce(max(awakening_level),0) from public.user_characters where user_id=um.user_id)
      when 'SKILL_AWAKENING_AT_LEAST' then (select coalesce(max(plus_val),0) from public.user_skills where user_id=um.user_id)
      when 'EQUIPMENT_LIMIT_BREAK_AT_LEAST' then (select coalesce(max(plus_val),0) from public.user_equipments where user_id=um.user_id)
      else m.target_value end < m.target_value
  ) then raise exception 'Unclaimed CLEAR below current owned maximum requires historical achievement review'; end if;
end;
$impact_guard$;

-- Preview candidate only. Apply before live regression; no automatic reward grant.
-- Owned-state conditions only; lifetime counters and guild tenure remain separate.
CREATE OR REPLACE FUNCTION public.refresh_normal_mission_owned_state(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
REVOKE ALL ON FUNCTION public.refresh_normal_mission_owned_state(uuid) FROM PUBLIC,anon,authenticated;

-- Existing Preview definition retained except explicit owned-state hook: claim_all_mission_rewards(text[])
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


-- Existing Preview definition retained except explicit owned-state hook: claim_mission_reward(text)
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


-- Existing Preview definition retained except explicit owned-state hook: evaluate_mission_progress(uuid,text,integer)
CREATE OR REPLACE FUNCTION public.evaluate_mission_progress(p_user_id uuid, p_trigger_type text, p_progress_increment integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_types text[];
  v_event record;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Mission progress owner mismatch' using errcode = '42501';
  end if;
  if p_trigger_type is null or btrim(p_trigger_type) = ''
    or p_progress_increment not between 1 and 1000 then
    raise exception 'Invalid mission progress event' using errcode = '22023';
  end if;

  perform public.ensure_active_special_missions(p_user_id);

  v_types := case p_trigger_type
    when 'GACHA_PULL' then array['NORMAL_FREE_GACHA_PULL_COUNT']
    when 'CHAR_LEVEL_UP' then array['CHARACTER_ENHANCE_COUNT','CHARACTER_LEVEL_AT_LEAST','CHARACTER_LEVEL_TOTAL_INCREASE']
    when 'GEAR_UPGRADE' then array['EQUIPMENT_ENHANCE_COUNT','EQUIPMENT_LEVEL_AT_LEAST','EQUIPMENT_LEVEL_TOTAL_INCREASE']
    when 'GEAR_LIMIT_BREAK' then array['EQUIPMENT_LIMIT_BREAK_COUNT']
    when 'SKILL_LIMIT_BREAK' then array['SKILL_ENHANCE_COUNT','SKILL_LEVEL_AT_LEAST','SKILL_LEVEL_TOTAL_INCREASE']
    when 'PATROL_CLEAR' then array['QUEST_COMPLETE_COUNT','QUEST_CLEAR_COUNT']
    when 'PVP_FINALIZED' then array['PVP_FINALIZED_BATTLE_COUNT']
    when 'PVP_BATTLE_COUNT' then array['PVP_FINALIZED_BATTLE_COUNT']
    when 'PVP_WIN' then array['PVP_WIN_COUNT']
    when 'RAID_FINALIZED' then array['RAID_FINALIZED_BATTLE_COUNT']
    when 'RAID_CLEAR_ELIGIBLE' then array['RAID_CLEAR_ELIGIBLE_COUNT']
    when 'GUILD_JOIN' then array['GUILD_JOIN_COUNT']
    when 'GUILD_ACTIVITY' then array['GUILD_ACTIVITY_COUNT']
    when 'GUILD_CHAT' then array['GUILD_ACTIVITY_COUNT','GUILD_CHAT_MESSAGE_COUNT']
    when 'GVG_FINALIZED' then array['GVG_FINALIZED_BATTLE_COUNT']
    when 'GVG_WIN' then array['GVG_WIN_COUNT']
    else array[p_trigger_type]
  end;

  update public.user_missions um
  set current_progress = least(m.target_value, um.current_progress + p_progress_increment),
      progress_val = least(m.target_value, um.current_progress + p_progress_increment),
      status = case when um.current_progress + p_progress_increment >= m.target_value then 'CLEAR' else 'PROGRESS' end,
      updated_at = clock_timestamp()
  from public.missions m
  left join public.mission_events event on event.id = m.event_id
  where um.user_id = p_user_id
    and um.mission_id = m.id
    and m.is_enabled
    and m.trigger_type = any(v_types)
    and not (m.category='NORMAL' and m.trigger_type in (
      'CHARACTER_LEVEL_AT_LEAST','CHARACTER_AWAKENING_AT_LEAST',
      'SKILL_AWAKENING_AT_LEAST','EQUIPMENT_LIMIT_BREAK_AT_LEAST'))
    and m.trigger_type <> 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
    and um.status = 'PROGRESS'
    and (
      m.category <> 'SPECIAL'
      or (
        event.is_enabled
        and clock_timestamp() >= event.start_at
        and clock_timestamp() < event.progress_end_at
      )
    );

  perform public.refresh_normal_mission_owned_state(p_user_id);

  -- Re-evaluate canonical main-deck power after authoritative growth events.
  perform public.ensure_active_special_missions(p_user_id);
  for v_event in select id from public.mission_events where is_enabled loop
    perform public.refresh_special_event_completion(p_user_id, v_event.id);
  end loop;
end;
$function$;


-- Existing Preview definition retained except explicit owned-state hook: sync_current_missions()
CREATE OR REPLACE FUNCTION public.sync_current_missions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_cycle_date date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_rescue record;
  v_rescued integer := 0;
begin
  if v_user_id is null or not exists (select 1 from public.users where id = v_user_id) then
    raise exception 'Player authentication required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':missions', 0));

  for v_rescue in
    select um.mission_id, m.title, m.reward_item_id, m.reward_quantity
    from public.user_missions um join public.missions m on m.id = um.mission_id
    where um.user_id = v_user_id and m.category = 'DAILY'
      and um.cycle_date is distinct from v_cycle_date and um.status = 'CLEAR'
    for update of um
  loop
    insert into public.presents(user_id,item_id,quantity,message,status,sent_at,expire_at)
    values(v_user_id,v_rescue.reward_item_id,v_rescue.reward_quantity,
      'デイリーミッション未受取補填: ' || v_rescue.title,
      'UNCLAIMED',clock_timestamp(),clock_timestamp()+interval '24 hours');
    v_rescued := v_rescued + 1;
  end loop;

  update public.user_missions um
  set current_progress=0,progress_val=0,status='PROGRESS',claimed_at=null,
      cycle_date=v_cycle_date,updated_at=clock_timestamp()
  from public.missions m
  where um.user_id=v_user_id and um.mission_id=m.id and m.category='DAILY'
    and um.cycle_date is distinct from v_cycle_date;

  insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status,cycle_date)
  select v_user_id,m.id,0,0,'PROGRESS',case when m.category='DAILY' then v_cycle_date else null end
  from public.missions m
  where m.is_enabled and (
    m.category='DAILY' or (
      m.category='NORMAL' and (
        m.prerequisite_mission_id is null or exists(
          select 1 from public.user_missions prerequisite
          where prerequisite.user_id=v_user_id
            and prerequisite.mission_id=m.prerequisite_mission_id
            and prerequisite.status='CLAIMED'
        )
      )
    )
  )
  on conflict(user_id,mission_id) do nothing;

  update public.user_missions um
  set current_progress=m.target_value,progress_val=m.target_value,status='CLEAR',updated_at=clock_timestamp()
  from public.missions m
  where um.user_id=v_user_id and um.mission_id=m.id and m.category='DAILY'
    and m.trigger_type='DAILY_LOGIN' and um.cycle_date=v_cycle_date and um.status='PROGRESS';

  perform public.refresh_normal_mission_owned_state(v_user_id);
  perform public.ensure_active_special_missions(v_user_id);
  return jsonb_build_object('cycle_date',v_cycle_date,'rescued_count',v_rescued);
end;
$function$;
