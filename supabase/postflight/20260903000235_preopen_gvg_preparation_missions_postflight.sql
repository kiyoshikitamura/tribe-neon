do $$
declare
  v_single text;
  v_bulk text;
  v_sync text;
  v_evaluator text;
  v_active_events text;
  v_totals jsonb;
begin
  if not exists (
    select 1 from public.mission_events
    where id='GVG_PREP_20260904'
      and start_at='2026-09-04 00:00:00 Asia/Tokyo'::timestamptz
      and progress_end_at='2026-09-08 00:00:00 Asia/Tokyo'::timestamptz
      and claim_deadline is null and is_enabled
  ) then raise exception 'GVG preparation event window/claim contract mismatch'; end if;

  if (select count(*) from public.missions where event_id='GVG_PREP_20260904') <> 13
    or (select count(*) from public.missions where event_id='GVG_PREP_20260904'
      and trigger_type<>'GVG_PREP_REQUIRED_MISSIONS_COMPLETED') <> 12
    or (select target_value from public.missions where id='GVG_PREP_COMPLETE') <> 12 then
    raise exception 'GVG preparation mission cardinality mismatch';
  end if;

  select jsonb_object_agg(item_id,total_quantity order by item_id) into v_totals
  from (
    select item_id,sum(quantity)::integer total_quantity
    from public.mission_reward_components component
    join public.missions mission on mission.id=component.mission_id
    where mission.event_id='GVG_PREP_20260904'
    group by item_id
  ) totals;
  if v_totals <> jsonb_build_object(
    'CHAR_EXP_L',7,'EQUIP_EXP_L',5,'SKILL_MANUAL',8,'EQUIP_LB_PART',8,
    'AWAKENING_BOOK',1,'SPECIAL_TICKET_CHARACTER',1,'SPECIAL_TICKET_SKILL',1,
    'SPECIAL_TICKET_EQUIPMENT',1,'ENERGY_DRINK',2,'PVP_POINT_TICKET',2,
    'RAID_POINT_TICKET',2
  ) then raise exception 'GVG preparation reward totals mismatch: %',v_totals; end if;
  if (select sum(cash_reward) from public.missions where event_id='GVG_PREP_20260904') <> 1000 then
    raise exception 'GVG preparation CASH total mismatch';
  end if;
  if not exists(select 1 from public.mission_reward_components
    where mission_id='GVG_PREP_COMPLETE' and reward_order=4
      and item_id='EQUIP_LB_PART' and quantity=2) then
    raise exception 'GVG preparation complete fourth reward missing';
  end if;
  if (select count(distinct target_value) from public.missions
      where id in('GVG_PREP_07','GVG_PREP_08')) <> 2
    or (select count(distinct trigger_type) from public.missions
      where id in('GVG_PREP_07','GVG_PREP_08')) <> 1 then
    raise exception 'Quest 5/10 shared counter contract mismatch';
  end if;

  select pg_get_functiondef('public.claim_mission_reward(text)'::regprocedure) into v_single;
  select pg_get_functiondef('public.claim_all_mission_rewards(text[])'::regprocedure) into v_bulk;
  select pg_get_functiondef('public.sync_current_missions()'::regprocedure) into v_sync;
  select pg_get_functiondef('public.evaluate_mission_progress(uuid,text,integer)'::regprocedure) into v_evaluator;
  select pg_get_functiondef('public.get_active_mission_events()'::regprocedure) into v_active_events;
  if position('grant_mission_reward_bundle' in v_single)=0
    or position('grant_mission_reward_bundle' in v_bulk)=0
    or position('ensure_active_special_missions' in v_sync)=0
    or position('progress_end_at' in v_evaluator)=0
    or position('progress_open' in v_active_events)=0 then
    raise exception 'Special mission authority is not connected';
  end if;
  if position('insert into public.presents' in lower(v_single))>0
    or position('insert into public.presents' in lower(v_bulk))>0 then
    raise exception 'Special mission claim bypasses direct grant authority';
  end if;
  if to_regprocedure('public.get_active_mission_events()') is null
    or to_regprocedure('public.get_pending_mission_event_dialog()') is null
    or to_regprocedure('public.mark_mission_event_dialog_viewed(text,date)') is null
    or to_regprocedure('public.record_mission_event_telemetry(text,text,text,text,jsonb)') is null then
    raise exception 'Mission event UI projection RPC is missing';
  end if;
  if not exists(select 1 from pg_trigger
    where tgname='ranking_successful_view_special_mission_trigger' and not tgisinternal)
    or not exists(select 1 from pg_trigger
      where tgname='main_formation_special_mission_change_trigger' and not tgisinternal) then
    raise exception 'Ranking/power progress hook is missing';
  end if;
  if not exists(select 1 from public.canonical_master_freeze_versions
    where domain='MISSION_EVENT' and version='2026-09-03' and is_production_enabled) then
    raise exception 'Mission event canonical master marker missing';
  end if;
end;
$$;
