-- BUG-07: finalized battle daily rewards must be direct inventory deliveries.
-- Existing claim uniqueness, amounts, eligibility and historical Presents are preserved.
BEGIN;
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.on_canonical_daily_activity_finalized()'::regprocedure))<>'6501601c1a9261adafe222c4c56b46b5'
 OR md5(pg_get_functiondef('public.finalize_pvp_battle(uuid,jsonb)'::regprocedure))<>'aa6c814928008083bc9b37feb2e9de89' THEN
 RAISE EXCEPTION 'BUG-07 battle reward definition drift'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.on_canonical_daily_activity_finalized()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  v_key:='PVP_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"CHAR_EXP_S","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
  if found then perform public.grant_present_payload(new.requester_user_id,'CHAR_EXP_S',1); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='PVP' and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'PVP_DAILY_3',new.id,'[{"itemId":"SKILL_MANUAL","quantity":1,"delivery":"INVENTORY"},{"itemId":"CASH","quantity":40,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'SKILL_MANUAL',1); perform public.grant_present_payload(new.requester_user_id,'CASH',40); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
  if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_EXP_S',1); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1,"delivery":"INVENTORY"},{"itemId":"CASH","quantity":40,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'CHAR_EXP_M',1); perform public.grant_present_payload(new.requester_user_id,'CASH',40); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_LB_PART',1); end if;
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.finalize_pvp_battle(p_replay_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_replay public.battle_replay_sessions%rowtype; v_win boolean; v_player integer; v_opponent integer; v_delta integer; v_new integer; v_final jsonb; v_name text;
begin
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id for update;
 if not found then raise exception 'PvP replay not found' using errcode='P0002'; end if;
 if v_replay.battle_mode<>'PVP' or v_replay.resolution_authority<>'PVP_SERVER' then raise exception 'replay is not official PvP' using errcode='42501'; end if;
 if v_replay.finalization_status='FINALIZED' then return v_replay.finalization_result; end if;
 if v_replay.status<>'PENDING' or v_replay.finalization_status<>'PENDING' then raise exception 'PvP replay is not finalizable' using errcode='23514'; end if;
 perform public.advance_ranking_season('PVP',clock_timestamp());
 perform public.validate_official_battle_result(p_result); v_win:=p_result->>'winner'='PLAYER';
 v_player:=coalesce((v_replay.official_context->>'playerRankPointsAtStart')::integer,1000); v_opponent:=coalesce((v_replay.official_context->>'opponentRankPointsAtStart')::integer,1000); v_delta:=public.canonical_pvp_rating_delta(v_player,v_opponent,case when v_win then 'WIN' else 'LOSS' end);
 insert into public.pvp_ranks(user_id,rank_points,daily_wins,season_wins,updated_at) values(v_replay.requester_user_id,greatest(1000+v_delta,0),case when v_win then 1 else 0 end,case when v_win then 1 else 0 end,now()) on conflict(user_id) do update set rank_points=greatest(public.pvp_ranks.rank_points+v_delta,0),daily_wins=public.pvp_ranks.daily_wins+case when v_win then 1 else 0 end,season_wins=public.pvp_ranks.season_wins+case when v_win then 1 else 0 end,updated_at=now() returning rank_points into v_new;
 select username into v_name from public.users where id=v_replay.requester_user_id; insert into public.pvp_defense_logs(user_id,attacker_id,attacker_name,result,points_change) values(v_replay.source_reference_id,v_replay.requester_user_id,v_name,case when v_win then 'DEFEAT' else 'VICTORY' end,-v_delta);
 v_final:=p_result||jsonb_build_object('mode','PVP','oldRating',v_player,'opponentRating',v_opponent,'rankDelta',v_delta,'newRankPoints',v_new,'remainingPvpPoints',coalesce((v_replay.official_context->>'remainingPvpPoints')::integer,0),'rewards',jsonb_build_object('cash',0,'diamonds',0,'xp',0));
 insert into public.battle_replay_events(battle_replay_session_id,event_index,round_number,event_type,payload) select p_replay_id,greatest(coalesce((e.value->>'index')::integer,e.ordinality::integer-1),0),greatest(coalesce((e.value->>'round')::integer,1),1),coalesce(nullif(e.value->>'type',''),'UNKNOWN'),coalesce(e.value->'payload','{}'::jsonb) from jsonb_array_elements(p_result->'events') with ordinality e(value,ordinality) on conflict do nothing;
 update public.battle_replay_sessions set status='RESOLVED',result=v_final,resolved_at=now(),finalization_status='FINALIZED',finalized_at=now(),finalization_result=v_final where id=p_replay_id;
 -- The AFTER-finalize trigger has committed its claim rows and direct asset grants
 -- in this transaction. Project that exact receipt, never a client estimate.
 select v_final || jsonb_build_object(
   'reward_items',coalesce(jsonb_agg(item.value) filter (where item.value is not null),'[]'::jsonb),
   'reward_delivery','INVENTORY'
 ) into v_final
 from public.canonical_daily_activity_claims claim
 cross join lateral jsonb_array_elements(claim.reward_payload) item(value)
 where claim.user_id=v_replay.requester_user_id and claim.source_ref=p_replay_id
   and item.value->>'delivery'='INVENTORY';
 -- Do not update finalization_status again: keep all finalize triggers exactly once.
 update public.battle_replay_sessions set result=v_final,finalization_result=v_final where id=p_replay_id;
 perform public.evaluate_mission_progress(v_replay.requester_user_id,'PVP_BATTLE_COUNT',1); if v_win then perform public.evaluate_mission_progress(v_replay.requester_user_id,'PVP_WIN_COUNT',1); end if;
 return v_final;
end $function$;

COMMIT;
