-- M1: additive canonical authority facts. Existing KPI/gameplay semantics and
-- data are not replaced, rewritten, merged, refreshed or deleted.

create function public.kpi_v249_metadata_valid(p_metadata jsonb)
returns boolean language sql immutable set search_path = public, pg_temp
as $$
  select case when p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then false
    when octet_length(p_metadata::text) > 512 then false
    else not exists (
      select 1 from jsonb_each(p_metadata) e
      where e.key <> 'qa' or jsonb_typeof(e.value) <> 'boolean'
    ) end;
$$;

create table public.kpi_acquisition_journeys (
  journey_id uuid primary key default gen_random_uuid(),
  journey_token_hash text unique not null check (journey_token_hash ~ '^[a-f0-9]{64}$'),
  started_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('web_v1','server_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  created_at timestamptz not null default clock_timestamp()
);

create table public.kpi_acquisition_journey_facts (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.kpi_acquisition_journeys on delete restrict,
  event_type text not null check (event_type in
    ('TITLE_ARRIVED','TAP_TO_START','WORLD_INTRO_STARTED','WORLD_INTRO_COMPLETED','NAME_COMPLETED')),
  occurred_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('web_v1','server_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata)),
  unique(journey_id, idempotency_key)
);
create index kpi_acquisition_journey_facts_timeline_idx
  on public.kpi_acquisition_journey_facts(journey_id, occurred_at, id);

create table public.kpi_acquisition_subject_bindings (
  journey_id uuid primary key references public.kpi_acquisition_journeys on delete restrict,
  subject_id uuid not null references public.kpi_subjects on delete restrict,
  bound_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('web_v1','server_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1)
);
create index kpi_acquisition_bindings_subject_idx on public.kpi_acquisition_subject_bindings(subject_id);

create table public.kpi_tutorial_journey_facts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.kpi_subjects on delete restrict,
  fact_type text not null check (fact_type in
    ('TUTORIAL_GACHA_COMPLETED','TUTORIAL_BATTLE_COMPLETED','AUTH_CHOICE_SELECTED',
     'AUTH_CHOICE_RESOLVED','FIRST_MYPAGE_ACCESS_CONFIRMED')),
  occurred_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('server_v1','mypage_handshake_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  tutorial_version text not null check (tutorial_version ~ '^[A-Za-z0-9_.-]{1,64}$'),
  context_id uuid not null,
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata)),
  unique(subject_id, idempotency_key)
);
create unique index kpi_tutorial_first_mypage_subject_key
  on public.kpi_tutorial_journey_facts(subject_id)
  where fact_type = 'FIRST_MYPAGE_ACCESS_CONFIRMED';
create index kpi_tutorial_journey_timeline_idx on public.kpi_tutorial_journey_facts(subject_id, occurred_at);

create table public.kpi_tutorial_mypage_ready_contexts (
  context_id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.kpi_subjects on delete restrict,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  profile_ready boolean not null,
  onboarding_ready boolean not null,
  identity_leader_ready boolean not null,
  guild_membership_resolved boolean not null,
  guild_membership_status text not null check (guild_membership_status in ('MEMBER','NOT_MEMBER')),
  tutorial_version text not null check (tutorial_version ~ '^[A-Za-z0-9_.-]{1,64}$'),
  source text not null check (source in ('mypage_handshake_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  acknowledged_at timestamptz,
  check (expires_at > issued_at),
  unique(subject_id,idempotency_key)
);
create index kpi_tutorial_mypage_context_expiry_idx
  on public.kpi_tutorial_mypage_ready_contexts(subject_id,expires_at desc);

create table public.kpi_subject_identity_transition_facts (
  id uuid primary key default gen_random_uuid(),
  from_subject_id uuid not null references public.kpi_subjects on delete restrict,
  to_subject_id uuid not null references public.kpi_subjects on delete restrict,
  transition_type text not null check (transition_type in ('AUTH_LINK_SAME_SUBJECT','ACCOUNT_SWITCH_TO_EXISTING')),
  occurred_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('server_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  idempotency_key text unique not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  context_id uuid not null,
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata)),
  check ((transition_type = 'AUTH_LINK_SAME_SUBJECT' and from_subject_id = to_subject_id)
      or (transition_type = 'ACCOUNT_SWITCH_TO_EXISTING' and from_subject_id <> to_subject_id))
);
create index kpi_identity_transition_from_idx on public.kpi_subject_identity_transition_facts(from_subject_id, occurred_at);
create index kpi_identity_transition_to_idx on public.kpi_subject_identity_transition_facts(to_subject_id, occurred_at);

create table public.kpi_guild_conversion_facts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.kpi_subjects on delete restrict,
  guild_id uuid not null,
  membership_period_id bigint unique not null references public.kpi_guild_membership_periods(id) on delete restrict,
  conversion_type text not null check (conversion_type in ('CREATE','JOIN')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('server_v1','proven_backfill_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  idempotency_key text unique not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata))
);
create index kpi_guild_conversion_subject_idx on public.kpi_guild_conversion_facts(subject_id, occurred_at);

create table public.kpi_guild_chat_message_facts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.kpi_subjects on delete restrict,
  guild_id uuid not null,
  membership_period_id bigint not null references public.kpi_guild_membership_periods(id) on delete restrict,
  source_message_id uuid unique not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('server_v1','surviving_message_backfill_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1),
  idempotency_key text unique not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata))
);
create index kpi_guild_chat_daily_idx on public.kpi_guild_chat_message_facts(guild_id, occurred_at, subject_id);
create index kpi_guild_chat_membership_idx on public.kpi_guild_chat_message_facts(membership_period_id, occurred_at, source_message_id);

create table public.kpi_guild_chat_activation_facts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.kpi_subjects on delete restrict,
  guild_id uuid not null,
  membership_period_id bigint unique not null references public.kpi_guild_membership_periods(id) on delete restrict,
  first_message_fact_id uuid unique not null references public.kpi_guild_chat_message_facts(id) on delete restrict,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('server_v1','qa_v1')),
  schema_version integer not null default 1 check (schema_version = 1)
);

create table public.kpi_marketing_import_batches (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform = 'X'),
  source text not null check (source in ('x_ads_manager_manual','x_ads_manager_import')),
  imported_at timestamptz not null default clock_timestamp(),
  actor_identifier uuid not null,
  file_hash text check (file_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text unique not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  schema_version integer not null default 1 check (schema_version = 1),
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata))
);

-- Coverage scope prevents campaign and creative aggregates from being added together.
-- A future grain change requires an explicit versioned coverage contract, not an UPDATE.
create table public.kpi_marketing_reporting_scopes (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform = 'X'),
  report_date_jst date not null,
  account_key text not null check (length(btrim(account_key)) between 1 and 128),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reporting_grain text not null check (reporting_grain in ('CAMPAIGN','LINE_ITEM','CREATIVE')),
  unique(platform, report_date_jst, account_key, currency),
  unique(id, platform, report_date_jst, account_key, currency, reporting_grain)
);

create table public.kpi_marketing_daily_fact_revisions (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null,
  platform text not null check (platform = 'X'),
  report_date_jst date not null,
  source_timezone text not null check (source_timezone = 'Asia/Tokyo'),
  account_key text not null,
  campaign_key text not null check (length(btrim(campaign_key)) between 1 and 128),
  campaign_name text check (length(campaign_name) <= 256),
  line_item_key text check (length(btrim(line_item_key)) between 1 and 128),
  line_item_name text check (length(line_item_name) <= 256),
  creative_key text check (length(btrim(creative_key)) between 1 and 128),
  creative_name text check (length(creative_name) <= 256),
  reporting_grain text not null,
  spend numeric(20,6) not null check (spend >= 0 and spend <> 'NaN'::numeric),
  currency text not null,
  impressions bigint not null check (impressions >= 0),
  clicks bigint not null check (clicks >= 0),
  external_key text not null check (length(btrim(external_key)) between 1 and 256),
  revision integer not null check (revision > 0),
  batch_id uuid not null references public.kpi_marketing_import_batches on delete restrict,
  imported_at timestamptz not null default clock_timestamp(),
  idempotency_key text unique not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}' check (public.kpi_v249_metadata_valid(metadata)),
  foreign key (scope_id,platform,report_date_jst,account_key,currency,reporting_grain)
    references public.kpi_marketing_reporting_scopes(id,platform,report_date_jst,account_key,currency,reporting_grain) on delete restrict,
  unique(scope_id,external_key,revision),
  unique nulls not distinct(scope_id,campaign_key,line_item_key,creative_key,revision),
  check ((reporting_grain = 'CAMPAIGN' and line_item_key is null and creative_key is null)
      or (reporting_grain = 'LINE_ITEM' and line_item_key is not null and creative_key is null)
      or (reporting_grain = 'CREATIVE' and creative_key is not null)),
  check (line_item_key is not null or line_item_name is null),
  check (creative_key is not null or creative_name is null)
);

create view public.kpi_canonical_tutorial_completions_v1 with (security_invoker = true) as
select subject_id, occurred_at as completed_at, tutorial_version, context_id, source
from public.kpi_tutorial_journey_facts where fact_type = 'FIRST_MYPAGE_ACCESS_CONFIRMED';

create view public.kpi_guild_daily_chat_activity_v1 with (security_invoker = true) as
select guild_id, (occurred_at at time zone 'Asia/Tokyo')::date as activity_date_jst,
       count(distinct subject_id) as chat_active_uu, count(*) as message_count
from public.kpi_guild_chat_message_facts f
where not public.kpi_is_subject_excluded(f.subject_id,f.occurred_at)
group by guild_id, (occurred_at at time zone 'Asia/Tokyo')::date;

create view public.kpi_effective_active_guild_daily_v1 with (security_invoker = true) as
with game_activity as (
  select m.guild_id,a.activity_date,count(distinct a.subject_id) game_active_members
  from public.kpi_daily_user_activity a
  join public.kpi_guild_membership_periods m on m.subject_id=a.subject_id
    and m.joined_at < public.kpi_jst_day_start(a.activity_date+1)
    and (m.left_at is null or m.left_at >= public.kpi_jst_day_start(a.activity_date+1))
  where not public.kpi_is_subject_excluded(a.subject_id,a.last_active_at)
  group by m.guild_id,a.activity_date
), chat_activity as (
  select guild_id,activity_date_jst activity_date,chat_active_uu
  from public.kpi_guild_daily_chat_activity_v1
)
select g.guild_id,g.activity_date,g.game_active_members,
       coalesce(c.chat_active_uu,0) guild_chat_active_members,
       g.game_active_members >= 3 as is_active_guild,
       g.game_active_members >= 3 and coalesce(c.chat_active_uu,0) >= 2 as is_effective_active_guild
from game_activity g left join chat_activity c using(guild_id,activity_date);

create view public.kpi_marketing_latest_revisions_v1 with (security_invoker = true) as
with latest as (
  select distinct on (scope_id, external_key) r.*
  from public.kpi_marketing_daily_fact_revisions r
  order by scope_id, external_key, revision desc
)
select l.*, l.clicks::numeric / nullif(l.impressions,0) as ctr,
       l.spend / nullif(l.clicks,0) as cpc,
       l.spend * 1000 / nullif(l.impressions,0) as cpm,
       case when l.impressions = 0 then 'zero_denominator' end as ctr_null_reason,
       case when l.clicks = 0 then 'zero_denominator' end as cpc_null_reason,
       case when l.impressions = 0 then 'zero_denominator' end as cpm_null_reason,
       l.currency = 'JPY' as jpy_gate_eligible
from latest l join public.kpi_marketing_import_batches b on b.id = l.batch_id
where not coalesce((b.metadata->>'qa')::boolean,false);

-- Apply explicit policies to this migration's objects only. No inherited/default
-- grants may give direct write access to a client or service-role caller.
do $security$
declare n text;
begin
  foreach n in array array[
    'kpi_acquisition_journeys','kpi_acquisition_journey_facts','kpi_acquisition_subject_bindings',
    'kpi_tutorial_journey_facts','kpi_tutorial_mypage_ready_contexts',
    'kpi_subject_identity_transition_facts','kpi_guild_conversion_facts',
    'kpi_guild_chat_message_facts','kpi_guild_chat_activation_facts','kpi_marketing_import_batches',
    'kpi_marketing_reporting_scopes','kpi_marketing_daily_fact_revisions'
  ] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role',n);
    execute format('grant select on table public.%I to service_role',n);
  end loop;
end $security$;
revoke all on function public.kpi_v249_metadata_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.kpi_v249_metadata_valid(jsonb) to service_role;
revoke all on public.kpi_canonical_tutorial_completions_v1,public.kpi_guild_daily_chat_activity_v1,
  public.kpi_effective_active_guild_daily_v1,public.kpi_marketing_latest_revisions_v1
  from public, anon, authenticated, service_role;
grant select on public.kpi_canonical_tutorial_completions_v1,public.kpi_guild_daily_chat_activity_v1,
  public.kpi_effective_active_guild_daily_v1,public.kpi_marketing_latest_revisions_v1 to service_role;

create function public.kpi_v249_current_subject()
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_subject uuid; v_user uuid := auth.uid(); v_session uuid;
begin
  if v_user is null or auth.jwt()->>'role' is distinct from 'authenticated' then
    raise exception 'Valid authenticated session required' using errcode = '42501';
  end if;
  begin v_session := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid session context' using errcode = '42501';
  end;
  if v_session is null or not exists (
    select 1 from auth.sessions where id = v_session and user_id = v_user
      and (not_after is null or not_after > clock_timestamp())
  ) then raise exception 'Session is not active' using errcode = '42501'; end if;
  select subject_id into v_subject from public.kpi_subjects
  where source_user_id = v_user and detached_at is null;
  if v_subject is null then
    raise exception 'Game Start subject does not exist' using errcode = '42501';
  end if;
  return v_subject;
end;
$$;

create function public.begin_kpi_acquisition_journey_v1(p_token text, p_source text default 'web_v1')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hash text; v_row public.kpi_acquisition_journeys%rowtype;
begin
  -- Token must be generated with a CSPRNG by the server/browser. Never logged by
  -- the future API. PostgreSQL/API query logging must redact RPC parameters.
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_source is null
     or p_source not in ('web_v1','server_v1','qa_v1')
     or (auth.jwt()->>'role' is distinct from 'service_role' and p_source<>'web_v1') then
    raise exception 'Invalid acquisition request' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('kpi249:journey:'||v_hash,0));
  select * into v_row from public.kpi_acquisition_journeys where journey_token_hash = v_hash;
  if found then
    if v_row.source is distinct from p_source then
      raise exception 'Conflicting journey retry' using errcode = '23505';
    end if;
    return v_row.journey_id;
  end if;
  insert into public.kpi_acquisition_journeys(journey_token_hash,source)
  values(v_hash,p_source) returning * into v_row;
  return v_row.journey_id;
end;
$$;

create function public.record_kpi_acquisition_observation_v1(
  p_token text, p_event_type text, p_idempotency_key text,
  p_metadata jsonb default '{}', p_source text default 'web_v1'
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_journey uuid; v_row public.kpi_acquisition_journey_facts%rowtype;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or p_event_type is null or p_event_type not in
       ('TITLE_ARRIVED','TAP_TO_START','WORLD_INTRO_STARTED','WORLD_INTRO_COMPLETED','NAME_COMPLETED')
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
     or p_source is null or p_source not in ('web_v1','server_v1','qa_v1')
     or not public.kpi_v249_metadata_valid(p_metadata)
     or (auth.jwt()->>'role' is distinct from 'service_role' and (p_source<>'web_v1' or p_metadata ? 'qa')) then
    raise exception 'Invalid acquisition observation' using errcode = '22023';
  end if;
  select journey_id into v_journey from public.kpi_acquisition_journeys
  where journey_token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if v_journey is null then raise exception 'Unknown journey' using errcode = '42501'; end if;
  select * into v_row from public.kpi_acquisition_journey_facts
  where journey_id = v_journey and idempotency_key = p_idempotency_key;
  if found then
    if v_row.event_type is distinct from p_event_type or v_row.source is distinct from p_source
       or v_row.metadata is distinct from p_metadata then
      raise exception 'Conflicting observation retry' using errcode = '23505';
    end if;
    return v_row.id;
  end if;
  -- No inferred ordering and no writes to Game Start subjects. NAME_COMPLETED
  -- is an observation; the successful binding/registered_at remains authority.
  insert into public.kpi_acquisition_journey_facts(journey_id,event_type,idempotency_key,metadata,source)
  values(v_journey,p_event_type,p_idempotency_key,p_metadata,p_source) returning * into v_row;
  return v_row.id;
end;
$$;

create function public.bind_kpi_acquisition_subject_v1(p_token text, p_source text default 'web_v1')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_subject uuid := public.kpi_v249_current_subject(); v_journey uuid;
  v_row public.kpi_acquisition_subject_bindings%rowtype;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_source is null
     or p_source <> 'web_v1' then
    raise exception 'Invalid binding request' using errcode = '22023';
  end if;
  select journey_id into v_journey from public.kpi_acquisition_journeys
  where journey_token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if v_journey is null then raise exception 'Unknown journey' using errcode = '42501'; end if;
  select * into v_row from public.kpi_acquisition_subject_bindings where journey_id = v_journey;
  if found then
    if v_row.subject_id is distinct from v_subject or v_row.source is distinct from p_source then
      raise exception 'Journey already bound with different payload' using errcode = '23505';
    end if;
    return v_row.subject_id;
  end if;
  insert into public.kpi_acquisition_subject_bindings(journey_id,subject_id,source)
  values(v_journey,v_subject,p_source);
  return v_subject;
end;
$$;

revoke all on function public.kpi_v249_current_subject() from public,anon,authenticated,service_role;
revoke all on function public.begin_kpi_acquisition_journey_v1(text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_kpi_acquisition_observation_v1(text,text,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.bind_kpi_acquisition_subject_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_kpi_acquisition_journey_v1(text,text) to anon,authenticated,service_role;
grant execute on function public.record_kpi_acquisition_observation_v1(text,text,text,jsonb,text) to anon,authenticated,service_role;
grant execute on function public.bind_kpi_acquisition_subject_v1(text,text) to authenticated;

create function public.issue_kpi_mypage_ready_context_v1(
  p_tutorial_version text, p_idempotency_key text, p_source text default 'mypage_handshake_v1'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_subject uuid := public.kpi_v249_current_subject(); v_user uuid := auth.uid();
  v_context public.kpi_tutorial_mypage_ready_contexts%rowtype; v_leader text;
  v_step text; v_completed timestamptz; v_guild uuid; v_profile_guild uuid; v_member_count int;
begin
  if p_tutorial_version is null or p_tutorial_version !~ '^[A-Za-z0-9_.-]{1,64}$'
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
     or p_source not in ('mypage_handshake_v1','qa_v1') then
    raise exception 'Invalid My Page context request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kpi249:mypage:'||v_subject||':'||p_idempotency_key,0));
  select * into v_context from public.kpi_tutorial_mypage_ready_contexts
    where subject_id=v_subject and idempotency_key=p_idempotency_key;
  if found then
    if v_context.tutorial_version is distinct from p_tutorial_version or v_context.source is distinct from p_source then
      raise exception 'Conflicting My Page context retry' using errcode='23505'; end if;
    return jsonb_build_object('context_id',v_context.context_id,'expires_at',v_context.expires_at,
      'profile_ready',v_context.profile_ready,'onboarding_ready',v_context.onboarding_ready,
      'identity_leader_ready',v_context.identity_leader_ready,
      'guild_membership_resolved',v_context.guild_membership_resolved,
      'guild_membership_status',v_context.guild_membership_status);
  end if;
  select favorite_character_id,guild_id into v_leader,v_profile_guild from public.users
    where id=v_user and nullif(btrim(username),'') is not null;
  if not found then raise exception 'Profile is not ready' using errcode='23514'; end if;
  select step_id,completed_at into v_step,v_completed from public.tutorial_progress where user_id=v_user;
  if v_step not in ('COMPLETE','AUTHENTICATION') or v_completed is null then
    raise exception 'Onboarding is not ready' using errcode='23514'; end if;
  if v_leader is null or not exists(select 1 from public.user_characters where user_id=v_user and character_id=v_leader) then
    raise exception 'Identity leader is not ready' using errcode='23514'; end if;
  select count(*),(array_agg(guild_id))[1] into v_member_count,v_guild from public.guild_members where user_id=v_user;
  if v_member_count > 1 or (v_member_count=1 and (v_profile_guild is distinct from v_guild
       or not exists(select 1 from public.guilds where id=v_guild and not is_disbanded)))
     or (v_member_count=0 and v_profile_guild is not null) then
    raise exception 'Guild membership is inconsistent' using errcode='23514'; end if;
  insert into public.kpi_tutorial_mypage_ready_contexts(subject_id,expires_at,profile_ready,onboarding_ready,
    identity_leader_ready,guild_membership_resolved,guild_membership_status,tutorial_version,source,idempotency_key)
  values(v_subject,clock_timestamp()+interval '10 minutes',true,true,true,true,
    case when v_member_count=1 then 'MEMBER' else 'NOT_MEMBER' end,p_tutorial_version,p_source,p_idempotency_key)
  returning * into v_context;
  return jsonb_build_object('context_id',v_context.context_id,'expires_at',v_context.expires_at,
    'profile_ready',true,'onboarding_ready',true,'identity_leader_ready',true,
    'guild_membership_resolved',true,'guild_membership_status',v_context.guild_membership_status);
end;
$$;

create function public.acknowledge_kpi_first_mypage_access_v1(
  p_context_id uuid,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_subject uuid := public.kpi_v249_current_subject(); v_context public.kpi_tutorial_mypage_ready_contexts%rowtype;
  v_fact public.kpi_tutorial_journey_facts%rowtype; v_ready jsonb;
begin
  if p_context_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$' then
    raise exception 'Invalid My Page acknowledgement' using errcode='22023'; end if;
  select * into v_context from public.kpi_tutorial_mypage_ready_contexts where context_id=p_context_id for update;
  if not found or v_context.subject_id<>v_subject or v_context.expires_at<=clock_timestamp()
    or not (v_context.profile_ready and v_context.onboarding_ready and v_context.identity_leader_ready
      and v_context.guild_membership_resolved) then
    raise exception 'Invalid or expired My Page context' using errcode='42501'; end if;
  -- Re-run all four server checks; a stale context cannot become canonical.
  v_ready := public.issue_kpi_mypage_ready_context_v1(v_context.tutorial_version,'recheck:'||p_idempotency_key,v_context.source);
  select * into v_fact from public.kpi_tutorial_journey_facts
    where subject_id=v_subject and fact_type='FIRST_MYPAGE_ACCESS_CONFIRMED';
  if found then
    if v_fact.idempotency_key is distinct from p_idempotency_key or v_fact.context_id is distinct from p_context_id then
      -- Subject-level canonical first fact wins; a new client attempt returns it
      -- only when this context was already acknowledged to that fact.
      if v_context.acknowledged_at is null then raise exception 'Canonical first My Page fact already exists' using errcode='23505'; end if;
    end if;
    return v_fact.id;
  end if;
  insert into public.kpi_tutorial_journey_facts(subject_id,fact_type,source,idempotency_key,
    tutorial_version,context_id,metadata)
  values(v_subject,'FIRST_MYPAGE_ACCESS_CONFIRMED',v_context.source,p_idempotency_key,
    v_context.tutorial_version,p_context_id,'{}') returning * into v_fact;
  update public.kpi_tutorial_mypage_ready_contexts set acknowledged_at=clock_timestamp()
    where context_id=p_context_id and acknowledged_at is null;
  return v_fact.id;
end;
$$;

create function public.record_kpi_subject_identity_transition_v1(
  p_from_subject_id uuid,p_to_subject_id uuid,p_transition_type text,p_context_id uuid,
  p_idempotency_key text,p_metadata jsonb default '{}',p_source text default 'server_v1'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.kpi_subject_identity_transition_facts%rowtype;
begin
  if p_transition_type not in ('AUTH_LINK_SAME_SUBJECT','ACCOUNT_SWITCH_TO_EXISTING')
    or p_from_subject_id is null or p_to_subject_id is null or p_context_id is null
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
    or p_source not in ('server_v1','qa_v1') or not public.kpi_v249_metadata_valid(p_metadata)
    or not exists(select 1 from public.kpi_subjects where subject_id=p_from_subject_id)
    or not exists(select 1 from public.kpi_subjects where subject_id=p_to_subject_id) then
    raise exception 'Invalid identity transition' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kpi249:identity:'||p_idempotency_key,0));
  select * into v_row from public.kpi_subject_identity_transition_facts where idempotency_key=p_idempotency_key;
  if found then
    if to_jsonb(v_row)-array['id','occurred_at','recorded_at'] is distinct from
      jsonb_build_object('from_subject_id',p_from_subject_id,'to_subject_id',p_to_subject_id,
       'transition_type',p_transition_type,'source',p_source,'schema_version',1,'idempotency_key',p_idempotency_key,
       'context_id',p_context_id,'metadata',p_metadata) then
      raise exception 'Conflicting identity retry' using errcode='23505'; end if;
    return v_row.id;
  end if;
  insert into public.kpi_subject_identity_transition_facts(from_subject_id,to_subject_id,transition_type,
    source,idempotency_key,context_id,metadata)
  values(p_from_subject_id,p_to_subject_id,p_transition_type,p_source,p_idempotency_key,p_context_id,p_metadata)
  returning * into v_row; return v_row.id;
end;
$$;

create function public.on_kpi_v249_guild_member_joined()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_period bigint; v_subject uuid; v_type text;
begin
  select p.id,p.subject_id into v_period,v_subject from public.kpi_guild_membership_periods p
    join public.kpi_subjects s on s.subject_id=p.subject_id
    where p.source_membership_id=new.id and s.source_user_id=new.user_id;
  if v_period is null then raise exception 'KPI membership period missing'; end if;
  select case when g.leader_id=new.user_id and new.role='MASTER' then 'CREATE' else 'JOIN' end
    into v_type from public.guilds g where g.id=new.guild_id;
  insert into public.kpi_guild_conversion_facts(subject_id,guild_id,membership_period_id,conversion_type,
    occurred_at,source,idempotency_key)
  values(v_subject,new.guild_id,v_period,v_type,new.joined_at,'server_v1','guild-membership:'||new.id);
  return new;
end;
$$;
create trigger zz_kpi_v249_guild_member_joined after insert on public.guild_members
for each row execute function public.on_kpi_v249_guild_member_joined();

create function public.on_kpi_v249_guild_chat_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_period bigint; v_subject uuid; v_fact uuid;
begin
  if new.target_type<>'GUILD' or new.user_id is null or new.is_system then return new; end if;
  select p.id,p.subject_id into v_period,v_subject from public.kpi_guild_membership_periods p
    join public.kpi_subjects s on s.subject_id=p.subject_id
    where s.source_user_id=new.user_id and p.guild_id=new.target_id and p.joined_at<=new.created_at
      and (p.left_at is null or new.created_at<=p.left_at)
    order by p.joined_at desc limit 1;
  if v_period is null then raise exception 'Guild chat membership period missing'; end if;
  insert into public.kpi_guild_chat_message_facts(subject_id,guild_id,membership_period_id,source_message_id,
    occurred_at,source,idempotency_key)
  values(v_subject,new.target_id,v_period,new.id,new.created_at,'server_v1','guild-message:'||new.id)
  returning id into v_fact;
  insert into public.kpi_guild_chat_activation_facts(subject_id,guild_id,membership_period_id,
    first_message_fact_id,occurred_at,source)
  values(v_subject,new.target_id,v_period,v_fact,new.created_at,'server_v1')
  on conflict(membership_period_id) do nothing;
  return new;
end;
$$;
create trigger zz_kpi_v249_guild_chat_message after insert on public.board_posts
for each row execute function public.on_kpi_v249_guild_chat_message();

create function public.create_kpi_marketing_import_batch_v1(
  p_source text,p_actor_identifier uuid,p_file_hash text,p_idempotency_key text,p_metadata jsonb default '{}'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.kpi_marketing_import_batches%rowtype; v_admin boolean;
begin
  v_admin := auth.jwt()->>'role'='service_role' or coalesce(auth.jwt()->'app_metadata'->>'role','')='admin';
  if not v_admin or p_source not in ('x_ads_manager_manual','x_ads_manager_import')
    or p_actor_identifier is null or (p_file_hash is not null and p_file_hash !~ '^[a-f0-9]{64}$')
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
    or not public.kpi_v249_metadata_valid(p_metadata)
    or (auth.jwt()->>'role'<>'service_role' and p_actor_identifier is distinct from auth.uid()) then
    raise exception 'Invalid marketing batch request' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kpi249:marketing-batch:'||p_idempotency_key,0));
  select * into v_row from public.kpi_marketing_import_batches where idempotency_key=p_idempotency_key;
  if found then
    if v_row.source is distinct from p_source or v_row.actor_identifier is distinct from p_actor_identifier
      or v_row.file_hash is distinct from p_file_hash or v_row.metadata is distinct from p_metadata then
      raise exception 'Conflicting marketing batch retry' using errcode='23505'; end if;
    return v_row.id; end if;
  insert into public.kpi_marketing_import_batches(platform,source,actor_identifier,file_hash,idempotency_key,metadata)
  values('X',p_source,p_actor_identifier,p_file_hash,p_idempotency_key,p_metadata) returning * into v_row;
  return v_row.id;
end;
$$;

create function public.record_kpi_marketing_daily_revision_v1(
  p_batch_id uuid,p_report_date_jst date,p_account_key text,p_campaign_key text,p_campaign_name text,
  p_line_item_key text,p_line_item_name text,p_creative_key text,p_creative_name text,
  p_reporting_grain text,p_spend numeric,p_currency text,p_impressions bigint,p_clicks bigint,
  p_external_key text,p_revision integer,p_idempotency_key text,p_metadata jsonb default '{}'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.kpi_marketing_daily_fact_revisions%rowtype; v_scope uuid; v_payload text;
begin
  if not (auth.jwt()->>'role'='service_role' or coalesce(auth.jwt()->'app_metadata'->>'role','')='admin')
    or not exists(select 1 from public.kpi_marketing_import_batches where id=p_batch_id)
    or not public.kpi_v249_metadata_valid(p_metadata) then
    raise exception 'Invalid marketing revision request' using errcode='42501'; end if;
  v_payload:=jsonb_build_object('batch_id',p_batch_id,'date',p_report_date_jst,'account',p_account_key,
    'campaign',p_campaign_key,'campaign_name',p_campaign_name,'line_item',p_line_item_key,
    'line_item_name',p_line_item_name,'creative',p_creative_key,'creative_name',p_creative_name,
    'grain',p_reporting_grain,'spend',p_spend,'currency',p_currency,'impressions',p_impressions,
    'clicks',p_clicks,'external_key',p_external_key,'revision',p_revision,'metadata',p_metadata)::text;
  perform pg_advisory_xact_lock(hashtextextended('kpi249:marketing:'||p_idempotency_key,0));
  select * into v_row from public.kpi_marketing_daily_fact_revisions where idempotency_key=p_idempotency_key;
  if found then
    if v_row.payload_hash<>encode(sha256(convert_to(v_payload,'UTF8')),'hex') then
      raise exception 'Conflicting marketing revision retry' using errcode='23505'; end if;
    return v_row.id; end if;
  insert into public.kpi_marketing_reporting_scopes(platform,report_date_jst,account_key,currency,reporting_grain)
  values('X',p_report_date_jst,p_account_key,p_currency,p_reporting_grain)
  on conflict(platform,report_date_jst,account_key,currency) do update set reporting_grain=excluded.reporting_grain
    where public.kpi_marketing_reporting_scopes.reporting_grain=excluded.reporting_grain
  returning id into v_scope;
  if v_scope is null then raise exception 'Mixed reporting grain for coverage scope' using errcode='23505'; end if;
  insert into public.kpi_marketing_daily_fact_revisions(scope_id,platform,report_date_jst,source_timezone,
    account_key,campaign_key,campaign_name,line_item_key,line_item_name,creative_key,creative_name,
    reporting_grain,spend,currency,impressions,clicks,external_key,revision,batch_id,idempotency_key,payload_hash,metadata)
  values(v_scope,'X',p_report_date_jst,'Asia/Tokyo',p_account_key,p_campaign_key,p_campaign_name,
    p_line_item_key,p_line_item_name,p_creative_key,p_creative_name,p_reporting_grain,p_spend,p_currency,
    p_impressions,p_clicks,p_external_key,p_revision,p_batch_id,p_idempotency_key,
    encode(sha256(convert_to(v_payload,'UTF8')),'hex'),p_metadata) returning * into v_row;
  return v_row.id;
end;
$$;

revoke all on function public.issue_kpi_mypage_ready_context_v1(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.acknowledge_kpi_first_mypage_access_v1(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.record_kpi_subject_identity_transition_v1(uuid,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.on_kpi_v249_guild_member_joined() from public,anon,authenticated,service_role;
revoke all on function public.on_kpi_v249_guild_chat_message() from public,anon,authenticated,service_role;
revoke all on function public.create_kpi_marketing_import_batch_v1(text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.record_kpi_marketing_daily_revision_v1(uuid,date,text,text,text,text,text,text,text,text,numeric,text,bigint,bigint,text,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.issue_kpi_mypage_ready_context_v1(text,text,text),public.acknowledge_kpi_first_mypage_access_v1(uuid,text) to authenticated;
grant execute on function public.record_kpi_subject_identity_transition_v1(uuid,uuid,text,uuid,text,jsonb,text),
  public.create_kpi_marketing_import_batch_v1(text,uuid,text,text,jsonb),
  public.record_kpi_marketing_daily_revision_v1(uuid,date,text,text,text,text,text,text,text,text,numeric,text,bigint,bigint,text,integer,text,jsonb)
  to service_role;

-- No backfill is executed. No existing KPI object/function is replaced.
