begin;
do $$
declare
  v_definition text;
  v_now timestamptz := statement_timestamp();
  v_ids uuid[];
begin
  if to_regprocedure('public.get_recent_social_activity_feed(integer)') is null then
    raise exception 'recent social activity RPC is missing';
  end if;

  select pg_get_functiondef('public.get_recent_social_activity_feed(integer)'::regprocedure)
  into v_definition;
  if position('interval ''24 hours''' in v_definition) = 0
     or position('feed.created_at desc, feed.id desc' in lower(v_definition)) = 0 then
    raise exception 'activity RPC does not enforce the rolling window and deterministic order';
  end if;

  if has_table_privilege('authenticated', 'public.social_activity_feed', 'select')
     or has_function_privilege('anon', 'public.get_recent_social_activity_feed(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_recent_social_activity_feed(integer)', 'execute') then
    raise exception 'activity Authority privilege mismatch';
  end if;

  delete from public.social_activity_feed;
  insert into public.social_activity_feed(id, activity_type, actor_display_name, created_at)
  values
    ('24000000-0000-4000-8000-000000000001', 'GUILD_CREATED', 'expired', v_now - interval '24 hours 1 second'),
    ('24000000-0000-4000-8000-000000000004', 'GUILD_CREATED', 'boundary', v_now - interval '24 hours'),
    ('24000000-0000-4000-8000-000000000002', 'GUILD_CREATED', 'tie-low', v_now - interval '1 hour'),
    ('24000000-0000-4000-8000-000000000003', 'GUILD_CREATED', 'tie-high', v_now - interval '1 hour');

  perform set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000099', true);
  select array_agg(recent.id)
  into v_ids
  from public.get_recent_social_activity_feed(20) recent;

  if v_ids is distinct from array[
    '24000000-0000-4000-8000-000000000003'::uuid,
    '24000000-0000-4000-8000-000000000002'::uuid,
    '24000000-0000-4000-8000-000000000004'::uuid
  ] then
    raise exception 'activity rolling window or deterministic order mismatch: %', v_ids;
  end if;
end;
$$;
rollback;
