begin;
set local statement_timeout='90s';
create temp table kpi_fixture_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() qa,gen_random_uuid() old;
insert into public.kpi_subjects(subject_id,registered_at,registration_type)
select a,timestamptz '2024-02-27T00:00:00+09:00','anonymous' from kpi_fixture_ids union all
select b,timestamptz '2024-02-28T00:00:00+09:00','anonymous' from kpi_fixture_ids union all
select qa,timestamptz '2024-02-28T00:00:00+09:00','anonymous' from kpi_fixture_ids union all
select old,timestamptz '2020-01-01T00:00:00+09:00','anonymous' from kpi_fixture_ids;
insert into public.kpi_account_classification_periods(subject_id,classification,valid_from,reason)
select qa,'qa','2024-02-01T00:00:00+09:00','transaction-only fixture' from kpi_fixture_ids;
insert into public.kpi_daily_user_activity(subject_id,activity_date,first_active_at,last_active_at)
select subject_id,day,public.kpi_jst_day_start(day)+interval '1 hour',public.kpi_jst_day_start(day)+interval '1 hour'
from kpi_fixture_ids cross join lateral (values(a,date '2024-02-28'),(a,date '2024-02-29'),(a,date '2024-03-01'),(b,date '2024-02-29'),(qa,date '2024-02-29'),(old,date '2024-02-29')) v(subject_id,day);
select public.refresh_kpi_overview_saved_results('2024-03-02');
do $$
declare feb jsonb; day jsonb; march jsonb;
begin
select payload into feb from public.kpi_overview_saved_results where period_type='monthly' and period_start='2024-02-01';
select payload into day from public.kpi_overview_saved_results where period_type='daily' and period_start='2024-02-29';
select payload into march from public.kpi_overview_saved_results where period_type='monthly' and period_start='2024-03-01';
if (feb->>'active_users')::int<>3 or (day->>'active_users')::int<>3 or (march->>'active_users')::int<>1 then raise exception 'DAU/MAU distinct or exclusion failure'; end if;
if (feb->>'new_users')::int<>2 or (feb->>'total_registered')::int<>3 then raise exception 'new vs lifetime registration failure'; end if;
if (select sum((payload->>'active_users')::int) from public.kpi_overview_saved_results where period_type='daily' and period_start>='2024-02-01' and period_start<'2024-03-01')<>4 then raise exception 'fixture daily sum must differ from MAU'; end if;
if has_table_privilege('anon','public.kpi_overview_saved_results','select') or has_table_privilege('authenticated','public.kpi_overview_saved_results','select') or has_table_privilege('service_role','public.kpi_overview_saved_results','insert') or has_function_privilege('service_role','public.refresh_kpi_overview_saved_results(date)','execute') then raise exception 'saved result privilege boundary'; end if;
end $$;
select 'PASS: leap-day DAU=3, monthly distinct=3 vs daily sum=4, March=1, old user included, QA excluded, cumulative=3, restricted writer' as result;
rollback;

