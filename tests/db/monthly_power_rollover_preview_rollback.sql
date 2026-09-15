-- Prepend definition candidate without its final ROLLBACK. This test always rolls back.
create function public.monthly_rollover_qa_fail() returns trigger language plpgsql as $$
begin
 if new.ranking_type='GUILD_POWER' and new.starts_at=(date_trunc('month',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo') then
 raise exception 'rollover-create-failure';end if;return new;
end $$;
create trigger monthly_rollover_qa_fail before insert on public.ranking_seasons for each row execute function public.monthly_rollover_qa_fail();
do $$
declare start_at timestamptz;end_at timestamptz;ps uuid;gs uuid;result jsonb;nextp uuid;nextg uuid;baseline jsonb;
begin
 if exists(select 1 from public.monthly_power_season_runs) then raise exception 'Fixture requires no existing registered Season';end if;
 select jsonb_agg(to_jsonb(s) order by id) into baseline from public.ranking_seasons s where ranking_type not in('POWER','GUILD_POWER');
 if public.advance_monthly_power_seasons_v1()->>'status'<>'NOT_STARTED' then raise exception 'Unexpected bootstrap';end if;
 select starts_at,ends_at into start_at,end_at from public.ranking_period_bounds('PVP',clock_timestamp());
 -- Remove PREOPEN ACTIVE only within rollback fixture; no PREOPEN finalizer or grant.
 update public.ranking_seasons set status='CLOSED',starts_at=start_at-interval '16 days',ends_at=start_at-interval '1 second' where ranking_type='GUILD_POWER' and status<>'CLOSED';
 update public.ranking_seasons set status='CLOSED' where ranking_type='POWER' and status<>'CLOSED';
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('POWER',start_at-interval '15 days',start_at,'FINALIZING') returning id into ps;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('GUILD_POWER',start_at-interval '15 days',start_at,'FINALIZING') returning id into gs;
 insert into public.monthly_power_season_runs(season_id) values(ps),(gs);
 begin
  update public.ranking_seasons set ends_at=start_at-interval '1 second' where id=gs;
  perform public.advance_monthly_power_seasons_v1();raise exception 'Mismatch accepted';
 exception when others then if sqlerrm<>'Monthly category boundary mismatch' then raise;end if;end;
 begin
  update public.ranking_seasons set ends_at=start_at-interval '1 second' where id in(ps,gs);
  perform public.advance_monthly_power_seasons_v1();raise exception 'Missed boundary accepted';
 exception when others then if sqlerrm<>'Missed monthly boundary requires historical review' then raise;end if;end;
 begin
  perform public.advance_monthly_power_seasons_v1();raise exception 'Expected creation failure';
 exception when others then if sqlerrm<>'rollover-create-failure' then raise;end if;end;
 if (select count(*) from public.monthly_power_season_runs)<>2 or
 exists(select 1 from public.monthly_power_season_runs where granted_at is not null or snapshotted_at is not null) or
 exists(select 1 from public.ranking_season_reward_grants where season_id in(ps,gs)) or
 exists(select 1 from public.monthly_power_honor_grants where season_id in(ps,gs)) then raise exception 'Rollover atomic leak';end if;
 drop trigger monthly_rollover_qa_fail on public.ranking_seasons;
 result:=public.advance_monthly_power_seasons_v1();
 if result->>'status'<>'STARTED' or (result->>'starts_at')::timestamptz<>start_at or (result->>'ends_at')::timestamptz<>end_at then raise exception 'Month boundaries';end if;
 nextp:=(result->>'POWER')::uuid;nextg:=(result->>'GUILD_POWER')::uuid;
 if (select count(*) from public.monthly_power_season_runs where season_id in(nextp,nextg) and reward_version='20260914' and eligibility_policy='CONTINUOUS_JST_DAY1')<>2 then raise exception 'Master/policy not inherited';end if;
 if (select count(*) from public.ranking_seasons where id in(ps,gs) and status='CLOSED')<>2 then raise exception 'Prior not closed';end if;
 if public.advance_monthly_power_seasons_v1()->>'status'<>'ACTIVE' or (select count(*) from public.monthly_power_season_runs)<>4 then raise exception 'Retry not no-op';end if;
 if (select jsonb_agg(to_jsonb(s) order by id) from public.ranking_seasons s where ranking_type not in('POWER','GUILD_POWER')) is distinct from baseline then raise exception 'Other categories changed';end if;
 if has_function_privilege('anon','public.advance_monthly_power_seasons_v1()','EXECUTE') or has_function_privilege('authenticated','public.advance_monthly_power_seasons_v1()','EXECUTE') then raise exception 'Client executable';end if;
end $$;
select 'PASS: no bootstrap; matching categories; missed boundary refusal; monthly closure+creation; failed creation atomic rollback; previous Master/policy; retry; other categories; ACL' result;
rollback;
