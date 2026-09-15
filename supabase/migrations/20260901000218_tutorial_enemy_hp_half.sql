begin;

-- The accepted adjustment is exactly half of the canonical tutorial enemy HP.
-- Do not weaken DEF or any other battle parameter.
create or replace function public.apply_tutorial_enemy_snapshot(
  p_user_id uuid,
  p_player_snapshot jsonb,
  p_enemy_snapshot jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists(
      select 1
      from public.tutorial_progress
      where user_id = p_user_id
        and step_id = 'TUTORIAL_BATTLE'
    )
    then coalesce((
      select jsonb_agg(
        jsonb_set(
          unit,
          '{stats,hp}',
          to_jsonb(greatest(1, round(coalesce((unit #>> '{stats,hp}')::numeric, 1) * 0.5)::integer)),
          true
        )
        order by unit_ordinality
      )
      from jsonb_array_elements(coalesce(p_enemy_snapshot, '[]'::jsonb))
        with ordinality enemies(unit, unit_ordinality)
    ), '[]'::jsonb)
    else p_enemy_snapshot
  end;
$$;

revoke all on function public.apply_tutorial_enemy_snapshot(uuid,jsonb,jsonb)
  from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
