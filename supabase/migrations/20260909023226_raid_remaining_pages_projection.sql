begin;
-- Display-only reads. Existing creation, participation, rescue and reward authorities stay unchanged.
create function private.raid_page_entry_v1(p_room_id uuid,p_rescue_id uuid default null) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object(
  'room',jsonb_set(public.raid_room_projection_v1(r.id),'{owner,value,leaderCharacterId}',jsonb_build_object('status','available','value',u.favorite_character_id)),
  'enemy',case when b.raid_variant_id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',jsonb_build_object('variantId',b.raid_variant_id)) end,
  'ownerGuild',case when gm.guild_id is not null and g.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',case when g.id is null then null else jsonb_build_object('guildId',g.id,'name',g.name) end) end,
  'participants',jsonb_build_object('status','unknown'),
  'membership',jsonb_build_object('status','available','value',case when r.owner_user_id=auth.uid() then 'owner'
   when exists(select 1 from public.raid_room_rescue_members where room_id=r.id and user_id=auth.uid()) then 'rescue'
   when exists(select 1 from public.raid_room_members where room_id=r.id and user_id=auth.uid()) then 'member' else 'not_joined' end),
  'rescue',case when p.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',jsonb_build_object('rescueId',p.id,'source',case when p.channel='GUILD' then 'guild_chat' else 'activity' end,'scope',p.channel,'guildId',p.guild_id)) end)
 from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
 join public.users u on u.id=r.owner_user_id left join public.guild_members gm on gm.user_id=u.id left join public.guilds g on g.id=gm.guild_id
 left join public.raid_room_rescue_publications p on p.id=p_rescue_id and p.room_id=r.id where r.id=p_room_id
$$;
revoke all on function private.raid_page_entry_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.raid_browse_page_v1(p_difficulty_id text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_rows jsonb; v_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'invalid page' using errcode='22023'; end if;
 with page as (select r.id,r.created_at from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where r.difficulty_id=p_difficulty_id and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>statement_timestamp() and b.outcome_finalized_at is null
   and public.raid_room_can_read_v1(r.id) order by r.created_at desc,r.id limit 21 offset p_offset),
 numbered as(select *,row_number() over(order by created_at desc,id) n from page)
 select coalesce(jsonb_agg(private.raid_page_entry_v1(id) order by created_at desc,id) filter(where n<=20),'[]'::jsonb),count(*) into v_rows,v_count from numbered;
 return jsonb_build_object('entries',v_rows,'nextOffset',case when v_count>20 then p_offset+20 else null end);
end $$;

create function private.raid_rescue_cards_v1(p_rescue_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_rows jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_rescue_ids is null or cardinality(p_rescue_ids)>50 then raise exception 'invalid page' using errcode='22023'; end if;
 -- Ended raids remain visible on already-published links; current Guild membership still gates visibility.
 select coalesce(jsonb_agg(private.raid_page_entry_v1(p.room_id,p.id) order by p.id),'[]'::jsonb) into v_rows
 from public.raid_room_rescue_publications p where p.id=any(p_rescue_ids)
  and (p.channel='ACTIVITY' or (p.channel='GUILD' and exists(select 1 from public.guild_members where user_id=auth.uid() and guild_id=p.guild_id)))
  and public.raid_room_can_read_v1(p.room_id);
 return jsonb_build_object('entries',v_rows);
end $$;

create function private.raid_enemy_info_v1(p_variant_id text,p_difficulty_id text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_members jsonb; v_member text; v_refs jsonb; v_skills jsonb; v_map jsonb:='{}'; v_clear jsonb; v_rescue jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then raise exception 'invalid difficulty' using errcode='22023'; end if;
 select member_character_ids into v_members from public.canonical_raid_variants where raid_variant_id=p_variant_id;
 if v_members is null or jsonb_array_length(v_members)<>5 then raise exception 'enemy unavailable' using errcode='P0002'; end if;
 for v_member in select value from jsonb_array_elements_text(v_members) loop
  -- Match start_raid_room_battle_v1 (SQL260) exactly: HARD entry override, exclusive, then regular skills.
  select coalesce((select skill_loadout from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by local_affinity desc,weight desc limit 1),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb) into v_refs;
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

create function public.list_raid_room_cards_v1(p_difficulty_id text,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_browse_page_v1(p_difficulty_id,p_offset)$$;
create function public.get_raid_rescue_cards_v1(p_rescue_ids uuid[]) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_rescue_cards_v1(p_rescue_ids)$$;
create function public.get_raid_enemy_info_v1(p_variant_id text,p_difficulty_id text) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_enemy_info_v1(p_variant_id,p_difficulty_id)$$;
revoke all on function private.raid_browse_page_v1(text,integer),private.raid_rescue_cards_v1(uuid[]),private.raid_enemy_info_v1(text,text),public.list_raid_room_cards_v1(text,integer),public.get_raid_rescue_cards_v1(uuid[]),public.get_raid_enemy_info_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.raid_browse_page_v1(text,integer),private.raid_rescue_cards_v1(uuid[]),private.raid_enemy_info_v1(text,text),public.list_raid_room_cards_v1(text,integer),public.get_raid_rescue_cards_v1(uuid[]),public.get_raid_enemy_info_v1(text,text) to authenticated;
commit;
