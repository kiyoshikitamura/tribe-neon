-- Caller supplies BEGIN/ROLLBACK or apply_migration transaction. Production only.
create temp table release_pending_patrol_cash_before on commit drop as
select p.id as patrol_id,q.cash_reward from public.user_patrols p
join public.canonical_quest_master q on q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id)
where p.status<>'COMPLETED';

-- SECTION 01 supabase/migrations/20260911100100_normalize_gacha_stage1.sql


do $$
declare
  v_actual jsonb;
  v_expected constant jsonb := jsonb_build_object(
    'CHAR_NORMAL',  jsonb_build_object('N',10,'R',17,'SR',16,'SSR',7),
    'CHAR_SPECIAL', jsonb_build_object('N',5,'R',17,'SR',16,'SSR',10),
    'SKILL_NORMAL', jsonb_build_object('N',10,'R',10,'SR',15),
    'SKILL_SPECIAL',jsonb_build_object('R',10,'SR',15,'SSR',15),
    'EQUIP_NORMAL', jsonb_build_object('N',34,'R',46,'SR',61),
    'EQUIP_SPECIAL',jsonb_build_object('R',46,'SR',61,'SSR',12)
  );
begin
  select jsonb_object_agg(gacha_id, rarity_counts order by gacha_id)
  into v_actual
  from (
    select gacha_id, jsonb_object_agg(rarity, item_count order by
      array_position(array['N','R','SR','SSR'], rarity)) as rarity_counts
    from (
      select gacha_id, rarity, count(*)::integer as item_count
      from public.gacha_items_master
      where gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
      group by gacha_id, rarity
    ) counts
    group by gacha_id
  ) grouped;

  if v_actual is distinct from v_expected then
    raise exception 'GACHA_STAGE1_POOL_DRIFT expected %, actual %', v_expected, v_actual;
  end if;

  if exists (
    select 1
    from public.gacha_rarity_rates
    where gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
      and (gacha_id, rarity, weight) not in (
      ('CHAR_NORMAL','N',60),('CHAR_NORMAL','R',30),('CHAR_NORMAL','SR',9),('CHAR_NORMAL','SSR',1),
      ('CHAR_SPECIAL','R',70),('CHAR_SPECIAL','SR',27),('CHAR_SPECIAL','SSR',3),
      ('SKILL_NORMAL','N',50),('SKILL_NORMAL','R',30),('SKILL_NORMAL','SR',17),('SKILL_NORMAL','SSR',3),
      ('SKILL_SPECIAL','R',60),('SKILL_SPECIAL','SR',35),('SKILL_SPECIAL','SSR',5),
      ('EQUIP_NORMAL','N',45),('EQUIP_NORMAL','R',30),('EQUIP_NORMAL','SR',20),('EQUIP_NORMAL','SSR',5),
      ('EQUIP_SPECIAL','R',55),('EQUIP_SPECIAL','SR',38),('EQUIP_SPECIAL','SSR',7)
    )
  ) or (select count(*) from public.gacha_rarity_rates where gacha_id in
    ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')) <> 21 then
    raise exception 'GACHA_STAGE1_RATE_DRIFT';
  end if;

  if (select count(*) from public.canonical_skill_master
      where version='2026-08-21' and skill_id between 'SKILL_036' and 'SKILL_050'
        and rarity='SSR' and exclusive_character_id is null) <> 15 then
    raise exception 'GACHA_STAGE1_SKILL_CANONICAL_DRIFT';
  end if;
end $$;

insert into public.gacha_items_master
  (id, gacha_id, item_type, item_id, rarity, weight, is_pickup)
select
  'SKILL_NORMAL:' || skill_id,
  'SKILL_NORMAL',
  'SKILL',
  skill_id,
  rarity,
  1,
  false
from public.canonical_skill_master
where version='2026-08-21'
  and skill_id between 'SKILL_036' and 'SKILL_050'
  and rarity='SSR'
  and exclusive_character_id is null;

update public.gacha_items_master pool
set rarity = master.rarity
from public.canonical_equipment_master master
where master.version='2026-08-21'
  and pool.gacha_id='EQUIP_NORMAL'
  and pool.item_type='EQUIPMENT'
  and pool.item_id=master.equipment_id
  and pool.item_id in (
    'WEAPON_009','WEAPON_010',
    'ACCESSORY_011','HEAD_005','LEGS_005',
    'ACCESSORY_026','BODY_014','BODY_015','HEAD_011','LEGS_011',
    'ACCESSORY_042','ACCESSORY_043','ACCESSORY_044','ACCESSORY_045','WEAPON_041','WEAPON_042'
  );

update public.gacha_items_master pool
set rarity = master.rarity
from public.canonical_equipment_master master
where master.version='2026-08-21'
  and pool.gacha_id='EQUIP_SPECIAL'
  and pool.item_type='EQUIPMENT'
  and pool.item_id=master.equipment_id
  and pool.item_id in (
    'ACCESSORY_026','BODY_014','BODY_015','HEAD_011','LEGS_011',
    'ACCESSORY_042','ACCESSORY_043','ACCESSORY_044','ACCESSORY_045','WEAPON_041','WEAPON_042',
    'BODY_023','BODY_024','HEAD_017','LEGS_017'
  );

delete from public.gacha_items_master
where gacha_id='EQUIP_SPECIAL'
  and item_type='EQUIPMENT'
  and item_id in ('ACCESSORY_011','HEAD_005','LEGS_005','ACCESSORY_051','LEGS_021');

do $$
begin
  if (select count(*) from public.gacha_items_master
      where gacha_id='SKILL_NORMAL' and rarity='SSR' and item_id between 'SKILL_036' and 'SKILL_050') <> 15 then
    raise exception 'GACHA_STAGE1_SKILL_RESULT_MISMATCH';
  end if;

  if exists (
    select 1
    from public.gacha_items_master pool
    left join public.canonical_skill_master skill
      on pool.item_type='SKILL' and skill.version='2026-08-21' and skill.skill_id=pool.item_id
    left join public.canonical_equipment_master equipment
      on pool.item_type='EQUIPMENT' and equipment.version='2026-08-21' and equipment.equipment_id=pool.item_id
    where pool.gacha_id in ('SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
      and (
        (pool.item_type='SKILL' and (skill.skill_id is null or pool.rarity<>skill.rarity)) or
        (pool.item_type='EQUIPMENT' and (equipment.equipment_id is null or pool.rarity<>equipment.rarity))
      )
  ) then
    raise exception 'GACHA_STAGE1_POST_CANONICAL_MISMATCH';
  end if;

  if exists (
    select 1
    from public.gacha_rarity_rates rates
    left join public.gacha_items_master pool
      on pool.gacha_id=rates.gacha_id and pool.rarity=rates.rarity
    where rates.gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
    group by rates.gacha_id,rates.rarity
    having count(pool.id)=0
  ) then
    raise exception 'GACHA_STAGE1_REACHABLE_BUCKET_EMPTY';
  end if;
end $$;

-- SECTION 01b special payment boundary
-- 別候補。確率/Pool/Feature Flagは変更しない。適用前に既存ガチャ受入成果との整合を確認する。
create function public.billing_validate_special_payment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- 抽選履歴の作成をDBの境界とし、Clientを介さない呼出しにも同じ制限を適用。
  -- 例外時は既存RPCの消費・抽選・付与も同一トランザクションでROLLBACK。
  if new.gacha_id in ('CHAR_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')
    and (new.payment_source is null or new.payment_source not in ('diamonds','ticket')) then
    raise exception 'SPECIAL_REQUIRES_DIA_OR_TICKET' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.billing_validate_special_payment() from public,anon,authenticated;
create trigger billing_special_payment_guard before insert or update of gacha_id,payment_source
  on public.gacha_execution_history for each row execute function public.billing_validate_special_payment();
update public.gacha_masters set cost_cash=0,cost_diamond=case id when 'CHAR_SPECIAL' then 300 else 200 end
where id in ('CHAR_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL');

-- SECTION 02 supabase/migrations/20260913105642_quest_raid_encounter.sql

create table public.quest_raid_encounter_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 version integer not null default 1 check(version>0), probability_bp integer not null default 3000 check(probability_bp between 0 and 10000),
 guaranteed_after integer not null default 5 check(guaranteed_after>0), personal_active_limit integer not null default 1 check(personal_active_limit>0),
 allow_outside_daily boolean not null default false,
 beginner_weight integer not null default 50 check(beginner_weight>=0), intermediate_weight integer not null default 35 check(intermediate_weight>=0), advanced_weight integer not null default 15 check(advanced_weight>=0),
 check(beginner_weight+intermediate_weight+advanced_weight>0)
);
insert into public.quest_raid_encounter_settings(singleton) values(true);
create table public.quest_raid_encounter_bonus_items (
 difficulty text not null check(difficulty in ('beginner','intermediate','advanced')),
 item_id text not null check(length(btrim(item_id))>0), quantity integer not null check(quantity>0), primary key(difficulty,item_id)
);
create table public.quest_raid_encounter_progress (
 user_id uuid primary key references public.users(id), first_created boolean not null default false,
 misses integer not null default 0 check(misses>=0)
);
create table public.quest_raid_encounters (
 patrol_id uuid primary key references public.user_patrols(id), user_id uuid not null references public.users(id),
 area_id text not null, status text not null default 'PENDING' check(status in ('PENDING','NO_ENCOUNTER','DRAWN','CREATED')),
 difficulty text check(difficulty in ('beginner','intermediate','advanced')), variant_id text,
 room_id uuid unique references public.raid_rooms(id), rule_version integer, bonus_items jsonb,
 created_at timestamptz not null default now(), acknowledged_at timestamptz,
 check ((status='CREATED')=(room_id is not null))
);
create index quest_raid_encounters_owner on public.quest_raid_encounters(user_id,created_at);
create table public.quest_raid_encounter_bonus_grants (
 room_id uuid not null references public.raid_rooms(id), user_id uuid not null references public.users(id),
 issued_at timestamptz not null default now(), rule_version integer not null, primary key(room_id,user_id)
);
alter table public.quest_raid_encounter_settings enable row level security;
alter table public.quest_raid_encounter_bonus_items enable row level security;
alter table public.quest_raid_encounter_progress enable row level security;
alter table public.quest_raid_encounters enable row level security;
alter table public.quest_raid_encounter_bonus_grants enable row level security;
revoke all on public.quest_raid_encounter_settings,public.quest_raid_encounter_bonus_items,public.quest_raid_encounter_progress,public.quest_raid_encounters,public.quest_raid_encounter_bonus_grants from public,anon,authenticated,service_role;

-- Capture only new completion transitions while enabled; no historical backfill.
create function public.capture_quest_raid_encounter_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_area text;
begin
 if new.status is distinct from 'COMPLETED' or old.status='COMPLETED'
   or new.battle_result is distinct from 'VICTORY' or not coalesce(new.battle_resolved,false)
   or not coalesce(new.has_battle_event,false) then return new; end if;
 if not exists(select 1 from public.quest_raid_encounter_settings where singleton and enabled)
   or not exists(select 1 from public.tutorial_progress where user_id=new.user_id and step_id='COMPLETE') then return new;end if;
 select public.quest_town_key(town_id) into v_area from public.canonical_quest_master
  where version='2026-08-30' and quest_id=coalesce(new.course_id,new.quest_id) and is_production_enabled;
 if v_area is not null then
  insert into public.quest_raid_encounters(patrol_id,user_id,area_id) values(new.id,new.user_id,v_area) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger capture_quest_raid_encounter_v1 after update of status on public.user_patrols
 for each row execute function public.capture_quest_raid_encounter_v1();

create function public.quest_raid_encounter_projection_v1(p_patrol_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('patrolId',e.patrol_id,'status',e.status,'roomId',e.room_id,'areaId',e.area_id,
 'difficulty',e.difficulty,'bossName',v.raid_name,'leaderId',v.member_character_ids->>0,
 'bonusItems',coalesce(e.bonus_items,'[]'::jsonb),'acknowledged',e.acknowledged_at is not null,
 'expiresAt',b.expires_at,'ended',b.id is not null and (b.status<>'ACTIVE' or b.current_hp<=0 or b.expires_at<=now() or b.outcome_finalized_at is not null))
 from public.quest_raid_encounters e left join public.canonical_raid_variants v on v.raid_variant_id=e.variant_id
 left join public.raid_rooms r on r.id=e.room_id left join public.raid_bosses b on b.id=r.raid_boss_instance_id
 where e.patrol_id=p_patrol_id
$$;

create function public.resolve_quest_raid_encounter_v1(p_patrol_id uuid) returns jsonb
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
   if (public._raid_room_power_gate_v1(opt->>'difficulty',power)->>'status')='passed'
     and exists(select 1 from public.quest_raid_encounter_bonus_items where difficulty=opt->>'difficulty') then
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
  if progress.first_created and progress.misses<cfg.guaranteed_after-1 and floor(random()*10000)>=cfg.probability_bp then
   update public.quest_raid_encounters set status='NO_ENCOUNTER',rule_version=cfg.version where patrol_id=p_patrol_id;
   update public.quest_raid_encounter_progress set misses=misses+1 where user_id=uid;
   return public.quest_raid_encounter_projection_v1(p_patrol_id);
  end if;
  select jsonb_agg(jsonb_build_object('itemId',item_id,'quantity',quantity) order by item_id) into bonus from public.quest_raid_encounter_bonus_items where difficulty=e.difficulty;
  update public.quest_raid_encounters set status='DRAWN',difficulty=e.difficulty,variant_id=variant.raid_variant_id,rule_version=cfg.version,bonus_items=bonus where patrol_id=p_patrol_id returning * into e;
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

create function public.get_quest_raid_encounters_v1() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(public.quest_raid_encounter_projection_v1(patrol_id) order by created_at) from public.quest_raid_encounters
 where user_id=auth.uid() and status<>'NO_ENCOUNTER' and (acknowledged_at is null or exists(select 1 from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id where r.id=room_id and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now()))),'[]'::jsonb);
end $$;
create function public.acknowledge_quest_raid_encounter_v1(p_patrol_id uuid) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 update public.quest_raid_encounters set acknowledged_at=coalesce(acknowledged_at,now()) where patrol_id=p_patrol_id and user_id=auth.uid() and status='CREATED';
 return found;
end $$;

create function public.get_quest_raid_bonus_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 -- Use the same room visibility authority as its existing detail page.
 perform public.get_raid_room_v1(p_room_id);
 select * into e from public.quest_raid_encounters where room_id=p_room_id and status='CREATED';
 if not found then return null;end if;
 return jsonb_build_object('roomId',p_room_id,'items',e.bonus_items,'issued',exists(select 1 from public.quest_raid_encounter_bonus_grants where room_id=p_room_id and user_id=auth.uid()));
end $$;
revoke all on function public.get_quest_raid_bonus_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_quest_raid_bonus_v1(uuid) to authenticated;

-- Separate bonus ledger common to both Clear and Rescue. No award just for discovery.
create function public.issue_quest_raid_encounter_bonus_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype; item jsonb; inserted integer;
begin
 select * into e from public.quest_raid_encounters where room_id=new.room_id and status='CREATED';
 if not found then return new;end if;
 insert into public.quest_raid_encounter_bonus_grants(room_id,user_id,rule_version) values(new.room_id,new.user_id,e.rule_version) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return new;end if;
 for item in select * from jsonb_array_elements(e.bonus_items) loop
  insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
  values(new.user_id,item->>'itemId',(item->>'quantity')::integer,'強敵発見ボーナス','UNCLAIMED',now(),now()+interval '30 days','QUEST_RAID_ENCOUNTER',new.room_id::text||':'||(item->>'itemId'),jsonb_build_object('roomId',new.room_id,'ruleVersion',e.rule_version));
 end loop;
 return new;
end $$;
create trigger quest_encounter_clear_bonus after insert on public.raid_room_clear_rewards for each row execute function public.issue_quest_raid_encounter_bonus_v1();
create trigger quest_encounter_rescue_bonus after insert on public.raid_room_rescue_rewards for each row execute function public.issue_quest_raid_encounter_bonus_v1();
revoke all on function public.capture_quest_raid_encounter_v1(),public.quest_raid_encounter_projection_v1(uuid),public.resolve_quest_raid_encounter_v1(uuid),public.get_quest_raid_encounters_v1(),public.acknowledge_quest_raid_encounter_v1(uuid),public.issue_quest_raid_encounter_bonus_v1() from public,anon,authenticated,service_role;
grant execute on function public.resolve_quest_raid_encounter_v1(uuid),public.get_quest_raid_encounters_v1(),public.acknowledge_quest_raid_encounter_v1(uuid) to authenticated;

-- SECTION 03 supabase/migrations/20260913105913_special_gacha_release_contract.sql


insert into public.gacha_masters(id,name,gacha_type,cost_cash,cost_diamond)
values ('CHAR_JUSTICE_EVIL_SPECIAL','正義／悪ガチャ','CHARACTER',0,300),
       ('CHAR_ORDER_CHAOS_SPECIAL','秩序／混沌ガチャ','CHARACTER',0,300)
on conflict(id) do update set name=excluded.name,cost_cash=0,cost_diamond=excluded.cost_diamond;
update public.gacha_masters set cost_cash=0,cost_diamond=200
where id in ('SKILL_SPECIAL','EQUIP_SPECIAL');

-- Legacy CHAR_SPECIAL remains solely as a Tutorial SSR source; never sell it.
insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
select group_id||':'||c.character_id,group_id,'CHARACTER',c.character_id,c.rarity,1,false
from public.canonical_character_master c
cross join (values ('CHAR_JUSTICE_EVIL_SPECIAL'),('CHAR_ORDER_CHAOS_SPECIAL')) g(group_id)
where c.version='2026-08-21' and c.rarity in ('R','SR','SSR')
  and ((group_id='CHAR_JUSTICE_EVIL_SPECIAL' and c.attribute in ('JUSTICE','EVIL'))
    or (group_id='CHAR_ORDER_CHAOS_SPECIAL' and c.attribute in ('ORDER','CHAOS')))
on conflict(id) do update set rarity=excluded.rarity,weight=1;

-- Dedicated item IDs mechanically matched to existing master; no new stats.
insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
select 'SKILL_SPECIAL:'||s.skill_id,'SKILL_SPECIAL','SKILL',s.skill_id,
  s.rarity,1,false
from public.canonical_skill_master s
where s.version='2026-08-21' and s.kind='EXCLUSIVE' and s.exclusive_character_id is not null
  and s.skill_id in (select 'SKILL_'||lpad(n::text,3,'0') from generate_series(51,70) n)
on conflict(id) do update set rarity=excluded.rarity,weight=1;
insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
select 'EQUIP_SPECIAL:'||e.equipment_id,'EQUIP_SPECIAL','EQUIPMENT',e.equipment_id,'SSR',1,false
from public.canonical_equipment_master e where e.version='2026-08-21' and e.exclusive_character_id is not null and e.rarity='SSR'
  and e.equipment_id in ('WEAPON_047','WEAPON_048','WEAPON_049','WEAPON_050','HEAD_020','BODY_029','BODY_030','LEGS_020','ACCESSORY_049','ACCESSORY_050')
on conflict(id) do update set rarity=excluded.rarity,weight=1;

delete from public.gacha_rarity_rates where gacha_id in
 ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL');
insert into public.gacha_rarity_rates(gacha_id,rarity,weight) values
 ('CHAR_JUSTICE_EVIL_SPECIAL','R',65),('CHAR_JUSTICE_EVIL_SPECIAL','SR',30),('CHAR_JUSTICE_EVIL_SPECIAL','SSR',5),
 ('CHAR_ORDER_CHAOS_SPECIAL','R',65),('CHAR_ORDER_CHAOS_SPECIAL','SR',30),('CHAR_ORDER_CHAOS_SPECIAL','SSR',5),
 ('SKILL_SPECIAL','R',57),('SKILL_SPECIAL','SR',35),('SKILL_SPECIAL','SSR',8),
 ('EQUIP_SPECIAL','R',52),('EQUIP_SPECIAL','SR',38),('EQUIP_SPECIAL','SSR',10);

create table public.special_gacha_pool_groups(
 gacha_id text not null references public.gacha_masters(id),
 rarity text not null check(rarity in ('R','SR','SSR')),
 is_exclusive boolean not null,
 weight integer not null check(weight>0),
 primary key(gacha_id,rarity,is_exclusive)
);
alter table public.special_gacha_pool_groups enable row level security;
revoke all on public.special_gacha_pool_groups from public,anon,authenticated;
grant select on public.special_gacha_pool_groups to authenticated;
grant all on public.special_gacha_pool_groups to service_role;
create policy special_gacha_pool_groups_read on public.special_gacha_pool_groups for select to authenticated using(true);
insert into public.special_gacha_pool_groups values
 ('CHAR_JUSTICE_EVIL_SPECIAL','R',false,65),('CHAR_JUSTICE_EVIL_SPECIAL','SR',false,30),('CHAR_JUSTICE_EVIL_SPECIAL','SSR',false,5),
 ('CHAR_ORDER_CHAOS_SPECIAL','R',false,65),('CHAR_ORDER_CHAOS_SPECIAL','SR',false,30),('CHAR_ORDER_CHAOS_SPECIAL','SSR',false,5),
 ('SKILL_SPECIAL','R',false,570),('SKILL_SPECIAL','SR',false,250),('SKILL_SPECIAL','SR',true,100),
 ('SKILL_SPECIAL','SSR',false,32),('SKILL_SPECIAL','SSR',true,48),
 ('EQUIP_SPECIAL','R',false,52),('EQUIP_SPECIAL','SR',false,38),
 ('EQUIP_SPECIAL','SSR',false,4),('EQUIP_SPECIAL','SSR',true,6);

create function public._special_gacha_is_exclusive(p_type text,p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_type when 'SKILL' then coalesce((select exclusive_character_id is not null from public.canonical_skill_master where version='2026-08-21' and skill_id=p_id),false)
 when 'EQUIPMENT' then coalesce((select exclusive_character_id is not null from public.canonical_equipment_master where version='2026-08-21' and equipment_id=p_id),false) else false end
$$;
revoke all on function public._special_gacha_is_exclusive(text,text) from public,anon,authenticated;

-- Keep the existing item draw exactly for Normal and Tutorial's legacy pool.
alter function public.draw_gacha_item(text,text) rename to _draw_gacha_item_before_special_release;
revoke all on function public._draw_gacha_item_before_special_release(text,text) from public,anon,authenticated;
create function public.draw_gacha_item(p_gacha_id text,p_rarity text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare exclusive_group boolean; item text;
begin
 if p_gacha_id not in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL') then
  return public._draw_gacha_item_before_special_release(p_gacha_id,p_rarity);
 end if;
 select is_exclusive into exclusive_group from public.special_gacha_pool_groups
 where gacha_id=p_gacha_id and rarity=p_rarity
 order by -ln(greatest(random(),0.000000000001))/weight limit 1;
 if not found then raise exception 'SPECIAL_POOL_GROUP_MISSING'; end if;
 select item_id into item from public.gacha_items_master p
 where p.gacha_id=p_gacha_id and p.rarity=p_rarity
 and public._special_gacha_is_exclusive(p.item_type,p.item_id)=exclusive_group
 order by random() limit 1;
 if item is null then raise exception 'SPECIAL_POOL_EMPTY'; end if;
 return item;
end $$;
revoke all on function public.draw_gacha_item(text,text) from public,anon,authenticated;
grant execute on function public.draw_gacha_item(text,text) to service_role;

-- Patch the actual authority: legacy five arguments, or versioned six arguments.
-- The five-argument versioned replay wrapper remains byte-for-byte unchanged.
do $$
declare definition text; updated text; signature text; rpc text; wrapper text;
begin
 foreach rpc in array array['execute_character_gacha','execute_asset_gacha'] loop
  signature:='public.'||rpc||'(uuid,text,integer,text,uuid)';
  if to_regprocedure('public.'||rpc||'(uuid,text,integer,text,uuid,text)') is not null then
   wrapper:=lower(regexp_replace(pg_get_functiondef(signature::regprocedure),'\s+','','g'));
   if position('returnpublic.'||rpc||'(p_user_id,p_gacha_id,p_pull_count,p_currency_type,p_request_id,null);' in wrapper)=0
    or position('daily_free_rate_version_mismatch' in wrapper)=0
    or position('returnv_history.result_payload;' in wrapper)=0 then
    raise exception 'SPECIAL_VERSIONED_WRAPPER_DRIFT: %',rpc;
   end if;
   signature:='public.'||rpc||'(uuid,text,integer,text,uuid,text)';
   definition:=pg_get_functiondef(signature::regprocedure);
   if position('p_rate_version is distinct from ''daily-free-2026-09-12-v1''' in definition)=0
    or position('public.draw_daily_free_gacha_rarity(p_gacha_id)' in definition)=0
    or position('return v_history.result_payload;' in definition)=0 then
    raise exception 'SPECIAL_RATE_VERSION_RPC_DRIFT: %',rpc;
   end if;
  else
   definition:=pg_get_functiondef(signature::regprocedure);
  end if;
  updated:=definition;
  if rpc='execute_character_gacha' then
   if position('v_is_special := p_gacha_id = ''CHAR_SPECIAL'';' in definition)=0
    or position('(''CHAR_NORMAL'', ''CHAR_SPECIAL'')' in definition)=0 then
    raise exception 'SPECIAL_CHARACTER_RPC_DRIFT';
   end if;
   updated:=replace(updated,'v_is_special := p_gacha_id = ''CHAR_SPECIAL'';',
    'v_is_special := p_gacha_id in (''CHAR_JUSTICE_EVIL_SPECIAL'',''CHAR_ORDER_CHAOS_SPECIAL'');');
   updated:=replace(updated,'(''CHAR_NORMAL'', ''CHAR_SPECIAL'')',
    '(''CHAR_NORMAL'',''CHAR_JUSTICE_EVIL_SPECIAL'',''CHAR_ORDER_CHAOS_SPECIAL'')');
  end if;
  if position('if v_is_special and not exists (' in updated)=0 then raise exception 'SPECIAL_RPC_GUARD_DRIFT: %',signature; end if;
  updated:=replace(updated,'if v_is_special and not exists (',
  'if v_is_special and (p_currency_type is null or p_currency_type not in (''diamonds'',''ticket'')) then
    raise exception ''SPECIAL_REQUIRES_DIA_OR_TICKET'';
  end if;
  if v_is_special and p_pull_count not in (1,10) then raise exception ''SPECIAL_INVALID_PULL_COUNT''; end if;
  if v_is_special and not exists (');
  if position('select coalesce(current_points, 0) into v_pity_before' in updated)=0 then raise exception 'SPECIAL_PITY_READ_DRIFT'; end if;
  updated:=replace(updated,'select coalesce(current_points, 0) into v_pity_before',
    'if v_is_special then perform 1 from public.users where id=p_user_id for update; end if;
  select coalesce(current_points, 0) into v_pity_before');
  execute updated;
 end loop;
end $$;

-- Pity exchange wrapper records request/result; underlying reward application stays canonical.
alter function public.exchange_pity_reward(uuid,text,text) rename to _exchange_pity_reward_before_special_release;
revoke all on function public._exchange_pity_reward_before_special_release(uuid,text,text) from public,anon,authenticated;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public._exchange_pity_reward_before_special_release(uuid,text,text)'::regprocedure);
 if position('v_points - 200' in definition)=0 or position('COALESCE(v_points, 0) < 200' in definition)=0 then raise exception 'SPECIAL_PITY_RPC_DRIFT'; end if;
 definition:=replace(replace(definition,'v_points - 200','v_points - 100'),'COALESCE(v_points, 0) < 200','COALESCE(v_points, 0) < 100');
 execute definition;
end $$;

create table public.special_gacha_exchange_receipts(
 user_id uuid not null references public.users(id) on delete cascade,
 request_id uuid not null,
 reward_type text not null check(reward_type in ('CHARACTER','SKILL','EQUIPMENT')),
 reward_id text not null,
 result_payload jsonb,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.special_gacha_exchange_receipts enable row level security;
revoke all on public.special_gacha_exchange_receipts from public,anon,authenticated;
grant select on public.special_gacha_exchange_receipts to authenticated;
grant all on public.special_gacha_exchange_receipts to service_role;
create policy special_exchange_receipts_owner on public.special_gacha_exchange_receipts for select to authenticated using((select auth.uid())=user_id);

create function public.exchange_special_gacha_reward(p_reward_type text,p_reward_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prior public.special_gacha_exchange_receipts%rowtype; result jsonb; points integer;
begin
 if u is null then raise exception 'not authorized'; end if;
 if p_request_id is null then raise exception 'request_id is required'; end if;
 perform 1 from public.users where id=u for update;
 select * into prior from public.special_gacha_exchange_receipts where user_id=u and request_id=p_request_id;
 if found then
  if prior.reward_type is distinct from p_reward_type or prior.reward_id is distinct from p_reward_id then raise exception 'request_id was already used for a different exchange'; end if;
  return prior.result_payload;
 end if;
 if not exists(select 1 from public.feature_operating_states where feature_key='SPECIAL_GACHA' and state='OPEN') then raise exception 'special gacha is closed'; end if;
 if not exists(select 1 from public.gacha_items_master where item_type=p_reward_type and item_id=p_reward_id and rarity='SSR'
 and gacha_id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')) then raise exception 'invalid pity reward'; end if;
 result:=public._exchange_pity_reward_before_special_release(u,p_reward_type,p_reward_id);
 select current_points into points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_special_common';
 result:=result||jsonb_build_object('current_points',points);
 insert into public.special_gacha_exchange_receipts(user_id,request_id,reward_type,reward_id,result_payload) values(u,p_request_id,p_reward_type,p_reward_id,result);
 return result;
end $$;
revoke all on function public.exchange_special_gacha_reward(text,text,uuid) from public,anon,authenticated;
grant execute on function public.exchange_special_gacha_reward(text,text,uuid) to authenticated;

-- One read returns operational availability and actual individual odds, not hardcoded UI rates.
create function public.get_special_gacha_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
 with pool as (
  select p.gacha_id,p.item_type,p.item_id,p.rarity,
   public._special_gacha_is_exclusive(p.item_type,p.item_id) is_exclusive,
   coalesce(c.display_name,s.display_name,e.display_name,p.item_id) name
  from public.gacha_items_master p
  left join public.canonical_character_master c on p.item_type='CHARACTER' and c.character_id=p.item_id and c.version='2026-08-21'
  left join public.canonical_skill_master s on p.item_type='SKILL' and s.version='2026-08-21' and s.skill_id=p.item_id
  left join public.canonical_equipment_master e on p.item_type='EQUIPMENT' and e.version='2026-08-21' and e.equipment_id=p.item_id
  where p.gacha_id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')
 ), rates as (
  select p.*,100.0 * r.weight / (select sum(weight) from public.gacha_rarity_rates where gacha_id=p.gacha_id)
   * g.weight / (select sum(weight) from public.special_gacha_pool_groups where gacha_id=p.gacha_id and rarity=p.rarity)
   / count(*) over(partition by p.gacha_id,p.rarity,p.is_exclusive) probability
  from pool p join public.gacha_rarity_rates r using(gacha_id,rarity)
  join public.special_gacha_pool_groups g using(gacha_id,rarity,is_exclusive)
 ) select jsonb_build_object(
 'available',coalesce((select state='OPEN' from public.feature_operating_states where feature_key='SPECIAL_GACHA'),false),
 'pity_points',coalesce((select current_points from public.user_gacha_pity_points where user_id=auth.uid() and pity_master_id='pity_special_common'),0),
 'pity_cost',100,
 'gachas',(select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'cost_diamond',m.cost_diamond,
 'items',(select jsonb_agg(to_jsonb(r) order by r.rarity,r.item_id) from rates r where r.gacha_id=m.id)) order by m.id)
 from public.gacha_masters m where m.id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')))
$$;
revoke all on function public.get_special_gacha_catalog() from public,anon,authenticated;
grant execute on function public.get_special_gacha_catalog() to authenticated;

-- Fail before any mutation can persist if canonical dedicated pools are incomplete.
do $$
begin
 if (select count(*) from public.gacha_items_master where gacha_id='CHAR_JUSTICE_EVIL_SPECIAL' and rarity='SSR')<>4
 or (select count(*) from public.gacha_items_master where gacha_id='CHAR_ORDER_CHAOS_SPECIAL' and rarity='SSR')<>6 then raise exception 'SPECIAL_CHARACTER_ROSTER_MISMATCH'; end if;
 if (select count(*) from public.gacha_items_master p where p.gacha_id='SKILL_SPECIAL' and public._special_gacha_is_exclusive(p.item_type,p.item_id))<>20
 or (select count(*) from public.gacha_items_master p where p.gacha_id='EQUIP_SPECIAL' and public._special_gacha_is_exclusive(p.item_type,p.item_id))<>10 then raise exception 'SPECIAL_EXCLUSIVE_POOL_MISMATCH'; end if;
 if exists(select 1 from public.special_gacha_pool_groups g where not exists(select 1 from public.gacha_items_master p where p.gacha_id=g.gacha_id and p.rarity=g.rarity and public._special_gacha_is_exclusive(p.item_type,p.item_id)=g.is_exclusive)) then raise exception 'SPECIAL_POOL_EMPTY'; end if;
end $$;

-- SECTION 04 supabase/migrations/20260913120930_quest_raid_approved_occurrence_and_double_rewards.sql

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

-- SECTION 05 supabase/migrations/20260913133311_guild_emblem_standard_identity.sql
-- Guild Identity Phase 1. Reuses Guild cosmetic ownership; no economy changes.
INSERT INTO public.cosmetic_master(id,owner_scope,slot,display_name,asset_key,source_type,metadata)
SELECT 'guild_standard_'||lpad(n::text,2,'0'),'GUILD','GUILD_EMBLEM',
 (ARRAY['王冠','翼','稲妻','薔薇','双剣','炎','月','蛇'])[n],'/guild-emblems/guild_standard_'||lpad(n::text,2,'0')||'.svg',
 'SYSTEM',jsonb_build_object('standard',true,'default',n=1,'sort_order',n)
FROM generate_series(1,8) n
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_guild_emblems(p_guild_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.guilds g JOIN public.guild_members gm ON gm.guild_id=g.id
 WHERE g.id=p_guild_id AND NOT g.is_disbanded AND gm.user_id=auth.uid()) THEN
 RAISE EXCEPTION 'guild membership required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',cm.id,'display_name',cm.display_name,'asset_path',cm.asset_key)
 ORDER BY coalesce((cm.metadata->>'sort_order')::integer,999),cm.id),'[]'::jsonb)
 FROM public.cosmetic_master cm WHERE cm.owner_scope='GUILD' AND cm.slot='GUILD_EMBLEM' AND cm.active
 AND (cm.metadata @> '{"standard":true}'::jsonb OR EXISTS(SELECT 1 FROM public.guild_cosmetics gc
 WHERE gc.guild_id=p_guild_id AND gc.cosmetic_id=cm.id AND (gc.expires_at IS NULL OR gc.expires_at>now()))));
END $$;

CREATE OR REPLACE FUNCTION public.get_guild_emblems(p_guild_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF cardinality(p_guild_ids)>500 THEN RAISE EXCEPTION 'too many guild ids' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('guild_id',g.id,
 'emblem_id',coalesce(chosen.id,'guild_standard_01'),
 'asset_path',coalesce(chosen.asset_key,CASE WHEN NOT EXISTS(SELECT 1 FROM public.guild_equipped_cosmetics old WHERE old.guild_id=g.id AND old.slot='GUILD_EMBLEM') THEN nullif(g.logo_icon,'') END,'/guild-emblems/guild_standard_01.svg')) ORDER BY g.id),'[]'::jsonb)
 FROM public.guilds g LEFT JOIN LATERAL (
 SELECT cm.id,cm.asset_key FROM public.guild_equipped_cosmetics ec
 JOIN public.cosmetic_master cm ON cm.id=ec.cosmetic_id
 WHERE ec.guild_id=g.id AND ec.slot='GUILD_EMBLEM' AND cm.slot='GUILD_EMBLEM' AND cm.owner_scope='GUILD' AND cm.active
 AND (cm.metadata @> '{"standard":true}'::jsonb OR EXISTS(SELECT 1 FROM public.guild_cosmetics gc
 WHERE gc.guild_id=g.id AND gc.cosmetic_id=cm.id AND (gc.expires_at IS NULL OR gc.expires_at>now())))
 ) chosen ON true WHERE g.id=ANY(p_guild_ids) AND NOT g.is_disbanded);
END $$;

CREATE OR REPLACE FUNCTION public.set_guild_emblem(p_guild_id uuid,p_emblem_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_asset text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 -- Same guild -> membership lock order as leave/transfer authority.
 PERFORM 1 FROM public.guilds WHERE id=p_guild_id AND NOT is_disbanded FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'active guild required' USING ERRCODE='22023'; END IF;
 SELECT role INTO v_role FROM public.guild_members WHERE guild_id=p_guild_id AND user_id=auth.uid() FOR UPDATE;
 IF v_role IS NULL OR v_role NOT IN ('MASTER','SUB_MASTER') THEN
 RAISE EXCEPTION 'guild master or sub master permission required' USING ERRCODE='42501'; END IF;
 SELECT cm.asset_key INTO v_asset FROM public.cosmetic_master cm
 WHERE cm.id=p_emblem_id AND cm.owner_scope='GUILD' AND cm.slot='GUILD_EMBLEM' AND cm.active
 AND (cm.metadata @> '{"standard":true}'::jsonb OR EXISTS(SELECT 1 FROM public.guild_cosmetics gc
 WHERE gc.guild_id=p_guild_id AND gc.cosmetic_id=cm.id AND (gc.expires_at IS NULL OR gc.expires_at>now()))) FOR SHARE;
 IF NOT FOUND OR v_asset IS NULL THEN RAISE EXCEPTION 'guild emblem is unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO public.guild_equipped_cosmetics(guild_id,slot,cosmetic_id) VALUES(p_guild_id,'GUILD_EMBLEM',p_emblem_id)
 ON CONFLICT(guild_id,slot) DO UPDATE SET cosmetic_id=EXCLUDED.cosmetic_id,equipped_at=now();
 UPDATE public.guilds SET logo_icon=v_asset WHERE id=p_guild_id;
 RETURN jsonb_build_object('status','success','guild_id',p_guild_id,'emblem_id',p_emblem_id,'asset_path',v_asset);
END $$;

CREATE OR REPLACE FUNCTION public.equip_guild_cosmetic(p_guild_id uuid,p_slot text,p_cosmetic_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
 IF p_slot='GUILD_EMBLEM' THEN RETURN public.set_guild_emblem(p_guild_id,p_cosmetic_id); END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.guilds WHERE id=p_guild_id AND NOT is_disbanded FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'active guild required'; END IF;
 SELECT role INTO v_role FROM public.guild_members WHERE guild_id=p_guild_id AND user_id=auth.uid() FOR UPDATE;
 IF v_role IS DISTINCT FROM 'MASTER' THEN RAISE EXCEPTION 'guild master permission required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.guild_cosmetics gc JOIN public.cosmetic_master cm ON cm.id=gc.cosmetic_id
 WHERE gc.guild_id=p_guild_id AND gc.cosmetic_id=p_cosmetic_id AND cm.owner_scope='GUILD' AND cm.slot=p_slot AND cm.active
 AND (gc.expires_at IS NULL OR gc.expires_at>now())) THEN RAISE EXCEPTION 'guild cosmetic is not owned or is unavailable'; END IF;
 INSERT INTO public.guild_equipped_cosmetics(guild_id,slot,cosmetic_id) VALUES(p_guild_id,p_slot,p_cosmetic_id)
 ON CONFLICT(guild_id,slot) DO UPDATE SET cosmetic_id=EXCLUDED.cosmetic_id,equipped_at=now();
 IF p_slot='GUILD_BASE_BACKGROUND' THEN UPDATE public.guilds SET equipped_decoration=p_cosmetic_id WHERE id=p_guild_id; END IF;
 IF p_slot='GUILD_BANNER' THEN UPDATE public.guilds SET equipped_banner=p_cosmetic_id WHERE id=p_guild_id; END IF;
 RETURN jsonb_build_object('status','success');
END $$;

-- INSERT trigger preserves create_guild_v2 price, level, mission and locking authority.
CREATE OR REPLACE FUNCTION public.initialize_guild_emblem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.guild_equipped_cosmetics(guild_id,slot,cosmetic_id)
 VALUES(NEW.id,'GUILD_EMBLEM','guild_standard_01') ON CONFLICT(guild_id,slot) DO NOTHING;
 IF nullif(NEW.logo_icon,'') IS NULL THEN UPDATE public.guilds
 SET logo_icon='/guild-emblems/guild_standard_01.svg' WHERE id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guild_emblem_after_insert AFTER INSERT ON public.guilds
FOR EACH ROW EXECUTE FUNCTION public.initialize_guild_emblem();

REVOKE ALL ON FUNCTION public.initialize_guild_emblem() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_guild_emblems(uuid),public.get_guild_emblems(uuid[]),public.set_guild_emblem(uuid,text),public.equip_guild_cosmetic(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_guild_emblems(uuid),public.get_guild_emblems(uuid[]),public.set_guild_emblem(uuid,text),public.equip_guild_cosmetic(uuid,text,text) TO authenticated;

-- SECTION 06 supabase/migrations/20260913142410_quest_raid_combat_snapshot.sql

create or replace function public.resolve_quest_raid_encounter_v1(p_patrol_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 uid uuid:=auth.uid(); e public.quest_raid_encounters%rowtype; cfg public.quest_raid_encounter_settings%rowtype;
 progress public.quest_raid_encounter_progress%rowtype; variant public.canonical_raid_variants%rowtype;
 rule public.raid_room_lifecycle_rules%rowtype; power bigint; lvl integer; options jsonb:='[]'; opt jsonb;
 total_weight integer:=0; draw integer; instance_id uuid; new_room uuid; created_time timestamptz; bonus jsonb; active_count integer; launch_profile jsonb;
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
  -- Same difficulty-specific profile and HP authority as create_raid_room_v1.
  -- Missing/invalid profile leaves DRAWN retryable; no partial Boss/Room can survive.
  select profile into launch_profile from public.raid_room_combat_profiles
   where raid_variant_id=e.variant_id and difficulty_id=e.difficulty;
  if not found then raise exception 'raid launch profile unavailable' using errcode='55000';end if;
  variant.max_hp:=(launch_profile->>'maxHp')::bigint;
  if variant.max_hp is null or variant.max_hp<=0 then raise exception 'invalid raid launch HP' using errcode='22023';end if;
  instance_id:=gen_random_uuid();created_time:=clock_timestamp();
  insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
  values(instance_id,variant.raid_variant_id,variant.raid_variant_id,variant.max_hp,variant.max_hp,lower(variant.area_id),'ACTIVE',created_time,created_time+make_interval(hours=>rule.duration_hours),gen_random_uuid(),(created_time at time zone 'Asia/Tokyo')::date,variant.raid_variant_id,'ROOM:'||instance_id::text);
  new_room:=(public._raid_room_register_v1(instance_id,uid,e.difficulty)->>'roomId')::uuid;
  insert into public.raid_room_combat_snapshots(room_id,profile,enemy_snapshot)
   values(new_room,launch_profile,public._raid_room_launch_enemy_snapshot_v1(launch_profile,instance_id,variant.max_hp));
  update public.quest_raid_encounters set status='CREATED',room_id=new_room where patrol_id=p_patrol_id;
  update public.quest_raid_encounter_progress set first_created=true,misses=0 where user_id=uid;
 exception when others then
  -- Keep DRAWN on generation failure. The Quest reward was a separate committed transaction.
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id,'reason','CREATE_FAILED');
 end;
 return public.quest_raid_encounter_projection_v1(p_patrol_id);
end $$;

-- SECTION 07 supabase/migrations/20260914072512_raid_room_mission_finalization_hooks.sql

DO $patch$
declare
  v_definition text;
  v_anchor text;
begin
  v_definition := replace(pg_get_functiondef('public.finalize_raid_room_battle_v1(uuid,jsonb)'::regprocedure), chr(13), '');
  v_anchor := E'  -- Room報酬・旧ミッション資格はここで新規付与しない。\n  return v_final;';
  if strpos(v_definition, v_anchor) = 0 or strpos(v_definition, 'evaluate_mission_progress') > 0 then
    raise exception 'Room finalize Mission hook requires source review';
  end if;
  execute replace(v_definition, v_anchor, E'  -- Replay行lockとFINALIZED早期returnにより、正式確定ごとに1回だけ加算。\n  perform public.evaluate_mission_progress(v_replay.requester_user_id, ''RAID_FINALIZED'', 1);\n  return v_final;');

  v_definition := replace(pg_get_functiondef('public._issue_raid_room_clear_rewards_v1(uuid)'::regprocedure), chr(13), '');
  v_anchor := E'  if v_inserted=0 then continue;end if;\n  for v_item';
  if strpos(v_definition, v_anchor) = 0 or strpos(v_definition, 'evaluate_mission_progress') > 0 then
    raise exception 'Room clear Mission hook requires source review';
  end if;
  execute replace(v_definition, v_anchor, E'  if v_inserted=0 then continue;end if;\n  -- Clear gate通過・資格ledger新規作成時だけ。retryやitem数では増やさない。\n  perform public.evaluate_mission_progress(v_member.user_id, ''RAID_CLEAR_ELIGIBLE'', 1);\n  for v_item');
end
$patch$;

-- SECTION 08 supabase/migrations/20260914072613_profile_leader_authority_v1.sql


create or replace function public.set_profile_leader_v1(p_character_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception 'character id required' using errcode = '22023';
  end if;

  -- Serialize profile changes, then keep ownership stable through the update.
  perform 1 from public.users where id = v_user_id for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.user_characters
  where user_id = v_user_id and character_id = p_character_id
  for key share;
  if not found then
    raise exception 'owned character not found' using errcode = 'P0002';
  end if;

  update public.users set favorite_character_id = p_character_id
  where id = v_user_id and favorite_character_id is distinct from p_character_id;
  return jsonb_build_object('status', 'success', 'favorite_character_id', p_character_id);
end;
$$;

revoke all on function public.set_profile_leader_v1(text) from public, anon;
grant execute on function public.set_profile_leader_v1(text) to authenticated;
notify pgrst, 'reload schema';

-- SECTION 09 supabase/migrations/20260914074959_formal_open_ap_max_50.sql

insert into public.canonical_action_resource_master(version,resource_type,natural_max,hard_cap,recovery_amount,recovery_interval_seconds,entry_cost)
select '2026-09-14',resource_type,case when resource_type='VITALITY' then 50 else natural_max end,
 hard_cap,recovery_amount,recovery_interval_seconds,entry_cost
from public.canonical_action_resource_master where version='2026-08-22'
on conflict(version,resource_type) do update set natural_max=excluded.natural_max,hard_cap=excluded.hard_cap,
 recovery_amount=excluded.recovery_amount,recovery_interval_seconds=excluded.recovery_interval_seconds,entry_cost=excluded.entry_cost;
-- 初期値のみ。既存users.vitalityをUPDATEしない。
alter table public.users alter column vitality set default 50;
DO $patch$
declare v_sql text;
begin
 v_sql:=replace(pg_get_functiondef('public.sync_and_recover_vitality_and_pvp_points(uuid)'::regprocedure),chr(13),'');
 if (length(v_sql)-length(replace(v_sql,'v_vit<100','')))/length('v_vit<100')<>2
  or strpos(v_sql,'least(100,v_vit+v_vit_steps)')=0 or strpos(v_sql,'v_vit=100')=0 then
  raise exception 'AP recovery definition drift: review before applying MAX50';
 end if;
 v_sql:=replace(replace(replace(v_sql,'v_vit<100','v_vit<50'),'least(100,v_vit+v_vit_steps)','least(50,v_vit+v_vit_steps)'),'v_vit=100','v_vit=50');
 execute v_sql;
 v_sql:=replace(pg_get_functiondef('public.start_patrol(text,text)'::regprocedure),chr(13),'');
 if strpos(v_sql,'case when vitality>=100 then now() else vitality_last_recovered_at end')=0 then
  raise exception 'Quest AP timer definition drift: review before applying MAX50';
 end if;
 -- 50以上から消費する時にtimerを再開。上限滞在中の経過時間を持ち越さない。
 execute replace(v_sql,'case when vitality>=100 then now() else vitality_last_recovered_at end',
 'case when vitality>=50 then now() else vitality_last_recovered_at end');
end
$patch$;

-- SECTION 10 supabase/migrations/20260914075032_quest_main_formation_authority.sql

create or replace function public.create_patrol_battle_replay(p_patrol_id uuid,p_tactic_id text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_patrol public.user_patrols%rowtype; v_ids text[]; v_player jsonb; v_enemy jsonb; v_replay uuid; v_seed bigint; v_enemy_tactic text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_tactic_id not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS') then raise exception 'invalid tactic' using errcode='22023'; end if;
 select * into v_patrol from public.user_patrols where id=p_patrol_id and user_id=v_uid and (status='CLAIMABLE' or(status='ONGOING' and expires_at<=now())) and has_battle_event and not coalesce(battle_resolved,false) for update;
 if not found or v_patrol.encounter_snapshot is null then raise exception 'eligible patrol encounter not found' using errcode='P0002'; end if;
 update public.user_patrols set status='CLAIMABLE' where id=p_patrol_id and status='ONGOING';
 -- Read the saved Main Formation for every new battle, in saved slot order.
 -- Exploration ownership/bonus stays on user_patrols and never selects combatants.
 select array_agg(entry.value->>'character_id' order by entry.ordinality) into v_ids
 from jsonb_array_elements(public.get_current_main_formation()->'characters')
 with ordinality entry(value,ordinality);
 if coalesce(cardinality(v_ids),0) not between 1 and 5 then
   raise exception 'saved main formation required' using errcode='23514';
 end if;
 -- Keep the existing tutorial adjustments; these are pass-through outside Tutorial Battle.
 v_player:=public.apply_tutorial_player_snapshot(v_uid,public.build_server_battle_snapshot(v_uid,v_ids,'PLAYER'));
 v_enemy:=v_patrol.encounter_snapshot->'members';
 v_enemy:=public.apply_tutorial_enemy_snapshot(v_uid,v_player,v_enemy);
 v_enemy_tactic:=coalesce(v_patrol.encounter_snapshot->>'enemyTactic','BALANCED');
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,enemy_tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority) values(v_uid,'QUEST',p_patrol_id,p_tactic_id,v_enemy_tactic,v_seed,v_player,v_enemy,'PATROL_SERVER') returning id into v_replay;
 return jsonb_build_object('replay_session_id',v_replay,'player_snapshot',v_player,'enemy_snapshot',v_enemy,'enemy_tactic',v_enemy_tactic);
end $$;
revoke all on function public.create_patrol_battle_replay(uuid,text) from public,anon;
grant execute on function public.create_patrol_battle_replay(uuid,text) to authenticated;
notify pgrst, 'reload schema';

-- SECTION 11 supabase/migrations/20260914110224_skill_enhancement_mission_terminology.sql


do $$
begin
  if not exists (
    select 1 from public.missions
    where id = 'GVG_PREP_02'
      and trigger_type in ('SKILL_LEVEL_TOTAL_INCREASE', 'SKILL_ENHANCE_COUNT')
      and target_value = 5
  ) then
    raise exception 'GVG_PREP_02 expected skill enhancement mission missing or changed';
  end if;
end $$;

update public.missions
set trigger_type = 'SKILL_ENHANCE_COUNT',
    description = '開催期間中にスキルを合計5回強化',
    desc_text = '開催期間中にスキルを合計5回強化'
where id = 'GVG_PREP_02';

-- SECTION 12 supabase/migrations/20260914110219_gameplay_direct_reward_delivery.sql

create table public.gameplay_reward_delivery_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id),
 source_kind text not null check(source_kind in ('QUEST_DROP','RAID_ROOM_CLEAR','RAID_ROOM_RESCUE','QUEST_RAID_ENCOUNTER','LOGIN_BONUS','RANKING_SEASON')),
 source_key text not null,
 item_id text not null,
 quantity integer not null check(quantity>0),
 delivered_at timestamptz not null default clock_timestamp(),
 unique(user_id,source_kind,source_key,item_id)
);
alter table public.gameplay_reward_delivery_ledger enable row level security;
revoke all on public.gameplay_reward_delivery_ledger from public,anon,authenticated;
-- 内部呼出専用。所有者を検証する既存RPC/Room finalizerの権限・資格判定を維持。
create function public._grant_gameplay_reward_v1(p_user uuid,p_source text,p_key text,p_item text,p_quantity integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_saved public.gameplay_reward_delivery_ledger%rowtype; v_item text;
begin
 if p_user is null or p_key is null or p_key='' or p_item is null or p_quantity is null or p_quantity<=0 then
  raise exception 'Invalid gameplay reward';
 end if;
 v_item:=public.resolve_canonical_reward_item(p_item);
 insert into public.gameplay_reward_delivery_ledger(user_id,source_kind,source_key,item_id,quantity)
 values(p_user,p_source,p_key,v_item,p_quantity) on conflict do nothing returning id into v_id;
 if v_id is null then
  select * into strict v_saved from public.gameplay_reward_delivery_ledger
   where user_id=p_user and source_kind=p_source and source_key=p_key and item_id=v_item;
  if v_saved.quantity<>p_quantity then raise exception 'Gameplay reward replay mismatch';end if;
  return v_saved.id;
 end if;
 -- 既存の資産付与Authorityを再利用。失敗はledgerを含む呼出全体をrollback。
 perform public.grant_present_payload(p_user,v_item,p_quantity);
 return v_id;
end $$;
revoke all on function public._grant_gameplay_reward_v1(uuid,text,text,text,integer) from public,anon,authenticated,service_role;
alter table public.raid_room_clear_reward_grants alter column present_id drop not null;
alter table public.raid_room_clear_reward_grants add column direct_delivery_id uuid unique references public.gameplay_reward_delivery_ledger(id);
alter table public.raid_room_clear_reward_grants add constraint raid_clear_delivery_exactly_one check(num_nonnulls(present_id,direct_delivery_id)=1);
alter table public.raid_room_rescue_reward_grants alter column present_id drop not null;
alter table public.raid_room_rescue_reward_grants add column direct_delivery_id uuid unique references public.gameplay_reward_delivery_ledger(id);
alter table public.raid_room_rescue_reward_grants add constraint raid_rescue_delivery_exactly_one check(num_nonnulls(present_id,direct_delivery_id)=1);

DO $patch$
declare v_definition text; v_anchor text := $anchor$     insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
     values(v_uid,v_item.item_id,v_item.quantity,'クエストドロップ: '||v_patrol.display_name,'UNCLAIMED',now()+interval '24 hours');$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.claim_patrol_rewards(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.claim_patrol_rewards(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$     perform public._grant_gameplay_reward_v1(v_uid,'QUEST_DROP',p_patrol_id::text||':'||v_item.roll_index::text,v_item.item_id,v_item.quantity);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド討伐報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_CLEAR',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'rewardMultiplier',coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id),1),'ruleVersion',(v_progress->'clearGate'->>'ruleVersion')::bigint))
   returning id into v_present;
   insert into public.raid_room_clear_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public._issue_raid_room_clear_rewards_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public._issue_raid_room_clear_rewards_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_CLEAR',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_clear_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at)$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_clear_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_clear_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at)$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$from public.raid_room_clear_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_clear_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_clear_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$from public.raid_room_clear_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'expiresAt',v_saved.expires_at,'items',v_items$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_clear_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_clear_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'expiresAt',case when exists(select 1 from public.raid_room_clear_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド救援成功報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_RESCUE',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'rewardMultiplier',coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id),1),'ruleVersion',(v_progress->'rescueGate'->>'ruleVersion')::bigint,'rewardVersion',v_rule.reward_version))
   returning id into v_present;
   insert into public.raid_room_rescue_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public._issue_raid_room_rescue_rewards_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public._issue_raid_room_rescue_rewards_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_RESCUE',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_rescue_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at)$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_rescue_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_rescue_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at)$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$from public.raid_room_rescue_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_rescue_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_rescue_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$from public.raid_room_rescue_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'expiresAt',v_saved.expires_at,'items',v_items$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_rescue_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_rescue_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'expiresAt',case when exists(select 1 from public.raid_room_rescue_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$  insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
  values(new.user_id,item->>'itemId',(item->>'quantity')::integer,'強敵発見ボーナス','UNCLAIMED',now(),now()+interval '30 days','QUEST_RAID_ENCOUNTER',new.room_id::text||':'||(item->>'itemId'),jsonb_build_object('roomId',new.room_id,'ruleVersion',e.rule_version));$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.issue_quest_raid_encounter_bonus_v1()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.issue_quest_raid_encounter_bonus_v1()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$  perform public._grant_gameplay_reward_v1(new.user_id,'QUEST_RAID_ENCOUNTER',new.room_id::text,item->>'itemId',(item->>'quantity')::integer);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'issued',exists(select 1 from public.quest_raid_encounter_bonus_grants$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_quest_raid_bonus_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_quest_raid_bonus_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'delivery',case when exists(select 1 from public.gameplay_reward_delivery_ledger where source_kind='QUEST_RAID_ENCOUNTER' and source_key=p_room_id::text and user_id=auth.uid()) then 'DIRECT' else 'PRESENT' end,'issued',exists(select 1 from public.quest_raid_encounter_bonus_grants$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$  INSERT INTO public.presents (
    user_id, item_id, quantity, message, status, sent_at, expire_at
  ) VALUES (
    v_user_id,
    v_reward.item_id,
    v_reward.quantity,
    'ログインボーナス: ' || v_reward.item_name,
    'UNCLAIMED',
    v_now,
    v_now + interval '30 days'
  );$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.process_login_bonus()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.process_login_bonus()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$  PERFORM public._grant_gameplay_reward_v1(v_user_id,'LOGIN_BONUS',v_today_jst::text,v_reward.item_id,v_reward.quantity);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'claimed', true,$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.process_login_bonus()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.process_login_bonus()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'delivery', 'DIRECT',
    'claimed', true,$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'claimed', false,$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.process_login_bonus()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.process_login_bonus()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'delivery', case when exists(select 1 from public.gameplay_reward_delivery_ledger where user_id=v_user_id and source_kind='LOGIN_BONUS' and source_key=v_today_jst::text) then 'DIRECT' else 'PRESENT' end,
      'claimed', false,$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$      insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(p_recipient_user_id,v_item_id,v_quantity,v_message,'UNCLAIMED',clock_timestamp()+interval '30 days')
      returning id into v_present_id;
      update public.ranking_season_reward_grants set present_id=v_present_id
      where season_id=p_season_id and ranking_category=p_category
        and recipient_user_id=p_recipient_user_id and reward_key=v_reward_key;$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$      perform public._grant_gameplay_reward_v1(p_recipient_user_id,'RANKING_SEASON',p_season_id::text||':'||p_category||':'||v_reward_key,v_item_id,v_quantity);$replacement$);
end $patch$;

notify pgrst,'reload schema';

-- SECTION 13 supabase/migrations/20260914112059_formal_open_season_claim_contract.sql

DO $patch$
declare v_definition text; v_anchor text := $anchor$where event.is_enabled and ($anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_active_mission_events()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Formal open source drift: public.get_active_mission_events()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$where event.is_enabled and (event.claim_deadline is null or clock_timestamp()<event.claim_deadline) and ($replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$begin
  select count(*)::integer into v_completed$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.refresh_special_event_completion(uuid,text)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Formal open source drift: public.refresh_special_event_completion(uuid,text)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$begin
  if not exists(select 1 from public.mission_events where id=p_event_id and is_enabled
    and clock_timestamp()>=start_at and clock_timestamp()<progress_end_at) then return;end if;
  select count(*)::integer into v_completed$replacement$);
end $patch$;

create or replace function public.finalize_preopen_guild_power_season_v2(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_ranked_count integer;
  v_grant_count integer;
  v_job_id bigint;
begin
  -- All paths lock the season row before the event advisory lock. This avoids
  -- inversion with a transaction that edits season state then Power inputs.
  select season.* into strict v_season
  from public.ranking_seasons season
  join public.ranking_guild_power_season_master master on master.season_id=season.id
  where master.event_key='PREOPEN_GUILD_POWER_2026'
  for update of season;
  if v_season.status='PREPARING' and clock_timestamp()>=v_season.starts_at then
    perform public.activate_preopen_guild_power_season();
    select * into strict v_season from public.ranking_seasons where id=v_season.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('PREOPEN_GUILD_POWER_2026',0));

  if clock_timestamp()<v_season.ends_at then
    raise exception 'pre-open guild Power season is not closed' using errcode='22023';
  end if;

  if exists(select 1 from public.ranking_guild_power_finalization_audits audit
            where audit.season_id=v_season.id) then
    select jobid into v_job_id from cron.job
    where jobname='preopen-guild-power-finalize-20260909-jst';
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    return (select jsonb_build_object(
      'season_id',audit.season_id,'status','ALREADY_FINALIZED',
      'ranked_guild_count',audit.ranked_guild_count,
      'reward_grant_count',audit.reward_grant_count)
      from public.ranking_guild_power_finalization_audits audit
      where audit.season_id=v_season.id);
  end if;

  if v_season.status='CLOSED' then
    raise exception 'Closed season without finalization audit requires review' using errcode='23514';
  end if;
  -- audit済みは上の早期returnで保持。未確定報酬は適切な限定Emblem設定まで停止。
  if not exists(select 1 from public.cosmetic_master cosmetic
    where cosmetic.id=p_cosmetic_id and cosmetic.owner_scope='GUILD'
      and cosmetic.slot='GUILD_EMBLEM' and cosmetic.active
      and not coalesce(cosmetic.metadata @> '{"standard":true}'::jsonb,false)) then
    raise exception 'FORMAL OPEN LIMITED EMBLEM NOT CONFIGURED' using errcode='23514';
  end if;
  if exists(select 1 from public.ranking_guild_power_reward_grants where season_id=v_season.id) then
    raise exception 'Unfinalized historical reward grants require review' using errcode='23514';
  end if;
  update public.ranking_seasons set status='FINALIZING',updated_at=clock_timestamp()
  where id=v_season.id and status<>'CLOSED';

  insert into public.ranking_guild_power_season_snapshots(
    season_id,guild_id,guild_name,total_power,member_count,rank_position
  )
  with totals as (
    select guild.id guild_id,guild.name guild_name,
      sum(public.calculate_user_total_power(member.user_id))::bigint total_power,
      count(*)::integer member_count
    from public.guilds guild
    join public.guild_members member on member.guild_id=guild.id
    where not exists(
      select 1 from public.ranking_guild_exclusions exclusion where exclusion.guild_id=guild.id
    )
    group by guild.id,guild.name
    having sum(public.calculate_user_total_power(member.user_id))>0
  ), ranked as (
    select totals.*,rank() over(order by totals.total_power desc)::integer rank_position
    from totals
  )
  select v_season.id,ranked.guild_id,ranked.guild_name,ranked.total_power,
    ranked.member_count,ranked.rank_position
  from ranked
  on conflict(season_id,guild_id) do nothing;

  insert into public.ranking_guild_power_reward_grants(
    season_id,guild_id,cosmetic_id,rank_position
  )
  select snapshot.season_id,snapshot.guild_id,reward.cosmetic_id,snapshot.rank_position
  from public.ranking_guild_power_season_snapshots snapshot
  cross join lateral (
    select p_cosmetic_id as cosmetic_id
  ) reward
  where snapshot.season_id=v_season.id and snapshot.rank_position=1
  on conflict(season_id,guild_id,cosmetic_id) do nothing;

  insert into public.guild_cosmetics(
    guild_id,cosmetic_id,source_type,source_reference
  )
  select grant_row.guild_id,grant_row.cosmetic_id,'RANKING',
    concat('PREOPEN_GUILD_POWER_2026:',grant_row.season_id)
  from public.ranking_guild_power_reward_grants grant_row
  where grant_row.season_id=v_season.id
  on conflict(guild_id,cosmetic_id) do nothing;

  insert into public.ranking_guild_power_reward_recipients(
    season_id,guild_id,recipient_user_id
  )
  select snapshot.season_id,snapshot.guild_id,member.user_id
  from public.ranking_guild_power_season_snapshots snapshot
  join public.guild_members member on member.guild_id=snapshot.guild_id
  where snapshot.season_id=v_season.id
  on conflict(season_id,guild_id,recipient_user_id) do nothing;

  insert into public.ranking_reward_notifications(
    recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
  )
  select recipient.recipient_user_id,'SEASON',recipient.season_id::text,clock_timestamp(),null
  from public.ranking_guild_power_reward_recipients recipient
  where recipient.season_id=v_season.id and exists(
    select 1 from public.ranking_guild_power_reward_grants grant_row
    where grant_row.season_id=recipient.season_id and grant_row.guild_id=recipient.guild_id)
  on conflict(recipient_user_id,period_kind,period_key) do nothing;

  select count(*) into v_ranked_count
  from public.ranking_guild_power_season_snapshots where season_id=v_season.id;
  select count(*) into v_grant_count
  from public.ranking_guild_power_reward_grants where season_id=v_season.id;

  update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp()
  where id=v_season.id;
  insert into public.ranking_guild_power_finalization_audits(
    season_id,ranked_guild_count,reward_grant_count
  ) values(v_season.id,v_ranked_count,v_grant_count);

  select jobid into v_job_id from cron.job
  where jobname='preopen-guild-power-finalize-20260909-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  return jsonb_build_object(
    'season_id',v_season.id,'status','FINALIZED',
    'ranked_guild_count',v_ranked_count,'reward_grant_count',v_grant_count
  );
end;
$$;
revoke all on function public.finalize_preopen_guild_power_season_v2(text) from public,anon,authenticated;
grant execute on function public.finalize_preopen_guild_power_season_v2(text) to service_role;

-- 呼出しはメンテナンスで操作停止を確認した後のみ。Migrationはこれを実行しない。
create function public.close_gvg_preparation_missions_v1(p_progress_end timestamptz,p_claim_anchor timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.mission_events%rowtype;v_deadline timestamptz;
begin
 if p_progress_end is null or p_claim_anchor is null or p_claim_anchor<p_progress_end
   or p_claim_anchor>clock_timestamp() then raise exception 'Confirmed maintenance timestamps required';end if;
 select * into strict v_event from public.mission_events where id='GVG_PREP_20260904' for update;
 if p_progress_end<=v_event.start_at then raise exception 'Invalid event close boundary';end if;
 v_deadline:=p_claim_anchor+interval '30 days';
 if v_event.claim_deadline is not null and
   (v_event.progress_end_at<>p_progress_end or v_event.claim_deadline<>v_deadline) then
   raise exception 'Existing claim contract differs; explicit review required';
 end if;
 update public.mission_events set progress_end_at=p_progress_end,claim_deadline=v_deadline,updated_at=clock_timestamp()
 where id=v_event.id;
 return jsonb_build_object('event_id',v_event.id,'progress_end_at',p_progress_end,'claim_deadline',v_deadline);
end $$;
revoke all on function public.close_gvg_preparation_missions_v1(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.close_gvg_preparation_missions_v1(timestamptz,timestamptz) to service_role;
notify pgrst,'reload schema';

-- SECTION 14 supabase/migrations/20260914115128_pvp_opponent_main_formation_start.sql
-- Fix the Main Formation matchmaking/start mismatch without changing BP, replay or season contracts.
-- Preserve the current RPC body and its existing grants. Never populate legacy defense decks.
do $migration$
declare
  v_definition text := replace(pg_get_functiondef('public.start_pvp_battle(uuid,text[],text)'::regprocedure), chr(13), '');
begin
  if position($new$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, v_opponent_character_ids, 'ENEMY');$new$ in v_definition) > 0 then
    return;
  end if;
  if position($old$  v_deck public.pvp_defense_decks%rowtype;$old$ in v_definition) = 0
     or position($old$  select deck.* into v_deck
  from public.pvp_defense_decks deck
  where deck.user_id = p_opponent_user_id;
  if not found then raise exception 'opponent defense deck not found' using errcode = 'P0002'; end if;$old$ in v_definition) = 0
     or position($old$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, array_remove(array[
    v_deck.character_1_id, v_deck.character_2_id, v_deck.character_3_id,
    v_deck.character_4_id, v_deck.character_5_id
  ]::text[], null), 'ENEMY');$old$ in v_definition) = 0 then
    raise exception 'start_pvp_battle authority anchors changed; review before applying';
  end if;
  v_definition := replace(v_definition, $old$  v_deck public.pvp_defense_decks%rowtype;$old$, '  v_opponent_character_ids text[];');
  v_definition := replace(v_definition, $old$  select deck.* into v_deck
  from public.pvp_defense_decks deck
  where deck.user_id = p_opponent_user_id;
  if not found then raise exception 'opponent defense deck not found' using errcode = 'P0002'; end if;$old$, $new$  -- Match get_pvp_opponents_page: the saved Main Formation is the opponent authority.
  select array_agg(formation.user_character_id::text order by formation.slot)
  into v_opponent_character_ids
  from public.user_main_formations formation
  where formation.user_id = p_opponent_user_id;
  if coalesce(cardinality(v_opponent_character_ids), 0) = 0 then
    raise exception 'opponent main formation not found' using errcode = 'P0002';
  end if;$new$);
  v_definition := replace(v_definition, $old$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, array_remove(array[
    v_deck.character_1_id, v_deck.character_2_id, v_deck.character_3_id,
    v_deck.character_4_id, v_deck.character_5_id
  ]::text[], null), 'ENEMY');$old$, $new$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, v_opponent_character_ids, 'ENEMY');$new$);
  execute v_definition;
end;
$migration$;

-- SECTION 15 supabase/migrations/20260914124315_guild_tenure_day_one_projection.sql

DO $guard$
BEGIN
  IF md5(replace(pg_get_functiondef('public.refresh_normal_mission_owned_state(uuid)'::regprocedure),chr(13),'')) <> '644ac650621ae488a106d37d162dba94' THEN
    RAISE EXCEPTION 'Guild tenure migration: refresh_normal_mission_owned_state definition drift';
  END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.refresh_normal_mission_owned_state(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception 'Mission progress owner mismatch' using errcode='42501';
  end if;
  with observed(trigger_type, value) as (
    select 'CHARACTER_LEVEL_AT_LEAST', coalesce(max(level),0) from public.user_characters where user_id=p_user_id
    union all select 'CHARACTER_AWAKENING_AT_LEAST',coalesce(max(awakening_level),0) from public.user_characters where user_id=p_user_id
    union all select 'SKILL_AWAKENING_AT_LEAST',coalesce(max(plus_val),0) from public.user_skills where user_id=p_user_id
    union all select 'EQUIPMENT_LIMIT_BREAK_AT_LEAST',coalesce(max(plus_val),0) from public.user_equipments where user_id=p_user_id
    -- Approved 2026-09-14: membership joining date is Day 1, in JST.
    -- No current membership => no observation, so progress stops on leaving.
    -- A new membership's joined_at projects its own tenure (no accumulated login count).
    union all select 'GUILD_TENURE_DAYS',
      (statement_timestamp() at time zone 'Asia/Tokyo')::date
        - (joined_at at time zone 'Asia/Tokyo')::date + 1
    from public.guild_members
    where user_id=p_user_id and joined_at is not null and joined_at<=statement_timestamp()
  )
  update public.user_missions um
  set current_progress=least(m.target_value,greatest(o.value,0)),
      progress_val=least(m.target_value,greatest(o.value,0)),
      status=case when o.value>=m.target_value then 'CLEAR' else 'PROGRESS' end,
      updated_at=clock_timestamp()
  from public.missions m join observed o on o.trigger_type=m.trigger_type
  where um.user_id=p_user_id and um.mission_id=m.id and m.is_enabled and m.category='NORMAL'
    -- Once authoritatively attained, keep CLEAR even if an item is later consumed.
    -- Existing suspect CLEAR rows are blocked by the apply-time impact guard above.
    and um.status = 'PROGRESS'
    and (um.current_progress is distinct from least(m.target_value,greatest(o.value,0))
      or um.status is distinct from case when o.value>=m.target_value then 'CLEAR' else 'PROGRESS' end);
end;
$function$;

-- SECTION 16 supabase/migrations/20260914153000_growth_exp_authority.sql


alter table public.user_characters add column if not exists xp bigint not null default 0 check (xp >= 0);
alter table public.user_equipments add column if not exists xp bigint not null default 0 check (xp >= 0);
alter table public.character_level_up_master add column if not exists required_exp integer;
insert into public.character_level_up_master(level,cost_cash,required_material_count,required_exp)
select lv,100,1,(array[100,200,350,500,700,1000,1400,1900,2500,3200])[((lv-1)/10)+1]
from generate_series(2,100) lv
on conflict(level) do update set cost_cash=excluded.cost_cash,required_exp=excluded.required_exp;
alter table public.character_level_up_master alter column required_exp set not null;
insert into public.equipment_level_up_master(level,cost_cash,required_exp)
select lv,50,(array[50,100,200,300,450,650,900,1250,1700,2250])[((lv-1)/10)+1]
from generate_series(2,100) lv
on conflict(level) do update set cost_cash=excluded.cost_cash,required_exp=excluded.required_exp;

create table public.growth_exp_execution_history (
 user_id uuid not null references public.users(id),
 request_id uuid not null,
 kind text not null check(kind in ('CHARACTER','EQUIPMENT')),
 owned_id uuid not null,
 materials jsonb not null,
 result_payload jsonb,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.growth_exp_execution_history enable row level security;
revoke all on public.growth_exp_execution_history from public,anon,authenticated;
grant select on public.growth_exp_execution_history to authenticated;
grant all on public.growth_exp_execution_history to service_role;
create policy growth_exp_history_owner_read on public.growth_exp_execution_history
 for select to authenticated using(user_id=auth.uid());

create or replace function public.get_growth_exp_master()
returns jsonb language sql stable security definer set search_path=public as $fn$
select jsonb_build_object(
 'version','2026-09-14',
 'character',(select jsonb_agg(jsonb_build_object('level',level,'required_exp',required_exp,'cost_cash',cost_cash) order by level) from public.character_level_up_master where level between 2 and 100),
 'equipment',(select jsonb_agg(jsonb_build_object('level',level,'required_exp',required_exp,'cost_cash',cost_cash) order by level) from public.equipment_level_up_master where level between 2 and 100),
 'items',(select jsonb_agg(jsonb_build_object('item_id',item_id,'effect_value',(runtime_usage->>'effectValue')::bigint) order by item_id) from public.canonical_item_master where version='2026-08-22' and is_production_enabled and item_id in ('CHAR_EXP_S','CHAR_EXP_M','CHAR_EXP_L','EQUIP_EXP_S','EQUIP_EXP_M','EQUIP_EXP_L'))
)
$fn$;

create or replace function public.quote_growth_exp(p_kind text,p_owned_id uuid,p_materials jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare
 u uuid:=auth.uid(); original_level integer; original_xp bigint; lv integer; exp bigint;
 cap integer; enhancement integer; req integer; cost_per_level integer; cash_cost bigint:=0;
 cash_balance bigint; gained bigint:=0; entry record; qty bigint; effect bigint; count_items bigint:=0;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('CHARACTER','EQUIPMENT') or p_owned_id is null
    or p_materials is null or jsonb_typeof(p_materials)<>'object' then
  raise exception 'invalid growth request' using errcode='22023';
 end if;
 if p_kind='CHARACTER' then
  select level,xp,awakening_level into lv,exp,enhancement from public.user_characters where id=p_owned_id and user_id=u;
  cap:=least(100,50+least(greatest(coalesce(enhancement,0),0),5)*10);
 else
  select level,xp,plus_val into lv,exp,enhancement from public.user_equipments where id=p_owned_id and user_id=u;
  cap:=public.canonical_equipment_level_cap(coalesce(enhancement,0));
 end if;
 if lv is null then raise exception 'owned growth target not found' using errcode='P0002'; end if;
 original_level:=lv; original_xp:=exp;
 for entry in select key,value from jsonb_each(p_materials) order by key loop
  if jsonb_typeof(entry.value)<>'number' or (entry.value::text)!~'^[0-9]+$' then
   raise exception 'material quantity must be a nonnegative integer' using errcode='22023';
  end if;
  qty:=(entry.value::text)::bigint;
  if (p_kind='CHARACTER' and entry.key not in ('CHAR_EXP_S','CHAR_EXP_M','CHAR_EXP_L'))
   or (p_kind='EQUIPMENT' and entry.key not in ('EQUIP_EXP_S','EQUIP_EXP_M','EQUIP_EXP_L')) then
   raise exception 'invalid growth material' using errcode='22023';
  end if;
  if qty>2147483647 then raise exception 'material quantity too large' using errcode='22023'; end if;
  select (runtime_usage->>'effectValue')::bigint into effect from public.canonical_item_master
   where version='2026-08-22' and item_id=entry.key and is_production_enabled;
  if effect is null or effect<=0 then raise exception 'growth item master incomplete' using errcode='P0002'; end if;
  gained:=gained+qty*effect; count_items:=count_items+qty;
 end loop;
 if lv>=100 then raise exception 'final level cap reached' using errcode='23514'; end if;
 exp:=exp+gained;
 while lv<cap loop
  if p_kind='CHARACTER' then
   select required_exp,cost_cash into req,cost_per_level from public.character_level_up_master where level=lv+1;
  else
   select required_exp,cost_cash into req,cost_per_level from public.equipment_level_up_master where level=lv+1;
  end if;
  if req is null or req<=0 or cost_per_level is null or cost_per_level<0 then
   raise exception 'growth level master incomplete' using errcode='P0002';
  end if;
  exit when exp<req;
  exp:=exp-req; lv:=lv+1; cash_cost:=cash_cost+cost_per_level;
 end loop;
 req:=null;
 if lv<100 then
  if p_kind='CHARACTER' then select required_exp into req from public.character_level_up_master where level=lv+1;
  else select required_exp into req from public.equipment_level_up_master where level=lv+1; end if;
  if req is null or req<=0 then raise exception 'growth level master incomplete' using errcode='P0002'; end if;
 end if;
 select cash into cash_balance from public.users where id=u;
 return jsonb_build_object('status','success','kind',p_kind,'owned_id',p_owned_id,
  'current_level',original_level,'current_xp',original_xp,
  'level',lv,'xp',exp,'level_cap',cap,'next_required_exp',req,
  'levels_gained',lv-original_level,'gained_exp',gained,'cash_spent',cash_cost,
  'remaining_cash',cash_balance-cash_cost,'consumed_materials',p_materials);
end
$fn$;

create or replace function public.execute_growth_exp(p_kind text,p_owned_id uuid,p_materials jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare
 u uuid:=auth.uid(); history public.growth_exp_execution_history%rowtype;
 result jsonb; entry record; qty bigint; owned_qty bigint; cash_balance bigint;
 normalized jsonb; inserted integer; gained_levels integer;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_request_id is null or p_kind is null or p_kind not in ('CHARACTER','EQUIPMENT')
  or p_owned_id is null or p_materials is null or jsonb_typeof(p_materials)<>'object' then
  raise exception 'invalid growth request' using errcode='22023';
 end if;
 -- Keep original request identity, including explicitly selected zero values.
 normalized:=p_materials;
 insert into public.growth_exp_execution_history(user_id,request_id,kind,owned_id,materials)
 values(u,p_request_id,p_kind,p_owned_id,normalized) on conflict(user_id,request_id) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then
  select * into history from public.growth_exp_execution_history where user_id=u and request_id=p_request_id for update;
  if history.kind<>p_kind or history.owned_id<>p_owned_id or history.materials<>normalized then
   raise exception 'request_id already used for a different growth request' using errcode='22023';
  end if;
  if history.result_payload is not null then return history.result_payload; end if;
  raise exception 'growth request already in progress' using errcode='55000';
 end if;
 -- Preserve owned-target -> cash -> inventory locking order of legacy growth.
 if p_kind='CHARACTER' then
  perform 1 from public.user_characters where id=p_owned_id and user_id=u for update;
 else
  perform 1 from public.user_equipments where id=p_owned_id and user_id=u for update;
 end if;
 if not found then raise exception 'owned growth target not found' using errcode='P0002'; end if;
 select cash into cash_balance from public.users where id=u for update;
 result:=public.quote_growth_exp(p_kind,p_owned_id,normalized);
 gained_levels:=(result->>'levels_gained')::integer;
 if (result->>'gained_exp')::bigint=0 and gained_levels=0 then
  raise exception 'no EXP or level increase to apply' using errcode='22023';
 end if;
 if cash_balance<(result->>'cash_spent')::bigint then
  raise exception 'insufficient cash' using errcode='23514';
 end if;
 for entry in select key,value from jsonb_each(normalized) order by key loop
  qty:=(entry.value::text)::bigint;
  if qty=0 then continue; end if;
  select quantity into owned_qty from public.user_items where user_id=u and item_id=entry.key for update;
  if coalesce(owned_qty,0)<qty then raise exception 'insufficient growth material' using errcode='23514'; end if;
 end loop;
 update public.users set cash=cash-(result->>'cash_spent')::bigint where id=u;
 for entry in select key,value from jsonb_each(normalized) order by key loop
  qty:=(entry.value::text)::bigint;
  if qty>0 then
   update public.user_items set quantity=quantity-qty,updated_at=now() where user_id=u and item_id=entry.key;
  end if;
 end loop;
 if p_kind='CHARACTER' then
  update public.user_characters set level=(result->>'level')::integer,xp=(result->>'xp')::bigint where id=p_owned_id and user_id=u;
 else
  update public.user_equipments set level=(result->>'level')::integer,xp=(result->>'xp')::bigint where id=p_owned_id and user_id=u;
 end if;
 if gained_levels>0 then
  perform public.evaluate_mission_progress(u,case when p_kind='CHARACTER' then 'CHAR_LEVEL_UP' else 'GEAR_UPGRADE' end,gained_levels);
 end if;
 result:=result||jsonb_build_object('request_id',p_request_id);
 update public.growth_exp_execution_history set result_payload=result where user_id=u and request_id=p_request_id;
 return result;
end
$fn$;

create or replace function public.level_up_character_exp(p_character_id uuid,p_materials jsonb,p_request_id uuid)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.execute_growth_exp('CHARACTER',p_character_id,p_materials,p_request_id)
$fn$;
create or replace function public.level_up_equipment_exp(p_equipment_id uuid,p_materials jsonb,p_request_id uuid)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.execute_growth_exp('EQUIPMENT',p_equipment_id,p_materials,p_request_id)
$fn$;
create or replace function public.level_up_character(p_character_id uuid,p_exp_item_id text,p_count integer default 1)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.level_up_character_exp(p_character_id,jsonb_build_object(p_exp_item_id,p_count),gen_random_uuid())
$fn$;
create or replace function public.level_up_equipment(p_equipment_id uuid,p_exp_item_id text,p_count integer default 1)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.level_up_equipment_exp(p_equipment_id,jsonb_build_object(p_exp_item_id,p_count),gen_random_uuid())
$fn$;

revoke all on function public.execute_growth_exp(text,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.get_growth_exp_master(),public.quote_growth_exp(text,uuid,jsonb),
 public.level_up_character_exp(uuid,jsonb,uuid),public.level_up_equipment_exp(uuid,jsonb,uuid),
 public.level_up_character(uuid,text,integer),public.level_up_equipment(uuid,text,integer) from public,anon;
grant execute on function public.get_growth_exp_master(),public.quote_growth_exp(text,uuid,jsonb),
 public.level_up_character_exp(uuid,jsonb,uuid),public.level_up_equipment_exp(uuid,jsonb,uuid),
 public.level_up_character(uuid,text,integer),public.level_up_equipment(uuid,text,integer) to authenticated,service_role;

do $check$ begin
 if (select sum(required_exp) from public.character_level_up_master where level between 2 and 100)<>118400
 or (select sum(required_exp) from public.equipment_level_up_master where level between 2 and 100)<>78450 then
  raise exception 'growth EXP master checksum mismatch';
 end if;
end $check$;
notify pgrst,'reload schema';

-- SECTION 17 supabase/migrations/20260914210000_preopen_rank_one_reward_projection.sql

do $patch$
declare
  v_definition text;
  v_anchor text := 'where cosmetic.active';
begin
  v_definition := pg_get_functiondef('public.get_public_ranking_reward_master()'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1
     or position('PREOPEN_GUILD_POWER_2026' in v_definition)=0 then
    raise exception 'PREOPEN_REWARD_PROJECTION_SOURCE_DRIFT';
  end if;
  execute replace(v_definition,v_anchor,
    'where cosmetic.active and cosmetic.id = ''guild_preopen_2026_rank_1''');
end $patch$;
notify pgrst,'reload schema';

-- SECTION 18 supabase/migrations/20260914220000_canonical_character_growth_runtime.sql

DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.canonical_character_stats(text,integer,integer)'::regprocedure))
 <> '2c196719fe8fcd72b10ffc2c5e578d7e' THEN RAISE EXCEPTION 'CANONICAL_GROWTH_RUNTIME_SOURCE_DRIFT'; END IF;
END $guard$;
CREATE TABLE public.canonical_character_growth_exponents (
 growth_pattern_id text PRIMARY KEY,
 hp numeric NOT NULL CHECK(hp>0),atk numeric NOT NULL CHECK(atk>0),
 def numeric NOT NULL CHECK(def>0),spd numeric NOT NULL CHECK(spd>0),luk numeric NOT NULL CHECK(luk>0)
);
INSERT INTO public.canonical_character_growth_exponents VALUES
('ATTACKER',1.05,0.9,1.1,0.95,1),
('BALANCED',1,1,1,1,1),
('DEFENDER',0.95,1.1,0.9,1.1,1),
('HP_TANK',0.85,1.1,0.95,1.15,1.05),
('LUCKY_STAR',1.05,1.05,1.05,0.95,0.85),
('SPEEDSTER',1.1,1,1.1,0.85,0.95);
CREATE TABLE public.canonical_character_growth_assignments (
 version text NOT NULL,
 character_id text NOT NULL,
 growth_pattern_id text NOT NULL REFERENCES public.canonical_character_growth_exponents(growth_pattern_id),
 PRIMARY KEY(version,character_id),
 FOREIGN KEY(version,character_id) REFERENCES public.canonical_character_master(version,character_id)
);
-- Generated from characters_20260821.json blob cbae064187916fa768bf5ebd0dbc039fc085e35e.
INSERT INTO public.canonical_character_growth_assignments VALUES
('2026-08-21','char_go_01','ATTACKER'),
('2026-08-21','char_kengo_01','ATTACKER'),
('2026-08-21','char_koharu_01','DEFENDER'),
('2026-08-21','char_reiji_01','DEFENDER'),
('2026-08-21','char_ageha_01','SPEEDSTER'),
('2026-08-21','char_leo_01','SPEEDSTER'),
('2026-08-21','char_karen_01','LUCKY_STAR'),
('2026-08-21','char_miyabi_01','LUCKY_STAR'),
('2026-08-21','char_kaede_01','BALANCED'),
('2026-08-21','char_mio_01','BALANCED'),
('2026-08-21','char_tetsu_01','ATTACKER'),
('2026-08-21','char_takuro_01','ATTACKER'),
('2026-08-21','char_lucas_01','ATTACKER'),
('2026-08-21','char_leon_01','ATTACKER'),
('2026-08-21','char_takeshi_01','DEFENDER'),
('2026-08-21','char_genji_01','DEFENDER'),
('2026-08-21','char_riki_01','DEFENDER'),
('2026-08-21','char_long_01','DEFENDER'),
('2026-08-21','char_sora_01','SPEEDSTER'),
('2026-08-21','char_reina_01','SPEEDSTER'),
('2026-08-21','char_noa_01','SPEEDSTER'),
('2026-08-21','char_taiga_01','SPEEDSTER'),
('2026-08-21','char_alice_01','LUCKY_STAR'),
('2026-08-21','char_rui_01','LUCKY_STAR'),
('2026-08-21','char_maya_01','LUCKY_STAR'),
('2026-08-21','char_seiya_01','LUCKY_STAR'),
('2026-08-21','char_sakura_01','BALANCED'),
('2026-08-21','char_martina_01','BALANCED'),
('2026-08-21','char_kageyama_01','BALANCED'),
('2026-08-21','char_cecile_01','BALANCED'),
('2026-08-21','char_chang_01','ATTACKER'),
('2026-08-21','char_daimon_01','ATTACKER'),
('2026-08-21','char_mark_01','ATTACKER'),
('2026-08-21','char_yuji_01','ATTACKER'),
('2026-08-21','char_joe_01','DEFENDER'),
('2026-08-21','char_ren_male_01','DEFENDER'),
('2026-08-21','char_shin_01','DEFENDER'),
('2026-08-21','char_yuki_01','DEFENDER'),
('2026-08-21','char_jihoon_01','SPEEDSTER'),
('2026-08-21','char_kaito_01','SPEEDSTER'),
('2026-08-21','char_minami_01','SPEEDSTER'),
('2026-08-21','char_yukina_01','SPEEDSTER'),
('2026-08-21','char_aoi_01','LUCKY_STAR'),
('2026-08-21','char_mei_01','LUCKY_STAR'),
('2026-08-21','char_ren_01','LUCKY_STAR'),
('2026-08-21','char_serika_01','LUCKY_STAR'),
('2026-08-21','char_makoto_01','BALANCED'),
('2026-08-21','char_momoko_01','BALANCED'),
('2026-08-21','char_rin_01','BALANCED'),
('2026-08-21','char_shion_01','BALANCED'),
('2026-08-21','char_gou_01','ATTACKER'),
('2026-08-21','char_kenji_01','ATTACKER'),
('2026-08-21','char_shun_01','DEFENDER'),
('2026-08-21','char_tatsuya_01','DEFENDER'),
('2026-08-21','char_naoto_01','SPEEDSTER'),
('2026-08-21','char_sawat_01','SPEEDSTER'),
('2026-08-21','char_masato_01','LUCKY_STAR'),
('2026-08-21','char_yoshihiko_01','LUCKY_STAR'),
('2026-08-21','char_souta_01','BALANCED'),
('2026-08-21','char_tomoya_01','BALANCED');
ALTER TABLE public.canonical_character_growth_exponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_character_growth_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canonical_character_growth_exponents,public.canonical_character_growth_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.canonical_character_growth_exponents,public.canonical_character_growth_assignments TO anon,authenticated,service_role;
CREATE POLICY canonical_character_growth_exponents_read ON public.canonical_character_growth_exponents FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY canonical_character_growth_assignments_read ON public.canonical_character_growth_assignments FOR SELECT TO anon,authenticated USING(true);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.canonical_character_growth_assignments WHERE version='2026-08-21')<>60
 OR EXISTS(SELECT 1 FROM public.canonical_character_master c LEFT JOIN public.canonical_character_growth_assignments a USING(version,character_id) WHERE c.version='2026-08-21' AND a.character_id IS NULL)
 THEN RAISE EXCEPTION 'CANONICAL_GROWTH_ASSIGNMENT_INCOMPLETE'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.canonical_character_stats(p_character_id text,p_level integer,p_awakening integer)
RETURNS TABLE(hp integer,atk integer,def integer,spd integer,luk integer)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
WITH source AS (
 SELECT c.*,e.hp AS hp_exponent,e.atk AS atk_exponent,e.def AS def_exponent,e.spd AS spd_exponent,e.luk AS luk_exponent,
 greatest(least(p_level,100),1)::integer AS character_level,
 greatest(least(p_awakening,5),0)::integer AS awakening
 FROM public.canonical_character_master c
 JOIN public.canonical_character_growth_assignments a USING(version,character_id)
 JOIN public.canonical_character_growth_exponents e USING(growth_pattern_id)
 WHERE c.version='2026-08-21' AND c.character_id=p_character_id
), level_stats AS (
 SELECT
 round(lv1_hp::numeric+(lv100_hp::numeric-lv1_hp::numeric)*power((character_level-1)::numeric/99,hp_exponent))::bigint AS hp,
 round(lv1_atk::numeric+(lv100_atk::numeric-lv1_atk::numeric)*power((character_level-1)::numeric/99,atk_exponent))::bigint AS atk,
 round(lv1_def::numeric+(lv100_def::numeric-lv1_def::numeric)*power((character_level-1)::numeric/99,def_exponent))::bigint AS def,
 round(lv1_spd::numeric+(lv100_spd::numeric-lv1_spd::numeric)*power((character_level-1)::numeric/99,spd_exponent))::bigint AS spd,
 round(lv1_luk::numeric+(lv100_luk::numeric-lv1_luk::numeric)*power((character_level-1)::numeric/99,luk_exponent))::bigint AS luk,
 awakening FROM source
)
SELECT
 (hp*(array[10000,10800,11500,13200,15000,17500]::bigint[])[awakening+1]/10000)::integer,
 (atk*(array[10000,10800,11500,13200,15000,17500]::bigint[])[awakening+1]/10000)::integer,
 (def*(array[10000,10800,11500,13200,15000,17500]::bigint[])[awakening+1]/10000)::integer,
 (spd*(array[10000,10300,10600,11000,11500,12000]::bigint[])[awakening+1]/10000)::integer,
 (luk*(array[10000,10300,10600,11000,11500,12000]::bigint[])[awakening+1]/10000)::integer
FROM level_stats
$function$;
-- CURRENT projectionのみ整合。日次Snapshotを更新するrefresh RPCは呼ばない。
-- 通知専用Triggerのみ、表lock内で一時停止し同じ有効状態へ復元。
LOCK TABLE public.user_power_rankings IN ACCESS EXCLUSIVE MODE;
DO $projection$
DECLARE v_enabled "char";
BEGIN
 SELECT tgenabled INTO STRICT v_enabled FROM pg_trigger
 WHERE tgrelid='public.user_power_rankings'::regclass AND tgname='m9x_power_leader_activity_trigger' AND NOT tgisinternal;
 IF (SELECT md5(pg_get_functiondef(tgfoid)) FROM pg_trigger
     WHERE tgrelid='public.user_power_rankings'::regclass AND tgname='m9x_power_leader_activity_trigger')
   <> 'baf68eaa73ad7efbdd4b31ece593919e' THEN
   RAISE EXCEPTION 'POWER_ACTIVITY_TRIGGER_SOURCE_DRIFT';
 END IF;
 ALTER TABLE public.user_power_rankings DISABLE TRIGGER m9x_power_leader_activity_trigger;
 INSERT INTO public.user_power_rankings(user_id,total_power,updated_at)
 SELECT u.id,least(public.calculate_user_total_power(u.id),2147483647)::integer,clock_timestamp()
 FROM public.users u
 ON CONFLICT(user_id) DO UPDATE SET total_power=excluded.total_power,updated_at=excluded.updated_at
 WHERE user_power_rankings.total_power IS DISTINCT FROM excluded.total_power;
 CASE v_enabled
 WHEN 'O' THEN ALTER TABLE public.user_power_rankings ENABLE TRIGGER m9x_power_leader_activity_trigger;
 WHEN 'A' THEN ALTER TABLE public.user_power_rankings ENABLE ALWAYS TRIGGER m9x_power_leader_activity_trigger;
 WHEN 'R' THEN ALTER TABLE public.user_power_rankings ENABLE REPLICA TRIGGER m9x_power_leader_activity_trigger;
 WHEN 'D' THEN ALTER TABLE public.user_power_rankings DISABLE TRIGGER m9x_power_leader_activity_trigger;
 ELSE RAISE EXCEPTION 'UNKNOWN_POWER_ACTIVITY_TRIGGER_MODE';
 END CASE;
END $projection$;

NOTIFY pgrst,'reload schema';

-- SECTION 19 supabase/migrations/20260914160000_gameplay_battle_activity_direct_rewards.sql

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.on_canonical_daily_activity_finalized()'::regprocedure))<>'6501601c1a9261adafe222c4c56b46b5'
 OR md5(pg_get_functiondef('public.finalize_pvp_battle(uuid,jsonb)'::regprocedure))<>'aa6c814928008083bc9b37feb2e9de89' THEN
 RAISE EXCEPTION 'BUG-07 battle reward definition drift'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.on_canonical_daily_activity_finalized()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  v_key:='PVP_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"CHAR_EXP_S","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
  if found then perform public.grant_present_payload(new.requester_user_id,'CHAR_EXP_S',1); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='PVP' and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'PVP_DAILY_3',new.id,'[{"itemId":"SKILL_MANUAL","quantity":1,"delivery":"INVENTORY"},{"itemId":"CASH","quantity":40,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'SKILL_MANUAL',1); perform public.grant_present_payload(new.requester_user_id,'CASH',40); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
  if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_EXP_S',1); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1,"delivery":"INVENTORY"},{"itemId":"CASH","quantity":40,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'CHAR_EXP_M',1); perform public.grant_present_payload(new.requester_user_id,'CASH',40); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_LB_PART',1); end if;
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.finalize_pvp_battle(p_replay_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_replay public.battle_replay_sessions%rowtype; v_win boolean; v_player integer; v_opponent integer; v_delta integer; v_new integer; v_final jsonb; v_name text;
begin
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id for update;
 if not found then raise exception 'PvP replay not found' using errcode='P0002'; end if;
 if v_replay.battle_mode<>'PVP' or v_replay.resolution_authority<>'PVP_SERVER' then raise exception 'replay is not official PvP' using errcode='42501'; end if;
 if v_replay.finalization_status='FINALIZED' then return v_replay.finalization_result; end if;
 if v_replay.status<>'PENDING' or v_replay.finalization_status<>'PENDING' then raise exception 'PvP replay is not finalizable' using errcode='23514'; end if;
 perform public.advance_ranking_season('PVP',clock_timestamp());
 perform public.validate_official_battle_result(p_result); v_win:=p_result->>'winner'='PLAYER';
 v_player:=coalesce((v_replay.official_context->>'playerRankPointsAtStart')::integer,1000); v_opponent:=coalesce((v_replay.official_context->>'opponentRankPointsAtStart')::integer,1000); v_delta:=public.canonical_pvp_rating_delta(v_player,v_opponent,case when v_win then 'WIN' else 'LOSS' end);
 insert into public.pvp_ranks(user_id,rank_points,daily_wins,season_wins,updated_at) values(v_replay.requester_user_id,greatest(1000+v_delta,0),case when v_win then 1 else 0 end,case when v_win then 1 else 0 end,now()) on conflict(user_id) do update set rank_points=greatest(public.pvp_ranks.rank_points+v_delta,0),daily_wins=public.pvp_ranks.daily_wins+case when v_win then 1 else 0 end,season_wins=public.pvp_ranks.season_wins+case when v_win then 1 else 0 end,updated_at=now() returning rank_points into v_new;
 select username into v_name from public.users where id=v_replay.requester_user_id; insert into public.pvp_defense_logs(user_id,attacker_id,attacker_name,result,points_change) values(v_replay.source_reference_id,v_replay.requester_user_id,v_name,case when v_win then 'DEFEAT' else 'VICTORY' end,-v_delta);
 v_final:=p_result||jsonb_build_object('mode','PVP','oldRating',v_player,'opponentRating',v_opponent,'rankDelta',v_delta,'newRankPoints',v_new,'remainingPvpPoints',coalesce((v_replay.official_context->>'remainingPvpPoints')::integer,0),'rewards',jsonb_build_object('cash',0,'diamonds',0,'xp',0));
 insert into public.battle_replay_events(battle_replay_session_id,event_index,round_number,event_type,payload) select p_replay_id,greatest(coalesce((e.value->>'index')::integer,e.ordinality::integer-1),0),greatest(coalesce((e.value->>'round')::integer,1),1),coalesce(nullif(e.value->>'type',''),'UNKNOWN'),coalesce(e.value->'payload','{}'::jsonb) from jsonb_array_elements(p_result->'events') with ordinality e(value,ordinality) on conflict do nothing;
 update public.battle_replay_sessions set status='RESOLVED',result=v_final,resolved_at=now(),finalization_status='FINALIZED',finalized_at=now(),finalization_result=v_final where id=p_replay_id;
 -- The AFTER-finalize trigger has committed its claim rows and direct asset grants
 -- in this transaction. Project that exact receipt, never a client estimate.
 select v_final || jsonb_build_object(
   'reward_items',coalesce(jsonb_agg(item.value) filter (where item.value is not null),'[]'::jsonb),
   'reward_delivery','INVENTORY'
 ) into v_final
 from public.canonical_daily_activity_claims claim
 cross join lateral jsonb_array_elements(claim.reward_payload) item(value)
 where claim.user_id=v_replay.requester_user_id and claim.source_ref=p_replay_id
   and item.value->>'delivery'='INVENTORY';
 -- Do not update finalization_status again: keep all finalize triggers exactly once.
 update public.battle_replay_sessions set result=v_final,finalization_result=v_final where id=p_replay_id;
 perform public.evaluate_mission_progress(v_replay.requester_user_id,'PVP_BATTLE_COUNT',1); if v_win then perform public.evaluate_mission_progress(v_replay.requester_user_id,'PVP_WIN_COUNT',1); end if;
 return v_final;
end $function$;

-- SECTION 20 supabase/migrations/20260914143144_season_rewards_power_master_and_snapshot.sql

create table public.monthly_power_reward_master (
 reward_version text not null, ranking_type text not null check(ranking_type in ('POWER','GUILD_POWER')),
 rank_min integer not null, rank_max integer not null, honor_label text not null, items jsonb not null,
 primary key(reward_version,ranking_type,rank_min), check(rank_min>0 and rank_max>=rank_min), check(jsonb_typeof(items)='array')
);
create table public.monthly_power_season_runs (
 season_id uuid primary key references public.ranking_seasons(id), reward_version text not null default '20260914',
 eligibility_policy text check(eligibility_policy in ('CONTINUOUS_JST_DAY1')),
 snapshotted_at timestamptz, granted_at timestamptz
);
create table public.monthly_power_entity_snapshots (
 season_id uuid not null references public.monthly_power_season_runs(season_id), entity_id uuid not null,
 score bigint not null,rank_position integer not null,primary key(season_id,entity_id)
);
create table public.monthly_power_member_snapshots (
 season_id uuid not null references public.monthly_power_season_runs(season_id),guild_id uuid not null,user_id uuid not null,
 joined_at timestamptz, continuous_season_days integer, membership_history jsonb not null,
 primary key(season_id,guild_id,user_id)
);
-- Snapshot contains actual unresolved honor descriptions, not invented cosmetic IDs.
create table public.monthly_power_honor_requirements (
 season_id uuid not null references public.monthly_power_season_runs(season_id),entity_id uuid not null,
 rank_position integer not null,honor_label text not null,primary key(season_id,entity_id)
);
insert into public.monthly_power_reward_master values('20260914','POWER',1,1,'Season Champion称号＋専用Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 4}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 2}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 2}, {"item_id": "AWAKENING_BOOK", "quantity": 2}, {"item_id": "SKILL_MANUAL", "quantity": 4}, {"item_id": "EQUIP_LB_PART", "quantity": 4}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',2,3,'TOP3称号＋専用Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 2}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 2}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 2}, {"item_id": "AWAKENING_BOOK", "quantity": 2}, {"item_id": "SKILL_MANUAL", "quantity": 3}, {"item_id": "EQUIP_LB_PART", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',4,10,'TOP10称号＋Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 2}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "AWAKENING_BOOK", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 3}, {"item_id": "EQUIP_LB_PART", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',11,30,'TOP30 Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 2}, {"item_id": "EQUIP_LB_PART", "quantity": 2}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',31,100,'TOP100 Badge','[{"item_id": "NORMAL_GACHA_TICKET_CHARACTER", "quantity": 2}, {"item_id": "CHAR_EXP_L", "quantity": 3}, {"item_id": "EQUIP_EXP_L", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',1,1,'Champion限定Emblem＋Decoration＋Champion表示','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 2}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "AWAKENING_BOOK", "quantity": 2}, {"item_id": "SKILL_MANUAL", "quantity": 3}, {"item_id": "EQUIP_LB_PART", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',2,3,'TOP3限定Emblem＋Decoration','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "AWAKENING_BOOK", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 2}, {"item_id": "EQUIP_LB_PART", "quantity": 2}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',4,10,'TOP10 Decoration＋Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 2}, {"item_id": "EQUIP_LB_PART", "quantity": 2}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',11,20,'TOP20 Badge','[{"item_id": "NORMAL_GACHA_TICKET_CHARACTER", "quantity": 2}, {"item_id": "NORMAL_GACHA_TICKET_SKILL", "quantity": 1}, {"item_id": "NORMAL_GACHA_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "CHAR_EXP_L", "quantity": 2}, {"item_id": "EQUIP_EXP_L", "quantity": 2}]'::jsonb);

DO $$ begin
 if exists(select 1 from public.monthly_power_reward_master m cross join lateral jsonb_array_elements(m.items) i
 where not exists(select 1 from public.canonical_item_master c where c.item_id=i->>'item_id')) then
 raise exception 'Season reward item master missing';end if;
end $$;
create function public.monthly_power_continuous_jst_days(p_joined timestamptz,p_start timestamptz,p_end timestamptz)
returns integer language sql immutable set search_path='' as $$
 select case when p_joined is null then null when greatest(p_joined,p_start)>=p_end then 0
 else greatest(0,((p_end-interval '1 microsecond') at time zone 'Asia/Tokyo')::date
 -(greatest(p_joined,p_start) at time zone 'Asia/Tokyo')::date+1) end
$$;
create function public.monthly_power_live_rankings_v1(p_type text)
returns table(entity_id uuid,score bigint,rank_position integer)
language sql stable security definer set search_path='' as $$
 select r.user_id,r.total_power::bigint,dense_rank() over(order by r.total_power desc,r.updated_at asc)::integer
 from public.user_power_rankings r join public.users u on u.id=r.user_id where p_type='POWER'
 union all
 select g.guild_id,g.score,dense_rank() over(order by g.score desc,g.guild_id)::integer from (
 select m.guild_id,sum(p.total_power)::bigint score
 from public.guild_members m join public.guilds guild on guild.id=m.guild_id
 join public.users u on u.id=m.user_id join public.user_power_rankings p on p.user_id=m.user_id
 where p_type='GUILD_POWER' group by m.guild_id) g
$$;
create function public.reject_monthly_power_snapshot_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'INSERT' or exists(select 1 from public.monthly_power_season_runs r where r.season_id=new.season_id and r.snapshotted_at is not null) then
 raise exception 'Monthly Season snapshot is immutable' using errcode='55000';end if;
 return new;
end $$;
create function public.snapshot_monthly_power_season_v1(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;
begin
 select * into strict s from public.ranking_seasons where id=p_season_id for update;
 select * into strict r from public.monthly_power_season_runs where season_id=s.id for update;
 if s.ranking_type not in ('POWER','GUILD_POWER') then raise exception 'Unsupported monthly ranking category';end if;
 if r.snapshotted_at is not null then return jsonb_build_object('status','SNAPSHOT_READY','season_id',s.id);end if;
 if s.status not in ('ACTIVE','FINALIZING') or clock_timestamp()<s.ends_at then raise exception 'Season not ready to snapshot';end if;
 perform pg_advisory_xact_lock(hashtextextended('monthly-power:'||s.id,0));
 insert into public.monthly_power_entity_snapshots select s.id,l.* from public.monthly_power_live_rankings_v1(s.ranking_type) l;
 if s.ranking_type='GUILD_POWER' then
 insert into public.monthly_power_member_snapshots
 select s.id,m.guild_id,m.user_id,m.joined_at,public.monthly_power_continuous_jst_days(m.joined_at,s.starts_at,s.ends_at),
 coalesce((select jsonb_agg(jsonb_build_object('joined_at',p.joined_at,'left_at',p.left_at,'source_membership_id',p.source_membership_id) order by p.joined_at)
 from public.kpi_guild_membership_periods p join public.kpi_subjects k on k.subject_id=p.subject_id
 where k.source_user_id=m.user_id and p.guild_id=m.guild_id and p.joined_at<s.ends_at and coalesce(p.left_at,s.ends_at)>s.starts_at),'[]'::jsonb)
 from public.guild_members m join public.monthly_power_entity_snapshots e on e.season_id=s.id and e.entity_id=m.guild_id;
 end if;
 insert into public.monthly_power_honor_requirements
 select s.id,e.entity_id,e.rank_position,m.honor_label from public.monthly_power_entity_snapshots e
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 where e.season_id=s.id;
 update public.monthly_power_season_runs set snapshotted_at=clock_timestamp() where season_id=s.id;
 return jsonb_build_object('status','SNAPSHOT_READY','season_id',s.id);
end $$;
create function public.guard_monthly_power_season_cutoff()
returns trigger language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in select season.* from public.ranking_seasons season join public.monthly_power_season_runs r on r.season_id=season.id
 where r.snapshotted_at is null and season.status='ACTIVE' and season.starts_at<=clock_timestamp() order by season.id
 loop
 if clock_timestamp()>=s.ends_at then perform public.snapshot_monthly_power_season_v1(s.id);
 else
 perform 1 from public.ranking_seasons where id=s.id for share;
 perform pg_advisory_xact_lock_shared(hashtextextended('monthly-power:'||s.id,0));
 end if;
 end loop;
 return null;
end $$;
-- Internal item tranche is independently testable. Do not expose to service/client while honor/policy remain undecided.
create function public.grant_monthly_power_items_v1(p_season_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;x record;i jsonb;n integer:=0;
begin
 select * into strict s from public.ranking_seasons where id=p_season_id for update;
 select * into strict r from public.monthly_power_season_runs where season_id=s.id for update;
 if r.snapshotted_at is null then raise exception 'Immutable snapshot required';end if;
 if s.ranking_type='GUILD_POWER' and r.eligibility_policy is distinct from 'CONTINUOUS_JST_DAY1' then raise exception 'Guild membership policy not approved';end if;
 for x in
 select e.entity_id,e.entity_id user_id,e.rank_position,m.items from public.monthly_power_entity_snapshots e
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 where e.season_id=s.id and s.ranking_type='POWER'
 union all
 select e.entity_id,ms.user_id,e.rank_position,m.items from public.monthly_power_entity_snapshots e
 join public.monthly_power_member_snapshots ms on ms.season_id=e.season_id and ms.guild_id=e.entity_id
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 where e.season_id=s.id and s.ranking_type='GUILD_POWER' and ms.continuous_season_days>=7
 loop
 for i in select value from jsonb_array_elements(x.items) loop
 insert into public.ranking_season_reward_grants(season_id,ranking_category,recipient_user_id,ranked_entity_id,rank_position,reward_key,master_reward_id,resolved_item_id,quantity)
 values(s.id,s.ranking_type,x.user_id,x.entity_id,x.rank_position,i->>'item_id','MONTHLY_POWER:'||r.reward_version||':'||(i->>'item_id'),i->>'item_id',(i->>'quantity')::integer)
 on conflict do nothing;
 if found then perform public.grant_present_payload(x.user_id,i->>'item_id',(i->>'quantity')::integer);n:=n+1;end if;
 end loop;
 insert into public.ranking_reward_notifications(recipient_user_id,period_kind,period_key) values(x.user_id,'SEASON',s.id::text) on conflict do nothing;
 end loop;
 return n;
end $$;
-- Complete reward release is deliberately not faked with missing cosmetic IDs.
create function public.finalize_monthly_power_season_rewards_v1(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.snapshot_monthly_power_season_v1(p_season_id);
 return jsonb_build_object('season_id',p_season_id,'status','SNAPSHOT_READY_REWARD_BINDINGS_REQUIRED',
 'items_granted',false,'cosmetics_status','UNRESOLVED_MASTER_BINDINGS');
end $$;
create function public.get_monthly_power_season_rewards_v1(p_ranking_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;uid uuid:=auth.uid();gid uuid;joined timestamptz;rank_value integer;day_count integer;tiers jsonb;items jsonb;policy_status text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_ranking_type not in ('POWER','GUILD_POWER') then raise exception 'Invalid ranking type';end if;
 select season.* into s from public.ranking_seasons season join public.monthly_power_season_runs run on run.season_id=season.id
 where season.ranking_type=p_ranking_type order by season.starts_at desc limit 1;
 select * into r from public.monthly_power_season_runs where season_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('rank_min',rank_min,'rank_max',rank_max,'honor_label',honor_label,'items',m.items) order by rank_min),'[]'::jsonb)
 into tiers from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type;
 if p_ranking_type='GUILD_POWER' then
 if r.snapshotted_at is not null then
 select guild_id,joined_at,continuous_season_days into gid,joined,day_count from public.monthly_power_member_snapshots where season_id=s.id and user_id=uid;
 else select guild_id,joined_at into gid,joined from public.guild_members where user_id=uid;
 day_count:=public.monthly_power_continuous_jst_days(joined,s.starts_at,least(clock_timestamp()+interval '1 microsecond',s.ends_at));end if;
 end if;
 if s.id is not null then
 if r.snapshotted_at is not null then select rank_position into rank_value from public.monthly_power_entity_snapshots where season_id=s.id and entity_id=case when p_ranking_type='POWER' then uid else gid end;
 elsif clock_timestamp()>=s.starts_at and clock_timestamp()<s.ends_at then
 select rank_position into rank_value from public.monthly_power_live_rankings_v1(p_ranking_type) where entity_id=case when p_ranking_type='POWER' then uid else gid end;end if;
 end if;
 select m.items into items from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type and rank_value between rank_min and rank_max;
 policy_status:=case when p_ranking_type='POWER' then 'NOT_APPLICABLE' when gid is null then 'NOT_MEMBER' when r.eligibility_policy is null then 'MEMBERSHIP_POLICY_PENDING' else 'CONTINUOUS_JST_DAY1' end;
 return jsonb_build_object('season',case when s.id is null then null else to_jsonb(s) end,'tiers',tiers,'current_rank',rank_value,'planned_items',coalesce(items,'[]'::jsonb),
 'eligibility',jsonb_build_object('joined_at',joined,'season_days',day_count,'eligible',case when p_ranking_type='POWER' then true when r.eligibility_policy is null then null else coalesce(day_count>=7,false) end,'status',policy_status),
 'cosmetics_status','UNRESOLVED_MASTER_BINDINGS','finalized',r.snapshotted_at is not null);
end $$;
-- Existing receipt parser/acknowledgement already reads this ledger and explicit ITEM kind.
DO $$begin
 if (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ranking_season_reward_grants'::regclass and conname='ranking_season_reward_grants_ranking_category_check') is distinct from
 $expected$CHECK ((ranking_category = ANY (ARRAY['PVP'::text, 'RAID_PERSONAL'::text, 'RAID_GUILD'::text])))$expected$ then
 raise exception 'Season ledger category constraint drift';end if;
end $$;
alter table public.ranking_season_reward_grants drop constraint ranking_season_reward_grants_ranking_category_check;
alter table public.ranking_season_reward_grants add constraint ranking_season_reward_grants_category_check check(ranking_category in ('PVP','RAID_PERSONAL','RAID_GUILD','POWER','GUILD_POWER'));
DO $$declare t text;begin
 foreach t in array array['monthly_power_reward_master','monthly_power_season_runs','monthly_power_entity_snapshots','monthly_power_member_snapshots','monthly_power_honor_requirements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['monthly_power_entity_snapshots','monthly_power_member_snapshots','monthly_power_honor_requirements'] loop
 execute format('create trigger monthly_power_snapshot_immutable before insert or update or delete on public.%I for each row execute function public.reject_monthly_power_snapshot_mutation()',t);
 end loop;
 foreach t in array array['users','guild_members','guilds','ranking_guild_exclusions','user_main_formations','user_characters','user_equipments','user_skills','user_power_rankings','character_growth_patterns','character_awakening_master','character_battle_master','equipment_battle_master','canonical_character_master','canonical_equipment_master','canonical_character_growth_assignments','canonical_character_growth_exponents'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create trigger monthly_power_cutoff_guard before insert or update or delete on public.%I for each statement execute function public.guard_monthly_power_season_cutoff()',t);
 end if;
 end loop;
end $$;
revoke all on function public.monthly_power_continuous_jst_days(timestamptz,timestamptz,timestamptz),public.monthly_power_live_rankings_v1(text),public.reject_monthly_power_snapshot_mutation(),public.snapshot_monthly_power_season_v1(uuid),public.guard_monthly_power_season_cutoff(),public.grant_monthly_power_items_v1(uuid),public.finalize_monthly_power_season_rewards_v1(uuid),public.get_monthly_power_season_rewards_v1(text) from public,anon,authenticated;
revoke all on function public.grant_monthly_power_items_v1(uuid) from service_role;
-- Item tranche deliberately remains owner-only while complete reward binding is unresolved.
grant execute on function public.snapshot_monthly_power_season_v1(uuid),public.finalize_monthly_power_season_rewards_v1(uuid) to service_role;
grant execute on function public.get_monthly_power_season_rewards_v1(text) to authenticated;
notify pgrst,'reload schema';

-- SECTION 20b definition only formal_open_simultaneous_season_start
-- 未適用候補を改訂：正式OPENと3カテゴリ同時開始。旧9/16予約仕様は廃止。
-- 関数定義のみ。Migrationでは日付予約・終了処理・開始・cron変更を行わない。
DO $guard$
begin
 if md5(replace(pg_get_functiondef('public.advance_ranking_season(text,timestamptz)'::regprocedure),chr(13),'')) <> '958bee68162dca7b1449dad53ea2fe2f' then
   raise exception 'advance_ranking_season live definition drift';
 end if;
 if has_function_privilege('anon','public.advance_ranking_season(text,timestamptz)','EXECUTE')
   or has_function_privilege('authenticated','public.advance_ranking_season(text,timestamptz)','EXECUTE')
   or not has_function_privilege('service_role','public.advance_ranking_season(text,timestamptz)','EXECUTE') then
   raise exception 'advance_ranking_season privilege drift';
 end if;
end $guard$;

create function public.start_formal_open_seasons_v1(p_open_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_end timestamptz := '2026-09-30 15:00:00+00';
 v_old public.ranking_seasons%rowtype;
 v_ids jsonb; v_count integer;
begin
 if p_open_at is null or p_open_at<'2026-09-14 15:00:00+00'::timestamptz
   or p_open_at>=v_end or p_open_at>clock_timestamp() or clock_timestamp()>=v_end then
   raise exception 'Confirmed Formal Open timestamp required';
 end if;
 -- 実行はメンテナンスで操作停止を確認後。全カテゴリの行競合を同じTXで排除。
 perform pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0));
 lock table public.ranking_seasons in share row exclusive mode;
 select count(*),jsonb_object_agg(ranking_type,id) into v_count,v_ids
 from public.ranking_seasons where ranking_type in ('PVP','POWER','GUILD_POWER')
   and starts_at=p_open_at and ends_at=v_end and status='ACTIVE';
 if v_count=3 then
   if (select count(*) from public.ranking_seasons where ranking_type in ('PVP','POWER','GUILD_POWER') and status<>'CLOSED')<>3 then
     raise exception 'Unexpected concurrent season state';
   end if;
   if (select count(*) from public.monthly_power_season_runs where season_id in
       ((v_ids->>'POWER')::uuid,(v_ids->>'GUILD_POWER')::uuid))<>2 then
     raise exception 'Formal Open reward registration drift';
   end if;
   return jsonb_build_object('status','ALREADY_STARTED','season_ids',v_ids,'starts_at',p_open_at,'ends_at',v_end);
 end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in ('PVP','POWER','GUILD_POWER')
   and starts_at=p_open_at) then raise exception 'Partial or conflicting Formal Open season requires review';end if;
 -- 旧POWERへの報酬転用・PREOPEN限定Emblemの黙示省略は禁止。
 if exists(select 1 from public.ranking_seasons where ranking_type in ('POWER','GUILD_POWER')
   and status<>'CLOSED') then raise exception 'Prior POWER/GUILD_POWER season disposition required';end if;
 if not exists(select 1 from public.ranking_guild_power_season_master m
   join public.ranking_seasons s on s.id=m.season_id
   join public.ranking_guild_power_finalization_audits a on a.season_id=s.id
   where m.event_key='PREOPEN_GUILD_POWER_2026' and s.status='CLOSED' and s.ends_at<=p_open_at) then
   raise exception 'Preopen Guild Power finalization audit required';
 end if;
 if (select count(*) from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE')<>1
   or exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status in ('PREPARING','FINALIZING')) then
   raise exception 'Unresolved PVP season state requires review';
 end if;
 select * into strict v_old from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' for update;
 if v_old.starts_at>=p_open_at or v_old.ends_at<p_open_at then
   raise exception 'PVP boundary does not cover Formal Open';
 end if;
 update public.ranking_seasons set ends_at=p_open_at,status='FINALIZING',updated_at=clock_timestamp() where id=v_old.id;
 perform public.assert_pvp_boundary_replay_continuity(v_old.id,clock_timestamp());
 perform public.finalize_pvp_season_rewards(v_old.id);
 perform public.reconcile_pvp_after_season_boundary(v_old.id,clock_timestamp());
 update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp() where id=v_old.id;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 select t,p_open_at,v_end,'ACTIVE' from unnest(array['PVP','POWER','GUILD_POWER']) t;
 insert into public.monthly_power_season_runs(season_id)
 select id from public.ranking_seasons where starts_at=p_open_at and ranking_type in ('POWER','GUILD_POWER');
 select jsonb_object_agg(ranking_type,id) into v_ids from public.ranking_seasons
 where starts_at=p_open_at and ranking_type in ('PVP','POWER','GUILD_POWER');
 return jsonb_build_object('status','STARTED','season_ids',v_ids,'old_pvp_season_id',v_old.id,'starts_at',p_open_at,'ends_at',v_end);
end $$;
revoke all on function public.start_formal_open_seasons_v1(timestamptz) from public,anon,authenticated;
grant execute on function public.start_formal_open_seasons_v1(timestamptz) to service_role;
notify pgrst,'reload schema';

-- SECTION 21 supabase/migrations/20260914154152_approved_city_and_preopen_emblems.sql

set local lock_timeout='3s';
do $guard$
begin
 if exists(select 1 from public.cosmetic_master where id='guild_preopen_2026_rank_1' and slot<>'GUILD_EMBLEM') and (
   exists(select 1 from public.guild_cosmetics where cosmetic_id='guild_preopen_2026_rank_1') or
   exists(select 1 from public.guild_equipped_cosmetics where cosmetic_id='guild_preopen_2026_rank_1')) then
   raise exception 'PREOPEN_PLACEHOLDER_ALREADY_ISSUED';
 end if;
 if exists(select 1 from public.cosmetic_master where id='guild_preopen_2026_rank_1'
   and (owner_scope<>'GUILD' or source_reference is distinct from 'PREOPEN_GUILD_POWER_2026'
    or slot not in ('GUILD_DECORATION','GUILD_EMBLEM'))) then
   raise exception 'PREOPEN_PLACEHOLDER_AUTHORITY_DRIFT';
 end if;
end $guard$;
insert into public.cosmetic_master(id,owner_scope,slot,display_name,asset_key,source_type,metadata)
select id,'GUILD','GUILD_EMBLEM',city||'の紋章','/guild-emblems/'||id||'.png','SYSTEM',
 jsonb_build_object('standard',true,'default',false,'sort_order',sort_order,'city',city,'asset_status','APPROVED')
from (values
 ('guild_standard_01_shinjuku','新宿',9),('guild_standard_02_shibuya','渋谷',10),
 ('guild_standard_03_ikebukuro','池袋',11),('guild_standard_04_roppongi','六本木',12),
 ('guild_standard_05_akihabara','秋葉原',13),('guild_standard_06_kawasaki','川崎',14),
 ('guild_standard_07_yokohama','横浜',15)
) cities(id,city,sort_order)
on conflict(id) do nothing;
do $city_guard$
begin
 if (select count(*) from public.cosmetic_master where id in (
 'guild_standard_01_shinjuku','guild_standard_02_shibuya','guild_standard_03_ikebukuro',
 'guild_standard_04_roppongi','guild_standard_05_akihabara','guild_standard_06_kawasaki','guild_standard_07_yokohama')
 and owner_scope='GUILD' and slot='GUILD_EMBLEM' and active
 and asset_key='/guild-emblems/'||id||'.png' and metadata @> '{"standard":true}')<>7 then
  raise exception 'CITY_EMBLEM_ID_AUTHORITY_DRIFT';
 end if;
end $city_guard$;
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,asset_key,source_type,source_reference,metadata)
values('guild_preopen_2026_rank_1','GUILD','GUILD_EMBLEM','EVENT',
 'プレオープン第1位限定ギルド紋章','/guild-emblems/guild_event_rank1_base.png','RANKING','PREOPEN_GUILD_POWER_2026',
 '{"standard":false,"effect":"NONE","competitive_advantage":false,"asset_status":"APPROVED"}')
on conflict(id) do update set slot=excluded.slot,display_name=excluded.display_name,asset_key=excluded.asset_key,
 metadata=public.cosmetic_master.metadata||excluded.metadata;
notify pgrst,'reload schema';

-- SECTION 22 supabase/migrations/20260914154052_monthly_power_approved_honors.sql

-- User approved new honor IDs and continuous membership only. No live Season activation or grant.
alter table public.monthly_power_season_runs alter column eligibility_policy set default 'CONTINUOUS_JST_DAY1';
update public.monthly_power_season_runs set eligibility_policy='CONTINUOUS_JST_DAY1' where eligibility_policy is null and granted_at is null;
create table public.monthly_power_honor_bindings (
 reward_version text not null,ranking_type text not null,rank_min integer not null,cosmetic_id text not null references public.cosmetic_master(id),
 primary key(reward_version,ranking_type,rank_min,cosmetic_id),
 foreign key(reward_version,ranking_type,rank_min) references public.monthly_power_reward_master(reward_version,ranking_type,rank_min));
create table public.monthly_power_honor_grants (
 season_id uuid not null references public.monthly_power_season_runs(season_id),entity_id uuid not null,
 cosmetic_id text not null references public.cosmetic_master(id),rank_position integer not null,
 granted_at timestamptz not null default clock_timestamp(),primary key(season_id,entity_id,cosmetic_id));
create table public.monthly_power_honor_recipients (
 season_id uuid not null,entity_id uuid not null,cosmetic_id text not null,recipient_user_id uuid not null references public.users(id),
 primary key(season_id,entity_id,cosmetic_id,recipient_user_id),
 foreign key(season_id,entity_id,cosmetic_id) references public.monthly_power_honor_grants(season_id,entity_id,cosmetic_id));
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_champion_profile_title_20260914','USER','PROFILE_TITLE','EPIC','個人総合力 Season Champion 称号','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',1,'season_power_champion_profile_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_champion_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 Season Champion Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',1,'season_power_champion_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top3_profile_title_20260914','USER','PROFILE_TITLE','EPIC','個人総合力 TOP3 称号','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',2,'season_power_top3_profile_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top3_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP3 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',2,'season_power_top3_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top10_profile_title_20260914','USER','PROFILE_TITLE','EPIC','個人総合力 TOP10 称号','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',4,'season_power_top10_profile_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top10_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP10 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',4,'season_power_top10_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top30_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP30 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top30", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',11,'season_power_top30_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top100_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP100 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top100", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',31,'season_power_top100_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_champion_guild_emblem_20260914','GUILD','GUILD_EMBLEM','EPIC','Guild総合力 Season Champion Emblem','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',1,'season_guild_power_champion_guild_emblem_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_champion_guild_base_background_20260914','GUILD','GUILD_BASE_BACKGROUND','EPIC','Guild総合力 Season Champion Decoration','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',1,'season_guild_power_champion_guild_base_background_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_champion_guild_title_20260914','GUILD','GUILD_TITLE','EPIC','Guild総合力 Season Champion','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',1,'season_guild_power_champion_guild_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top3_guild_emblem_20260914','GUILD','GUILD_EMBLEM','EPIC','Guild総合力 TOP3 Emblem','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',2,'season_guild_power_top3_guild_emblem_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top3_guild_base_background_20260914','GUILD','GUILD_BASE_BACKGROUND','EPIC','Guild総合力 TOP3 Decoration','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',2,'season_guild_power_top3_guild_base_background_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top10_guild_base_background_20260914','GUILD','GUILD_BASE_BACKGROUND','EPIC','Guild総合力 TOP10 Decoration','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',4,'season_guild_power_top10_guild_base_background_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top10_guild_badge_20260914','GUILD','GUILD_BADGE','EPIC','Guild総合力 TOP10 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',4,'season_guild_power_top10_guild_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top20_guild_badge_20260914','GUILD','GUILD_BADGE','EPIC','Guild総合力 TOP20 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top20", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',11,'season_guild_power_top20_guild_badge_20260914');

update public.cosmetic_master set asset_key='/guild-emblems/guild_event_rank1_base.png',preview_key='/guild-emblems/guild_event_rank1_base.png' where source_reference='MONTHLY_POWER:20260914' and slot='GUILD_EMBLEM';
update public.cosmetic_master set asset_key='/guild-emblems/guild_standard_01.svg',preview_key='/guild-emblems/guild_standard_01.svg' where id='season_guild_power_top3_guild_emblem_20260914';
insert into public.title_master(id,name,source_type,source_key) select id,display_name,'EVENT','MONTHLY_POWER:20260914' from public.cosmetic_master where id like 'season_power_%' and slot='PROFILE_TITLE';
create or replace function public.finalize_monthly_power_season_rewards_v1(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;x record;u record;ni integer;nh integer:=0;
begin
 select * into strict s from public.ranking_seasons where id=p_season_id for update;
 select * into strict r from public.monthly_power_season_runs where season_id=s.id for update;
 if r.granted_at is not null then return jsonb_build_object('season_id',s.id,'status','CLOSED','items_granted',0,'honors_granted',0,'retry',true);end if;
 if exists(select 1 from public.monthly_power_reward_master m where m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and not exists(
 select 1 from public.monthly_power_honor_bindings b join public.cosmetic_master c on c.id=b.cosmetic_id and c.active where b.reward_version=m.reward_version and b.ranking_type=m.ranking_type and b.rank_min=m.rank_min)) then raise exception 'Season honor binding missing';end if;
 if r.reward_version<>'20260914' or exists(
 select 1 from (values ('POWER',1,'season_power_champion_profile_title_20260914'),('POWER',1,'season_power_champion_profile_badge_20260914'),('POWER',2,'season_power_top3_profile_title_20260914'),('POWER',2,'season_power_top3_profile_badge_20260914'),('POWER',4,'season_power_top10_profile_title_20260914'),('POWER',4,'season_power_top10_profile_badge_20260914'),('POWER',11,'season_power_top30_profile_badge_20260914'),('POWER',31,'season_power_top100_profile_badge_20260914'),('GUILD_POWER',1,'season_guild_power_champion_guild_emblem_20260914'),('GUILD_POWER',1,'season_guild_power_champion_guild_base_background_20260914'),('GUILD_POWER',1,'season_guild_power_champion_guild_title_20260914'),('GUILD_POWER',2,'season_guild_power_top3_guild_emblem_20260914'),('GUILD_POWER',2,'season_guild_power_top3_guild_base_background_20260914'),('GUILD_POWER',4,'season_guild_power_top10_guild_base_background_20260914'),('GUILD_POWER',4,'season_guild_power_top10_guild_badge_20260914'),('GUILD_POWER',11,'season_guild_power_top20_guild_badge_20260914')) expected(category,rank_min,id)
 full join (select b.ranking_type,b.rank_min,b.cosmetic_id from public.monthly_power_honor_bindings b join public.cosmetic_master c on c.id=b.cosmetic_id and c.active where b.reward_version=r.reward_version) actual
 on actual.ranking_type=expected.category and actual.rank_min=expected.rank_min and actual.cosmetic_id=expected.id
 where (coalesce(expected.category,actual.ranking_type)=s.ranking_type) and (expected.id is null or actual.cosmetic_id is null)) then raise exception 'Season honor exact binding mismatch';end if;
 perform public.snapshot_monthly_power_season_v1(s.id);
 ni:=public.grant_monthly_power_items_v1(s.id);
 for x in select e.entity_id,e.rank_position,b.cosmetic_id,c.owner_scope from public.monthly_power_entity_snapshots e
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 join public.monthly_power_honor_bindings b on b.reward_version=m.reward_version and b.ranking_type=m.ranking_type and b.rank_min=m.rank_min
 join public.cosmetic_master c on c.id=b.cosmetic_id and c.active where e.season_id=s.id
 loop
 insert into public.monthly_power_honor_grants(season_id,entity_id,cosmetic_id,rank_position) values(s.id,x.entity_id,x.cosmetic_id,x.rank_position) on conflict do nothing;
 if found then
 if x.owner_scope='USER' and s.ranking_type='POWER' then
 insert into public.user_cosmetics(user_id,cosmetic_id,source_type,source_reference) values(x.entity_id,x.cosmetic_id,'SEASON',s.id::text) on conflict do nothing;
 elsif x.owner_scope='GUILD' and s.ranking_type='GUILD_POWER' then
 insert into public.guild_cosmetics(guild_id,cosmetic_id,source_type,source_reference) values(x.entity_id,x.cosmetic_id,'SEASON',s.id::text) on conflict do nothing;
 else raise exception 'Season honor scope mismatch';end if;
 if exists(select 1 from public.title_master where id=x.cosmetic_id) then insert into public.user_titles(user_id,title_id) values(x.entity_id,x.cosmetic_id) on conflict do nothing;end if;
 nh:=nh+1;
 end if;
 -- Guild honors belong to the Guild; all end-members see the receipt, independent of seven-day ITEM eligibility.
 for u in select x.entity_id user_id where s.ranking_type='POWER' union all
 select ms.user_id from public.monthly_power_member_snapshots ms where ms.season_id=s.id and ms.guild_id=x.entity_id and s.ranking_type='GUILD_POWER'
 loop
 insert into public.monthly_power_honor_recipients values(s.id,x.entity_id,x.cosmetic_id,u.user_id) on conflict do nothing;
 if found then insert into public.ranking_reward_notifications(recipient_user_id,period_kind,period_key) values(u.user_id,'SEASON',s.id::text)
 on conflict(recipient_user_id,period_kind,period_key) do update set acknowledged_at=null,awarded_at=clock_timestamp();end if;
 end loop;
 end loop;
 update public.monthly_power_season_runs set granted_at=clock_timestamp() where season_id=s.id;
 update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp() where id=s.id;
 return jsonb_build_object('season_id',s.id,'status','CLOSED','items_granted',ni,'honors_granted',nh,'retry',false);
end $$;
-- Definition-only runner: no cron schedule, no Season creation or activation.
create function public.finalize_due_monthly_power_seasons_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record;results jsonb:='[]';begin
 for s in select season.id from public.ranking_seasons season join public.monthly_power_season_runs r on r.season_id=season.id
 where season.status in ('ACTIVE','FINALIZING') and season.ends_at<=clock_timestamp() and r.granted_at is null order by season.ends_at,season.id
 loop results:=results||jsonb_build_array(public.finalize_monthly_power_season_rewards_v1(s.id));end loop;return results;end $$;
DO $$begin if md5(pg_get_functiondef('public.get_my_pending_ranking_reward_notification()'::regprocedure))<>'ab1deffe5443077a151eea404d616a1b' then raise exception 'Notification authority drift';end if;end $$;
create or replace function public.get_my_pending_ranking_reward_notification()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_notification_ids jsonb; v_grants jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_agg(notification.id order by notification.awarded_at,notification.id)
  into v_notification_ids from public.ranking_reward_notifications notification
  where notification.recipient_user_id=v_uid and notification.acknowledged_at is null;
  if v_notification_ids is null then return null; end if;
  with grant_rows as (
    select notification.awarded_at notification_at,notification.period_kind,notification.period_key,
      season.ranking_category,season.rank_position,season.resolved_item_id item_id,
      season.quantity,season.granted_at,season.reward_key ordering_key,
      'ITEM'::text reward_kind,null::text display_name
    from public.ranking_reward_notifications notification
    join public.ranking_season_reward_grants season
      on notification.period_kind='SEASON' and season.season_id::text=notification.period_key
      and season.recipient_user_id=notification.recipient_user_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      award.ranking_type,award.rank_position,item.item_id,item.quantity,item.granted_at,item.item_id,
      'ITEM'::text,null::text
    from public.ranking_reward_notifications notification
    join public.ranking_daily_reward_awards award
      on notification.period_kind='DAILY' and award.ranking_day_key::text=notification.period_key
      and award.recipient_user_id=notification.recipient_user_id
    join public.ranking_daily_reward_item_grants item on item.award_id=award.id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      'GUILD_POWER',grant_row.rank_position,grant_row.cosmetic_id,1,
      grant_row.granted_at,grant_row.cosmetic_id,'GUILD_COSMETIC',cosmetic.display_name
    from public.ranking_reward_notifications notification
    join public.ranking_guild_power_reward_recipients recipient
      on notification.period_kind='SEASON' and recipient.season_id::text=notification.period_key
      and recipient.recipient_user_id=notification.recipient_user_id
    join public.ranking_guild_power_reward_grants grant_row
      on grant_row.season_id=recipient.season_id and grant_row.guild_id=recipient.guild_id
    join public.cosmetic_master cosmetic on cosmetic.id=grant_row.cosmetic_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select n.awarded_at,n.period_kind,n.period_key,s.ranking_type,g.rank_position,g.cosmetic_id,1,g.granted_at,g.cosmetic_id,'COSMETIC',c.display_name
    from public.ranking_reward_notifications n
    join public.monthly_power_honor_recipients rr on rr.recipient_user_id=n.recipient_user_id and n.period_kind='SEASON' and rr.season_id::text=n.period_key
    join public.monthly_power_honor_grants g on g.season_id=rr.season_id and g.entity_id=rr.entity_id and g.cosmetic_id=rr.cosmetic_id
    join public.ranking_seasons s on s.id=g.season_id join public.cosmetic_master c on c.id=g.cosmetic_id
    where n.recipient_user_id=v_uid and n.acknowledged_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_kind',grant_row.period_kind,'period_key',grant_row.period_key,
    'ranking_category',grant_row.ranking_category,'rank_position',grant_row.rank_position,
    'item_id',grant_row.item_id,'quantity',grant_row.quantity,'granted_at',grant_row.granted_at,
    'reward_kind',grant_row.reward_kind,'display_name',grant_row.display_name
  ) order by grant_row.notification_at,grant_row.ranking_category,
    grant_row.rank_position,grant_row.ordering_key),'[]'::jsonb)
  into v_grants from grant_rows grant_row;
  return jsonb_build_object('notification_ids',v_notification_ids,'grants',v_grants);
end;
$$;
create or replace function public.get_monthly_power_season_rewards_v1(p_ranking_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;uid uuid:=auth.uid();gid uuid;joined timestamptz;rank_value integer;day_count integer;tiers jsonb;items jsonb;policy_status text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_ranking_type not in ('POWER','GUILD_POWER') then raise exception 'Invalid ranking type';end if;
 select season.* into s from public.ranking_seasons season join public.monthly_power_season_runs run on run.season_id=season.id
 where season.ranking_type=p_ranking_type order by season.starts_at desc limit 1;
 select * into r from public.monthly_power_season_runs where season_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('rank_min',rank_min,'rank_max',rank_max,'honor_label',honor_label,'items',m.items) order by rank_min),'[]'::jsonb)
 into tiers from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type;
 if p_ranking_type='GUILD_POWER' then
 if r.snapshotted_at is not null then
 select guild_id,joined_at,continuous_season_days into gid,joined,day_count from public.monthly_power_member_snapshots where season_id=s.id and user_id=uid;
 else select guild_id,joined_at into gid,joined from public.guild_members where user_id=uid;
 day_count:=public.monthly_power_continuous_jst_days(joined,s.starts_at,least(clock_timestamp()+interval '1 microsecond',s.ends_at));end if;
 end if;
 if s.id is not null then
 if r.snapshotted_at is not null then select rank_position into rank_value from public.monthly_power_entity_snapshots where season_id=s.id and entity_id=case when p_ranking_type='POWER' then uid else gid end;
 elsif clock_timestamp()>=s.starts_at and clock_timestamp()<s.ends_at then
 select rank_position into rank_value from public.monthly_power_live_rankings_v1(p_ranking_type) where entity_id=case when p_ranking_type='POWER' then uid else gid end;end if;
 end if;
 select m.items into items from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type and rank_value between rank_min and rank_max;
 policy_status:=case when p_ranking_type='POWER' then 'NOT_APPLICABLE' when gid is null then 'NOT_MEMBER' when r.eligibility_policy is null then 'MEMBERSHIP_POLICY_PENDING' else 'CONTINUOUS_JST_DAY1' end;
 return jsonb_build_object('season',case when s.id is null then null else to_jsonb(s) end,'tiers',tiers,'current_rank',rank_value,'planned_items',coalesce(items,'[]'::jsonb),
 'eligibility',jsonb_build_object('joined_at',joined,'season_days',day_count,'eligible',case when p_ranking_type='POWER' then true when r.eligibility_policy is null then null else coalesce(day_count>=7,false) end,'status',policy_status),
 'cosmetics_status','BOUND','finalized',r.snapshotted_at is not null);
end $$;
DO $$declare t text;begin foreach t in array array['monthly_power_honor_bindings','monthly_power_honor_grants','monthly_power_honor_recipients'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;end $$;
revoke all on function public.finalize_due_monthly_power_seasons_v1() from public,anon,authenticated;
grant execute on function public.finalize_due_monthly_power_seasons_v1() to service_role;
create function public.get_equipped_season_honors(p_owner_scope text,p_owner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_owner_scope not in ('USER','GUILD') then raise exception 'Invalid scope';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('slot',a.slot,'cosmetic_id',a.cosmetic_id,'display_name',c.display_name,'metadata',c.metadata)),'[]'::jsonb)
 from (select e.slot,e.cosmetic_id from public.equipped_cosmetics e where p_owner_scope='USER' and e.user_id=p_owner_id and e.slot<>'PROFILE_TITLE'
 union all select 'PROFILE_TITLE',u.title_equipped from public.users u where p_owner_scope='USER' and u.id=p_owner_id
 union all select e.slot,e.cosmetic_id from public.guild_equipped_cosmetics e where p_owner_scope='GUILD' and e.guild_id=p_owner_id) a
 join public.cosmetic_master c on c.id=a.cosmetic_id and c.active and c.source_reference='MONTHLY_POWER:20260914' and c.owner_scope=p_owner_scope);
end $$;
revoke all on function public.get_equipped_season_honors(text,uuid) from public,anon;
grant execute on function public.get_equipped_season_honors(text,uuid) to authenticated;

notify pgrst,'reload schema';

-- SECTION 23 supabase/migrations/20260914170757_quest_hometown_fixed_bonus.sql
-- 2026-09-14承認: 新規QuestだけCASH+10% / Drop+200bp。既存Snapshotは保持。
create or replace function public.quest_hometown_snapshot(p_user uuid, p_character text, p_course text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare v record; v_match boolean;
begin
 select c.character_id,c.level,c.awakening_level,m.hometown,q.town_id,q.cash_reward into v
 from public.user_characters c
 join public.canonical_character_master m on m.version='2026-08-21' and m.character_id=c.character_id
 join public.canonical_quest_master q on q.version='2026-08-30' and q.quest_id=p_course
 where c.user_id=p_user and (c.character_id=p_character or c.id::text=p_character)
 order by (c.id::text=p_character) desc,c.id limit 1;
 if not found then raise exception 'hometown snapshot source missing' using errcode='23503'; end if;
 v_match:=coalesce(public.quest_town_key(v.hometown)=public.quest_town_key(v.town_id),false);
 return jsonb_build_object('version',2,'character_id',v.character_id,'level',v.level,'awakening',v.awakening_level,
 'town',public.quest_town_key(v.town_id),'matched',v_match,
 'cash_bonus_rate',case when v_match then 0.10 else 0 end,
 'cash',case when v_match then floor(v.cash_reward::numeric * 0.10)::bigint else 0 end,
 'drop_bonus_bp',case when v_match then 200 else 0 end);
end $function$;
-- claim_patrol_rewards、INSERT trigger、権限、基礎Master、既存進行中行は変更しない。


-- SECTION 24 supabase/migrations/20260914173738_raid_instance_daily_rewards_v2.sql

create table public.raid_daily_clear_bonus_rules (
 difficulty text primary key references public.raid_room_clear_reward_rules(difficulty),
 chance_bp integer not null check(chance_bp between 0 and 10000),
 items jsonb not null check(jsonb_typeof(items)='array')
);
insert into public.raid_daily_clear_bonus_rules values
 ('beginner',3000,'[{"itemId":"NORMAL_GACHA_TICKET_RANDOM","quantity":1}]'),
 ('intermediate',5000,'[{"itemId":"NORMAL_GACHA_TICKET_RANDOM","quantity":1}]'),
 ('advanced',10000,'[{"itemId":"SPECIAL_TICKET_RANDOM","quantity":1}]'),
 ('expert',10000,'[{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":1},{"itemId":"SPECIAL_TICKET_SKILL","quantity":1},{"itemId":"SPECIAL_TICKET_EQUIPMENT","quantity":1}]');
create table public.raid_daily_clear_bonus_ledger (
 raid_day_key date not null,
 user_id uuid not null references public.users(id),
 difficulty text not null references public.raid_daily_clear_bonus_rules(difficulty),
 source_instance_id uuid not null references public.raid_bosses(id),
 source_room_id uuid not null references public.raid_rooms(id),
 won boolean not null,
 items jsonb not null default '[]'::jsonb,
 issued_at timestamptz not null default clock_timestamp(),
 primary key(raid_day_key,user_id,difficulty)
);
alter table public.raid_daily_clear_bonus_rules enable row level security;
alter table public.raid_daily_clear_bonus_ledger enable row level security;
revoke all on public.raid_daily_clear_bonus_rules,public.raid_daily_clear_bonus_ledger from public,anon,authenticated,service_role;
-- One room is one instance (existing unique raid_rooms.raid_boss_instance_id).
-- Existing grants are untouched and never retroactively receive a daily roll.
delete from public.raid_room_clear_reward_items where difficulty in ('beginner','intermediate','advanced','expert');
insert into public.raid_room_clear_reward_items(difficulty,item_id,quantity) values
 ('beginner','SKILL_MANUAL',1),
 ('intermediate','SKILL_MANUAL',1),('intermediate','EQUIP_LB_PART',1),
 ('advanced','SKILL_MANUAL',2),('advanced','EQUIP_LB_PART',2),
 ('expert','SKILL_MANUAL',3),('expert','EQUIP_LB_PART',3);
update public.raid_room_clear_reward_rules set
 enabled=difficulty in ('beginner','intermediate'),
 minimum_contribution_damage=case when difficulty in ('beginner','intermediate') then 0 else null end,
 rule_version=2
 where difficulty in ('beginner','intermediate','advanced','expert');

create function public._issue_raid_daily_clear_bonus_v2(p_room_id uuid,p_user_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_daily_clear_bonus_rules%rowtype;v_day date;v_won boolean;v_items jsonb:='[]';v_item jsonb;v_inserted integer;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' or not exists(
  select 1 from public.raid_room_clear_rewards where room_id=p_room_id and user_id=p_user_id and rule_version=2
 ) then raise exception 'Daily bonus requires issued v2 instance clear';end if;
 if not exists(select 1 from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id and enabled and minimum_contribution_damage is not null) then return;end if;
 select * into strict v_rule from public.raid_daily_clear_bonus_rules where difficulty=v_room.difficulty_id for share;
 -- Use the actual clear day, never client time or retry/claim time.
 if coalesce(v_boss.cleared_at,v_boss.outcome_finalized_at) is null then raise exception 'Missing authoritative clear time';end if;
 v_day:=(coalesce(v_boss.cleared_at,v_boss.outcome_finalized_at) at time zone 'Asia/Tokyo')::date;
 v_won:=random()*10000<v_rule.chance_bp;
 if v_won then
  for v_item in select value from jsonb_array_elements(v_rule.items) loop
   v_items:=v_items||jsonb_build_array(jsonb_build_object('itemId',public.resolve_canonical_reward_item(v_item->>'itemId'),'quantity',(v_item->>'quantity')::integer));
  end loop;
 end if;
 -- INSERT is the race winner. Misses also persist; another instance cannot reroll.
 insert into public.raid_daily_clear_bonus_ledger(raid_day_key,user_id,difficulty,source_instance_id,source_room_id,won,items)
 values(v_day,p_user_id,v_room.difficulty_id,v_boss.id,p_room_id,v_won,v_items)
 on conflict do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=0 then return;end if;
 for v_item in select value from jsonb_array_elements(v_items) loop
  perform public._grant_gameplay_reward_v1(p_user_id,'RAID_ROOM_CLEAR','DAILY_CLEAR_BONUS:'||v_day::text||':'||v_room.difficulty_id,v_item->>'itemId',(v_item->>'quantity')::integer);
 end loop;
end $$;
revoke all on function public._issue_raid_daily_clear_bonus_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_raid_reward_policy_v2() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 return (select jsonb_agg(jsonb_build_object(
 'difficulty',r.difficulty,'enabled',r.enabled and r.minimum_contribution_damage is not null,
 'status',case when r.enabled and r.minimum_contribution_damage is not null then 'ACTIVE' else 'PENDING_CONTRIBUTION' end,
 'version',r.rule_version,
 'instanceItems',(select jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty),
 'daily',jsonb_build_object('chanceBp',d.chance_bp,'items',d.items)
 ) order by r.difficulty) from public.raid_room_clear_reward_rules r join public.raid_daily_clear_bonus_rules d using(difficulty));
end $$;
revoke all on function public.get_raid_reward_policy_v2() from public,anon,authenticated,service_role;
grant execute on function public.get_raid_reward_policy_v2() to authenticated;

CREATE OR REPLACE FUNCTION public._issue_raid_room_clear_rewards_v1(p_room_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
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
  -- Clear gate通過・資格ledger新規作成時だけ。retryやitem数では増やさない。
  perform public.evaluate_mission_progress(v_member.user_id, 'RAID_CLEAR_ELIGIBLE', 1);
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_CLEAR',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_clear_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);
  end loop;
  perform public._issue_raid_daily_clear_bonus_v2(p_room_id,v_member.user_id);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;


CREATE OR REPLACE FUNCTION public._issue_raid_room_rescue_rewards_v1(p_room_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
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
   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_RESCUE',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_rescue_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;


CREATE OR REPLACE FUNCTION public._raid_room_clear_reward_progress_v1(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_count bigint:=0;v_damage bigint:=0;v_status text;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id;
 select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
 from public.raid_damage_logs l
 join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id and s.room_id=p_room_id
 join public.raid_room_members m on m.room_id=p_room_id and m.user_id=p_user_id
 where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
  and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
  and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
  and b.official_context->>'roomId'=p_room_id::text
  and b.finalization_status='FINALIZED'
  and b.finalization_result->'lateFinalization'='false'::jsonb;
 if v_rule.minimum_contribution_damage is null then v_status:='unknown';
 elsif v_count>0 and (v_room.difficulty_id in ('beginner','intermediate') or v_damage>v_rule.minimum_contribution_damage) and v_boss.outcome='DEFEAT_SUCCESS' then v_status:='succeeded';
 else v_status:='not_succeeded';end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'clearGate',jsonb_build_object('status',v_status,'ruleVersion',coalesce(v_rule.rule_version,1),
   'contributionDamage',v_damage,'minimumContributionDamage',v_rule.minimum_contribution_damage,
   'cleared',coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $function$;


CREATE OR REPLACE FUNCTION public.get_raid_room_clear_reward_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_saved public.raid_room_clear_rewards%rowtype;
 v_progress jsonb;v_items jsonb:='[]';v_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_saved from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_uid;
 if found then
  v_status:='issued';v_progress:=jsonb_build_object('clearGate',v_saved.clear_gate);
  select coalesce(jsonb_agg(jsonb_build_object('itemId',g.item_id,'quantity',g.quantity,
   'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at) order by g.item_id),'[]') into v_items
  from public.raid_room_clear_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id
  where g.room_id=p_room_id and g.user_id=v_uid;
 else
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_uid);
  if v_progress->'clearGate'->>'status'='unknown' or not exists(
   select 1 from public.raid_room_clear_reward_rules r where r.difficulty=v_room.difficulty_id and r.enabled
    and exists(select 1 from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty)) then v_status:='unconfigured';
  elsif v_progress->'clearGate'->>'status'='succeeded' then v_status:='pending';
  else v_status:='not_eligible';end if;
 end if;
 return jsonb_build_object('roomId',p_room_id,'status',v_status,'clearGate',v_progress->'clearGate',
  'issuedAt',v_saved.issued_at,'expiresAt',case when exists(select 1 from public.raid_room_clear_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items,
 'dailyBonus',(select jsonb_build_object('dayKey',d.raid_day_key,'won',d.won,'items',d.items,'sourceRoomId',d.source_room_id,'issuedAt',d.issued_at) from public.raid_daily_clear_bonus_ledger d where d.source_room_id=p_room_id and d.user_id=v_uid));
end $function$;

-- SECTION 25 supabase/migrations/20260914173853_quest_raid_cash_xp_bonus.sql
-- Quest発見Raid: Item2倍を廃止し、撃破受給時に基礎Quest CASH + User EXP50%を別途付与。
alter table public.quest_raid_encounters add column bonus_cash bigint check(bonus_cash>=0), add column bonus_user_xp integer check(bonus_user_xp>=0);
alter table public.quest_raid_encounter_bonus_grants add column cash bigint, add column user_xp integer;
create function public._quest_raid_cash_xp_v2(p_patrol uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('cash',coalesce((p.rewards_accrued->>'base_cash')::bigint,q.cash_reward::bigint),
 'userXp',floor(coalesce((p.rewards_accrued->>'xp')::numeric,q.user_exp::numeric)*0.5)::integer)
 from public.user_patrols p join public.canonical_quest_master q
 on q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id) where p.id=p_patrol
$$;
revoke all on function public._quest_raid_cash_xp_v2(uuid) from public,anon,authenticated,service_role;
-- 新規抽選で記録。既存Questのhometown Snapshotや既存Encounter行は更新しない。
do $$ declare d text; anchor text:='bonus_items=bonus,reward_multiplier=2'; begin
 d:=pg_get_functiondef('public.resolve_quest_raid_encounter_v1(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'resolve encounter anchor missing';end if;
 execute replace(d,anchor,'bonus_items=''[]''::jsonb,reward_multiplier=1,bonus_cash=(public._quest_raid_cash_xp_v2(p_patrol_id)->>''cash'')::bigint,bonus_user_xp=(public._quest_raid_cash_xp_v2(p_patrol_id)->>''userXp'')::integer');
end $$;
create or replace function public.issue_quest_raid_encounter_bonus_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype; amounts jsonb; v_cash bigint; v_xp integer; inserted integer;
begin
 -- 救援成功だけでは付与しない。正式撃破受給ledgerを単一入口にする。
 if tg_table_name<>'raid_room_clear_rewards' then return new;end if;
 select * into e from public.quest_raid_encounters where room_id=new.room_id and status='CREATED';
 if not found then return new;end if;
 amounts:=public._quest_raid_cash_xp_v2(e.patrol_id);
 v_cash:=coalesce(e.bonus_cash,(amounts->>'cash')::bigint);
 v_xp:=coalesce(e.bonus_user_xp,(amounts->>'userXp')::integer);
 if v_cash is null or v_xp is null then raise exception 'quest bonus authority missing';end if;
 insert into public.quest_raid_encounter_bonus_grants(room_id,user_id,rule_version,cash,user_xp)
 values(new.room_id,new.user_id,3,v_cash,v_xp) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return new;end if;
 if v_cash>0 then update public.users set cash=cash+v_cash where id=new.user_id;end if;
 if v_xp>0 then perform public.apply_user_xp(new.user_id,v_xp);end if;
 return new;
end $$;
create or replace function public.get_quest_raid_bonus_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype; amounts jsonb; receipt public.quest_raid_encounter_bonus_grants%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 perform public.get_raid_room_v1(p_room_id);
 select * into e from public.quest_raid_encounters where room_id=p_room_id and status='CREATED';
 if not found then return null;end if;
 amounts:=public._quest_raid_cash_xp_v2(e.patrol_id);
 select * into receipt from public.quest_raid_encounter_bonus_grants where room_id=p_room_id and user_id=auth.uid();
 return jsonb_build_object('roomId',p_room_id,'rewardMultiplier',1,'items','[]'::jsonb,'delivery','DIRECT',
 'cash',coalesce(receipt.cash,e.bonus_cash,(amounts->>'cash')::bigint),
 'userXp',coalesce(receipt.user_xp,e.bonus_user_xp,(amounts->>'userXp')::integer),
 'issued',receipt.room_id is not null,'legacyIssued',receipt.room_id is not null and receipt.cash is null);
end $$;
-- 発見/再訪画面にもサーバー確定値を投影。Item2倍は旧行でも提示しない。
do $$ declare d text; anchor text:='''rewardMultiplier'',e.reward_multiplier'; begin
 d:=pg_get_functiondef('public.quest_raid_encounter_projection_v1(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'projection anchor missing';end if;
 d:=replace(d,anchor,'''rewardMultiplier'',1,''bonusCash'',coalesce(e.bonus_cash,(public._quest_raid_cash_xp_v2(e.patrol_id)->>''cash'')::bigint),''bonusUserXp'',coalesce(e.bonus_user_xp,(public._quest_raid_cash_xp_v2(e.patrol_id)->>''userXp'')::integer)');
 d:=replace(d,'''bonusItems'',coalesce(e.bonus_items,''[]''::jsonb)','''bonusItems'',''[]''::jsonb');
 execute d;
end $$;

-- SECTION 26 supabase/migrations/20260914174319_quest_area_identity_formal_open.sql
-- Restored from Preview migration history 20260914174340; already applied. Do not reapply.
-- Preview candidate. Production execution is not authorized.
-- Area x difficulty pools are independently addressable; numeric bias awaits economy FIX.
-- No existing hometown_bonus_snapshot is updated.
do $$ begin
 if (select count(*) from public.canonical_quest_master where version='2026-08-30') <> 21 then
  raise exception 'Expected 21 canonical Quest rows';
 end if;
end $$;
insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp)
select q.version,'QUEST_'||upper(q.town_id)||'_'||q.difficulty||'_20260914',i.roll_index,i.item_id,i.quantity,i.probability_bp
from public.canonical_quest_master q
join public.canonical_quest_reward_pool_items i on i.version=q.version and i.reward_pool_id='QUEST_'||q.difficulty||'_20260830'
where q.version='2026-08-30'
on conflict(version,reward_pool_id,roll_index) do nothing;
update public.canonical_quest_master set
 cash_reward=case difficulty when 'EASY' then 300 when 'NORMAL' then 600 when 'HARD' then 1000 end,
 reward_pool_id='QUEST_'||upper(town_id)||'_'||difficulty||'_20260914'
where version='2026-08-30' and difficulty in ('EASY','NORMAL','HARD');
update public.quests q set cash_reward=m.cash_reward
from public.canonical_quest_master m where m.version='2026-08-30' and q.id=m.quest_id;
-- Preserve rarity, candidates, skills, stats and locality; favor existing identity growth types.
-- Explicit old/new guards make repeat application non-multiplicative.
with weights as (select * from jsonb_to_recordset('[{"pool_key":"SHINJUKU_EASY","character_id":"char_kenji_01","old_weight":1,"weight":3},{"pool_key":"SHINJUKU_NORMAL","character_id":"char_kenji_01","old_weight":1,"weight":3},{"pool_key":"SHINJUKU_NORMAL","character_id":"char_takuro_01","old_weight":2,"weight":6},{"pool_key":"SHINJUKU_NORMAL","character_id":"char_leon_01","old_weight":2,"weight":6},{"pool_key":"SHINJUKU_HARD","character_id":"char_chang_01","old_weight":1,"weight":3},{"pool_key":"SHINJUKU_HARD","character_id":"char_takuro_01","old_weight":2,"weight":6},{"pool_key":"SHINJUKU_HARD","character_id":"char_leon_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_EASY","character_id":"char_naoto_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_EASY","character_id":"char_sawat_01","old_weight":1,"weight":3},{"pool_key":"SHIBUYA_EASY","character_id":"char_minami_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_EASY","character_id":"char_yukina_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_EASY","character_id":"char_jihoon_01","old_weight":1,"weight":3},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_naoto_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_sawat_01","old_weight":1,"weight":3},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_minami_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_yukina_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_jihoon_01","old_weight":1,"weight":3},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_sora_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_reina_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_NORMAL","character_id":"char_noa_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_HARD","character_id":"char_minami_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_HARD","character_id":"char_yukina_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_HARD","character_id":"char_jihoon_01","old_weight":1,"weight":3},{"pool_key":"SHIBUYA_HARD","character_id":"char_sora_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_HARD","character_id":"char_reina_01","old_weight":2,"weight":6},{"pool_key":"SHIBUYA_HARD","character_id":"char_noa_01","old_weight":2,"weight":6},{"pool_key":"IKEBUKURO_EASY","character_id":"char_shun_01","old_weight":2,"weight":6},{"pool_key":"IKEBUKURO_EASY","character_id":"char_shin_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_EASY","character_id":"char_yuki_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_NORMAL","character_id":"char_shun_01","old_weight":2,"weight":6},{"pool_key":"IKEBUKURO_NORMAL","character_id":"char_shin_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_NORMAL","character_id":"char_yuki_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_NORMAL","character_id":"char_takeshi_01","old_weight":2,"weight":6},{"pool_key":"IKEBUKURO_NORMAL","character_id":"char_riki_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_HARD","character_id":"char_shin_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_HARD","character_id":"char_yuki_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_HARD","character_id":"char_joe_01","old_weight":1,"weight":3},{"pool_key":"IKEBUKURO_HARD","character_id":"char_takeshi_01","old_weight":2,"weight":6},{"pool_key":"IKEBUKURO_HARD","character_id":"char_riki_01","old_weight":1,"weight":3},{"pool_key":"ROPPONGI_EASY","character_id":"char_souta_01","old_weight":1,"weight":3},{"pool_key":"ROPPONGI_EASY","character_id":"char_makoto_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_EASY","character_id":"char_rin_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_EASY","character_id":"char_shion_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_NORMAL","character_id":"char_souta_01","old_weight":1,"weight":3},{"pool_key":"ROPPONGI_NORMAL","character_id":"char_makoto_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_NORMAL","character_id":"char_rin_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_NORMAL","character_id":"char_shion_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_NORMAL","character_id":"char_cecile_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_HARD","character_id":"char_makoto_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_HARD","character_id":"char_rin_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_HARD","character_id":"char_shion_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_HARD","character_id":"char_cecile_01","old_weight":2,"weight":6},{"pool_key":"ROPPONGI_HARD","character_id":"char_sakura_01","old_weight":1,"weight":3},{"pool_key":"AKIHABARA_EASY","character_id":"char_masato_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_EASY","character_id":"char_yoshihiko_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_EASY","character_id":"char_aoi_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_EASY","character_id":"char_mei_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_EASY","character_id":"char_ren_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_EASY","character_id":"char_serika_01","old_weight":1,"weight":3},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_masato_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_yoshihiko_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_aoi_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_mei_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_ren_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_serika_01","old_weight":1,"weight":3},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_alice_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_rui_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_NORMAL","character_id":"char_maya_01","old_weight":1,"weight":3},{"pool_key":"AKIHABARA_HARD","character_id":"char_aoi_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_HARD","character_id":"char_mei_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_HARD","character_id":"char_ren_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_HARD","character_id":"char_serika_01","old_weight":1,"weight":3},{"pool_key":"AKIHABARA_HARD","character_id":"char_alice_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_HARD","character_id":"char_rui_01","old_weight":2,"weight":6},{"pool_key":"AKIHABARA_HARD","character_id":"char_maya_01","old_weight":1,"weight":3},{"pool_key":"AKIHABARA_HARD","character_id":"char_seiya_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_EASY","character_id":"char_gou_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_EASY","character_id":"char_kenji_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_EASY","character_id":"char_daimon_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_EASY","character_id":"char_mark_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_EASY","character_id":"char_chang_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_gou_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_kenji_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_daimon_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_mark_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_chang_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_tetsu_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_NORMAL","character_id":"char_lucas_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_HARD","character_id":"char_daimon_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_HARD","character_id":"char_mark_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_HARD","character_id":"char_chang_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_HARD","character_id":"char_yuji_01","old_weight":1,"weight":3},{"pool_key":"KAWASAKI_HARD","character_id":"char_tetsu_01","old_weight":2,"weight":6},{"pool_key":"KAWASAKI_HARD","character_id":"char_lucas_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_EASY","character_id":"char_tatsuya_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_EASY","character_id":"char_tomoya_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_EASY","character_id":"char_makoto_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_EASY","character_id":"char_rin_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_EASY","character_id":"char_shion_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_tatsuya_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_tomoya_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_makoto_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_rin_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_shion_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_genji_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_long_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_sakura_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_NORMAL","character_id":"char_cecile_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_HARD","character_id":"char_makoto_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_HARD","character_id":"char_rin_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_HARD","character_id":"char_shion_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_HARD","character_id":"char_joe_01","old_weight":1,"weight":3},{"pool_key":"YOKOHAMA_HARD","character_id":"char_genji_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_HARD","character_id":"char_long_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_HARD","character_id":"char_sakura_01","old_weight":2,"weight":6},{"pool_key":"YOKOHAMA_HARD","character_id":"char_cecile_01","old_weight":1,"weight":3}]'::jsonb) as x(pool_key text,character_id text,old_weight integer,weight integer))
update public.canonical_quest_enemy_pool_entries e set weight=w.weight
from weights w where e.version='2026-08-30' and e.pool_key=w.pool_key and e.character_id=w.character_id and e.weight=w.old_weight;

-- SECTION 27 supabase/migrations/20260914223252_pvp_battle_raid_ticket_rewards.sql

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.on_canonical_daily_activity_finalized()'::regprocedure))<>'dc4fe13babd88177f964cffd55683f0c'
 OR md5(pg_get_functiondef('public.finalize_pvp_battle(uuid,jsonb)'::regprocedure))<>'82819b8582e7da9e6d7fd1f1c4b7206b'
 THEN RAISE EXCEPTION 'PvP reward baseline drift'; END IF;
END $guard$;
ALTER TABLE public.pvp_match_rewards_master ADD COLUMN raid_ticket_reward integer NOT NULL DEFAULT 0 CHECK(raid_ticket_reward>=0);
UPDATE public.pvp_match_rewards_master SET cash_reward=CASE result WHEN 'VICTORY' THEN 200 ELSE 50 END,diamond_reward=0,exp_reward=0,raid_ticket_reward=CASE result WHEN 'VICTORY' THEN 1 ELSE 0 END WHERE result IN ('VICTORY','DEFEAT');
CREATE OR REPLACE FUNCTION public.on_canonical_daily_activity_finalized()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text; v_cash integer; v_ticket integer; v_payload jsonb;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  if new.resolution_authority<>'PVP_SERVER' then return new; end if;
  select cash_reward,raid_ticket_reward into strict v_cash,v_ticket
  from public.pvp_match_rewards_master where result=case when new.finalization_result->>'winner'='PLAYER' then 'VICTORY' else 'DEFEAT' end;
  v_key:='PVP_BATTLE:'||new.id::text;
  v_payload:=jsonb_build_array(jsonb_build_object('itemId','CASH','quantity',v_cash,'delivery','INVENTORY'));
  if v_ticket>0 then v_payload:=jsonb_build_array(jsonb_build_object('itemId','RAID_POINT_TICKET','quantity',v_ticket,'delivery','INVENTORY'))||v_payload; end if;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,v_payload,now()) on conflict do nothing;
  if found then
   perform public.grant_present_payload(new.requester_user_id,'CASH',v_cash);
   if v_ticket>0 then perform public.grant_present_payload(new.requester_user_id,'RAID_POINT_TICKET',v_ticket); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
  if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_EXP_S',1); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1,"delivery":"INVENTORY"},{"itemId":"CASH","quantity":40,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'CHAR_EXP_M',1); perform public.grant_present_payload(new.requester_user_id,'CASH',40); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_LB_PART',1); end if;
  end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.finalize_pvp_battle(p_replay_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_replay public.battle_replay_sessions%rowtype; v_win boolean; v_player integer; v_opponent integer; v_delta integer; v_new integer; v_final jsonb; v_name text;
begin
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id for update;
 if not found then raise exception 'PvP replay not found' using errcode='P0002'; end if;
 if v_replay.battle_mode<>'PVP' or v_replay.resolution_authority<>'PVP_SERVER' then raise exception 'replay is not official PvP' using errcode='42501'; end if;
 if v_replay.finalization_status='FINALIZED' then return v_replay.finalization_result; end if;
 if v_replay.status<>'PENDING' or v_replay.finalization_status<>'PENDING' then raise exception 'PvP replay is not finalizable' using errcode='23514'; end if;
 perform public.advance_ranking_season('PVP',clock_timestamp());
 perform public.validate_official_battle_result(p_result); v_win:=p_result->>'winner'='PLAYER';
 v_player:=coalesce((v_replay.official_context->>'playerRankPointsAtStart')::integer,1000); v_opponent:=coalesce((v_replay.official_context->>'opponentRankPointsAtStart')::integer,1000); v_delta:=public.canonical_pvp_rating_delta(v_player,v_opponent,case when v_win then 'WIN' else 'LOSS' end);
 insert into public.pvp_ranks(user_id,rank_points,daily_wins,season_wins,updated_at) values(v_replay.requester_user_id,greatest(1000+v_delta,0),case when v_win then 1 else 0 end,case when v_win then 1 else 0 end,now()) on conflict(user_id) do update set rank_points=greatest(public.pvp_ranks.rank_points+v_delta,0),daily_wins=public.pvp_ranks.daily_wins+case when v_win then 1 else 0 end,season_wins=public.pvp_ranks.season_wins+case when v_win then 1 else 0 end,updated_at=now() returning rank_points into v_new;
 select username into v_name from public.users where id=v_replay.requester_user_id; insert into public.pvp_defense_logs(user_id,attacker_id,attacker_name,result,points_change) values(v_replay.source_reference_id,v_replay.requester_user_id,v_name,case when v_win then 'DEFEAT' else 'VICTORY' end,-v_delta);
 v_final:=p_result||jsonb_build_object('mode','PVP','oldRating',v_player,'opponentRating',v_opponent,'rankDelta',v_delta,'newRankPoints',v_new,'remainingPvpPoints',coalesce((v_replay.official_context->>'remainingPvpPoints')::integer,0),'rewards',jsonb_build_object('cash',0,'diamonds',0,'xp',0));
 insert into public.battle_replay_events(battle_replay_session_id,event_index,round_number,event_type,payload) select p_replay_id,greatest(coalesce((e.value->>'index')::integer,e.ordinality::integer-1),0),greatest(coalesce((e.value->>'round')::integer,1),1),coalesce(nullif(e.value->>'type',''),'UNKNOWN'),coalesce(e.value->'payload','{}'::jsonb) from jsonb_array_elements(p_result->'events') with ordinality e(value,ordinality) on conflict do nothing;
 update public.battle_replay_sessions set status='RESOLVED',result=v_final,resolved_at=now(),finalization_status='FINALIZED',finalized_at=now(),finalization_result=v_final where id=p_replay_id;
 -- The AFTER-finalize trigger has committed its claim rows and direct asset grants
 -- in this transaction. Project that exact receipt, never a client estimate.
 select v_final || jsonb_build_object(
   'reward_items',coalesce(jsonb_agg(item.value) filter (where item.value is not null),'[]'::jsonb),
   'reward_delivery','INVENTORY',
   'rewards',jsonb_build_object('cash',coalesce(sum((item.value->>'quantity')::integer) filter(where item.value->>'itemId'='CASH'),0),'diamonds',0,'xp',0)
 ) into v_final
 from public.canonical_daily_activity_claims claim
 cross join lateral jsonb_array_elements(claim.reward_payload) item(value)
 where claim.user_id=v_replay.requester_user_id and claim.source_ref=p_replay_id
   and item.value->>'delivery'='INVENTORY';
 -- Do not update finalization_status again: keep all finalize triggers exactly once.
 update public.battle_replay_sessions set result=v_final,finalization_result=v_final where id=p_replay_id;
 perform public.evaluate_mission_progress(v_replay.requester_user_id,'PVP_BATTLE_COUNT',1); if v_win then perform public.evaluate_mission_progress(v_replay.requester_user_id,'PVP_WIN_COUNT',1); end if;
 return v_final;
end $function$
;
-- CREATE OR REPLACE retains existing ACL; clients cannot submit a finalized outcome.
REVOKE ALL ON FUNCTION public.finalize_pvp_battle(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pvp_battle(uuid,jsonb) TO service_role;

-- SECTION 28 supabase/migrations/20260914231128_raid_strategy_profiles_activation.sql

-- Only the 28 future-room master profiles. Existing Room/Replay snapshots remain immutable.
do $profile_update$
declare r jsonb; current_profile jsonb; updated_count integer:=0; e jsonb; s jsonb; canonical_owner text;
begin
 for r in select value from jsonb_array_elements($profiles$[{"raid_variant_id":"RAID_SHINJUKU_V1","difficulty_id":"beginner","max_hp":220000,"profile":{"maxHp":220000,"areaId":"SHINJUKU","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":0}],"baseStats":{"hp":44000,"atk":108,"def":988,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_tomoya_01","characterName":"トモヤ","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":44000,"atk":102,"def":988,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_gou_01","characterName":"ダイスケ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":44000,"atk":97,"def":988,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_kenji_01","characterName":"ケンジ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":44000,"atk":92,"def":988,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_jihoon_01","characterName":"ジフン","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":44000,"atk":102,"def":988,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_serika_01","characterName":"セリカ","awakeningLevel":0}],"raidName":"キングス・クラウン","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_SHINJUKU_V1","strategyVersion":"2026-09-14","strategyIdentity":"高火力型"},"baseline":{"maxHp":220000,"areaId":"SHINJUKU","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_009"}],"baseStats":{"hp":44000,"atk":105,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_tomoya_01","characterName":"トモヤ","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":44000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_gou_01","characterName":"ダイスケ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":44000,"atk":95,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_kenji_01","characterName":"ケンジ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":44000,"atk":90,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_jihoon_01","characterName":"ジフン","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":44000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_serika_01","characterName":"セリカ","awakeningLevel":0}],"raidName":"キングス・クラウン","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_SHINJUKU_V1"}},{"raid_variant_id":"RAID_SHINJUKU_V1","difficulty_id":"intermediate","max_hp":3500000,"profile":{"maxHp":3500000,"areaId":"SHINJUKU","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":0}],"baseStats":{"hp":700000,"atk":1544,"def":3413,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_007"}],"characterId":"char_shin_01","characterName":"シン","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_011","plus":0}],"baseStats":{"hp":700000,"atk":1470,"def":3413,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_008"}],"characterId":"char_yuki_01","characterName":"ユウキ","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":700000,"atk":1397,"def":3413,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_009"}],"characterId":"char_ren_01","characterName":"レン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":700000,"atk":1323,"def":3413,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_masato_01","characterName":"マサト","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":700000,"atk":1470,"def":3413,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_kageyama_01","characterName":"カゲヤマ","awakeningLevel":0}],"raidName":"キングス・クラウン","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_SHINJUKU_V1","strategyVersion":"2026-09-14","strategyIdentity":"高火力型"},"baseline":{"maxHp":3500000,"areaId":"SHINJUKU","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_017"}],"baseStats":{"hp":700000,"atk":1470,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_007"}],"characterId":"char_shin_01","characterName":"シン","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_017"}],"baseStats":{"hp":700000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_008"}],"characterId":"char_yuki_01","characterName":"ユウキ","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_017"}],"baseStats":{"hp":700000,"atk":1330,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_009"}],"characterId":"char_ren_01","characterName":"レン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"},{"plus":0,"skillId":"SKILL_017"}],"baseStats":{"hp":700000,"atk":1260,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_masato_01","characterName":"マサト","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_017"}],"baseStats":{"hp":700000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_kageyama_01","characterName":"カゲヤマ","awakeningLevel":0}],"raidName":"キングス・クラウン","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_SHINJUKU_V1"}},{"raid_variant_id":"RAID_SHINJUKU_V1","difficulty_id":"advanced","max_hp":15200000,"profile":{"maxHp":15200000,"areaId":"SHINJUKU","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":1},{"skillId":"SKILL_011","plus":1}],"baseStats":{"hp":3040000,"atk":1688,"def":4813,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_013"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_leon_01","characterName":"レオン","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_011","plus":1}],"baseStats":{"hp":3040000,"atk":1607,"def":4813,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_014"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_takuro_01","characterName":"タクロウ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_009","plus":1}],"baseStats":{"hp":3040000,"atk":1527,"def":4813,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_001"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_long_01","characterName":"ロン","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":3040000,"atk":1447,"def":4813,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_yuji_01","characterName":"ユウジ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":3040000,"atk":1607,"def":4813,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_yukina_01","characterName":"ユキナ","awakeningLevel":1}],"raidName":"キングス・クラウン","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_SHINJUKU_V1","strategyVersion":"2026-09-14","strategyIdentity":"高火力型"},"baseline":{"maxHp":15200000,"areaId":"SHINJUKU","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_026"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":3040000,"atk":1570,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_013"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_leon_01","characterName":"レオン","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_026"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":3040000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_014"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_takuro_01","characterName":"タクロウ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_026"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":3040000,"atk":1420,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_001"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_long_01","characterName":"ロン","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_026"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":3040000,"atk":1346,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_yuji_01","characterName":"ユウジ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_026"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":3040000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_yukina_01","characterName":"ユキナ","awakeningLevel":1}],"raidName":"キングス・クラウン","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_SHINJUKU_V1"}},{"raid_variant_id":"RAID_SHINJUKU_V1","difficulty_id":"expert","max_hp":28700000,"profile":{"maxHp":28700000,"areaId":"SHINJUKU","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":2},{"skillId":"SKILL_011","plus":2}],"baseStats":{"hp":5740000,"atk":1848,"def":6175,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_005"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_016"}],"characterId":"char_mio_01","characterName":"ミオ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_011","plus":2}],"baseStats":{"hp":5740000,"atk":1760,"def":6175,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_006"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_017"}],"characterId":"char_reiji_01","characterName":"レイジ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_009","plus":2}],"baseStats":{"hp":5740000,"atk":1672,"def":6175,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_007"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_018"}],"characterId":"char_ageha_01","characterName":"アゲハ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_011","plus":2}],"baseStats":{"hp":5740000,"atk":1584,"def":6175,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_019"}],"characterId":"char_genji_01","characterName":"ゲンジ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_009","plus":2}],"baseStats":{"hp":5740000,"atk":1760,"def":6175,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_020"}],"characterId":"char_lucas_01","characterName":"ルーカス","awakeningLevel":1}],"raidName":"キングス・クラウン","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_SHINJUKU_V1","strategyVersion":"2026-09-14","strategyIdentity":"高火力型"},"baseline":{"maxHp":28700000,"areaId":"SHINJUKU","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_026"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":5740000,"atk":1680,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_005"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_016"}],"characterId":"char_mio_01","characterName":"ミオ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_026"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":5740000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_006"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_017"}],"characterId":"char_reiji_01","characterName":"レイジ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_026"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":5740000,"atk":1520,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_007"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_018"}],"characterId":"char_ageha_01","characterName":"アゲハ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_026"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":5740000,"atk":1440,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_019"}],"characterId":"char_genji_01","characterName":"ゲンジ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_026"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":5740000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_020"}],"characterId":"char_lucas_01","characterName":"ルーカス","awakeningLevel":1}],"raidName":"キングス・クラウン","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_SHINJUKU_V1"}},{"raid_variant_id":"RAID_SHIBUYA_V1","difficulty_id":"beginner","max_hp":200000,"profile":{"maxHp":200000,"areaId":"SHIBUYA","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_004","plus":0}],"baseStats":{"hp":40000,"atk":105,"def":975,"luk":0,"spd":49},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_naoto_01","characterName":"ナオト","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":40000,"atk":100,"def":975,"luk":0,"spd":49},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_masato_01","characterName":"マサト","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":40000,"atk":95,"def":975,"luk":0,"spd":49},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_sawat_01","characterName":"サワット","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":40000,"atk":90,"def":975,"luk":0,"spd":49},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_minami_01","characterName":"ミナミ","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":40000,"atk":100,"def":975,"luk":0,"spd":49},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_ren_male_01","characterName":"カズヤ","awakeningLevel":0}],"raidName":"ハイスピード・スターズ","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_SHIBUYA_V1","strategyVersion":"2026-09-14","strategyIdentity":"高速型"},"baseline":{"maxHp":200000,"areaId":"SHIBUYA","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_004"}],"baseStats":{"hp":40000,"atk":105,"def":1000,"luk":0,"spd":45},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_naoto_01","characterName":"ナオト","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":40000,"atk":100,"def":1000,"luk":0,"spd":45},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_masato_01","characterName":"マサト","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":40000,"atk":95,"def":1000,"luk":0,"spd":45},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_sawat_01","characterName":"サワット","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":40000,"atk":90,"def":1000,"luk":0,"spd":45},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_minami_01","characterName":"ミナミ","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":40000,"atk":100,"def":1000,"luk":0,"spd":45},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_ren_male_01","characterName":"カズヤ","awakeningLevel":0}],"raidName":"ハイスピード・スターズ","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_SHIBUYA_V1"}},{"raid_variant_id":"RAID_SHIBUYA_V1","difficulty_id":"intermediate","max_hp":3600000,"profile":{"maxHp":3600000,"areaId":"SHIBUYA","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_004","plus":0}],"baseStats":{"hp":720000,"atk":1470,"def":3325,"luk":0,"spd":112},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_yukina_01","characterName":"ユキナ","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_030","plus":0}],"baseStats":{"hp":720000,"atk":1400,"def":3325,"luk":0,"spd":112},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_rin_01","characterName":"リン","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":720000,"atk":1330,"def":3325,"luk":0,"spd":112},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_013"}],"characterId":"char_shion_01","characterName":"シオン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":720000,"atk":1260,"def":3325,"luk":0,"spd":112},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_gou_01","characterName":"ダイスケ","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":720000,"atk":1400,"def":3325,"luk":0,"spd":112},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_martina_01","characterName":"マルティナ","awakeningLevel":0}],"raidName":"ハイスピード・スターズ","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_SHIBUYA_V1","strategyVersion":"2026-09-14","strategyIdentity":"高速型"},"baseline":{"maxHp":3600000,"areaId":"SHIBUYA","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_020"}],"baseStats":{"hp":720000,"atk":1470,"def":3500,"luk":0,"spd":95},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_yukina_01","characterName":"ユキナ","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_020"}],"baseStats":{"hp":720000,"atk":1400,"def":3500,"luk":0,"spd":95},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_rin_01","characterName":"リン","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_020"}],"baseStats":{"hp":720000,"atk":1330,"def":3500,"luk":0,"spd":95},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_013"}],"characterId":"char_shion_01","characterName":"シオン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"},{"plus":0,"skillId":"SKILL_020"}],"baseStats":{"hp":720000,"atk":1260,"def":3500,"luk":0,"spd":95},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_gou_01","characterName":"ダイスケ","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_020"}],"baseStats":{"hp":720000,"atk":1400,"def":3500,"luk":0,"spd":95},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_martina_01","characterName":"マルティナ","awakeningLevel":0}],"raidName":"ハイスピード・スターズ","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_SHIBUYA_V1"}},{"raid_variant_id":"RAID_SHIBUYA_V1","difficulty_id":"advanced","max_hp":15800000,"profile":{"maxHp":15800000,"areaId":"SHIBUYA","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_004","plus":1},{"skillId":"SKILL_030","plus":1}],"baseStats":{"hp":3160000,"atk":1570,"def":4625,"luk":0,"spd":152},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_noa_01","characterName":"ノア","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_066"},{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_030","plus":1}],"baseStats":{"hp":3160000,"atk":1495,"def":4625,"luk":0,"spd":152},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_reina_01","characterName":"レイナ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_065"},{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_004","plus":1}],"baseStats":{"hp":3160000,"atk":1420,"def":4625,"luk":0,"spd":152},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_005"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_sora_01","characterName":"ソラ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":3160000,"atk":1346,"def":4625,"luk":0,"spd":152},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_serika_01","characterName":"セリカ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":3160000,"atk":1495,"def":4625,"luk":0,"spd":152},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_shin_01","characterName":"シン","awakeningLevel":1}],"raidName":"ハイスピード・スターズ","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_SHIBUYA_V1","strategyVersion":"2026-09-14","strategyIdentity":"高速型"},"baseline":{"maxHp":15800000,"areaId":"SHIBUYA","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_033"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":3160000,"atk":1570,"def":5000,"luk":0,"spd":120},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_noa_01","characterName":"ノア","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_066"},{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_033"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":3160000,"atk":1495,"def":5000,"luk":0,"spd":120},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_reina_01","characterName":"レイナ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_065"},{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_033"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":3160000,"atk":1420,"def":5000,"luk":0,"spd":120},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_005"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_sora_01","characterName":"ソラ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_033"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":3160000,"atk":1346,"def":5000,"luk":0,"spd":120},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_serika_01","characterName":"セリカ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_033"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":3160000,"atk":1495,"def":5000,"luk":0,"spd":120},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_shin_01","characterName":"シン","awakeningLevel":1}],"raidName":"ハイスピード・スターズ","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_SHIBUYA_V1"}},{"raid_variant_id":"RAID_SHIBUYA_V1","difficulty_id":"expert","max_hp":31300000,"profile":{"maxHp":31300000,"areaId":"SHIBUYA","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_056"},{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_004","plus":2},{"skillId":"SKILL_030","plus":2}],"baseStats":{"hp":6260000,"atk":1680,"def":5850,"luk":0,"spd":196},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_019"}],"characterId":"char_leo_01","characterName":"レオ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_030","plus":2}],"baseStats":{"hp":6260000,"atk":1600,"def":5850,"luk":0,"spd":196},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_020"}],"characterId":"char_go_01","characterName":"ゴウ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_004","plus":2}],"baseStats":{"hp":6260000,"atk":1520,"def":5850,"luk":0,"spd":196},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_011"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_021"}],"characterId":"char_kaede_01","characterName":"カエデ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_030","plus":2}],"baseStats":{"hp":6260000,"atk":1440,"def":5850,"luk":0,"spd":196},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_022"}],"characterId":"char_leon_01","characterName":"レオン","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_004","plus":2}],"baseStats":{"hp":6260000,"atk":1600,"def":5850,"luk":0,"spd":196},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_023"}],"characterId":"char_maya_01","characterName":"マヤ","awakeningLevel":1}],"raidName":"ハイスピード・スターズ","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_SHIBUYA_V1","strategyVersion":"2026-09-14","strategyIdentity":"高速型"},"baseline":{"maxHp":31300000,"areaId":"SHIBUYA","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_056"},{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_033"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":6260000,"atk":1680,"def":6500,"luk":0,"spd":145},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_019"}],"characterId":"char_leo_01","characterName":"レオ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_033"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":6260000,"atk":1600,"def":6500,"luk":0,"spd":145},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_020"}],"characterId":"char_go_01","characterName":"ゴウ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_033"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":6260000,"atk":1520,"def":6500,"luk":0,"spd":145},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_011"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_021"}],"characterId":"char_kaede_01","characterName":"カエデ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_033"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":6260000,"atk":1440,"def":6500,"luk":0,"spd":145},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_022"}],"characterId":"char_leon_01","characterName":"レオン","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_033"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":6260000,"atk":1600,"def":6500,"luk":0,"spd":145},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_023"}],"characterId":"char_maya_01","characterName":"マヤ","awakeningLevel":1}],"raidName":"ハイスピード・スターズ","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_SHIBUYA_V1"}},{"raid_variant_id":"RAID_IKEBUKURO_V1","difficulty_id":"beginner","max_hp":215250,"profile":{"maxHp":215250,"areaId":"IKEBUKURO","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_006","plus":0}],"baseStats":{"hp":43050,"atk":104,"def":1208,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_shun_01","characterName":"シュン","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":43050,"atk":99,"def":1208,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_souta_01","characterName":"ソウタ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":43050,"atk":94,"def":1208,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_tatsuya_01","characterName":"タツヤ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":43050,"atk":89,"def":1208,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_chang_01","characterName":"チャン","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":43050,"atk":99,"def":1208,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_momoko_01","characterName":"モモコ","awakeningLevel":0}],"raidName":"アイアンウォール","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_IKEBUKURO_V1","strategyVersion":"2026-09-14","strategyIdentity":"鉄壁型"},"baseline":{"maxHp":210000,"areaId":"IKEBUKURO","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_006"}],"baseStats":{"hp":42000,"atk":105,"def":1150,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_shun_01","characterName":"シュン","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":42000,"atk":100,"def":1150,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_souta_01","characterName":"ソウタ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":42000,"atk":95,"def":1150,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_tatsuya_01","characterName":"タツヤ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":42000,"atk":90,"def":1150,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_chang_01","characterName":"チャン","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":42000,"atk":100,"def":1150,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_momoko_01","characterName":"モモコ","awakeningLevel":0}],"raidName":"アイアンウォール","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_IKEBUKURO_V1"}},{"raid_variant_id":"RAID_IKEBUKURO_V1","difficulty_id":"intermediate","max_hp":4200000,"profile":{"maxHp":4200000,"areaId":"IKEBUKURO","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_006","plus":0}],"baseStats":{"hp":840000,"atk":1433,"def":4428,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_kenji_01","characterName":"ケンジ","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_002","plus":0}],"baseStats":{"hp":840000,"atk":1365,"def":4428,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_aoi_01","characterName":"アオイ","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":840000,"atk":1297,"def":4428,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_002"}],"characterId":"char_daimon_01","characterName":"ダイモン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":840000,"atk":1229,"def":4428,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_003"}],"characterId":"char_jihoon_01","characterName":"ジフン","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":840000,"atk":1365,"def":4428,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_005"}],"characterId":"char_takeshi_01","characterName":"タケシ","awakeningLevel":0}],"raidName":"アイアンウォール","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_IKEBUKURO_V1","strategyVersion":"2026-09-14","strategyIdentity":"鉄壁型"},"baseline":{"maxHp":4000000,"areaId":"IKEBUKURO","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_014"}],"baseStats":{"hp":800000,"atk":1470,"def":4025,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_kenji_01","characterName":"ケンジ","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_014"}],"baseStats":{"hp":800000,"atk":1400,"def":4025,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_aoi_01","characterName":"アオイ","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_014"}],"baseStats":{"hp":800000,"atk":1330,"def":4025,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_002"}],"characterId":"char_daimon_01","characterName":"ダイモン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"},{"plus":0,"skillId":"SKILL_014"}],"baseStats":{"hp":800000,"atk":1260,"def":4025,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_003"}],"characterId":"char_jihoon_01","characterName":"ジフン","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_014"}],"baseStats":{"hp":800000,"atk":1400,"def":4025,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_005"}],"characterId":"char_takeshi_01","characterName":"タケシ","awakeningLevel":0}],"raidName":"アイアンウォール","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_IKEBUKURO_V1"}},{"raid_variant_id":"RAID_IKEBUKURO_V1","difficulty_id":"advanced","max_hp":12362500,"profile":{"maxHp":12362500,"areaId":"IKEBUKURO","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_006","plus":1},{"skillId":"SKILL_002","plus":1}],"baseStats":{"hp":2472500,"atk":1511,"def":6612,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_maya_01","characterName":"マヤ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_002","plus":1}],"baseStats":{"hp":2472500,"atk":1439,"def":6612,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_riki_01","characterName":"リキ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_006","plus":1}],"baseStats":{"hp":2472500,"atk":1367,"def":6612,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_008"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_rui_01","characterName":"ルイ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":2472500,"atk":1296,"def":6612,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_009"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_yuki_01","characterName":"ユウキ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":2472500,"atk":1439,"def":6612,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_011"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_joe_01","characterName":"ジョー","awakeningLevel":1}],"raidName":"アイアンウォール","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_IKEBUKURO_V1","strategyVersion":"2026-09-14","strategyIdentity":"鉄壁型"},"baseline":{"maxHp":11500000,"areaId":"IKEBUKURO","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_028"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":2300000,"atk":1570,"def":5750,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_maya_01","characterName":"マヤ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_028"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":2300000,"atk":1495,"def":5750,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_riki_01","characterName":"リキ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_028"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":2300000,"atk":1420,"def":5750,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_008"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_rui_01","characterName":"ルイ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_028"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":2300000,"atk":1346,"def":5750,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_009"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_yuki_01","characterName":"ユウキ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":2300000,"atk":1495,"def":5750,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_011"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_joe_01","characterName":"ジョー","awakeningLevel":1}],"raidName":"アイアンウォール","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_IKEBUKURO_V1"}},{"raid_variant_id":"RAID_IKEBUKURO_V1","difficulty_id":"expert","max_hp":34650000,"profile":{"maxHp":34650000,"areaId":"IKEBUKURO","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_006","plus":2},{"skillId":"SKILL_002","plus":2}],"baseStats":{"hp":6930000,"atk":1596,"def":8970,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_022"}],"characterId":"char_koharu_01","characterName":"コハル","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_002","plus":2}],"baseStats":{"hp":6930000,"atk":1520,"def":8970,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_023"}],"characterId":"char_karen_01","characterName":"カレン","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_006","plus":2}],"baseStats":{"hp":6930000,"atk":1444,"def":8970,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_014"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_024"}],"characterId":"char_kengo_01","characterName":"ケンゴ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_002","plus":2}],"baseStats":{"hp":6930000,"atk":1368,"def":8970,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_001"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_025"}],"characterId":"char_martina_01","characterName":"マルティナ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_006","plus":2}],"baseStats":{"hp":6930000,"atk":1520,"def":8970,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_002"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_026"}],"characterId":"char_noa_01","characterName":"ノア","awakeningLevel":1}],"raidName":"アイアンウォール","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_IKEBUKURO_V1","strategyVersion":"2026-09-14","strategyIdentity":"鉄壁型"},"baseline":{"maxHp":31500000,"areaId":"IKEBUKURO","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_028"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":6300000,"atk":1680,"def":7475,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_022"}],"characterId":"char_koharu_01","characterName":"コハル","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_028"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":6300000,"atk":1600,"def":7475,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_023"}],"characterId":"char_karen_01","characterName":"カレン","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_028"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":6300000,"atk":1520,"def":7475,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_014"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_024"}],"characterId":"char_kengo_01","characterName":"ケンゴ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_028"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":6300000,"atk":1440,"def":7475,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_001"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_025"}],"characterId":"char_martina_01","characterName":"マルティナ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":6300000,"atk":1600,"def":7475,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_002"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_026"}],"characterId":"char_noa_01","characterName":"ノア","awakeningLevel":1}],"raidName":"アイアンウォール","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_IKEBUKURO_V1"}},{"raid_variant_id":"RAID_ROPPONGI_V1","difficulty_id":"beginner","max_hp":190000,"profile":{"maxHp":190000,"areaId":"ROPPONGI","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":0}],"baseStats":{"hp":38000,"atk":104,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_tatsuya_01","characterName":"タツヤ","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":38000,"atk":99,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_yoshihiko_01","characterName":"ヨシヒコ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":38000,"atk":94,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_gou_01","characterName":"ダイスケ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":38000,"atk":89,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_kaito_01","characterName":"カイト","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":38000,"atk":99,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_makoto_01","characterName":"マコト","awakeningLevel":0}],"raidName":"ロイヤル・フラッシュ","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_ROPPONGI_V1","strategyVersion":"2026-09-14","strategyIdentity":"Skill型"},"baseline":{"maxHp":190000,"areaId":"ROPPONGI","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":38000,"atk":105,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_tatsuya_01","characterName":"タツヤ","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":38000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_yoshihiko_01","characterName":"ヨシヒコ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":38000,"atk":95,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_gou_01","characterName":"ダイスケ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":38000,"atk":90,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_kaito_01","characterName":"カイト","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":38000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_makoto_01","characterName":"マコト","awakeningLevel":0}],"raidName":"ロイヤル・フラッシュ","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_ROPPONGI_V1"}},{"raid_variant_id":"RAID_ROPPONGI_V1","difficulty_id":"intermediate","max_hp":2100000,"profile":{"maxHp":2100000,"areaId":"ROPPONGI","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":0}],"baseStats":{"hp":420000,"atk":1433,"def":3500,"luk":0,"spd":89},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_003"}],"characterId":"char_rin_01","characterName":"リン","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_015","plus":0}],"baseStats":{"hp":420000,"atk":1365,"def":3500,"luk":0,"spd":89},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_005"}],"characterId":"char_shion_01","characterName":"シオン","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":420000,"atk":1297,"def":3500,"luk":0,"spd":89},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_006"}],"characterId":"char_chang_01","characterName":"チャン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":420000,"atk":1229,"def":3500,"luk":0,"spd":89},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_007"}],"characterId":"char_naoto_01","characterName":"ナオト","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":420000,"atk":1365,"def":3500,"luk":0,"spd":89},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_008"}],"characterId":"char_cecile_01","characterName":"セシル","awakeningLevel":0}],"raidName":"ロイヤル・フラッシュ","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_ROPPONGI_V1","strategyVersion":"2026-09-14","strategyIdentity":"Skill型"},"baseline":{"maxHp":2100000,"areaId":"ROPPONGI","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_021"}],"baseStats":{"hp":420000,"atk":1470,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_003"}],"characterId":"char_rin_01","characterName":"リン","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_021"}],"baseStats":{"hp":420000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_005"}],"characterId":"char_shion_01","characterName":"シオン","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_021"}],"baseStats":{"hp":420000,"atk":1330,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_006"}],"characterId":"char_chang_01","characterName":"チャン","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"},{"plus":0,"skillId":"SKILL_021"}],"baseStats":{"hp":420000,"atk":1260,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_007"}],"characterId":"char_naoto_01","characterName":"ナオト","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_021"}],"baseStats":{"hp":420000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_008"}],"characterId":"char_cecile_01","characterName":"セシル","awakeningLevel":0}],"raidName":"ロイヤル・フラッシュ","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_ROPPONGI_V1"}},{"raid_variant_id":"RAID_ROPPONGI_V1","difficulty_id":"advanced","max_hp":13500000,"profile":{"maxHp":13500000,"areaId":"ROPPONGI","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":1},{"skillId":"SKILL_015","plus":1}],"baseStats":{"hp":2700000,"atk":1511,"def":5000,"luk":0,"spd":118},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_009"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_seiya_01","characterName":"セイヤ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_015","plus":1}],"baseStats":{"hp":2700000,"atk":1439,"def":5000,"luk":0,"spd":118},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_011"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_taiga_01","characterName":"タイガ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_009","plus":1}],"baseStats":{"hp":2700000,"atk":1367,"def":5000,"luk":0,"spd":118},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_012"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_sakura_01","characterName":"サクラ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":2700000,"atk":1296,"def":5000,"luk":0,"spd":118},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_013"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_aoi_01","characterName":"アオイ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":2700000,"atk":1439,"def":5000,"luk":0,"spd":118},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_014"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_daimon_01","characterName":"ダイモン","awakeningLevel":1}],"raidName":"ロイヤル・フラッシュ","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_ROPPONGI_V1","strategyVersion":"2026-09-14","strategyIdentity":"Skill型"},"baseline":{"maxHp":13500000,"areaId":"ROPPONGI","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_035"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":2700000,"atk":1570,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_009"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_seiya_01","characterName":"セイヤ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_035"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":2700000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_011"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_taiga_01","characterName":"タイガ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_035"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":2700000,"atk":1420,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_012"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_sakura_01","characterName":"サクラ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_035"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":2700000,"atk":1346,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_013"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_aoi_01","characterName":"アオイ","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_035"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":2700000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_014"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_daimon_01","characterName":"ダイモン","awakeningLevel":1}],"raidName":"ロイヤル・フラッシュ","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_ROPPONGI_V1"}},{"raid_variant_id":"RAID_ROPPONGI_V1","difficulty_id":"expert","max_hp":41800000,"profile":{"maxHp":41800000,"areaId":"ROPPONGI","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_059"},{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_009","plus":2},{"skillId":"SKILL_015","plus":2}],"baseStats":{"hp":8360000,"atk":1596,"def":6500,"luk":0,"spd":149},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_001"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_025"}],"characterId":"char_kaede_01","characterName":"カエデ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_015","plus":2}],"baseStats":{"hp":8360000,"atk":1520,"def":6500,"luk":0,"spd":149},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_002"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_026"}],"characterId":"char_miyabi_01","characterName":"ミヤビ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_009","plus":2}],"baseStats":{"hp":8360000,"atk":1444,"def":6500,"luk":0,"spd":149},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_003"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_001"}],"characterId":"char_ageha_01","characterName":"アゲハ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_015","plus":2}],"baseStats":{"hp":8360000,"atk":1368,"def":6500,"luk":0,"spd":149},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_005"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_002"}],"characterId":"char_reina_01","characterName":"レイナ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_009","plus":2}],"baseStats":{"hp":8360000,"atk":1520,"def":6500,"luk":0,"spd":149},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_006"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_003"}],"characterId":"char_sora_01","characterName":"ソラ","awakeningLevel":1}],"raidName":"ロイヤル・フラッシュ","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_ROPPONGI_V1","strategyVersion":"2026-09-14","strategyIdentity":"Skill型"},"baseline":{"maxHp":41800000,"areaId":"ROPPONGI","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_059"},{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_035"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":8360000,"atk":1680,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_001"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_025"}],"characterId":"char_kaede_01","characterName":"カエデ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_035"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":8360000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_002"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_026"}],"characterId":"char_miyabi_01","characterName":"ミヤビ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_035"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":8360000,"atk":1520,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_003"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_001"}],"characterId":"char_ageha_01","characterName":"アゲハ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_035"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":8360000,"atk":1440,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_005"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_002"}],"characterId":"char_reina_01","characterName":"レイナ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_035"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":8360000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_006"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_003"}],"characterId":"char_sora_01","characterName":"ソラ","awakeningLevel":1}],"raidName":"ロイヤル・フラッシュ","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_ROPPONGI_V1"}},{"raid_variant_id":"RAID_AKIHABARA_V1","difficulty_id":"beginner","max_hp":210000,"profile":{"maxHp":210000,"areaId":"AKIHABARA","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_018","plus":0}],"baseStats":{"hp":42000,"atk":102,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_masato_01","characterName":"マサト","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":42000,"atk":98,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_souta_01","characterName":"ソウタ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":42000,"atk":93,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_yoshihiko_01","characterName":"ヨシヒコ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":42000,"atk":88,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_aoi_01","characterName":"アオイ","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":42000,"atk":98,"def":1000,"luk":0,"spd":36},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_mei_01","characterName":"メイ","awakeningLevel":0}],"raidName":"グリッチ・コード","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_AKIHABARA_V1","strategyVersion":"2026-09-14","strategyIdentity":"妨害型"},"baseline":{"maxHp":210000,"areaId":"AKIHABARA","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_010"}],"baseStats":{"hp":42000,"atk":105,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_masato_01","characterName":"マサト","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":42000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_souta_01","characterName":"ソウタ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":42000,"atk":95,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_yoshihiko_01","characterName":"ヨシヒコ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":42000,"atk":90,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_aoi_01","characterName":"アオイ","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":42000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_mei_01","characterName":"メイ","awakeningLevel":0}],"raidName":"グリッチ・コード","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_AKIHABARA_V1"}},{"raid_variant_id":"RAID_AKIHABARA_V1","difficulty_id":"intermediate","max_hp":4300000,"profile":{"maxHp":4300000,"areaId":"AKIHABARA","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_018","plus":0}],"baseStats":{"hp":860000,"atk":1397,"def":3500,"luk":0,"spd":91},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_007"}],"characterId":"char_ren_01","characterName":"レン","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_030","plus":0}],"baseStats":{"hp":860000,"atk":1330,"def":3500,"luk":0,"spd":91},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_008"}],"characterId":"char_joe_01","characterName":"ジョー","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":860000,"atk":1264,"def":3500,"luk":0,"spd":91},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_009"}],"characterId":"char_kaito_01","characterName":"カイト","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":860000,"atk":1197,"def":3500,"luk":0,"spd":91},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_shun_01","characterName":"シュン","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":860000,"atk":1330,"def":3500,"luk":0,"spd":91},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_alice_01","characterName":"アリス","awakeningLevel":0}],"raidName":"グリッチ・コード","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_AKIHABARA_V1","strategyVersion":"2026-09-14","strategyIdentity":"妨害型"},"baseline":{"maxHp":4300000,"areaId":"AKIHABARA","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":860000,"atk":1470,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_007"}],"characterId":"char_ren_01","characterName":"レン","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":860000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_008"}],"characterId":"char_joe_01","characterName":"ジョー","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":860000,"atk":1330,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_009"}],"characterId":"char_kaito_01","characterName":"カイト","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":860000,"atk":1260,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_shun_01","characterName":"シュン","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":860000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_alice_01","characterName":"アリス","awakeningLevel":0}],"raidName":"グリッチ・コード","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_AKIHABARA_V1"}},{"raid_variant_id":"RAID_AKIHABARA_V1","difficulty_id":"advanced","max_hp":5700000,"profile":{"maxHp":5700000,"areaId":"AKIHABARA","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_018","plus":1},{"skillId":"SKILL_030","plus":1}],"baseStats":{"hp":1140000,"atk":1452,"def":5000,"luk":0,"spd":122},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_013"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_rui_01","characterName":"ルイ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_030","plus":1}],"baseStats":{"hp":1140000,"atk":1383,"def":5000,"luk":0,"spd":122},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_014"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_tetsu_01","characterName":"テツ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_070"},{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_018","plus":1}],"baseStats":{"hp":1140000,"atk":1314,"def":5000,"luk":0,"spd":122},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_001"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_cecile_01","characterName":"セシル","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":1140000,"atk":1245,"def":5000,"luk":0,"spd":122},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_chang_01","characterName":"チャン","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":1140000,"atk":1383,"def":5000,"luk":0,"spd":122},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_jihoon_01","characterName":"ジフン","awakeningLevel":1}],"raidName":"グリッチ・コード","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_AKIHABARA_V1","strategyVersion":"2026-09-14","strategyIdentity":"妨害型"},"baseline":{"maxHp":5700000,"areaId":"AKIHABARA","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_030"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":1140000,"atk":1570,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_013"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_rui_01","characterName":"ルイ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_030"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":1140000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_014"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_tetsu_01","characterName":"テツ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_070"},{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_030"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":1140000,"atk":1420,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_001"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_cecile_01","characterName":"セシル","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_030"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":1140000,"atk":1346,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_chang_01","characterName":"チャン","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_030"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":1140000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_jihoon_01","characterName":"ジフン","awakeningLevel":1}],"raidName":"グリッチ・コード","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_AKIHABARA_V1"}},{"raid_variant_id":"RAID_AKIHABARA_V1","difficulty_id":"expert","max_hp":15100000,"profile":{"maxHp":15100000,"areaId":"AKIHABARA","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_057"},{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_018","plus":2},{"skillId":"SKILL_030","plus":2}],"baseStats":{"hp":3020000,"atk":1512,"def":6500,"luk":0,"spd":155},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_005"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_002"}],"characterId":"char_karen_01","characterName":"カレン","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_030","plus":2}],"baseStats":{"hp":3020000,"atk":1440,"def":6500,"luk":0,"spd":155},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_006"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_003"}],"characterId":"char_miyabi_01","characterName":"ミヤビ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_018","plus":2}],"baseStats":{"hp":3020000,"atk":1368,"def":6500,"luk":0,"spd":155},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_007"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_004"}],"characterId":"char_go_01","characterName":"ゴウ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_030","plus":2}],"baseStats":{"hp":3020000,"atk":1296,"def":6500,"luk":0,"spd":155},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_005"}],"characterId":"char_seiya_01","characterName":"セイヤ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_018","plus":2}],"baseStats":{"hp":3020000,"atk":1440,"def":6500,"luk":0,"spd":155},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_006"}],"characterId":"char_taiga_01","characterName":"タイガ","awakeningLevel":1}],"raidName":"グリッチ・コード","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_AKIHABARA_V1","strategyVersion":"2026-09-14","strategyIdentity":"妨害型"},"baseline":{"maxHp":15100000,"areaId":"AKIHABARA","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_057"},{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_030"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":3020000,"atk":1680,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_005"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_002"}],"characterId":"char_karen_01","characterName":"カレン","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_030"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":3020000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_006"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_003"}],"characterId":"char_miyabi_01","characterName":"ミヤビ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_030"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":3020000,"atk":1520,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_007"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_004"}],"characterId":"char_go_01","characterName":"ゴウ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_030"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":3020000,"atk":1440,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_005"}],"characterId":"char_seiya_01","characterName":"セイヤ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_030"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":3020000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_006"}],"characterId":"char_taiga_01","characterName":"タイガ","awakeningLevel":1}],"raidName":"グリッチ・コード","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_AKIHABARA_V1"}},{"raid_variant_id":"RAID_KAWASAKI_V1","difficulty_id":"beginner","max_hp":171000,"profile":{"maxHp":171000,"areaId":"KAWASAKI","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_035","plus":0}],"baseStats":{"hp":34200,"atk":122,"def":950,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_daimon_01","characterName":"ダイモン","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":34200,"atk":116,"def":950,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_kenji_01","characterName":"ケンジ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":34200,"atk":110,"def":950,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_naoto_01","characterName":"ナオト","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":34200,"atk":104,"def":950,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_sawat_01","characterName":"サワット","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":34200,"atk":116,"def":950,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_joe_01","characterName":"ジョー","awakeningLevel":0}],"raidName":"ブレイクダウン","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_KAWASAKI_V1","strategyVersion":"2026-09-14","strategyIdentity":"超火力型"},"baseline":{"maxHp":180000,"areaId":"KAWASAKI","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":36000,"atk":116,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_daimon_01","characterName":"ダイモン","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":36000,"atk":110,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_kenji_01","characterName":"ケンジ","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":36000,"atk":105,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_naoto_01","characterName":"ナオト","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":36000,"atk":99,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_sawat_01","characterName":"サワット","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":36000,"atk":110,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_joe_01","characterName":"ジョー","awakeningLevel":0}],"raidName":"ブレイクダウン","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_KAWASAKI_V1"}},{"raid_variant_id":"RAID_KAWASAKI_V1","difficulty_id":"intermediate","max_hp":2160000,"profile":{"maxHp":2160000,"areaId":"KAWASAKI","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_035","plus":0}],"baseStats":{"hp":432000,"atk":1779,"def":3150,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_mark_01","characterName":"マーク","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_011","plus":0}],"baseStats":{"hp":432000,"atk":1694,"def":3150,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_makoto_01","characterName":"マコト","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":432000,"atk":1609,"def":3150,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_013"}],"characterId":"char_mei_01","characterName":"メイ","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":432000,"atk":1525,"def":3150,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_souta_01","characterName":"ソウタ","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":432000,"atk":1694,"def":3150,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_lucas_01","characterName":"ルーカス","awakeningLevel":0}],"raidName":"ブレイクダウン","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_KAWASAKI_V1","strategyVersion":"2026-09-14","strategyIdentity":"超火力型"},"baseline":{"maxHp":2400000,"areaId":"KAWASAKI","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":480000,"atk":1617,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_011"}],"characterId":"char_mark_01","characterName":"マーク","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":480000,"atk":1540,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_012"}],"characterId":"char_makoto_01","characterName":"マコト","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":480000,"atk":1463,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_013"}],"characterId":"char_mei_01","characterName":"メイ","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":480000,"atk":1386,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_souta_01","characterName":"ソウタ","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":480000,"atk":1540,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_lucas_01","characterName":"ルーカス","awakeningLevel":0}],"raidName":"ブレイクダウン","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_KAWASAKI_V1"}},{"raid_variant_id":"RAID_KAWASAKI_V1","difficulty_id":"advanced","max_hp":6545000,"profile":{"maxHp":6545000,"areaId":"KAWASAKI","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_035","plus":1},{"skillId":"SKILL_011","plus":1}],"baseStats":{"hp":1309000,"atk":1986,"def":4250,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_riki_01","characterName":"リキ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_061"},{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_011","plus":1}],"baseStats":{"hp":1309000,"atk":1892,"def":4250,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_tetsu_01","characterName":"テツ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_067"},{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_035","plus":1}],"baseStats":{"hp":1309000,"atk":1797,"def":4250,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_005"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_alice_01","characterName":"アリス","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":1309000,"atk":1702,"def":4250,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_kaito_01","characterName":"カイト","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":1309000,"atk":1892,"def":4250,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_minami_01","characterName":"ミナミ","awakeningLevel":1}],"raidName":"ブレイクダウン","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_KAWASAKI_V1","strategyVersion":"2026-09-14","strategyIdentity":"超火力型"},"baseline":{"maxHp":7700000,"areaId":"KAWASAKI","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_027"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":1540000,"atk":1727,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_002"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_riki_01","characterName":"リキ","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_061"},{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_027"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":1540000,"atk":1645,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_003"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_tetsu_01","characterName":"テツ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_067"},{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":1540000,"atk":1563,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_005"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_alice_01","characterName":"アリス","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_027"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":1540000,"atk":1480,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_kaito_01","characterName":"カイト","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_027"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":1540000,"atk":1645,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_minami_01","characterName":"ミナミ","awakeningLevel":1}],"raidName":"ブレイクダウン","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_KAWASAKI_V1"}},{"raid_variant_id":"RAID_KAWASAKI_V1","difficulty_id":"expert","max_hp":25440000,"profile":{"maxHp":25440000,"areaId":"KAWASAKI","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_035","plus":2},{"skillId":"SKILL_011","plus":2}],"baseStats":{"hp":5088000,"atk":2218,"def":5200,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_005"}],"characterId":"char_kengo_01","characterName":"ケンゴ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_011","plus":2}],"baseStats":{"hp":5088000,"atk":2112,"def":5200,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_006"}],"characterId":"char_koharu_01","characterName":"コハル","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_035","plus":2}],"baseStats":{"hp":5088000,"atk":2006,"def":5200,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_011"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_007"}],"characterId":"char_leo_01","characterName":"レオ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_011","plus":2}],"baseStats":{"hp":5088000,"atk":1901,"def":5200,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_008"}],"characterId":"char_takeshi_01","characterName":"タケシ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_035","plus":2}],"baseStats":{"hp":5088000,"atk":2112,"def":5200,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_009"}],"characterId":"char_takuro_01","characterName":"タクロウ","awakeningLevel":1}],"raidName":"ブレイクダウン","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_KAWASAKI_V1","strategyVersion":"2026-09-14","strategyIdentity":"超火力型"},"baseline":{"maxHp":31800000,"areaId":"KAWASAKI","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_027"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":6360000,"atk":1848,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_008"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_005"}],"characterId":"char_kengo_01","characterName":"ケンゴ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_027"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":6360000,"atk":1760,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_009"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_006"}],"characterId":"char_koharu_01","characterName":"コハル","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":6360000,"atk":1672,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_011"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_007"}],"characterId":"char_leo_01","characterName":"レオ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_027"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":6360000,"atk":1584,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_008"}],"characterId":"char_takeshi_01","characterName":"タケシ","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_027"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":6360000,"atk":1760,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_009"}],"characterId":"char_takuro_01","characterName":"タクロウ","awakeningLevel":1}],"raidName":"ブレイクダウン","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_KAWASAKI_V1"}},{"raid_variant_id":"RAID_YOKOHAMA_V1","difficulty_id":"beginner","max_hp":225500,"profile":{"maxHp":225500,"areaId":"YOKOHAMA","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_003","plus":0}],"baseStats":{"hp":45100,"atk":102,"def":1025,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_sawat_01","characterName":"サワット","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":45100,"atk":98,"def":1025,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_shun_01","characterName":"シュン","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":45100,"atk":93,"def":1025,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_tomoya_01","characterName":"トモヤ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":45100,"atk":88,"def":1025,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_yuji_01","characterName":"ユウジ","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":45100,"atk":98,"def":1025,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_mark_01","characterName":"マーク","awakeningLevel":0}],"raidName":"ブルー・レクイエム","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_YOKOHAMA_V1","strategyVersion":"2026-09-14","strategyIdentity":"持久型"},"baseline":{"maxHp":220000,"areaId":"YOKOHAMA","members":[{"slot":1,"level":5,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_006"}],"baseStats":{"hp":44000,"atk":105,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_sawat_01","characterName":"サワット","awakeningLevel":0},{"slot":2,"level":5,"skills":[{"plus":0,"skillId":"SKILL_008"}],"baseStats":{"hp":44000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_007"}],"characterId":"char_shun_01","characterName":"シュン","awakeningLevel":0},{"slot":3,"level":5,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":44000,"atk":95,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_001"}],"characterId":"char_tomoya_01","characterName":"トモヤ","awakeningLevel":0},{"slot":4,"level":5,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":44000,"atk":90,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_002"}],"characterId":"char_yuji_01","characterName":"ユウジ","awakeningLevel":0},{"slot":5,"level":5,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":44000,"atk":100,"def":1000,"luk":0,"spd":35},"equipment":[{"plus":0,"level":1,"equipmentId":"WEAPON_003"}],"characterId":"char_mark_01","characterName":"マーク","awakeningLevel":0}],"raidName":"ブルー・レクイエム","difficultyId":"beginner","minimumPower":null,"raidVariantId":"RAID_YOKOHAMA_V1"}},{"raid_variant_id":"RAID_YOKOHAMA_V1","difficulty_id":"intermediate","max_hp":4200000,"profile":{"maxHp":4200000,"areaId":"YOKOHAMA","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"skillId":"SKILL_003","plus":0}],"baseStats":{"hp":840000,"atk":1397,"def":3675,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_genji_01","characterName":"ゲンジ","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"skillId":"SKILL_006","plus":0}],"baseStats":{"hp":840000,"atk":1330,"def":3675,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_minami_01","characterName":"ミナミ","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"}],"baseStats":{"hp":840000,"atk":1264,"def":3675,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_002"}],"characterId":"char_momoko_01","characterName":"モモコ","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"}],"baseStats":{"hp":840000,"atk":1197,"def":3675,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_003"}],"characterId":"char_ren_male_01","characterName":"カズヤ","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"}],"baseStats":{"hp":840000,"atk":1330,"def":3675,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_005"}],"characterId":"char_tatsuya_01","characterName":"タツヤ","awakeningLevel":0}],"raidName":"ブルー・レクイエム","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_YOKOHAMA_V1","strategyVersion":"2026-09-14","strategyIdentity":"持久型"},"baseline":{"maxHp":4000000,"areaId":"YOKOHAMA","members":[{"slot":1,"level":25,"skills":[{"plus":0,"skillId":"SKILL_001"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":800000,"atk":1470,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_014"}],"characterId":"char_genji_01","characterName":"ゲンジ","awakeningLevel":0},{"slot":2,"level":25,"skills":[{"plus":0,"skillId":"SKILL_008"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":800000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_001"},{"plus":0,"level":10,"equipmentId":"BODY_001"}],"characterId":"char_minami_01","characterName":"ミナミ","awakeningLevel":0},{"slot":3,"level":25,"skills":[{"plus":0,"skillId":"SKILL_011"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":800000,"atk":1330,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_002"},{"plus":0,"level":10,"equipmentId":"BODY_002"}],"characterId":"char_momoko_01","characterName":"モモコ","awakeningLevel":0},{"slot":4,"level":25,"skills":[{"plus":0,"skillId":"SKILL_019"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":800000,"atk":1260,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_003"},{"plus":0,"level":10,"equipmentId":"BODY_003"}],"characterId":"char_ren_male_01","characterName":"カズヤ","awakeningLevel":0},{"slot":5,"level":25,"skills":[{"plus":0,"skillId":"SKILL_012"},{"plus":0,"skillId":"SKILL_015"}],"baseStats":{"hp":800000,"atk":1400,"def":3500,"luk":0,"spd":85},"equipment":[{"plus":0,"level":10,"equipmentId":"WEAPON_007"},{"plus":0,"level":10,"equipmentId":"BODY_005"}],"characterId":"char_tatsuya_01","characterName":"タツヤ","awakeningLevel":0}],"raidName":"ブルー・レクイエム","difficultyId":"intermediate","minimumPower":160000,"raidVariantId":"RAID_YOKOHAMA_V1"}},{"raid_variant_id":"RAID_YOKOHAMA_V1","difficulty_id":"advanced","max_hp":10642500,"profile":{"maxHp":10642500,"areaId":"YOKOHAMA","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"skillId":"SKILL_029","plus":1}],"baseStats":{"hp":2128500,"atk":1452,"def":5375,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_long_01","characterName":"ロン","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"skillId":"SKILL_006","plus":1}],"baseStats":{"hp":2128500,"atk":1383,"def":5375,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_sakura_01","characterName":"サクラ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"skillId":"SKILL_006","plus":1}],"baseStats":{"hp":2128500,"atk":1314,"def":5375,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_008"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_kageyama_01","characterName":"カゲヤマ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"}],"baseStats":{"hp":2128500,"atk":1245,"def":5375,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_009"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_makoto_01","characterName":"マコト","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"}],"baseStats":{"hp":2128500,"atk":1383,"def":5375,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_011"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_mei_01","characterName":"メイ","awakeningLevel":1}],"raidName":"ブルー・レクイエム","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_YOKOHAMA_V1","strategyVersion":"2026-09-14","strategyIdentity":"持久型"},"baseline":{"maxHp":9900000,"areaId":"YOKOHAMA","members":[{"slot":1,"level":35,"skills":[{"plus":1,"skillId":"SKILL_001"},{"plus":1,"skillId":"SKILL_032"},{"plus":1,"skillId":"SKILL_028"}],"baseStats":{"hp":1980000,"atk":1570,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_006"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_long_01","characterName":"ロン","awakeningLevel":1},{"slot":2,"level":35,"skills":[{"plus":1,"skillId":"SKILL_008"},{"plus":1,"skillId":"SKILL_032"},{"plus":1,"skillId":"SKILL_027"}],"baseStats":{"hp":1980000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_002"},{"plus":1,"level":15,"equipmentId":"BODY_007"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_sakura_01","characterName":"サクラ","awakeningLevel":1},{"slot":3,"level":35,"skills":[{"plus":1,"skillId":"SKILL_011"},{"plus":1,"skillId":"SKILL_032"}],"baseStats":{"hp":1980000,"atk":1420,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_003"},{"plus":1,"level":15,"equipmentId":"BODY_008"},{"plus":1,"level":15,"equipmentId":"HEAD_001"}],"characterId":"char_kageyama_01","characterName":"カゲヤマ","awakeningLevel":1},{"slot":4,"level":35,"skills":[{"plus":1,"skillId":"SKILL_019"},{"plus":1,"skillId":"SKILL_032"},{"plus":1,"skillId":"SKILL_034"}],"baseStats":{"hp":1980000,"atk":1346,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_007"},{"plus":1,"level":15,"equipmentId":"BODY_009"},{"plus":1,"level":15,"equipmentId":"HEAD_004"}],"characterId":"char_makoto_01","characterName":"マコト","awakeningLevel":1},{"slot":5,"level":35,"skills":[{"plus":1,"skillId":"SKILL_012"},{"plus":1,"skillId":"SKILL_032"},{"plus":1,"skillId":"SKILL_021"}],"baseStats":{"hp":1980000,"atk":1495,"def":5000,"luk":0,"spd":110},"equipment":[{"plus":1,"level":15,"equipmentId":"WEAPON_001"},{"plus":1,"level":15,"equipmentId":"BODY_011"},{"plus":1,"level":15,"equipmentId":"HEAD_008"}],"characterId":"char_mei_01","characterName":"メイ","awakeningLevel":1}],"raidName":"ブルー・レクイエム","difficultyId":"advanced","minimumPower":200000,"raidVariantId":"RAID_YOKOHAMA_V1"}},{"raid_variant_id":"RAID_YOKOHAMA_V1","difficulty_id":"expert","max_hp":34650000,"profile":{"maxHp":34650000,"areaId":"YOKOHAMA","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"skillId":"SKILL_029","plus":2}],"baseStats":{"hp":6930000,"atk":1512,"def":7150,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_008"}],"characterId":"char_mio_01","characterName":"ミオ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"skillId":"SKILL_006","plus":2}],"baseStats":{"hp":6930000,"atk":1440,"def":7150,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_009"}],"characterId":"char_reiji_01","characterName":"レイジ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"skillId":"SKILL_006","plus":2}],"baseStats":{"hp":6930000,"atk":1368,"def":7150,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_014"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_010"}],"characterId":"char_ageha_01","characterName":"アゲハ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"skillId":"SKILL_006","plus":2}],"baseStats":{"hp":6930000,"atk":1296,"def":7150,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_001"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_011"}],"characterId":"char_alice_01","characterName":"アリス","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"skillId":"SKILL_006","plus":2}],"baseStats":{"hp":6930000,"atk":1440,"def":7150,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_002"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_012"}],"characterId":"char_cecile_01","characterName":"セシル","awakeningLevel":1}],"raidName":"ブルー・レクイエム","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_YOKOHAMA_V1","strategyVersion":"2026-09-14","strategyIdentity":"持久型"},"baseline":{"maxHp":31500000,"areaId":"YOKOHAMA","members":[{"slot":1,"level":45,"skills":[{"plus":2,"skillId":"SKILL_001"},{"plus":2,"skillId":"SKILL_032"},{"plus":2,"skillId":"SKILL_028"}],"baseStats":{"hp":6300000,"atk":1680,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_012"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_008"}],"characterId":"char_mio_01","characterName":"ミオ","awakeningLevel":1},{"slot":2,"level":45,"skills":[{"plus":2,"skillId":"SKILL_008"},{"plus":2,"skillId":"SKILL_032"},{"plus":2,"skillId":"SKILL_027"}],"baseStats":{"hp":6300000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_003"},{"plus":2,"level":20,"equipmentId":"BODY_013"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_009"}],"characterId":"char_reiji_01","characterName":"レイジ","awakeningLevel":1},{"slot":3,"level":45,"skills":[{"plus":2,"skillId":"SKILL_011"},{"plus":2,"skillId":"SKILL_032"}],"baseStats":{"hp":6300000,"atk":1520,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_007"},{"plus":2,"level":20,"equipmentId":"BODY_014"},{"plus":2,"level":20,"equipmentId":"HEAD_008"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_010"}],"characterId":"char_ageha_01","characterName":"アゲハ","awakeningLevel":1},{"slot":4,"level":45,"skills":[{"plus":2,"skillId":"SKILL_019"},{"plus":2,"skillId":"SKILL_032"},{"plus":2,"skillId":"SKILL_034"}],"baseStats":{"hp":6300000,"atk":1440,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_001"},{"plus":2,"level":20,"equipmentId":"BODY_001"},{"plus":2,"level":20,"equipmentId":"HEAD_001"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_011"}],"characterId":"char_alice_01","characterName":"アリス","awakeningLevel":1},{"slot":5,"level":45,"skills":[{"plus":2,"skillId":"SKILL_012"},{"plus":2,"skillId":"SKILL_032"},{"plus":2,"skillId":"SKILL_021"}],"baseStats":{"hp":6300000,"atk":1600,"def":6500,"luk":0,"spd":135},"equipment":[{"plus":2,"level":20,"equipmentId":"WEAPON_002"},{"plus":2,"level":20,"equipmentId":"BODY_002"},{"plus":2,"level":20,"equipmentId":"HEAD_004"},{"plus":2,"level":20,"equipmentId":"ACCESSORY_012"}],"characterId":"char_cecile_01","characterName":"セシル","awakeningLevel":1}],"raidName":"ブルー・レクイエム","difficultyId":"expert","minimumPower":240000,"raidVariantId":"RAID_YOKOHAMA_V1"}}]$profiles$::jsonb) loop
  select profile into strict current_profile from public.raid_room_combat_profiles where raid_variant_id=r->>'raid_variant_id' and difficulty_id=r->>'difficulty_id' for update;
  if current_profile is distinct from r->'baseline' then raise exception 'raid profile baseline drift: % / %',r->>'raid_variant_id',r->>'difficulty_id';end if;
  for e in select value from jsonb_array_elements(r->'profile'->'members') loop
   for s in select value from jsonb_array_elements(e->'skills') loop
    select exclusive_character_id into canonical_owner from public.canonical_skill_master where version='2026-08-21' and skill_id=s->>'skillId';
    if not found then raise exception 'unknown strategy skill';end if;
    if canonical_owner is not null and canonical_owner<>e->>'characterId' then raise exception 'invalid exclusive strategy skill';end if;
   end loop;
  end loop;
  perform public._raid_room_launch_enemy_snapshot_v1(r->'profile','00000000-0000-0000-0000-000000000001'::uuid,(r->>'max_hp')::bigint);
  update public.raid_room_combat_profiles set profile=r->'profile',max_hp=(r->>'max_hp')::bigint where raid_variant_id=r->>'raid_variant_id' and difficulty_id=r->>'difficulty_id';
  updated_count:=updated_count+1;
 end loop;
 if updated_count<>28 then raise exception 'incomplete strategy profiles';end if;
end $profile_update$;
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
 'strategyVersion',case when (select count(*) from public.raid_room_combat_profiles p where p.difficulty_id=r.difficulty and p.profile->>'strategyVersion'='2026-09-14')=7 then '2026-09-14' else null end,
 'instanceItems',(select jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty),
 'daily',jsonb_build_object('chanceBp',d.chance_bp,'items',d.items)
 ) order by r.difficulty) from public.raid_room_clear_reward_rules r join public.raid_daily_clear_bonus_rules d using(difficulty));
end $function$
;
notify pgrst,'reload schema';

-- SECTION 29 supabase/migrations/20260914234114_quest_raid_approved_reward_identity.sql
-- User approved all three review proposals. Preview only; do not apply to Production.
-- Prior five migrations are prerequisites, never replayed here.
do $$ begin
 if (select count(*) from public.raid_room_combat_profiles)<>28 or
 (select md5(string_agg(raid_variant_id||':'||difficulty_id||':'||max_hp::text||':'||profile::text,E'\n' order by raid_variant_id,difficulty_id)) from public.raid_room_combat_profiles) is distinct from '84b42e460278f17ac79692fe20e4eed3'
 then raise exception 'Approved raid strategy profile content drift'; end if;
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
-- Production adaptation: use each pending patrol's pre-migration master cash.
-- Preview calendar cutoff is not a valid Production cutover boundary.
update public.user_patrols p set base_cash_snapshot=b.cash_reward
from release_pending_patrol_cash_before b where p.id=b.patrol_id;
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

-- SECTION 30 supabase/migrations/20260915000741_monthly_power_rollover_definition.sql

set local lock_timeout='3s';
do $guard$
begin
 if md5(pg_get_functiondef('public.finalize_due_monthly_power_seasons_v1()'::regprocedure))<>'f1a7b786e85afc53bdd6d6d4022d7ec2' then
  raise exception 'Monthly runner definition drift';end if;
 if to_regprocedure('public.start_formal_open_seasons_v1(timestamptz)') is null then
  raise exception 'Formal Open authority required';end if;
end $guard$;
create function public.advance_monthly_power_seasons_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.ranking_seasons%rowtype; g public.ranking_seasons%rowtype;
 pr public.monthly_power_season_runs%rowtype; gr public.monthly_power_season_runs%rowtype;
 v_now timestamptz:=clock_timestamp(); v_start timestamptz;v_end timestamptz;
 pid uuid;gid uuid;closure jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('monthly-power:rollover',0));
 lock table public.ranking_seasons in share row exclusive mode;
 -- Never bootstrap Formal Open or adopt unregistered historic/Preopen Seasons.
 select s.* into p from public.ranking_seasons s join public.monthly_power_season_runs r on r.season_id=s.id
 where s.ranking_type='POWER' order by s.starts_at desc limit 1;
 select s.* into g from public.ranking_seasons s join public.monthly_power_season_runs r on r.season_id=s.id
 where s.ranking_type='GUILD_POWER' order by s.starts_at desc limit 1;
 if p.id is null and g.id is null then return jsonb_build_object('status','NOT_STARTED');end if;
 if p.id is null or g.id is null or p.starts_at<>g.starts_at or p.ends_at<>g.ends_at then
  raise exception 'Monthly category boundary mismatch';end if;
 select * into strict pr from public.monthly_power_season_runs where season_id=p.id;
 select * into strict gr from public.monthly_power_season_runs where season_id=g.id;
 if pr.reward_version<>gr.reward_version or pr.eligibility_policy is distinct from gr.eligibility_policy
   or gr.eligibility_policy is distinct from 'CONTINUOUS_JST_DAY1' then
  raise exception 'Monthly category registration mismatch';end if;
 if p.ends_at>v_now then
  if p.status<>'ACTIVE' or g.status<>'ACTIVE' then raise exception 'Current monthly Season requires review';end if;
  return jsonb_build_object('status','ACTIVE','POWER',p.id,'GUILD_POWER',g.id);
 end if;
 -- Reuse only server-side JST calendar bounds, never PVP advance/reward/reset.
 select b.starts_at,b.ends_at into v_start,v_end from public.ranking_period_bounds('PVP',v_now) b;
 if p.ends_at<>v_start then
  raise exception 'Missed monthly boundary requires historical review';end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in('POWER','GUILD_POWER')
   and id not in(p.id,g.id) and (status<>'CLOSED' or starts_at>=v_start)) then
  raise exception 'Conflicting monthly Season state';end if;
 if p.status not in('ACTIVE','FINALIZING','CLOSED') or g.status not in('ACTIVE','FINALIZING','CLOSED')
 or (p.status='CLOSED' and pr.granted_at is null) or (g.status='CLOSED' and gr.granted_at is null) then
  raise exception 'Prior monthly finalization evidence required';end if;
 closure:=public.finalize_due_monthly_power_seasons_v1();
 if exists(select 1 from public.ranking_seasons s join public.monthly_power_season_runs r on r.season_id=s.id
  where s.id in(p.id,g.id) and (s.status<>'CLOSED' or r.granted_at is null)) then
  raise exception 'Prior monthly finalization incomplete';end if;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('POWER',v_start,v_end,'ACTIVE') returning id into pid;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('GUILD_POWER',v_start,v_end,'ACTIVE') returning id into gid;
 insert into public.monthly_power_season_runs(season_id,reward_version,eligibility_policy)
 values(pid,pr.reward_version,pr.eligibility_policy),(gid,gr.reward_version,gr.eligibility_policy);
 return jsonb_build_object('status','STARTED','POWER',pid,'GUILD_POWER',gid,'starts_at',v_start,'ends_at',v_end,'closed',closure);
end $$;
revoke all on function public.advance_monthly_power_seasons_v1() from public,anon,authenticated;
grant execute on function public.advance_monthly_power_seasons_v1() to service_role;
notify pgrst,'reload schema';

-- SECTION 31 supabase/migrations/20260915053404_canonical_exclusive_loadout_and_guide_skills.sql


create or replace function public.set_character_equipment(
  p_character_id uuid,
  p_equipment_id uuid,
  p_slot_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_character_master_id text;
  v_equipment_master public.canonical_equipment_master%rowtype;
  v_expected_slot_type text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select character_id into v_character_master_id
  from public.user_characters
  where id = p_character_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'owned character not found' using errcode = 'P0002';
  end if;

  v_expected_slot_type := case p_slot_index
    when 0 then 'WEAPON' when 1 then 'WEAPON'
    when 2 then 'HEAD' when 3 then 'BODY' when 4 then 'LEGS'
    when 5 then 'ACCESSORY' when 6 then 'ACCESSORY'
    else null
  end;
  if v_expected_slot_type is null then
    raise exception 'invalid equipment slot' using errcode = '22023';
  end if;

  select master.* into v_equipment_master
  from public.user_equipments owned
  join public.canonical_equipment_master master
    on master.version = '2026-08-21' and master.equipment_id = coalesce(nullif(owned.equipment_id, ''), owned.equipment_master_id)
  where owned.id = p_equipment_id and owned.user_id = v_user_id
  for update of owned;
  if not found then
    raise exception 'owned equipment not found' using errcode = 'P0002';
  end if;
  if v_equipment_master.category <> v_expected_slot_type then
    raise exception 'equipment type does not match slot' using errcode = '23514';
  end if;
  if v_equipment_master.exclusive_character_id is not null
     and v_equipment_master.exclusive_character_id is distinct from v_character_master_id then
    raise exception 'exclusive equipment cannot be equipped by this character' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_equipments
    where id = p_equipment_id and equipped_character_id is not null
      and equipped_character_id <> p_character_id::text
  ) then
    raise exception 'equipment is already equipped by another character' using errcode = '23505';
  end if;

  update public.user_equipments
  set equipped_character_id = null, slot_index = null
  where user_id = v_user_id
    and equipped_character_id = p_character_id::text
    and slot_index = p_slot_index
    and id <> p_equipment_id;

  update public.user_equipments
  set equipped_character_id = p_character_id::text, slot_index = p_slot_index
  where id = p_equipment_id and user_id = v_user_id;

  return jsonb_build_object('status', 'success', 'equipment_id', p_equipment_id, 'slot_index', p_slot_index);
end;
$$;

create or replace function public.set_character_equipment_bulk(
  p_character_id uuid,
  p_equipment_ids uuid[],
  p_slot_indexes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_character_master_id text;
  v_requested_count integer := coalesce(array_length(p_equipment_ids, 1), 0);
  v_index integer;
  v_equipment_id uuid;
  v_slot_index integer;
  v_expected_slot_type text;
  v_equipment_master public.canonical_equipment_master%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_requested_count <> coalesce(array_length(p_slot_indexes, 1), 0) or v_requested_count > 7 then
    raise exception 'equipment and slot arrays must have the same length up to 7' using errcode = '22023';
  end if;
  if v_requested_count <> (select count(distinct value) from unnest(coalesce(p_equipment_ids, '{}'::uuid[])) value)
     or v_requested_count <> (select count(distinct value) from unnest(coalesce(p_slot_indexes, '{}'::integer[])) value) then
    raise exception 'duplicate equipment or slot' using errcode = '23505';
  end if;

  select character_id into v_character_master_id
  from public.user_characters
  where id = p_character_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'owned character not found' using errcode = 'P0002';
  end if;

  for v_index in 1..v_requested_count loop
    v_equipment_id := p_equipment_ids[v_index];
    v_slot_index := p_slot_indexes[v_index];
    v_expected_slot_type := case v_slot_index
      when 0 then 'WEAPON' when 1 then 'WEAPON'
      when 2 then 'HEAD' when 3 then 'BODY' when 4 then 'LEGS'
      when 5 then 'ACCESSORY' when 6 then 'ACCESSORY'
      else null
    end;
    if v_expected_slot_type is null then
      raise exception 'invalid equipment slot' using errcode = '22023';
    end if;
    select master.* into v_equipment_master
    from public.user_equipments owned
    join public.canonical_equipment_master master
      on master.version = '2026-08-21' and master.equipment_id = coalesce(nullif(owned.equipment_id, ''), owned.equipment_master_id)
    where owned.id = v_equipment_id and owned.user_id = v_user_id
    for update of owned;
    if not found then
      raise exception 'owned equipment not found' using errcode = 'P0002';
    end if;
    if v_equipment_master.category <> v_expected_slot_type then
      raise exception 'equipment type does not match slot' using errcode = '23514';
    end if;
    if v_equipment_master.exclusive_character_id is not null
       and v_equipment_master.exclusive_character_id is distinct from v_character_master_id then
      raise exception 'exclusive equipment cannot be equipped by this character' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.user_equipments
      where id = v_equipment_id and equipped_character_id is not null
        and equipped_character_id <> p_character_id::text
    ) then
      raise exception 'equipment is already equipped by another character' using errcode = '23505';
    end if;
  end loop;

  update public.user_equipments
  set equipped_character_id = null, slot_index = null
  where user_id = v_user_id and equipped_character_id = p_character_id::text;

  for v_index in 1..v_requested_count loop
    update public.user_equipments
    set equipped_character_id = p_character_id::text, slot_index = p_slot_indexes[v_index]
    where id = p_equipment_ids[v_index] and user_id = v_user_id;
  end loop;

  return jsonb_build_object('status', 'success', 'equipped_count', v_requested_count);
end;
$$;

create or replace function private.apply_recommended_main_equipment_v1(p_user_id uuid)
returns integer language plpgsql security definer set search_path=public,private as $$
declare v_member record; v_slot integer; v_equipment_id uuid; v_count integer:=0;
begin
  perform 1 from public.user_main_formations where user_id=p_user_id order by slot for update;
  perform 1 from public.user_equipments where user_id=p_user_id for update;
  update public.user_equipments set equipped_character_id=null,slot_index=null
  where user_id=p_user_id and equipped_character_id in (
    select user_character_id::text from public.user_main_formations where user_id=p_user_id
  );
  for v_slot in 0..6 loop
    for v_member in
      select formation.slot,owned.id,owned.character_id
      from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
      where formation.user_id=p_user_id
      order by case when mod(v_slot,2)=0 then formation.slot else 6-formation.slot end
    loop
      select candidate.id into v_equipment_id
      from public.user_equipments candidate join public.canonical_equipment_master master
        on master.version='2026-08-21' and master.equipment_id=coalesce(nullif(candidate.equipment_id,''),candidate.equipment_master_id)
      where candidate.user_id=p_user_id and candidate.equipped_character_id is null
        and master.category=case v_slot when 0 then 'WEAPON' when 1 then 'WEAPON' when 2 then 'HEAD' when 3 then 'BODY' when 4 then 'LEGS' else 'ACCESSORY' end
        and (master.exclusive_character_id is null or master.exclusive_character_id=v_member.character_id)
      order by (master.exclusive_character_id=v_member.character_id) desc nulls last,
        (public.canonical_equipment_flat_stat((master.base_stats->>'hp')::integer,coalesce(candidate.level,1),coalesce(candidate.plus_val,0))
        +public.canonical_equipment_flat_stat((master.base_stats->>'atk')::integer,coalesce(candidate.level,1),coalesce(candidate.plus_val,0))
        +public.canonical_equipment_flat_stat((master.base_stats->>'def')::integer,coalesce(candidate.level,1),coalesce(candidate.plus_val,0))) desc,
        coalesce(candidate.level,1) desc,coalesce(candidate.plus_val,0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.equipment_id,candidate.id limit 1;
      if v_equipment_id is not null then
        update public.user_equipments set equipped_character_id=v_member.id::text,slot_index=v_slot where id=v_equipment_id;
        v_count:=v_count+1;
      end if;
      v_equipment_id:=null;
    end loop;
  end loop;
  return v_count;
end;
$$;

create or replace function private.apply_recommended_main_skills_v1(p_user_id uuid)
returns integer language plpgsql security definer set search_path=public,private as $$
declare v_member record; v_round integer; v_skill_id uuid; v_skill_count integer:=0;
begin
  perform 1 from public.user_main_formations where user_id=p_user_id order by slot for update;
  perform 1 from public.user_skills where user_id=p_user_id for update;
  update public.user_skills set equipped_character_id=null,slot_index=null
  where user_id=p_user_id and equipped_character_id in (
    select user_character_id::text from public.user_main_formations where user_id=p_user_id
  );
  for v_round in 0..5 loop
    for v_member in
      select formation.slot,owned.id,owned.character_id,owned.awakening_level
      from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
      where formation.user_id=p_user_id order by formation.slot
    loop
      if v_round>=public.canonical_skill_slot_count(v_member.awakening_level) then continue; end if;
      select candidate.id into v_skill_id
      from public.user_skills candidate join public.canonical_skill_master master
        on master.version='2026-08-21' and master.skill_id=candidate.skill_card_id
      where candidate.user_id=p_user_id and candidate.equipped_character_id is null
        and (master.exclusive_character_id is null or master.exclusive_character_id=v_member.character_id)
        and (master.exclusive_character_id is null or not exists(
          select 1 from public.user_skills equipped join public.canonical_skill_master equipped_master
            on equipped_master.version='2026-08-21' and equipped_master.skill_id=equipped.skill_card_id
          where equipped.user_id=p_user_id and equipped.equipped_character_id=v_member.id::text
            and equipped_master.exclusive_character_id is not null))
      order by (master.exclusive_character_id=v_member.character_id) desc nulls last,coalesce(candidate.plus_val,0) desc,
        case master.rarity when 'SSR' then 4 when 'SR' then 3 when 'R' then 2 else 1 end desc,
        master.skill_id,candidate.id limit 1;
      if v_skill_id is not null then
        update public.user_skills set equipped_character_id=v_member.id::text,slot_index=v_round where id=v_skill_id;
        v_skill_count:=v_skill_count+1;
      end if;
      v_skill_id:=null;
    end loop;
  end loop;
  return v_skill_count;
end;
$$;

revoke all on function private.apply_recommended_main_skills_v1(uuid) from public,anon,authenticated;

create or replace function public.apply_recommended_main_loadout()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_party_count integer; v_member record; v_round integer;
  v_skill_id uuid; v_skill_count integer:=0; v_equipment_count integer:=0;
  v_total_power bigint; v_results jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  select count(*) into v_party_count from public.user_main_formations where user_id=v_user_id;
  if v_party_count<>5 then raise exception 'Main Formation must contain five Characters' using errcode='23514'; end if;
  v_skill_count:=private.apply_recommended_main_skills_v1(v_user_id);
  v_equipment_count:=private.apply_recommended_main_equipment_v1(v_user_id);
  if v_skill_count=0 or v_equipment_count=0 then
    raise exception 'Main Formation requires at least one Skill and one Equipment' using errcode='23514';
  end if;
  perform public.record_post_tutorial_guide_milestone(v_user_id,'first_main_loadout',jsonb_build_object('skillCount',v_skill_count,'equipmentCount',v_equipment_count));
  v_total_power:=public.refresh_user_power_projection(v_user_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'characterId',owned.character_id,'userCharacterId',owned.id,
    'skillCount',(select count(*) from public.user_skills skill where skill.user_id=v_user_id and skill.equipped_character_id=owned.id::text),
    'equipmentCount',(select count(*) from public.user_equipments equipment where equipment.user_id=v_user_id and equipment.equipped_character_id=owned.id::text)
  ) order by formation.slot),'[]'::jsonb) into v_results
  from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
  where formation.user_id=v_user_id;
  return jsonb_build_object('status','success','skillCount',v_skill_count,'equipmentCount',v_equipment_count,
    'totalPower',v_total_power,'characters',v_results);
end;
$$;

create or replace function public.complete_character_setup_dialog(p_action text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare
  v_user_id uuid:=auth.uid(); v_action text:=upper(coalesce(p_action,'')); v_before bigint;
  v_after bigint; v_formation jsonb; v_equipment_count integer:=0; v_skill_count integer:=0; v_existing jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  if v_action not in ('AUTO_SETUP','LATER') then raise exception 'invalid dialog action' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  if not exists(select 1 from public.user_funnel_milestones where user_id=v_user_id and milestone='character_setup_dialog_eligible') then
    raise exception 'character setup dialog is unavailable' using errcode='42501';
  end if;
  select metadata into v_existing from public.user_funnel_milestones
  where user_id=v_user_id and milestone='character_setup_dialog_consumed';
  if v_existing is not null then return jsonb_build_object('status','already_consumed','result',v_existing); end if;
  v_before:=public.refresh_user_power_projection(v_user_id);
  if v_action='AUTO_SETUP' then
    v_formation:=public.save_recommended_main_formation();
    v_skill_count:=private.apply_recommended_main_skills_v1(v_user_id);
    v_equipment_count:=private.apply_recommended_main_equipment_v1(v_user_id);
    v_after:=public.refresh_user_power_projection(v_user_id);
    perform public.record_post_tutorial_guide_milestone(v_user_id,'first_main_loadout',
      jsonb_build_object('source','character_setup_dialog','skillCount',v_skill_count,'equipmentCount',v_equipment_count));
  else
    v_after:=v_before;
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user_id,'character_setup_dialog_consumed',jsonb_build_object(
    'action',lower(v_action),'powerBefore',v_before,'powerAfter',v_after,
    'skillCount',v_skill_count,'equipmentCount',v_equipment_count,'partyCount',coalesce(jsonb_array_length(v_formation->'character_ids'),0)
  )) on conflict(user_id,milestone) do nothing;
  return jsonb_build_object('status','success','action',lower(v_action),'powerBefore',v_before,'powerAfter',v_after,
    'skillCount',v_skill_count,'equipmentCount',v_equipment_count,'partyCount',coalesce(jsonb_array_length(v_formation->'character_ids'),0),
    'formation',v_formation);
end;
$$;

-- SECTION 32 supabase/migrations/20260915090229_quest_victory_reward_authority.sql
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
 select patrol.*,quest.display_name,quest.difficulty,quest.user_exp,quest.reward_pool_id,patrol.base_cash_snapshot as cash_reward
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
 -- A resolved defeat releases the dispatch slot without awarding a clear.
 if v_patrol.has_battle_event and v_patrol.battle_result is distinct from 'VICTORY' then
   if v_patrol.battle_result is distinct from 'DEFEAT' then
     raise exception 'patrol battle outcome unavailable' using errcode='23514';
   end if;
   update public.user_patrols
   set status='COMPLETED', rewards_accrued=jsonb_build_object(
     'course_name',v_patrol.display_name,'outcome','DEFEAT',
     'cash',0,'xp',0,'items','[]'::jsonb,'first_clear',false)
   where id=p_patrol_id;
   return jsonb_build_object('status','success','patrol_id',p_patrol_id,
     'course_name',v_patrol.display_name,'outcome','DEFEAT',
     'cash',0,'xp',0,'items','[]'::jsonb,'first_clear',false);
 end if;
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
     rewards_accrued=jsonb_build_object('course_name',v_patrol.display_name,'outcome','VICTORY','cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first)
 where id=p_patrol_id;
 perform public.evaluate_mission_progress(v_uid,'PATROL_CLEAR',1);
 if v_patrol.difficulty='HARD' and v_patrol.has_battle_event and v_patrol.battle_result='VICTORY' then
   perform public.evaluate_mission_progress(v_uid,'QUEST_HARD_COMPLETE_COUNT',1);
 end if;
 return jsonb_build_object('status','success','patrol_id',p_patrol_id,'course_name',v_patrol.display_name,'outcome','VICTORY','cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up');
end $function$;

-- SECTION 33 supabase/migrations/20260915113959_special_gacha_pity_per_banner.sql

set local lock_timeout='5s';
lock table public.users in exclusive mode;
lock table public.user_gacha_pity_points, public.gacha_execution_history, public.special_gacha_exchange_receipts in exclusive mode;
do $$
begin
 if exists(select 1 from public.special_gacha_exchange_receipts) then raise exception 'Legacy exchanges require explicit allocation review'; end if;
 if exists(select 1 from public.user_gacha_pity_points p where p.pity_master_id='pity_special_common' and p.current_points <>
  coalesce((select sum(h.pity_after-h.pity_before) from public.gacha_execution_history h where h.user_id=p.user_id and h.status='COMPLETED'
   and h.gacha_id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')),0)) then raise exception 'Legacy balance/history mismatch'; end if;
 if exists(select 1 from public.user_gacha_pity_points where pity_master_id like 'pity_banner:%') then raise exception 'Already migrated'; end if;
end $$;
insert into public.user_gacha_pity_points(user_id,pity_master_id,current_points)
select p.user_id,'pity_banner:'||g.id,coalesce(sum(h.pity_after-h.pity_before),0)
from public.user_gacha_pity_points p
cross join (values ('CHAR_JUSTICE_EVIL_SPECIAL'),('CHAR_ORDER_CHAOS_SPECIAL'),('SKILL_SPECIAL'),('EQUIP_SPECIAL')) g(id)
left join public.gacha_execution_history h on h.user_id=p.user_id and h.gacha_id=g.id and h.status='COMPLETED'
where p.pity_master_id='pity_special_common' group by p.user_id,g.id;
update public.user_gacha_pity_points set current_points=0,updated_at=now() where pity_master_id='pity_special_common';

-- Existing draw logic, locks, prices, pools and idempotent result replay are retained.
do $$
declare n text; d text;
begin
 foreach n in array array['execute_character_gacha','execute_asset_gacha'] loop
  d:=pg_get_functiondef(('public.'||n||'(uuid,text,integer,text,uuid,text)')::regprocedure);
  if position('''pity_special_common''' in d)=0 then raise exception 'Draw patch source mismatch'; end if;
  d:=replace(d,'''pity_special_common''','(case when v_is_special then ''pity_banner:''||p_gacha_id else ''pity_special_common'' end)');
  execute d;
 end loop;
 -- Clone the existing reward behavior, changing only its debit bucket.
 d:=pg_get_functiondef('public._exchange_pity_reward_before_special_release(uuid,text,text)'::regprocedure);
 d:=replace(d,'_exchange_pity_reward_before_special_release(p_user_id uuid, p_reward_type text, p_reward_id text)',
 '_exchange_pity_reward_per_banner(p_user_id uuid, p_reward_type text, p_reward_id text, p_gacha_id text)');
 if position('_exchange_pity_reward_per_banner' in d)=0 then raise exception 'Exchange patch source mismatch'; end if;
 d:=replace(d,'''pity_special_common''','(''pity_banner:''||p_gacha_id)');
 execute d;
end $$;
revoke all on function public._exchange_pity_reward_per_banner(uuid,text,text,text) from public,anon,authenticated;

alter table public.special_gacha_exchange_receipts add column gacha_id text references public.gacha_masters(id);
create function public.exchange_special_gacha_reward(p_gacha_id text,p_reward_type text,p_reward_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prior public.special_gacha_exchange_receipts; result jsonb; points integer;
begin
 if u is null then raise exception 'not authorized'; end if;
 if p_request_id is null then raise exception 'request_id is required'; end if;
 perform 1 from public.users where id=u for update;
 select * into prior from public.special_gacha_exchange_receipts where user_id=u and request_id=p_request_id;
 if found then
  if prior.gacha_id is distinct from p_gacha_id or prior.reward_type is distinct from p_reward_type or prior.reward_id is distinct from p_reward_id then raise exception 'request_id was already used for a different exchange'; end if;
  return prior.result_payload;
 end if;
 if not exists(select 1 from public.feature_operating_states where feature_key='SPECIAL_GACHA' and state='OPEN') then raise exception 'special gacha is closed'; end if;
 if p_gacha_id is null or p_gacha_id not in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')
  or not exists(select 1 from public.gacha_items_master where gacha_id=p_gacha_id and item_type=p_reward_type and item_id=p_reward_id and rarity='SSR') then raise exception 'invalid pity reward'; end if;
 result:=public._exchange_pity_reward_per_banner(u,p_reward_type,p_reward_id,p_gacha_id);
 select current_points into points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_banner:'||p_gacha_id;
 result:=result||jsonb_build_object('current_points',points,'gacha_id',p_gacha_id);
 insert into public.special_gacha_exchange_receipts(user_id,request_id,gacha_id,reward_type,reward_id,result_payload) values(u,p_request_id,p_gacha_id,p_reward_type,p_reward_id,result);
 return result;
end $$;
revoke all on function public.exchange_special_gacha_reward(text,text,text,uuid) from public,anon;
grant execute on function public.exchange_special_gacha_reward(text,text,text,uuid) to authenticated;
-- Old clients must reload, not spend shared points or choose a cross-banner reward.
create or replace function public.exchange_special_gacha_reward(p_reward_type text,p_reward_id text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin raise exception 'GACHA_RELOAD_REQUIRED'; end $$;

-- Preserve original read response for rolling clients; new UI uses explicit banner points.
create function public.get_special_gacha_catalog_v2()
returns jsonb language sql stable security definer set search_path='' as $$
 with original as (select public.get_special_gacha_catalog() value)
 select value || jsonb_build_object('pity_scope','PER_GACHA','gachas',
  (select jsonb_agg(g.value||jsonb_build_object('pity_points',
   coalesce((select current_points from public.user_gacha_pity_points where user_id=auth.uid() and pity_master_id='pity_banner:'||(g.value->>'id')),0))
   order by g.value->>'id') from jsonb_array_elements(value->'gachas') g)) from original
$$;
revoke all on function public.get_special_gacha_catalog_v2() from public,anon;
grant execute on function public.get_special_gacha_catalog_v2() to authenticated;