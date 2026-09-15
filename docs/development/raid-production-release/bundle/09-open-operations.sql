-- Execute only after compatible Edge, Cron and frontend checks.
update public.raid_legacy_settings set enabled=false where singleton;
update public.raid_room_creation_settings set enabled=true where singleton;
update public.raid_room_battle_settings set enabled=true where singleton;
update public.raid_room_rescue_settings set enabled=true where singleton;
do $check$ begin if (select count(*) from raid_room_creation_settings where singleton and enabled)<>1 or (select count(*) from raid_room_battle_settings where singleton and enabled)<>1 or (select count(*) from raid_room_rescue_settings where singleton and enabled)<>1 or (select count(*) from raid_legacy_settings where singleton and not enabled)<>1 then raise exception 'Operation flags invalid';end if;end $check$;
