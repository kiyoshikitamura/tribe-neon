begin;

-- 本人の確定済み開始receiptを読み戻す。開始RPCや運用設定は更新しない。
create function public.get_raid_room_battle_start_receipt_v1(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 v_uid uuid:=auth.uid();
 v_request public.raid_room_battle_start_requests%rowtype;
 v_replay public.battle_replay_sessions%rowtype;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023'; end if;
 select * into v_request from public.raid_room_battle_start_requests
 where user_id=v_uid and request_id=p_request_id;
 if not found then return null; end if;
 select * into v_replay from public.battle_replay_sessions
 where id=v_request.replay_session_id and requester_user_id=v_uid;
 if not found then raise exception 'owned Room replay missing' using errcode='23514'; end if;
 if public.get_raid_battle_route_v1(v_request.replay_session_id) is distinct from 'ROOM'
 or v_request.room_id::text is distinct from v_replay.official_context->>'roomId'
 or v_request.tactic is distinct from v_replay.tactic_id
 or v_request.response->>'replay_session_id' is distinct from v_replay.id::text
 or v_request.response->>'room_id' is distinct from v_request.room_id::text
 or v_request.response->'player_snapshot' is distinct from v_replay.player_snapshot
 or v_request.response->'enemy_snapshot' is distinct from v_replay.enemy_snapshot then
  raise exception 'Room start receipt mismatch' using errcode='23514';
 end if;
 return v_request.response;
end $$;

-- 同じBoss行を戦闘確定と共有してロックする。処理済み・ロック中の行は対象外。
create function public.finalize_expired_raid_rooms_v1(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_room record;
 v_now timestamptz:=clock_timestamp();
 v_count integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>1000 then
  raise exception 'batch limit must be between 1 and 1000' using errcode='22023';
 end if;
 for v_room in
  select r.id from public.raid_rooms r
  join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where b.status='ACTIVE' and b.outcome_finalized_at is null and b.expires_at<=v_now
  order by b.expires_at,b.id limit p_limit for update of b skip locked
 loop
  perform public.finalize_expired_raid_room_v1(v_room.id);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

revoke all on function public.get_raid_room_battle_start_receipt_v1(uuid),
 public.finalize_expired_raid_rooms_v1(integer) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_battle_start_receipt_v1(uuid) to authenticated;
grant execute on function public.finalize_expired_raid_rooms_v1(integer) to service_role;

-- 既存229/234と同じpg_cron登録方式。実DBへの適用は別のRelease工程。
do $schedule$
declare v_job_id bigint;
begin
 select jobid into v_job_id from cron.job where jobname='raid-room-expiry-minute';
 if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
 perform cron.schedule('raid-room-expiry-minute','* * * * *',
  $job$select public.finalize_expired_raid_rooms_v1(100);$job$);
end;
$schedule$;

commit;
notify pgrst,'reload schema';
