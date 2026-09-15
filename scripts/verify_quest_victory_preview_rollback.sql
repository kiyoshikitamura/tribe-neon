-- Preview only. Run after the candidate function is installed. Always rolls back.
begin;
set local statement_timeout='20s';
do $test$
declare p public.user_patrols%rowtype; r jsonb; before_user jsonb; before_missions jsonb; before_ledger bigint; q text; d text; n integer; after_user jsonb;
begin
 for d in select unnest(array['NORMAL','HARD']) loop
 select patrol.* into strict p from public.user_patrols patrol
 join public.canonical_quest_master m on m.version='2026-08-30' and m.quest_id=coalesce(patrol.course_id,patrol.quest_id)
 where m.difficulty=d and patrol.has_battle_event and patrol.status='COMPLETED' and patrol.battle_result='DEFEAT' limit 1;
 perform set_config('request.jwt.claim.sub',p.user_id::text,true);
 q:=coalesce(p.course_id,p.quest_id);
 delete from public.user_quest_first_clears where user_id=p.user_id and quest_id=q;
 update public.user_patrols set status='CLAIMABLE' where id=p.id;
 select to_jsonb(u) into before_user from public.users u where id=p.user_id;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) into before_missions from public.user_missions m where user_id=p.user_id;
 select count(*) into before_ledger from public.gameplay_reward_delivery_ledger where user_id=p.user_id;
 r:=public.claim_patrol_rewards(p.id);
 if r->>'outcome'<>'DEFEAT' or r->>'first_clear'<>'false' or r->>'cash'<>'0' or r->>'xp'<>'0' or r->'items'<>'[]'::jsonb then raise exception 'defeat response mismatch';end if;
 if exists(select 1 from public.user_quest_first_clears where user_id=p.user_id and quest_id=q) then raise exception 'defeat first clear';end if;
 select to_jsonb(u) into after_user from public.users u where id=p.user_id;
 if before_user is distinct from after_user then raise exception 'defeat user mutation';end if;
 if before_missions is distinct from (select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from public.user_missions m where user_id=p.user_id) then raise exception 'defeat mission mutation';end if;
 if before_ledger<>(select count(*) from public.gameplay_reward_delivery_ledger where user_id=p.user_id) then raise exception 'defeat grant';end if;
 if (select status from public.user_patrols where id=p.id)<>'COMPLETED' then raise exception 'slot not released';end if;
 begin perform public.claim_patrol_rewards(p.id);raise exception 'duplicate accepted';exception when unique_violation then null;end;
 if d='NORMAL' and public.canonical_quest_is_unlocked(p.user_id,replace(q,'_2','_3')) then raise exception 'hard unlocked by defeat';end if;
 end loop;
 -- Fresh source id for a real successful HARD claim; all changes roll back.
 p.id:=gen_random_uuid();p.status:='CLAIMABLE';p.battle_result:='VICTORY';p.battle_resolved:=true;
 p.rewards_accrued:='{}'::jsonb;
 insert into public.user_patrols select p.*;
 -- Insert triggers can refresh encounter snapshots; enforce this resolved fixture explicitly.
 update public.user_patrols set battle_resolved=true,battle_result='VICTORY',status='CLAIMABLE',expires_at=now()-interval '1 minute' where id=p.id;
 insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
 values(p.user_id,'MIS_N_P005',0,0,'PROGRESS')
 on conflict (user_id,mission_id) do update set current_progress=0,progress_val=0,status='PROGRESS';
 r:=public.claim_patrol_rewards(p.id);
 if r->>'outcome'<>'VICTORY' or r->>'first_clear'<>'true' or (r->>'xp')::int<=0 or jsonb_array_length(r->'items')=0 then raise exception 'victory reward mismatch';end if;
 if not exists(select 1 from public.user_quest_first_clears where user_id=p.user_id and quest_id=q) then raise exception 'victory first clear absent';end if;
 if not exists(select 1 from public.user_missions where user_id=p.user_id and mission_id='MIS_N_P005' and current_progress=1 and status='CLEAR') then raise exception 'hard mission absent';end if;
 select count(*) into before_ledger from public.gameplay_reward_delivery_ledger where user_id=p.user_id;
 begin perform public.claim_patrol_rewards(p.id);raise exception 'victory duplicate accepted';exception when unique_violation then null;end;
 if before_ledger<>(select count(*) from public.gameplay_reward_delivery_ledger where user_id=p.user_id) then raise exception 'duplicate granted';end if;
end $test$;
select 'PASS: actual Preview RPC NORMAL/HARD defeat, no assets/missions/grants/clear, locked HARD, released slot, retry rejection, fresh HARD win grants/first clear/mission; all rolled back' as result;
rollback;
