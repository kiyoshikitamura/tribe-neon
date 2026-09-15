-- TN-09: clean-chain safety and one-time Raid cutover convergence.
begin;

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
    where closed.ranking_type in ('PVP','RAID') and closed.status='CLOSED'
      and closed.ends_at<=p_at
      and not exists(select 1 from public.ranking_season_transition_audits audit where audit.season_id=closed.id)
      and not exists(select 1 from public.ranking_pvp_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_raid_personal_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_raid_guild_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_season_reward_grants grant_row where grant_row.season_id=closed.id)
    order by closed.ranking_type,closed.ends_at desc
  loop
    if v_orphan.ranking_type='PVP' then
      perform public.assert_pvp_boundary_replay_continuity(v_orphan.id,p_at);
      perform public.finalize_pvp_season_rewards(v_orphan.id);
      perform public.reconcile_pvp_after_season_boundary(v_orphan.id,p_at);
    else
      perform public.finalize_raid_season_rewards(v_orphan.id);
      insert into public.ranking_season_transition_audits(
        season_id,ranking_type,replay_count,post_boundary_user_count,
        before_projection,expected_projection,after_projection
      ) values(v_orphan.id,'RAID',0,0,'[]','[]','[]')
      on conflict(season_id) do nothing;
    end if;
    v_orphans:=v_orphans+1;
  end loop;

  select * into v_active from public.ranking_seasons
  where ranking_type='RAID' and status='ACTIVE' and p_at>=starts_at and p_at<ends_at
  order by starts_at desc limit 1 for update;
  if found then
    select * into v_previous from public.ranking_seasons
    where ranking_type='RAID' and status='CLOSED'
      and starts_at<v_active.starts_at and ends_at>v_active.starts_at and ends_at<v_active.ends_at
    order by ends_at desc limit 1 for update;
    if found then
      if exists(select 1 from public.raid_damage_logs log
          where log.created_at>=v_active.starts_at and log.created_at<v_previous.ends_at) then
        raise exception 'Raid cutover overlap contains damage logs' using errcode='23514';
      end if;
      if exists(select 1 from public.ranking_season_reward_grants grant_row where grant_row.season_id=v_active.id)
        or exists(select 1 from public.ranking_raid_personal_season_snapshots snapshot where snapshot.season_id=v_active.id)
        or exists(select 1 from public.ranking_raid_guild_season_snapshots snapshot where snapshot.season_id=v_active.id)
        or exists(select 1 from public.pvp_ranking_reward_grants grant_row where grant_row.season_id=v_active.id)
        or exists(select 1 from public.gvg_guild_season_rankings ranking where ranking.season_id=v_active.id)
        or exists(select 1 from public.gvg_individual_season_rankings ranking where ranking.season_id=v_active.id) then
        raise exception 'Raid cutover active season already has dependencies' using errcode='23514';
      end if;
      if exists(select 1 from public.ranking_seasons other
          where other.id<>v_active.id and other.ranking_type='RAID'
            and other.starts_at=v_previous.ends_at) then
        raise exception 'Raid cutover target boundary already exists' using errcode='23505';
      end if;
      update public.ranking_seasons set starts_at=v_previous.ends_at,updated_at=clock_timestamp()
      where id=v_active.id;
      v_cutovers:=v_cutovers+1;
    end if;
  end if;
  return jsonb_build_object('orphanSeasons',v_orphans,'raidCutovers',v_cutovers);
end;
$$;

-- PvP rating authority is captured at battle start. Advance before reading the
-- player/opponent ratings so a boundary-started battle never carries old-season
-- ratings into the new season delta.
do $attach_start_lifecycle$
declare
  v_signature regprocedure:=to_regprocedure('public.start_pvp_battle(uuid,text[],text)');
  v_definition text;
  v_updated text;
begin
  if v_signature is null then raise exception 'required PvP battle starter is missing'; end if;
  select pg_get_functiondef(v_signature) into v_definition;
  if position('advance_ranking_season' in v_definition)=0 then
    v_updated:=regexp_replace(
      v_definition,
      '(select \* into v_user from public\.users where id = v_user_id for update;)',
      E'perform public.advance_ranking_season(''PVP'',clock_timestamp());\n  \\1',
      'i'
    );
    if v_updated=v_definition then raise exception 'PvP battle starter lifecycle hook point did not match'; end if;
    execute v_updated;
  end if;
end;
$attach_start_lifecycle$;

revoke all on function public.converge_ranking_lifecycle_safety(timestamptz)
  from public,anon,authenticated;
grant execute on function public.converge_ranking_lifecycle_safety(timestamptz)
  to service_role;

lock table public.battle_replay_sessions in share row exclusive mode;
lock table public.pvp_ranks in share row exclusive mode;
lock table public.raid_damage_logs in share row exclusive mode;
select public.converge_ranking_lifecycle_safety(clock_timestamp());

commit;
notify pgrst,'reload schema';
