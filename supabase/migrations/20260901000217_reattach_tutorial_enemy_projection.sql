-- Canonical master freeze replaced create_patrol_battle_replay after the
-- tutorial projection hook had been attached. Reattach the existing,
-- tutorial-only enemy projection without changing the canonical encounter or
-- replay contracts used by non-tutorial battles.

begin;

do $reconcile_replay$
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

  if position('apply_tutorial_enemy_snapshot' in v_definition) > 0 then
    return;
  end if;

  v_updated := regexp_replace(
    v_definition,
    '(v_enemy\s*:=\s*v_patrol\.encounter_snapshot\s*->\s*''members''\s*;)',
    E'\\1\n v_enemy := public.apply_tutorial_enemy_snapshot(v_uid, v_player, v_enemy);',
    'i'
  );

  if v_updated = v_definition then
    raise exception 'latest patrol replay enemy snapshot insertion point did not match';
  end if;

  execute v_updated;
end;
$reconcile_replay$;

revoke all on function public.create_patrol_battle_replay(uuid,text)
  from public, anon;
grant execute on function public.create_patrol_battle_replay(uuid,text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
