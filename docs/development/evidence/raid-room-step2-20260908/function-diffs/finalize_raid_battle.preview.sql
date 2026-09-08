CREATE OR REPLACE FUNCTION public.finalize_raid_battle(p_replay_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_replay public.battle_replay_sessions%rowtype;
  v_instance public.raid_bosses%rowtype;
  v_raw bigint;
  v_applied bigint;
  v_remaining bigint;
  v_total bigint;
  v_progress public.raid_instance_user_progress%rowtype;
  v_final jsonb;
begin
  select * into v_replay
  from public.battle_replay_sessions
  where id = p_replay_id
  for update;

  if not found
     or v_replay.battle_mode <> 'RAID'
     or v_replay.resolution_authority <> 'RAID_SERVER' then
    raise exception 'not an official Raid replay' using errcode = '42501';
  end if;
  if v_replay.finalization_status = 'FINALIZED' then
    return v_replay.finalization_result;
  end if;
  if v_replay.status <> 'PENDING'
     or v_replay.finalization_status <> 'PENDING' then
    raise exception 'Raid replay is not finalizable' using errcode = '23514';
  end if;

  perform public.advance_ranking_season('RAID',clock_timestamp());
 perform public.validate_official_battle_result(p_result);
  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;

  v_raw := greatest(coalesce((p_result->>'playerRawDamage')::bigint, 0), 0);
  v_applied := least(v_raw, greatest(v_instance.current_hp, 0));
  v_remaining := greatest(v_instance.current_hp - v_applied, 0);

  update public.raid_bosses
  set current_hp = v_remaining
  where id = v_instance.id;

  insert into public.raid_damage_logs(
    boss_id, raid_boss_id, user_id, damage, damage_dealt,
    raid_boss_instance_id, battle_replay_session_id, guild_id,
    raw_damage, applied_damage
  ) values (
    v_instance.boss_id, v_instance.boss_id, v_replay.requester_user_id,
    v_raw, v_raw, v_instance.id, p_replay_id,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid,
    v_raw, v_applied
  );

  insert into public.raid_instance_user_progress(
    raid_boss_instance_id, user_id, finalized_battles,
    raid_points_consumed, last_guild_id
  ) values (
    v_instance.id, v_replay.requester_user_id, 1,
    case when v_replay.official_context->>'costType' = 'RAID_POINT' then 1 else 0 end,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid
  )
  on conflict(raid_boss_instance_id, user_id) do update set
    finalized_battles = public.raid_instance_user_progress.finalized_battles + 1,
    raid_points_consumed = public.raid_instance_user_progress.raid_points_consumed
      + excluded.raid_points_consumed,
    last_guild_id = excluded.last_guild_id,
    updated_at = clock_timestamp()
  returning * into v_progress;

  select coalesce(sum(raw_damage), 0) into v_total
  from public.raid_damage_logs
  where raid_boss_instance_id = v_instance.id
    and user_id = v_replay.requester_user_id;

  v_final := p_result || jsonb_build_object(
    'mode', 'RAID',
    'raidInstanceId', v_instance.id,
    'baseId', v_instance.base_id,
    'raidDayKey', v_instance.raid_day_key,
    'raidVariantId', v_instance.raid_variant_id,
    'rawDamage', v_raw,
    'appliedDamage', v_applied,
    'remainingBossHp', v_remaining,
    'personalContribution', v_total,
    'guildIdSnapshot', v_replay.official_context->>'guildIdSnapshot',
    'participationProgress', to_jsonb(v_progress)
  );

  insert into public.battle_replay_events(
    battle_replay_session_id, event_index, round_number, event_type, payload
  )
  select p_replay_id,
         greatest(coalesce((event.value->>'index')::integer, event.ordinality::integer - 1), 0),
         greatest(coalesce((event.value->>'round')::integer, 1), 1),
         coalesce(nullif(event.value->>'type', ''), 'UNKNOWN'),
         coalesce(event.value->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_result->'events') with ordinality event(value, ordinality)
  on conflict do nothing;

  update public.battle_replay_sessions
  set status = 'RESOLVED',
      result = v_final,
      resolved_at = clock_timestamp(),
      finalization_status = 'FINALIZED',
      finalized_at = clock_timestamp(),
      finalization_result = v_final
  where id = p_replay_id;

  perform public.evaluate_mission_progress(
    v_replay.requester_user_id,
    'RAID_FINALIZED_BATTLE_COUNT',
    1
  );

  if v_remaining = 0 then
    perform public.finalize_expired_raid_instance(v_instance.id);
  end if;
  return v_final;
end
$function$
;