-- GAME03: Raid導入後のDaily Mission、Tutorial後CTA、Activity Authority。
begin;

do $$
begin
  if to_regclass('public.missions') is null
    or to_regclass('public.user_missions') is null
    or to_regclass('public.social_activity_feed') is null
    or to_regclass('public.raid_rooms') is null
    or to_regclass('public.raid_bosses') is null
    or to_regclass('public.user_patrols') is null
    or to_regclass('public.gacha_execution_history') is null
    or to_regclass('public.canonical_raid_variants') is null
    or to_regprocedure('public.claim_mission_reward(text)') is null
    or to_regprocedure('public.claim_all_mission_rewards(text[])') is null then
    raise exception 'GAME03 prerequisites are missing';
  end if;
  if not exists(
    select 1 from public.canonical_master_freeze_versions
    where domain='MISSION' and version='2026-09-02'
  ) then
    raise exception 'Mission freeze 2026-09-02 is missing';
  end if;
end;
$$;

-- 勝敗ではなく、既存のPVP確定回数Authorityを共有するDaily Mission。
insert into public.missions(
  id, category, trigger_type, title, desc_text, description, target_value,
  condition_params, reward_item_id, reward_qty, reward_quantity,
  prerequisite_mission_id, display_order, is_enabled, is_repeatable,
  is_provisional, display_group, cash_reward, next_mission_id, repeat_rule,
  claim_rule, preopen
) values (
  'MIS_D_010', 'DAILY', 'PVP_FINALIZED_BATTLE_COUNT',
  'バトルを2回行う', 'バトルを2回行う', 'バトルを2回行う', 2,
  '{"cta_tab":"pvp","cta_label":"バトルへ"}'::jsonb,
  'RAID_POINT_TICKET', 1, 1, null, 45, true, true, false,
  'BATTLE', 0, null, 'DAILY_RESET', 'EXACTLY_ONCE', true
)
on conflict(id) do update set
  category=excluded.category, trigger_type=excluded.trigger_type,
  title=excluded.title, desc_text=excluded.desc_text,
  description=excluded.description, target_value=excluded.target_value,
  condition_params=excluded.condition_params,
  reward_item_id=excluded.reward_item_id, reward_qty=excluded.reward_qty,
  reward_quantity=excluded.reward_quantity,
  prerequisite_mission_id=excluded.prerequisite_mission_id,
  display_order=excluded.display_order, is_enabled=excluded.is_enabled,
  is_repeatable=excluded.is_repeatable, is_provisional=excluded.is_provisional,
  display_group=excluded.display_group, cash_reward=excluded.cash_reward,
  next_mission_id=excluded.next_mission_id, repeat_rule=excluded.repeat_rule,
  claim_rule=excluded.claim_rule, preopen=excluded.preopen;

with source as (
  select payload
  from public.canonical_master_freeze_versions
  where domain='MISSION' and version='2026-09-02'
), rewritten as (
  select jsonb_set(
    jsonb_set(payload, '{version}', to_jsonb('2026-09-10'::text)),
    '{missions}',
    (payload->'missions') || jsonb_build_array(jsonb_build_object(
      'id','MIS_D_010','category','DAILY','displayGroup','BATTLE',
      'triggerType','PVP_FINALIZED_BATTLE_COUNT','title','バトルを2回行う',
      'description','バトルを2回行う','targetValue',2,
      'conditionParams',jsonb_build_object('cta_tab','pvp','cta_label','バトルへ'),
      'rewardItemId','RAID_POINT_TICKET','rewardQuantity',1,'cashReward',0,
      'prerequisiteMissionId',null,'nextMissionId',null,'displayOrder',45,
      'repeatRule','DAILY_RESET','claimRule','EXACTLY_ONCE',
      'isEnabled',true,'isRepeatable',true,'isProvisional',false,
      'preopen',true,'cta',jsonb_build_object('tab','pvp','action',null,'label','バトルへ')
    ))
  ) payload
  from source
)
insert into public.canonical_master_freeze_versions(domain,version,payload,is_production_enabled)
select 'MISSION','2026-09-10',payload,true from rewritten
on conflict(domain,version) do update set
  payload=excluded.payload,is_production_enabled=true;

update public.canonical_master_freeze_versions
set is_production_enabled=false
where domain='MISSION' and version<>'2026-09-10';

-- Tutorial内のQuest達成とは分離し、装備Guide後に完了したQuestだけを記録する。
create or replace function public.record_post_tutorial_guide_milestone(
  p_user_id uuid, p_milestone text, p_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_inserted boolean;
begin
  if p_milestone not in (
    'first_free_skill_ten_pull','first_free_equipment_ten_pull',
    'first_main_loadout','post_tutorial_quest'
  ) then
    raise exception 'unsupported post-tutorial guide milestone' using errcode='22023';
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(p_user_id,p_milestone,coalesce(p_metadata,'{}'::jsonb))
  on conflict(user_id,milestone) do nothing returning true into v_inserted;
  return coalesce(v_inserted,false);
end;
$$;

create or replace function public.on_post_tutorial_quest_complete()
returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.status='COMPLETED' or new.status<>'COMPLETED' then return new; end if;
  if not exists(
    select 1 from public.tutorial_progress
    where user_id=new.user_id
      and (step_id='AUTHENTICATION' or (step_id='COMPLETE' and authentication_pending=true))
  ) or not exists(
    select 1 from public.user_funnel_milestones
    where user_id=new.user_id and milestone='first_main_loadout'
  ) then return new; end if;
  perform public.record_post_tutorial_guide_milestone(
    new.user_id,'post_tutorial_quest',
    jsonb_build_object('source','quest_claim','patrolId',new.id)
  );
  return new;
end;
$$;

drop trigger if exists post_tutorial_quest_complete_trigger on public.user_patrols;
create trigger post_tutorial_quest_complete_trigger
after update of status on public.user_patrols
for each row when(old.status is distinct from new.status and new.status='COMPLETED')
execute function public.on_post_tutorial_quest_complete();

-- Guild加入を前提にせず、Canonical Guide完了だけを検証してMissionへ渡す。
create or replace function public.complete_activation_mission_handoff()
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if exists(
    select required.milestone
    from unnest(array[
      'first_free_skill_ten_pull','first_free_equipment_ten_pull',
      'first_main_loadout','post_tutorial_quest','first_pvp','first_raid'
    ]) required(milestone)
    where not exists(
      select 1 from public.user_funnel_milestones actual
      where actual.user_id=v_user_id and actual.milestone=required.milestone
    )
  ) then
    raise exception 'activation prerequisites not met' using errcode='55000';
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user_id,'activation_mission_handoff',jsonb_build_object('source','home','destination','mission'))
  on conflict(user_id,milestone) do nothing;
  return true;
end;
$$;

-- 新規SSRを全体Activityへ投入しない。既存履歴は保持する。
drop trigger if exists m9x_gacha_activity_trigger on public.gacha_execution_history;

alter table public.social_activity_feed
  drop constraint if exists social_activity_feed_activity_type_check;
alter table public.social_activity_feed
  add constraint social_activity_feed_activity_type_check check(activity_type in (
    'SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1',
    'GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED'
  ));

create unique index if not exists social_activity_feed_raid_boss_defeated_once_idx
  on public.social_activity_feed(object_master_id)
  where activity_type='RAID_BOSS_DEFEATED';

create or replace function public.on_raid_boss_defeated_activity()
returns trigger
language plpgsql security definer set search_path=public as $$
declare v_room public.raid_rooms%rowtype; v_owner_name text; v_boss_name text;
begin
  if old.status='CLEARED' or new.status<>'CLEARED' or coalesce(new.current_hp,0)<>0 then
    return new;
  end if;
  select * into v_room from public.raid_rooms where raid_boss_instance_id=new.id;
  if not found then return new; end if;
  select username into v_owner_name from public.users where id=v_room.owner_user_id;
  select raid_name into v_boss_name from public.canonical_raid_variants
  where raid_variant_id=new.raid_variant_id and is_production_enabled limit 1;
  insert into public.social_activity_feed(
    activity_type,actor_user_id,actor_display_name,object_master_id,display_payload
  ) values (
    'RAID_BOSS_DEFEATED',v_room.owner_user_id,coalesce(v_owner_name,'プレイヤー'),new.id::text,
    jsonb_build_object('room_id',v_room.id,'boss_name',v_boss_name,'raid_owner_name',coalesce(v_owner_name,'プレイヤー'))
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists raid_boss_defeated_activity_trigger on public.raid_bosses;
create trigger raid_boss_defeated_activity_trigger
after update of status,current_hp on public.raid_bosses
for each row when(old.status is distinct from new.status and new.status='CLEARED')
execute function public.on_raid_boss_defeated_activity();

create or replace function public.get_recent_social_activity_feed(p_limit integer default 20)
returns table(
  id uuid,activity_type text,actor_user_id uuid,actor_display_name text,
  guild_id uuid,object_master_id text,display_payload jsonb,
  permanent boolean,created_at timestamptz
)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return query
  select feed.id,feed.activity_type,feed.actor_user_id,feed.actor_display_name,
    feed.guild_id,feed.object_master_id,feed.display_payload,feed.permanent,feed.created_at
  from public.social_activity_feed feed
  where feed.created_at>=statement_timestamp()-interval '24 hours'
    and feed.created_at<=statement_timestamp()
    and feed.activity_type in ('POWER_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED')
    and exists(select 1 from public.users actor where actor.id=feed.actor_user_id)
    and not exists(
      select 1 from public.kpi_subjects subject
      join public.kpi_account_classification_periods classification
        on classification.subject_id=subject.subject_id
      where subject.source_user_id=feed.actor_user_id
        and classification.classification in ('qa','test')
        and classification.valid_from<=feed.created_at
        and (classification.valid_to is null or feed.created_at<classification.valid_to)
    )
  order by feed.created_at desc,feed.id desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

revoke all on function public.record_post_tutorial_guide_milestone(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.on_post_tutorial_quest_complete() from public,anon,authenticated;
revoke all on function public.on_raid_boss_defeated_activity() from public,anon,authenticated;
revoke all on function public.complete_activation_mission_handoff() from public,anon;
grant execute on function public.complete_activation_mission_handoff() to authenticated;
revoke all on function public.get_recent_social_activity_feed(integer) from public,anon,authenticated,service_role;
grant execute on function public.get_recent_social_activity_feed(integer) to authenticated;

do $$
begin
  if not exists(
    select 1 from public.missions where id='MIS_D_010' and category='DAILY'
      and trigger_type='PVP_FINALIZED_BATTLE_COUNT' and target_value=2
      and reward_item_id='RAID_POINT_TICKET' and reward_quantity=1 and is_enabled
  ) then raise exception 'GAME03 Daily Mission mismatch'; end if;
  if exists(
    select 1 from pg_trigger where tgrelid='public.gacha_execution_history'::regclass
      and tgname='m9x_gacha_activity_trigger' and tgenabled<>'D'
  ) then raise exception 'SSR Activity trigger is still enabled'; end if;
end;
$$;

commit;
notify pgrst,'reload schema';
