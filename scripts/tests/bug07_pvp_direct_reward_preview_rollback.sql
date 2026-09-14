BEGIN;
SET LOCAL statement_timeout='45s';
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

CREATE FUNCTION pg_temp.reject_bug07_delivery() RETURNS trigger LANGUAGE plpgsql AS $fail$
BEGIN
 IF current_setting('bug07.fail_delivery',true)='on' AND new.item_id='CHAR_EXP_S' THEN
  RAISE EXCEPTION USING ERRCODE='ZX007',MESSAGE='injected BUG-07 asset failure';
 END IF;
 RETURN new;
END $fail$;
CREATE TRIGGER bug07_test_delivery_failure BEFORE INSERT OR UPDATE ON public.user_items FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_bug07_delivery();

DO $test$
DECLARE
 v_src public.battle_replay_sessions%rowtype;
 v_copy public.battle_replay_sessions%rowtype;
 v_uid uuid; v_result jsonb; v_again jsonb; v_payload jsonb;
 v_before_cash bigint; v_before_exp bigint; v_before_manual bigint;
 v_presents bigint; v_claims bigint; v_after_claims bigint; v_n integer;
BEGIN
 SELECT * INTO STRICT v_src FROM public.battle_replay_sessions
 WHERE battle_mode='PVP' AND finalization_status='FINALIZED' ORDER BY id LIMIT 1;
 v_uid:=v_src.requester_user_id; v_payload:=v_src.finalization_result;
 PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
 -- Isolate the daily threshold without modifying the existing reward records permanently.
 UPDATE public.battle_replay_sessions SET finalized_at=now()-interval '1 day'
 WHERE requester_user_id=v_uid AND battle_mode='PVP' AND finalization_status='FINALIZED';
 DELETE FROM public.canonical_daily_activity_claims
 WHERE user_id=v_uid AND game_day=(now() at time zone 'Asia/Tokyo')::date AND source_key='PVP_DAILY_3';
 SELECT cash INTO v_before_cash FROM users WHERE id=v_uid;
 SELECT coalesce(sum(quantity),0) INTO v_before_exp FROM user_items WHERE user_id=v_uid AND item_id='CHAR_EXP_S';
 SELECT coalesce(sum(quantity),0) INTO v_before_manual FROM user_items WHERE user_id=v_uid AND item_id='SKILL_MANUAL';
 SELECT count(*) INTO v_presents FROM presents;
 FOR v_n IN 1..3 LOOP
  v_copy:=v_src;
  v_copy.id:=gen_random_uuid(); v_copy.status:='PENDING';v_copy.finalization_status:='PENDING';
  v_copy.result:=null;v_copy.finalization_result:=null;v_copy.resolved_at:=null;v_copy.finalized_at:=null;v_copy.created_at:=now();
  INSERT INTO public.battle_replay_sessions SELECT (v_copy).*;
  v_result:=public.finalize_pvp_battle(v_copy.id,v_payload);
  IF v_result->>'reward_delivery'<>'INVENTORY' THEN RAISE EXCEPTION 'Result missing inventory receipt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'reward_items') i WHERE i->>'itemId'='CHAR_EXP_S' AND (i->>'quantity')::integer=1) THEN RAISE EXCEPTION 'Result EXP receipt mismatch'; END IF;
  IF jsonb_array_length(v_result->'reward_items')<>(CASE WHEN v_n=3 THEN 3 ELSE 1 END) THEN RAISE EXCEPTION 'Result daily receipt mismatch'; END IF;
  SELECT count(*) INTO v_claims FROM canonical_daily_activity_claims;
  v_again:=public.finalize_pvp_battle(v_copy.id,v_payload);
  SELECT count(*) INTO v_after_claims FROM canonical_daily_activity_claims;
  IF v_again IS DISTINCT FROM v_result OR v_claims<>v_after_claims THEN RAISE EXCEPTION 'Retry changed receipt or claims'; END IF;
 END LOOP;
 IF (SELECT cash FROM users WHERE id=v_uid)<>v_before_cash+40 THEN RAISE EXCEPTION 'Cash was not directly granted once'; END IF;
 IF (SELECT coalesce(sum(quantity),0) FROM user_items WHERE user_id=v_uid AND item_id='CHAR_EXP_S')<>v_before_exp+3 THEN RAISE EXCEPTION 'Battle EXP direct quantity mismatch'; END IF;
 IF (SELECT coalesce(sum(quantity),0) FROM user_items WHERE user_id=v_uid AND item_id='SKILL_MANUAL')<>v_before_manual+1 THEN RAISE EXCEPTION 'Daily manual quantity mismatch'; END IF;
 IF (SELECT count(*) FROM presents)<>v_presents THEN RAISE EXCEPTION 'PvP still created Presents'; END IF;

 -- Asset write rejection must undo the preceding claim, rank and replay mutations.
 v_copy.id:=gen_random_uuid();
 INSERT INTO public.battle_replay_sessions SELECT (v_copy).*;
 SELECT count(*) INTO v_claims FROM canonical_daily_activity_claims;
 PERFORM set_config('bug07.fail_delivery','on',true);
 BEGIN
  PERFORM public.finalize_pvp_battle(v_copy.id,v_payload);
  RAISE EXCEPTION 'Expected delivery failure did not occur';
 EXCEPTION WHEN SQLSTATE 'ZX007' THEN NULL;
 END;
 PERFORM set_config('bug07.fail_delivery','off',true);
 IF (SELECT finalization_status FROM battle_replay_sessions WHERE id=v_copy.id)<>'PENDING'
  OR (SELECT count(*) FROM canonical_daily_activity_claims)<>v_claims
  OR (SELECT cash FROM users WHERE id=v_uid)<>v_before_cash+40
  OR (SELECT coalesce(sum(quantity),0) FROM user_items WHERE user_id=v_uid AND item_id='CHAR_EXP_S')<>v_before_exp+3
 THEN RAISE EXCEPTION 'Failed delivery did not roll back atomically'; END IF;
END $test$;
SELECT 'PASS: official PvP finalize x3, direct item/cash deltas, day3 bonus, Result receipt matches, retry exact-once, no Presents, injected asset failure atomic rollback' result;
ROLLBACK;