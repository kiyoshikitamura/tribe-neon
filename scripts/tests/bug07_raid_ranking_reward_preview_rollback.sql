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
DECLARE u uuid;rid uuid;b jsonb;r jsonb;n integer;before_present bigint;sid uuid;v_kind text;v_table text;
BEGIN
 FOREACH v_kind IN ARRAY ARRAY['clear','rescue'] LOOP
  v_table:='raid_room_'||v_kind||'_rewards';
  EXECUTE format('select rw.room_id,rw.user_id from public.%I rw join public.raid_rooms room on room.id=rw.room_id join public.raid_bosses boss on boss.id=room.raid_boss_instance_id where boss.outcome=''DEFEAT_SUCCESS'' order by rw.room_id limit 1',v_table) INTO STRICT rid,u;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  SELECT count(*) INTO before_present FROM presents;
  -- Existing finalized eligibility fixture retained; remove only its test-time delivery receipts.
  EXECUTE format('delete from public.%I where room_id=$1 and user_id=$2','raid_room_'||v_kind||'_reward_grants') USING rid,u;
  EXECUTE format('delete from public.%I where room_id=$1 and user_id=$2',v_table) USING rid,u;
  b:=pg_temp.bug07_assets(u);
  EXECUTE format('select public._issue_raid_room_%s_rewards_v1($1)',v_kind) INTO n USING rid;
  IF n<1 THEN RAISE EXCEPTION 'Room % eligibility fixture did not grant',v_kind; END IF;
  EXECUTE format('select public.get_raid_room_%s_reward_v1($1)',v_kind) INTO r USING rid;
  IF jsonb_array_length(r->'items')<1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') i WHERE i->>'delivery'<>'DIRECT' OR i->>'presentId' IS NOT NULL OR i->>'expiresAt' IS NOT NULL) THEN RAISE EXCEPTION 'Room % direct receipt invalid: %',v_kind,r; END IF;
  PERFORM pg_temp.bug07_assert_assets(u,b,r->'items');
  b:=pg_temp.bug07_assets(u);
  EXECUTE format('select public._issue_raid_room_%s_rewards_v1($1)',v_kind) INTO n USING rid;
  IF n<>0 OR pg_temp.bug07_assets(u)<>b OR (SELECT count(*) FROM presents)<>before_present THEN RAISE EXCEPTION 'Room % retry/present mismatch',v_kind; END IF;
  INSERT INTO bug07_results VALUES('Raid '||v_kind,'PASS actual finalized eligibility/issuer/receipt/assets/retry/no Present');
 END LOOP;
 -- Season ranking invokes the service grant entrance against an existing season; no finalize/time transition.
 SELECT id INTO STRICT sid FROM ranking_seasons WHERE ranking_type='PVP' ORDER BY id LIMIT 1;
 DELETE FROM ranking_season_reward_grants WHERE season_id=sid AND recipient_user_id=u AND ranking_category='PVP';
 DELETE FROM gameplay_reward_delivery_ledger WHERE user_id=u AND source_kind='RANKING_SEASON' AND source_key LIKE sid::text||':PVP:%';
 SELECT count(*) INTO before_present FROM presents;b:=pg_temp.bug07_assets(u);
 n:=grant_canonical_ranking_season_reward(sid,'PVP',u,u,1);
 IF n<1 THEN RAISE EXCEPTION 'Season ranking grant missing'; END IF;
 SELECT jsonb_agg(jsonb_build_object('item_id',resolved_item_id,'quantity',quantity)) INTO r FROM ranking_season_reward_grants WHERE season_id=sid AND recipient_user_id=u AND ranking_category='PVP';
 PERFORM pg_temp.bug07_assert_assets(u,b,r);
 b:=pg_temp.bug07_assets(u);
 n:=grant_canonical_ranking_season_reward(sid,'PVP',u,u,1);
 IF n<>0 OR pg_temp.bug07_assets(u)<>b OR (SELECT count(*) FROM presents)<>before_present THEN RAISE EXCEPTION 'Season ranking retry/present mismatch'; END IF;
 INSERT INTO bug07_results VALUES('Season Ranking','PASS service grant entrance/actual master/ledger/assets/retry/no Present');
END $test$;
TABLE bug07_results;
ROLLBACK;
