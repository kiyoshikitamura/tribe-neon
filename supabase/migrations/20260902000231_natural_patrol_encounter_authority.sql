-- Natural patrol completion keeps the row ONGOING until battle replay creation.
-- Align the encounter preauthorization boundary with create_patrol_battle_replay:
-- the owner may proceed when the server deadline has elapsed, but never early.

begin;

create or replace function public.get_patrol_battle_enemy(p_patrol_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_patrol public.user_patrols%rowtype;
  v_first_member jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select patrol.*
  into v_patrol
  from public.user_patrols patrol
  where patrol.id = p_patrol_id
    and patrol.user_id = v_user_id
    and (
      patrol.status = 'CLAIMABLE'
      or (patrol.status = 'ONGOING' and patrol.expires_at <= now())
    )
    and patrol.has_battle_event = true
    and coalesce(patrol.battle_resolved, false) = false
    and patrol.encounter_snapshot is not null
  limit 1;

  if not found then
    raise exception 'eligible patrol encounter not found' using errcode = 'P0002';
  end if;

  v_first_member := v_patrol.encounter_snapshot->'members'->0;
  return jsonb_build_object(
    'id', coalesce(v_patrol.encounter_snapshot->>'encounterId', v_patrol.id::text),
    'quest_id', coalesce(v_patrol.course_id, v_patrol.quest_id),
    'npc_name', 'Canonical NPC Party',
    'npc_level', coalesce((v_first_member->>'level')::integer, 1),
    'encounter_rate', 1,
    'enemy_data', v_patrol.encounter_snapshot
  );
end;
$$;

revoke all on function public.get_patrol_battle_enemy(uuid) from public;
revoke all on function public.get_patrol_battle_enemy(uuid) from anon;
grant execute on function public.get_patrol_battle_enemy(uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
