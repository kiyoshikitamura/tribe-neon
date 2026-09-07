begin;
set transaction read only;

do $$
declare
  v_function record;
begin
  select
    procedure.prosecdef as security_definer,
    procedure.provolatile as volatility,
    procedure.proconfig as function_config,
    has_function_privilege('anon',procedure.oid,'execute') as anon_execute,
    has_function_privilege('authenticated',procedure.oid,'execute') as authenticated_execute,
    has_function_privilege('service_role',procedure.oid,'execute') as service_role_execute
  into strict v_function
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public'
    and procedure.oid=to_regprocedure(
      'public.converge_ranking_lifecycle_safety(timestamp with time zone)'
    );

  if not v_function.security_definer then
    raise exception 'ranking lifecycle convergence must remain SECURITY DEFINER';
  end if;
  if v_function.volatility<>'v' then
    raise exception 'ranking lifecycle convergence must remain VOLATILE';
  end if;
  if v_function.function_config is distinct from array['search_path=public']::text[] then
    raise exception 'ranking lifecycle convergence search_path is not fixed to public';
  end if;
  if v_function.anon_execute or v_function.authenticated_execute
     or not v_function.service_role_execute then
    raise exception 'ranking lifecycle convergence EXECUTE grants are unsafe';
  end if;
end;
$$;

-- Production-compatible evidence only. Do not call the mutating convergence RPC
-- from this test: historical candidates are live state, not a zero-row fixture.
select
  count(*)::integer as unresolved_orphan_count,
  coalesce(
    jsonb_agg(
      jsonb_build_object('season_id',candidate.id,'ranking_type',candidate.ranking_type)
      order by candidate.ranking_type
    ),
    '[]'::jsonb
  ) as unresolved_orphans
from (
  select distinct on (closed.ranking_type) closed.id,closed.ranking_type
  from public.ranking_seasons closed
  join public.ranking_seasons active
    on active.ranking_type=closed.ranking_type
   and active.status='ACTIVE'
   and active.starts_at<closed.ends_at+interval '1 second'
   and active.ends_at>closed.ends_at
   and abs(extract(epoch from (active.created_at-closed.updated_at)))<300
  where closed.ranking_type in ('PVP','RAID')
    and closed.status='CLOSED'
    and closed.ends_at<=clock_timestamp()
    and not exists(select 1 from public.ranking_season_transition_audits audit where audit.season_id=closed.id)
    and not exists(select 1 from public.ranking_pvp_season_snapshots snapshot where snapshot.season_id=closed.id)
    and not exists(select 1 from public.ranking_raid_personal_season_snapshots snapshot where snapshot.season_id=closed.id)
    and not exists(select 1 from public.ranking_raid_guild_season_snapshots snapshot where snapshot.season_id=closed.id)
    and not exists(select 1 from public.ranking_season_reward_grants grant_row where grant_row.season_id=closed.id)
  order by closed.ranking_type,closed.ends_at desc
) candidate;

rollback;
