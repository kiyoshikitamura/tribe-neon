create or replace function public.converge_ranking_lifecycle_safety(
  p_at timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_orphan record;
  v_active public.ranking_seasons%rowtype;
  v_previous public.ranking_seasons%rowtype;
  v_orphans integer := 0;
  v_cutovers integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('ranking-lifecycle-safety-convergence',0));

  -- A non-Preview clean chain may have run 00227 and then the schema-only path
  -- of 00228. Reconcile only the immediately superseded row left by that pair.
  for v_orphan in
    select distinct on (closed.ranking_type) closed.*
    from public.ranking_seasons closed
    join public.ranking_seasons active
      on active.ranking_type=closed.ranking_type and active.status='ACTIVE'
     and active.starts_at<closed.ends_at+interval '1 second'
     and active.ends_at>closed.ends_at
     and abs(extract(epoch from (active.created_at-closed.updated_at)))<300
    where closed.ranking_type='PVP' and closed.status='CLOSED'
      and closed.ends_at<=p_at
      and not exists(select 1 from public.ranking_season_transition_audits audit where audit.season_id=closed.id)
      and not exists(select 1 from public.ranking_pvp_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_raid_personal_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_raid_guild_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_season_reward_grants grant_row where grant_row.season_id=closed.id)
    order by closed.ranking_type,closed.ends_at desc
  loop
    perform public.assert_pvp_boundary_replay_continuity(v_orphan.id,p_at);
    perform public.finalize_pvp_season_rewards(v_orphan.id);
    perform public.reconcile_pvp_after_season_boundary(v_orphan.id,p_at);
    v_orphans:=v_orphans+1;
  end loop;

  -- 廃止済みRaid Season境界は変更しない。
  return jsonb_build_object('orphanSeasons',v_orphans,'raidCutovers',v_cutovers);
end;
$$;