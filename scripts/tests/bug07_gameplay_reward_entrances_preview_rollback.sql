BEGIN;
SET LOCAL statement_timeout='60s';
CREATE FUNCTION pg_temp.bug07_assets(u uuid) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('CASH',(select cash from public.users where id=u),
  'DIA',(select neon_diamonds from public.users where id=u))
 ||coalesce((select jsonb_object_agg(item_id,quantity) from public.user_items where user_id=u),'{}'::jsonb)
 ||coalesce((select jsonb_object_agg(equipment_id,n) from(select equipment_id,count(*) n from public.user_equipments where user_id=u group by equipment_id)e),'{}'::jsonb)
$f$;
CREATE FUNCTION pg_temp.bug07_assert_assets(u uuid,b jsonb,expected jsonb) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE a jsonb:=pg_temp.bug07_assets(u); r record; k text; q bigint;
BEGIN
 FOR r IN SELECT coalesce(v->>'item_id',v->>'itemId',v->>'id') id,sum((v->>'quantity')::bigint) qty FROM jsonb_array_elements(expected) v GROUP BY 1 LOOP
  k:=public.resolve_canonical_reward_item(r.id); q:=coalesce((a->>k)::bigint,0)-coalesce((b->>k)::bigint,0);
  IF q<>r.qty THEN RAISE EXCEPTION 'Asset mismatch % expected %, actual %',k,r.qty,q; END IF;
 END LOOP;
END $f$;
CREATE TEMP TABLE bug07_results(name text,result text) ON COMMIT DROP;

DO $test$
DECLARE
 u uuid; b jsonb; r jsonb; r2 jsonb; before_present bigint; p public.user_patrols%rowtype; mid text; d date:=date '2099-01-17';n integer;sid uuid;
BEGIN
 SELECT id INTO STRICT u FROM users ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 SELECT count(*) INTO before_present FROM presents;
 -- Login: choose a real account whose current day has not already been direct-delivered.
 BEGIN
  DELETE FROM user_login_bonuses WHERE user_id=u;
  DELETE FROM gameplay_reward_delivery_ledger WHERE user_id=u AND source_kind='LOGIN_BONUS' AND source_key=(now() at time zone 'Asia/Tokyo')::date::text;
  b:=pg_temp.bug07_assets(u); r:=process_login_bonus();
  IF r->>'delivery'<>'DIRECT' OR NOT (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Login receipt mismatch'; END IF;
  PERFORM pg_temp.bug07_assert_assets(u,b,jsonb_build_array(r));
  b:=pg_temp.bug07_assets(u); r2:=process_login_bonus();
  IF NOT (r2->>'already_claimed')::boolean OR pg_temp.bug07_assets(u)<>b OR (SELECT count(*) FROM presents)<>before_present THEN RAISE EXCEPTION 'Login retry/present mismatch'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback login case';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 INSERT INTO bug07_results VALUES('Login Bonus','PASS direct assets/receipt/retry/Present unchanged');

 -- Quest: reuse saved completed patrol's authoritative course and hometown snapshot.
 BEGIN
  SELECT * INTO STRICT p FROM user_patrols WHERE status='COMPLETED' AND hometown_bonus_snapshot IS NOT NULL ORDER BY id LIMIT 1;
  u:=p.user_id;PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  p.id:=gen_random_uuid();p.status:='CLAIMABLE';p.rewards_accrued:=null;
  INSERT INTO user_patrols SELECT (p).*;
  b:=pg_temp.bug07_assets(u);r:=claim_patrol_rewards(p.id);
  PERFORM pg_temp.bug07_assert_assets(u,b,(r->'items')||jsonb_build_array(jsonb_build_object('item_id','CASH','quantity',(r->>'cash')::bigint)));
  b:=pg_temp.bug07_assets(u);
  BEGIN PERFORM claim_patrol_rewards(p.id); RAISE EXCEPTION 'Quest retry not rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF pg_temp.bug07_assets(u)<>b OR (SELECT count(*) FROM presents)<>before_present THEN RAISE EXCEPTION 'Quest retry/present mismatch'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='rollback quest case';
 EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL;
 END;
 INSERT INTO bug07_results VALUES('Quest','PASS official claim, returned asset quantities/retry/Present unchanged');

 -- Mission: use an enabled unlocked normal mission as a CLEAR claim fixture.
 BEGIN
  SELECT id INTO STRICT u FROM users ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  PERFORM sync_current_missions();
  SELECT m.id INTO STRICT mid FROM missions m JOIN user_missions um ON um.mission_id=m.id AND um.user_id=u
  WHERE m.category='NORMAL' AND m.prerequisite_mission_id IS NULL AND m.is_enabled LIMIT 1;
  UPDATE user_missions SET status='CLEAR',claimed_at=null WHERE user_id=u AND mission_id=mid;
  DELETE FROM mission_reward_delivery_items WHERE delivery_ledger_id IN(SELECT id FROM mission_reward_delivery_ledger WHERE user_id=u AND mission_id=mid);
  DELETE FROM mission_reward_delivery_ledger WHERE user_id=u AND mission_id=mid;
  SELECT count(*) INTO before_present FROM presents; b:=pg_temp.bug07_assets(u);
  r:=claim_mission_reward(mid);
  IF r->>'delivery'<>'DIRECT' THEN RAISE EXCEPTION 'Mission direct receipt missing'; END IF;
  PERFORM pg_temp.bug07_assert_assets(u,b,r->'rewards');
  b:=pg_temp.bug07_assets(u);
  BEGIN PERFORM claim_mission_reward(mid); RAISE EXCEPTION 'Mission retry not rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF pg_temp.bug07_assets(u)<>b OR (SELECT count(*) FROM presents)<>before_present THEN RAISE EXCEPTION 'Mission retry/present mismatch'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX003',MESSAGE='rollback mission case';
 EXCEPTION WHEN SQLSTATE 'ZX003' THEN NULL;
 END;
 INSERT INTO bug07_results VALUES('Mission','PASS official claim, bundle asset quantities/retry/Present unchanged');

 -- Ranking service-level grant uses actual master and award/item ledger.
 BEGIN
  SELECT count(*) INTO before_present FROM presents;b:=pg_temp.bug07_assets(u);
  n:=grant_canonical_daily_ranking_reward(d,'PVP',u,u,1,1000);
  IF n<>2 THEN RAISE EXCEPTION 'Daily ranking did not grant two canonical rewards'; END IF;
  SELECT jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity)) INTO r FROM canonical_daily_ranking_reward_master WHERE version='2026-09-03' AND is_production_enabled AND ranking_type='PVP' AND 1 BETWEEN rank_min AND rank_max;
  PERFORM pg_temp.bug07_assert_assets(u,b,r);
  b:=pg_temp.bug07_assets(u);n:=grant_canonical_daily_ranking_reward(d,'PVP',u,u,1,1000);
  IF n<>0 OR pg_temp.bug07_assets(u)<>b OR (SELECT count(*) FROM presents)<>before_present THEN RAISE EXCEPTION 'Daily ranking retry/present mismatch'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX004',MESSAGE='rollback ranking case';
 EXCEPTION WHEN SQLSTATE 'ZX004' THEN NULL;
 END;
 INSERT INTO bug07_results VALUES('Daily Ranking','PASS grant entrance, actual master assets/award ledger/retry/Present unchanged');
END $test$;
TABLE bug07_results;
ROLLBACK;
