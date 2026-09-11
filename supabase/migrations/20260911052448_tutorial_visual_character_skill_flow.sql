begin;

-- Prepare the accepted five-member party without consuming the AUTO_FORMATION
-- step. The visible Skill confirmation owns the final atomic commit.
create or replace function public.prepare_current_tutorial_formation()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_step text; v_party text[]; v_guaranteed_master text;
  v_grant jsonb; v_saved jsonb; v_defense jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  select step_id into v_step from public.tutorial_progress where user_id=v_user_id for update;
  if v_step in ('DISPATCH','FREE_INSTANT','TUTORIAL_BATTLE','RULE_GUIDE','COMPLETE','AUTHENTICATION') then
    return jsonb_build_object('status','already_advanced','tutorial_step',v_step);
  end if;
  if v_step<>'AUTO_FORMATION' then raise exception 'tutorial formation is unavailable' using errcode='23514'; end if;

  select canonical_payload into v_grant from public.user_lifetime_onboarding_grants where user_id=v_user_id;
  if v_grant is not null then
    v_guaranteed_master:=v_grant->>'guaranteed_ssr';
    select array_agg(value order by ordinality) into v_party
    from jsonb_array_elements_text(v_grant->'formation_character_ids') with ordinality picked(value,ordinality);
    if cardinality(v_party)<>5 or (select count(*) from public.user_characters where user_id=v_user_id and character_id=any(v_party))<>5 then
      raise exception 'lifetime tutorial formation cannot be restored' using errcode='23514';
    end if;
  else
    select result->>'character_id' into v_guaranteed_master
    from public.gacha_execution_history history
    cross join lateral jsonb_array_elements(coalesce(history.result_payload->'results','[]'::jsonb)) result
    where history.user_id=v_user_id and history.status='COMPLETED'
      and coalesce((history.result_payload->>'tutorial')::boolean,false)
      and coalesce((result->>'tutorial_slot')::integer,0)=10
    order by history.created_at desc limit 1;
    select array_agg(character_id order by is_guaranteed desc,is_ssr desc,created_at desc) into v_party from (
      select owned.character_id,owned.created_at,(owned.character_id=v_guaranteed_master) is_guaranteed,(master.rarity='SSR') is_ssr
      from public.user_characters owned join public.canonical_character_master master
        on master.version='2026-08-21' and master.character_id=owned.character_id
      where owned.user_id=v_user_id
      order by (owned.character_id=v_guaranteed_master) desc,(master.rarity='SSR') desc,owned.created_at desc limit 5
    ) selected;
  end if;
  if v_guaranteed_master is null then raise exception 'guaranteed tutorial gacha result is required' using errcode='23514'; end if;
  if coalesce(cardinality(v_party),0)<3 then raise exception 'three owned tutorial Characters are required' using errcode='23514'; end if;
  if v_party[1] is distinct from v_guaranteed_master then
    v_party:=array_prepend(v_guaranteed_master,array_remove(v_party,v_guaranteed_master));
    v_party:=v_party[1:5];
  end if;
  v_saved:=public.save_main_formation(v_party);
  v_defense:=public.save_pvp_defense_deck(v_party,'ATTACK_PRIORITY');
  update public.users set favorite_character_id=v_guaranteed_master where id=v_user_id;
  return jsonb_build_object('status','prepared','tutorial_step','AUTO_FORMATION','formation',v_saved || jsonb_build_object('character_ids',to_jsonb(v_party)),
    'defense',v_defense,'leader_character_id',v_guaranteed_master);
end;
$$;

-- One CTA grants (when missing) and equips the three authored tutorial Skills
-- at slot 0. The party, Skill loadout and progress edge commit together.
create or replace function public.complete_current_tutorial_formation()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_step text; v_prepared jsonb; v_guaranteed_master text;
  v_target_ids uuid[]; v_target_masters text[]; v_skill_masters text[]:=array['SKILL_022','SKILL_001','SKILL_003'];
  v_skill_names text[]:=array['重鉄パイプ大薙ぎ','ストリートパンチ','ノイズヒール'];
  v_skill_id uuid; v_index integer; v_granted boolean; v_assignments jsonb:='[]'::jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  select step_id into v_step from public.tutorial_progress where user_id=v_user_id for update;
  if v_step in ('DISPATCH','FREE_INSTANT','TUTORIAL_BATTLE','RULE_GUIDE','COMPLETE','AUTHENTICATION') then
    return jsonb_build_object('status','already_advanced','tutorial_step',v_step);
  end if;
  if v_step<>'AUTO_FORMATION' then raise exception 'tutorial formation is unavailable' using errcode='23514'; end if;
  v_prepared:=public.prepare_current_tutorial_formation();
  v_guaranteed_master:=v_prepared->>'leader_character_id';

  select array_agg(owned.id order by case when owned.character_id=v_guaranteed_master then 0 else formation.slot end),
         array_agg(owned.character_id order by case when owned.character_id=v_guaranteed_master then 0 else formation.slot end)
  into v_target_ids,v_target_masters
  from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
  where formation.user_id=v_user_id
    and (owned.character_id=v_guaranteed_master or formation.slot in (
      select candidate.slot from public.user_main_formations candidate join public.user_characters other on other.id=candidate.user_character_id
      where candidate.user_id=v_user_id and other.character_id<>v_guaranteed_master order by candidate.slot limit 2
    ));
  if coalesce(cardinality(v_target_ids),0)<>3 or v_target_masters[1] is distinct from v_guaranteed_master then
    raise exception 'tutorial Skill targets are unavailable' using errcode='23514';
  end if;

  for v_index in 1..3 loop
    if not exists(select 1 from public.canonical_skill_master where version='2026-08-21' and skill_id=v_skill_masters[v_index] and exclusive_character_id is null) then
      raise exception 'canonical tutorial Skill is unavailable' using errcode='P0002';
    end if;
    v_granted:=false;
    select id into v_skill_id from public.user_skills
    where user_id=v_user_id and skill_card_id=v_skill_masters[v_index]
    order by created_at,id limit 1 for update;
    if v_skill_id is null then
      insert into public.user_skills(user_id,skill_card_id,plus_val) values(v_user_id,v_skill_masters[v_index],0) returning id into v_skill_id;
      v_granted:=true;
    end if;
    perform public.set_character_skill(v_target_ids[v_index],v_skill_id,0);
    v_assignments:=v_assignments || jsonb_build_array(jsonb_build_object(
      'character_id',v_target_masters[v_index],'user_character_id',v_target_ids[v_index],
      'skill_id',v_skill_masters[v_index],'skill_name',v_skill_names[v_index],'slot_index',0,'granted',v_granted
    ));
    v_skill_id:=null;
  end loop;

  update public.tutorial_progress set step_id='DISPATCH',updated_at=now() where user_id=v_user_id and step_id='AUTO_FORMATION';
  return jsonb_build_object('status','advanced','tutorial_step','DISPATCH','formation',v_prepared->'formation',
    'leader_character_id',v_guaranteed_master,'skills',v_assignments,'skill_equipped',true,'skill_count',3);
end;
$$;

-- The authored Tutorial Battle uses only the three explicitly introduced
-- Characters. Its finisher keeps SPD 250 but waits until Round 2.
create or replace function public.apply_tutorial_player_snapshot(p_user_id uuid,p_snapshot jsonb)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when exists(select 1 from public.tutorial_progress where user_id=p_user_id and step_id='TUTORIAL_BATTLE') then
    coalesce((select jsonb_agg(
      jsonb_set(unit,'{stats,spd}',to_jsonb(case
        when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_022') then 250
        when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_001') then 200
        else 50 end),true)
      || case when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_022')
        then jsonb_build_object('turnAvailableFromRound',2) else '{}'::jsonb end
      order by unit_ordinality)
    from jsonb_array_elements(coalesce(p_snapshot,'[]'::jsonb)) with ordinality units(unit,unit_ordinality)
    where exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id' in ('SKILL_001','SKILL_003','SKILL_022'))),'[]'::jsonb)
  else p_snapshot end;
$$;

-- Make one enemy act between the opening strike and the heal, then leave the
-- full remaining roster in range of the Round 2 all-target finisher.
create or replace function public.apply_tutorial_enemy_snapshot(p_user_id uuid,p_player_snapshot jsonb,p_enemy_snapshot jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_finisher_atk integer; v_player_hp integer; v_player_def integer; v_target_hp integer;
begin
  if not exists(select 1 from public.tutorial_progress where user_id=p_user_id and step_id='TUTORIAL_BATTLE') then return p_enemy_snapshot; end if;
  select max((unit#>>'{stats,atk}')::integer) filter(where exists(
    select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_022')),
    max((unit#>>'{stats,hp}')::integer),max((unit#>>'{stats,def}')::integer)
  into v_finisher_atk,v_player_hp,v_player_def from jsonb_array_elements(coalesce(p_player_snapshot,'[]'::jsonb)) unit;
  v_target_hp:=greatest(1,floor(greatest(coalesce(v_finisher_atk,1),1)*0.78)::integer);
  return coalesce((select jsonb_agg(
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(unit,'{stats,hp}',to_jsonb(v_target_hp),true),
      '{stats,def}','0'::jsonb,true),'{stats,spd}',to_jsonb(case when unit_ordinality=1 then 150 else 25 end),true),
      '{stats,atk}',to_jsonb(case when unit_ordinality=1 then greatest(1,round(coalesce(v_player_hp,1)*0.45+coalesce(v_player_def,0))::integer) else 0 end),true),
      '{skills}','[]'::jsonb,true)
    order by unit_ordinality)
  from jsonb_array_elements(coalesce(p_enemy_snapshot,'[]'::jsonb)) with ordinality enemies(unit,unit_ordinality)),'[]'::jsonb);
end;
$$;

revoke all on function public.prepare_current_tutorial_formation() from public,anon;
revoke all on function public.complete_current_tutorial_formation() from public,anon;
grant execute on function public.prepare_current_tutorial_formation() to authenticated;
grant execute on function public.complete_current_tutorial_formation() to authenticated;
revoke all on function public.apply_tutorial_player_snapshot(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.apply_tutorial_enemy_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;

commit;
notify pgrst,'reload schema';
