-- Preview only sufvuqdnqohpfzkwxohq. Named QA only; all writes rolled back.
begin;
set local statement_timeout='30s';
do $$
declare
 uid constant uuid:='6ea6c81c-e169-457f-9206-92ff85f1495e';
 pid uuid; rid uuid; character_id text; r jsonb; enemy_before jsonb; player_before jsonb;
 ap_before integer; expires_before timestamptz; owned_id uuid;
begin
 if not exists(select 1 from public.quest_progression_user_versions where user_id=uid and progression_version='2026-09-16') then raise exception 'Explicit QA fixture missing';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 update public.user_patrols set status='MIGRATED' where user_id=uid and status in('ONGOING','CLAIMABLE');
 delete from public.user_quest_first_clears where user_id=uid;
 update public.quest_progression_guides set step='PLAY' where user_id=uid;
 update public.users set vitality=50 where id=uid;
 select c.character_id,c.id into character_id,owned_id from public.user_characters c
 join public.user_main_formations f on f.user_id=c.user_id and f.user_character_id=c.id
 where c.user_id=uid order by c.id limit 1;
 if owned_id is null then raise exception 'MainFormation QA fixture missing';end if;
 r:=public.start_patrol('q_shinjuku_1',character_id);pid:=(r->>'patrol_id')::uuid;
 update public.user_patrols set expires_at=now()-interval '1 second' where id=pid;
 -- Simulate a pre-adjustment patrol. Its saved replay must survive a snapshot refresh.
 update public.user_patrols set encounter_snapshot=jsonb_set(encounter_snapshot,'{members,0,stats,hp}','9504'::jsonb) where id=pid;
 r:=public.create_patrol_battle_replay(pid);rid:=(r->>'replay_session_id')::uuid;
 enemy_before:=r->'enemy_snapshot';
 if enemy_before#>>'{0,stats,hp}'<>'9504' then raise exception 'Old snapshot fixture failed';end if;
 select vitality into ap_before from public.users where id=uid;
 select expires_at into expires_before from public.user_patrols where id=pid;
 -- Same patrol-only operation used by the migration; no replay writes.
 update public.user_patrols set encounter_snapshot=public.quest_progression_enemy_snapshot_v1(encounter_snapshot,'q_shinjuku_1') where id=pid;
 r:=public.create_patrol_battle_replay(pid);
 if (r->>'replay_session_id')::uuid<>rid or r->'enemy_snapshot'<>enemy_before then raise exception 'Pending replay was replaced';end if;
 update public.battle_replay_sessions set status='RESOLVED',resolved_at=now(),result='{"winner":"ENEMY","events":[]}' where id=rid;
 perform public.finalize_quest_progression_battle_v1(rid);
 r:=public.create_patrol_battle_replay(pid);
 if (r->>'replay_session_id')::uuid=rid then raise exception 'Retry reused old replay';end if;
 if r#>>'{enemy_snapshot,0,stats,hp}'<>'5700' then raise exception 'Retry missed new easy master';end if;
 if r->'enemy_snapshot'<>(select progression_boss_members from public.canonical_quest_master where version='2026-08-30' and quest_id='q_shinjuku_1') then raise exception 'Retry enemy differs from new master';end if;
 if (select enemy_snapshot from public.battle_replay_sessions where id=rid)<>enemy_before then raise exception 'Historical replay was rewritten';end if;
 if (select vitality from public.users where id=uid)<>ap_before then raise exception 'Retry consumed AP';end if;
 if (select expires_at from public.user_patrols where id=pid)<>expires_before then raise exception 'Retry added exploration wait';end if;
end $$;
select 'PASS: pending and historical replay preserved, next retry uses new easy master, zero AP/wait; rollback' as result;
rollback;
