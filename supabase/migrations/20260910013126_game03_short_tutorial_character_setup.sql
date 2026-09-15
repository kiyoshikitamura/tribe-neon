begin;

-- The shortened flow keeps the existing tutorial_progress and KPI authorities.
-- New rows begin at FREE_GACHA; legacy removed steps are advanced by the
-- idempotent resume_short_tutorial() recovery RPC below.
create or replace function public.initialize_current_player(p_username text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid();
  v_username text:=btrim(p_username);
  v_is_anonymous boolean:=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not v_is_anonymous then raise exception 'Anonymous onboarding session is required'; end if;
  if v_username is null or char_length(v_username) not between 1 and 8 then
    raise exception 'Username must contain 1 to 8 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  if exists(select 1 from public.users where id=v_user_id) then
    insert into public.tutorial_progress(user_id,step_id) values(v_user_id,'FREE_GACHA') on conflict(user_id) do nothing;
    return jsonb_build_object('status','already_initialized','tutorial_step',(select step_id from public.tutorial_progress where user_id=v_user_id));
  end if;
  if exists(select 1 from public.users where lower(btrim(username))=lower(v_username)) then
    raise exception 'Username is already in use' using errcode='23505';
  end if;
  insert into public.users(id,username,current_base_id,favorite_character_id)
  values(v_user_id,v_username,'shinjuku',null);
  insert into private.initial_equipment_receipts(user_id) values(v_user_id);
  insert into public.tutorial_progress(user_id,step_id) values(v_user_id,'FREE_GACHA') on conflict(user_id) do nothing;
  return jsonb_build_object('status','success','tutorial_step','FREE_GACHA');
end;
$$;

create or replace function public.start_tutorial_progress()
returns text language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not exists(select 1 from public.users where id=v_user_id) then raise exception 'Player profile is required'; end if;
  insert into public.tutorial_progress(user_id,step_id) values(v_user_id,'FREE_GACHA') on conflict(user_id) do nothing;
  return coalesce((select step_id from public.tutorial_progress where user_id=v_user_id),'FREE_GACHA');
end;
$$;

-- Preserve the canonical transition function and add only the direct battle ->
-- completion edge used after the shortened tutorial battle.
create or replace function public.advance_tutorial_progress(p_expected_step text,p_next_step text)
returns text language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid(); v_current_step text;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  select step_id into v_current_step from public.tutorial_progress where user_id=v_user_id for update;
  if v_current_step is null then raise exception 'Tutorial has not started'; end if;
  if v_current_step<>p_expected_step then raise exception 'Unexpected tutorial step'; end if;
  if (p_expected_step,p_next_step) not in (
    ('WORLD_INTRO','FREE_GACHA'),('FREE_GACHA','AUTO_FORMATION'),
    ('AUTO_FORMATION','DISPATCH'),('DISPATCH','FREE_INSTANT'),
    ('FREE_INSTANT','TUTORIAL_BATTLE'),('TUTORIAL_BATTLE','RULE_GUIDE'),
    ('TUTORIAL_BATTLE','COMPLETE'),('RULE_GUIDE','COMPLETE')
  ) then raise exception 'Invalid tutorial transition'; end if;
  update public.tutorial_progress set step_id=p_next_step,updated_at=now(),
    completed_at=case when p_next_step='COMPLETE' then now() else completed_at end
  where user_id=v_user_id;
  return p_next_step;
end;
$$;

-- New-flow eligibility is written only when a user completes after this trigger
-- exists, so previously completed accounts never receive a surprise dialog.
create or replace function public.on_short_tutorial_character_setup_eligible()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.step_id='COMPLETE' and old.step_id is distinct from 'COMPLETE' then
    insert into public.user_funnel_milestones(user_id,milestone,metadata)
    values(new.user_id,'character_setup_dialog_eligible',jsonb_build_object('flow','short_tutorial_v1'))
    on conflict(user_id,milestone) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists short_tutorial_character_setup_eligible_trigger on public.tutorial_progress;
create trigger short_tutorial_character_setup_eligible_trigger
after update of step_id on public.tutorial_progress
for each row execute function public.on_short_tutorial_character_setup_eligible();

-- Skip the removed formation/growth/dispatch/instant screens while retaining
-- their authoritative party, defense-deck, patrol and battle state changes.
create or replace function public.resume_short_tutorial()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_step text; v_formation jsonb; v_party text[];
  v_leader text; v_patrol_id uuid; v_patrol jsonb; v_instant jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  select step_id into v_step from public.tutorial_progress where user_id=v_user_id for update;
  if v_step is null then raise exception 'Tutorial has not started'; end if;
  if v_step='WORLD_INTRO' then
    update public.tutorial_progress set step_id='FREE_GACHA',updated_at=now() where user_id=v_user_id;
    return jsonb_build_object('status','advanced','tutorial_step','FREE_GACHA');
  end if;
  if v_step='RULE_GUIDE' then
    update public.tutorial_progress set step_id='COMPLETE',updated_at=now(),completed_at=coalesce(completed_at,now()) where user_id=v_user_id;
    return jsonb_build_object('status','advanced','tutorial_step','COMPLETE');
  end if;
  if v_step='AUTO_FORMATION' then
    v_formation:=public.save_recommended_main_formation();
    select coalesce(array_agg(value order by ordinality),'{}'::text[]) into v_party
    from jsonb_array_elements_text(v_formation->'character_ids') with ordinality picked(value,ordinality);
    if cardinality(v_party)=0 then raise exception 'owned character required' using errcode='P0002'; end if;
    select favorite_character_id into v_leader from public.users where id=v_user_id for update;
    if v_leader is null or not(v_leader=any(v_party)) then
      v_leader:=v_party[1]; update public.users set favorite_character_id=v_leader where id=v_user_id;
    end if;
    perform public.save_pvp_defense_deck(v_party,'ATTACK_PRIORITY');
    update public.tutorial_progress set step_id='DISPATCH',updated_at=now() where user_id=v_user_id;
    v_step:='DISPATCH';
  end if;
  if v_step='DISPATCH' then
    select id into v_patrol_id from public.user_patrols
    where user_id=v_user_id and coalesce(course_id,quest_id)='q_shinjuku_1' and status<>'COMPLETED'
    order by started_at desc limit 1 for update;
    if v_patrol_id is null then
      select owned.character_id into v_leader from public.user_main_formations formation
      join public.user_characters owned on owned.id=formation.user_character_id
      where formation.user_id=v_user_id order by formation.slot limit 1;
      v_patrol:=public.start_patrol('q_shinjuku_1',v_leader);
      v_patrol_id:=(v_patrol->>'patrol_id')::uuid;
    end if;
    update public.tutorial_progress set step_id='FREE_INSTANT',updated_at=now() where user_id=v_user_id;
    v_step:='FREE_INSTANT';
  end if;
  if v_step='FREE_INSTANT' then
    if v_patrol_id is null then
      select id into v_patrol_id from public.user_patrols
      where user_id=v_user_id and coalesce(course_id,quest_id)='q_shinjuku_1' and status='ONGOING'
      order by started_at desc limit 1 for update;
    end if;
    if v_patrol_id is null then raise exception 'tutorial patrol is unavailable' using errcode='P0002'; end if;
    v_instant:=public.complete_patrol_instantly(v_user_id,v_patrol_id,'FREE_TUTORIAL');
    v_step:='TUTORIAL_BATTLE';
  end if;
  return jsonb_build_object('status','ready','tutorial_step',v_step,'patrol_id',v_patrol_id,'formation',v_formation);
end;
$$;

-- Shared canonical equipment allocator. The existing loadout RPC and the new
-- dialog RPC both use this single implementation.
create or replace function private.apply_recommended_main_equipment_v1(p_user_id uuid)
returns integer language plpgsql security definer set search_path=public,private as $$
declare v_member record; v_slot integer; v_equipment_id uuid; v_count integer:=0;
begin
  perform 1 from public.user_main_formations where user_id=p_user_id order by slot for update;
  perform 1 from public.user_equipments where user_id=p_user_id for update;
  update public.user_equipments set equipped_character_id=null,slot_index=null
  where user_id=p_user_id and equipped_character_id in (
    select user_character_id::text from public.user_main_formations where user_id=p_user_id
  );
  for v_slot in 0..6 loop
    for v_member in
      select formation.slot,owned.id,owned.character_id
      from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
      where formation.user_id=p_user_id
      order by case when mod(v_slot,2)=0 then formation.slot else 6-formation.slot end
    loop
      select candidate.id into v_equipment_id
      from public.user_equipments candidate join public.canonical_equipment_master master
        on master.version='2026-08-21' and master.equipment_id=coalesce(nullif(candidate.equipment_id,''),candidate.equipment_master_id)
      where candidate.user_id=p_user_id and candidate.equipped_character_id is null
        and master.category=case v_slot when 0 then 'WEAPON' when 1 then 'WEAPON' when 2 then 'HEAD' when 3 then 'BODY' when 4 then 'LEGS' else 'ACCESSORY' end
        and (master.exclusive_character_id is null or master.exclusive_character_id=v_member.character_id)
      order by (master.exclusive_character_id=v_member.character_id) desc,
        (public.canonical_equipment_flat_stat((master.base_stats->>'hp')::integer,coalesce(candidate.level,1),coalesce(candidate.plus_val,0))
        +public.canonical_equipment_flat_stat((master.base_stats->>'atk')::integer,coalesce(candidate.level,1),coalesce(candidate.plus_val,0))
        +public.canonical_equipment_flat_stat((master.base_stats->>'def')::integer,coalesce(candidate.level,1),coalesce(candidate.plus_val,0))) desc,
        coalesce(candidate.level,1) desc,coalesce(candidate.plus_val,0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.equipment_id,candidate.id limit 1;
      if v_equipment_id is not null then
        update public.user_equipments set equipped_character_id=v_member.id::text,slot_index=v_slot where id=v_equipment_id;
        v_count:=v_count+1;
      end if;
      v_equipment_id:=null;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Preserve the accepted Main-loadout API, including Skill behavior, while
-- delegating its Equipment work to the common allocator.
create or replace function public.apply_recommended_main_loadout()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_party_count integer; v_member record; v_round integer;
  v_skill_id uuid; v_skill_count integer:=0; v_equipment_count integer:=0;
  v_total_power bigint; v_results jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  select count(*) into v_party_count from public.user_main_formations where user_id=v_user_id;
  if v_party_count<>5 then raise exception 'Main Formation must contain five Characters' using errcode='23514'; end if;
  perform 1 from public.user_main_formations where user_id=v_user_id order by slot for update;
  perform 1 from public.user_skills where user_id=v_user_id for update;
  update public.user_skills set equipped_character_id=null,slot_index=null
  where user_id=v_user_id and equipped_character_id in (
    select user_character_id::text from public.user_main_formations where user_id=v_user_id
  );
  for v_round in 0..5 loop
    for v_member in
      select formation.slot,owned.id,owned.character_id,owned.awakening_level
      from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
      where formation.user_id=v_user_id order by formation.slot
    loop
      if v_round>=public.canonical_skill_slot_count(v_member.awakening_level) then continue; end if;
      select candidate.id into v_skill_id
      from public.user_skills candidate join public.canonical_skill_master master
        on master.version='2026-08-21' and master.skill_id=candidate.skill_card_id
      where candidate.user_id=v_user_id and candidate.equipped_character_id is null
        and (master.exclusive_character_id is null or master.exclusive_character_id=v_member.character_id)
        and (master.exclusive_character_id is null or not exists(
          select 1 from public.user_skills equipped join public.canonical_skill_master equipped_master
            on equipped_master.version='2026-08-21' and equipped_master.skill_id=equipped.skill_card_id
          where equipped.user_id=v_user_id and equipped.equipped_character_id=v_member.id::text
            and equipped_master.exclusive_character_id is not null))
      order by (master.exclusive_character_id=v_member.character_id) desc,coalesce(candidate.plus_val,0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.skill_id,candidate.id limit 1;
      if v_skill_id is not null then
        update public.user_skills set equipped_character_id=v_member.id::text,slot_index=v_round where id=v_skill_id;
        v_skill_count:=v_skill_count+1;
      end if;
      v_skill_id:=null;
    end loop;
  end loop;
  v_equipment_count:=private.apply_recommended_main_equipment_v1(v_user_id);
  if v_skill_count=0 or v_equipment_count=0 then
    raise exception 'Main Formation requires at least one Skill and one Equipment' using errcode='23514';
  end if;
  perform public.record_post_tutorial_guide_milestone(v_user_id,'first_main_loadout',jsonb_build_object('skillCount',v_skill_count,'equipmentCount',v_equipment_count));
  v_total_power:=public.refresh_user_power_projection(v_user_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'characterId',owned.character_id,'userCharacterId',owned.id,
    'skillCount',(select count(*) from public.user_skills skill where skill.user_id=v_user_id and skill.equipped_character_id=owned.id::text),
    'equipmentCount',(select count(*) from public.user_equipments equipment where equipment.user_id=v_user_id and equipment.equipped_character_id=owned.id::text)
  ) order by formation.slot),'[]'::jsonb) into v_results
  from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
  where formation.user_id=v_user_id;
  return jsonb_build_object('status','success','skillCount',v_skill_count,'equipmentCount',v_equipment_count,
    'totalPower',v_total_power,'characters',v_results);
end;
$$;

create or replace function public.get_character_setup_dialog_state()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'eligible',exists(select 1 from public.user_funnel_milestones where user_id=auth.uid() and milestone='character_setup_dialog_eligible'),
    'consumed',exists(select 1 from public.user_funnel_milestones where user_id=auth.uid() and milestone='character_setup_dialog_consumed')
  ) end;
$$;

create or replace function public.complete_character_setup_dialog(p_action text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare
  v_user_id uuid:=auth.uid(); v_action text:=upper(coalesce(p_action,'')); v_before bigint;
  v_after bigint; v_formation jsonb; v_equipment_count integer:=0; v_existing jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  if v_action not in ('AUTO_SETUP','LATER') then raise exception 'invalid dialog action' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  if not exists(select 1 from public.user_funnel_milestones where user_id=v_user_id and milestone='character_setup_dialog_eligible') then
    raise exception 'character setup dialog is unavailable' using errcode='42501';
  end if;
  select metadata into v_existing from public.user_funnel_milestones
  where user_id=v_user_id and milestone='character_setup_dialog_consumed';
  if v_existing is not null then return jsonb_build_object('status','already_consumed','result',v_existing); end if;
  v_before:=public.refresh_user_power_projection(v_user_id);
  if v_action='AUTO_SETUP' then
    v_formation:=public.save_recommended_main_formation();
    v_equipment_count:=private.apply_recommended_main_equipment_v1(v_user_id);
    v_after:=public.refresh_user_power_projection(v_user_id);
    perform public.record_post_tutorial_guide_milestone(v_user_id,'first_main_loadout',
      jsonb_build_object('source','character_setup_dialog','equipmentCount',v_equipment_count));
  else
    v_after:=v_before;
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user_id,'character_setup_dialog_consumed',jsonb_build_object(
    'action',lower(v_action),'powerBefore',v_before,'powerAfter',v_after,
    'equipmentCount',v_equipment_count,'partyCount',coalesce(jsonb_array_length(v_formation->'character_ids'),0)
  )) on conflict(user_id,milestone) do nothing;
  return jsonb_build_object('status','success','action',lower(v_action),'powerBefore',v_before,'powerAfter',v_after,
    'equipmentCount',v_equipment_count,'partyCount',coalesce(jsonb_array_length(v_formation->'character_ids'),0),
    'formation',v_formation);
end;
$$;

-- A skipped setup still completes the Character-page guide, so subsequent
-- Quest and Mission handoff authorities must accept dialog consumption.
create or replace function public.on_post_tutorial_quest_complete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status='COMPLETED' or new.status<>'COMPLETED' then return new; end if;
  if not exists(select 1 from public.tutorial_progress where user_id=new.user_id
    and (step_id='AUTHENTICATION' or (step_id='COMPLETE' and authentication_pending=true)))
    or not exists(select 1 from public.user_funnel_milestones where user_id=new.user_id
      and milestone in ('first_main_loadout','character_setup_dialog_consumed')) then return new; end if;
  perform public.record_post_tutorial_guide_milestone(new.user_id,'post_tutorial_quest',jsonb_build_object('source','quest_claim','patrolId',new.id));
  return new;
end;
$$;

create or replace function public.complete_activation_mission_handoff()
returns boolean language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  if exists(select required.milestone from unnest(array[
    'first_free_skill_ten_pull','first_free_equipment_ten_pull','post_tutorial_quest','first_pvp','first_raid'
  ]) required(milestone) where not exists(select 1 from public.user_funnel_milestones actual
    where actual.user_id=v_user_id and actual.milestone=required.milestone))
    or not exists(select 1 from public.user_funnel_milestones where user_id=v_user_id
      and milestone in ('first_main_loadout','character_setup_dialog_consumed')) then
    raise exception 'activation prerequisites not met' using errcode='55000';
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user_id,'activation_mission_handoff',jsonb_build_object('source','home','destination','mission'))
  on conflict(user_id,milestone) do nothing;
  return true;
end;
$$;

revoke all on function private.apply_recommended_main_equipment_v1(uuid) from public,anon,authenticated;
revoke all on function public.resume_short_tutorial() from public,anon;
revoke all on function public.get_character_setup_dialog_state() from public,anon;
revoke all on function public.complete_character_setup_dialog(text) from public,anon;
grant execute on function public.resume_short_tutorial() to authenticated;
grant execute on function public.get_character_setup_dialog_state() to authenticated;
grant execute on function public.complete_character_setup_dialog(text) to authenticated;

commit;
notify pgrst,'reload schema';
