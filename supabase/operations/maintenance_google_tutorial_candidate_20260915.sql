-- Narrow registration exception for an explicitly allowed maintenance tester.
-- Does not create a player, change Auth identities, or alter tutorial rewards.
-- Apply only after operations_maintenance_testers / is_operations_maintenance_tester exist.
create or replace function public.can_initialize_maintenance_google_player()
returns boolean language sql stable security definer set search_path = '' as $function$
 select coalesce(public.operations_feature_state('MAINTENANCE') = 'MAINTENANCE', false)
   and public.is_operations_maintenance_tester()
   and exists(select 1 from auth.users u where u.id=auth.uid()
     and not coalesce(u.is_anonymous, false) and u.email_confirmed_at is not null)
   and (select count(distinct i.provider)=1 and min(i.provider)='google'
     from auth.identities i where i.user_id=auth.uid() and i.provider in ('google','email'))
$function$;
revoke all on function public.can_initialize_maintenance_google_player() from public, anon;
grant execute on function public.can_initialize_maintenance_google_player() to authenticated;

-- Preserve the current initializer body and its grants; stop if its guard drifted.
do $patch$
declare
 v_definition text := pg_get_functiondef('public.initialize_current_player(text)'::regprocedure);
 v_before text := 'if not v_is_anonymous then raise exception ''Anonymous onboarding session is required''; end if;';
 v_after text := 'if not v_is_anonymous and not public.can_initialize_maintenance_google_player() then raise exception ''Anonymous onboarding session is required''; end if;';
begin
 if position(v_after in v_definition)>0 then return; end if;
 if position(v_before in v_definition)=0 then raise exception 'Initializer anonymous guard differs; review required'; end if;
 execute replace(v_definition, v_before, v_after);
end
$patch$;
