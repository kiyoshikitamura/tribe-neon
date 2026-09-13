-- Operator-reviewed, explicit Room allowlist only. Not a migration; never bulk-apply.
-- Default is a dry run (ROLLBACK). Fill reviewed UUIDs, inspect output, then commit only
-- in the separately authorized Preview repair operation. No secrets required.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create temporary table encounter_snapshot_repair_targets(room_id uuid primary key) on commit drop;
-- insert into encounter_snapshot_repair_targets values ('<reviewed-room-uuid>');

do $repair$
declare target record; room public.raid_rooms%rowtype; boss public.raid_bosses%rowtype;
 encounter public.quest_raid_encounters%rowtype; launch_profile jsonb; launch_hp bigint;
begin
 if not exists(select 1 from encounter_snapshot_repair_targets) then
  raise exception 'Explicit reviewed Room allowlist required';
 end if;
 for target in select room_id from encounter_snapshot_repair_targets order by room_id loop
  select * into room from public.raid_rooms where id=target.room_id;
  if not found then raise exception 'Room missing: %',target.room_id;end if;
  -- Battle start/finalization locks this same Boss row before reading/writing combat.
  select * into boss from public.raid_bosses where id=room.raid_boss_instance_id for update;
  select * into encounter from public.quest_raid_encounters where room_id=room.id and status='CREATED';
  if not found or encounter.variant_id is distinct from boss.raid_variant_id
   or encounter.difficulty is distinct from room.difficulty_id
   or encounter.user_id is distinct from room.owner_user_id then
   raise exception 'Not a consistent Encounter Room: %',room.id;
  end if;
  -- A healthy/repaired Room is immutable on replay, including its original HP.
  if exists(select 1 from public.raid_room_combat_snapshots where room_id=room.id) then continue;end if;
  if boss.status is distinct from 'ACTIVE' or boss.current_hp is distinct from boss.max_hp
   or boss.current_hp is null or boss.current_hp<=0 or boss.expires_at<=clock_timestamp()
   or boss.expires_at is null or boss.outcome_finalized_at is not null
   or exists(select 1 from public.raid_room_battle_start_requests where room_id=room.id)
   or exists(select 1 from public.raid_damage_logs where raid_boss_instance_id=boss.id)
   or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=boss.id)
   or exists(select 1 from public.battle_replay_sessions where battle_mode='RAID' and
     (source_reference_id::text=boss.id::text or official_context->>'roomId'=room.id::text))
   or exists(select 1 from public.raid_room_clear_rewards where room_id=room.id)
   or exists(select 1 from public.raid_room_rescue_rewards where room_id=room.id) then
   raise exception 'Encounter Room already used or ended: %',room.id;
  end if;
  select profile into launch_profile from public.raid_room_combat_profiles
   where raid_variant_id=encounter.variant_id and difficulty_id=encounter.difficulty;
  if not found then raise exception 'Missing combat profile: %',room.id;end if;
  launch_hp:=(launch_profile->>'maxHp')::bigint;
  if launch_hp is null or launch_hp<=0 then raise exception 'Invalid combat HP';end if;
  insert into public.raid_room_combat_snapshots(room_id,profile,enemy_snapshot)
   values(room.id,launch_profile,public._raid_room_launch_enemy_snapshot_v1(launch_profile,boss.id,launch_hp));
  update public.raid_bosses set max_hp=launch_hp,current_hp=launch_hp where id=boss.id;
 end loop;
end $repair$;
select r.id,b.max_hp,b.current_hp,jsonb_array_length(s.enemy_snapshot) as enemies
from encounter_snapshot_repair_targets t join public.raid_rooms r on r.id=t.room_id
join public.raid_bosses b on b.id=r.raid_boss_instance_id
join public.raid_room_combat_snapshots s on s.room_id=r.id;
rollback;
