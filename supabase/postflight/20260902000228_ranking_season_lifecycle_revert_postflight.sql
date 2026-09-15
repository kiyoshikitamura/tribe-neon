do $$
begin
  if to_regprocedure('public.ensure_current_ranking_season(text,timestamp with time zone)') is not null then raise exception '00227 ensure function remains'; end if;
  if exists(select 1 from pg_trigger where tgname='raid_damage_logs_ensure_season' and not tgisinternal) then raise exception '00227 trigger remains'; end if;
  if (select provolatile from pg_proc where oid='public.get_public_pvp_rankings(boolean,integer,integer)'::regprocedure)<>'s' then raise exception 'PVP getter volatility differs'; end if;
  if (select provolatile from pg_proc where oid='public.get_raid_season_rankings(integer,integer)'::regprocedure)<>'s' then raise exception 'RAID getter volatility differs'; end if;
  if (select provolatile from pg_proc where oid='public.get_active_ranking_seasons()'::regprocedure)<>'s' then raise exception 'active getter volatility differs'; end if;
  if exists(select 1 from public.ranking_seasons where id in('74bacb55-cad3-4c23-bca7-67a2aeac931d','e7f40125-3f35-4774-ad2d-839b213cc1fd')) then raise exception '00227 season rows remain'; end if;
  if (select count(*) from public.ranking_seasons where id in('90106a5f-ec9b-415f-98d0-754a525c1eb7','2828d27e-ebfd-4005-ba3b-0d618618c286') and status='ACTIVE')<>2 then raise exception 'pre-state seasons not restored'; end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20260902000227') then raise exception '00227 history missing'; end if;
end;
$$;
