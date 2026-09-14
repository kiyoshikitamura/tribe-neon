begin;
set local statement_timeout='45s';
do $$
declare p record;q record;c record;u uuid;j jsonb;pid uuid;cash_before bigint;snap jsonb;fixed bigint;
 room uuid;boss uuid;replay uuid;threshold bigint;tier text;g jsonb;before_items jsonb;after_items jsonb;
begin
 -- Existing unclaimed patrols preserve their pre-cutover base and hometown amounts.
 for p in select p0.*,q0.difficulty from public.user_patrols p0 join public.canonical_quest_master q0
 on q0.version='2026-08-30' and q0.quest_id=coalesce(p0.course_id,p0.quest_id)
 where p0.status<>'COMPLETED' and p0.started_at<'2026-09-14 17:43:40+00' loop
  if p.base_cash_snapshot<>(case p.difficulty when 'EASY' then 600 when 'NORMAL' then 1200 else 2000 end) then raise exception 'legacy base mismatch';end if;
 end loop;
 select * into p from public.user_patrols where status<>'COMPLETED' and base_cash_snapshot is not null limit 1;
 if p.id is null then raise exception 'legacy pending fixture missing';end if;
 u:=p.user_id;perform set_config('request.jwt.claim.sub',u::text,true);
 select cash into cash_before from public.users where id=u;
 update public.user_patrols set status='CLAIMABLE',battle_resolved=true,expires_at=now()-interval '1second' where id=p.id;
 j:=public.claim_patrol_rewards(p.id);
 if (j->>'base_cash')::bigint<>p.base_cash_snapshot or (j->>'cash')::bigint<>p.base_cash_snapshot+(p.hometown_bonus_snapshot->>'cash')::bigint
 or (select cash from public.users where id=u)<>cash_before+(j->>'cash')::bigint
 or (select hometown_bonus_snapshot from public.user_patrols where id=p.id) is distinct from p.hometown_bonus_snapshot then raise exception 'legacy claim changed';end if;
 if (public._quest_raid_cash_xp_v2(p.id)->>'cash')::bigint<>p.base_cash_snapshot then raise exception 'encounter base mismatch';end if;
 begin perform public.claim_patrol_rewards(p.id);raise exception 'retry accepted';exception when unique_violation then null;end;
 -- Actual new start, then edit master. Claim and encounter must keep start-time base.
 select uc.*,m.hometown into c from public.user_characters uc join public.canonical_character_master m
 on m.version='2026-08-21' and m.character_id=uc.character_id
 where not exists(select 1 from public.user_patrols pp where pp.user_id=uc.user_id and pp.character_id=uc.character_id and pp.status<>'COMPLETED')
 and (select count(*) from public.user_patrols pp where pp.user_id=uc.user_id and pp.status<>'COMPLETED')<5 limit 1;
 u:=c.user_id;perform set_config('request.jwt.claim.sub',u::text,true);
 select * into q from public.canonical_quest_master where version='2026-08-30' and difficulty='EASY'
 and public.quest_town_key(town_id)=public.quest_town_key(c.hometown) limit 1;
 update public.users set vitality=100 where id=u;
 j:=public.start_patrol(q.quest_id,c.id::text);pid:=(j->>'patrol_id')::uuid;snap:=j->'hometown_bonus_snapshot';
 if (j->>'base_cash_snapshot')::bigint<>300 or (snap->>'cash')::bigint<>30 then raise exception 'new start base mismatch';end if;
 update public.canonical_quest_master set cash_reward=99999 where version='2026-08-30' and quest_id=q.quest_id;
 begin update public.user_patrols set base_cash_snapshot=99999 where id=pid;raise exception 'mutable base';exception when check_violation then null;end;
 update public.user_patrols set status='CLAIMABLE',battle_resolved=true,expires_at=now()-interval '1second' where id=pid;
 j:=public.claim_patrol_rewards(pid);
 if (j->>'base_cash')::bigint<>300 or (j->>'cash')::bigint<>330 or (public._quest_raid_cash_xp_v2(pid)->>'cash')::bigint<>300 then raise exception 'master drift changed claim';end if;
 perform set_config('request.jwt.claim.sub','',true);
 -- Official Raid log fixture. Raw is huge but applied below boundary must fail.
 select r.id,r.raid_boss_instance_id,b.id,b.requester_user_id into room,boss,replay,u
 from public.raid_rooms r join public.battle_replay_sessions b on b.source_reference_id=r.raid_boss_instance_id
 join public.raid_damage_logs l on l.battle_replay_session_id=b.id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.room_id=r.id and s.user_id=b.requester_user_id
 where b.battle_mode='RAID' and b.finalization_status='FINALIZED' and b.resolution_authority='RAID_SERVER' limit 1;
 if replay is null then raise exception 'official raid fixture missing';end if;
 update public.raid_bosses set max_hp=10000,current_hp=0,status='CLEARED',outcome='DEFEAT_SUCCESS',cleared_at=now(),outcome_finalized_at=now() where id=boss;
 update public.raid_damage_logs set raw_damage=1000000,applied_damage=0 where raid_boss_instance_id=boss and user_id=u;
 update public.battle_replay_sessions set finalization_result=jsonb_set(finalization_result,'{lateFinalization}','false'),finalized_at=clock_timestamp() where id=replay;
 foreach tier in array array['advanced','expert'] loop
  threshold:=case tier when 'advanced' then 300 else 500 end;
  update public.raid_rooms set difficulty_id=tier where id=room;
  update public.raid_damage_logs set applied_damage=threshold-1 where battle_replay_session_id=replay;
  g:=public._raid_room_clear_reward_progress_v1(room,u);
  if g->'clearGate'->>'status'<>'not_succeeded' or (g->>'contributionDamage')::bigint<>threshold-1 then raise exception 'raw used or lower boundary accepted %',g;end if;
  update public.raid_damage_logs set applied_damage=threshold where battle_replay_session_id=replay;
  g:=public._raid_room_clear_reward_progress_v1(room,u);
  if g->'clearGate'->>'status'<>'succeeded' or (g->'clearGate'->>'minimumContributionDamage')::bigint<>threshold or g->'clearGate'->>'comparison'<>'GTE' then raise exception 'exact boundary failed %',g;end if;
  -- Killing battle finalized_at is after cleared_at; official non-late flag is authoritative.
  if (select finalized_at from public.battle_replay_sessions where id=replay)<=(select cleared_at from public.raid_bosses where id=boss) then raise exception 'kill timestamp fixture invalid';end if;
  update public.battle_replay_sessions set finalization_result=jsonb_set(finalization_result,'{lateFinalization}','true') where id=replay;
  if (public._raid_room_clear_reward_progress_v1(room,u)->'clearGate'->>'status')='succeeded' then raise exception 'late contributed';end if;
  update public.battle_replay_sessions set finalization_result=jsonb_set(finalization_result,'{lateFinalization}','false') where id=replay;
  -- Fractional thresholds round upward: 3% of 10001 requires 301, 5% requires 501.
  update public.raid_bosses set max_hp=10001 where id=boss;
  if (public._raid_room_clear_reward_progress_v1(room,u)->'clearGate'->>'status')='succeeded' then raise exception 'fraction boundary rounded down';end if;
  update public.raid_bosses set max_hp=10000 where id=boss;
  delete from public.raid_room_clear_reward_grants where room_id=room;
  delete from public.raid_room_clear_rewards where room_id=room;
  delete from public.raid_daily_clear_bonus_ledger where user_id=u;
  delete from public.gameplay_reward_delivery_ledger where source_kind='RAID_ROOM_CLEAR' and (source_key=room::text or source_key like 'DAILY_CLEAR_BONUS:%');
  perform public._issue_raid_room_clear_rewards_v1(room);
  if not exists(select 1 from public.raid_room_clear_rewards where room_id=room and user_id=u)
   or not exists(select 1 from public.raid_daily_clear_bonus_ledger where user_id=u and difficulty=tier and won) then raise exception 'high rewards not issued at boundary';end if;
  select jsonb_object_agg(item_id,quantity) into before_items from public.user_items where user_id=u;
  perform public._issue_raid_room_clear_rewards_v1(room);
  select jsonb_object_agg(item_id,quantity) into after_items from public.user_items where user_id=u;
  if before_items is distinct from after_items then raise exception 'high reward retry duplicated';end if;
 end loop;
 if has_function_privilege('authenticated','public.on_quest_base_cash_snapshot()','EXECUTE') then raise exception 'internal trigger exposed';end if;
end $$;
select 'PASS: old/new CASH, immutable snapshot, master drift, encounter base, retry, applied thresholds 3/5%, exact/rounded boundary, killing battle, late exclusion, high Instance/Daily once' result;
rollback;
