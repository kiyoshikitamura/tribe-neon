-- Preview-only synthetic acceptance/smoke. Every mutation is rolled back.
begin;

do $preview_test$
declare
  s uuid; u uuid; sid uuid; j uuid; f uuid; c uuid; g uuid := gen_random_uuid();
  first_post uuid; batch_id uuid; token text := encode(digest(gen_random_uuid()::text,'sha256'),'hex');
  before_registered timestamptz; before_subjects bigint; before_activity bigint;
begin
  select ks.subject_id,ks.source_user_id,x.id
    into s,u,sid
  from public.kpi_subjects ks
  join auth.sessions x on x.user_id=ks.source_user_id
  where public.kpi_is_subject_excluded(ks.subject_id,clock_timestamp())
    and (x.not_after is null or x.not_after>clock_timestamp())
    and exists(select 1 from public.users p where p.id=ks.source_user_id
      and nullif(btrim(p.username),'') is not null and p.favorite_character_id is not null)
    and exists(select 1 from public.user_characters ch where ch.user_id=ks.source_user_id
      and ch.character_id=(select favorite_character_id from public.users where id=ks.source_user_id))
    and exists(select 1 from public.tutorial_progress tp where tp.user_id=ks.source_user_id
      and tp.step_id in ('COMPLETE','AUTHENTICATION') and tp.completed_at is not null)
  order by x.created_at desc nulls last
  limit 1;
  if s is null then raise exception 'No excluded Preview QA subject satisfies ready contract'; end if;

  select registered_at into before_registered from public.kpi_subjects where subject_id=s;
  select count(*) into before_subjects from public.kpi_subjects;
  select count(*) into before_activity from public.kpi_daily_user_activity;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',sid)::text,true);

  -- Acquisition: no pre-start subject, retries, conflict rejection, binding.
  j := public.begin_kpi_acquisition_journey_v1(token,'web_v1');
  if j is distinct from public.begin_kpi_acquisition_journey_v1(token,'web_v1') then raise exception 'journey retry failed'; end if;
  perform public.record_kpi_acquisition_observation_v1(token,'TITLE_ARRIVED','title','{}','web_v1');
  f := public.record_kpi_acquisition_observation_v1(token,'TAP_TO_START','tap','{}','web_v1');
  if f is distinct from public.record_kpi_acquisition_observation_v1(token,'TAP_TO_START','tap','{}','web_v1') then raise exception 'observation retry failed'; end if;
  perform public.record_kpi_acquisition_observation_v1(token,'NAME_COMPLETED','name','{}','web_v1');
  begin
    perform public.record_kpi_acquisition_observation_v1(token,'WORLD_INTRO_COMPLETED','tap','{}','web_v1');
    raise exception 'conflicting idempotency accepted' using errcode='P0002';
  exception when unique_violation then null; end;
  if public.bind_kpi_acquisition_subject_v1(token,'web_v1') is distinct from s then raise exception 'binding failed'; end if;

  -- Canonical My Page four-readiness contract plus client acknowledgement.
  c := (public.issue_kpi_mypage_ready_context_v1('tutorial-v1','preview-ready','mypage_handshake_v1')->>'context_id')::uuid;
  if not exists(select 1 from public.kpi_tutorial_mypage_ready_contexts where context_id=c
    and profile_ready and onboarding_ready and identity_leader_ready and guild_membership_resolved
    and guild_membership_status in ('MEMBER','NOT_MEMBER')) then raise exception 'ready contract failed'; end if;
  f := public.acknowledge_kpi_first_mypage_access_v1(c,'preview-ack');
  if f is distinct from public.acknowledge_kpi_first_mypage_access_v1(c,'preview-ack') then raise exception 'ack retry failed'; end if;
  if (select count(*) from public.kpi_tutorial_journey_facts where subject_id=s and fact_type='FIRST_MYPAGE_ACCESS_CONFIRMED')<>1 then
    raise exception 'canonical first My Page uniqueness failed'; end if;

  -- Identity transition remains evidence-only.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.record_kpi_subject_identity_transition_v1(s,s,'AUTH_LINK_SAME_SUBJECT',gen_random_uuid(),'preview-identity','{}','qa_v1');
  if (select registered_at from public.kpi_subjects where subject_id=s) is distinct from before_registered then raise exception 'registered_at changed'; end if;

  -- Guild JOIN, two messages, one activation, and durable source deletion.
  insert into public.guilds(id,name,leader_id) values(g,'q249'||substr(g::text,1,6),u);
  update public.users set level=greatest(level,3) where id=u; -- rollback-only fixture prerequisite
  insert into public.guild_members(id,guild_id,user_id,role) values(gen_random_uuid(),g,u,'MEMBER');
  if not exists(select 1 from public.kpi_guild_conversion_facts where subject_id=s and guild_id=g and conversion_type='JOIN') then
    raise exception 'JOIN conversion missing'; end if;
  insert into public.board_posts(content,title,author_name,user_id,target_type,target_id)
    values('rollback-only synthetic','','qa',u,'GUILD',g) returning id into first_post;
  insert into public.board_posts(content,title,author_name,user_id,target_type,target_id)
    values('rollback-only synthetic 2','','qa',u,'GUILD',g);
  if (select count(*) from public.kpi_guild_chat_message_facts where guild_id=g)<>2
     or (select count(*) from public.kpi_guild_chat_activation_facts where guild_id=g)<>1 then
    raise exception 'chat durability or activation failed'; end if;
  delete from public.board_posts where id=first_post;
  if not exists(select 1 from public.kpi_guild_chat_message_facts where source_message_id=first_post) then
    raise exception 'source deletion erased durable KPI fact'; end if;

  -- Marketing revisions, derived metrics, zero denominator and grain guard.
  -- This transaction rolls back, so use the canonical (non-QA-filtered) view path.
  batch_id := public.create_kpi_marketing_import_batch_v1('x_ads_manager_manual',u,null,'preview-batch','{}');
  perform public.record_kpi_marketing_daily_revision_v1(batch_id,'2199-01-01','preview-account','campaign','Campaign',null,null,null,null,
    'CAMPAIGN',1000,'JPY',10000,100,'preview-series',1,'preview-row-1','{}');
  perform public.record_kpi_marketing_daily_revision_v1(batch_id,'2199-01-01','preview-account','campaign','Campaign',null,null,null,null,
    'CAMPAIGN',800,'JPY',0,0,'preview-series',2,'preview-row-2','{}');
  if not exists(select 1 from public.kpi_marketing_latest_revisions_v1 where external_key='preview-series' and revision=2
    and ctr is null and cpc is null and cpm is null and ctr_null_reason='zero_denominator'
    and cpc_null_reason='zero_denominator' and cpm_null_reason='zero_denominator') then raise exception 'marketing latest/zero denominator failed'; end if;
  begin
    perform public.record_kpi_marketing_daily_revision_v1(batch_id,'2199-01-01','preview-account','campaign','Campaign','line','Line',null,null,
      'LINE_ITEM',1,'JPY',1,1,'preview-mixed',1,'preview-mixed','{}');
    raise exception 'mixed grain accepted' using errcode='P0002';
  exception when unique_violation then null; end;

  if (select count(*) from public.kpi_subjects)<>before_subjects
     or (select count(*) from public.kpi_daily_user_activity)<>before_activity then
    raise exception 'existing KPI authority mutated'; end if;
end $preview_test$;

do $security_test$
declare n text;
begin
  foreach n in array array[
    'kpi_acquisition_journeys','kpi_acquisition_journey_facts','kpi_acquisition_subject_bindings',
    'kpi_tutorial_journey_facts','kpi_tutorial_mypage_ready_contexts','kpi_subject_identity_transition_facts',
    'kpi_guild_conversion_facts','kpi_guild_chat_message_facts','kpi_guild_chat_activation_facts',
    'kpi_marketing_import_batches','kpi_marketing_reporting_scopes','kpi_marketing_daily_fact_revisions'
  ] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||n)::regclass) then raise exception 'RLS disabled %',n; end if;
    if has_table_privilege('anon','public.'||n,'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated','public.'||n,'INSERT,UPDATE,DELETE')
      or has_table_privilege('service_role','public.'||n,'INSERT,UPDATE,DELETE') then raise exception 'direct DML leaked %',n; end if;
  end loop;
end $security_test$;

select 'PASS: Preview rollback DB tests and synthetic fact-chain smoke' as result;
rollback;
