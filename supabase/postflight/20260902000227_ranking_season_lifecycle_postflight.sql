do $$
declare v_pvp record; v_raid record;
begin
  if to_regprocedure('public.ensure_current_ranking_season(text,timestamp with time zone)') is null then raise exception 'ensure function missing'; end if;
  if not exists(select 1 from pg_trigger where tgname='raid_damage_logs_ensure_season' and not tgisinternal) then raise exception 'raid damage season trigger missing'; end if;
  select * into v_pvp from public.ranking_period_bounds('PVP',clock_timestamp());
  select * into v_raid from public.ranking_period_bounds('RAID',clock_timestamp());
  if (select count(*) from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' and starts_at=v_pvp.starts_at and ends_at=v_pvp.ends_at)<>1 then raise exception 'current PVP season invalid'; end if;
  if (select count(*) from public.ranking_seasons where ranking_type='RAID' and status='ACTIVE' and starts_at=v_raid.starts_at and ends_at=v_raid.ends_at)<>1 then raise exception 'current RAID season invalid'; end if;
  if not exists(select 1 from public.canonical_master_freeze_versions where domain='RANKING_REWARD' and version='2026-08-30' and is_production_enabled) then raise exception 'canonical ranking reward freeze missing'; end if;
end;
$$;
