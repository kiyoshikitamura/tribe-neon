-- Least-privilege read API for the internal KPI dashboard.

create or replace function public.get_latest_kpi_snapshots(
  p_category text,
  p_period_type text,
  p_period_start date,
  p_period_end date
)
returns table (
  run_id uuid,
  metric_id text,
  dimension_key jsonb,
  value numeric,
  numerator bigint,
  denominator bigint,
  value_status text,
  null_reason text,
  calculated_at timestamptz,
  source_watermark timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  return query
  with latest_run as (
    select run.run_id, run.source_watermark, run.finished_at
    from public.kpi_aggregation_runs run
    where run.category = p_category
      and run.period_type = p_period_type
      and run.period_start = p_period_start
      and run.period_end = p_period_end
      and run.status = 'succeeded'
    order by run.finished_at desc
    limit 1
  )
  select latest.run_id,
         snapshot.metric_id,
         snapshot.dimension_key,
         snapshot.value,
         snapshot.numerator,
         snapshot.denominator,
         snapshot.value_status,
         snapshot.null_reason,
         snapshot.calculated_at,
         latest.source_watermark,
         latest.finished_at
  from latest_run latest
  join public.kpi_metric_snapshots snapshot on snapshot.run_id = latest.run_id
  order by snapshot.metric_id, snapshot.dimension_key;
end;
$$;

create or replace function public.get_kpi_refresh_run(p_run_id uuid)
returns table (
  run_id uuid,
  category text,
  period_type text,
  period_start date,
  period_end date,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  source_watermark timestamptz,
  error_code text,
  error_detail text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  return query
  select run.run_id,
         run.category,
         run.period_type,
         run.period_start,
         run.period_end,
         run.status,
         run.requested_at,
         run.started_at,
         run.finished_at,
         run.source_watermark,
         run.error_code,
         run.error_detail
  from public.kpi_aggregation_runs run
  where run.run_id = p_run_id;
end;
$$;

revoke all on function public.get_latest_kpi_snapshots(text, text, date, date) from public, anon;
revoke all on function public.get_kpi_refresh_run(uuid) from public, anon;
grant execute on function public.get_latest_kpi_snapshots(text, text, date, date) to authenticated;
grant execute on function public.get_kpi_refresh_run(uuid) to authenticated;

-- Refresh remains service-role-only. Browser clients cannot aggregate Production data.
revoke all on function public.refresh_kpi_snapshots(text, text, date, date, uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_kpi_snapshots(text, text, date, date, uuid)
  to service_role;
