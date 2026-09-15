begin;
-- Read-only supplement: no participation, reward issuance, expiry or balance changes.
create function private.raid_room_display_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 v_uid uuid:=auth.uid(); v_room public.raid_rooms%rowtype;
 v_joined boolean; v_member text; v_leaders jsonb; v_guild jsonb;
 v_clear jsonb; v_rescue jsonb;
begin
 if v_uid is null or not exists(select 1 from public.users where id=v_uid) then
  raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found or not public.raid_room_can_read_v1(p_room_id) then
  raise exception 'room unavailable' using errcode='P0002'; end if;
 v_joined:=v_room.owner_user_id=v_uid or exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid)
  or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and user_id=v_uid and finalized_battles>0);
 v_member:=case when v_room.owner_user_id=v_uid then 'owner'
  when exists(select 1 from public.raid_room_rescue_members where room_id=p_room_id and user_id=v_uid) then 'rescue'
  when v_joined then 'member' else 'not_joined' end;
 -- Same participant privacy as SQL255. An outsider receives the public owner only.
 with members as (
  select v_room.owner_user_id as user_id
  union select user_id from public.raid_room_members where room_id=p_room_id and v_joined
  union select user_id from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and finalized_battles>0 and v_joined
 ), page as (select user_id from members order by user_id limit 20), ids as (
  select user_id from page union select v_room.owner_user_id
 ) select coalesce(jsonb_object_agg(u.id::text,u.favorite_character_id),'{}'::jsonb) into v_leaders
 from ids join public.users u on u.id=ids.user_id;
 select case when m.guild_id is not null and g.id is null then jsonb_build_object('status','unknown')
  else jsonb_build_object('status','available','value',case when g.id is null then null
   else jsonb_build_object('guildId',g.id,'name',g.name) end) end into v_guild
 from (select v_room.owner_user_id as id) owner
 left join public.guild_members m on m.user_id=owner.id left join public.guilds g on g.id=m.guild_id;
 -- Plans are read from current configuration, never copied into the issued Present collection.
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,
  'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_clear from public.raid_room_clear_reward_rules r left join public.raid_room_clear_reward_items i on i.difficulty=r.difficulty
 where r.difficulty=v_room.difficulty_id group by r.enabled;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,
  'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_rescue from public.raid_room_rescue_reward_rules r left join public.raid_room_rescue_reward_items i on i.difficulty=r.difficulty
 where r.difficulty=v_room.difficulty_id group by r.enabled;
 return jsonb_build_object('roomId',p_room_id,'ownerGuild',v_guild,'leaderCharacterIds',v_leaders,'membership',v_member,
  'clearPlan',coalesce(v_clear,'{"status":"unconfigured","items":[]}'::jsonb),
  'rescuePlan',coalesce(v_rescue,'{"status":"unconfigured","items":[]}'::jsonb));
end $$;
create function public.get_raid_room_display_v1(p_room_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_room_display_v1(p_room_id)$$;
revoke all on function private.raid_room_display_v1(uuid),public.get_raid_room_display_v1(uuid) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.raid_room_display_v1(uuid),public.get_raid_room_display_v1(uuid) to authenticated;
commit;
