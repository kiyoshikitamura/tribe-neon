-- The canonical quest replay authority was replaced after the original
-- Tutorial player projection hook had been attached. Reattach only the
-- Tutorial-only projection to the current function without copying or
-- changing the normal Quest, PvP, or Raid battle contracts.

begin;

do $reconcile_tutorial_player_snapshot$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    to_regprocedure('public.create_patrol_battle_replay(uuid,text)')
  ) into v_definition;

  if v_definition is null then
    raise exception 'create_patrol_battle_replay(uuid,text) is required'
      using errcode = 'P0002';
  end if;

  if position('apply_tutorial_player_snapshot' in v_definition) > 0 then
    return;
  end if;

  v_updated := regexp_replace(
    v_definition,
    '(v_player\s*:=\s*public\.build_server_battle_snapshot\([^;]+;)',
    E'\\1\n v_player := public.apply_tutorial_player_snapshot(v_uid, v_player);',
    'i'
  );

  if v_updated = v_definition then
    raise exception 'latest patrol replay player snapshot insertion point did not match';
  end if;

  execute v_updated;
end;
$reconcile_tutorial_player_snapshot$;

revoke all on function public.create_patrol_battle_replay(uuid,text)
  from public, anon;
grant execute on function public.create_patrol_battle_replay(uuid,text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
