-- Durable KPI facts. These tables deliberately do not reference gameplay users/guilds.

create table if not exists public.kpi_subjects (
  subject_id uuid primary key default gen_random_uuid(),
  source_user_id uuid,
  registered_at timestamptz not null,
  registration_type text not null check (registration_type in ('anonymous', 'authenticated', 'unknown')),
  first_authenticated_at timestamptz,
  detached_at timestamptz,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (detached_at is null or source_user_id is null)
);

create unique index if not exists kpi_subjects_source_user_active_key
  on public.kpi_subjects(source_user_id)
  where source_user_id is not null;
create index if not exists kpi_subjects_registered_at_idx
  on public.kpi_subjects(registered_at);
create index if not exists kpi_subjects_first_authenticated_at_idx
  on public.kpi_subjects(first_authenticated_at)
  where first_authenticated_at is not null;

create table if not exists public.kpi_daily_user_activity (
  activity_date date not null,
  subject_id uuid not null references public.kpi_subjects(subject_id) on delete restrict,
  first_active_at timestamptz not null,
  last_active_at timestamptz not null,
  source text not null default 'sync_active_users',
  primary key (activity_date, subject_id),
  check (last_active_at >= first_active_at)
);

create table if not exists public.kpi_account_classification_periods (
  id bigint generated always as identity primary key,
  subject_id uuid not null references public.kpi_subjects(subject_id) on delete restrict,
  classification text not null check (classification in ('normal', 'admin', 'qa', 'test', 'fraud_suspended')),
  valid_from timestamptz not null,
  valid_to timestamptz,
  reason text not null,
  changed_by uuid,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);
create index if not exists kpi_account_classification_periods_lookup_idx
  on public.kpi_account_classification_periods(subject_id, valid_from, valid_to);

create table if not exists public.kpi_guild_membership_periods (
  id bigint generated always as identity primary key,
  guild_id uuid not null,
  subject_id uuid not null references public.kpi_subjects(subject_id) on delete restrict,
  joined_at timestamptz not null,
  left_at timestamptz,
  leave_reason text check (leave_reason is null or leave_reason in ('join', 'leave', 'kick', 'transfer', 'disband', 'unknown')),
  source_membership_id uuid,
  created_at timestamptz not null default now(),
  check (left_at is null or left_at >= joined_at)
);
create unique index if not exists kpi_guild_membership_one_open_per_subject_key
  on public.kpi_guild_membership_periods(subject_id)
  where left_at is null;
create index if not exists kpi_guild_membership_guild_period_idx
  on public.kpi_guild_membership_periods(guild_id, joined_at, left_at);
create index if not exists kpi_guild_membership_subject_period_idx
  on public.kpi_guild_membership_periods(subject_id, joined_at, left_at);

create table if not exists public.kpi_tutorial_completion_facts (
  subject_id uuid primary key references public.kpi_subjects(subject_id) on delete restrict,
  completed_at timestamptz not null,
  tutorial_version text,
  source text not null default 'tutorial_progress'
);
create index if not exists kpi_tutorial_completion_completed_idx
  on public.kpi_tutorial_completion_facts(completed_at, subject_id);

create table if not exists public.kpi_gacha_execution_facts (
  subject_id uuid not null references public.kpi_subjects(subject_id) on delete restrict,
  request_id uuid not null,
  gacha_id text not null,
  gacha_type text not null check (gacha_type in ('CHARACTER', 'SKILL', 'EQUIPMENT')),
  payment_source text not null check (payment_source in ('free', 'cash', 'diamonds', 'ticket')),
  pull_count integer not null check (pull_count between 1 and 10),
  completed_at timestamptz not null,
  primary key (subject_id, request_id)
);
create index if not exists kpi_gacha_execution_completed_type_idx
  on public.kpi_gacha_execution_facts(completed_at, gacha_type);

alter table public.kpi_subjects enable row level security;
alter table public.kpi_daily_user_activity enable row level security;
alter table public.kpi_account_classification_periods enable row level security;
alter table public.kpi_guild_membership_periods enable row level security;
alter table public.kpi_tutorial_completion_facts enable row level security;
alter table public.kpi_gacha_execution_facts enable row level security;

revoke all on table public.kpi_subjects from public, anon, authenticated;
revoke all on table public.kpi_daily_user_activity from public, anon, authenticated;
revoke all on table public.kpi_account_classification_periods from public, anon, authenticated;
revoke all on table public.kpi_guild_membership_periods from public, anon, authenticated;
revoke all on table public.kpi_tutorial_completion_facts from public, anon, authenticated;
revoke all on table public.kpi_gacha_execution_facts from public, anon, authenticated;

grant all on table public.kpi_subjects to service_role;
grant all on table public.kpi_daily_user_activity to service_role;
grant all on table public.kpi_account_classification_periods to service_role;
grant all on table public.kpi_guild_membership_periods to service_role;
grant all on table public.kpi_tutorial_completion_facts to service_role;
grant all on table public.kpi_gacha_execution_facts to service_role;
grant usage, select on sequence public.kpi_account_classification_periods_id_seq to service_role;
grant usage, select on sequence public.kpi_guild_membership_periods_id_seq to service_role;
