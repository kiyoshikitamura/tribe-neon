-- GAME03 / TRIBE NEON
-- Account authentication promotion + one-time free DIA 300 reward.
-- Scope is intentionally isolated from Raid objects.

create table if not exists public.account_authentication_reward_grants (
  user_id uuid primary key references public.users(id) on delete cascade,
  reward_key text not null default 'ACCOUNT_AUTHENTICATION_20260918',
  delivery_method text not null check (delivery_method in ('DIRECT','PRESENT')),
  quantity integer not null check (quantity = 300),
  present_id uuid null references public.presents(id) on delete set null,
  granted_at timestamptz not null default clock_timestamp()
);

create table if not exists public.account_authentication_reward_existing_targets (
  user_id uuid primary key references public.users(id) on delete cascade,
  cutoff_at timestamptz not null,
  authenticated_at timestamptz not null,
  snapshotted_at timestamptz not null default clock_timestamp()
);

create table if not exists public.account_authentication_badge_views (
  user_id uuid not null references public.users(id) on delete cascade,
  jst_date date not null,
  viewed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, jst_date)
);

alter table public.account_authentication_reward_grants enable row level security;
alter table public.account_authentication_reward_existing_targets enable row level security;
alter table public.account_authentication_badge_views enable row level security;

create unique index if not exists presents_account_authentication_reward_once
  on public.presents(user_id, source_kind, source_key)
  where source_kind = 'ACCOUNT_AUTHENTICATION_REWARD'
    and source_key = 'ACCOUNT_AUTHENTICATION_20260918';

create or replace function public.get_account_authentication_badge_state()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_pending boolean := false;
  v_seen boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and progress.user_id is not null
    and progress.step_id = 'COMPLETE'
    and coalesce(progress.authentication_pending, false)
    and not exists (
      select 1 from public.user_account_auth_methods method
      where method.user_id = v_user_id
    )
  )
  into v_pending
  from public.tutorial_progress progress
  where progress.user_id = v_user_id;

  if not coalesce(v_pending, false) then
    return jsonb_build_object('visible', false, 'jst_date', v_today);
  end if;

  select exists(
    select 1
    from public.account_authentication_badge_views badge
    where badge.user_id = v_user_id and badge.jst_date = v_today
  ) into v_seen;

  return jsonb_build_object('visible', not v_seen, 'jst_date', v_today);
end;
$function$;

create or replace function public.mark_account_authentication_badge_viewed()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_pending boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and progress.user_id is not null
    and progress.step_id = 'COMPLETE'
    and coalesce(progress.authentication_pending, false)
    and not exists (
      select 1 from public.user_account_auth_methods method
      where method.user_id = v_user_id
    )
  )
  into v_pending
  from public.tutorial_progress progress
  where progress.user_id = v_user_id;

  if not coalesce(v_pending, false) then
    return jsonb_build_object('recorded', false, 'jst_date', v_today);
  end if;

  insert into public.account_authentication_badge_views(user_id, jst_date)
  values(v_user_id, v_today)
  on conflict(user_id, jst_date) do nothing;

  return jsonb_build_object('recorded', true, 'jst_date', v_today);
end;
$function$;

create or replace function public._complete_tutorial_authentication_with_reward_v1(p_auth_method text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_auth_method text := upper(trim(p_auth_method));
  v_existing_method text;
  v_tutorial_step text;
  v_is_anonymous boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_supported_identity_count integer;
  v_identity_provider text;
  v_grant_inserted integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if v_is_anonymous then raise exception 'Verified authentication identity is required'; end if;
  if v_auth_method is null or v_auth_method not in ('EMAIL', 'GOOGLE') then raise exception 'Unsupported authentication method'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select count(distinct identity.provider), min(identity.provider)
    into v_supported_identity_count, v_identity_provider
  from auth.identities identity
  where identity.user_id = v_user_id and identity.provider in ('email', 'google');

  if v_supported_identity_count <> 1 then raise exception 'Exactly one authentication identity is required'; end if;
  if v_identity_provider <> lower(v_auth_method) then raise exception 'Requested authentication identity is not linked'; end if;

  select methods.auth_method into v_existing_method
  from public.user_account_auth_methods methods
  where methods.user_id = v_user_id
  for update;

  select progress.step_id into v_tutorial_step
  from public.tutorial_progress progress
  where progress.user_id = v_user_id
  for update;

  -- Accounts already formally linked before this promotion stay on the
  -- existing-authenticated Present route. Re-login never grants directly.
  if v_existing_method = v_auth_method and v_tutorial_step = 'AUTHENTICATION' then
    return jsonb_build_object(
      'tutorial_step', 'AUTHENTICATION',
      'reward_granted', false,
      'reward_amount', 300
    );
  end if;

  if v_existing_method is not null and v_existing_method <> v_auth_method then
    raise exception 'A different authentication method is already linked';
  end if;
  if v_tutorial_step <> 'COMPLETE' then
    raise exception 'Tutorial completion is required';
  end if;

  insert into public.user_account_auth_methods(user_id, auth_method)
  values(v_user_id, v_auth_method)
  on conflict(user_id) do update
    set authenticated_at = now()
    where public.user_account_auth_methods.auth_method = excluded.auth_method;

  update public.tutorial_progress
  set step_id = 'AUTHENTICATION', authentication_pending = false, updated_at = now()
  where user_id = v_user_id;

  insert into public.account_authentication_reward_grants(
    user_id, reward_key, delivery_method, quantity
  ) values (
    v_user_id, 'ACCOUNT_AUTHENTICATION_20260918', 'DIRECT', 300
  )
  on conflict(user_id) do nothing;

  get diagnostics v_grant_inserted = row_count;

  if v_grant_inserted = 1 then
    perform public.grant_present_payload(v_user_id, 'DIA', 300);
  end if;

  return jsonb_build_object(
    'tutorial_step', 'AUTHENTICATION',
    'reward_granted', v_grant_inserted = 1,
    'reward_amount', 300,
    'delivery_method', case when v_grant_inserted = 1 then 'DIRECT' else null end
  );
end;
$function$;

create or replace function public.complete_tutorial_authentication_with_reward(p_auth_method text)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog'
as $function$
  select public._complete_tutorial_authentication_with_reward_v1(p_auth_method);
$function$;

create or replace function public.complete_tutorial_authentication(p_auth_method text)
returns text
language sql
security definer
set search_path to 'pg_catalog'
as $function$
  select public._complete_tutorial_authentication_with_reward_v1(p_auth_method)->>'tutorial_step';
$function$;

create or replace function public.snapshot_account_authentication_reward_existing_targets(p_cutoff_at timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_count integer;
begin
  if p_cutoff_at is null then raise exception 'cutoff is required'; end if;

  insert into public.account_authentication_reward_existing_targets(
    user_id, cutoff_at, authenticated_at
  )
  select method.user_id, p_cutoff_at, method.authenticated_at
  from public.user_account_auth_methods method
  join public.tutorial_progress progress on progress.user_id = method.user_id
  where method.auth_method in ('EMAIL','GOOGLE')
    and method.authenticated_at <= p_cutoff_at
    and progress.step_id = 'AUTHENTICATION'
    and exists (
      select 1
      from auth.identities identity
      where identity.user_id = method.user_id
        and identity.provider = lower(method.auth_method)
    )
    and not exists (
      select 1
      from public.account_authentication_reward_grants grant_row
      where grant_row.user_id = method.user_id
    )
  on conflict(user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.deliver_account_authentication_reward_existing_targets(p_cutoff_at timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_target record;
  v_inserted integer;
  v_present_id uuid;
  v_delivered integer := 0;
begin
  for v_target in
    select target.user_id
    from public.account_authentication_reward_existing_targets target
    where target.cutoff_at = p_cutoff_at
    order by target.user_id
  loop
    v_inserted := 0;

    insert into public.account_authentication_reward_grants(
      user_id, reward_key, delivery_method, quantity
    ) values (
      v_target.user_id, 'ACCOUNT_AUTHENTICATION_20260918', 'PRESENT', 300
    )
    on conflict(user_id) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then continue; end if;

    insert into public.presents(
      user_id, item_id, quantity, message, status, expire_at,
      source_kind, source_key, source_metadata
    ) values (
      v_target.user_id, 'DIA', 300, 'アカウント連携特典', 'UNCLAIMED',
      clock_timestamp() + interval '30 days',
      'ACCOUNT_AUTHENTICATION_REWARD', 'ACCOUNT_AUTHENTICATION_20260918',
      jsonb_build_object('cutoff_at', p_cutoff_at, 'delivery_method', 'PRESENT')
    )
    returning id into v_present_id;

    update public.account_authentication_reward_grants
    set present_id = v_present_id
    where user_id = v_target.user_id and delivery_method = 'PRESENT';

    v_delivered := v_delivered + 1;
  end loop;

  return v_delivered;
end;
$function$;

revoke all on public.account_authentication_reward_grants from anon, authenticated;
revoke all on public.account_authentication_reward_existing_targets from anon, authenticated;
revoke all on public.account_authentication_badge_views from anon, authenticated;

revoke all on function public._complete_tutorial_authentication_with_reward_v1(text) from public, anon, authenticated;
revoke all on function public.complete_tutorial_authentication_with_reward(text) from public, anon;
grant execute on function public.complete_tutorial_authentication_with_reward(text) to authenticated;

revoke all on function public.complete_tutorial_authentication(text) from public, anon;
grant execute on function public.complete_tutorial_authentication(text) to authenticated;

revoke all on function public.get_account_authentication_badge_state() from public, anon;
grant execute on function public.get_account_authentication_badge_state() to authenticated;

revoke all on function public.mark_account_authentication_badge_viewed() from public, anon;
grant execute on function public.mark_account_authentication_badge_viewed() to authenticated;

revoke all on function public.snapshot_account_authentication_reward_existing_targets(timestamptz) from public, anon, authenticated;
grant execute on function public.snapshot_account_authentication_reward_existing_targets(timestamptz) to service_role;

revoke all on function public.deliver_account_authentication_reward_existing_targets(timestamptz) from public, anon, authenticated;
grant execute on function public.deliver_account_authentication_reward_existing_targets(timestamptz) to service_role;
