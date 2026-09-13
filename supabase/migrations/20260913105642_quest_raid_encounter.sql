-- Encounter infrastructure. Disabled, with no reward quantities seeded.
begin;
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
commit;
