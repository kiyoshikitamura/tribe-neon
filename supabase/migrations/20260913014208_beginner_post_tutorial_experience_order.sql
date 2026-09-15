begin;
-- Tutorialでの装備/Quest報酬は維持し、Tutorial後の学習経験には転用しない。
-- 先行してQuestを完了したユーザーも経験を保持する。装備順/受取状態を前提にしない。
create or replace function public.on_post_tutorial_quest_complete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='COMPLETED' or new.status<>'COMPLETED' then return new; end if;
  if not exists(select 1 from public.tutorial_progress where user_id=new.user_id
    and step_id in ('AUTHENTICATION','COMPLETE')) then return new; end if;
  perform public.record_post_tutorial_guide_milestone(new.user_id,'post_tutorial_quest',
    jsonb_build_object('source','quest_claim','patrolId',new.id));
  return new;
end;
$$;
revoke all on function public.on_post_tutorial_quest_complete() from public,anon,authenticated;

-- 成功した手動装備も既存の装備経験へ集約。Tutorial中/未装着/同値更新は記録しない。
-- 新規の学習進捗テーブルやMissionを作らない。
create or replace function public.on_post_tutorial_manual_loadout()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.equipped_character_id is not distinct from old.equipped_character_id
    or nullif(new.equipped_character_id,'') is null then return new; end if;
  if not exists(select 1 from public.tutorial_progress where user_id=new.user_id
    and step_id in ('AUTHENTICATION','COMPLETE')) then return new; end if;
  if exists(select 1 from public.user_skills where user_id=new.user_id and nullif(equipped_character_id,'') is not null)
    and exists(select 1 from public.user_equipments where user_id=new.user_id and nullif(equipped_character_id,'') is not null) then
    perform public.record_post_tutorial_guide_milestone(new.user_id,'first_main_loadout',
      jsonb_build_object('source','post_tutorial_equip','table',tg_table_name));
  end if;
  return new;
end;
$$;
revoke all on function public.on_post_tutorial_manual_loadout() from public,anon,authenticated;
create trigger post_tutorial_manual_skill_loadout
  after update of equipped_character_id on public.user_skills
  for each row execute function public.on_post_tutorial_manual_loadout();
create trigger post_tutorial_manual_equipment_loadout
  after update of equipped_character_id on public.user_equipments
  for each row execute function public.on_post_tutorial_manual_loadout();

-- 過去の自由行動のうち、Tutorial終了後の出発を証明できるQuestのみ補完。
-- Tutorial内Quest、時刻不明の資産からは推測しない。報酬statusには触れない。
insert into public.user_funnel_milestones(user_id,milestone,metadata)
select distinct p.user_id,'post_tutorial_quest',jsonb_build_object('source','post_tutorial_quest_history_20260913')
from public.user_patrols p join public.tutorial_progress t on t.user_id=p.user_id
where t.step_id in ('COMPLETE','AUTHENTICATION') and p.status='COMPLETED'
  and p.started_at>=t.completed_at
on conflict(user_id,milestone) do nothing;

create or replace function public.get_beginner_mission_journey()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_sync jsonb; v_milestones text[];
  v_skill boolean; v_equipment boolean; v_facts jsonb; v_missions jsonb;
begin
  if v_user is null or not exists(select 1 from public.users where id=v_user) then
    raise exception 'Player authentication required' using errcode='42501';
  end if;
  v_sync:=public.sync_current_missions();
  select coalesce(array_agg(milestone),'{}'::text[]) into v_milestones
    from public.user_funnel_milestones where user_id=v_user;
  v_skill:= 'first_main_loadout'=any(v_milestones)
    or exists(select 1 from public.user_skills s where s.user_id=v_user and nullif(s.equipped_character_id,'') is not null);
  v_equipment:= 'first_main_loadout'=any(v_milestones)
    or exists(select 1 from public.user_equipments e where e.user_id=v_user and nullif(e.equipped_character_id,'') is not null);
  update public.user_missions set status='CLEAR',current_progress=1,progress_val=1,updated_at=clock_timestamp()
    where user_id=v_user and status='PROGRESS'
      and ((mission_id='MIS_N_P002' and v_skill) or (mission_id='MIS_N_P003' and v_equipment));
  -- 加入/設立はいずれも所属成功。閲覧/申請だけでは報酬を達成しない。
  update public.user_missions set status='CLEAR',current_progress=1,progress_val=1,updated_at=clock_timestamp()
    where user_id=v_user and mission_id='MIS_N_P010' and status='PROGRESS'
      and ('guild_joined'=any(v_milestones)
        or exists(select 1 from public.guild_members where user_id=v_user));
  v_facts:=jsonb_build_object(
    'free_skill','first_free_skill_ten_pull'=any(v_milestones) or exists(
      select 1 from public.gacha_execution_history where user_id=v_user and status='COMPLETED'
        and payment_source='free' and pull_count=10 and gacha_id='SKILL_NORMAL'),
    'free_equipment','first_free_equipment_ten_pull'=any(v_milestones) or exists(
      select 1 from public.gacha_execution_history where user_id=v_user and status='COMPLETED'
        and payment_source='free' and pull_count=10 and gacha_id='EQUIP_NORMAL'),
    'character','first_main_loadout'=any(v_milestones),
    'quest','post_tutorial_quest'=any(v_milestones),
    'pvp','first_pvp'=any(v_milestones),
    'raid','first_raid'=any(v_milestones),
    'guild','post_tutorial_guild_view'=any(v_milestones) or 'guild_joined'=any(v_milestones)
      or exists(select 1 from public.guild_members where user_id=v_user)
  );
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'category',m.category,'status',um.status,
    'expires_at',e.claim_deadline,'cycle_date',um.cycle_date) order by m.display_order,m.id),'[]'::jsonb)
    into v_missions from public.user_missions um join public.missions m on m.id=um.mission_id
    left join public.mission_events e on e.id=m.event_id
    where um.user_id=v_user and m.is_enabled;
  return jsonb_build_object('version',1,'facts',v_facts,'missions',v_missions,
    'reflow_completed','activation_mission_handoff'=any(v_milestones),
    'raid_unavailable_ack','initial_raid_unavailable_ack'=any(v_milestones),
    'cycle_date',v_sync->'cycle_date','synced_at',clock_timestamp());
end;
$$;

commit;
