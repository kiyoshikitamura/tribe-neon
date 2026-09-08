CREATE OR REPLACE FUNCTION public.rotate_daily_raids()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_pair text[]; v_area text; v_variant public.canonical_raid_variants%rowtype; v_start timestamptz; v_end timestamptz; v_cleared record;
begin
 perform pg_advisory_xact_lock(hashtextextended('CANONICAL_RAID_ROTATION:'||v_today::text,0));
 for v_cleared in select id from public.raid_bosses where status='ACTIVE' and (current_hp=0 or expires_at<=now()) for update loop perform public.finalize_expired_raid_instance(v_cleared.id); end loop;
 for v_cleared in select id from public.raid_bosses where status='CLEARED' and raid_day_key=v_today::text and respawn_after<=now() for update loop perform public.respawn_cleared_raid_slot(v_cleared.id); end loop;
 v_pair:=public.canonical_raid_rotation_pair(v_today); v_start:=(v_today::timestamp at time zone 'Asia/Tokyo'); v_end:=v_start+interval '24 hours';
 foreach v_area in array v_pair loop
  if not exists(select 1 from public.raid_bosses where raid_day_key=v_today::text and base_id=v_area and status='ACTIVE') and not exists(select 1 from public.raid_bosses where raid_day_key=v_today::text and base_id=v_area and status='CLEARED' and respawn_after>now()) then
   select * into v_variant from public.canonical_raid_variants where area_id=upper(v_area) and is_production_enabled order by raid_variant_id limit 1;
   insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key) values(v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,v_area,'ACTIVE',greatest(now(),v_start),v_end,gen_random_uuid(),v_today,v_variant.raid_variant_id,v_today::text);
  end if;
 end loop;
end $function$
;