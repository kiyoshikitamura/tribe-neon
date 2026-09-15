-- 実定義runnerを試験する。実Seasonを変更せず、fixture/資産/receiptは全ROLLBACK。
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create function public.monthly_runner_qa_fail() returns trigger language plpgsql as $$
begin raise exception 'monthly-runner-qa-failure';end $$;
create trigger monthly_runner_qa_fail before insert on public.guild_cosmetics
for each row execute function public.monthly_runner_qa_fail();
do $$
declare ps uuid;gs uuid;future_id uuid;unregistered_id uuid;result jsonb;before_presents integer;
begin
 if exists(select 1 from public.monthly_power_season_runs) then raise exception 'Fixture requires no existing registered Season';end if;
 select count(*) into before_presents from public.presents;
 if public.finalize_due_monthly_power_seasons_v1()<>'[]'::jsonb then raise exception 'Idle runner changed something';end if;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('POWER','2026-08-03',clock_timestamp()-interval '3 seconds','FINALIZING') returning id into ps;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('GUILD_POWER','2026-08-03',clock_timestamp()-interval '2 seconds','FINALIZING') returning id into gs;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('POWER','2026-08-04',clock_timestamp()+interval '1 day','PREPARING') returning id into future_id;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 values('POWER','2026-08-05',clock_timestamp()-interval '1 second','FINALIZING') returning id into unregistered_id;
 insert into public.monthly_power_season_runs(season_id) values(ps),(gs),(future_id);
 begin
  perform public.finalize_due_monthly_power_seasons_v1();
  raise exception 'Expected later-category failure';
 exception when others then if sqlerrm<>'monthly-runner-qa-failure' then raise;end if;end;
 if exists(select 1 from public.monthly_power_season_runs where granted_at is not null or snapshotted_at is not null)
 or exists(select 1 from public.ranking_season_reward_grants where season_id in(ps,gs))
 or exists(select 1 from public.monthly_power_honor_grants where season_id in(ps,gs))
 or exists(select 1 from public.ranking_seasons where id in(ps,gs) and status<>'FINALIZING') then raise exception 'Runner leaked partial category result';end if;
 drop trigger monthly_runner_qa_fail on public.guild_cosmetics;
 result:=public.finalize_due_monthly_power_seasons_v1();
 if jsonb_array_length(result)<>2 or exists(select 1 from jsonb_array_elements(result) x where x->>'status'<>'CLOSED' or (x->>'honors_granted')::integer=0) then raise exception 'Both-category runner result';end if;
 if public.finalize_due_monthly_power_seasons_v1()<>'[]'::jsonb then raise exception 'Retry selected finalized categories';end if;
 if (select status from public.ranking_seasons where id=future_id)<>'PREPARING'
 or (select status from public.ranking_seasons where id=unregistered_id)<>'FINALIZING' then raise exception 'Runner touched out-of-scope Season';end if;
 if (select count(*) from public.presents)<>before_presents then raise exception 'Unexpected Present';end if;
 if has_function_privilege('anon','public.finalize_due_monthly_power_seasons_v1()','EXECUTE')
 or has_function_privilege('authenticated','public.finalize_due_monthly_power_seasons_v1()','EXECUTE') then raise exception 'Runner client executable';end if;
end $$;
select 'PASS: idle; both categories; later-category failure rolls back earlier grants; retry; future/unregistered exclusion; direct rewards; client ACL' result;
rollback;
