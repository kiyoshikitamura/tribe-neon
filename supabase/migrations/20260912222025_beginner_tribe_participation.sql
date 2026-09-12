begin;
-- 既存一回報酬を再利用。新規Mission/報酬/再受取権を作らない。
do $$ begin
 if not exists(select 1 from public.missions where id='MIS_N_P010' and trigger_type='GUILD_JOIN_COUNT'
 and target_value=1 and reward_item_id='NORMAL_GACHA_TICKET_RANDOM' and reward_quantity=1
 and cash_reward=300 and prerequisite_mission_id is null) then raise exception 'TRIBE mission master drift'; end if;
end $$;
update public.missions set title='TRIBEに参加しよう',description='既存のギルドに加入するか、新しくギルドを設立しよう' where id='MIS_N_P010';
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
  -- 加入/設立はいずれも所属成功。閲覧/申請だけでは報酬を達成しない。
  update public.user_missions set status='CLEAR',current_progress=1,progress_val=1,updated_at=clock_timestamp()
    where user_id=v_user and mission_id='MIS_N_P010' and status='PROGRESS'
      and ('guild_joined'=any(v_milestones)
        or exists(select 1 from public.guild_members where user_id=v_user));
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
commit;
