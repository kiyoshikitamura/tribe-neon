-- Preview only. All fixtures, real grant paths, ledger and asset effects ROLLBACK.
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE FUNCTION pg_temp.mission_deadline_test_failure() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.mission_id='QA_DEADLINE_ATOMIC2' THEN
    RAISE EXCEPTION 'QA atomic rollback sentinel' USING ERRCODE='P0002';
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER qa_mission_deadline_failure BEFORE INSERT ON public.mission_reward_delivery_ledger
FOR EACH ROW EXECUTE FUNCTION pg_temp.mission_deadline_test_failure();
DO $test$
DECLARE
  v_uid uuid;
  v_template jsonb;
  v_id text;
  v_event text;
  v_result jsonb;
  v_events jsonb;
  v_before jsonb;
  v_after jsonb;
  v_ledger bigint;
BEGIN
  select id into v_uid from public.users order by id limit 1;
  if v_uid is null then raise exception 'Preview fixture requires existing user'; end if;
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  select to_jsonb(m) into v_template from public.missions m
    where m.is_enabled and m.category='SPECIAL' and m.event_id is not null order by id limit 1;
  if v_template is null then raise exception 'Preview fixture requires special mission template'; end if;

  foreach v_id in array array['BEFORE','EXPIRED','NULL','BULK','ATOMIC1','ATOMIC2'] loop
    v_event := 'QA_DEADLINE_'||v_id;
    insert into public.mission_events(id,display_name,start_at,progress_end_at,claim_deadline,is_enabled)
    values(v_event,'QA rollback only',clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days',
      case v_id when 'EXPIRED' then clock_timestamp()-interval '1 second'
        when 'NULL' then null else clock_timestamp()+interval '1 day' end,true);
    insert into public.missions select (jsonb_populate_record(null::public.missions,
      v_template || jsonb_build_object('id',v_event,'event_id',v_event,'prerequisite_mission_id',null,
        'next_mission_id',null,'cash_reward',17,'display_order',case v_id when 'ATOMIC1' then 1 when 'ATOMIC2' then 2 else 3 end))).*;
    insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
    values(v_uid,v_event,1,1,'CLEAR');
  end loop;
  perform public.sync_current_missions();
  select to_jsonb(u) into v_before from public.users u where id=v_uid;
  select count(*) into v_ledger from public.mission_reward_delivery_ledger where user_id=v_uid;
  begin
    perform public.claim_mission_reward('QA_DEADLINE_EXPIRED');
    raise exception 'Expired individual claim unexpectedly succeeded';
  exception when check_violation then null;
  end;
  select to_jsonb(u) into v_after from public.users u where id=v_uid;
  if v_before is distinct from v_after then raise exception 'Expired claim changed user assets'; end if;
  if (select count(*) from public.mission_reward_delivery_ledger where user_id=v_uid) <> v_ledger then
    raise exception 'Expired claim wrote delivery ledger'; end if;

  begin
    perform public.claim_all_mission_rewards(array['QA_DEADLINE_ATOMIC1','QA_DEADLINE_ATOMIC2']);
    raise exception 'Injected second grant failure did not occur';
  exception when no_data_found then null;
  end;
  if exists(select 1 from public.mission_reward_delivery_ledger where mission_id in ('QA_DEADLINE_ATOMIC1','QA_DEADLINE_ATOMIC2')) then
    raise exception 'Bulk failure left a partial ledger'; end if;
  if exists(select 1 from public.user_missions where user_id=v_uid and mission_id in ('QA_DEADLINE_ATOMIC1','QA_DEADLINE_ATOMIC2') and status<>'CLEAR') then
    raise exception 'Bulk failure left partially claimed state'; end if;
  select to_jsonb(u) into v_after from public.users u where id=v_uid;
  if v_before is distinct from v_after then raise exception 'Bulk failure left partial currency grant'; end if;

  v_result:=public.claim_mission_reward('QA_DEADLINE_BEFORE');
  if v_result->>'claimed' <> 'true' then raise exception 'Before deadline failed'; end if;
  begin
    perform public.claim_mission_reward('QA_DEADLINE_BEFORE');
    raise exception 'Duplicate individual claim unexpectedly succeeded';
  exception when check_violation then null;
  end;
  v_result:=public.claim_mission_reward('QA_DEADLINE_NULL');
  if v_result->>'claimed' <> 'true' then raise exception 'NULL deadline rejected'; end if;

  -- Mixed bulk: expired skipped, valid granted once, duplicate input not duplicated.
  v_result:=public.claim_all_mission_rewards(array['QA_DEADLINE_EXPIRED','QA_DEADLINE_BULK','QA_DEADLINE_BULK','QA_DEADLINE_BEFORE']);
  if (v_result->>'claimed_count')::int <> 1 then raise exception 'Mixed bulk claim count wrong: %',v_result; end if;
  v_result:=public.claim_all_mission_rewards(array['QA_DEADLINE_EXPIRED','QA_DEADLINE_BULK']);
  if (v_result->>'claimed_count')::int <> 0 then raise exception 'Bulk retry duplicated grant'; end if;
  if exists(select 1 from public.mission_reward_delivery_ledger where mission_id='QA_DEADLINE_EXPIRED') then
    raise exception 'Bulk granted expired mission'; end if;
  if (select count(*) from public.mission_reward_delivery_ledger where user_id=v_uid and mission_id like 'QA_DEADLINE_%' and delivery_status='DELIVERED')<>3 then
    raise exception 'Ledger cardinality/status incorrect'; end if;
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='QA_DEADLINE_EXPIRED' and status='CLEAR') then
    raise exception 'Expired achievement state changed'; end if;

  v_events:=public.get_active_mission_events();
  if (select count(*) from jsonb_array_elements(v_events) e where e->>'event_id' in ('QA_DEADLINE_BEFORE','QA_DEADLINE_NULL','QA_DEADLINE_BULK'))<>3 then
    raise exception 'Ended CLAIMED event history missing'; end if;
  if exists(select 1 from jsonb_array_elements(v_events) e where e->>'event_id' in ('QA_DEADLINE_BEFORE','QA_DEADLINE_NULL','QA_DEADLINE_BULK','QA_DEADLINE_EXPIRED') and (e->>'has_claimable_rewards')::boolean) then
    raise exception 'Expired or claimed event still advertises claimable'; end if;
END;
$test$;
SELECT 'PASS: individual deadline, NULL, mixed bulk, retry, ledger, event history; transaction rolls back' AS result;
ROLLBACK;
