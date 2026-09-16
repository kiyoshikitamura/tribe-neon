-- Quest progression runtime. Apply after master and activation schema migrations.
begin;
alter table public.user_patrols add column if not exists progression_kind text not null default 'LEGACY';
alter table public.user_patrols add column if not exists active_replay_id uuid;
alter table public.user_patrols add column if not exists exploration_reward_receipt jsonb;
alter table public.user_patrols add column if not exists first_clear_reward_receipt jsonb;

create or replace function public.quest_progression_enabled_v1(p_user_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.quest_progression_user_versions where user_id=p_user_id and progression_version='2026-09-16')
$$;
revoke all on function public.quest_progression_enabled_v1(uuid) from public,anon,authenticated;

alter function public.start_patrol(text,text) rename to start_patrol_pre_progression_v1;
alter function public.claim_patrol_rewards(uuid) rename to claim_patrol_rewards_pre_progression_v1;
alter function public.create_patrol_battle_replay(uuid,text) rename to create_patrol_battle_replay_pre_progression_v1;
alter function public.get_canonical_quest_progression() rename to get_canonical_quest_progression_pre_progression_v1;
alter function public.canonical_quest_is_unlocked(uuid,text) rename to canonical_quest_is_unlocked_pre_progression_v1;
revoke all on function public.start_patrol_pre_progression_v1(text,text), public.claim_patrol_rewards_pre_progression_v1(uuid), public.create_patrol_battle_replay_pre_progression_v1(uuid,text),public.get_canonical_quest_progression_pre_progression_v1(),public.canonical_quest_is_unlocked_pre_progression_v1(uuid,text) from public,anon,authenticated;

create or replace function public.canonical_quest_is_unlocked(p_user_id uuid,p_quest_id text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare previous_id text;
begin
 if not public.quest_progression_enabled_v1(p_user_id) then return public.canonical_quest_is_unlocked_pre_progression_v1(p_user_id,p_quest_id);end if;
 if not exists(select 1 from public.canonical_quest_master where version='2026-08-30' and quest_id=p_quest_id and is_production_enabled) then return false;end if;
 select prev.quest_id into previous_id from public.canonical_quest_master target join public.canonical_quest_master prev
 on prev.version=target.version and prev.display_order<target.display_order and prev.is_production_enabled
 where target.version='2026-08-30' and target.quest_id=p_quest_id order by prev.display_order desc limit 1;
 return previous_id is null or exists(select 1 from public.user_quest_first_clears where user_id=p_user_id and quest_id=previous_id);
end $$;

create or replace function public.get_canonical_quest_progression() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 if not public.quest_progression_enabled_v1(auth.uid()) then return public.get_canonical_quest_progression_pre_progression_v1();end if;
 select coalesce(jsonb_agg(jsonb_build_object('quest_id',m.quest_id,'progression_enabled',true,
 'stage_order',m.display_order,'unlock_condition',m.unlock_condition,
 'is_unlocked',public.canonical_quest_is_unlocked(auth.uid(),m.quest_id),
 'is_first_cleared',exists(select 1 from public.user_quest_first_clears c where c.user_id=auth.uid() and c.quest_id=m.quest_id),
 'boss_patrol_id',p.id,'boss_ready',coalesce(p.expires_at<=now() and p.battle_result is distinct from 'VICTORY',false),
 'last_battle_result',p.battle_result,'enemy_tactic','BALANCED','enemy_member_count',case when m.difficulty='EASY' then 3 else 5 end,
 'enemy_members','[]'::jsonb,'enemy_attributes','[]'::jsonb) order by m.display_order),'[]'::jsonb) into result
 from public.canonical_quest_master m left join lateral(select x.* from public.user_patrols x where x.user_id=auth.uid()
 and coalesce(x.course_id,x.quest_id)=m.quest_id and x.progression_kind='FIRST_CLEAR' and x.status in('ONGOING','CLAIMABLE') order by x.started_at desc limit 1)p on true
 where m.version='2026-08-30' and m.is_production_enabled;
 return result;
end $$;

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
 v_kind:=case when not exists(select 1 from public.tutorial_progress where user_id=v_uid and step_id='COMPLETE') then 'TUTORIAL' when exists(select 1 from public.user_quest_first_clears where user_id=v_uid and quest_id=p_course_id) then 'REPEAT' else 'FIRST_CLEAR' end;
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
end $function$
;

CREATE OR REPLACE FUNCTION public._claim_quest_exploration_v1(p_user_id uuid,p_patrol_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_uid uuid:=p_user_id;
 v_patrol record;
 v_first boolean:=false;
 v_item record;
 v_items jsonb:='[]';
 v_xp jsonb;
 v_total_xp integer;
 v_cash bigint;
 v_bonus jsonb;
 v_bonus_cash bigint;
 v_drop_bp integer;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select patrol.*,quest.display_name,quest.difficulty,quest.progression_normal_reward_timing,case when patrol.progression_kind='TUTORIAL' then quest.user_exp else coalesce(quest.progression_user_exp,quest.user_exp) end as user_exp,case when patrol.progression_kind='TUTORIAL' then quest.reward_pool_id else coalesce(quest.progression_reward_pool_id,quest.reward_pool_id) end as reward_pool_id,case when patrol.progression_kind='TUTORIAL' then patrol.base_cash_snapshot else coalesce(quest.progression_cash_reward,patrol.base_cash_snapshot) end as cash_reward
 into v_patrol
 from public.user_patrols patrol
 join public.canonical_quest_master quest
   on quest.version='2026-08-30'
  and quest.quest_id=coalesce(patrol.course_id,patrol.quest_id)
  and quest.is_production_enabled
 where patrol.id=p_patrol_id and patrol.user_id=v_uid
 for update of patrol;
 if not found then raise exception 'patrol not found' using errcode='P0002'; end if;
 if v_patrol.status not in ('ONGOING','CLAIMABLE','COMPLETED') then raise exception 'inactive patrol' using errcode='23514';end if;
 if v_patrol.exploration_reward_receipt is not null then return v_patrol.exploration_reward_receipt;end if;
 if v_patrol.status='COMPLETED' then raise exception 'patrol is already completed' using errcode='23514';end if;
 if v_patrol.expires_at>now() and v_patrol.status<>'CLAIMABLE' then raise exception 'patrol is not complete' using errcode='23514';end if;
 if v_patrol.progression_kind='TUTORIAL' and (not coalesce(v_patrol.battle_resolved,false) or v_patrol.battle_result is distinct from 'VICTORY') then raise exception 'tutorial battle not won' using errcode='23514';end if;
 if v_patrol.progression_kind='FIRST_CLEAR' and v_patrol.progression_normal_reward_timing='BOSS_VICTORY' and v_patrol.battle_result is distinct from 'VICTORY' then return jsonb_build_object('cash',0,'xp',0,'items','[]'::jsonb,'deferred',true);end if;
 v_total_xp:=v_patrol.user_exp;
 v_bonus:=v_patrol.hometown_bonus_snapshot;
 if v_bonus is null then raise exception 'hometown snapshot missing' using errcode='23514'; end if;
 v_bonus_cash:=(v_bonus->>'cash')::bigint;
 v_drop_bp:=(v_bonus->>'drop_bonus_bp')::integer;
 if v_patrol.cash_reward is null then raise exception 'Quest base CASH snapshot missing' using errcode='23514';end if;
 v_cash:=v_patrol.cash_reward+v_bonus_cash;
 for v_item in
   select * from public.canonical_quest_reward_pool_items item
   where item.version='2026-08-30' and item.reward_pool_id=v_patrol.reward_pool_id
   order by item.roll_index
 loop
   if v_item.probability_bp>0 and floor(random()*10000)::integer<least(10000,v_item.probability_bp+v_drop_bp) then
     v_item.item_id:=public.resolve_canonical_reward_item(v_item.item_id);
     perform public._grant_gameplay_reward_v1(v_uid,'QUEST_DROP',p_patrol_id::text||':'||v_item.roll_index::text,v_item.item_id,v_item.quantity);
     v_items:=v_items||jsonb_build_array(jsonb_build_object('item_id',v_item.item_id,'quantity',v_item.quantity));
   end if;
 end loop;
 if v_cash>0 then
   update public.users set cash=cash+v_cash where id=v_uid;
 end if;
 v_xp:=public.apply_user_xp(v_uid,v_total_xp);
 update public.user_patrols
 set exploration_reward_receipt=jsonb_build_object('course_name',v_patrol.display_name,'outcome','VICTORY','cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',false,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up')
 where id=p_patrol_id;
 if v_patrol.progression_kind<>'FIRST_CLEAR' then perform public.evaluate_mission_progress(v_uid,'PATROL_CLEAR',1);end if;
 if v_patrol.difficulty='HARD' and v_patrol.has_battle_event and v_patrol.battle_result='VICTORY' then
   perform public.evaluate_mission_progress(v_uid,'QUEST_HARD_COMPLETE_COUNT',1);
 end if;
 return jsonb_build_object('status','success','patrol_id',p_patrol_id,'course_name',v_patrol.display_name,'outcome','VICTORY','cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up');
end $function$;

create or replace function public.claim_patrol_rewards(p_patrol_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.user_patrols%rowtype; receipt jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 perform 1 from public.users where id=auth.uid() for update;
 select * into p from public.user_patrols where id=p_patrol_id and user_id=auth.uid() for update;
 if not found then raise exception 'patrol not found' using errcode='P0002';end if;
 if p.status not in('ONGOING','CLAIMABLE','COMPLETED') then raise exception 'inactive patrol' using errcode='23514';end if;
 if p.progression_kind='LEGACY' then return public.claim_patrol_rewards_pre_progression_v1(p_patrol_id);end if;
 if p.status='COMPLETED' then return p.rewards_accrued||jsonb_build_object('status','success','patrol_id',p.id,'already_claimed',true);end if;
 receipt:=public._claim_quest_exploration_v1(auth.uid(),p.id);
 if p.progression_kind='FIRST_CLEAR' and p.battle_result is distinct from 'VICTORY' then
  return receipt||jsonb_build_object('status','success','patrol_id',p.id,'outcome',coalesce(p.battle_result,'BOSS_READY'),'retryable',true,'boss_ready',true);
 end if;
 receipt:=coalesce(p.rewards_accrued,receipt)||jsonb_build_object('status','success','patrol_id',p.id);
 update public.user_patrols set status='COMPLETED',rewards_accrued=receipt where id=p.id;
 return receipt;
end $$;

create or replace function public.create_patrol_battle_replay(p_patrol_id uuid,p_tactic_id text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.user_patrols%rowtype; previous public.battle_replay_sessions%rowtype; result jsonb; replay_id uuid; stats jsonb; multiplier integer; enemy jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 perform 1 from public.users where id=auth.uid() for update;
 select * into p from public.user_patrols where id=p_patrol_id and user_id=auth.uid() for update;
 if not found then raise exception 'patrol not found' using errcode='P0002';end if;
 if p.progression_kind='LEGACY' then return public.create_patrol_battle_replay_pre_progression_v1(p_patrol_id,p_tactic_id);end if;
 if p.status not in('ONGOING','CLAIMABLE') or p.expires_at>now() or not p.has_battle_event or p.battle_result='VICTORY' then raise exception 'eligible patrol encounter not found' using errcode='23514';end if;
 if p.active_replay_id is not null then
  select * into previous from public.battle_replay_sessions where id=p.active_replay_id;
  if previous.status='RESOLVED' then
   perform public.finalize_quest_progression_battle_v1(previous.id);
   select * into p from public.user_patrols where id=p.id;
   if p.battle_result='VICTORY' then raise exception 'stage already cleared' using errcode='23514';end if;
  end if;
  if previous.status='PENDING' then return jsonb_build_object('replay_session_id',previous.id,'player_snapshot',previous.player_snapshot,'enemy_snapshot',previous.enemy_snapshot,'enemy_tactic',previous.enemy_tactic_id);end if;
 end if;
 if p.progression_kind='FIRST_CLEAR' then perform public._claim_quest_exploration_v1(auth.uid(),p.id);end if;
 update public.user_patrols set battle_resolved=false,battle_result=null,status='CLAIMABLE' where id=p.id;
 result:=public.create_patrol_battle_replay_pre_progression_v1(p.id,p_tactic_id);
 replay_id:=(result->>'replay_session_id')::uuid;
 if p.progression_kind='FIRST_CLEAR' then
  select progression_boss_stats,progression_boss_stat_multiplier_bp into stats,multiplier from public.canonical_quest_master where version='2026-08-30' and quest_id=coalesce(p.course_id,p.quest_id);
  select jsonb_agg(member||jsonb_build_object('stats',coalesce(stats,jsonb_build_object(
   'hp',greatest(1,round((member->'stats'->>'hp')::numeric*coalesce(multiplier,10000)/10000)),
   'atk',greatest(1,round((member->'stats'->>'atk')::numeric*coalesce(multiplier,10000)/10000)),
   'def',greatest(1,round((member->'stats'->>'def')::numeric*coalesce(multiplier,10000)/10000)),
   'spd',(member->'stats'->'spd'),'luk',(member->'stats'->'luk')))) order by ord) into enemy
  from jsonb_array_elements(result->'enemy_snapshot') with ordinality e(member,ord);
  update public.battle_replay_sessions set enemy_snapshot=enemy where id=replay_id;
  result:=result||jsonb_build_object('enemy_snapshot',enemy);
 end if;
 if p.progression_kind='FIRST_CLEAR' and exists(select 1 from public.quest_raid_encounter_settings where singleton and enabled) then
  insert into public.quest_raid_encounters(patrol_id,user_id,area_id)
   select p.id,p.user_id,public.quest_town_key(town_id) from public.canonical_quest_master where version='2026-08-30' and quest_id=coalesce(p.course_id,p.quest_id)
   on conflict do nothing;
 end if;
 update public.user_patrols set active_replay_id=replay_id where id=p.id;
 return result;
end $$;

-- Service-only settlement. The saved server replay is the only source of outcome.
create or replace function public.finalize_quest_progression_battle_v1(p_replay_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
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
 if p.progression_kind='FIRST_CLEAR' then
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
end $$;

-- Raid occurrence retains the existing resolver/rates and rolls only once per exploration.
create or replace function public.capture_quest_raid_encounter_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_area text;
begin
 if new.progression_kind='LEGACY' then
  if new.status is distinct from 'COMPLETED' or old.status='COMPLETED' or new.battle_result is distinct from 'VICTORY' or not coalesce(new.battle_resolved,false) or not coalesce(new.has_battle_event,false) then return new;end if;
 elsif new.progression_kind not in('FIRST_CLEAR','REPEAT') or new.exploration_reward_receipt is null or old.exploration_reward_receipt is not null then return new;
 end if;
 if not exists(select 1 from public.quest_raid_encounter_settings where singleton and enabled) or not exists(select 1 from public.tutorial_progress where user_id=new.user_id and step_id='COMPLETE') then return new;end if;
 select public.quest_town_key(town_id) into v_area from public.canonical_quest_master where version='2026-08-30' and quest_id=coalesce(new.course_id,new.quest_id) and is_production_enabled;
 if v_area is not null then insert into public.quest_raid_encounters(patrol_id,user_id,area_id) values(new.id,new.user_id,v_area) on conflict do nothing;end if;
 return new;
end $$;
drop trigger if exists capture_quest_raid_encounter_v1 on public.user_patrols;
create trigger capture_quest_raid_encounter_v1 after update of status,exploration_reward_receipt on public.user_patrols for each row execute function public.capture_quest_raid_encounter_v1();

revoke all on function public._claim_quest_exploration_v1(uuid,uuid),public.finalize_quest_progression_battle_v1(uuid) from public,anon,authenticated;
grant execute on function public.finalize_quest_progression_battle_v1(uuid) to service_role;
revoke all on function public.start_patrol(text,text),public.claim_patrol_rewards(uuid),public.create_patrol_battle_replay(uuid,text),public.get_canonical_quest_progression(),public.canonical_quest_is_unlocked(uuid,text) from public,anon;
grant execute on function public.start_patrol(text,text),public.claim_patrol_rewards(uuid),public.create_patrol_battle_replay(uuid,text),public.get_canonical_quest_progression() to authenticated;
revoke execute on function public.canonical_quest_is_unlocked(uuid,text) from authenticated;
grant execute on function public.canonical_quest_is_unlocked(uuid,text) to service_role;
create or replace function public.get_patrol_battle_enemy(p_patrol_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_patrol public.user_patrols%rowtype;
  v_first_member jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select patrol.*
  into v_patrol
  from public.user_patrols patrol
  where patrol.id = p_patrol_id
    and patrol.user_id = v_user_id
    and (
      patrol.status = 'CLAIMABLE'
      or (patrol.status = 'ONGOING' and patrol.expires_at <= now())
    )
    and patrol.has_battle_event = true
    and (coalesce(patrol.battle_resolved, false) = false or (patrol.progression_kind in('FIRST_CLEAR','TUTORIAL') and patrol.battle_result='DEFEAT'))
    and patrol.encounter_snapshot is not null
  limit 1;

  if not found then
    raise exception 'eligible patrol encounter not found' using errcode = 'P0002';
  end if;

  v_first_member := v_patrol.encounter_snapshot->'members'->0;
  return jsonb_build_object(
    'id', coalesce(v_patrol.encounter_snapshot->>'encounterId', v_patrol.id::text),
    'quest_id', coalesce(v_patrol.course_id, v_patrol.quest_id),
    'npc_name', 'Canonical NPC Party',
    'npc_level', coalesce((v_first_member->>'level')::integer, 1),
    'encounter_rate', 1,
    'enemy_data', v_patrol.encounter_snapshot
  );
end;
$$;



commit;
notify pgrst,'reload schema';
