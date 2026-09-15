do $$
declare
  v_definition text;
begin
  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260902000231'
  ) then
    raise exception '00231 is not registered';
  end if;
  if to_regprocedure('public.get_patrol_battle_enemy(uuid)') is null then
    raise exception 'patrol encounter authority RPC is missing';
  end if;
  select pg_get_functiondef('public.get_patrol_battle_enemy(uuid)'::regprocedure)
  into v_definition;
  if position('auth.uid()' in v_definition)=0
    or position('patrol.user_id = v_user_id' in v_definition)=0
    or position('patrol.expires_at <= now()' in v_definition)=0
    or position('patrol.encounter_snapshot is not null' in v_definition)=0 then
    raise exception 'patrol encounter authority contract is incomplete';
  end if;
  if not coalesce((
      select prosecdef and proconfig @> array['search_path=public']
      from pg_proc
      where oid='public.get_patrol_battle_enemy(uuid)'::regprocedure
    ),false) then
    raise exception 'patrol encounter SECURITY DEFINER/search_path is invalid';
  end if;
  if not has_function_privilege(
      'authenticated','public.get_patrol_battle_enemy(uuid)','EXECUTE'
    )
    or has_function_privilege(
      'anon','public.get_patrol_battle_enemy(uuid)','EXECUTE'
    ) then
    raise exception 'patrol encounter authority grants are invalid';
  end if;
end;
$$;
