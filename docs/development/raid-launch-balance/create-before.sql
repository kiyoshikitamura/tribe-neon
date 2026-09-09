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
