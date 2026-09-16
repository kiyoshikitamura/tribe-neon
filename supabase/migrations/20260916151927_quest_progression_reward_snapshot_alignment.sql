-- Align progression mission events and immutable exploration/combat snapshots.
begin;
create or replace function public.quest_progression_enemy_snapshot_v1(p_snapshot jsonb,p_quest_id text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare stats jsonb; multiplier integer; members jsonb;
begin
 if p_snapshot->>'progressionBalanceVersion'='2026-09-16' then return p_snapshot;end if;
 select progression_boss_stats,progression_boss_stat_multiplier_bp into stats,multiplier from public.canonical_quest_master where version='2026-08-30' and quest_id=p_quest_id;
 select jsonb_agg(member||jsonb_build_object('stats',coalesce(stats,jsonb_build_object(
  'hp',greatest(1,round((member->'stats'->>'hp')::numeric*coalesce(multiplier,10000)/10000)),
  'atk',greatest(1,round((member->'stats'->>'atk')::numeric*coalesce(multiplier,10000)/10000)),
  'def',greatest(1,round((member->'stats'->>'def')::numeric*coalesce(multiplier,10000)/10000)),
  'spd',member->'stats'->'spd','luk',member->'stats'->'luk'))) order by ord) into members
 from jsonb_array_elements(p_snapshot->'members') with ordinality e(member,ord);
 return p_snapshot||jsonb_build_object('members',members,'progressionBalanceVersion','2026-09-16');
end $$;
revoke all on function public.quest_progression_enemy_snapshot_v1(jsonb,text) from public,anon,authenticated;

create or replace function public.on_canonical_patrol_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$
declare snapshot jsonb;
begin
 snapshot:=public.generate_canonical_quest_encounter_snapshot(new.user_id,coalesce(new.course_id,new.quest_id));
 if new.progression_kind='FIRST_CLEAR' then snapshot:=public.quest_progression_enemy_snapshot_v1(snapshot,coalesce(new.course_id,new.quest_id));end if;
 new.encounter_snapshot:=snapshot;new.encounter_party_signature:=snapshot->>'partySignature';return new;
end $$;

create or replace function public.on_quest_hometown_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$
declare base_cash bigint;
begin
 new.hometown_bonus_snapshot:=public.quest_hometown_snapshot(new.user_id,new.character_id,coalesce(new.course_id,new.quest_id));
 if new.progression_kind in('FIRST_CLEAR','REPEAT') then
  select coalesce(progression_cash_reward,cash_reward) into base_cash from public.canonical_quest_master where version='2026-08-30' and quest_id=coalesce(new.course_id,new.quest_id);
  new.hometown_bonus_snapshot:=new.hometown_bonus_snapshot||jsonb_build_object('cash',floor(base_cash::numeric*coalesce((new.hometown_bonus_snapshot->>'cash_bonus_rate')::numeric,0))::bigint,'progression_base_cash',base_cash);
 end if;
 return new;
end $$;

-- Keep completed receipts immutable. Only align ongoing progression snapshots created before this correction.
update public.user_patrols set encounter_snapshot=public.quest_progression_enemy_snapshot_v1(encounter_snapshot,coalesce(course_id,quest_id))
 where progression_kind='FIRST_CLEAR' and status in('ONGOING','CLAIMABLE') and encounter_snapshot->>'progressionBalanceVersion' is distinct from '2026-09-16';
update public.user_patrols p set hometown_bonus_snapshot=p.hometown_bonus_snapshot||jsonb_build_object(
 'cash',floor(coalesce(q.progression_cash_reward,q.cash_reward)::numeric*coalesce((p.hometown_bonus_snapshot->>'cash_bonus_rate')::numeric,0))::bigint,
 'progression_base_cash',coalesce(q.progression_cash_reward,q.cash_reward))
 from public.canonical_quest_master q where q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id)
 and p.progression_kind in('FIRST_CLEAR','REPEAT') and p.status in('ONGOING','CLAIMABLE') and p.exploration_reward_receipt is null;

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
 if p.progression_kind='FIRST_CLEAR' and exists(select 1 from public.quest_raid_encounter_settings where singleton and enabled) then
  insert into public.quest_raid_encounters(patrol_id,user_id,area_id)
   select p.id,p.user_id,public.quest_town_key(town_id) from public.canonical_quest_master where version='2026-08-30' and quest_id=coalesce(p.course_id,p.quest_id)
   on conflict do nothing;
 end if;
 update public.user_patrols set active_replay_id=replay_id where id=p.id;
 return result;
end $$;


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
 if v_patrol.progression_kind='TUTORIAL' and v_patrol.difficulty='HARD' and v_patrol.has_battle_event and v_patrol.battle_result='VICTORY' then
   perform public.evaluate_mission_progress(v_uid,'QUEST_HARD_COMPLETE_COUNT',1);
 end if;
 return jsonb_build_object('status','success','patrol_id',p_patrol_id,'course_name',v_patrol.display_name,'outcome','VICTORY','cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up');
end $function$;


create or replace function public.capture_quest_progression_hard_complete_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.canonical_quest_master where version='2026-08-30' and quest_id=coalesce(new.course_id,new.quest_id) and difficulty='HARD') then return new;end if;
 if (new.progression_kind='FIRST_CLEAR' and new.battle_result='VICTORY' and old.battle_result is distinct from 'VICTORY' and new.battle_resolved)
 or (new.progression_kind='REPEAT' and new.status='COMPLETED' and old.status is distinct from 'COMPLETED') then
  perform public.evaluate_mission_progress(new.user_id,'QUEST_HARD_COMPLETE_COUNT',1);
 end if;
 return new;
end $$;
revoke all on function public.capture_quest_progression_hard_complete_v1() from public,anon,authenticated;
create trigger quest_progression_hard_complete_v1 after update of status,battle_result on public.user_patrols
 for each row execute function public.capture_quest_progression_hard_complete_v1();
commit;
notify pgrst,'reload schema';
