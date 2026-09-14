-- User approved all three review proposals. Preview only; do not apply to Production.
-- Prior five migrations are prerequisites, never replayed here.
do $$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260914231249') then
  raise exception 'Expected approved Preview baseline'; end if;
 if (select count(*) from public.canonical_quest_master where version='2026-08-30')<>21 then raise exception 'Quest baseline mismatch';end if;
end $$;
delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id in ('QUEST_SHINJUKU_EASY_20260914','QUEST_SHIBUYA_EASY_20260914','QUEST_IKEBUKURO_EASY_20260914','QUEST_ROPPONGI_EASY_20260914','QUEST_AKIHABARA_EASY_20260914','QUEST_KAWASAKI_EASY_20260914','QUEST_YOKOHAMA_EASY_20260914','QUEST_SHINJUKU_NORMAL_20260914','QUEST_SHIBUYA_NORMAL_20260914','QUEST_IKEBUKURO_NORMAL_20260914','QUEST_ROPPONGI_NORMAL_20260914','QUEST_AKIHABARA_NORMAL_20260914','QUEST_KAWASAKI_NORMAL_20260914','QUEST_YOKOHAMA_NORMAL_20260914','QUEST_SHINJUKU_HARD_20260914','QUEST_SHIBUYA_HARD_20260914','QUEST_IKEBUKURO_HARD_20260914','QUEST_ROPPONGI_HARD_20260914','QUEST_AKIHABARA_HARD_20260914','QUEST_KAWASAKI_HARD_20260914','QUEST_YOKOHAMA_HARD_20260914');
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values
('2026-08-30','QUEST_SHINJUKU_EASY_20260914',1,'CHAR_EXP_S',1,10000),
('2026-08-30','QUEST_SHINJUKU_EASY_20260914',2,'CHAR_EXP_S',1,2000),
('2026-08-30','QUEST_SHIBUYA_EASY_20260914',1,'CHAR_EXP_S',1,8000),
('2026-08-30','QUEST_SHIBUYA_EASY_20260914',2,'EQUIP_EXP_S',1,2000),
('2026-08-30','QUEST_SHIBUYA_EASY_20260914',3,'NORMAL_GACHA_TICKET_SKILL',1,100),
('2026-08-30','QUEST_IKEBUKURO_EASY_20260914',1,'CHAR_EXP_S',1,8000),
('2026-08-30','QUEST_IKEBUKURO_EASY_20260914',2,'EQUIP_EXP_S',1,4000),
('2026-08-30','QUEST_ROPPONGI_EASY_20260914',1,'CHAR_EXP_S',1,8000),
('2026-08-30','QUEST_ROPPONGI_EASY_20260914',2,'EQUIP_EXP_S',1,2000),
('2026-08-30','QUEST_ROPPONGI_EASY_20260914',3,'SKILL_MANUAL',1,200),
('2026-08-30','QUEST_AKIHABARA_EASY_20260914',1,'CHAR_EXP_S',1,8000),
('2026-08-30','QUEST_AKIHABARA_EASY_20260914',2,'EQUIP_EXP_S',1,2000),
('2026-08-30','QUEST_AKIHABARA_EASY_20260914',3,'NORMAL_GACHA_TICKET_RANDOM',1,100),
('2026-08-30','QUEST_KAWASAKI_EASY_20260914',1,'CHAR_EXP_S',1,8000),
('2026-08-30','QUEST_KAWASAKI_EASY_20260914',2,'EQUIP_EXP_S',1,2000),
('2026-08-30','QUEST_KAWASAKI_EASY_20260914',3,'EQUIP_LB_PART',1,200),
('2026-08-30','QUEST_YOKOHAMA_EASY_20260914',1,'CHAR_EXP_S',1,10000),
('2026-08-30','QUEST_YOKOHAMA_EASY_20260914',2,'EQUIP_EXP_S',1,3000),
('2026-08-30','QUEST_SHINJUKU_NORMAL_20260914',1,'CHAR_EXP_M',1,10000),
('2026-08-30','QUEST_SHINJUKU_NORMAL_20260914',2,'CHAR_EXP_M',1,2000),
('2026-08-30','QUEST_SHINJUKU_NORMAL_20260914',3,'EQUIP_EXP_M',1,8000),
('2026-08-30','QUEST_SHINJUKU_NORMAL_20260914',4,'SKILL_MANUAL',1,500),
('2026-08-30','QUEST_SHIBUYA_NORMAL_20260914',1,'CHAR_EXP_M',1,10000),
('2026-08-30','QUEST_SHIBUYA_NORMAL_20260914',2,'EQUIP_EXP_M',1,8000),
('2026-08-30','QUEST_SHIBUYA_NORMAL_20260914',3,'SKILL_MANUAL',1,500),
('2026-08-30','QUEST_SHIBUYA_NORMAL_20260914',4,'NORMAL_GACHA_TICKET_SKILL',1,300),
('2026-08-30','QUEST_IKEBUKURO_NORMAL_20260914',1,'CHAR_EXP_M',1,8000),
('2026-08-30','QUEST_IKEBUKURO_NORMAL_20260914',2,'EQUIP_EXP_M',1,10000),
('2026-08-30','QUEST_IKEBUKURO_NORMAL_20260914',3,'EQUIP_EXP_M',1,2000),
('2026-08-30','QUEST_IKEBUKURO_NORMAL_20260914',4,'SKILL_MANUAL',1,500),
('2026-08-30','QUEST_ROPPONGI_NORMAL_20260914',1,'CHAR_EXP_M',1,10000),
('2026-08-30','QUEST_ROPPONGI_NORMAL_20260914',2,'EQUIP_EXP_M',1,8000),
('2026-08-30','QUEST_ROPPONGI_NORMAL_20260914',3,'SKILL_MANUAL',1,1000),
('2026-08-30','QUEST_AKIHABARA_NORMAL_20260914',1,'CHAR_EXP_M',1,10000),
('2026-08-30','QUEST_AKIHABARA_NORMAL_20260914',2,'EQUIP_EXP_M',1,8000),
('2026-08-30','QUEST_AKIHABARA_NORMAL_20260914',3,'SKILL_MANUAL',1,200),
('2026-08-30','QUEST_AKIHABARA_NORMAL_20260914',4,'NORMAL_GACHA_TICKET_RANDOM',1,300),
('2026-08-30','QUEST_KAWASAKI_NORMAL_20260914',1,'CHAR_EXP_M',1,10000),
('2026-08-30','QUEST_KAWASAKI_NORMAL_20260914',2,'EQUIP_EXP_M',1,8000),
('2026-08-30','QUEST_KAWASAKI_NORMAL_20260914',3,'SKILL_MANUAL',1,200),
('2026-08-30','QUEST_KAWASAKI_NORMAL_20260914',4,'EQUIP_LB_PART',1,300),
('2026-08-30','QUEST_YOKOHAMA_NORMAL_20260914',1,'CHAR_EXP_M',1,10000),
('2026-08-30','QUEST_YOKOHAMA_NORMAL_20260914',2,'EQUIP_EXP_M',1,10000),
('2026-08-30','QUEST_YOKOHAMA_NORMAL_20260914',3,'SKILL_MANUAL',1,500),
('2026-08-30','QUEST_SHINJUKU_HARD_20260914',1,'CHAR_EXP_L',1,10000),
('2026-08-30','QUEST_SHINJUKU_HARD_20260914',2,'CHAR_EXP_L',1,2000),
('2026-08-30','QUEST_SHINJUKU_HARD_20260914',3,'EQUIP_EXP_L',1,8400),
('2026-08-30','QUEST_SHINJUKU_HARD_20260914',4,'SKILL_MANUAL',1,1200),
('2026-08-30','QUEST_SHINJUKU_HARD_20260914',5,'EQUIP_LB_PART',1,1200),
('2026-08-30','QUEST_SHINJUKU_HARD_20260914',6,'NORMAL_GACHA_TICKET_RANDOM',1,300),
('2026-08-30','QUEST_SHIBUYA_HARD_20260914',1,'CHAR_EXP_L',1,10000),
('2026-08-30','QUEST_SHIBUYA_HARD_20260914',2,'EQUIP_EXP_L',1,10000),
('2026-08-30','QUEST_SHIBUYA_HARD_20260914',3,'SKILL_MANUAL',1,1200),
('2026-08-30','QUEST_SHIBUYA_HARD_20260914',4,'EQUIP_LB_PART',1,600),
('2026-08-30','QUEST_SHIBUYA_HARD_20260914',5,'NORMAL_GACHA_TICKET_RANDOM',1,100),
('2026-08-30','QUEST_SHIBUYA_HARD_20260914',6,'NORMAL_GACHA_TICKET_SKILL',1,400),
('2026-08-30','QUEST_IKEBUKURO_HARD_20260914',1,'CHAR_EXP_L',1,8000),
('2026-08-30','QUEST_IKEBUKURO_HARD_20260914',2,'EQUIP_EXP_L',1,10000),
('2026-08-30','QUEST_IKEBUKURO_HARD_20260914',3,'EQUIP_EXP_L',1,1600),
('2026-08-30','QUEST_IKEBUKURO_HARD_20260914',4,'SKILL_MANUAL',1,1200),
('2026-08-30','QUEST_IKEBUKURO_HARD_20260914',5,'EQUIP_LB_PART',1,1200),
('2026-08-30','QUEST_IKEBUKURO_HARD_20260914',6,'NORMAL_GACHA_TICKET_RANDOM',1,300),
('2026-08-30','QUEST_ROPPONGI_HARD_20260914',1,'CHAR_EXP_L',1,10000),
('2026-08-30','QUEST_ROPPONGI_HARD_20260914',2,'EQUIP_EXP_L',1,10000),
('2026-08-30','QUEST_ROPPONGI_HARD_20260914',3,'SKILL_MANUAL',1,2000),
('2026-08-30','QUEST_ROPPONGI_HARD_20260914',4,'EQUIP_LB_PART',1,600),
('2026-08-30','QUEST_ROPPONGI_HARD_20260914',5,'NORMAL_GACHA_TICKET_RANDOM',1,100),
('2026-08-30','QUEST_AKIHABARA_HARD_20260914',1,'CHAR_EXP_L',1,10000),
('2026-08-30','QUEST_AKIHABARA_HARD_20260914',2,'EQUIP_EXP_L',1,10000),
('2026-08-30','QUEST_AKIHABARA_HARD_20260914',3,'SKILL_MANUAL',1,900),
('2026-08-30','QUEST_AKIHABARA_HARD_20260914',4,'EQUIP_LB_PART',1,900),
('2026-08-30','QUEST_AKIHABARA_HARD_20260914',5,'NORMAL_GACHA_TICKET_RANDOM',1,900),
('2026-08-30','QUEST_KAWASAKI_HARD_20260914',1,'CHAR_EXP_L',1,10000),
('2026-08-30','QUEST_KAWASAKI_HARD_20260914',2,'EQUIP_EXP_L',1,10000),
('2026-08-30','QUEST_KAWASAKI_HARD_20260914',3,'SKILL_MANUAL',1,600),
('2026-08-30','QUEST_KAWASAKI_HARD_20260914',4,'EQUIP_LB_PART',1,2000),
('2026-08-30','QUEST_KAWASAKI_HARD_20260914',5,'NORMAL_GACHA_TICKET_RANDOM',1,100),
('2026-08-30','QUEST_YOKOHAMA_HARD_20260914',1,'CHAR_EXP_L',1,10000),
('2026-08-30','QUEST_YOKOHAMA_HARD_20260914',2,'EQUIP_EXP_L',1,10000),
('2026-08-30','QUEST_YOKOHAMA_HARD_20260914',3,'SKILL_MANUAL',1,1200),
('2026-08-30','QUEST_YOKOHAMA_HARD_20260914',4,'EQUIP_LB_PART',1,1200),
('2026-08-30','QUEST_YOKOHAMA_HARD_20260914',5,'NORMAL_GACHA_TICKET_RANDOM',1,300);

alter table public.user_patrols add column base_cash_snapshot bigint check(base_cash_snapshot>=0);
-- Only unclaimed canonical patrols. Preserve completed receipts and hometown snapshots.
update public.user_patrols p set base_cash_snapshot=case
 when p.started_at<'2026-09-14 17:43:40+00'::timestamptz then
  case q.difficulty when 'EASY' then 600 when 'NORMAL' then 1200 when 'HARD' then 2000 end
 else q.cash_reward end
from public.canonical_quest_master q where q.version='2026-08-30'
 and q.quest_id=coalesce(p.course_id,p.quest_id) and p.status<>'COMPLETED';
create function public.on_quest_base_cash_snapshot() returns trigger
language plpgsql security definer set search_path to 'pg_catalog' as $$
begin
 if TG_OP='INSERT' then
  select cash_reward into new.base_cash_snapshot from public.canonical_quest_master
   where version='2026-08-30' and quest_id=coalesce(new.course_id,new.quest_id);
 elsif new.base_cash_snapshot is distinct from old.base_cash_snapshot then
  raise exception 'Quest base CASH snapshot is immutable' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.on_quest_base_cash_snapshot() from public,anon,authenticated;
create trigger quest_base_cash_snapshot before insert or update on public.user_patrols
 for each row execute function public.on_quest_base_cash_snapshot();
CREATE OR REPLACE FUNCTION public.claim_patrol_rewards(p_patrol_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_uid uuid:=auth.uid();
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
 select patrol.*,quest.display_name,quest.user_exp,quest.reward_pool_id,patrol.base_cash_snapshot as cash_reward
 into v_patrol
 from public.user_patrols patrol
 join public.canonical_quest_master quest
   on quest.version='2026-08-30'
  and quest.quest_id=coalesce(patrol.course_id,patrol.quest_id)
  and quest.is_production_enabled
 where patrol.id=p_patrol_id and patrol.user_id=v_uid
 for update of patrol;
 if not found then raise exception 'patrol not found' using errcode='P0002'; end if;
 if v_patrol.status='COMPLETED' then raise exception 'patrol rewards already claimed' using errcode='23505'; end if;
 if v_patrol.status<>'CLAIMABLE' and v_patrol.expires_at>now() then raise exception 'patrol is not complete' using errcode='23514'; end if;
 if v_patrol.has_battle_event and not coalesce(v_patrol.battle_resolved,false) then raise exception 'patrol battle must be resolved before claiming rewards' using errcode='23514'; end if;
 insert into public.user_quest_first_clears(user_id,quest_id)
 values(v_uid,coalesce(v_patrol.course_id,v_patrol.quest_id))
 on conflict do nothing returning true into v_first;
 v_first:=coalesce(v_first,false);
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
 set status='COMPLETED',
     rewards_accrued=jsonb_build_object('course_name',v_patrol.display_name,'cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first)
 where id=p_patrol_id;
 perform public.evaluate_mission_progress(v_uid,'PATROL_CLEAR',1);
 return jsonb_build_object('status','success','patrol_id',p_patrol_id,'course_name',v_patrol.display_name,'cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up');
end $function$
;
CREATE OR REPLACE FUNCTION public._quest_raid_cash_xp_v2(p_patrol uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select jsonb_build_object('cash',coalesce((p.rewards_accrued->>'base_cash')::bigint,p.base_cash_snapshot,q.cash_reward::bigint),
 'userXp',floor(coalesce((p.rewards_accrued->>'xp')::numeric,q.user_exp::numeric)*0.5)::integer)
 from public.user_patrols p join public.canonical_quest_master q
 on q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id) where p.id=p_patrol
$function$
;

alter table public.raid_room_clear_reward_rules add column minimum_contribution_bp integer
 check(minimum_contribution_bp between 0 and 10000);
-- minimum_contribution_damage=0 preserves the configured flag used by existing issuers.
-- The actual minimum is calculated from the Instance's persisted max_hp below.
update public.raid_room_clear_reward_rules set enabled=true,minimum_contribution_damage=0,
 minimum_contribution_bp=case difficulty when 'advanced' then 300 when 'expert' then 500 else 0 end;
CREATE OR REPLACE FUNCTION public._raid_room_clear_reward_progress_v1(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_count bigint:=0;v_damage bigint:=0;v_status text;v_min bigint;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id;
 select count(*),coalesce(sum(greatest(coalesce(l.applied_damage,0),0)),0) into v_count,v_damage
 from public.raid_damage_logs l
 join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id 
 join public.raid_rooms sr on sr.id=s.room_id and sr.raid_boss_instance_id=v_room.raid_boss_instance_id
 join public.raid_room_members m on m.room_id=sr.id and m.user_id=p_user_id
 where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
  and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
  and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
  and b.official_context->>'roomId'=sr.id::text
  and b.finalization_status='FINALIZED'
  and b.finalization_result->'lateFinalization'='false'::jsonb; -- Server non-late flag includes the killing battle; finalized_at is written after cleared_at.
 v_min:=ceil(v_boss.max_hp::numeric*v_rule.minimum_contribution_bp/10000)::bigint;
 if not coalesce(v_rule.enabled,false) or v_min is null then v_status:='unknown';
 elsif v_count>0 and (v_room.difficulty_id in ('beginner','intermediate') or v_damage>=v_min) and v_boss.outcome='DEFEAT_SUCCESS' then v_status:='succeeded';
 else v_status:='not_succeeded';end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'clearGate',jsonb_build_object('status',v_status,'ruleVersion',coalesce(v_rule.rule_version,1),
   'contributionDamage',v_damage,'minimumContributionDamage',v_min,'minimumContributionBp',v_rule.minimum_contribution_bp,
   'comparison','GTE','metric','APPLIED','maxHp',v_boss.max_hp,
   'cleared',coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $function$
;
CREATE OR REPLACE FUNCTION public.get_raid_reward_policy_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 return (select jsonb_agg(jsonb_build_object(
 'difficulty',r.difficulty,'enabled',r.enabled and r.minimum_contribution_damage is not null,
 'status',case when r.enabled and r.minimum_contribution_damage is not null then 'ACTIVE' else 'PENDING_CONTRIBUTION' end,
 'version',r.rule_version,
 'eligibility',jsonb_build_object('minimumBattles',1,'minimumContributionBp',r.minimum_contribution_bp,'metric','APPLIED','comparison','GTE'),
 'strategyVersion',case when (select count(*) from public.raid_room_combat_profiles p where p.difficulty_id=r.difficulty and p.profile->>'strategyVersion'='2026-09-14')=7 then '2026-09-14' else null end,
 'instanceItems',(select jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty),
 'daily',jsonb_build_object('chanceBp',d.chance_bp,'items',d.items)
 ) order by r.difficulty) from public.raid_room_clear_reward_rules r join public.raid_daily_clear_bonus_rules d using(difficulty));
end $function$
;
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.start_patrol(p_course_id text, p_character_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_character text; v_q record; v_id uuid; v_active integer; v_vitality integer;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_q from public.canonical_quest_master where version='2026-08-30' and quest_id=p_course_id and is_production_enabled;
 if not found then raise exception 'quest not found' using errcode='23503'; end if;
 if not public.canonical_quest_is_unlocked(v_uid,p_course_id) then raise exception 'quest is locked' using errcode='23514'; end if;
 select owned.character_id into v_character from public.user_characters owned where owned.user_id=v_uid and(owned.id::text=p_character_id or owned.character_id=p_character_id) order by(owned.id::text=p_character_id)desc limit 1;
 if v_character is null then raise exception 'character is not owned' using errcode='23503'; end if;
 perform 1 from public.users where id=v_uid for update;
 select count(*) into v_active from public.user_patrols where user_id=v_uid and status<>'COMPLETED'; if v_active>=5 then raise exception 'all dispatch slots are occupied' using errcode='23514'; end if;
 if exists(select 1 from public.user_patrols where user_id=v_uid and character_id=v_character and status<>'COMPLETED') then raise exception 'character is already dispatched' using errcode='23505'; end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid); select vitality into v_vitality from public.users where id=v_uid for update;
 if coalesce(v_vitality,0)<v_q.vitality_cost then raise exception 'insufficient vitality' using errcode='23514'; end if;
 insert into public.user_patrols(user_id,course_id,character_id,started_at,expires_at,status,has_battle_event,battle_resolved) values(v_uid,p_course_id,v_character,now(),now()+v_q.duration_sec*interval '1 second','ONGOING',true,false) returning id into v_id;
 update public.users set vitality=vitality-v_q.vitality_cost,vitality_last_recovered_at=case when vitality>=50 then now() else vitality_last_recovered_at end where id=v_uid;
 return jsonb_build_object('status','success','base_cash_snapshot',(select base_cash_snapshot from public.user_patrols where id=v_id),'hometown_bonus_snapshot',(select hometown_bonus_snapshot from public.user_patrols where id=v_id),'patrol_id',v_id,'has_battle',true,'duration_seconds',v_q.duration_sec,'cost_vitality',v_q.vitality_cost,'remaining_vitality',v_vitality-v_q.vitality_cost);
end $function$
;
