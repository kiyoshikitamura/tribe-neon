-- Preview applied: 20260915053404. Do not reapply. Production requires separate approval.
-- Canonical equipment ownership; shared skill allocator accepts shortage for onboarding.
begin;

create or replace function public.set_character_equipment(
  p_character_id uuid,
  p_equipment_id uuid,
  p_slot_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_character_master_id text;
  v_equipment_master public.canonical_equipment_master%rowtype;
  v_expected_slot_type text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select character_id into v_character_master_id
  from public.user_characters
  where id = p_character_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'owned character not found' using errcode = 'P0002';
  end if;

  v_expected_slot_type := case p_slot_index
    when 0 then 'WEAPON' when 1 then 'WEAPON'
    when 2 then 'HEAD' when 3 then 'BODY' when 4 then 'LEGS'
    when 5 then 'ACCESSORY' when 6 then 'ACCESSORY'
    else null
  end;
  if v_expected_slot_type is null then
    raise exception 'invalid equipment slot' using errcode = '22023';
  end if;

  select master.* into v_equipment_master
  from public.user_equipments owned
  join public.canonical_equipment_master master
    on master.version = '2026-08-21' and master.equipment_id = coalesce(nullif(owned.equipment_id, ''), owned.equipment_master_id)
  where owned.id = p_equipment_id and owned.user_id = v_user_id
  for update of owned;
  if not found then
    raise exception 'owned equipment not found' using errcode = 'P0002';
  end if;
  if v_equipment_master.category <> v_expected_slot_type then
    raise exception 'equipment type does not match slot' using errcode = '23514';
  end if;
  if v_equipment_master.exclusive_character_id is not null
     and v_equipment_master.exclusive_character_id is distinct from v_character_master_id then
    raise exception 'exclusive equipment cannot be equipped by this character' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_equipments
    where id = p_equipment_id and equipped_character_id is not null
      and equipped_character_id <> p_character_id::text
  ) then
    raise exception 'equipment is already equipped by another character' using errcode = '23505';
  end if;

  update public.user_equipments
  set equipped_character_id = null, slot_index = null
  where user_id = v_user_id
    and equipped_character_id = p_character_id::text
    and slot_index = p_slot_index
    and id <> p_equipment_id;

  update public.user_equipments
  set equipped_character_id = p_character_id::text, slot_index = p_slot_index
  where id = p_equipment_id and user_id = v_user_id;

  return jsonb_build_object('status', 'success', 'equipment_id', p_equipment_id, 'slot_index', p_slot_index);
end;
$$;

create or replace function public.set_character_equipment_bulk(
  p_character_id uuid,
  p_equipment_ids uuid[],
  p_slot_indexes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_character_master_id text;
  v_requested_count integer := coalesce(array_length(p_equipment_ids, 1), 0);
  v_index integer;
  v_equipment_id uuid;
  v_slot_index integer;
  v_expected_slot_type text;
  v_equipment_master public.canonical_equipment_master%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_requested_count <> coalesce(array_length(p_slot_indexes, 1), 0) or v_requested_count > 7 then
    raise exception 'equipment and slot arrays must have the same length up to 7' using errcode = '22023';
  end if;
  if v_requested_count <> (select count(distinct value) from unnest(coalesce(p_equipment_ids, '{}'::uuid[])) value)
     or v_requested_count <> (select count(distinct value) from unnest(coalesce(p_slot_indexes, '{}'::integer[])) value) then
    raise exception 'duplicate equipment or slot' using errcode = '23505';
  end if;

  select character_id into v_character_master_id
  from public.user_characters
  where id = p_character_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'owned character not found' using errcode = 'P0002';
  end if;

  for v_index in 1..v_requested_count loop
    v_equipment_id := p_equipment_ids[v_index];
    v_slot_index := p_slot_indexes[v_index];
    v_expected_slot_type := case v_slot_index
      when 0 then 'WEAPON' when 1 then 'WEAPON'
      when 2 then 'HEAD' when 3 then 'BODY' when 4 then 'LEGS'
      when 5 then 'ACCESSORY' when 6 then 'ACCESSORY'
      else null
    end;
    if v_expected_slot_type is null then
      raise exception 'invalid equipment slot' using errcode = '22023';
    end if;
    select master.* into v_equipment_master
    from public.user_equipments owned
    join public.canonical_equipment_master master
      on master.version = '2026-08-21' and master.equipment_id = coalesce(nullif(owned.equipment_id, ''), owned.equipment_master_id)
    where owned.id = v_equipment_id and owned.user_id = v_user_id
    for update of owned;
    if not found then
      raise exception 'owned equipment not found' using errcode = 'P0002';
    end if;
    if v_equipment_master.category <> v_expected_slot_type then
      raise exception 'equipment type does not match slot' using errcode = '23514';
    end if;
    if v_equipment_master.exclusive_character_id is not null
       and v_equipment_master.exclusive_character_id is distinct from v_character_master_id then
      raise exception 'exclusive equipment cannot be equipped by this character' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.user_equipments
      where id = v_equipment_id and equipped_character_id is not null
        and equipped_character_id <> p_character_id::text
    ) then
      raise exception 'equipment is already equipped by another character' using errcode = '23505';
    end if;
  end loop;

  update public.user_equipments
  set equipped_character_id = null, slot_index = null
  where user_id = v_user_id and equipped_character_id = p_character_id::text;

  for v_index in 1..v_requested_count loop
    update public.user_equipments
    set equipped_character_id = p_character_id::text, slot_index = p_slot_indexes[v_index]
    where id = p_equipment_ids[v_index] and user_id = v_user_id;
  end loop;

  return jsonb_build_object('status', 'success', 'equipped_count', v_requested_count);
end;
$$;

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
      order by (master.exclusive_character_id=v_member.character_id) desc nulls last,
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

create or replace function private.apply_recommended_main_skills_v1(p_user_id uuid)
returns integer language plpgsql security definer set search_path=public,private as $$
declare v_member record; v_round integer; v_skill_id uuid; v_skill_count integer:=0;
begin
  perform 1 from public.user_main_formations where user_id=p_user_id order by slot for update;
  perform 1 from public.user_skills where user_id=p_user_id for update;
  update public.user_skills set equipped_character_id=null,slot_index=null
  where user_id=p_user_id and equipped_character_id in (
    select user_character_id::text from public.user_main_formations where user_id=p_user_id
  );
  for v_round in 0..5 loop
    for v_member in
      select formation.slot,owned.id,owned.character_id,owned.awakening_level
      from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
      where formation.user_id=p_user_id order by formation.slot
    loop
      if v_round>=public.canonical_skill_slot_count(v_member.awakening_level) then continue; end if;
      select candidate.id into v_skill_id
      from public.user_skills candidate join public.canonical_skill_master master
        on master.version='2026-08-21' and master.skill_id=candidate.skill_card_id
      where candidate.user_id=p_user_id and candidate.equipped_character_id is null
        and (master.exclusive_character_id is null or master.exclusive_character_id=v_member.character_id)
        and (master.exclusive_character_id is null or not exists(
          select 1 from public.user_skills equipped join public.canonical_skill_master equipped_master
            on equipped_master.version='2026-08-21' and equipped_master.skill_id=equipped.skill_card_id
          where equipped.user_id=p_user_id and equipped.equipped_character_id=v_member.id::text
            and equipped_master.exclusive_character_id is not null))
      order by (master.exclusive_character_id=v_member.character_id) desc nulls last,coalesce(candidate.plus_val,0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.skill_id,candidate.id limit 1;
      if v_skill_id is not null then
        update public.user_skills set equipped_character_id=v_member.id::text,slot_index=v_round where id=v_skill_id;
        v_skill_count:=v_skill_count+1;
      end if;
      v_skill_id:=null;
    end loop;
  end loop;
  return v_skill_count;
end;
$$;

revoke all on function private.apply_recommended_main_skills_v1(uuid) from public,anon,authenticated;

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
  v_skill_count:=private.apply_recommended_main_skills_v1(v_user_id);
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

create or replace function public.complete_character_setup_dialog(p_action text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare
  v_user_id uuid:=auth.uid(); v_action text:=upper(coalesce(p_action,'')); v_before bigint;
  v_after bigint; v_formation jsonb; v_equipment_count integer:=0; v_skill_count integer:=0; v_existing jsonb;
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
    v_skill_count:=private.apply_recommended_main_skills_v1(v_user_id);
    v_equipment_count:=private.apply_recommended_main_equipment_v1(v_user_id);
    v_after:=public.refresh_user_power_projection(v_user_id);
    perform public.record_post_tutorial_guide_milestone(v_user_id,'first_main_loadout',
      jsonb_build_object('source','character_setup_dialog','skillCount',v_skill_count,'equipmentCount',v_equipment_count));
  else
    v_after:=v_before;
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user_id,'character_setup_dialog_consumed',jsonb_build_object(
    'action',lower(v_action),'powerBefore',v_before,'powerAfter',v_after,
    'skillCount',v_skill_count,'equipmentCount',v_equipment_count,'partyCount',coalesce(jsonb_array_length(v_formation->'character_ids'),0)
  )) on conflict(user_id,milestone) do nothing;
  return jsonb_build_object('status','success','action',lower(v_action),'powerBefore',v_before,'powerAfter',v_after,
    'skillCount',v_skill_count,'equipmentCount',v_equipment_count,'partyCount',coalesce(jsonb_array_length(v_formation->'character_ids'),0),
    'formation',v_formation);
end;
$$;

commit;
