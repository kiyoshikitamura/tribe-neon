-- Profile Leader is independent of Main Formation order.
-- Existing leader_hometown_base trigger remains the hometown Authority.
begin;

create or replace function public.set_profile_leader_v1(p_character_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception 'character id required' using errcode = '22023';
  end if;

  -- Serialize profile changes, then keep ownership stable through the update.
  perform 1 from public.users where id = v_user_id for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.user_characters
  where user_id = v_user_id and character_id = p_character_id
  for key share;
  if not found then
    raise exception 'owned character not found' using errcode = 'P0002';
  end if;

  update public.users set favorite_character_id = p_character_id
  where id = v_user_id and favorite_character_id is distinct from p_character_id;
  return jsonb_build_object('status', 'success', 'favorite_character_id', p_character_id);
end;
$$;

revoke all on function public.set_profile_leader_v1(text) from public, anon;
grant execute on function public.set_profile_leader_v1(text) to authenticated;

commit;
notify pgrst, 'reload schema';
