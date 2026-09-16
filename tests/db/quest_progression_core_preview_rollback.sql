-- Run only after activating an explicit QA user. Every assertion rolls back.
begin;
set local statement_timeout='60s';
do $$
declare uid uuid; character_id text; dispatched jsonb; replay jsonb; pid uuid; rid uuid; cash_before bigint; receipt jsonb; next_pid uuid; owned record; started_count integer:=0;
begin
 select v.user_id into uid from public.quest_progression_user_versions v
 join public.tutorial_progress t on t.user_id=v.user_id and t.step_id='COMPLETE'
 where v.progression_version='2026-09-16' and v.user_id='6ea6c81c-e169-457f-9206-92ff85f1495e'::uuid;
 if uid is null then raise exception 'activate explicit QA fixture first';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 update public.user_patrols set status='MIGRATED' where user_id=uid and status in('ONGOING','CLAIMABLE');
 delete from public.user_quest_first_clears where user_id=uid;
 update public.users set vitality=50 where id=uid;
 select c.character_id into character_id from public.user_characters c where c.user_id=uid order by c.created_at limit 1;
 if character_id is null then raise exception 'QA character fixture missing';end if;
 if not public.canonical_quest_is_unlocked(uid,'q_shinjuku_1') or public.canonical_quest_is_unlocked(uid,'q_shibuya_1') then raise exception 'sequential unlock failed';end if;
 dispatched:=public.start_patrol('q_shinjuku_1',character_id);pid:=(dispatched->>'patrol_id')::uuid;
 update public.user_patrols set expires_at=now()-interval '1second' where id=pid;
 replay:=public.create_patrol_battle_replay(pid);rid:=(replay->>'replay_session_id')::uuid;
 if (public.create_patrol_battle_replay(pid)->>'replay_session_id')::uuid<>rid then raise exception 'pending replay was duplicated';end if;
 select cash into cash_before from public.users where id=uid;
 update public.battle_replay_sessions set status='RESOLVED',resolved_at=now(),result='{"winner":"ENEMY","events":[]}' where id=rid;
 perform public.finalize_quest_progression_battle_v1(rid);
 receipt:=public.claim_patrol_rewards(pid);
 if receipt->>'retryable'<>'true' or (select status from public.user_patrols where id=pid)<>'CLAIMABLE' then raise exception 'defeat discarded boss';end if;
 if (select cash from public.users where id=uid)<>cash_before then raise exception 'defeat claim duplicated normal rewards';end if;
 replay:=public.create_patrol_battle_replay(pid);
 if (replay->>'replay_session_id')::uuid=rid then raise exception 'retry did not build new formation snapshot';end if;
 perform public.finalize_quest_progression_battle_v1(rid);
 if (select battle_resolved from public.user_patrols where id=pid) then raise exception 'old defeat replay overwrote retry';end if;
 rid:=(replay->>'replay_session_id')::uuid;
 update public.battle_replay_sessions set status='RESOLVED',resolved_at=now(),result='{"winner":"PLAYER","events":[]}' where id=rid;
 perform public.finalize_quest_progression_battle_v1(rid);
 if not public.canonical_quest_is_unlocked(uid,'q_shinjuku_2') then raise exception 'victory did not unlock before claim';end if;
 select cash into cash_before from public.users where id=uid;
 perform public.finalize_quest_progression_battle_v1(rid);
 perform public.claim_patrol_rewards(pid);
 perform public.claim_patrol_rewards(pid);
 if (select cash from public.users where id=uid)<>cash_before then raise exception 'replayed victory/claim duplicated rewards';end if;
 update public.users set vitality=50 where id=uid;
 dispatched:=public.start_patrol('q_shinjuku_2',character_id);next_pid:=(dispatched->>'patrol_id')::uuid;
 update public.user_patrols set expires_at=now()-interval '1second' where id=next_pid;
 for owned in select c.character_id from public.user_characters c where c.user_id=uid order by c.created_at limit 5 loop
  update public.users set vitality=50 where id=uid;
  dispatched:=public.start_patrol('q_shinjuku_1',owned.character_id);
  if (dispatched->>'has_battle')::boolean then raise exception 'repeat still has boss';end if;
  started_count:=started_count+1;
 end loop;
 if started_count<>5 then raise exception 'QA fixture requires five owned characters';end if;
 if (select count(*) from public.user_patrols where user_id=uid and status in('ONGOING','CLAIMABLE'))<>6 then raise exception 'boss did not release exploration slot';end if;
 raise notice 'PASS: sequential unlock, pending replay reuse, defeat persistence, stale replay, victory unlock, idempotent rewards, repeat no boss, five slots plus boss';
end $$;
rollback;
