-- Preview QA only. Instrument event dispatch inside the rolled-back transaction.
begin;
set local statement_timeout='60s';
create temporary table quest_test_events(trigger_type text, increment integer) on commit drop;
alter function public.evaluate_mission_progress(uuid,text,integer) rename to quest_test_original_mission_progress;
create function public.evaluate_mission_progress(p_user_id uuid,p_trigger_type text,p_progress_increment integer) returns void
language plpgsql security definer set search_path=public as $$ begin
 insert into pg_temp.quest_test_events values(p_trigger_type,p_progress_increment);
 perform public.quest_test_original_mission_progress(p_user_id,p_trigger_type,p_progress_increment);
end $$;
do $$
declare uid uuid:='6ea6c81c-e169-457f-9206-92ff85f1495e'; cid text; qid text; pid uuid; rid uuid; r jsonb; snapshot jsonb; expected jsonb; quest_order integer; bonus jsonb; cash_expected bigint;
begin
 if not public.quest_progression_enabled_v1(uid) then raise exception 'QA is not activated';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 update public.user_patrols set status='MIGRATED' where user_id=uid and status in('ONGOING','CLAIMABLE');
 select c.character_id,q.quest_id,q.display_order into cid,qid,quest_order from public.user_characters c
 join public.canonical_character_master m on m.version='2026-08-21' and m.character_id=c.character_id
 join public.canonical_quest_master q on q.version='2026-08-30' and q.difficulty='HARD' and public.quest_town_key(q.town_id)=public.quest_town_key(m.hometown)
 where c.user_id=uid order by q.display_order limit 1;
 if qid is null then raise exception 'QA hometown matching character required';end if;
 delete from public.user_quest_first_clears where user_id=uid and quest_id=qid;
 insert into public.user_quest_first_clears(user_id,quest_id) select uid,quest_id from public.canonical_quest_master where version='2026-08-30' and display_order<quest_order on conflict do nothing;
 update public.users set vitality=50 where id=uid;
 r:=public.start_patrol(qid,cid);pid:=(r->>'patrol_id')::uuid;
 select encounter_snapshot,hometown_bonus_snapshot into snapshot,bonus from public.user_patrols where id=pid;
 select progression_boss_stats,floor(progression_cash_reward::numeric*0.1)::bigint into expected,cash_expected from public.canonical_quest_master where version='2026-08-30' and quest_id=qid;
 if snapshot->'members'->0->'stats' is distinct from expected then raise exception 'encounter does not use progression stats';end if;
 if (bonus->>'cash')::bigint<>cash_expected or (bonus->>'matched')::boolean is not true then raise exception 'hometown bonus not 10 percent of progression cash';end if;
 update public.user_patrols set expires_at=now()-interval '1second' where id=pid;
 if public.get_patrol_battle_enemy(pid)->'enemy_data'->'members' is distinct from snapshot->'members' then raise exception 'enemy getter differs from snapshot';end if;
 r:=public.create_patrol_battle_replay(pid);rid:=(r->>'replay_session_id')::uuid;
 if r->'enemy_snapshot' is distinct from snapshot->'members' then raise exception 'display and actual enemy differ';end if;
 if exists(select 1 from pg_temp.quest_test_events where trigger_type='QUEST_HARD_COMPLETE_COUNT') then raise exception 'hard mission advanced before win';end if;
 update public.battle_replay_sessions set status='RESOLVED',resolved_at=now(),result='{"winner":"PLAYER","events":[]}' where id=rid;
 perform public.finalize_quest_progression_battle_v1(rid);
 perform public.finalize_quest_progression_battle_v1(rid);
 perform public.claim_patrol_rewards(pid);
 perform public.claim_patrol_rewards(pid);
 if (select coalesce(sum(increment),0) from pg_temp.quest_test_events where trigger_type='QUEST_HARD_COMPLETE_COUNT')<>1 then raise exception 'first hard win must count exactly once';end if;
 update public.users set vitality=50 where id=uid;
 r:=public.start_patrol(qid,cid);pid:=(r->>'patrol_id')::uuid;
 update public.user_patrols set expires_at=now()-interval '1second' where id=pid;
 perform public.claim_patrol_rewards(pid);
 perform public.claim_patrol_rewards(pid);
 if (select coalesce(sum(increment),0) from pg_temp.quest_test_events where trigger_type='QUEST_HARD_COMPLETE_COUNT')<>2 then raise exception 'repeat hard completion must count exactly once';end if;
 raise notice 'PASS: hard victory/repeat events exactly once, hometown 10 percent, encounter/getter/replay stats identical';
end $$;
rollback;
