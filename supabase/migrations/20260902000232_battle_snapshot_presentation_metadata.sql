begin;

-- Replay authority already owns the Character identity. Preserve that frozen
-- identity in the snapshot so presentation tier, art and level never have to
-- infer it from a UUID-shaped runtime participant id.
create or replace function public.build_server_battle_snapshot(
  p_user_id uuid,
  p_character_ids text[],
  p_team text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_base jsonb;
  v_result jsonb;
begin
  v_base := public.build_server_battle_snapshot_00168(p_user_id,p_character_ids,p_team);
  select jsonb_agg(
    unit.value
    || jsonb_build_object(
      'characterId', owned.character_id,
      'level', owned.level,
      'awakeningLevel', owned.awakening_level,
      'rarity', master.rarity
    )
    || public.canonical_equipment_runtime_projection(p_user_id,owned.id)
    order by unit.ordinality
  )
  into v_result
  from jsonb_array_elements(v_base) with ordinality unit(value,ordinality)
  join public.user_characters owned
    on owned.user_id=p_user_id
   and owned.id=regexp_replace(unit.value->>'id','^[^_]+_','')::uuid
  join public.canonical_character_master master
    on master.version='2026-08-21'
   and master.character_id=owned.character_id;

  if coalesce(jsonb_array_length(v_result),0)<>coalesce(jsonb_array_length(v_base),0) then
    raise exception 'battle snapshot presentation metadata is incomplete' using errcode='23503';
  end if;
  return coalesce(v_result,'[]'::jsonb);
end $$;

revoke all on function public.build_server_battle_snapshot(uuid,text[],text) from public,anon;
grant execute on function public.build_server_battle_snapshot(uuid,text[],text) to service_role;

commit;
notify pgrst,'reload schema';
