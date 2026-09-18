-- GAME03 / TRIBE NEON
-- Public account verification badge projection.
-- Exposes only user_id + verified boolean. No auth provider, identity, email, or credential data.

create or replace function public.get_public_account_verification_badges(p_user_ids uuid[])
returns table(user_id uuid, verified boolean)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select requested.user_id,
         (
           method.user_id is not null
           and progress.step_id = 'AUTHENTICATION'
           and coalesce(progress.authentication_pending, false) = false
           and exists (
             select 1
             from auth.identities identity
             where identity.user_id = requested.user_id
               and identity.provider = lower(method.auth_method)
               and identity.provider in ('email','google')
           )
         ) as verified
  from (
    select distinct unnest(coalesce(p_user_ids, array[]::uuid[])) as user_id
  ) requested
  join public.users game_user on game_user.id = requested.user_id
  left join public.user_account_auth_methods method on method.user_id = requested.user_id
  left join public.tutorial_progress progress on progress.user_id = requested.user_id
  where auth.uid() is not null
    and exists (select 1 from public.users caller where caller.id = auth.uid())
    and cardinality(coalesce(p_user_ids, array[]::uuid[])) <= 100;
$function$;

revoke all on function public.get_public_account_verification_badges(uuid[]) from public, anon;
grant execute on function public.get_public_account_verification_badges(uuid[]) to authenticated;
