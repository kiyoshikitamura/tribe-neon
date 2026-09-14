-- Roomの正式finalizeと新規Clear資格のみを既存Mission Authorityへ接続する。
-- 戦闘計算・Snapshot・報酬2倍・既存Present配送は変更しない。過去戦闘のbackfillなし。
begin;
DO $patch$
declare
  v_definition text;
  v_anchor text;
begin
  v_definition := replace(pg_get_functiondef('public.finalize_raid_room_battle_v1(uuid,jsonb)'::regprocedure), chr(13), '');
  v_anchor := E'  -- Room報酬・旧ミッション資格はここで新規付与しない。\n  return v_final;';
  if strpos(v_definition, v_anchor) = 0 or strpos(v_definition, 'evaluate_mission_progress') > 0 then
    raise exception 'Room finalize Mission hook requires source review';
  end if;
  execute replace(v_definition, v_anchor, E'  -- Replay行lockとFINALIZED早期returnにより、正式確定ごとに1回だけ加算。\n  perform public.evaluate_mission_progress(v_replay.requester_user_id, ''RAID_FINALIZED'', 1);\n  return v_final;');

  v_definition := replace(pg_get_functiondef('public._issue_raid_room_clear_rewards_v1(uuid)'::regprocedure), chr(13), '');
  v_anchor := E'  if v_inserted=0 then continue;end if;\n  for v_item';
  if strpos(v_definition, v_anchor) = 0 or strpos(v_definition, 'evaluate_mission_progress') > 0 then
    raise exception 'Room clear Mission hook requires source review';
  end if;
  execute replace(v_definition, v_anchor, E'  if v_inserted=0 then continue;end if;\n  -- Clear gate通過・資格ledger新規作成時だけ。retryやitem数では増やさない。\n  perform public.evaluate_mission_progress(v_member.user_id, ''RAID_CLEAR_ELIGIBLE'', 1);\n  for v_item');
end
$patch$;
commit;
