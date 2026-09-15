begin read only;
do $$
declare v_season uuid; v_end constant timestamptz := '2099-12-31 00:00:00 Asia/Tokyo'::timestamptz;
begin
  select season_id into strict v_season from public.ranking_guild_power_season_master
  where event_key='PREOPEN_GUILD_POWER_2026' and ends_at=v_end and display_period_text='プレオープン中開催';
  if not exists(select 1 from public.ranking_seasons where id=v_season and ends_at=v_end and status='ACTIVE')
    or not exists(select 1 from public.mission_events where id='GVG_PREP_20260904'
      and start_at='2026-09-04 00:00:00 Asia/Tokyo'::timestamptz and progress_end_at=v_end
      and is_enabled and claim_deadline is null) then raise exception 'Period Master mismatch'; end if;
  if exists(select 1 from public.ranking_guild_power_finalization_audits where season_id=v_season)
    or exists(select 1 from public.ranking_guild_power_reward_grants where season_id=v_season)
    or exists(select 1 from public.ranking_guild_power_season_snapshots where season_id=v_season) then
    raise exception 'Unexpected settlement'; end if;
end;
$$;
select 'PASS: three matching end dates, ACTIVE, no settlement' result;
rollback;
