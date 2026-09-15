-- 初心者Mission = Guide + Achievement + Reward + Reflow。
-- 報酬量・受取回数は維持し、装備Missionの前段報酬受取依存のみ解除する。
begin;
do $$ begin
  if (select count(*) from public.missions where id in ('MIS_N_P002','MIS_N_P003')
    and category='NORMAL' and target_value=1 and cash_reward=100
    and ((id='MIS_N_P002' and trigger_type='SKILL_EQUIP_COUNT' and reward_item_id='SKILL_MANUAL' and reward_quantity=1 and prerequisite_mission_id='MIS_N_P001')
      or (id='MIS_N_P003' and trigger_type='EQUIPMENT_EQUIP_COUNT' and reward_item_id='EQUIP_EXP_M' and reward_quantity=2 and prerequisite_mission_id='MIS_N_P002'))) <> 2 then
    raise exception 'Beginner Mission master drift; review before applying';
  end if;
end $$;
update public.missions set prerequisite_mission_id=null where id in ('MIS_N_P002','MIS_N_P003');
update public.missions set next_mission_id=null where id in ('MIS_N_P001','MIS_N_P002')
  and next_mission_id in ('MIS_N_P002','MIS_N_P003');

-- 現在装備中の行は装備成功の証拠。単なるアイテム所持は証拠にしない。
-- CLEAR/CLAIMEDを保持するため、解除・消費・日付変更でも経験が消えない。
create or replace function public.get_beginner_mission_journey()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_sync jsonb; v_milestones text[]; v_clear text[];
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
  select coalesce(array_agg(mission_id),'{}'::text[]) into v_clear
    from public.user_missions where user_id=v_user and status in ('CLEAR','CLAIMED');
  v_facts:=jsonb_build_object(
    'free_skill','first_free_skill_ten_pull'=any(v_milestones) or exists(
      select 1 from public.gacha_execution_history where user_id=v_user and status='COMPLETED'
        and payment_source='free' and pull_count=10 and gacha_id='SKILL_NORMAL'),
    'free_equipment','first_free_equipment_ten_pull'=any(v_milestones) or exists(
      select 1 from public.gacha_execution_history where user_id=v_user and status='COMPLETED'
        and payment_source='free' and pull_count=10 and gacha_id='EQUIP_NORMAL'),
    'character',('MIS_N_P002'=any(v_clear) and 'MIS_N_P003'=any(v_clear)),
    'quest','post_tutorial_quest'=any(v_milestones) or 'MIS_N_P004'=any(v_clear)
      or exists(select 1 from public.user_patrols where user_id=v_user and status='COMPLETED'),
    'pvp','first_pvp'=any(v_milestones) or 'MIS_N_P006'=any(v_clear),
    'raid','first_raid'=any(v_milestones) or 'MIS_N_P008'=any(v_clear),
    'guild','post_tutorial_guild_view'=any(v_milestones) or 'guild_joined'=any(v_milestones)
      or 'MIS_N_P010'=any(v_clear) or exists(select 1 from public.guild_members where user_id=v_user)
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
revoke all on function public.get_beginner_mission_journey() from public,anon;
grant execute on function public.get_beginner_mission_journey() to authenticated;

-- 終端も同じ成功Factを参照する。Tutorial内の装備・Quest経験をやり直させない。
create or replace function public.complete_activation_mission_handoff()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_journey jsonb; v_facts jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_journey:=public.get_beginner_mission_journey(); v_facts:=v_journey->'facts';
  if (v_journey->>'reflow_completed')::boolean then return true; end if;
  if not (v_facts @> '{"free_skill":true,"free_equipment":true,"character":true,"quest":true,"pvp":true,"guild":true}') then
    raise exception 'activation prerequisites not met' using errcode='55000';
  end if;
  if not ((v_facts->>'raid')::boolean or (v_journey->>'raid_unavailable_ack')::boolean) then
    -- 未開催の承認はクライアント値でなく既存server開催確認を通す。
    perform public.acknowledge_initial_raid_guide();
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
    values(v_user,'activation_mission_handoff',jsonb_build_object('source','beginner_mission','destination','home'))
    on conflict(user_id,milestone) do nothing;
  return true;
end;
$$;
revoke all on function public.complete_activation_mission_handoff() from public,anon;
grant execute on function public.complete_activation_mission_handoff() to authenticated;

create or replace function public.acknowledge_initial_raid_guide()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_legacy_enabled boolean; v_journey jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_journey:=public.get_beginner_mission_journey();
  if (v_journey->>'reflow_completed')::boolean or (v_journey->>'raid_unavailable_ack')::boolean then return true; end if;
  if not ((v_journey->'facts') @> '{"free_skill":true,"free_equipment":true,"character":true,"quest":true,"pvp":true}') then
    raise exception 'activation prerequisites not met' using errcode='55000';
  end if;
  -- get_active_raidsと同じ公開対象。既存の開催チェックを保持する。
  select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
  if v_legacy_enabled is true and exists(
    select 1 from public.raid_bosses boss
    join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id
    where boss.status='ACTIVE' and boss.expires_at>clock_timestamp()
      and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id)
  ) then raise exception 'active raid requires participation' using errcode='55000'; end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
    values(v_user_id,'initial_raid_unavailable_ack',jsonb_build_object(
      'source','raid','destination','guild','reason','no_available_legacy_raid'))
    on conflict(user_id,milestone) do nothing;
  return true;
end;
$$;
revoke all on function public.acknowledge_initial_raid_guide() from public,anon;
grant execute on function public.acknowledge_initial_raid_guide() to authenticated;
commit;
