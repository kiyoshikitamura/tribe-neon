begin;
-- Raid top step 2: shared JST daily authority and new-challenge validation.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated,service_role;

create table private.raid_daily_targets (
 date_jst date primary key,
 first_variant_id text not null references public.canonical_raid_variants(raid_variant_id),
 second_variant_id text not null references public.canonical_raid_variants(raid_variant_id),
 first_area_id text not null,
 second_area_id text not null,
 created_at timestamptz not null default clock_timestamp(),
 check (first_variant_id <> second_variant_id),
 check (first_area_id <> second_area_id)
);
alter table private.raid_daily_targets enable row level security;
revoke all on private.raid_daily_targets from public,anon,authenticated,service_role;

-- Internal-only authority. No client date, random seed, or direct access is accepted.
create function private.raid_daily_targets_v1() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 v_day date;
 v_saved private.raid_daily_targets%rowtype;
 v_variants text[];
 v_areas text[];
 v_count integer;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'read committed required' using errcode='25001';
 end if;
 loop
  v_day := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  select * into v_saved from private.raid_daily_targets where date_jst=v_day;
  if found then exit; end if;
  -- Two-key namespace is dedicated to this authority. Serialize first initialization per JST day.
  perform pg_advisory_xact_lock(726402, v_day-date '2000-01-01');
  -- Waiting across midnight must initialize the new day, never return yesterday as today.
  if v_day <> (clock_timestamp() at time zone 'Asia/Tokyo')::date then continue; end if;
  select * into v_saved from private.raid_daily_targets where date_jst=v_day;
  if found then exit; end if;
  select count(distinct area_id) into v_count from public.canonical_raid_variants
   where is_production_enabled and area_id in ('SHINJUKU','SHIBUYA','IKEBUKURO','ROPPONGI','AKIHABARA','KAWASAKI','YOKOHAMA');
  if v_count <> 7 then raise exception 'daily raid master unavailable' using errcode='55000'; end if;
  -- Uniform area selection without replacement; a canonical variant is frozen for each selected area.
  select array_agg(raid_variant_id order by area_id),array_agg(area_id order by area_id)
   into v_variants,v_areas from (
    select area_id,min(raid_variant_id) raid_variant_id from public.canonical_raid_variants
    where is_production_enabled and area_id in ('SHINJUKU','SHIBUYA','IKEBUKURO','ROPPONGI','AKIHABARA','KAWASAKI','YOKOHAMA')
    group by area_id order by random() limit 2
   ) picked;
  if cardinality(v_variants) <> 2 then raise exception 'daily raid master unavailable' using errcode='55000'; end if;
  insert into private.raid_daily_targets(date_jst,first_variant_id,second_variant_id,first_area_id,second_area_id)
   values(v_day,v_variants[1],v_variants[2],v_areas[1],v_areas[2]) returning * into v_saved;
  exit;
 end loop;
 return jsonb_build_object('dateJst',v_saved.date_jst::text,'targets',jsonb_build_array(
  jsonb_build_object('variantId',v_saved.first_variant_id),jsonb_build_object('variantId',v_saved.second_variant_id)));
end $$;
revoke all on function private.raid_daily_targets_v1() from public,anon,authenticated,service_role;

create or replace function public.list_raid_room_boss_choices_v1() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_daily jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 v_daily := private.raid_daily_targets_v1();
 return jsonb_build_object('choices',coalesce((select jsonb_agg(
  jsonb_build_object('raidVariantId',v.raid_variant_id,'name',v.raid_name) order by v.raid_variant_id)
  from public.canonical_raid_variants v where v.is_production_enabled and exists (
   select 1 from jsonb_array_elements(v_daily->'targets') t where t->>'variantId'=v.raid_variant_id
  )),'[]'::jsonb));
end $$;
revoke all on function public.list_raid_room_boss_choices_v1() from public,anon,authenticated,service_role;
grant execute on function public.list_raid_room_boss_choices_v1() to authenticated;

-- SQL260 latest create definition: daily gate only; existing receipt/locks/lifetime retained.
create or replace function public.create_raid_room_v1(
 p_difficulty_id text,p_raid_variant_id text,p_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare
 v_uid uuid := auth.uid();
 v_level integer;
 v_enabled boolean;
 v_power bigint;
 v_gate jsonb;
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_variant public.canonical_raid_variants%rowtype;
 v_request public.raid_room_creation_requests%rowtype;
 v_instance uuid;
 v_room uuid;
 v_now timestamptz;
 v_daily jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_request_id is null or p_difficulty_id is null or p_raid_variant_id is null
   or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then
   raise exception 'invalid creation input' using errcode='22023';
 end if;
 -- 設定無効時は再送も拒否する。作成済みRoomの参照は既存参照RPCを使う。
 select enabled into v_enabled from public.raid_room_creation_settings where singleton for share;
 if v_enabled is distinct from true then
   raise exception 'room creation disabled' using errcode='55000';
 end if;
 -- ユーザー単位で異なる難度を含む再送を直列化。全生成経路のロック順を揃える。
 select level into v_level from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501'; end if;
 select * into v_request from public.raid_room_creation_requests where user_id=v_uid and request_id=p_request_id;
 if found then
   if v_request.difficulty_id<>p_difficulty_id or v_request.raid_variant_id<>p_raid_variant_id then
     raise exception 'request payload conflict' using errcode='22023';
   end if;
   return public.raid_room_projection_v1(v_request.room_id);
 end if;
 if v_level is null or v_level<5 then raise exception 'raid level requirement' using errcode='42501'; end if;
 -- 難度枠を先にロックし、待機後に総合力と生成時刻を取得する。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 空編成を既存集計関数のcoalesceで0として判定しない。初級には総合力制限がない。
 if p_difficulty_id<>'beginner' and not exists(
   select 1 from public.user_main_formations where user_id=v_uid
 ) then raise exception 'power unavailable' using errcode='42501'; end if;
 v_power := public.calculate_user_total_power(v_uid);
 if p_difficulty_id<>'beginner' and (v_power is null or v_power<0) then
   raise exception 'power unavailable' using errcode='42501';
 end if;
 v_gate := public._raid_room_power_gate_v1(p_difficulty_id,v_power);
 if v_gate->>'status' is distinct from 'passed' then
   raise exception 'raid power requirement' using errcode='42501';
 end if;
 select * into v_variant from public.canonical_raid_variants
   where raid_variant_id=p_raid_variant_id and is_production_enabled;
 if not found or v_variant.max_hp is null or v_variant.max_hp<=0 then
   raise exception 'raid variant unavailable' using errcode='22023';
 end if;
 -- Successful same-request receipts above are returned before any new-day target check.
 loop
  v_daily := private.raid_daily_targets_v1();
  v_now := clock_timestamp();
  exit when v_daily->>'dateJst' = ((v_now at time zone 'Asia/Tokyo')::date)::text;
 end loop;
 if not exists(select 1 from jsonb_array_elements(v_daily->'targets') t where t->>'variantId'=p_raid_variant_id) then
  raise exception 'raid variant outside daily targets' using errcode='22023';
 end if;
 v_instance := gen_random_uuid();
 -- 日次グループとの識別のみ。旧writerを遮断するものではないため設定は無効で出荷。
 insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,
   spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_instance,v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,
   lower(v_variant.area_id),'ACTIVE',v_now,v_now+make_interval(hours=>v_rule.duration_hours),
   gen_random_uuid(),(v_now at time zone 'Asia/Tokyo')::date,v_variant.raid_variant_id,'ROOM:'||v_instance::text);
 v_room := (public._raid_room_register_v1(v_instance,v_uid,p_difficulty_id)->>'roomId')::uuid;
 insert into public.raid_room_creation_requests(user_id,request_id,difficulty_id,raid_variant_id,room_id)
 values(v_uid,p_request_id,p_difficulty_id,p_raid_variant_id,v_room);
 -- Room登録・所有者参加・再送台帳まで同一transaction。資源消費や戦闘開始は行わない。
 return public.raid_room_projection_v1(v_room);
end $$;
revoke all on function public.create_raid_room_v1(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_raid_room_v1(text,text,uuid) to authenticated;
commit;
