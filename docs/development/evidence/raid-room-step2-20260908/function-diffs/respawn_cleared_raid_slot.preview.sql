CREATE OR REPLACE FUNCTION public.respawn_cleared_raid_slot(p_cleared_instance_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_old public.raid_bosses%rowtype; v_new uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cleared_instance_id::text||':respawn',0));
 select * into v_old from public.raid_bosses where id=p_cleared_instance_id and status='CLEARED' and respawn_after<=now() for update;
 if not found then return null; end if;
 if exists(select 1 from public.raid_bosses where raid_day_key=v_old.raid_day_key and base_id=v_old.base_id and status='ACTIVE') then return null; end if;
 insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_old.boss_id,v_old.boss_master_id,v_old.max_hp,v_old.max_hp,v_old.base_id,'ACTIVE',now(),v_old.expires_at,gen_random_uuid(),v_old.rotation_date,v_old.raid_variant_id,v_old.raid_day_key) returning id into v_new;
 return v_new;
end $function$
;