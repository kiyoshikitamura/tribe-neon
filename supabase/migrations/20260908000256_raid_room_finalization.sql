begin;

-- Roomの正本は台帳と開始receipt。クライアント指定metadataだけでは認定しない。
create function public.get_raid_battle_route_v1(p_replay_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_replay public.battle_replay_sessions%rowtype; v_room public.raid_rooms%rowtype;
begin
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id;
 if not found or v_replay.battle_mode<>'RAID' or v_replay.resolution_authority<>'RAID_SERVER' then
  raise exception 'official Raid replay required' using errcode='42501'; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=v_replay.source_reference_id;
 if not found then
  if v_replay.official_context ? 'roomId' or exists(select 1 from public.raid_room_battle_start_requests where replay_session_id=p_replay_id) then
   raise exception 'Room authority mismatch' using errcode='23514'; end if;
  return 'LEGACY';
 end if;
 if v_replay.official_context->>'roomId' is distinct from v_room.id::text
 or v_replay.official_context->>'raidRoomVersion' is distinct from '1'
 or not exists(select 1 from public.raid_room_battle_start_requests q
  where q.replay_session_id=p_replay_id and q.user_id=v_replay.requester_user_id and q.room_id=v_room.id
   and q.tactic=v_replay.tactic_id and q.response->>'replay_session_id'=p_replay_id::text
   and q.response->>'room_id'=v_room.id::text)
 then raise exception 'Room start receipt missing or mismatched' using errcode='23514'; end if;
 return 'ROOM';
end $$;

-- service用期限確定。期限終了後のHPや既確定の討伐結果は上書きしない。
create function public.finalize_expired_raid_room_v1(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_instance public.raid_bosses%rowtype; v_now timestamptz;
begin
 select b.* into v_instance from public.raid_bosses b join public.raid_rooms r on r.raid_boss_instance_id=b.id
 where r.id=p_room_id for update of b;
 if not found then raise exception 'Room missing' using errcode='P0002'; end if;
 v_now:=clock_timestamp();
 if v_instance.status='ACTIVE' and v_instance.outcome_finalized_at is null and v_instance.expires_at<=v_now then
  update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=v_now
  where id=v_instance.id returning * into v_instance;
 end if;
 return jsonb_build_object('roomId',p_room_id,'state',lower(v_instance.status),'outcome',v_instance.outcome,'remainingBossHp',v_instance.current_hp);
end $$;

create function public.finalize_raid_room_battle_v1(
  p_replay_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_replay public.battle_replay_sessions%rowtype;
  v_instance public.raid_bosses%rowtype;
  v_room public.raid_rooms%rowtype;
  v_now timestamptz;
  v_late boolean;
  v_raw bigint;
  v_applied bigint;
  v_remaining bigint;
  v_total bigint;
  v_progress public.raid_instance_user_progress%rowtype;
  v_final jsonb;
begin
  select * into v_replay
  from public.battle_replay_sessions
  where id = p_replay_id
  for update;

  if not found
     or v_replay.battle_mode <> 'RAID'
     or v_replay.resolution_authority <> 'RAID_SERVER' then
    raise exception 'not an official Raid replay' using errcode = '42501';
  end if;
  if public.get_raid_battle_route_v1(p_replay_id)<>'ROOM' then
    raise exception 'Room replay required' using errcode='42501';
  end if;
  if v_replay.finalization_status = 'FINALIZED' then
    return v_replay.finalization_result;
  end if;
  if v_replay.status <> 'PENDING'
     or v_replay.finalization_status <> 'PENDING' then
    raise exception 'Raid replay is not finalizable' using errcode = '23514';
  end if;

  perform public.validate_official_battle_result(p_result);
  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;

  select * into strict v_room from public.raid_rooms where raid_boss_instance_id=v_instance.id;
  -- 開始時刻は255が生成したもの。期限前に正規開始済みの戦闘だけを保存する。
  if v_replay.official_context->>'startedAt' is null
    or (v_replay.official_context->>'startedAt')::timestamptz>=v_instance.expires_at then
    raise exception 'Room battle did not start before expiry' using errcode='23514'; end if;
  v_now:=clock_timestamp();
  v_late:=v_instance.status<>'ACTIVE' or v_instance.outcome_finalized_at is not null
    or v_instance.expires_at<=v_now or v_instance.current_hp<=0;
  v_raw := greatest(coalesce((p_result->>'playerRawDamage')::bigint, 0), 0);
  v_applied := case when v_late then 0 else least(v_raw,greatest(v_instance.current_hp,0)) end;
  v_remaining := greatest(v_instance.current_hp-v_applied,0);
  if not v_late then
    update public.raid_bosses set current_hp=v_remaining,
      status=case when v_remaining=0 then 'CLEARED' else status end,
      outcome=case when v_remaining=0 then 'DEFEAT_SUCCESS' else outcome end,
      outcome_finalized_at=case when v_remaining=0 then v_now else outcome_finalized_at end,
      cleared_at=case when v_remaining=0 then v_now else cleared_at end
    where id=v_instance.id returning * into v_instance;
  elsif v_instance.status='ACTIVE' and v_instance.outcome_finalized_at is null and v_instance.expires_at<=v_now then
    update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=v_now
    where id=v_instance.id returning * into v_instance;
  end if;

  insert into public.raid_damage_logs(
    boss_id, raid_boss_id, user_id, damage, damage_dealt,
    raid_boss_instance_id, battle_replay_session_id, guild_id,
    raw_damage, applied_damage
  ) values (
    v_instance.boss_id, v_instance.boss_id, v_replay.requester_user_id,
    v_raw, v_raw, v_instance.id, p_replay_id,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid,
    v_raw, v_applied
  );

  insert into public.raid_instance_user_progress(
    raid_boss_instance_id, user_id, finalized_battles,
    raid_points_consumed, last_guild_id
  ) values (
    v_instance.id, v_replay.requester_user_id, 1,
    case when v_replay.official_context->>'costType' = 'RAID_POINT' then 1 else 0 end,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid
  )
  on conflict(raid_boss_instance_id, user_id) do update set
    finalized_battles = public.raid_instance_user_progress.finalized_battles + 1,
    raid_points_consumed = public.raid_instance_user_progress.raid_points_consumed
      + excluded.raid_points_consumed,
    last_guild_id = excluded.last_guild_id,
    updated_at = clock_timestamp()
  returning * into v_progress;

  select coalesce(sum(raw_damage), 0) into v_total
  from public.raid_damage_logs
  where raid_boss_instance_id = v_instance.id
    and user_id = v_replay.requester_user_id;

  v_final := p_result || jsonb_build_object(
    'mode', 'RAID',
    'roomId', v_room.id,
    'roomOutcome', v_instance.outcome,
    'lateFinalization', v_late,
    'raidInstanceId', v_instance.id,
    'baseId', v_instance.base_id,
    'raidDayKey', v_instance.raid_day_key,
    'raidVariantId', v_instance.raid_variant_id,
    'rawDamage', v_raw,
    'appliedDamage', v_applied,
    'remainingBossHp', v_remaining,
    'personalContribution', v_total,
    'guildIdSnapshot', v_replay.official_context->>'guildIdSnapshot',
    'participationProgress', to_jsonb(v_progress)
  );

  insert into public.battle_replay_events(
    battle_replay_session_id, event_index, round_number, event_type, payload
  )
  select p_replay_id,
         greatest(coalesce((event.value->>'index')::integer, event.ordinality::integer - 1), 0),
         greatest(coalesce((event.value->>'round')::integer, 1), 1),
         coalesce(nullif(event.value->>'type', ''), 'UNKNOWN'),
         coalesce(event.value->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_result->'events') with ordinality event(value, ordinality)
  on conflict do nothing;

  update public.battle_replay_sessions
  set status = 'RESOLVED',
      result = v_final,
      resolved_at = clock_timestamp(),
      finalization_status = 'FINALIZED',
      finalized_at = clock_timestamp(),
      finalization_result = v_final
  where id = p_replay_id;

  -- Room報酬・旧ミッション資格はここで新規付与しない。
  return v_final;
end
$$;

create function public.get_raid_room_battle_result_v1(p_replay_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_replay public.battle_replay_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id and requester_user_id=auth.uid();
 if not found then raise exception 'owned replay missing' using errcode='P0002'; end if;
 if public.get_raid_battle_route_v1(p_replay_id)<>'ROOM' then raise exception 'Room replay required' using errcode='42501'; end if;
 if v_replay.finalization_status='FINALIZED' then return v_replay.finalization_result; end if;
 return null;
end $$;

create or replace function public.on_canonical_daily_activity_finalized() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  v_key:='PVP_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"CHAR_EXP_S","quantity":1}]',now()) on conflict do nothing;
  if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'CHAR_EXP_S',1,'PvPバトル報酬','UNCLAIMED',now()+interval '30 days'); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='PVP' and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'PVP_DAILY_3',new.id,'[{"itemId":"SKILL_MANUAL","quantity":1},{"itemId":"CASH","quantity":40}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'SKILL_MANUAL',1,'PvPデイリー報酬','UNCLAIMED',now()+interval '30 days'),(new.requester_user_id,'CASH',40,'PvPデイリー報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1}]',now()) on conflict do nothing;
  if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'EQUIP_EXP_S',1,'レイドバトル報酬','UNCLAIMED',now()+interval '30 days'); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1},{"itemId":"CASH","quantity":40}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'CHAR_EXP_M',1,'レイドデイリー報酬','UNCLAIMED',now()+interval '30 days'),(new.requester_user_id,'CASH',40,'レイドデイリー報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'EQUIP_LB_PART',1,'レイド参加報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
 end if;
 return new;
end $$;

create or replace function public.on_canonical_guild_official_battle_exp() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.finalization_status='FINALIZED' and old.finalization_status is distinct from 'FINALIZED' then
 if new.battle_mode='PVP' and new.resolution_authority='PVP_SERVER' then perform public.grant_canonical_guild_daily_exp(new.requester_user_id,'PVP_FINALIZED',new.id);
 elsif new.battle_mode='RAID' and new.resolution_authority='RAID_SERVER' and not exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then perform public.grant_canonical_guild_daily_exp(new.requester_user_id,'RAID_FINALIZED',new.id); end if; end if; return new; end $$;

create or replace function public.capture_daily_ranking_participation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_day date;
begin
  if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
  if new.battle_mode='RAID' and exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_type:=case new.battle_mode when 'PVP' then 'PVP' when 'RAID' then 'RAID_PERSONAL' end;
  if v_type is null or new.finalized_at is null then return new; end if;
  v_day:=(new.finalized_at at time zone 'Asia/Tokyo')::date;
  insert into public.ranking_daily_participation(
    ranking_day_key,ranking_type,user_id,finalized_count,first_finalized_at,last_finalized_at
  ) values(v_day,v_type,new.requester_user_id,1,new.finalized_at,new.finalized_at)
  on conflict(ranking_day_key,ranking_type,user_id) do update set
    finalized_count=public.ranking_daily_participation.finalized_count+1,
    first_finalized_at=least(public.ranking_daily_participation.first_finalized_at,excluded.first_finalized_at),
    last_finalized_at=greatest(public.ranking_daily_participation.last_finalized_at,excluded.last_finalized_at);
  return new;
end;
$$;


create or replace function public.finalize_raid_battle(
  p_replay_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_replay public.battle_replay_sessions%rowtype;
  v_instance public.raid_bosses%rowtype;
  v_raw bigint;
  v_applied bigint;
  v_remaining bigint;
  v_total bigint;
  v_progress public.raid_instance_user_progress%rowtype;
  v_final jsonb;
begin
  select * into v_replay
  from public.battle_replay_sessions
  where id = p_replay_id
  for update;

  if not found
     or v_replay.battle_mode <> 'RAID'
     or v_replay.resolution_authority <> 'RAID_SERVER' then
    raise exception 'not an official Raid replay' using errcode = '42501';
  end if;
  if v_replay.finalization_status = 'FINALIZED' then
    return v_replay.finalization_result;
  end if;
  if v_replay.status <> 'PENDING'
     or v_replay.finalization_status <> 'PENDING' then
    raise exception 'Raid replay is not finalizable' using errcode = '23514';
  end if;

  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;


 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=v_instance.id) then raise exception 'Room battles require the Room finalization entry point' using errcode='55000'; end if;
  -- 229の非Roomランキングlifecycle hookを復元。Room拒否後にのみ実行。
  perform public.advance_ranking_season('RAID',clock_timestamp());
  perform public.validate_official_battle_result(p_result);
  v_raw := greatest(coalesce((p_result->>'playerRawDamage')::bigint, 0), 0);
  v_applied := least(v_raw, greatest(v_instance.current_hp, 0));
  v_remaining := greatest(v_instance.current_hp - v_applied, 0);

  update public.raid_bosses
  set current_hp = v_remaining
  where id = v_instance.id;

  insert into public.raid_damage_logs(
    boss_id, raid_boss_id, user_id, damage, damage_dealt,
    raid_boss_instance_id, battle_replay_session_id, guild_id,
    raw_damage, applied_damage
  ) values (
    v_instance.boss_id, v_instance.boss_id, v_replay.requester_user_id,
    v_raw, v_raw, v_instance.id, p_replay_id,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid,
    v_raw, v_applied
  );

  insert into public.raid_instance_user_progress(
    raid_boss_instance_id, user_id, finalized_battles,
    raid_points_consumed, last_guild_id
  ) values (
    v_instance.id, v_replay.requester_user_id, 1,
    case when v_replay.official_context->>'costType' = 'RAID_POINT' then 1 else 0 end,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid
  )
  on conflict(raid_boss_instance_id, user_id) do update set
    finalized_battles = public.raid_instance_user_progress.finalized_battles + 1,
    raid_points_consumed = public.raid_instance_user_progress.raid_points_consumed
      + excluded.raid_points_consumed,
    last_guild_id = excluded.last_guild_id,
    updated_at = clock_timestamp()
  returning * into v_progress;

  select coalesce(sum(raw_damage), 0) into v_total
  from public.raid_damage_logs
  where raid_boss_instance_id = v_instance.id
    and user_id = v_replay.requester_user_id;

  v_final := p_result || jsonb_build_object(
    'mode', 'RAID',
    'raidInstanceId', v_instance.id,
    'baseId', v_instance.base_id,
    'raidDayKey', v_instance.raid_day_key,
    'raidVariantId', v_instance.raid_variant_id,
    'rawDamage', v_raw,
    'appliedDamage', v_applied,
    'remainingBossHp', v_remaining,
    'personalContribution', v_total,
    'guildIdSnapshot', v_replay.official_context->>'guildIdSnapshot',
    'participationProgress', to_jsonb(v_progress)
  );

  insert into public.battle_replay_events(
    battle_replay_session_id, event_index, round_number, event_type, payload
  )
  select p_replay_id,
         greatest(coalesce((event.value->>'index')::integer, event.ordinality::integer - 1), 0),
         greatest(coalesce((event.value->>'round')::integer, 1), 1),
         coalesce(nullif(event.value->>'type', ''), 'UNKNOWN'),
         coalesce(event.value->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_result->'events') with ordinality event(value, ordinality)
  on conflict do nothing;

  update public.battle_replay_sessions
  set status = 'RESOLVED',
      result = v_final,
      resolved_at = clock_timestamp(),
      finalization_status = 'FINALIZED',
      finalized_at = clock_timestamp(),
      finalization_result = v_final
  where id = p_replay_id;

  perform public.evaluate_mission_progress(
    v_replay.requester_user_id,
    'RAID_FINALIZED_BATTLE_COUNT',
    1
  );

  if v_remaining = 0 then
    perform public.finalize_expired_raid_instance(v_instance.id);
  end if;
  return v_final;
end
$$;


revoke all on function public.get_raid_battle_route_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_raid_battle_route_v1(uuid) to service_role;
revoke all on function public.finalize_expired_raid_room_v1(uuid) from public,anon,authenticated;
grant execute on function public.finalize_expired_raid_room_v1(uuid) to service_role;
revoke all on function public.finalize_raid_room_battle_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_raid_room_battle_v1(uuid,jsonb) to service_role;
revoke all on function public.get_raid_room_battle_result_v1(uuid) from public,anon;
grant execute on function public.get_raid_room_battle_result_v1(uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
