begin;
set local statement_timeout='45s';
do $test$
declare
 fixture public.battle_replay_sessions%rowtype;
 receipt public.raid_room_battle_start_requests%rowtype;
 rp public.battle_replay_sessions%rowtype;
 sr public.raid_room_battle_start_requests%rowtype;
 rid uuid; uid uuid; boss uuid; replay_id uuid; first_id uuid; late_id uuid;
 result jsonb; replay_result jsonb; before_mission integer;
 data jsonb:=jsonb_build_object('winner','PLAYER','rounds',1,'events','[]'::jsonb,'playerRawDamage',1,'enemyRawDamage',0);
 gate jsonb; issued integer; initial_rule bigint; grants_before bigint; receipts_before bigint;
begin
 select s.* into fixture from public.battle_replay_sessions s
 join public.raid_room_battle_start_requests q on q.replay_session_id=s.id
 join public.raid_rooms r on r.id=q.room_id and r.raid_boss_instance_id=s.source_reference_id
 where s.battle_mode='RAID' and s.resolution_authority='RAID_SERVER'
 order by s.created_at desc limit 1;
 if fixture.id is null then raise exception 'official Room fixture missing'; end if;
 select * into receipt from public.raid_room_battle_start_requests where replay_session_id=fixture.id limit 1;
 rid:=receipt.room_id;uid:=fixture.requester_user_id;boss:=fixture.source_reference_id;
 -- Service-side finalizer context, matching the official privileged finalize contract.
 perform set_config('request.jwt.claim.sub','',true);
 update public.raid_bosses set current_hp=100000000,expires_at=clock_timestamp()+interval '1 day',status='ACTIVE',
 outcome=null,outcome_finalized_at=null,cleared_at=null where id=boss;
 delete from public.raid_damage_logs where raid_boss_instance_id=boss and user_id=uid;
 delete from public.raid_instance_user_progress where raid_boss_instance_id=boss and user_id=uid;
 insert into public.raid_room_members(room_id,user_id) values(rid,uid) on conflict do nothing;
 -- Existing canonical Mission rows; no master substitution.
 insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
 select uid,id,0,0,'PROGRESS' from public.missions
 where id in ('MIS_D_005','MIS_N_B004','MIS_N_B005','MIS_N_P009','MIS_N_B006')
 and not exists(select 1 from public.user_missions um where um.user_id=uid and um.mission_id=public.missions.id);
 update public.user_missions set current_progress=0,progress_val=0,status='PROGRESS',claimed_at=null
 where user_id=uid and mission_id in ('MIS_D_005','MIS_N_B004','MIS_N_B005','MIS_N_P009','MIS_N_B006');
 for i in 1..50 loop
  replay_id:=gen_random_uuid();
  rp:=fixture;rp.id:=replay_id;rp.status:='PENDING';rp.result:=null;rp.resolved_at:=null;
  rp.finalization_status:='PENDING';rp.finalized_at:=null;rp.finalization_result:=null;
  rp.official_context:=fixture.official_context||jsonb_build_object('startedAt',clock_timestamp(),'roomId',rid,'raidRoomVersion',1);
  insert into public.battle_replay_sessions select rp.*;
  sr:=receipt;sr.request_id:=gen_random_uuid();sr.replay_session_id:=replay_id;
  sr.response:=receipt.response||jsonb_build_object('replay_session_id',replay_id,'room_id',rid);
  insert into public.raid_room_battle_start_requests select sr.*;
  result:=public.finalize_raid_room_battle_v1(replay_id,data);
  replay_result:=public.finalize_raid_room_battle_v1(replay_id,data);
  if result<>replay_result then raise exception 'retry result changed'; end if;
  if (select finalized_battles from public.raid_instance_user_progress where raid_boss_instance_id=boss and user_id=uid)<>i then
   raise exception 'finalized counter mismatch at %',i; end if;
  if (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B005')<>i then
   raise exception '50 battle Mission mismatch at %',i; end if;
  if (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B004')<>least(i,10) then
   raise exception '10 battle Mission mismatch at %',i; end if;
  if (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_D_005')<>1 then raise exception 'daily Raid not 1'; end if;
 end loop;
 if (select status from public.user_missions where user_id=uid and mission_id='MIS_N_B004')<>'CLEAR'
 or (select status from public.user_missions where user_id=uid and mission_id='MIS_N_B005')<>'CLEAR' then raise exception 'cumulative Mission did not clear'; end if;
 -- Re-open only the 50 target fixture to observe late progress (rather than saturating).
 update public.user_missions set current_progress=0,progress_val=0,status='PROGRESS'
 where user_id=uid and mission_id='MIS_N_B005';
 update public.raid_bosses set expires_at=clock_timestamp()-interval '1 hour' where id=boss;
 late_id:=gen_random_uuid();rp.id:=late_id;
 rp.official_context:=rp.official_context||jsonb_build_object('startedAt',clock_timestamp()-interval '2 hours');
 insert into public.battle_replay_sessions select rp.*;
 sr.request_id:=gen_random_uuid();sr.replay_session_id:=late_id;
 sr.response:=sr.response||jsonb_build_object('replay_session_id',late_id);
 insert into public.raid_room_battle_start_requests select sr.*;
 result:=public.finalize_raid_room_battle_v1(late_id,data);
 perform public.finalize_raid_room_battle_v1(late_id,data);
 if result->>'lateFinalization'<>'true' or (result->>'appliedDamage')::bigint<>0
 or (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B005')<>1 then raise exception 'late finalize Mission contract failed'; end if;
 -- Cancellation, missing start receipt (failed start), and non-Raid/Tutorial route.
 for i in 1..3 loop
  replay_id:=gen_random_uuid();rp.id:=replay_id;rp.status:=case when i=1 then 'CANCELLED' else 'PENDING' end;
  rp.battle_mode:=case when i=3 then 'QUEST' else 'RAID' end;
  insert into public.battle_replay_sessions select rp.*;
  if i<>2 then
   sr.request_id:=gen_random_uuid();sr.replay_session_id:=replay_id;
   sr.response:=sr.response||jsonb_build_object('replay_session_id',replay_id);
   insert into public.raid_room_battle_start_requests select sr.*;
  end if;
  begin
   perform public.finalize_raid_room_battle_v1(replay_id,data);
   raise exception 'invalid path accepted: %',i;
  exception when check_violation or insufficient_privilege then null;
  end;
 end loop;
 if (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B005')<>1
 or (select count(*) from public.raid_damage_logs where raid_boss_instance_id=boss and user_id=uid)<>51 then raise exception 'rejected paths mutated progress'; end if;
 -- Clear uses the real server eligibility, excludes late damage and requires strict >.
 update public.raid_bosses set outcome='DEFEAT_SUCCESS',status='CLEARED',outcome_finalized_at=clock_timestamp(),cleared_at=clock_timestamp() where id=boss;
 update public.raid_room_clear_reward_rules set minimum_contribution_damage=50
 where difficulty=(select difficulty_id from public.raid_rooms where id=rid);
 gate:=public._raid_room_clear_reward_progress_v1(rid,uid);
 if (gate->>'finalizedBattles')::bigint<>50 or (gate->>'contributionDamage')::bigint<>50
 or gate->'clearGate'->>'status'<>'not_succeeded' then raise exception 'late/threshold eligibility failed: %',gate; end if;
 delete from public.raid_room_clear_reward_grants where room_id=rid and user_id=uid;
 delete from public.raid_room_clear_rewards where room_id=rid and user_id=uid;
 -- Isolate this recipient inside the rolled back fixture, retaining real reward functions.
 delete from public.raid_room_members where room_id=rid and user_id<>uid;
 issued:=public._issue_raid_room_clear_rewards_v1(rid);
 if issued<>0 or (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B006')<>0 then raise exception 'ineligible clear progressed'; end if;
 update public.raid_room_clear_reward_rules set minimum_contribution_damage=49
 where difficulty=(select difficulty_id from public.raid_rooms where id=rid);
 issued:=public._issue_raid_room_clear_rewards_v1(rid);
 if issued<>1 or (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B006')<>1 then raise exception 'eligible clear not exactly once'; end if;
 select count(*) into grants_before from public.raid_room_clear_reward_grants where room_id=rid and user_id=uid;
 issued:=public._issue_raid_room_clear_rewards_v1(rid);
 if issued<>0 or (select current_progress from public.user_missions where user_id=uid and mission_id='MIS_N_B006')<>1
 or (select count(*) from public.raid_room_clear_reward_grants where room_id=rid and user_id=uid)<>grants_before then raise exception 'clear retry duplicated'; end if;
end $test$;
select 'PASS: live Room finalize x50 / daily1 / cumulative10,50 / every retry / late finalized count / cancel, missing receipt, nonRaid rejected / real clear gate strict threshold / late excluded / clear issue+retry exactly once' as raid_mission_verification;
rollback;
