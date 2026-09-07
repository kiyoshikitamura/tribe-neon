\set ON_ERROR_STOP on
begin;

do $$
begin
  if current_setting('tribe_neon.local_fixture_runner',true) is distinct from 'on' then
    raise exception 'ranking lifecycle mutation fixture requires the local-only runner';
  end if;
end;
$$;

-- Isolate the fixture from the active local Raid season. The transaction is
-- always rolled back by this local-only test.
update public.ranking_seasons
set status='PREPARING',updated_at=clock_timestamp()
where ranking_type='RAID' and status='ACTIVE';

insert into public.ranking_seasons(
  id,ranking_type,starts_at,ends_at,status,created_at,updated_at
) values
  (
    'd1000000-0000-4000-8000-000000000001','RAID',
    '1999-12-01 00:00:00+00','2000-01-08 00:00:00+00','CLOSED',
    '2000-01-01 00:00:00+00','2000-01-01 00:00:00+00'
  ),
  (
    'd1000000-0000-4000-8000-000000000002','RAID',
    '2000-01-01 00:00:00+00','2000-02-01 00:00:00+00','ACTIVE',
    '2000-01-01 00:01:00+00','2000-01-01 00:01:00+00'
  );

do $$
declare
  v_first jsonb;
  v_repeat jsonb;
begin
  v_first:=public.converge_ranking_lifecycle_safety('2000-01-15 00:00:00+00');
  if v_first<>jsonb_build_object('orphanSeasons',1,'raidCutovers',1) then
    raise exception 'fixture convergence result is invalid: %',v_first;
  end if;
  if not exists(
    select 1 from public.ranking_season_transition_audits
    where season_id='d1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'fixture orphan was not finalized';
  end if;
  if (
    select starts_at from public.ranking_seasons
    where id='d1000000-0000-4000-8000-000000000002'
  ) is distinct from (
    select ends_at from public.ranking_seasons
    where id='d1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'fixture Raid cutover was not converged';
  end if;

  v_repeat:=public.converge_ranking_lifecycle_safety('2000-01-15 00:00:00+00');
  if v_repeat<>jsonb_build_object('orphanSeasons',0,'raidCutovers',0) then
    raise exception 'fixture convergence is not idempotent: %',v_repeat;
  end if;
end;
$$;

rollback;
