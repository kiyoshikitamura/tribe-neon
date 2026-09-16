begin;
-- Preview専用。既存資産・受取履歴はROLLBACKで完全復元する。
do $$
declare v_uid uuid:='6ea6c81c-e169-457f-9206-92ff85f1495e'; v_count integer;
begin
 if not exists(select 1 from public.users u join auth.users a on a.id=u.id where u.id=v_uid) then raise exception 'Named Preview QA fixture is missing'; end if;
 perform set_config('request.jwt.claim.sub',v_uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
 delete from public.user_quest_first_clears where user_id=v_uid;
 update public.missions set is_enabled=true where id like 'qp_template_%';
 delete from public.user_missions where user_id=v_uid and mission_id like 'qp_template_%';
 delete from public.quest_progression_user_versions where user_id=v_uid;
 perform public.sync_current_missions();
 insert into public.user_quest_first_clears(user_id,quest_id) values(v_uid,'q_shinjuku_1');
 if exists(select 1 from public.user_missions where user_id=v_uid and mission_id='qp_template_stage' and status='CLEAR') then raise exception 'LEGACY must not observe new mission flags'; end if;
 insert into public.quest_progression_user_versions(user_id,progression_version,migration_key) values(v_uid,'2026-09-16','MISSION_ROLLBACK_QA');
 perform public.sync_current_missions();
 if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='qp_template_stage' and status='CLEAR') then raise exception 'stage flag failed'; end if;
 insert into public.user_quest_first_clears(user_id,quest_id) values(v_uid,'q_shinjuku_2'),(v_uid,'q_shinjuku_3');
 select count(*) into v_count from public.user_missions where user_id=v_uid and mission_id in ('qp_template_stage','qp_template_town','qp_template_count') and status='CLEAR';
 if v_count<>3 then raise exception 'town/count flags failed'; end if;
 -- 同じステージの再評価はカウントを増やさない。
 perform public.refresh_quest_progression_missions(v_uid);
 if (select current_progress from public.user_missions where user_id=v_uid and mission_id='qp_template_count')<>3 then raise exception 'duplicate clear counted'; end if;
 -- 後付けミッションの行を同期で再作成しても保存済み進捗から達成する。
 delete from public.user_missions where user_id=v_uid and mission_id='qp_template_town';
 perform public.sync_current_missions();
 if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='qp_template_town' and status='CLEAR') then raise exception 'retroactive flag failed'; end if;
 update public.user_missions set status='CLAIMED',claimed_at=now() where user_id=v_uid and mission_id='qp_template_stage';
 perform public.refresh_quest_progression_missions(v_uid);
 if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='qp_template_stage' and status='CLAIMED' and claimed_at is not null) then raise exception 'claimed state changed'; end if;
 insert into public.user_quest_first_clears(user_id,quest_id)
 select v_uid,quest_id from public.canonical_quest_master where version='2026-08-30' and is_production_enabled on conflict do nothing;
 if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='qp_template_all' and status='CLEAR') then raise exception 'all 21 flag failed'; end if;
 raise notice 'PASS: stage/town/count/all/retroactive/duplicate/claimed';
end $$;
rollback;
