-- Preview only. All fixture adjustments are rolled back; run after candidate migration.
begin;
set local statement_timeout='30s';
create temp table reward_v2_evidence(result text);
do $$
declare v_user uuid;v_rooms uuid[];v_room uuid;v_difficulty text;v_i integer;v_count integer;v_before bigint;v_after bigint;v_daily jsonb;v_expected integer;
begin
 if (select jsonb_object_agg(difficulty,chance_bp) from public.raid_daily_clear_bonus_rules)
 <> '{"beginner":3000,"intermediate":5000,"advanced":10000,"expert":10000}'::jsonb then raise exception 'Daily probability master mismatch';end if;
 if exists(select 1 from public.raid_room_clear_reward_rules where difficulty in ('advanced','expert') and (enabled or minimum_contribution_damage is not null)) then raise exception 'Unfixed gate was activated';end if;
 select user_id into v_user from (
  select l.user_id,count(distinct r.id) n from public.raid_rooms r
  join public.raid_damage_logs l on l.raid_boss_instance_id=r.raid_boss_instance_id
  join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  where b.finalization_status='FINALIZED' and b.finalization_result->'lateFinalization'='false'::jsonb
  group by l.user_id having count(distinct r.id)>=2 order by count(distinct r.id) desc limit 1
 ) q;
 if v_user is null then raise exception 'Need two real finalized Room fixtures for same user';end if;
 select array_agg(id) into v_rooms from (
  select distinct r.id from public.raid_rooms r
  join public.raid_damage_logs l on l.raid_boss_instance_id=r.raid_boss_instance_id
  join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  where l.user_id=v_user and b.finalization_status='FINALIZED' and b.finalization_result->'lateFinalization'='false'::jsonb
  limit 2
 ) q;
 foreach v_difficulty in array array['beginner','intermediate','advanced','expert'] loop
  delete from public.raid_room_clear_reward_grants where room_id=any(v_rooms);
  delete from public.raid_room_clear_rewards where room_id=any(v_rooms);
  delete from public.raid_daily_clear_bonus_ledger where user_id=v_user;
  delete from public.gameplay_reward_delivery_ledger where source_kind='RAID_ROOM_CLEAR' and (source_key=any(select unnest(v_rooms)::text) or source_key like 'DAILY_CLEAR_BONUS:%');
  update public.raid_rooms set difficulty_id=v_difficulty where id=any(v_rooms);
  update public.raid_bosses set outcome='DEFEAT_SUCCESS',status='CLEARED',current_hp=0,
   cleared_at='2026-09-14 15:30:00+00',outcome_finalized_at='2026-09-14 15:30:00+00'
   where id in (select raid_boss_instance_id from public.raid_rooms where id=any(v_rooms));
  if v_difficulty in ('advanced','expert') then
   if public._issue_raid_room_clear_rewards_v1(v_rooms[1])<>0 then raise exception 'Pending high difficulty issued rewards';end if;
   -- Test-only fixture unlock, NOT a proposed contribution value.
   update public.raid_room_clear_reward_rules set enabled=true,minimum_contribution_damage=0 where difficulty=v_difficulty;
  end if;
  -- Deterministic hit fixture; actual probability values were asserted above.
  update public.raid_daily_clear_bonus_rules set chance_bp=10000 where difficulty=v_difficulty;
  select coalesce(sum(quantity),0) into v_before from public.user_items where user_id=v_user and item_id='SKILL_MANUAL';
  perform public._issue_raid_room_clear_rewards_v1(v_rooms[1]);
  perform public._issue_raid_room_clear_rewards_v1(v_rooms[1]);
  perform public._issue_raid_room_clear_rewards_v1(v_rooms[2]);
  select coalesce(sum(quantity),0) into v_after from public.user_items where user_id=v_user and item_id='SKILL_MANUAL';
  v_expected:=case v_difficulty when 'advanced' then 2 when 'expert' then 3 else 1 end;
  if v_after-v_before<>2*v_expected then raise exception 'Instance repeat/new-instance mismatch %: %',v_difficulty,v_after-v_before;end if;
  if (select count(*) from public.raid_daily_clear_bonus_ledger where user_id=v_user and difficulty=v_difficulty)<>1 then raise exception 'Daily not once per difficulty';end if;
  select to_jsonb(d) into v_daily from public.raid_daily_clear_bonus_ledger d where user_id=v_user and difficulty=v_difficulty;
  if v_daily->>'raid_day_key'<>'2026-09-15' then raise exception 'JST clear day mismatch';end if;
  if jsonb_array_length(v_daily->'items')<>(case when v_difficulty='expert' then 3 else 1 end) then raise exception 'Daily item count mismatch';end if;
  if exists(select 1 from jsonb_array_elements(v_daily->'items') i where i->>'itemId' like '%RANDOM%') then raise exception 'Unresolved random item persisted';end if;
  -- New day can roll again (helper still requires a real instance-clear ledger).
  update public.raid_bosses set cleared_at='2026-09-15 15:30:00+00' where id=(select raid_boss_instance_id from public.raid_rooms where id=v_rooms[2]);
  perform public._issue_raid_daily_clear_bonus_v2(v_rooms[2],v_user);
  if (select count(*) from public.raid_daily_clear_bonus_ledger where user_id=v_user and difficulty=v_difficulty)<>2 then raise exception 'Next JST day did not roll';end if;
 end loop;
 -- A miss freezes the daily attempt, even if a later retry would win.
 delete from public.raid_daily_clear_bonus_ledger where user_id=v_user;
 update public.raid_daily_clear_bonus_rules set chance_bp=0 where difficulty='expert';
 perform public._issue_raid_daily_clear_bonus_v2(v_rooms[1],v_user);
 select to_jsonb(d) into v_daily from public.raid_daily_clear_bonus_ledger d where user_id=v_user;
 update public.raid_daily_clear_bonus_rules set chance_bp=10000 where difficulty='expert';
 perform public._issue_raid_daily_clear_bonus_v2(v_rooms[1],v_user);
 if (select to_jsonb(d) from public.raid_daily_clear_bonus_ledger d where user_id=v_user) is distinct from v_daily or (v_daily->>'won')::boolean then raise exception 'Daily miss rerolled';end if;
 -- Invalid delivery rolls back the daily claim too; a retry is not stranded.
 delete from public.raid_daily_clear_bonus_ledger where user_id=v_user;
 update public.raid_daily_clear_bonus_rules set items='[{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":0}]' where difficulty='expert';
 begin
  perform public._issue_raid_daily_clear_bonus_v2(v_rooms[1],v_user);
  raise exception 'Expected invalid delivery failure';
 exception when others then
  if sqlerrm='Expected invalid delivery failure' then raise;end if;
 end;
 if exists(select 1 from public.raid_daily_clear_bonus_ledger where user_id=v_user) then raise exception 'Failed delivery stranded claim';end if;
 if has_function_privilege('authenticated','public._issue_raid_daily_clear_bonus_v2(uuid,uuid)','EXECUTE') then raise exception 'Internal grant publicly callable';end if;
 insert into reward_v2_evidence values('PASS: four difficulty quantities, separate instance/retry, daily once/hit/miss/random resolution, JST boundary, pending high gate, internal RPC privilege');
end $$;
select * from reward_v2_evidence;
rollback;
