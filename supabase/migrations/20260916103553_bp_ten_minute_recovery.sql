-- BP only: maximum 5, +1 every 600 seconds. Preserve AP/RP and battle logic.
do $migration$
declare d text;
begin
 if (select md5(prosrc) from pg_proc where oid='public.sync_and_recover_vitality_and_pvp_points(uuid)'::regprocedure)<>'e69636f5fcc41dbc01e525f0e73fd3d5'
 or (select md5(prosrc) from pg_proc where oid='public.start_pvp_battle(uuid,text[],text)'::regprocedure)<>'867558ca8152e651b53b8a06700e57ab' then
 raise exception 'Resource function changed since review'; end if;
 select pg_get_functiondef('public.sync_and_recover_vitality_and_pvp_points(uuid)'::regprocedure) into d;
 d:=replace(d,'coalesce(v_pvp_at,v_now)))/7200','coalesce(v_pvp_at,v_now)))/600');
 d:=replace(d,'v_pvp_steps*interval ''7200 seconds''','v_pvp_steps*interval ''600 seconds''');
 d:=replace(d,'v_pvp_at+interval ''7200 seconds''','v_pvp_at+interval ''600 seconds''');
 execute d;
 select pg_get_functiondef('public.start_pvp_battle(uuid,text[],text)'::regprocedure) into d;
 execute replace(d,'/ 7200','/ 600');
end $migration$;
insert into public.canonical_action_resource_master
(version,resource_type,natural_max,hard_cap,recovery_amount,recovery_interval_seconds,entry_cost)
select '2026-09-16',resource_type,natural_max,hard_cap,recovery_amount,
case when resource_type='PVP_POINT' then 600 else recovery_interval_seconds end,entry_cost
from public.canonical_action_resource_master where version='2026-09-14';
