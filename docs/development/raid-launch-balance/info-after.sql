create or replace function private.raid_enemy_info_v1(p_variant_id text,p_difficulty_id text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_members jsonb; v_member text; v_refs jsonb; v_skills jsonb; v_map jsonb:='{}'; v_clear jsonb; v_rescue jsonb; v_launch jsonb; v_unit jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then raise exception 'invalid difficulty' using errcode='22023'; end if;
 select profile into v_launch from public.raid_room_combat_profiles where raid_variant_id=p_variant_id and difficulty_id=p_difficulty_id;
 if found then
 select jsonb_agg(x->>'characterId' order by (x->>'slot')::integer) into v_members from jsonb_array_elements(v_launch->'members') x;
 else
 select member_character_ids into v_members from public.canonical_raid_variants where raid_variant_id=p_variant_id;
 end if;
 if v_members is null or jsonb_array_length(v_members)<>5 then raise exception 'enemy unavailable' using errcode='P0002'; end if;
 for v_member in select value from jsonb_array_elements_text(v_members) loop
  -- Match start_raid_room_battle_v1 (SQL260) exactly: HARD entry override, exclusive, then regular skills.
  if v_launch is not null then
   select x into v_unit from jsonb_array_elements(v_launch->'members') x where x->>'characterId'=v_member;
   select jsonb_agg(x->>'skillId' order by n) into v_refs from jsonb_array_elements(v_unit->'skills') with ordinality e(x,n);
  else
  select coalesce((select skill_loadout from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by local_affinity desc,weight desc limit 1),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb) into v_refs;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name) order by x.ordinality),'[]'::jsonb) into v_skills
   from jsonb_array_elements_text(v_refs) with ordinality x(id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.id;
  if jsonb_array_length(v_refs)<>jsonb_array_length(v_skills) then raise exception 'enemy skills unavailable' using errcode='P0002'; end if;
  v_map:=v_map||jsonb_build_object(v_member,v_skills);
 end loop;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_clear from public.raid_room_clear_reward_rules r left join public.raid_room_clear_reward_items i on i.difficulty=r.difficulty where r.difficulty=p_difficulty_id group by r.enabled;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_rescue from public.raid_room_rescue_reward_rules r left join public.raid_room_rescue_reward_items i on i.difficulty=r.difficulty where r.difficulty=p_difficulty_id group by r.enabled;
 return jsonb_build_object('variantId',p_variant_id,'memberCharacterIds',v_members,'skillsByCharacterId',v_map,'clearPlan',coalesce(v_clear,'{"status":"unconfigured","items":[]}'),'rescuePlan',coalesce(v_rescue,'{"status":"unconfigured","items":[]}'));
end $$;
