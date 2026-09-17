CREATE OR REPLACE FUNCTION public.start_patrol(p_course_id text, p_character_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_character text; v_q record; v_id uuid; v_active integer; v_vitality integer; v_kind text; v_cost integer; v_duration integer;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not public.quest_progression_enabled_v1(v_uid) then return public.start_patrol_pre_progression_v1(p_course_id,p_character_id);end if;
 select * into v_q from public.canonical_quest_master where version='2026-08-30' and quest_id=p_course_id and is_production_enabled;
 if not found then raise exception 'quest not found' using errcode='23503'; end if;
 if not public.canonical_quest_is_unlocked(v_uid,p_course_id) then raise exception 'quest is locked' using errcode='23514'; end if;
 perform 1 from public.users where id=v_uid for update;
 v_kind:=case when not exists(select 1 from public.tutorial_progress where user_id=v_uid and step_id in ('COMPLETE','AUTHENTICATION')) then 'TUTORIAL' when exists(select 1 from public.user_quest_first_clears where user_id=v_uid and quest_id=p_course_id) then 'REPEAT' else 'FIRST_CLEAR' end;
 v_cost:=case when v_kind='TUTORIAL' then v_q.vitality_cost else coalesce(v_q.progression_vitality_cost,v_q.vitality_cost) end;
 v_duration:=case when v_kind='TUTORIAL' then v_q.duration_sec else coalesce(v_q.progression_duration_sec,v_q.duration_sec) end;
 select owned.character_id into v_character from public.user_characters owned where owned.user_id=v_uid and(owned.id::text=p_character_id or owned.character_id=p_character_id) order by(owned.id::text=p_character_id)desc limit 1;
 if v_character is null then raise exception 'character is not owned' using errcode='23503'; end if;
 perform 1 from public.users where id=v_uid for update;
 if v_kind='FIRST_CLEAR' and exists(select 1 from public.user_patrols where user_id=v_uid and coalesce(course_id,quest_id)=p_course_id and progression_kind='FIRST_CLEAR' and status in('ONGOING','CLAIMABLE')) then raise exception 'stage exploration already started' using errcode='23505';end if;
 select count(*) into v_active from public.user_patrols where user_id=v_uid and status in('ONGOING','CLAIMABLE') and not(progression_kind='FIRST_CLEAR' and expires_at<=now()); if v_active>=5 then raise exception 'all dispatch slots are occupied' using errcode='23514'; end if;
 if exists(select 1 from public.user_patrols where user_id=v_uid and character_id=v_character and status in('ONGOING','CLAIMABLE') and not(progression_kind='FIRST_CLEAR' and expires_at<=now())) then raise exception 'character is already dispatched' using errcode='23505'; end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid); select vitality into v_vitality from public.users where id=v_uid for update;
 if coalesce(v_vitality,0)<v_cost then raise exception 'insufficient vitality' using errcode='23514'; end if;
 insert into public.user_patrols(user_id,course_id,character_id,started_at,expires_at,status,has_battle_event,battle_resolved,progression_kind) values(v_uid,p_course_id,v_character,now(),now()+v_duration*interval '1 second','ONGOING',v_kind<>'REPEAT',false,v_kind) returning id into v_id;
 update public.users set vitality=vitality-v_cost,vitality_last_recovered_at=case when vitality>=50 then now() else vitality_last_recovered_at end where id=v_uid;
 return jsonb_build_object('status','success','base_cash_snapshot',(select base_cash_snapshot from public.user_patrols where id=v_id),'hometown_bonus_snapshot',(select hometown_bonus_snapshot from public.user_patrols where id=v_id),'patrol_id',v_id,'has_battle',v_kind<>'REPEAT','progression_kind',v_kind,'duration_seconds',v_duration,'cost_vitality',v_cost,'remaining_vitality',v_vitality-v_cost);
end $function$;

CREATE OR REPLACE FUNCTION public.finalize_quest_progression_battle_v1(p_replay_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.battle_replay_sessions%rowtype; p public.user_patrols%rowtype; normal jsonb; first_reward jsonb; receipt jsonb; inserted boolean:=false;
begin
 select * into s from public.battle_replay_sessions where id=p_replay_id;
 if not found or s.battle_mode<>'QUEST' or s.resolution_authority<>'PATROL_SERVER' or s.status<>'RESOLVED' or s.result->>'winner' not in('PLAYER','ENEMY') then raise exception 'resolved official quest replay required' using errcode='23514';end if;
 perform 1 from public.users where id=s.requester_user_id for update;
 select * into p from public.user_patrols where id=s.source_reference_id and user_id=s.requester_user_id for update;
 if not found then raise exception 'patrol not found' using errcode='P0002';end if;
 if p.progression_kind='LEGACY' then return jsonb_build_object('legacy',true);end if;
 -- Old replay retries cannot overwrite a later attempt, and migrated patrols stay retired.
 if p.active_replay_id is distinct from s.id or p.status not in('ONGOING','CLAIMABLE') then return jsonb_build_object('ignored',true);end if;
 if coalesce(p.battle_resolved,false) then return coalesce(p.rewards_accrued,jsonb_build_object('outcome',p.battle_result));end if;
 update public.user_patrols set battle_result=case when s.result->>'winner'='PLAYER' then 'VICTORY' else 'DEFEAT' end,battle_resolved=true where id=p.id;
 if s.result->>'winner'='ENEMY' then return jsonb_build_object('outcome','DEFEAT','retryable',true);end if;
 normal:=public._claim_quest_exploration_v1(p.user_id,p.id);
 if p.progression_kind='FIRST_CLEAR' or (p.progression_kind='TUTORIAL' and exists(select 1 from public.tutorial_progress t where t.user_id=p.user_id and t.step_id in ('COMPLETE','AUTHENTICATION') and t.completed_at<=p.started_at)) then
  insert into public.user_quest_first_clears(user_id,quest_id) values(p.user_id,coalesce(p.course_id,p.quest_id)) on conflict do nothing returning true into inserted;
  if inserted then
   first_reward:=public._grant_quest_progression_first_reward_v1(p.user_id,coalesce(p.course_id,p.quest_id),p.id);
   perform public.evaluate_mission_progress(p.user_id,'PATROL_CLEAR',1);
  end if;
 end if;
 first_reward:=coalesce(first_reward,'{}'::jsonb);
 first_reward:=first_reward||jsonb_build_object('level',first_reward->'xp_result'->'level','current_xp',first_reward->'xp_result'->'xp','leveled_up',coalesce(first_reward->'xp_result'->'leveled_up','false'::jsonb));
 receipt:=normal||jsonb_build_object('outcome','VICTORY','first_clear',coalesce(inserted,false),
 'cash',coalesce((normal->>'cash')::bigint,0)+coalesce((first_reward->>'cash')::bigint,0),
 'xp',coalesce((normal->>'xp')::integer,0)+coalesce((first_reward->>'xp')::integer,0),
 'items',coalesce(normal->'items','[]'::jsonb)||coalesce(first_reward->'items','[]'::jsonb),
 'level',coalesce(nullif(first_reward->'level','null'::jsonb),normal->'level'),'current_xp',coalesce(nullif(first_reward->'current_xp','null'::jsonb),normal->'current_xp'),
 'leveled_up',coalesce((normal->>'leveled_up')::boolean,false) or coalesce((first_reward->>'leveled_up')::boolean,false));
 update public.user_patrols set rewards_accrued=receipt,first_clear_reward_receipt=first_reward where id=p.id;
 return receipt;
end $function$;

do $repair$
declare p record; inserted boolean; reward jsonb;
begin
for p in select distinct on(patrol.user_id,coalesce(patrol.course_id,patrol.quest_id)) patrol.* from public.user_patrols patrol join public.tutorial_progress t on t.user_id=patrol.user_id where patrol.progression_kind='TUTORIAL' and t.completed_at<=patrol.started_at and t.step_id in('COMPLETE','AUTHENTICATION') and patrol.battle_result='VICTORY' and patrol.status in('COMPLETED','CLAIMABLE') order by patrol.user_id,coalesce(patrol.course_id,patrol.quest_id),patrol.started_at
loop
perform 1 from public.users where id=p.user_id for update;
inserted:=false;
insert into public.user_quest_first_clears(user_id,quest_id) values(p.user_id,coalesce(p.course_id,p.quest_id)) on conflict do nothing returning true into inserted;
if coalesce(inserted,false) then
reward:=public._grant_quest_progression_first_reward_v1(p.user_id,coalesce(p.course_id,p.quest_id),p.id);
update public.user_patrols set first_clear_reward_receipt=reward where id=p.id;
end if;
end loop;
end $repair$;