BEGIN;
SET LOCAL statement_timeout='45s';
CREATE FUNCTION pg_temp.reject_pvp_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('pvp_test.fail',true)='on' AND new.item_id='RAID_POINT_TICKET' THEN RAISE EXCEPTION USING ERRCODE='ZX009',MESSAGE='injected ticket failure'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER pvp_test_ticket_failure BEFORE INSERT OR UPDATE ON public.user_items FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_pvp_ticket();
DO $test$
DECLARE
 src public.battle_replay_sessions%rowtype; u uuid; opponent uuid; ids text[]; started jsonb; result jsonb; again jsonb; payload jsonb; rid uuid;
 cash0 bigint; tickets0 bigint; items0 jsonb; items1 jsonb; presents0 bigint; claims0 bigint; daily0 integer; season0 integer; rate0 integer;
 n integer; expected_cash integer; win boolean; recovered jsonb; failed_id uuid;
BEGIN
 SELECT b.* INTO STRICT src FROM public.battle_replay_sessions b
 WHERE b.battle_mode='PVP' AND b.finalization_status='FINALIZED'
 AND EXISTS(SELECT 1 FROM user_main_formations f WHERE f.user_id=b.requester_user_id)
 AND EXISTS(SELECT 1 FROM user_main_formations f WHERE f.user_id=b.source_reference_id) ORDER BY b.id LIMIT 1;
 u:=src.requester_user_id; opponent:=src.source_reference_id;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM public.advance_ranking_season('PVP',clock_timestamp());
 SELECT array_agg(user_character_id::text ORDER BY slot) INTO ids FROM user_main_formations WHERE user_id=u;
 UPDATE users SET pvp_points=5,pvp_points_last_recovered_at=now() WHERE id=u;
 SELECT cash INTO cash0 FROM users WHERE id=u;
 SELECT coalesce(sum(quantity),0) INTO tickets0 FROM user_items WHERE user_id=u AND item_id='RAID_POINT_TICKET';
 SELECT coalesce(jsonb_object_agg(item_id,quantity),'{}') INTO items0 FROM user_items WHERE user_id=u AND item_id<>'RAID_POINT_TICKET';
 SELECT count(*) INTO presents0 FROM presents WHERE user_id=u;
 SELECT count(*) INTO claims0 FROM canonical_daily_activity_claims WHERE user_id=u AND source_key='PVP_DAILY_3';
 SELECT daily_wins,season_wins INTO daily0,season0 FROM pvp_ranks WHERE user_id=u;
 daily0:=coalesce(daily0,0); season0:=coalesce(season0,0);
 FOR n IN 1..4 LOOP
  win:=n<=3;
  started:=public.start_pvp_battle(opponent,ids,'BALANCED'); rid:=(started->>'replay_session_id')::uuid;
  IF (started->>'remaining_pvp_points')::int<>5-n THEN RAISE EXCEPTION 'BP consume mismatch'; END IF;
  SELECT rank_points INTO rate0 FROM pvp_ranks WHERE user_id=u; rate0:=coalesce(rate0,1000);
  payload:=src.finalization_result||jsonb_build_object('winner',case when win then 'PLAYER' else 'ENEMY' end,'rewards',jsonb_build_object('cash',999999),'reward_items',jsonb_build_array(jsonb_build_object('itemId','DIA','quantity',999)));
  result:=public.finalize_pvp_battle(rid,payload);
  expected_cash:=case when win then 200 else 50 end;
  IF (result->'rewards'->>'cash')::int<>expected_cash OR result->>'reward_delivery'<>'INVENTORY' THEN RAISE EXCEPTION 'cash receipt mismatch'; END IF;
  IF jsonb_array_length(result->'reward_items')<>(case when win then 2 else 1 end) THEN RAISE EXCEPTION 'unexpected reward count'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'reward_items') i WHERE i->>'itemId'='CASH' AND (i->>'quantity')::int=expected_cash) THEN RAISE EXCEPTION 'missing cash'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'reward_items') i WHERE i->>'itemId'='RAID_POINT_TICKET' AND (i->>'quantity')::int=1) IS DISTINCT FROM win THEN RAISE EXCEPTION 'ticket result mismatch'; END IF;
  IF (result->>'newRankPoints')::int<>greatest(rate0+(result->>'rankDelta')::int,0) THEN RAISE EXCEPTION 'rating mismatch'; END IF;
  again:=public.finalize_pvp_battle(rid,payload||jsonb_build_object('winner','ENEMY'));
  IF again IS DISTINCT FROM result THEN RAISE EXCEPTION 'retry changed receipt'; END IF;
  IF (SELECT pvp_points FROM users WHERE id=u)<>5-n THEN RAISE EXCEPTION 'finalize consumed BP'; END IF;
  IF (SELECT cash FROM users WHERE id=u)<>cash0+least(n,3)*200+(case when n=4 then 50 else 0 end) THEN RAISE EXCEPTION 'cash delta mismatch'; END IF;
  IF (SELECT coalesce(sum(quantity),0) FROM user_items WHERE user_id=u AND item_id='RAID_POINT_TICKET')<>tickets0+least(n,3) THEN RAISE EXCEPTION 'ticket delta mismatch'; END IF;
 END LOOP;
 IF (SELECT daily_wins FROM pvp_ranks WHERE user_id=u)<>daily0+3 OR (SELECT season_wins FROM pvp_ranks WHERE user_id=u)<>season0+3 THEN RAISE EXCEPTION 'ranking wins mismatch'; END IF;
 SELECT coalesce(jsonb_object_agg(item_id,quantity),'{}') INTO items1 FROM user_items WHERE user_id=u AND item_id<>'RAID_POINT_TICKET';
 IF items0<>items1 OR (SELECT count(*) FROM presents WHERE user_id=u)<>presents0 OR (SELECT count(*) FROM canonical_daily_activity_claims WHERE user_id=u AND source_key='PVP_DAILY_3')<>claims0 THEN RAISE EXCEPTION 'forbidden extra rewards'; END IF;
 -- Already finalized historical replay keeps its original receipt, without retroactive rewards.
 again:=public.finalize_pvp_battle(src.id,payload);
 IF again IS DISTINCT FROM src.finalization_result OR (SELECT cash FROM users WHERE id=u)<>cash0+650 THEN RAISE EXCEPTION 'historical retry changed'; END IF;
 -- Existing raid ticket recovery consumes one item and restores exactly one point.
 UPDATE users SET raid_points=0,raid_points_last_recovered_at=now() WHERE id=u;
 recovered:=public.use_action_resource_ticket('RAID_POINT_TICKET');
 IF (recovered->>'points')::int<>1 OR (SELECT raid_points FROM users WHERE id=u)<>1 OR (SELECT quantity FROM user_items WHERE user_id=u AND item_id='RAID_POINT_TICKET')<>tickets0+2 THEN RAISE EXCEPTION 'raid recovery mismatch'; END IF;
 -- Failed item write must roll back CASH, claim, rank and replay finalization together.
 started:=public.start_pvp_battle(opponent,ids,'BALANCED'); failed_id:=(started->>'replay_session_id')::uuid;
 SELECT rank_points INTO rate0 FROM pvp_ranks WHERE user_id=u;
 PERFORM set_config('pvp_test.fail','on',true);
 BEGIN
  PERFORM public.finalize_pvp_battle(failed_id,payload||jsonb_build_object('winner','PLAYER'));
  RAISE EXCEPTION 'expected failure missing';
 EXCEPTION WHEN SQLSTATE 'ZX009' THEN NULL; END;
 PERFORM set_config('pvp_test.fail','off',true);
 IF (SELECT cash FROM users WHERE id=u)<>cash0+650 OR (SELECT rank_points FROM pvp_ranks WHERE user_id=u)<>rate0 OR (SELECT finalization_status FROM battle_replay_sessions WHERE id=failed_id)<>'PENDING' OR EXISTS(SELECT 1 FROM canonical_daily_activity_claims WHERE source_ref=failed_id) THEN RAISE EXCEPTION 'atomic rollback failed'; END IF;
 IF has_function_privilege('authenticated','public.finalize_pvp_battle(uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.finalize_pvp_battle(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'client can finalize'; END IF;
END $test$;
SELECT 'PASS: WIN x3/LOSE, cash650/ticket3, start BP5->0, retry/historical receipt, injected reward override ignored, rating/daily/season wins, no materials/day3/Present, Raid point recovery, atomic failure, client ACL' result;
ROLLBACK;
