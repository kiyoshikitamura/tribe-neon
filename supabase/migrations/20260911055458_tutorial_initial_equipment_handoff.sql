-- Keep the existing initial-equipment authority inside the same atomic handoff
-- that equips the three Tutorial Skills and advances AUTO_FORMATION -> DISPATCH.
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

  perform private.ensure_initial_equipment_v1();
  update public.tutorial_progress set step_id='DISPATCH',updated_at=now() where user_id=v_user_id and step_id='AUTO_FORMATION';
  return jsonb_build_object('status','advanced','tutorial_step','DISPATCH','formation',v_prepared->'formation',
    'leader_character_id',v_guaranteed_master,'skills',v_assignments,'skill_equipped',true,'skill_count',3);
end;
$$;

revoke all on function public.complete_current_tutorial_formation() from public,anon;
grant execute on function public.complete_current_tutorial_formation() to authenticated;
