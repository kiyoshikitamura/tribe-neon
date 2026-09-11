begin;

-- Canonical Leader selection must not rely on the client UPDATE privilege
-- removed by the RLS convergence. Reorder the current Main Formation and
-- persist the identity Leader in one caller-owned transaction.
create or replace function public.set_main_formation_leader(p_character_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_character_ids text[];
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(trim(p_character_id), '') is null then
    raise exception 'leader character is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select array_agg(owned.character_id order by
    case when owned.character_id = p_character_id then 0 else 1 end,
    formation.slot)
  into v_character_ids
  from public.user_main_formations formation
  join public.user_characters owned
    on owned.id = formation.user_character_id
   and owned.user_id = v_user_id
  where formation.user_id = v_user_id;

  if coalesce(cardinality(v_character_ids), 0) = 0
     or not (p_character_id = any(v_character_ids)) then
    raise exception 'leader must belong to the current main formation' using errcode = '23514';
  end if;

  v_result := public.save_main_formation(v_character_ids);
  update public.users
  set favorite_character_id = p_character_id
  where id = v_user_id;
  if not found then
    raise exception 'player profile is not initialized' using errcode = 'P0002';
  end if;

  return v_result || jsonb_build_object(
    'status', 'success',
    'leader_character_id', p_character_id
  );
end;
$$;

revoke all on function public.set_main_formation_leader(text) from public, anon;
grant execute on function public.set_main_formation_leader(text) to authenticated, service_role;

comment on function public.set_main_formation_leader(text) is
  'Caller-owned atomic Main Formation Leader and identity Leader update.';

commit;
notify pgrst, 'reload schema';
