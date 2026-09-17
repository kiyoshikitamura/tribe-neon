begin;
create table private.raid_daily_targets(
 date_jst date primary key,
 first_variant_id text not null,
 second_variant_id text not null,
 first_area_id text not null,
 second_area_id text not null,
 created_at timestamptz not null default clock_timestamp(),
 constraint raid_daily_targets_check check(first_variant_id<>second_variant_id),
 constraint raid_daily_targets_check1 check(first_area_id<>second_area_id),
 constraint raid_daily_targets_first_variant_id_fkey foreign key(first_variant_id) references public.canonical_raid_variants(raid_variant_id),
 constraint raid_daily_targets_second_variant_id_fkey foreign key(second_variant_id) references public.canonical_raid_variants(raid_variant_id)
);
revoke all on table private.raid_daily_targets from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.raid_daily_targets_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
end $function$;
commit;
