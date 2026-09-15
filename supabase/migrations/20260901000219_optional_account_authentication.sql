-- Optional post-tutorial authentication. Kept on a new migration version so
-- environments that already applied 00217 receive this schema change.
begin;

alter table public.tutorial_progress
  add column if not exists authentication_pending boolean not null default false;

comment on column public.tutorial_progress.authentication_pending is
  'True when an anonymous player completed the tutorial and explicitly deferred account authentication.';

-- Deferred players remain on COMPLETE, which the existing anonymous cleanup
-- contract excludes from automatic deletion.

create or replace function public.defer_tutorial_authentication()
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_progress public.tutorial_progress%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_progress
  from public.tutorial_progress
  where user_id = v_user_id
  for update;

  if not found or v_progress.step_id <> 'COMPLETE' then
    raise exception 'Tutorial completion is required' using errcode = '23514';
  end if;
  if v_progress.authentication_pending then
    return 'COMPLETE';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
     or not exists(select 1 from auth.users where id = v_user_id and is_anonymous is true) then
    raise exception 'Only the current anonymous account can defer authentication' using errcode = '42501';
  end if;
  if exists(select 1 from public.user_account_auth_methods where user_id = v_user_id)
     or exists(select 1 from auth.identities where user_id = v_user_id and provider <> 'anonymous') then
    raise exception 'A connected identity cannot defer authentication' using errcode = '42501';
  end if;

  update public.tutorial_progress
  set authentication_pending = true,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where user_id = v_user_id;

  return 'COMPLETE';
end;
$$;

revoke all on function public.defer_tutorial_authentication() from public, anon;
grant execute on function public.defer_tutorial_authentication() to authenticated;

create or replace function public.complete_tutorial_authentication(p_auth_method text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_auth_method text := upper(trim(p_auth_method));
  v_existing_method text;
  v_tutorial_step text;
  v_is_anonymous boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_supported_identity_count integer;
  v_identity_provider text;
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
  from public.user_account_auth_methods methods where methods.user_id = v_user_id for update;
  select progress.step_id into v_tutorial_step
  from public.tutorial_progress progress where progress.user_id = v_user_id for update;

  if v_existing_method = v_auth_method and v_tutorial_step = 'AUTHENTICATION' then return 'AUTHENTICATION'; end if;
  if v_existing_method is not null and v_existing_method <> v_auth_method then raise exception 'A different authentication method is already linked'; end if;
  if v_tutorial_step <> 'COMPLETE' then raise exception 'Tutorial completion is required'; end if;

  insert into public.user_account_auth_methods(user_id, auth_method)
  values(v_user_id, v_auth_method)
  on conflict(user_id) do update set authenticated_at = now()
    where public.user_account_auth_methods.auth_method = excluded.auth_method;

  update public.tutorial_progress
  set step_id = 'AUTHENTICATION', authentication_pending = false, updated_at = now()
  where user_id = v_user_id;
  return 'AUTHENTICATION';
end;
$$;

revoke all on function public.complete_tutorial_authentication(text) from public, anon;
grant execute on function public.complete_tutorial_authentication(text) to authenticated;

create or replace function public.get_current_onboarding_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_anonymous boolean;
  v_has_profile boolean;
  v_tutorial_step text;
  v_authentication_pending boolean := false;
  v_auth_method text;
  v_identity_provider text;
  v_supported_identity_count integer;
  v_identity_integrity_valid boolean;
  v_is_legacy_authenticated boolean;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  v_is_anonymous := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  select exists(select 1 from public.users where id = v_user_id) into v_has_profile;
  select progress.step_id, progress.authentication_pending
    into v_tutorial_step, v_authentication_pending
  from public.tutorial_progress progress where progress.user_id = v_user_id;
  select methods.auth_method into v_auth_method
  from public.user_account_auth_methods methods where methods.user_id = v_user_id;
  select count(distinct identity.provider), min(identity.provider)
    into v_supported_identity_count, v_identity_provider
  from auth.identities identity
  where identity.user_id = v_user_id and identity.provider in ('google', 'email');

  v_identity_integrity_valid :=
    (v_is_anonymous and v_supported_identity_count = 0 and v_auth_method is null)
    or (not v_is_anonymous and v_supported_identity_count = 1
      and (v_auth_method is null or lower(v_auth_method) = v_identity_provider));
  v_is_legacy_authenticated := not v_is_anonymous and v_identity_integrity_valid and v_has_profile
    and v_auth_method is null and (v_tutorial_step is null or v_tutorial_step = 'AUTHENTICATION');

  return jsonb_build_object(
    'user_id', v_user_id,
    'is_anonymous', v_is_anonymous,
    'has_profile', v_has_profile,
    'tutorial_step', v_tutorial_step,
    'authentication_pending', coalesce(v_authentication_pending, false),
    'auth_method', coalesce(v_auth_method, case v_identity_provider when 'google' then 'GOOGLE' when 'email' then 'EMAIL' else null end),
    'is_legacy_authenticated', v_is_legacy_authenticated,
    'identity_integrity_valid', v_identity_integrity_valid,
    'gameplay_authorized', v_has_profile and v_identity_integrity_valid and (
      (v_is_anonymous and v_tutorial_step = 'COMPLETE' and coalesce(v_authentication_pending, false))
      or (not v_is_anonymous and v_auth_method is not null and v_tutorial_step = 'AUTHENTICATION')
      or v_is_legacy_authenticated
    )
  );
end;
$$;

revoke all on function public.get_current_onboarding_state() from public, anon;
grant execute on function public.get_current_onboarding_state() to authenticated;

commit;
notify pgrst, 'reload schema';
