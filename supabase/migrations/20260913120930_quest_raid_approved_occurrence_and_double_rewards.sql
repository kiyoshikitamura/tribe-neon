-- Approved 2026-09-13: first roll 10%, 11th after ten misses, normal Room rewards x2.
-- No historical bonus backfill. Existing created/drawn rooms retain their previous contract.
begin;
alter table public.quest_raid_encounters add column reward_multiplier integer not null default 1 check(reward_multiplier in (1,2));
update public.quest_raid_encounter_settings set enabled=false, version=2, probability_bp=1000, guaranteed_after=11,
 personal_active_limit=1,allow_outside_daily=true,beginner_weight=50,intermediate_weight=35,advanced_weight=15 where singleton;
alter table public.quest_raid_encounter_settings alter column probability_bp set default 1000, alter column guaranteed_after set default 11, alter column allow_outside_daily set default true;
create or replace function public.resolve_quest_raid_encounter_v1(p_patrol_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 uid uuid:=auth.uid(); e public.quest_raid_encounters%rowtype; cfg public.quest_raid_encounter_settings%rowtype;
 progress public.quest_raid_encounter_progress%rowtype; variant public.canonical_raid_variants%rowtype;
 rule public.raid_room_lifecycle_rules%rowtype; power bigint; lvl integer; options jsonb:='[]'; opt jsonb;
 total_weight integer:=0; draw integer; instance_id uuid; new_room uuid; created_time timestamptz; bonus jsonb; active_count integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 -- Same lock order as manual creation. Claims do not lock Encounter progress.
 select level into lvl from public.users where id=uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 select * into e from public.quest_raid_encounters where patrol_id=p_patrol_id and user_id=uid for update;
 if not found then return jsonb_build_object('status','NO_ENCOUNTER','patrolId',p_patrol_id);end if;
 if e.status in ('CREATED','NO_ENCOUNTER') then return public.quest_raid_encounter_projection_v1(p_patrol_id);end if;
 select * into cfg from public.quest_raid_encounter_settings where singleton for share;
 if not cfg.enabled or not exists(select 1 from public.raid_room_creation_settings where singleton and enabled) or lvl<5 then
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
 end if;
 select count(*) into active_count from public.quest_raid_encounters x join public.raid_rooms r on r.id=x.room_id
 join public.raid_bosses b on b.id=r.raid_boss_instance_id where x.user_id=uid and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() and b.outcome_finalized_at is null;
 if active_count>=cfg.personal_active_limit then
  if e.status='PENDING' then update public.quest_raid_encounters set status='NO_ENCOUNTER' where patrol_id=p_patrol_id;end if;
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
 end if;
 power:=public.calculate_user_total_power(uid);
 insert into public.quest_raid_encounter_progress(user_id) values(uid) on conflict do nothing;
 select * into progress from public.quest_raid_encounter_progress where user_id=uid for update;
 if e.status='PENDING' then
  select * into variant from public.canonical_raid_variants where lower(area_id)=e.area_id and is_production_enabled order by raid_variant_id limit 1;
  if not found then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
  if not cfg.allow_outside_daily and not exists(select 1 from jsonb_array_elements(private.raid_daily_targets_v1()->'targets') t where t->>'variantId'=variant.raid_variant_id) then
   return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
  end if;
  for opt in select jsonb_build_object('difficulty',d,'weight',w) from (values ('beginner',cfg.beginner_weight),('intermediate',cfg.intermediate_weight),('advanced',cfg.advanced_weight)) a(d,w) where w>0 loop
   if (public._raid_room_power_gate_v1(opt->>'difficulty',power)->>'status')='passed' then
    options:=options||jsonb_build_array(opt);total_weight:=total_weight+(opt->>'weight')::integer;
   end if;
  end loop;
  if total_weight=0 then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
  draw:=floor(random()*total_weight)::integer;
  for opt in select * from jsonb_array_elements(options) loop
   draw:=draw-(opt->>'weight')::integer;
   if draw<0 then e.difficulty:=opt->>'difficulty';exit;end if;
  end loop;
  -- Capacity is checked before the occurrence roll so cap failures do not consume the guarantee.
  select * into rule from public.raid_room_lifecycle_rules where difficulty=e.difficulty for update;
  select count(*) into active_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
   where r.difficulty_id=e.difficulty and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() and b.outcome_finalized_at is null;
  if active_count>=rule.max_active_rooms then
   update public.quest_raid_encounters set status='NO_ENCOUNTER' where patrol_id=p_patrol_id;
   return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
  end if;
  if progress.misses<cfg.guaranteed_after-1 and floor(random()*10000)>=cfg.probability_bp then
   update public.quest_raid_encounters set status='NO_ENCOUNTER',rule_version=cfg.version where patrol_id=p_patrol_id;
   update public.quest_raid_encounter_progress set misses=misses+1 where user_id=uid;
   return public.quest_raid_encounter_projection_v1(p_patrol_id);
  end if;
  bonus:='[]'::jsonb;
  update public.quest_raid_encounters set status='DRAWN',difficulty=e.difficulty,variant_id=variant.raid_variant_id,rule_version=cfg.version,bonus_items=bonus,reward_multiplier=2 where patrol_id=p_patrol_id returning * into e;
 end if;
 -- Once drawn, retry the same difficulty/Boss. Never reroll a failed creation.
 select * into variant from public.canonical_raid_variants where raid_variant_id=e.variant_id and is_production_enabled;
 if not found or (public._raid_room_power_gate_v1(e.difficulty,power)->>'status') is distinct from 'passed' then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
 select * into rule from public.raid_room_lifecycle_rules where difficulty=e.difficulty for update;
 select count(*) into active_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where r.difficulty_id=e.difficulty and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() and b.outcome_finalized_at is null;
 if active_count>=rule.max_active_rooms then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
 -- Registration, lifecycle, battle and membership remain the existing Raid authority.
 begin
  instance_id:=gen_random_uuid();created_time:=clock_timestamp();
  insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
  values(instance_id,variant.raid_variant_id,variant.raid_variant_id,variant.max_hp,variant.max_hp,lower(variant.area_id),'ACTIVE',created_time,created_time+make_interval(hours=>rule.duration_hours),gen_random_uuid(),(created_time at time zone 'Asia/Tokyo')::date,variant.raid_variant_id,'ROOM:'||instance_id::text);
  new_room:=(public._raid_room_register_v1(instance_id,uid,e.difficulty)->>'roomId')::uuid;
  update public.quest_raid_encounters set status='CREATED',room_id=new_room where patrol_id=p_patrol_id;
  update public.quest_raid_encounter_progress set first_created=true,misses=0 where user_id=uid;
 exception when others then
  -- Keep DRAWN on generation failure. The Quest reward was a separate committed transaction.
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id,'reason','CREATE_FAILED');
 end;
 return public.quest_raid_encounter_projection_v1(p_patrol_id);
end $$;
create or replace function public.quest_raid_encounter_projection_v1(p_patrol_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('patrolId',e.patrol_id,'status',e.status,'roomId',e.room_id,'areaId',e.area_id,
 'difficulty',e.difficulty,'bossName',v.raid_name,'leaderId',v.member_character_ids->>0,
 'rewardMultiplier',e.reward_multiplier,'bonusItems',coalesce(e.bonus_items,'[]'::jsonb),'acknowledged',e.acknowledged_at is not null,
 'expiresAt',b.expires_at,'ended',b.id is not null and (b.status<>'ACTIVE' or b.current_hp<=0 or b.expires_at<=now() or b.outcome_finalized_at is not null))
 from public.quest_raid_encounters e left join public.canonical_raid_variants v on v.raid_variant_id=e.variant_id
 left join public.raid_rooms r on r.id=e.room_id left join public.raid_bosses b on b.id=r.raid_boss_instance_id
 where e.patrol_id=p_patrol_id
$$;


create or replace function public.issue_quest_raid_encounter_bonus_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype; item jsonb; inserted integer;
begin
 select * into e from public.quest_raid_encounters where room_id=new.room_id and status='CREATED';
 if not found or e.reward_multiplier=2 then return new;end if;
 insert into public.quest_raid_encounter_bonus_grants(room_id,user_id,rule_version) values(new.room_id,new.user_id,e.rule_version) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return new;end if;
 for item in select * from jsonb_array_elements(e.bonus_items) loop
  insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
  values(new.user_id,item->>'itemId',(item->>'quantity')::integer,'強敵発見ボーナス','UNCLAIMED',now(),now()+interval '30 days','QUEST_RAID_ENCOUNTER',new.room_id::text||':'||(item->>'itemId'),jsonb_build_object('roomId',new.room_id,'ruleVersion',e.rule_version));
 end loop;
 return new;
end $$;
create or replace function public.get_quest_raid_bonus_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 -- Use the same room visibility authority as its existing detail page.
 perform public.get_raid_room_v1(p_room_id);
 select * into e from public.quest_raid_encounters where room_id=p_room_id and status='CREATED';
 if not found then return null;end if;
 return jsonb_build_object('roomId',p_room_id,'rewardMultiplier',e.reward_multiplier,'items',e.bonus_items,'issued',exists(select 1 from public.quest_raid_encounter_bonus_grants where room_id=p_room_id and user_id=auth.uid()));
end $$;

-- Existing receipt/grant keys retain exactly-once authority; base quantity and added quantity are issued atomically.
create or replace function public._issue_raid_room_clear_rewards_v1(p_room_id uuid) returns integer
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled or v_rule.minimum_contribution_damage is null then return 0;end if;
 perform 1 from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity * coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id and status='CREATED'),1)) order by item_id) into v_items
  from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'clearGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_clear_rewards(room_id,user_id,rule_version,
   finalized_battles,contribution_damage,clear_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,v_rule.rule_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'clearGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド討伐報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_CLEAR',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'rewardMultiplier',coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id),1),'ruleVersion',(v_progress->'clearGate'->>'ruleVersion')::bigint))
   returning id into v_present;
   insert into public.raid_room_clear_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

-- Existing receipt/grant keys retain exactly-once authority; base quantity and added quantity are issued atomically.
create or replace function public._issue_raid_room_rescue_rewards_v1(p_room_id uuid) returns integer
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_rescue_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_rescue_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled then return 0;end if;
 perform 1 from public.raid_room_difficulty_rules where difficulty=v_room.difficulty_id for share;
 perform 1 from public.raid_room_rescue_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity * coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id and status='CREATED'),1)) order by item_id) into v_items
  from public.raid_room_rescue_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_rescue_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_rescue_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_rescue_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'rescueGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_rescue_rewards(room_id,user_id,rule_version,reward_version,
   finalized_battles,contribution_damage,rescue_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,(v_progress->'rescueGate'->>'ruleVersion')::bigint,v_rule.reward_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'rescueGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド救援成功報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_RESCUE',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'rewardMultiplier',coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id),1),'ruleVersion',(v_progress->'rescueGate'->>'ruleVersion')::bigint,'rewardVersion',v_rule.reward_version))
   returning id into v_present;
   insert into public.raid_room_rescue_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

commit;

