do $$
declare
  v_definition text;
begin
  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260902000221'
  ) then
    raise exception '00221 is not registered';
  end if;
  if to_regprocedure('public.complete_activation_mission_handoff()') is null then
    raise exception 'activation mission handoff RPC is missing';
  end if;
  select pg_get_functiondef('public.complete_activation_mission_handoff()'::regprocedure)
  into v_definition;
  if position('auth.uid()' in v_definition)=0
    or position('activation prerequisites not met' in v_definition)=0 then
    raise exception 'activation mission handoff authority is incomplete';
  end if;
  if not coalesce((
      select prosecdef and proconfig @> array['search_path=public']
      from pg_proc
      where oid='public.complete_activation_mission_handoff()'::regprocedure
    ),false) then
    raise exception 'activation mission handoff SECURITY DEFINER/search_path is invalid';
  end if;
  if not has_function_privilege(
      'authenticated','public.complete_activation_mission_handoff()','EXECUTE'
    )
    or has_function_privilege(
      'anon','public.complete_activation_mission_handoff()','EXECUTE'
    ) then
    raise exception 'activation mission handoff grants are invalid';
  end if;
end;
$$;
