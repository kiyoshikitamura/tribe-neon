begin;

-- Fresh User Acceptance 2026-09-01 still exceeded one minute at 2x with the
-- 17.5% tutorial projection. Preserve the accepted battle presentation and
-- every non-tutorial encounter; shorten only tutorial enemy durability.
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
          jsonb_set(
            unit,
            '{stats,hp}',
            to_jsonb(greatest(1, round(coalesce((unit #>> '{stats,hp}')::numeric, 1) * 0.0875)::integer)),
            true
          ),
          '{stats,def}',
          to_jsonb(greatest(0, round(coalesce((unit #>> '{stats,def}')::numeric, 0) * 0.35)::integer)),
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
