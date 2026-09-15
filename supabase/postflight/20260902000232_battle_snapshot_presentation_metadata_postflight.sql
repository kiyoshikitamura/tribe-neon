do $$
declare
  v_definition text;
begin
  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260902000232'
  ) then
    raise exception '00232 is not registered';
  end if;
  if to_regprocedure('public.build_server_battle_snapshot(uuid,text[],text)') is null then
    raise exception 'battle snapshot builder is missing';
  end if;
  select pg_get_functiondef(
    'public.build_server_battle_snapshot(uuid,text[],text)'::regprocedure
  ) into v_definition;
  if position('build_server_battle_snapshot_00168' in v_definition)=0
    or position('canonical_equipment_runtime_projection' in v_definition)=0
    or position('canonical_character_master' in v_definition)=0
    or position('characterId' in v_definition)=0
    or position('awakeningLevel' in v_definition)=0
    or position('rarity' in v_definition)=0 then
    raise exception 'battle snapshot presentation metadata contract is incomplete';
  end if;
  if not coalesce((
      select prosecdef and proconfig @> array['search_path=public']
      from pg_proc
      where oid='public.build_server_battle_snapshot(uuid,text[],text)'::regprocedure
    ),false) then
    raise exception 'battle snapshot builder SECURITY DEFINER/search_path is invalid';
  end if;
  if not has_function_privilege(
      'service_role',
      'public.build_server_battle_snapshot(uuid,text[],text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.build_server_battle_snapshot(uuid,text[],text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.build_server_battle_snapshot(uuid,text[],text)',
      'EXECUTE'
    ) then
    raise exception 'battle snapshot builder grants are invalid';
  end if;
end;
$$;
