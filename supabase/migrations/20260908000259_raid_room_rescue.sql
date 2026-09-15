-- 救援依頼・公開先別上限・参加帰属。報酬発行とランキングは変更しない。
begin;
create table public.raid_room_rescue_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into public.raid_room_rescue_settings values(true,false);
create table public.raid_room_rescue_requests (
 user_id uuid not null references public.users(id), request_id uuid not null,
 room_id uuid not null references public.raid_rooms(id), response jsonb not null,
 primary key(user_id,request_id)
);
create table public.raid_room_rescue_publications (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.raid_rooms(id),
 requester_user_id uuid not null references public.users(id), request_id uuid not null,
 channel text not null check(channel in ('ACTIVITY','GUILD')),
 guild_id uuid references public.guilds(id), ordinal integer not null check(ordinal between 1 and 3),
 created_at timestamptz not null default clock_timestamp(),
 check((channel='ACTIVITY' and guild_id is null) or (channel='GUILD' and guild_id is not null)),
 unique(room_id,channel,ordinal),unique(requester_user_id,request_id,channel)
);
create table public.raid_room_rescue_members (
 room_id uuid not null, user_id uuid not null, rescue_id uuid not null references public.raid_room_rescue_publications(id),
 joined_at timestamptz not null, primary key(room_id,user_id),
 foreign key(room_id,user_id) references public.raid_room_members(room_id,user_id)
);
alter table public.raid_room_rescue_settings enable row level security;
alter table public.raid_room_rescue_requests enable row level security;
alter table public.raid_room_rescue_publications enable row level security;
alter table public.raid_room_rescue_members enable row level security;
revoke all on public.raid_room_rescue_settings,public.raid_room_rescue_requests,public.raid_room_rescue_publications,public.raid_room_rescue_members from public,anon,authenticated,service_role;
alter table public.social_activity_feed drop constraint social_activity_feed_activity_type_check;
alter table public.social_activity_feed add constraint social_activity_feed_activity_type_check check(activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST'));
alter table public.board_posts add column raid_rescue_id uuid references public.raid_room_rescue_publications(id);

create function public.get_raid_room_rescue_v1(p_rescue_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_publication public.raid_room_rescue_publications%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_publication from public.raid_room_rescue_publications where id=p_rescue_id;
 if not found then raise exception 'rescue unavailable' using errcode='P0002';end if;
 if v_publication.channel='GUILD' and not exists(select 1 from public.guild_members where user_id=auth.uid() and guild_id=v_publication.guild_id) then
 raise exception 'guild membership required' using errcode='42501';end if;
 return jsonb_build_object('rescueId',v_publication.id,'roomId',v_publication.room_id,'channel',v_publication.channel,'guildId',v_publication.guild_id);
end $$;

create function public.get_raid_room_rescue_status_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_activity integer;v_guild integer;v_member public.raid_room_rescue_members%rowtype;v_count bigint:=0;v_damage bigint:=0;
 v_via boolean;v_enabled boolean;v_has_guild boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select count(*) filter(where channel='ACTIVITY'),count(*) filter(where channel='GUILD') into v_activity,v_guild from public.raid_room_rescue_publications where room_id=p_room_id;
 select * into v_member from public.raid_room_rescue_members where room_id=p_room_id and user_id=v_uid;
 v_via:=found;
 if v_via then
  select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
  from public.raid_damage_logs l join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=v_uid
   and b.requester_user_id=v_uid and b.source_reference_id=v_room.raid_boss_instance_id
   and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
   and b.finalization_status='FINALIZED' and b.finalized_at>=v_member.joined_at;
 end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton;
 select exists(select 1 from public.guild_members where user_id=v_uid) into v_has_guild;
 return jsonb_build_object('roomId',p_room_id,'isOwner',v_room.owner_user_id=v_uid,
 'requestEnabled',coalesce(v_enabled,false) and v_room.owner_user_id=v_uid and v_boss.status='ACTIVE' and v_boss.current_hp>0 and v_boss.expires_at>statement_timestamp() and v_boss.outcome_finalized_at is null and (v_activity<3 or (v_has_guild and v_guild<3)),
 'activityCount',v_activity,'guildCount',v_guild,'maxPerChannel',3,
 'viaRescue',v_via,'finalizedBattles',v_count,'contributionDamage',v_damage,
 'rescueGate',public._raid_room_rescue_gate_v1(v_room.difficulty_id,v_via,v_count,v_damage,coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $$;

create function public.request_raid_room_rescue_v1(p_room_id uuid,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_saved public.raid_room_rescue_requests%rowtype;v_name text;v_avatar text;v_guild_id uuid;
 v_activity integer;v_guild integer;v_enabled boolean;v_id uuid;v_publications jsonb:='[]';v_result jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_room_id is null or p_request_id is null then raise exception 'invalid rescue input' using errcode='22023';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 -- 設定→user→boss→Room: 開始/参加と同じ順序。設定の切替とも直列化する。
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 select username,avatar_url into v_name,v_avatar from public.users where id=v_uid for update;
 if not found or v_name is null then raise exception 'user unavailable' using errcode='42501';end if;
 select * into v_saved from public.raid_room_rescue_requests where user_id=v_uid and request_id=p_request_id;
 if found then
  if v_saved.room_id<>p_room_id then raise exception 'request payload mismatch' using errcode='22023';end if;
  return v_saved.response;
 end if;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 if v_room.owner_user_id<>v_uid then raise exception 'room owner required' using errcode='42501';end if;
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 perform 1 from public.raid_rooms where id=p_room_id for update;
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0 or v_boss.expires_at is null or v_boss.expires_at<=clock_timestamp() or v_boss.outcome_finalized_at is not null then raise exception 'room inactive' using errcode='22023';end if;
 select guild_id into v_guild_id from public.guild_members where user_id=v_uid for share;
 select count(*) filter(where channel='ACTIVITY'),count(*) filter(where channel='GUILD') into v_activity,v_guild from public.raid_room_rescue_publications where room_id=p_room_id;
 if v_activity>=3 and (v_guild_id is null or v_guild>=3) then raise exception 'rescue publication limit' using errcode='22023';end if;
 if v_activity<3 then
  v_activity:=v_activity+1;
  insert into public.raid_room_rescue_publications(room_id,requester_user_id,request_id,channel,ordinal)
   values(p_room_id,v_uid,p_request_id,'ACTIVITY',v_activity) returning id into v_id;
  insert into public.social_activity_feed(activity_type,actor_user_id,actor_display_name,display_payload)
   values('RAID_HELP_REQUEST',v_uid,v_name,jsonb_build_object('roomId',p_room_id,'rescueId',v_id));
  v_publications:=v_publications||jsonb_build_array(jsonb_build_object('rescueId',v_id,'channel','ACTIVITY','guildId',null));
 end if;
 if v_guild_id is not null and v_guild<3 then
  v_guild:=v_guild+1;
  insert into public.raid_room_rescue_publications(room_id,requester_user_id,request_id,channel,guild_id,ordinal)
   values(p_room_id,v_uid,p_request_id,'GUILD',v_guild_id,v_guild) returning id into v_id;
  -- システム投稿: 発言報酬/mission/KPI/human responseとchatters集計へ混入させない。
  insert into public.board_posts(title,content,author_id,user_id,author_name,author_avatar_url,target_type,target_id,is_system,raid_rescue_id)
   values('','レイドの救援をお願いします。',v_uid,null,v_name,v_avatar,'GUILD',v_guild_id,true,v_id);
  v_publications:=v_publications||jsonb_build_array(jsonb_build_object('rescueId',v_id,'channel','GUILD','guildId',v_guild_id));
 end if;
 v_result:=jsonb_build_object('roomId',p_room_id,'requestId',p_request_id,'publications',v_publications,'activityCount',v_activity,'guildCount',v_guild,'maxPerChannel',3);
 insert into public.raid_room_rescue_requests values(v_uid,p_request_id,p_room_id,v_result);
 return v_result;
end $$;

create function public.join_raid_room_rescue_v1(p_rescue_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_ref jsonb;v_room uuid;v_result jsonb;v_via boolean;v_enabled boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 perform 1 from public.users where id=v_uid for update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 v_ref:=public.get_raid_room_rescue_v1(p_rescue_id);v_room:=(v_ref->>'roomId')::uuid;
 -- 通常登録と同じuserロック下で加入。既存通常参加を救援へ昇格させない。
 v_result:=public.register_raid_room_v1(v_room);
 if v_result->>'membershipStatus'='joined' and not exists(select 1 from public.raid_rooms where id=v_room and owner_user_id=v_uid) then
  insert into public.raid_room_rescue_members(room_id,user_id,rescue_id,joined_at)
   select room_id,user_id,p_rescue_id,joined_at from public.raid_room_members where room_id=v_room and user_id=v_uid;
 end if;
 select exists(select 1 from public.raid_room_rescue_members where room_id=v_room and user_id=v_uid) into v_via;
 return v_result||jsonb_build_object('viaRescue',v_via);
end $$;
revoke all on function public.get_raid_room_rescue_v1(uuid),public.get_raid_room_rescue_status_v1(uuid),public.request_raid_room_rescue_v1(uuid,uuid),public.join_raid_room_rescue_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_rescue_v1(uuid),public.get_raid_room_rescue_status_v1(uuid),public.request_raid_room_rescue_v1(uuid,uuid),public.join_raid_room_rescue_v1(uuid) to authenticated;
commit;
notify pgrst, 'reload schema';
