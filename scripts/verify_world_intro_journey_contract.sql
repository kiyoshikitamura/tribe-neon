-- migration 251の仮適用後、同一transaction内で実行し、必ずROLLBACKする。
create temp table intro_contract_checks (test text, passed boolean);
create function pg_temp.intro_check(p_test text,p_passed boolean) returns void language plpgsql as $$
begin
  if p_passed is distinct from true then raise exception 'FAIL: %',p_test; end if;
  insert into intro_contract_checks values(p_test,p_passed);
end $$;

do $test$
declare
  v_token text:=encode(gen_random_bytes(32),'hex');
  v_journey uuid; v_fact uuid; v_retry uuid;
  v_user uuid:=gen_random_uuid(); v_session uuid:=gen_random_uuid(); v_subject uuid;
  v_before bigint; v_rejected boolean;
begin
  select count(*) into v_before from public.users;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  v_journey:=public.begin_kpi_acquisition_journey_v1(v_token,'web_v1');
  perform public.record_kpi_acquisition_observation_v1(v_token,'TITLE_ARRIVED','title_arrived:v1','{}','web_v1');
  perform public.record_kpi_acquisition_observation_v1(v_token,'TAP_TO_START','tap_to_start:v1','{}','web_v1');
  v_fact:=public.record_kpi_acquisition_observation_v1(v_token,'WORLD_INTRO_VIEWED','world_intro_viewed:v1','{}','web_v1');
  v_retry:=public.record_kpi_acquisition_observation_v1(v_token,'WORLD_INTRO_VIEWED','world_intro_viewed:v1','{}','web_v1');
  perform pg_temp.intro_check('A: pre-registration viewed; no profile created',(select count(*)=v_before from public.users));
  perform pg_temp.intro_check('viewed retry returns identical fact',v_fact=v_retry);
  perform pg_temp.intro_check('C: abandon retains viewed without binding',
    exists(select 1 from public.kpi_acquisition_journey_facts where journey_id=v_journey and event_type='WORLD_INTRO_VIEWED')
    and not exists(select 1 from public.kpi_acquisition_subject_bindings where journey_id=v_journey));
  v_fact:=public.record_kpi_acquisition_observation_v1(v_token,'WORLD_INTRO_SKIPPED','world_intro_skipped:v1','{}','web_v1');
  v_retry:=public.record_kpi_acquisition_observation_v1(v_token,'WORLD_INTRO_SKIPPED','world_intro_skipped:v1','{}','web_v1');
  perform pg_temp.intro_check('B: skip retry exactly one fact',v_fact=v_retry and
    (select count(*)=1 from public.kpi_acquisition_journey_facts where journey_id=v_journey and event_type='WORLD_INTRO_SKIPPED'));
  v_rejected:=false;
  begin
    perform public.record_kpi_acquisition_observation_v1(v_token,'WORLD_INTRO_SKIPPED','world_intro_viewed:v1','{}','web_v1');
  exception when unique_violation then v_rejected:=true; end;
  perform pg_temp.intro_check('conflicting idempotency still rejected',v_rejected);
  v_rejected:=false;
  begin
    perform public.record_kpi_acquisition_observation_v1(v_token,'UNSUPPORTED','invalid:v1','{}','web_v1');
  exception when invalid_parameter_value then v_rejected:=true; end;
  perform pg_temp.intro_check('unknown event still rejected',v_rejected);
  v_rejected:=false;
  begin
    perform public.record_kpi_acquisition_observation_v1(v_token,'WORLD_INTRO_VIEWED','metadata:v1','{"skipped":true}','web_v1');
  exception when invalid_parameter_value then v_rejected:=true; end;
  perform pg_temp.intro_check('metadata allowlist unchanged',v_rejected);

  -- Preview transaction内だけで匿名認証fixtureを作り、正規の名前登録RPCを通す。
  insert into auth.users(id,instance_id,aud,role,is_anonymous,created_at,updated_at)
    values(v_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',true,now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at,aal)
    values(v_session,v_user,now(),now(),'aal1');
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','session_id',v_session,'is_anonymous',true)::text,true);
  perform public.initialize_current_player('Q'||left(replace(v_user::text,'-',''),7),null);
  v_subject:=public.bind_kpi_acquisition_subject_v1(v_token,'web_v1');
  perform pg_temp.intro_check('D: canonical registration → subject → binding',exists(
    select 1 from public.kpi_acquisition_subject_bindings b join public.kpi_subjects s using(subject_id)
    join public.kpi_acquisition_journey_facts f using(journey_id)
    where b.journey_id=v_journey and s.source_user_id=v_user and f.event_type='WORLD_INTRO_SKIPPED'));
  perform pg_temp.intro_check('binding retry unchanged',v_subject=public.bind_kpi_acquisition_subject_v1(v_token,'web_v1'));
  perform pg_temp.intro_check('tutorial remains WORLD_INTRO',exists(select 1 from public.tutorial_progress where user_id=v_user and step_id='WORLD_INTRO'));
  perform pg_temp.intro_check('no tutorial milestone auto-granted',not exists(select 1 from public.user_funnel_milestones where user_id=v_user));
  perform public.record_client_funnel_event('home_primary_cta_impression','home','contract-test',null,'{}');
  perform pg_temp.intro_check('existing client writer still works',exists(select 1 from public.client_funnel_events where user_id=v_user and event_name='home_primary_cta_impression'));
  perform pg_temp.intro_check('anon RPC execute retained',has_function_privilege('anon','public.record_kpi_acquisition_observation_v1(text,text,text,jsonb,text)','EXECUTE'));
  perform pg_temp.intro_check('authenticated RPC execute retained',has_function_privilege('authenticated','public.record_kpi_acquisition_observation_v1(text,text,text,jsonb,text)','EXECUTE'));
  perform pg_temp.intro_check('direct table insert denied',not has_table_privilege('anon','public.kpi_acquisition_journey_facts','INSERT') and not has_table_privilege('authenticated','public.kpi_acquisition_journey_facts','INSERT'));
end $test$;
select * from intro_contract_checks;
