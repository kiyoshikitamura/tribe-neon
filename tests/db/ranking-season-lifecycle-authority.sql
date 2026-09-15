begin;
do $$
declare
  v_window record;
  v_active public.ranking_seasons%rowtype;
  v_first uuid;
  v_repeat uuid;
begin
  select * into v_window from public.ranking_period_bounds('RAID','2026-09-06 14:59:59+00');
  if v_window.starts_at<>'2026-08-30 15:00:00+00'::timestamptz
     or v_window.ends_at<>'2026-09-06 15:00:00+00'::timestamptz then
    raise exception 'RAID JST weekly boundary invalid';
  end if;
  select * into v_window from public.ranking_period_bounds('PVP','2026-09-30 14:59:59+00');
  if v_window.starts_at<>'2026-08-31 15:00:00+00'::timestamptz
     or v_window.ends_at<>'2026-09-30 15:00:00+00'::timestamptz then
    raise exception 'PVP JST monthly boundary invalid';
  end if;

  if has_function_privilege('authenticated','public.advance_all_ranking_seasons(timestamp with time zone)','execute') then
    raise exception 'authenticated role can advance ranking seasons';
  end if;
  if exists(select 1 from pg_trigger where tgname='raid_damage_logs_ensure_season' and not tgisinternal) then
    raise exception 'unsafe Raid trigger exists';
  end if;

  select * into strict v_active from public.ranking_seasons
  where ranking_type='RAID' and status='ACTIVE' for update;
  update public.ranking_seasons
  set ends_at=starts_at+interval '1 second'
  where id=v_active.id;
  v_first:=public.advance_ranking_season('RAID','2030-01-07 00:00:00+00');
  v_repeat:=public.advance_ranking_season('RAID','2030-01-07 00:00:00+00');
  if v_first<>v_repeat then raise exception 'RAID lifecycle is not idempotent'; end if;
  if exists(select 1 from public.ranking_seasons where id=v_active.id and status<>'CLOSED') then
    raise exception 'expired RAID season was not closed';
  end if;
  if (select count(*) from public.ranking_seasons where ranking_type='RAID' and status='ACTIVE')<>1 then
    raise exception 'RAID active season uniqueness failed';
  end if;
end;
$$;
rollback;
