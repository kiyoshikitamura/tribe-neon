do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.get_recent_social_activity_feed(integer)') is null then
    raise exception 'recent social activity RPC is missing';
  end if;

  if has_table_privilege('authenticated', 'public.social_activity_feed', 'select')
     or has_table_privilege('anon', 'public.social_activity_feed', 'select') then
    raise exception 'unbounded social activity table read remains exposed';
  end if;

  if has_function_privilege('anon', 'public.get_recent_social_activity_feed(integer)', 'execute')
     or has_function_privilege('service_role', 'public.get_recent_social_activity_feed(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_recent_social_activity_feed(integer)', 'execute') then
    raise exception 'recent social activity RPC privilege mismatch';
  end if;

  select pg_get_functiondef('public.get_recent_social_activity_feed(integer)'::regprocedure)
  into v_definition;
  if position('interval ''24 hours''' in v_definition) = 0
     or position('feed.created_at desc, feed.id desc' in lower(v_definition)) = 0 then
    raise exception 'recent social activity window or stable ordering is missing';
  end if;
end;
$$;
