do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.move_current_user_base(text)') is null then
    raise exception 'TN-11A location movement RPC is missing';
  end if;
  select pg_get_functiondef('public.move_current_user_base(text)'::regprocedure)
    into v_definition;
  if position('auth.uid()' in v_definition) = 0
    or position('for update' in lower(v_definition)) = 0
    or position('update public.users' in lower(v_definition)) = 0
    or position('shinjuku' in v_definition) = 0
    or position('yokohama' in v_definition) = 0 then
    raise exception 'TN-11A location movement contract is incomplete';
  end if;
  if not has_function_privilege('authenticated', 'public.move_current_user_base(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.move_current_user_base(text)', 'EXECUTE') then
    raise exception 'TN-11A location movement grants are invalid';
  end if;
end;
$$;
