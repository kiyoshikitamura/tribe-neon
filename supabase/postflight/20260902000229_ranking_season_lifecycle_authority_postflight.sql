do $$
declare
  v_pvp record;
  v_raid record;
  v_pvp_definition text;
  v_raid_definition text;
begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20260902000227')
     or not exists(select 1 from supabase_migrations.schema_migrations where version='20260902000228')
     or not exists(select 1 from supabase_migrations.schema_migrations where version='20260902000229') then
    raise exception 'ranking lifecycle migration history is incomplete';
  end if;
  if to_regprocedure('public.advance_ranking_season(text,timestamp with time zone)') is null
     or to_regprocedure('public.finalize_raid_season_rewards(uuid)') is null then
    raise exception 'server-only lifecycle functions are missing';
  end if;
  if exists(select 1 from pg_trigger where tgname='raid_damage_logs_ensure_season' and not tgisinternal) then
    raise exception 'unsafe Raid read/write season trigger returned';
  end if;
  if (select provolatile from pg_proc where oid='public.get_public_pvp_rankings(boolean,integer,integer)'::regprocedure)<>'s'
     or (select provolatile from pg_proc where oid='public.get_raid_season_rankings(integer,integer)'::regprocedure)<>'s'
     or (select provolatile from pg_proc where oid='public.get_active_ranking_seasons()'::regprocedure)<>'s' then
    raise exception 'ranking read RPC must remain stable';
  end if;
  if has_function_privilege('authenticated','public.advance_ranking_season(text,timestamp with time zone)','execute')
     or has_function_privilege('anon','public.advance_ranking_season(text,timestamp with time zone)','execute') then
    raise exception 'ranking lifecycle is exposed to clients';
  end if;

  select * into v_pvp from public.ranking_period_bounds('PVP',clock_timestamp());
  select * into v_raid from public.ranking_period_bounds('RAID',clock_timestamp());
  if (select count(*) from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE'
      and starts_at=v_pvp.starts_at and ends_at=v_pvp.ends_at)<>1 then
    raise exception 'current PVP season invalid';
  end if;
  if (select count(*) from public.ranking_seasons where ranking_type='RAID' and status='ACTIVE'
      and starts_at=v_raid.starts_at and ends_at=v_raid.ends_at)<>1 then
    raise exception 'current RAID season invalid';
  end if;
  -- Previewの事故復旧で使用した固定UUIDをProduction/clean replayへ要求しない。
  -- どの環境でも成立すべき期間・状態の不変条件だけを検査する。
  if exists(
    select 1
    from public.ranking_seasons left_season
    join public.ranking_seasons right_season
      on right_season.ranking_type=left_season.ranking_type
     and right_season.id<>left_season.id
     and right_season.starts_at<left_season.ends_at
     and right_season.ends_at>left_season.starts_at
    where left_season.status='ACTIVE'
      and right_season.status='ACTIVE'
  ) then
    raise exception 'active ranking seasons overlap';
  end if;
  if exists(
    select 1 from public.ranking_seasons
    where status='ACTIVE' and starts_at>=ends_at
  ) then
    raise exception 'active ranking season has invalid bounds';
  end if;

  if public.canonical_ranking_reward_payload()<>(select payload
    from public.canonical_master_freeze_versions
    where domain='RANKING_REWARD' and version='2026-08-30' and is_production_enabled) then
    raise exception 'runtime ranking reward authority differs from frozen master';
  end if;
  if exists(select 1 from public.ranking_season_transition_audits audit
      where audit.ranking_type='PVP' and audit.expected_projection<>audit.after_projection) then
    raise exception 'PVP post-reset replay reconstruction differs from expectation';
  end if;
  if exists(
    select 1
    from public.ranking_pvp_season_snapshots snapshot
    join lateral (
      select (replay.finalization_result->>'newRankPoints')::integer
          -(replay.finalization_result->>'rankDelta')::integer boundary_rating
      from public.battle_replay_sessions replay
      where replay.requester_user_id=snapshot.user_id and replay.battle_mode='PVP'
        and replay.finalization_status='FINALIZED'
        and replay.finalized_at>=(select ends_at from public.ranking_seasons where id=snapshot.season_id)
      order by replay.finalized_at,replay.id limit 1
    ) first_event on true
    where snapshot.rank_points<>first_event.boundary_rating
  ) then raise exception 'post-boundary PVP delta leaked into old snapshot'; end if;
  if exists(select 1 from public.ranking_season_reward_grants grant_row
      left join public.presents present on present.id=grant_row.present_id
      where grant_row.present_id is null or present.id is null
        or present.user_id<>grant_row.recipient_user_id
        or present.item_id<>grant_row.resolved_item_id
        or present.quantity<>grant_row.quantity) then
    raise exception 'ranking grant ledger and present delivery differ';
  end if;
  if (select count(*) from cron.job where jobname in(
      'ranking-pvp-monthly-jst','ranking-raid-weekly-jst'))<>2 then
    raise exception 'ranking lifecycle cron jobs are missing';
  end if;
  select pg_get_functiondef('public.finalize_pvp_battle(uuid,jsonb)'::regprocedure) into v_pvp_definition;
  select pg_get_functiondef('public.finalize_raid_battle(uuid,jsonb)'::regprocedure) into v_raid_definition;
  if position('advance_ranking_season(''PVP''' in v_pvp_definition)=0
     or position('advance_ranking_season(''RAID''' in v_raid_definition)=0 then
    raise exception 'battle finalizer lifecycle guard is missing';
  end if;
end;
$$;
