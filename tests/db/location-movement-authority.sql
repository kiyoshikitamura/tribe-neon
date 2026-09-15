\set ON_ERROR_STOP on
begin;

insert into public.users(id, username, current_base_id)
values
  ('26000000-0000-4000-8000-000000000011', 'TN11移動元', 'shinjuku'),
  ('26000000-0000-4000-8000-000000000012', 'TN11別人', 'ikebukuro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000011', true);

do $$
declare v_result jsonb;
begin
  v_result := public.move_current_user_base('yokohama');
  if v_result->>'current_base_id' <> 'yokohama'
    or v_result->>'previous_base_id' <> 'shinjuku' then
    raise exception 'location movement response mismatch';
  end if;
end;
$$;

do $$ begin
  begin
    perform public.move_current_user_base('osaka');
    raise exception 'invalid location was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end $$;
reset role;

do $$ begin
  if (select current_base_id from public.users where id='26000000-0000-4000-8000-000000000011') <> 'yokohama' then
    raise exception 'authenticated user location was not updated';
  end if;
  if (select current_base_id from public.users where id='26000000-0000-4000-8000-000000000012') <> 'ikebukuro' then
    raise exception 'another user location was changed';
  end if;
end $$;

rollback;
