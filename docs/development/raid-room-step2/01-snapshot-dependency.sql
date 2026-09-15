-- 00232全再適用は禁止。現PreviewのSPD/LUK補正を残し表示metadataだけ追加。
CREATE OR REPLACE FUNCTION public.build_server_battle_snapshot(p_user_id uuid, p_character_ids text[], p_team text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_base jsonb; v_result jsonb;
begin
  v_base := public.build_server_battle_snapshot_00168(p_user_id,p_character_ids,p_team);
  select jsonb_agg(
    jsonb_set(
      jsonb_set(unit.value || (projection.value-'_equipmentUtilityCorrection'),'{stats,spd}',
        to_jsonb((unit.value#>>'{stats,spd}')::integer+coalesce((projection.value#>>'{_equipmentUtilityCorrection,spd}')::integer,0))),
      '{stats,luk}',to_jsonb((unit.value#>>'{stats,luk}')::integer+coalesce((projection.value#>>'{_equipmentUtilityCorrection,luk}')::integer,0))
    ) || jsonb_build_object('characterId',owned.character_id,'level',owned.level,
      'awakeningLevel',owned.awakening_level,'rarity',master.rarity) order by unit.ordinality)
  into v_result
  from jsonb_array_elements(v_base) with ordinality unit(value,ordinality)
  join public.user_characters owned on owned.user_id=p_user_id
    and owned.id=regexp_replace(unit.value->>'id','^[^_]+_','')::uuid
  join public.canonical_character_master master on master.version='2026-08-21'
    and master.character_id=owned.character_id
  cross join lateral (select public.canonical_equipment_runtime_projection(
    p_user_id,regexp_replace(unit.value->>'id','^[^_]+_','')::uuid
  ) value) projection;
  if coalesce(jsonb_array_length(v_result),0)<>coalesce(jsonb_array_length(v_base),0) then
    raise exception 'battle snapshot presentation metadata is incomplete' using errcode='23503';
  end if;
  return coalesce(v_result,'[]'::jsonb);
end $function$
;
-- CREATE OR REPLACEで既存owner/ACLを保持。GRANT/REVOKE追加なし。
