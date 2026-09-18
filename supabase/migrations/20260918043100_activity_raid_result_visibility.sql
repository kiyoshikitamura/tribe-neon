-- Allow exact published Raid links to reopen ended results without widening Guild publications.
create or replace function private.raid_room_activity_result_visible_v1(p_room_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog'
as $function$
 select auth.uid() is not null and (
  exists(select 1 from public.social_activity_feed f where f.activity_type='RAID_BOSS_DEFEATED' and coalesce(f.display_payload->>'room_id',f.display_payload->>'roomId')=p_room_id::text)
  or exists(select 1 from public.raid_room_rescue_publications p where p.room_id=p_room_id and (
   p.channel='ACTIVITY' or (p.channel='GUILD' and exists(select 1 from public.guild_members gm where gm.user_id=auth.uid() and gm.guild_id=p.guild_id))
  ))
 )
$function$;
revoke all on function private.raid_room_activity_result_visible_v1(uuid) from public,anon,authenticated;

create or replace function public.raid_room_can_read_v1(p_room_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $function$
 select auth.uid() is not null and exists(
  select 1 from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where r.id=p_room_id and (
   (b.raid_day_key like 'DAILY:%' and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>statement_timestamp() and b.outcome_finalized_at is null)
   or (b.rotation_date=(statement_timestamp() at time zone 'Asia/Tokyo')::date and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>statement_timestamp() and b.outcome_finalized_at is null
    and exists(select 1 from private.raid_daily_targets d where d.date_jst=(statement_timestamp() at time zone 'Asia/Tokyo')::date and b.raid_variant_id in(d.first_variant_id,d.second_variant_id)))
   or r.owner_user_id=auth.uid()
   or exists(select 1 from public.raid_room_members m where m.room_id=r.id and m.user_id=auth.uid())
   or exists(select 1 from public.raid_instance_user_progress p where p.raid_boss_instance_id=r.raid_boss_instance_id and p.user_id=auth.uid() and p.finalized_battles>0)
   or private.raid_room_activity_result_visible_v1(r.id)
  )
 )
$function$;

create or replace function public.get_raid_room_participants_v1(p_room_id uuid,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $function$
declare v_items jsonb;v_count integer;v_instance uuid;v_public_result boolean:=false;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 select r.raid_boss_instance_id,
  (b.outcome_finalized_at is not null or b.status<>'ACTIVE' or b.current_hp<=0 or b.expires_at<=statement_timestamp()) and private.raid_room_activity_result_visible_v1(r.id)
 into v_instance,v_public_result from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id where r.id=p_room_id;
 if v_instance is null then raise exception 'room unavailable' using errcode='P0002';end if;
 if not v_public_result and not exists(select 1 from public.raid_rooms r where r.id=p_room_id and (
  r.owner_user_id=auth.uid() or exists(select 1 from public.raid_room_members m where m.room_id=r.id and m.user_id=auth.uid())
  or exists(select 1 from public.raid_instance_user_progress p where p.raid_boss_instance_id=r.raid_boss_instance_id and p.user_id=auth.uid() and p.finalized_battles>0))) then
  raise exception 'room unavailable' using errcode='P0002';end if;
 if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'invalid pagination' using errcode='22023';end if;
 with members as(
  select owner_user_id user_id from public.raid_rooms where id=p_room_id
  union select user_id from public.raid_room_members where room_id=p_room_id
  union select user_id from public.raid_instance_user_progress where raid_boss_instance_id=v_instance and finalized_battles>0
 ),page as(
  select m.user_id,coalesce(p.finalized_battles,0) finalized_battles from members m
  left join public.raid_instance_user_progress p on p.raid_boss_instance_id=v_instance and p.user_id=m.user_id
  order by m.user_id limit p_limit+1 offset p_offset
 ),numbered as(select *,row_number() over(order by user_id)n from page),projected as(
  select p.n,p.user_id,jsonb_build_object(
   'roomId',p_room_id,'player',jsonb_build_object('userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown')),
   'currentGuild',case when membership.guild_id is not null and current_guild.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',case when current_guild.id is null then null else jsonb_build_object('guildId',current_guild.id,'name',current_guild.name) end) end,
   'battleGuildSnapshot',case when latest.id is null or(latest.guild_id is not null and battle_guild.id is null) then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',case when latest.guild_id is null then null else jsonb_build_object('guildId',latest.guild_id,'name',battle_guild.name) end) end,
   'finalizedBattles',jsonb_build_object('status','available','value',p.finalized_battles),
   'rawDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',damage.raw_damage) end,
   'appliedDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',damage.applied_damage) end,
   'viaRescue',exists(select 1 from public.raid_room_rescue_members rr where rr.room_id=p_room_id and rr.user_id=p.user_id)
  )dto
  from numbered p join public.users u on u.id=p.user_id
  left join public.guild_members membership on membership.user_id=p.user_id left join public.guilds current_guild on current_guild.id=membership.guild_id
  left join lateral(select l.id,l.guild_id from public.raid_damage_logs l where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id order by l.created_at desc,l.id desc limit 1)latest on true
  left join public.guilds battle_guild on battle_guild.id=latest.guild_id
  left join lateral(select count(*)log_count,sum(l.raw_damage)raw_damage,sum(l.applied_damage)applied_damage from public.raid_damage_logs l where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id)damage on true
 )select coalesce(jsonb_agg(dto order by user_id)filter(where n<=p_limit),'[]'::jsonb),count(*) into v_items,v_count from projected;
 return jsonb_build_object('participants',v_items,'nextOffset',case when v_count>p_limit then p_offset+p_limit else null end);
end
$function$;
