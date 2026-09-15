begin;

-- Post-tutorial guide milestones are lifetime, server-authoritative facts.
-- Daily free claims remain a separate, resettable entitlement projection.
create or replace function public.record_post_tutorial_guide_milestone(
  p_user_id uuid,
  p_milestone text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  if p_milestone not in (
    'first_free_skill_ten_pull',
    'first_free_equipment_ten_pull',
    'first_main_loadout'
  ) then
    raise exception 'unsupported post-tutorial guide milestone' using errcode = '22023';
  end if;

  insert into public.user_funnel_milestones(user_id, milestone, metadata)
  values(p_user_id, p_milestone, coalesce(p_metadata, '{}'::jsonb))
  on conflict(user_id, milestone) do nothing
  returning true into v_inserted;
  return coalesce(v_inserted, false);
end;
$$;

create or replace function public.on_post_tutorial_free_asset_gacha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_milestone text;
begin
  if new.status <> 'COMPLETED'
     or new.payment_source <> 'free'
     or new.pull_count <> 10
     or new.gacha_id not in ('SKILL_NORMAL', 'EQUIP_NORMAL') then
    return new;
  end if;
  if not exists (
    select 1 from public.tutorial_progress
    where user_id = new.user_id
      and (
        step_id = 'AUTHENTICATION'
        or (step_id = 'COMPLETE' and authentication_pending = true)
      )
  ) then
    return new;
  end if;

  v_milestone := case new.gacha_id
    when 'SKILL_NORMAL' then 'first_free_skill_ten_pull'
    else 'first_free_equipment_ten_pull'
  end;
  perform public.record_post_tutorial_guide_milestone(
    new.user_id,
    v_milestone,
    jsonb_build_object('gachaId', new.gacha_id, 'requestId', new.request_id, 'pullCount', new.pull_count)
  );
  return new;
end;
$$;

drop trigger if exists post_tutorial_free_asset_gacha_trigger on public.gacha_execution_history;
create trigger post_tutorial_free_asset_gacha_trigger
after insert or update of status on public.gacha_execution_history
for each row execute function public.on_post_tutorial_free_asset_gacha();

-- Reconcile valid lifetime results without consulting today's free entitlement.
insert into public.user_funnel_milestones(user_id, milestone, metadata)
select distinct on (history.user_id, history.gacha_id)
  history.user_id,
  case history.gacha_id
    when 'SKILL_NORMAL' then 'first_free_skill_ten_pull'
    else 'first_free_equipment_ten_pull'
  end,
  jsonb_build_object('gachaId', history.gacha_id, 'requestId', history.request_id, 'pullCount', history.pull_count, 'reconciled', true)
from public.gacha_execution_history history
where history.status = 'COMPLETED'
  and history.payment_source = 'free'
  and history.pull_count = 10
  and history.gacha_id in ('SKILL_NORMAL', 'EQUIP_NORMAL')
  and exists (
    select 1 from public.tutorial_progress progress
    where progress.user_id = history.user_id
      and (
        progress.step_id = 'AUTHENTICATION'
        or (progress.step_id = 'COMPLETE' and progress.authentication_pending = true)
      )
  )
order by history.user_id, history.gacha_id, history.created_at
on conflict(user_id, milestone) do nothing;

-- Canonical auto formation uses the same HP + ATK + DEF authority as Rankings.
create or replace function public.save_recommended_main_formation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_party text[];
  v_saved jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select coalesce(array_agg(ranked.character_id order by ranked.power desc, ranked.character_id, ranked.id), '{}'::text[])
  into v_party
  from (
    select owned.id, owned.character_id, public.calculate_user_character_power(v_user_id, owned.id) power
    from public.user_characters owned
    where owned.user_id = v_user_id
    order by power desc, owned.character_id, owned.id
    limit 5
  ) ranked;
  if cardinality(v_party) = 0 then raise exception 'owned character required' using errcode = 'P0002'; end if;
  v_saved := public.save_main_formation(v_party);
  return v_saved || jsonb_build_object('character_ids', to_jsonb(v_party));
end;
$$;

-- Allocate the Main Formation as one party-wide transaction. Items worn by a
-- non-party Character never enter the candidate pool.
create or replace function public.apply_recommended_main_loadout()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_party_count integer;
  v_member record;
  v_round integer;
  v_slot integer;
  v_skill_id uuid;
  v_equipment_id uuid;
  v_skill_count integer := 0;
  v_equipment_count integer := 0;
  v_total_power bigint;
  v_results jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select count(*) into v_party_count from public.user_main_formations where user_id = v_user_id;
  if v_party_count <> 5 then raise exception 'Main Formation must contain five Characters' using errcode = '23514'; end if;

  perform 1 from public.user_main_formations where user_id = v_user_id order by slot for update;
  perform 1 from public.user_skills where user_id = v_user_id for update;
  perform 1 from public.user_equipments where user_id = v_user_id for update;

  update public.user_skills
  set equipped_character_id = null, slot_index = null
  where user_id = v_user_id
    and equipped_character_id in (
      select formation.user_character_id::text from public.user_main_formations formation where formation.user_id = v_user_id
    );
  update public.user_equipments
  set equipped_character_id = null, slot_index = null
  where user_id = v_user_id
    and equipped_character_id in (
      select formation.user_character_id::text from public.user_main_formations formation where formation.user_id = v_user_id
    );

  -- One slot per party member per pass prevents the first Character from
  -- consuming the entire shared inventory before later members are considered.
  for v_round in 0..5 loop
    for v_member in
      select formation.slot, owned.id, owned.character_id, owned.awakening_level
      from public.user_main_formations formation
      join public.user_characters owned on owned.id = formation.user_character_id
      where formation.user_id = v_user_id
      order by formation.slot
    loop
      if v_round >= public.canonical_skill_slot_count(v_member.awakening_level) then continue; end if;
      select candidate.id into v_skill_id
      from public.user_skills candidate
      join public.canonical_skill_master master
        on master.version = '2026-08-21' and master.skill_id = candidate.skill_card_id
      where candidate.user_id = v_user_id
        and candidate.equipped_character_id is null
        and (master.exclusive_character_id is null or master.exclusive_character_id = v_member.character_id)
        and (master.exclusive_character_id is null or not exists (
          select 1 from public.user_skills equipped
          join public.canonical_skill_master equipped_master
            on equipped_master.version = '2026-08-21' and equipped_master.skill_id = equipped.skill_card_id
          where equipped.user_id = v_user_id
            and equipped.equipped_character_id = v_member.id::text
            and equipped_master.exclusive_character_id is not null
        ))
      order by
        (master.exclusive_character_id = v_member.character_id) desc,
        coalesce(candidate.plus_val, 0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.skill_id,
        candidate.id
      limit 1;
      if v_skill_id is not null then
        update public.user_skills set equipped_character_id = v_member.id::text, slot_index = v_round where id = v_skill_id;
        v_skill_count := v_skill_count + 1;
      end if;
      v_skill_id := null;
    end loop;
  end loop;

  for v_slot in 0..6 loop
    for v_member in
      select formation.slot, owned.id, owned.character_id
      from public.user_main_formations formation
      join public.user_characters owned on owned.id = formation.user_character_id
      where formation.user_id = v_user_id
      order by case when mod(v_slot, 2) = 0 then formation.slot else 6 - formation.slot end
    loop
      select candidate.id into v_equipment_id
      from public.user_equipments candidate
      join public.canonical_equipment_master master
        on master.version = '2026-08-21'
       and master.equipment_id = coalesce(nullif(candidate.equipment_id, ''), candidate.equipment_master_id)
      where candidate.user_id = v_user_id
        and candidate.equipped_character_id is null
        and master.category = case v_slot
          when 0 then 'WEAPON' when 1 then 'WEAPON' when 2 then 'HEAD'
          when 3 then 'BODY' when 4 then 'LEGS' else 'ACCESSORY' end
        and (master.exclusive_character_id is null or master.exclusive_character_id = v_member.character_id)
      order by
        (master.exclusive_character_id = v_member.character_id) desc,
        (
          public.canonical_equipment_flat_stat((master.base_stats->>'hp')::integer, coalesce(candidate.level, 1), coalesce(candidate.plus_val, 0))
          + public.canonical_equipment_flat_stat((master.base_stats->>'atk')::integer, coalesce(candidate.level, 1), coalesce(candidate.plus_val, 0))
          + public.canonical_equipment_flat_stat((master.base_stats->>'def')::integer, coalesce(candidate.level, 1), coalesce(candidate.plus_val, 0))
        ) desc,
        coalesce(candidate.level, 1) desc,
        coalesce(candidate.plus_val, 0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.equipment_id,
        candidate.id
      limit 1;
      if v_equipment_id is not null then
        update public.user_equipments set equipped_character_id = v_member.id::text, slot_index = v_slot where id = v_equipment_id;
        v_equipment_count := v_equipment_count + 1;
      end if;
      v_equipment_id := null;
    end loop;
  end loop;

  if v_skill_count = 0 or v_equipment_count = 0 then
    raise exception 'Main Formation requires at least one Skill and one Equipment' using errcode = '23514';
  end if;

  perform public.record_post_tutorial_guide_milestone(
    v_user_id,
    'first_main_loadout',
    jsonb_build_object('skillCount', v_skill_count, 'equipmentCount', v_equipment_count)
  );
  v_total_power := public.refresh_user_power_projection(v_user_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'characterId', owned.character_id,
    'userCharacterId', owned.id,
    'skillCount', (select count(*) from public.user_skills skill where skill.user_id = v_user_id and skill.equipped_character_id = owned.id::text),
    'equipmentCount', (select count(*) from public.user_equipments equipment where equipment.user_id = v_user_id and equipment.equipped_character_id = owned.id::text)
  ) order by formation.slot), '[]'::jsonb)
  into v_results
  from public.user_main_formations formation
  join public.user_characters owned on owned.id = formation.user_character_id
  where formation.user_id = v_user_id;

  return jsonb_build_object(
    'status', 'success',
    'skillCount', v_skill_count,
    'equipmentCount', v_equipment_count,
    'totalPower', v_total_power,
    'characters', v_results
  );
end;
$$;

revoke all on function public.record_post_tutorial_guide_milestone(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.on_post_tutorial_free_asset_gacha() from public, anon, authenticated;
revoke all on function public.save_recommended_main_formation() from public, anon;
revoke all on function public.apply_recommended_main_loadout() from public, anon;
grant execute on function public.save_recommended_main_formation() to authenticated;
grant execute on function public.apply_recommended_main_loadout() to authenticated;

commit;
notify pgrst, 'reload schema';
