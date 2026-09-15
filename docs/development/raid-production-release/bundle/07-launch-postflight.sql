-- Run inside the same transaction after 06; no gameplay mutation.
do $verify$
begin
 if (select count(*) from public.raid_room_combat_profiles)<>28 then raise exception 'Expected 28 combat profiles';end if;
 if (select sum(jsonb_array_length(profile->'members')) from public.raid_room_combat_profiles)<>140 then raise exception 'Expected 140 members';end if;
 if exists(select from pg_class where oid in ('public.raid_room_combat_profiles'::regclass,'public.raid_room_combat_snapshots'::regclass) and not relrowsecurity) then raise exception 'RLS missing';end if;
 if exists(select from public.raid_room_creation_settings where enabled) or exists(select from public.raid_room_battle_settings where enabled) or exists(select from public.raid_room_rescue_settings where enabled) then raise exception 'Unexpected enablement';end if;
 if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_raid_room_launch_enemy_snapshot_v1') is distinct from '5bebc4b283a327cacb4974584b27fa51' then raise exception 'Launch body mismatch: public._raid_room_launch_enemy_snapshot_v1';end if;
 if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_raid_room_v1') is distinct from '0b62db74e9d88d8556ae2130faf2d7d1' then raise exception 'Launch body mismatch: public.create_raid_room_v1';end if;
 if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='start_raid_room_battle_v1') is distinct from 'de23bc6b2a67f75be5512d8ec964a05e' then raise exception 'Launch body mismatch: public.start_raid_room_battle_v1';end if;
 if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='raid_enemy_info_v1') is distinct from '2738d1848de667eddbc161dcae05e4eb' then raise exception 'Launch body mismatch: private.raid_enemy_info_v1';end if;
end $verify$;
