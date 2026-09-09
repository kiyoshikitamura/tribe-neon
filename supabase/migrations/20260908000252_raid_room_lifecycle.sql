begin;

-- 公開生成・参加APIではない。資格・費用を検証する将来のwriterだけが利用する。
create table if not exists public.raid_room_lifecycle_rules (
  difficulty text primary key check (difficulty in ('beginner','intermediate','advanced','expert')),
  max_active_rooms integer not null check (max_active_rooms > 0),
  member_capacity integer not null check (member_capacity > 0),
  duration_hours integer not null check (duration_hours > 0)
);
alter table public.raid_room_lifecycle_rules enable row level security;
revoke all on table public.raid_room_lifecycle_rules from public, anon, authenticated, service_role;
insert into public.raid_room_lifecycle_rules values
 ('beginner',10,20,24),('intermediate',10,20,24),('advanced',10,20,24),('expert',5,20,24)
on conflict (difficulty) do nothing;
-- service_roleの既定権限も除去し、直接更新で登録処理を迂回させない。
revoke all on table public.raid_rooms, public.raid_room_members from public, anon, authenticated, service_role;

create or replace function public._raid_room_register_v1(
 p_instance_id uuid, p_owner_user_id uuid, p_difficulty_id text
) returns jsonb language plpgsql volatile security invoker set search_path = pg_catalog
as $$
declare
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_boss public.raid_bosses%rowtype;
 v_room public.raid_rooms%rowtype;
 v_now timestamptz;
 v_count bigint;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_instance_id is null or p_owner_user_id is null or p_difficulty_id is null then
   raise exception 'invalid registration input' using errcode='22023';
 end if;
 -- 同難度の枠確認と登録を直列化。待機後の別SQLで最新の確定行を数える。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 select * into v_boss from public.raid_bosses where id=p_instance_id for update;
 if not found then raise exception 'instance unavailable' using errcode='P0002'; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=p_instance_id;
 if found then
   if v_room.owner_user_id<>p_owner_user_id or v_room.difficulty_id<>p_difficulty_id then
     raise exception 'registration conflict' using errcode='22023';
   end if;
   -- 終了後の再送も登録済み事実のみ返す。再開・再参加を許可しない。
   return jsonb_build_object('roomId',v_room.id,'status','already_registered');
 end if;
 v_now := clock_timestamp();
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0
   or v_boss.expires_at is null or v_boss.expires_at<=v_now
   or v_boss.outcome_finalized_at is not null then
   raise exception 'instance inactive' using errcode='22023';
 end if;
 if v_boss.spawned_at is null or not isfinite(v_boss.spawned_at) or v_boss.spawned_at>v_now
   or v_boss.expires_at is distinct from v_boss.spawned_at + make_interval(hours=>v_rule.duration_hours) then
   raise exception 'invalid instance lifetime' using errcode='22023';
 end if;
 if v_boss.current_hp is distinct from v_boss.max_hp
   or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id)
   or exists(select 1 from public.raid_damage_logs where raid_boss_instance_id=p_instance_id) then
   raise exception 'instance already used' using errcode='22023';
 end if;
 select count(*) into v_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
 where r.difficulty_id=p_difficulty_id and b.status='ACTIVE' and b.current_hp>0
   and b.expires_at>v_now and b.outcome_finalized_at is null;
 if v_count>=v_rule.max_active_rooms then raise exception 'active room limit reached' using errcode='22023'; end if;
 insert into public.raid_rooms(raid_boss_instance_id,owner_user_id,difficulty_id,created_at)
 values(p_instance_id,p_owner_user_id,p_difficulty_id,v_boss.spawned_at) returning * into v_room;
 insert into public.raid_room_members(room_id,user_id,joined_at) values(v_room.id,p_owner_user_id,v_now);
 return jsonb_build_object('roomId',v_room.id,'status','registered');
end;
$$;

create or replace function public._raid_room_add_member_v1(p_room_id uuid,p_user_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = pg_catalog
as $$
declare
 v_room public.raid_rooms%rowtype;
 v_boss public.raid_bosses%rowtype;
 v_capacity integer;
 v_count bigint;
 v_now timestamptz;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_room_id is null or p_user_id is null then raise exception 'invalid membership input' using errcode='22023'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002'; end if;
 -- 戦闘確定と同じInstanceを先にロックし、終了判定と定員判定を直列化する。
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if not found then raise exception 'instance unavailable' using errcode='P0002'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id for update;
 if not found or v_room.raid_boss_instance_id<>v_boss.id then
   raise exception 'room changed' using errcode='40001';
 end if;
 if v_room.owner_user_id=p_user_id or exists(
   select 1 from public.raid_room_members where room_id=p_room_id and user_id=p_user_id
 ) then
   return jsonb_build_object('roomId',p_room_id,'userId',p_user_id,'status','already_joined');
 end if;
 v_now := clock_timestamp();
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0
   or v_boss.expires_at is null or v_boss.expires_at<=v_now or v_boss.outcome_finalized_at is not null then
   raise exception 'room inactive' using errcode='22023';
 end if;
 select member_capacity into v_capacity from public.raid_room_lifecycle_rules where difficulty=v_room.difficulty_id;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 参照RPCと同じ集合。旧確定参加者が存在する場合も人数から脱落させない。
 select count(*) into v_count from (
   select v_room.owner_user_id as user_id
   union select user_id from public.raid_room_members where room_id=p_room_id
   union select user_id from public.raid_instance_user_progress
     where raid_boss_instance_id=v_boss.id and finalized_battles>0
 ) participants;
 if v_count>=v_capacity and not exists(
   select 1 from public.raid_instance_user_progress
   where raid_boss_instance_id=v_boss.id and user_id=p_user_id and finalized_battles>0
 ) then raise exception 'room full' using errcode='22023'; end if;
 insert into public.raid_room_members(room_id,user_id,joined_at) values(p_room_id,p_user_id,v_now);
 return jsonb_build_object('roomId',p_room_id,'userId',p_user_id,'status','joined');
end;
$$;

revoke all on function public._raid_room_register_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public._raid_room_add_member_v1(uuid,uuid) from public,anon,authenticated,service_role;
commit;
