-- Preview-only M2 acceptance. All synthetic mutations are transaction-scoped.
begin;

do $m2$
declare
  s uuid; u uuid; sid uuid; journey uuid; context uuid; guild uuid := gen_random_uuid();
  token text := encode(digest(gen_random_uuid()::text,'sha256'),'hex');
  bad_token text := encode(digest(gen_random_uuid()::text,'sha256'),'hex');
  first_post uuid; batch uuid;
  started timestamptz := clock_timestamp();
begin
  select ks.subject_id,ks.source_user_id,x.id into s,u,sid
  from public.kpi_subjects ks join auth.sessions x on x.user_id=ks.source_user_id
  where public.kpi_is_subject_excluded(ks.subject_id,clock_timestamp())
    and (x.not_after is null or x.not_after>clock_timestamp())
    and exists(select 1 from public.users p where p.id=ks.source_user_id
      and nullif(btrim(p.username),'') is not null and p.favorite_character_id is not null)
    and exists(select 1 from public.user_characters ch where ch.user_id=ks.source_user_id
      and ch.character_id=(select favorite_character_id from public.users where id=ks.source_user_id))
    and exists(select 1 from public.tutorial_progress tp where tp.user_id=ks.source_user_id
      and tp.step_id in ('COMPLETE','AUTHENTICATION') and tp.completed_at is not null)
  order by x.created_at desc nulls last limit 1;
  if s is null then raise exception 'M2 requires one excluded Preview QA subject'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',sid)::text,true);

  journey := public.begin_kpi_acquisition_journey_v1(token,'web_v1');
  perform public.record_kpi_acquisition_observation_v1(token,'TITLE_ARRIVED','title_arrived','{}','web_v1');
  perform public.record_kpi_acquisition_observation_v1(token,'TITLE_ARRIVED','title_arrived','{}','web_v1');
  perform public.record_kpi_acquisition_observation_v1(token,'TAP_TO_START','tap_to_start','{}','web_v1');
  perform public.record_kpi_acquisition_observation_v1(token,'WORLD_INTRO_STARTED','world_intro_started','{}','web_v1');
  perform public.record_kpi_acquisition_observation_v1(token,'WORLD_INTRO_COMPLETED','world_intro_completed','{}','web_v1');
  perform public.record_kpi_acquisition_observation_v1(token,'NAME_COMPLETED','name_completed','{}','web_v1');
  if public.bind_kpi_acquisition_subject_v1(token,'web_v1') is distinct from s then raise exception 'M2 binding failed'; end if;
  if (select count(*) from public.kpi_acquisition_journey_facts where journey_id=journey)<>5 then raise exception 'M2 acquisition dedupe/chain failed'; end if;
  begin
    perform public.record_kpi_acquisition_observation_v1(bad_token,'TITLE_ARRIVED','bad-token','{}','web_v1');
    raise exception 'Unknown journey token accepted' using errcode='P0002';
  exception when insufficient_privilege then null; end;

  context := (public.issue_kpi_mypage_ready_context_v1('canonical-v1','m2-ready','mypage_handshake_v1')->>'context_id')::uuid;
  perform public.acknowledge_kpi_first_mypage_access_v1(context,'m2-ack');
  if (select count(*) from public.kpi_tutorial_journey_facts where subject_id=s and fact_type='FIRST_MYPAGE_ACCESS_CONFIRMED')<>1 then
    raise exception 'M2 canonical Tutorial Complete failed'; end if;
  -- Profile/leader/guild failure-path mutations are covered in the isolated DB
  -- suite. Preview profile guards intentionally prevent corrupting even a
  -- rollback-only live profile to manufacture these failures.

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.guilds(id,name,leader_id) values(guild,'m2'||substr(guild::text,1,6),u);
  update public.users set level=greatest(level,3) where id=u;
  insert into public.guild_members(id,guild_id,user_id,role) values(gen_random_uuid(),guild,u,'MEMBER');
  insert into public.board_posts(content,title,author_name,user_id,target_type,target_id)
    values('rollback-only M2 synthetic','','qa',u,'GUILD',guild) returning id into first_post;
  insert into public.board_posts(content,title,author_name,user_id,target_type,target_id)
    values('rollback-only M2 synthetic second','','qa',u,'GUILD',guild);
  if (select count(*) from public.kpi_guild_conversion_facts where guild_id=guild and conversion_type='JOIN')<>1
     or (select count(*) from public.kpi_guild_chat_message_facts where guild_id=guild)<>2
     or (select count(*) from public.kpi_guild_chat_activation_facts where guild_id=guild)<>1 then
    raise exception 'M2 Guild trigger chain failed'; end if;
  delete from public.board_posts where id=first_post;
  if not exists(select 1 from public.kpi_guild_chat_message_facts where source_message_id=first_post) then
    raise exception 'M2 durable chat fact was deleted'; end if;

  batch := public.create_kpi_marketing_import_batch_v1('x_ads_manager_manual',u,null,'m2-batch','{"qa":true}');
  perform public.record_kpi_marketing_daily_revision_v1(batch,'2199-02-01','m2-account','m2-campaign','M2',null,null,null,null,
    'CAMPAIGN',2850,'JPY',50000,100,'m2-series',1,'m2-row-1','{"qa":true}');
  perform public.record_kpi_marketing_daily_revision_v1(batch,'2199-02-01','m2-account','m2-campaign','M2',null,null,null,null,
    'CAMPAIGN',2000,'JPY',50000,100,'m2-series',2,'m2-row-2','{"qa":true}');
  if exists(select 1 from public.kpi_marketing_latest_revisions_v1 where external_key='m2-series') then
    raise exception 'M2 QA Marketing leaked into canonical view'; end if;
  if extract(epoch from clock_timestamp()-started)*1000 > 5000 then raise exception 'M2 DB chain exceeded 5 seconds'; end if;
end $m2$;

rollback;

select 'PASS: M2 Preview full chain/failure/durability/QA exclusion rollback' result,
  (select count(*) from public.kpi_subjects) subjects,
  (select count(*) from public.kpi_daily_user_activity) daily_activity,
  (select count(*) from public.kpi_aggregation_runs) aggregation_runs,
  (select count(*) from public.kpi_metric_snapshots) snapshots,
  (select count(*) from public.kpi_acquisition_journeys) acquisition_journeys,
  (select count(*) from public.kpi_tutorial_journey_facts) canonical_tutorial_facts,
  (select count(*) from public.kpi_marketing_daily_fact_revisions) marketing_revisions;
