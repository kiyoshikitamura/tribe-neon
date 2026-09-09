-- Human-approved temporary end. No schema or RPC changes.
-- Apply this forward-only overlay; never replay historical 00235-00238.
begin;

do $$
declare
  v_season_id uuid;
  v_end constant timestamptz := '2099-12-31 00:00:00 Asia/Tokyo'::timestamptz;
begin
  select season.id into strict v_season_id
  from public.ranking_seasons season
  join public.ranking_guild_power_season_master master on master.season_id=season.id
  where master.event_key='PREOPEN_GUILD_POWER_2026'
  for update of season;
  perform pg_advisory_xact_lock(hashtextextended('PREOPEN_GUILD_POWER_2026',0));
  if exists(select 1 from public.ranking_seasons where id=v_season_id and status in ('CLOSED','FINALIZING'))
    or exists(select 1 from public.ranking_guild_power_finalization_audits where season_id=v_season_id)
    or exists(select 1 from public.ranking_guild_power_season_snapshots where season_id=v_season_id)
    or exists(select 1 from public.ranking_guild_power_reward_grants where season_id=v_season_id) then
    raise exception 'Pre-open season already finalized or settling; manual review required';
  end if;

  update public.mission_events
  set progress_end_at=v_end,
      banner_image_url='/promotion/mypage_banner_gvg_prep.webp?v=20260905',
      dialog_image_url='/promotion/gvg_preopen_mission_keyvisual.webp?v=20260905',
      updated_at=clock_timestamp()
  where id='GVG_PREP_20260904' and is_enabled;
  if not found then raise exception 'Enabled preparation event missing'; end if;

  update public.ranking_seasons set ends_at=v_end,updated_at=clock_timestamp()
  where id=v_season_id;
  update public.ranking_guild_power_season_master
  set ends_at=v_end,display_period_text='プレオープン中開催'
  where season_id=v_season_id;

  update public.missions
  set condition_params=jsonb_set(condition_params,'{completion_message}',
    to_jsonb(E'ギルドバトル開幕の準備完了！\n正式オープンに備えよう！'::text),true)
  where id='GVG_PREP_COMPLETE' and event_id='GVG_PREP_20260904';
  if not found then raise exception 'Preparation completion mission missing'; end if;

  update public.canonical_master_freeze_versions
  set payload=jsonb_set(payload,'{progress_end_jst}',to_jsonb('2099-12-31 00:00:00'::text),true)
  where domain='MISSION_EVENT' and version='2026-09-03'
    and payload->>'event_id'='GVG_PREP_20260904';
  if not found then raise exception 'Preparation master marker missing'; end if;
end;
$$;

-- Existing finalizer checks ends_at before any snapshots/grants. Existing cron
-- may run on Sep 9; it raises 22023 (not closed), without settling anything.
-- Cron/read/cutoff authorities and all status/feature flags are unchanged.
commit;
