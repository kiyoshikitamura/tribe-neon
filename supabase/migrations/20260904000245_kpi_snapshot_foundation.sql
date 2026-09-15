-- Saved aggregation runs and immutable metric snapshots.

create table if not exists public.kpi_aggregation_runs (
  run_id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('acquisition', 'active_retention', 'guild', 'content', 'revenue')),
  period_type text not null check (period_type in ('daily', 'monthly', 'cohort')),
  period_start date not null,
  period_end date not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  aggregation_version text not null,
  exclusion_rule_version text not null,
  source_watermark timestamptz,
  error_code text,
  error_detail text,
  check (period_end > period_start),
  check (period_end <= period_start + 31)
);

create unique index if not exists kpi_aggregation_one_active_run_key
  on public.kpi_aggregation_runs(category, period_type, period_start, period_end)
  where status in ('pending', 'running');
create index if not exists kpi_aggregation_latest_success_idx
  on public.kpi_aggregation_runs(category, period_type, period_start, period_end, finished_at desc)
  where status = 'succeeded';

create table if not exists public.kpi_metric_snapshots (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.kpi_aggregation_runs(run_id) on delete cascade,
  metric_id text not null,
  dimension_key jsonb not null default '{}'::jsonb,
  value numeric,
  numerator bigint,
  denominator bigint,
  value_status text not null check (value_status in ('provisional', 'final', 'not_applicable', 'unavailable')),
  null_reason text,
  calculated_at timestamptz not null default now(),
  check (value is not null or null_reason is not null),
  check (denominator is null or denominator >= 0),
  check (numerator is null or numerator >= 0)
);

create unique index if not exists kpi_metric_snapshots_run_metric_dimension_key
  on public.kpi_metric_snapshots(run_id, metric_id, dimension_key);
create index if not exists kpi_metric_snapshots_metric_run_idx
  on public.kpi_metric_snapshots(metric_id, run_id);

alter table public.kpi_aggregation_runs enable row level security;
alter table public.kpi_metric_snapshots enable row level security;
revoke all on table public.kpi_aggregation_runs from public, anon, authenticated;
revoke all on table public.kpi_metric_snapshots from public, anon, authenticated;
grant all on table public.kpi_aggregation_runs to service_role;
grant all on table public.kpi_metric_snapshots to service_role;
grant usage, select on sequence public.kpi_metric_snapshots_id_seq to service_role;
