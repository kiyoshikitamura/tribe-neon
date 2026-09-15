-- TN-11A: 現在地の変更を認証ユーザー専用RPCへ集約する。
begin;

create or replace function public.move_current_user_base(p_base_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_previous_base_id text;
begin
  if v_uid is null then
    raise exception 'Player authentication required' using errcode = '42501';
  end if;
  if p_base_id is null or p_base_id not in (
    'shinjuku', 'shibuya', 'ikebukuro', 'roppongi',
    'akihabara', 'kawasaki', 'yokohama'
  ) then
    raise exception 'Invalid base id' using errcode = '22023';
  end if;

  select current_base_id into v_previous_base_id
  from public.users
  where id = v_uid
  for update;
  if not found then
    raise exception 'Player was not found' using errcode = 'P0002';
  end if;

  update public.users
  set current_base_id = p_base_id
  where id = v_uid;

  return jsonb_build_object(
    'status', 'success',
    'previous_base_id', v_previous_base_id,
    'current_base_id', p_base_id
  );
end;
$$;

revoke all on function public.move_current_user_base(text) from public, anon;
grant execute on function public.move_current_user_base(text) to authenticated;

notify pgrst, 'reload schema';
commit;
