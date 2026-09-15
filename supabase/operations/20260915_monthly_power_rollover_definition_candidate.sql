-- Definition-only candidate. Preview rollback test only; no scheduler/state mutations here.
-- Durable definition candidate: migrations/20260915000741_monthly_power_rollover_definition.sql
begin;
create function public.advance_monthly_power_seasons_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.ranking_seasons%rowtype; g public.ranking_seasons%rowtype;
 pr public.monthly_power_season_runs%rowtype; gr public.monthly_power_season_runs%rowtype;
 v_now timestamptz:=clock_timestamp(); v_start timestamptz;v_end timestamptz;
 pid uuid;gid uuid;closure jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('monthly-power:rollover',0));
 lock table public.ranking_seasons in share row exclusive mode;
 -- Never bootstrap Formal Open or adopt unregistered historic/Preopen Seasons.
 select s.* into p from public.ranking_seasons s join public.monthly_power_season_runs r on r.season_id=s.id
 where s.ranking_type='POWER' order by s.starts_at desc limit 1;
 select s.* into g from public.ranking_seasons s join public.monthly_power_season_runs r on r.season_id=s.id
 where s.ranking_type='GUILD_POWER' order by s.starts_at desc limit 1;
 if p.id is null and g.id is null then return jsonb_build_object('status','NOT_STARTED');end if;
 if p.id is null or g.id is null or p.starts_at<>g.starts_at or p.ends_at<>g.ends_at then
  raise exception 'Monthly category boundary mismatch';end if;
 select * into strict pr from public.monthly_power_season_runs where season_id=p.id;
 select * into strict gr from public.monthly_power_season_runs where season_id=g.id;
 if pr.reward_version<>gr.reward_version or pr.eligibility_policy is distinct from gr.eligibility_policy
   or gr.eligibility_policy is distinct from 'CONTINUOUS_JST_DAY1' then
  raise exception 'Monthly category registration mismatch';end if;
 if p.ends_at>v_now then
  if p.status<>'ACTIVE' or g.status<>'ACTIVE' then raise exception 'Current monthly Season requires review';end if;
  return jsonb_build_object('status','ACTIVE','POWER',p.id,'GUILD_POWER',g.id);
 end if;
 -- Reuse only server-side JST calendar bounds, never PVP advance/reward/reset.
 select b.starts_at,b.ends_at into v_start,v_end from public.ranking_period_bounds('PVP',v_now) b;
 if p.ends_at<>v_start then
  raise exception 'Missed monthly boundary requires historical review';end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in('POWER','GUILD_POWER')
   and id not in(p.id,g.id) and (status<>'CLOSED' or starts_at>=v_start)) then
  raise exception 'Conflicting monthly Season state';end if;
 if p.status not in('ACTIVE','FINALIZING','CLOSED') or g.status not in('ACTIVE','FINALIZING','CLOSED')
 or (p.status='CLOSED' and pr.granted_at is null) or (g.status='CLOSED' and gr.granted_at is null) then
  raise exception 'Prior monthly finalization evidence required';end if;
 closure:=public.finalize_due_monthly_power_seasons_v1();
 if exists(select 1 from public.ranking_seasons s join public.monthly_power_season_runs r on r.season_id=s.id
  where s.id in(p.id,g.id) and (s.status<>'CLOSED' or r.granted_at is null)) then
  raise exception 'Prior monthly finalization incomplete';end if;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('POWER',v_start,v_end,'ACTIVE') returning id into pid;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('GUILD_POWER',v_start,v_end,'ACTIVE') returning id into gid;
 insert into public.monthly_power_season_runs(season_id,reward_version,eligibility_policy)
 values(pid,pr.reward_version,pr.eligibility_policy),(gid,gr.reward_version,gr.eligibility_policy);
 return jsonb_build_object('status','STARTED','POWER',pid,'GUILD_POWER',gid,'starts_at',v_start,'ends_at',v_end,'closed',closure);
end $$;
revoke all on function public.advance_monthly_power_seasons_v1() from public,anon,authenticated;
grant execute on function public.advance_monthly_power_seasons_v1() to service_role;
rollback;
