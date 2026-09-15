-- M1 authority acceptance suite. Always rollback-only.
-- The local runner supplies an isolated dependency fixture.
begin;
do $test$
declare j uuid; f uuid; s uuid := '24900000-0000-4000-8000-000000000001';
  u uuid := '24900000-0000-4000-8000-000000000002';
  sid uuid := '24900000-0000-4000-8000-000000000003';
  before_subjects text;
begin
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by subject_id)::text,'')) into before_subjects from public.kpi_subjects x;
  j := public.begin_kpi_acquisition_journey_v1(repeat('a',64),'web_v1');
  if j is distinct from public.begin_kpi_acquisition_journey_v1(repeat('a',64),'web_v1') then
    raise exception 'journey retry failed'; end if;
  if (select md5(coalesce(jsonb_agg(to_jsonb(x) order by subject_id)::text,'')) from public.kpi_subjects x)
      is distinct from before_subjects then raise exception 'pre-start subject mutation'; end if;
  if exists(select 1 from public.kpi_acquisition_journeys where journey_token_hash=repeat('a',64)) then
    raise exception 'raw token persisted'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    perform public.begin_kpi_acquisition_journey_v1(repeat('a',64),'server_v1');
    raise exception 'conflicting journey accepted' using errcode='P0002';
  exception when unique_violation then null; end;
  -- Deliberately out of order: observations are retained, not synthesized.
  f := public.record_kpi_acquisition_observation_v1(repeat('a',64),'TAP_TO_START','tap','{}','web_v1');
  if f is distinct from public.record_kpi_acquisition_observation_v1(repeat('a',64),'TAP_TO_START','tap','{}','web_v1') then
    raise exception 'observation retry failed'; end if;
  perform public.record_kpi_acquisition_observation_v1(repeat('a',64),'TITLE_ARRIVED','title','{}','web_v1');
  begin
    perform public.record_kpi_acquisition_observation_v1(repeat('a',64),'NAME_COMPLETED','tap','{}','web_v1');
    raise exception 'conflicting observation accepted' using errcode='P0002';
  exception when unique_violation then null; end;
  begin
    perform public.record_kpi_acquisition_observation_v1(repeat('a',64),'TITLE_ARRIVED','pii','{"email":"forbidden"}','web_v1');
    raise exception 'PII metadata accepted' using errcode='P0002';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_kpi_acquisition_observation_v1(repeat('a',64),'BAD_EVENT','bad','{}','web_v1');
    raise exception 'invalid event accepted' using errcode='P0002';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',sid)::text,true);
  begin
    perform public.bind_kpi_acquisition_subject_v1(repeat('a',64),'web_v1');
    raise exception 'invalid subject/session accepted' using errcode='P0002';
  exception when insufficient_privilege then null; end;
  -- Fixture insertion is permitted only by the isolated local runner. No real
  -- Supabase auth users or persistent Preview users are created by this file.
  insert into public.kpi_subjects(subject_id,source_user_id,registered_at) values(s,u,'2026-09-06T00:00:00Z');
  insert into auth.sessions(id,user_id,not_after) values(sid,u,clock_timestamp()+interval '1 hour');
  if public.bind_kpi_acquisition_subject_v1(repeat('a',64),'web_v1') is distinct from s then
    raise exception 'binding failed'; end if;
  if public.bind_kpi_acquisition_subject_v1(repeat('a',64),'web_v1') is distinct from s then
    raise exception 'binding retry failed'; end if;
  if (select registered_at from public.kpi_subjects where subject_id=s) <> '2026-09-06T00:00:00Z'::timestamptz then
    raise exception 'Game Start changed'; end if;
  if exists(select 1 from public.kpi_tutorial_journey_facts) then raise exception 'tutorial fact inferred'; end if;
end $test$;

do $authority_test$
declare u uuid := '24900000-0000-4000-8000-000000000002';
  s uuid := '24900000-0000-4000-8000-000000000001';
  s2 uuid := '24900000-0000-4000-8000-000000000004';
  u2 uuid := '24900000-0000-4000-8000-000000000006';
  sid uuid := '24900000-0000-4000-8000-000000000003';
  c uuid; f uuid; g uuid := '24900000-0000-4000-8000-000000000005';
  m uuid; b uuid; r1 uuid; r2 uuid; before_registered timestamptz;
begin
  insert into public.users(id,username,favorite_character_id) values(u,'kpi249qa','leader-1');
  insert into public.user_characters(user_id,character_id) values(u,'leader-1');
  insert into public.tutorial_progress values(u,'COMPLETE',clock_timestamp());
  select registered_at into before_registered from public.kpi_subjects where subject_id=s;
  c := (public.issue_kpi_mypage_ready_context_v1('tutorial-v1','ready-1','mypage_handshake_v1')->>'context_id')::uuid;
  if (select guild_membership_status from public.kpi_tutorial_mypage_ready_contexts where context_id=c)<>'NOT_MEMBER' then
    raise exception 'NOT_MEMBER was not resolved'; end if;
  f := public.acknowledge_kpi_first_mypage_access_v1(c,'mypage-ack-1');
  if f is distinct from public.acknowledge_kpi_first_mypage_access_v1(c,'mypage-ack-1') then
    raise exception 'My Page retry failed'; end if;
  if (select count(*) from public.kpi_tutorial_journey_facts where subject_id=s and fact_type='FIRST_MYPAGE_ACCESS_CONFIRMED')<>1 then
    raise exception 'canonical first My Page uniqueness failed'; end if;
  if exists(select 1 from public.kpi_tutorial_completion_facts where subject_id=s) then
    raise exception 'canonical fact changed legacy fact'; end if;
  update public.tutorial_progress set step_id='WORLD_INTRO' where user_id=u;
  begin
    perform public.issue_kpi_mypage_ready_context_v1('tutorial-v1','not-ready','mypage_handshake_v1');
    raise exception 'unfinished tutorial accepted' using errcode='P0002';
  exception when check_violation then null; end;
  update public.tutorial_progress set step_id='COMPLETE' where user_id=u;
  if (select registered_at from public.kpi_subjects where subject_id=s) is distinct from before_registered then
    raise exception 'registered_at changed'; end if;
  insert into public.kpi_subjects(subject_id,registered_at) values(s2,'2026-09-06T01:00:00Z');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  f := public.record_kpi_subject_identity_transition_v1(s,s,'AUTH_LINK_SAME_SUBJECT',gen_random_uuid(),'identity-1','{}','qa_v1');
  if f is null then raise exception 'identity fact failed'; end if;
  perform public.record_kpi_subject_identity_transition_v1(s,s2,'ACCOUNT_SWITCH_TO_EXISTING',gen_random_uuid(),'identity-2','{}','qa_v1');
  if (select registered_at from public.kpi_subjects where subject_id=s) is distinct from before_registered then
    raise exception 'identity writer mutated subject'; end if;
  -- Trigger integration: CREATE and first-message activation are durable.
  insert into public.guilds(id,name,leader_id) values(g,'qa-guild',u);
  insert into public.guild_members(id,guild_id,user_id,role) values(gen_random_uuid(),g,u,'MASTER') returning id into m;
  if not exists(select 1 from public.kpi_guild_conversion_facts where guild_id=g and conversion_type='CREATE') then
    raise exception 'CREATE conversion missing'; end if;
  insert into public.board_posts(content,title,author_name,user_id,target_type,target_id) values('not copied','','qa',u,'GUILD',g) returning id into m;
  insert into public.board_posts(content,title,author_name,user_id,target_type,target_id) values('not copied 2','','qa',u,'GUILD',g);
  if (select count(*) from public.kpi_guild_chat_message_facts where guild_id=g)<>2
    or (select count(*) from public.kpi_guild_chat_activation_facts where guild_id=g)<>1 then
    raise exception 'chat durability/activation failed'; end if;
  delete from public.board_posts where id=m;
  if not exists(select 1 from public.kpi_guild_chat_message_facts where source_message_id=m) then
    raise exception 'message deletion erased KPI fact'; end if;
  insert into public.users(id,username) values(u2,'kpi249join');
  insert into public.kpi_subjects(subject_id,source_user_id,registered_at) values(gen_random_uuid(),u2,clock_timestamp());
  insert into public.guild_members(guild_id,user_id,role) values(g,u2,'MEMBER');
  if not exists(select 1 from public.kpi_guild_conversion_facts c join public.kpi_subjects s on s.subject_id=c.subject_id
    where s.source_user_id=u2 and c.conversion_type='JOIN') then raise exception 'JOIN conversion missing'; end if;
  begin
    insert into public.board_posts(content,title,author_name,user_id,target_type,target_id)
      values('not copied outside','','qa',u2,'GUILD',gen_random_uuid());
    raise exception 'outside membership chat accepted' using errcode='P0002';
  exception when raise_exception then
    if sqlerrm <> 'Guild chat membership period missing' then raise; end if;
  end;
  -- Marketing: retry, correction, latest, zero denominator and mixed-grain guard.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  b := public.create_kpi_marketing_import_batch_v1('x_ads_manager_manual',u,null,'batch-1','{}');
  if b is distinct from public.create_kpi_marketing_import_batch_v1('x_ads_manager_manual',u,null,'batch-1','{}') then
    raise exception 'batch retry failed'; end if;
  r1 := public.record_kpi_marketing_daily_revision_v1(b,'2199-01-01','acct','camp','Campaign',null,null,null,null,
    'CAMPAIGN',1000,'JPY',10000,100,'series-1',1,'row-1','{}');
  if r1 is distinct from public.record_kpi_marketing_daily_revision_v1(b,'2199-01-01','acct','camp','Campaign',null,null,null,null,
    'CAMPAIGN',1000,'JPY',10000,100,'series-1',1,'row-1','{}') then raise exception 'row retry failed'; end if;
  r2 := public.record_kpi_marketing_daily_revision_v1(b,'2199-01-01','acct','camp','Campaign',null,null,null,null,
    'CAMPAIGN',800,'JPY',0,0,'series-1',2,'row-2','{}');
  if (select count(*) from public.kpi_marketing_latest_revisions_v1 where external_key='series-1' and revision=2
       and ctr is null and cpc is null and cpm is null and ctr_null_reason='zero_denominator'
       and cpc_null_reason='zero_denominator' and cpm_null_reason='zero_denominator')<>1 then
    raise exception 'latest/zero denominator metrics failed'; end if;
  begin
    perform public.record_kpi_marketing_daily_revision_v1(b,'2199-01-01','acct','camp','Campaign','line','Line',null,null,
      'LINE_ITEM',1,'JPY',1,1,'series-2',1,'row-mixed','{}');
    raise exception 'mixed grain accepted' using errcode='P0002';
  exception when unique_violation then null; end;
end $authority_test$;

do $security_test$
declare n text;
begin
  foreach n in array array[
    'kpi_acquisition_journeys','kpi_acquisition_journey_facts','kpi_acquisition_subject_bindings',
    'kpi_tutorial_journey_facts','kpi_tutorial_mypage_ready_contexts','kpi_subject_identity_transition_facts','kpi_guild_conversion_facts',
    'kpi_guild_chat_message_facts','kpi_guild_chat_activation_facts','kpi_marketing_import_batches',
    'kpi_marketing_reporting_scopes','kpi_marketing_daily_fact_revisions'
  ] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||n)::regclass) then raise exception 'RLS disabled %',n; end if;
    if has_table_privilege('anon','public.'||n,'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated','public.'||n,'INSERT,UPDATE,DELETE')
      or has_table_privilege('service_role','public.'||n,'INSERT,UPDATE,DELETE') then
      raise exception 'direct DML leaked %',n; end if;
  end loop;
  if has_function_privilege('anon','public.bind_kpi_acquisition_subject_v1(text,text)','EXECUTE') then
    raise exception 'anonymous binding permission leaked'; end if;
end $security_test$;

select 'PASS: M1 authority migration rollback suite' as result;
rollback;
