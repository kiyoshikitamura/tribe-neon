-- Fix the Main Formation matchmaking/start mismatch without changing BP, replay or season contracts.
-- Preserve the current RPC body and its existing grants. Never populate legacy defense decks.
do $migration$
declare
  v_definition text := replace(pg_get_functiondef('public.start_pvp_battle(uuid,text[],text)'::regprocedure), chr(13), '');
begin
  if position($new$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, v_opponent_character_ids, 'ENEMY');$new$ in v_definition) > 0 then
    return;
  end if;
  if position($old$  v_deck public.pvp_defense_decks%rowtype;$old$ in v_definition) = 0
     or position($old$  select deck.* into v_deck
  from public.pvp_defense_decks deck
  where deck.user_id = p_opponent_user_id;
  if not found then raise exception 'opponent defense deck not found' using errcode = 'P0002'; end if;$old$ in v_definition) = 0
     or position($old$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, array_remove(array[
    v_deck.character_1_id, v_deck.character_2_id, v_deck.character_3_id,
    v_deck.character_4_id, v_deck.character_5_id
  ]::text[], null), 'ENEMY');$old$ in v_definition) = 0 then
    raise exception 'start_pvp_battle authority anchors changed; review before applying';
  end if;
  v_definition := replace(v_definition, $old$  v_deck public.pvp_defense_decks%rowtype;$old$, '  v_opponent_character_ids text[];');
  v_definition := replace(v_definition, $old$  select deck.* into v_deck
  from public.pvp_defense_decks deck
  where deck.user_id = p_opponent_user_id;
  if not found then raise exception 'opponent defense deck not found' using errcode = 'P0002'; end if;$old$, $new$  -- Match get_pvp_opponents_page: the saved Main Formation is the opponent authority.
  select array_agg(formation.user_character_id::text order by formation.slot)
  into v_opponent_character_ids
  from public.user_main_formations formation
  where formation.user_id = p_opponent_user_id;
  if coalesce(cardinality(v_opponent_character_ids), 0) = 0 then
    raise exception 'opponent main formation not found' using errcode = 'P0002';
  end if;$new$);
  v_definition := replace(v_definition, $old$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, array_remove(array[
    v_deck.character_1_id, v_deck.character_2_id, v_deck.character_3_id,
    v_deck.character_4_id, v_deck.character_5_id
  ]::text[], null), 'ENEMY');$old$, $new$  v_enemy_snapshot := public.build_server_battle_snapshot(p_opponent_user_id, v_opponent_character_ids, 'ENEMY');$new$);
  execute v_definition;
end;
$migration$;
