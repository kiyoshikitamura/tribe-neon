-- Previewのみ。既存ユーザーを一時fixtureに使用し、全てROLLBACKする。
begin;
set local statement_timeout='20s';

-- 適用済みbackfillを再実行しても追加は発生しない。
do $$
declare n integer;
begin
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  select p.user_id,'character_setup_dialog_eligible','{"source":"rollback_test"}'::jsonb
  from public.tutorial_progress p
  where p.step_id in ('COMPLETE','AUTHENTICATION')
    and not exists(select 1 from public.user_funnel_milestones m where m.user_id=p.user_id
      and m.milestone in ('character_setup_dialog_eligible','character_setup_dialog_consumed','first_main_loadout','activation_mission_handoff'))
  on conflict(user_id,milestone) do nothing;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'backfill is not already complete: %',n; end if;
end $$;

-- 業務用Tutorial/Quest行を変更せず、実関数を一時テーブルのTriggerから呼ぶ。
create temporary table guide_tutorial_fixture(user_id uuid,step_id text);
create trigger guide_tutorial_fixture_trigger after update of step_id on guide_tutorial_fixture
for each row execute function public.on_short_tutorial_character_setup_eligible();
create temporary table guide_quest_fixture(id uuid,user_id uuid,status text);
create trigger guide_quest_fixture_trigger after update of status on guide_quest_fixture
for each row execute function public.on_post_tutorial_quest_complete();

do $$
declare u uuid; raid_before bigint; guild_before bigint; n integer; state text; pending boolean;
begin
  select user_id into u from public.tutorial_progress where step_id='COMPLETE' limit 1;
  if u is null then raise exception 'COMPLETE fixture user required'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  select count(*) into raid_before from public.user_funnel_milestones where user_id=u and milestone='first_raid';
  select count(*) into guild_before from public.guild_members where user_id=u;

  delete from public.user_funnel_milestones where user_id=u and milestone in (
    'character_setup_dialog_eligible','post_tutorial_guild_view','post_tutorial_quest');
  insert into guide_tutorial_fixture values(u,'TUTORIAL_BATTLE');
  update guide_tutorial_fixture set step_id='RULE_GUIDE';
  if exists(select 1 from public.user_funnel_milestones where user_id=u and milestone='character_setup_dialog_eligible') then
    raise exception 'non-COMPLETE transition granted eligibility';
  end if;
  update guide_tutorial_fixture set step_id='COMPLETE';
  select count(*) into n from public.user_funnel_milestones where user_id=u and milestone='character_setup_dialog_eligible';
  if n<>1 then raise exception 'RULE_GUIDE completion missing eligibility'; end if;
  update guide_tutorial_fixture set step_id='TUTORIAL_BATTLE';
  update guide_tutorial_fixture set step_id='COMPLETE';
  select count(*) into n from public.user_funnel_milestones where user_id=u and milestone='character_setup_dialog_eligible';
  if n<>1 then raise exception 'duplicate eligibility'; end if;

  perform public.record_post_tutorial_guild_view();
  perform public.record_post_tutorial_guild_view();
  select count(*) into n from public.user_funnel_milestones where user_id=u and milestone='post_tutorial_guild_view';
  if n<>1 then raise exception 'Guild contact missing or duplicated'; end if;
  if raid_before<>(select count(*) from public.user_funnel_milestones where user_id=u and milestone='first_raid')
    or guild_before<>(select count(*) from public.guild_members where user_id=u) then
    raise exception 'Guild contact changed participation or membership';
  end if;

  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(u,'first_main_loadout','{"source":"rollback_test"}'::jsonb) on conflict(user_id,milestone) do nothing;
  insert into guide_quest_fixture values(gen_random_uuid(),u,'ACTIVE');
  -- 認証済みと匿名の両COMPLETEで同じ実績を記録。
  foreach pending in array array[false,true] loop
    update public.tutorial_progress set authentication_pending=pending where user_id=u;
    delete from public.user_funnel_milestones where user_id=u and milestone='post_tutorial_quest';
    update guide_quest_fixture set status='ACTIVE';
    update guide_quest_fixture set status='COMPLETED';
    if not exists(select 1 from public.user_funnel_milestones where user_id=u and milestone='post_tutorial_quest') then
      raise exception 'COMPLETE Quest not recorded, pending=%',pending;
    end if;
    update guide_quest_fixture set status='COMPLETED';
    select count(*) into n from public.user_funnel_milestones where user_id=u and milestone='post_tutorial_quest';
    if n<>1 then raise exception 'duplicate Quest milestone'; end if;
  end loop;
  -- 初期Tutorial途中ではGuild接触・post-Tutorial Quest実績を作らない。
  update public.tutorial_progress set step_id='RULE_GUIDE' where user_id=u;
  delete from public.user_funnel_milestones where user_id=u and milestone in ('post_tutorial_guild_view','post_tutorial_quest');
  if public.record_post_tutorial_guild_view() then raise exception 'pre-completion Guild marked'; end if;
  update guide_quest_fixture set status='ACTIVE';
  update guide_quest_fixture set status='COMPLETED';
  if exists(select 1 from public.user_funnel_milestones where user_id=u and milestone in ('post_tutorial_guild_view','post_tutorial_quest')) then
    raise exception 'pre-completion milestone created';
  end if;
end $$;
select 'PASS: eligibility/retry, Guild contact, authenticated/anonymous Quest, incomplete Tutorial, idempotent recovery' as result;
rollback;
