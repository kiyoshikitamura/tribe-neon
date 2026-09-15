-- Additive first-touch Acquisition Attribution on top of migration 249.
-- Migration 249 tables and functions remain unchanged and authoritative.

do $preflight$
begin
  if to_regclass('public.kpi_acquisition_journeys') is null
     or to_regclass('public.kpi_acquisition_journey_facts') is null
     or to_regclass('public.kpi_acquisition_subject_bindings') is null then
    raise exception 'KPI acquisition authority (20260906000249) is required';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'kpi_acquisition_journeys'
      and column_name = 'started_at'
  ) then
    raise exception 'Unexpected kpi_acquisition_journeys timestamp contract';
  end if;
  if to_regprocedure('public.begin_kpi_acquisition_journey_v1(text,text)') is null
     or to_regprocedure('public.record_kpi_acquisition_observation_v1(text,text,text,jsonb,text)') is null
     or to_regprocedure('public.bind_kpi_acquisition_subject_v1(text,text)') is null then
    raise exception 'KPI acquisition RPC authority (20260906000249) is required';
  end if;
end;
$preflight$;

alter table public.kpi_acquisition_journeys
  add column first_arrived_at timestamptz generated always as (started_at) stored,
  add column metadata jsonb not null default '{}'::jsonb;

create function public.kpi_v250_landing_metadata_valid(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then false
    when octet_length(p_metadata::text) > 4096 then false
    when not p_metadata ?& array[
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'referrer', 'landing_path', 'fbclid', 'x_click_id'
    ] then false
    when p_metadata->>'utm_source' not in ('x', 'meta', 'organic', 'direct', 'unknown') then false
    else not exists (
      select 1
      from jsonb_each(p_metadata) entry
      where entry.key not in (
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
          'referrer', 'landing_path', 'fbclid', 'x_click_id'
        )
        or jsonb_typeof(entry.value) not in ('string', 'null')
        or (
          jsonb_typeof(entry.value) = 'string'
          and length(entry.value #>> '{}') > case
            when entry.key in ('referrer', 'landing_path') then 1024
            else 256
          end
        )
    )
  end;
$function$;

revoke all on function public.kpi_v250_landing_metadata_valid(jsonb)
  from public, anon, authenticated, service_role;

alter table public.kpi_acquisition_journeys
  add constraint kpi_acquisition_journeys_metadata_check
  check (metadata = '{}'::jsonb or public.kpi_v250_landing_metadata_valid(metadata));

create index kpi_acquisition_journeys_landing_source_idx
  on public.kpi_acquisition_journeys (
    (metadata->>'utm_source'), first_arrived_at, journey_id
  );

create index kpi_acquisition_journeys_creative_idx
  on public.kpi_acquisition_journeys (
    (metadata->>'utm_campaign'), (metadata->>'utm_content'), first_arrived_at
  );

-- Landing is the only new write surface. It composes migration 249's begin and
-- observation RPCs, preserving their token, source, ACL, and idempotency rules.
create function public.record_kpi_acquisition_landing_v1(
  p_token text,
  p_metadata jsonb,
  p_source text default 'web_v1'::text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_journey uuid;
  v_existing_metadata jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or p_source is null or p_source <> 'web_v1'
     or not public.kpi_v250_landing_metadata_valid(p_metadata)
     or auth.jwt()->>'role' is null
     or auth.jwt()->>'role' not in ('anon', 'authenticated', 'service_role') then
    raise exception 'Invalid acquisition Landing' using errcode = '22023';
  end if;

  v_journey := public.begin_kpi_acquisition_journey_v1(p_token, p_source);

  select metadata
  into v_existing_metadata
  from public.kpi_acquisition_journeys
  where journey_id = v_journey
  for update;

  if v_existing_metadata <> '{}'::jsonb
     and v_existing_metadata is distinct from p_metadata then
    raise exception 'Conflicting Landing attribution retry' using errcode = '23505';
  end if;

  if v_existing_metadata = '{}'::jsonb then
    update public.kpi_acquisition_journeys
    set metadata = p_metadata
    where journey_id = v_journey;
  end if;

  perform public.record_kpi_acquisition_observation_v1(
    p_token,
    'TITLE_ARRIVED',
    'title_arrived:v1',
    '{}'::jsonb,
    p_source
  );

  return v_journey;
end;
$function$;

revoke all on function public.record_kpi_acquisition_landing_v1(text,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_kpi_acquisition_landing_v1(text,jsonb,text)
  to anon, authenticated, service_role;

comment on column public.kpi_acquisition_journeys.first_arrived_at is
  'Compatibility-preserving alias of started_at for first Landing time.';
comment on column public.kpi_acquisition_journeys.metadata is
  'Immutable first-touch UTM, referrer, Landing path, and click identifier attribution envelope.';
