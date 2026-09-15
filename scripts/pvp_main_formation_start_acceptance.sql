-- Run against Preview after applying the candidate migration. All battle writes are rolled back.
begin;
set local statement_timeout='30s';
do $test$
declare
 v_actor uuid; v_enemy uuid; v_ids text[]; v_expected jsonb; v_actual jsonb;
 v_points integer; v_after integer; v_count bigint; v_state text; v_error text; v_missing uuid;
begin
 select f.user_id into v_enemy from public.user_main_formations f
 left join public.pvp_defense_decks d on d.user_id=f.user_id
 where d.user_id is null group by f.user_id having count(*)=5 order by f.user_id limit 1;
 select u.id into v_actor from public.users u
 where u.id<>v_enemy and u.pvp_points between 1 and 5
 and (select count(*) from public.user_main_formations f where f.user_id=u.id)=5
 order by u.id limit 1;
 if v_actor is null or v_enemy is null then raise exception 'fixture unavailable'; end if;
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 select array_agg(user_character_id::text order by slot) into v_ids from public.user_main_formations where user_id=v_actor;
 select pvp_points into v_points from public.users where id=v_actor;
 select public.build_server_battle_snapshot(v_enemy,array_agg(user_character_id::text order by slot),'ENEMY')
 into v_expected from public.user_main_formations where user_id=v_enemy;
 v_actual := public.start_pvp_battle(v_enemy,v_ids,'ATTACK_PRIORITY');
 if v_actual->'enemy_snapshot' is distinct from v_expected then raise exception 'enemy snapshot mismatch'; end if;
 if jsonb_array_length(v_actual->'player_snapshot')<>5 or jsonb_array_length(v_actual->'enemy_snapshot')<>5 then raise exception 'party size mismatch'; end if;
 if (select resolution_authority from public.battle_replay_sessions where id=(v_actual->>'replay_session_id')::uuid)<>'PVP_SERVER' then raise exception 'replay authority mismatch'; end if;
 select pvp_points into v_after from public.users where id=v_actor;
 if v_after<>(v_actual->>'remaining_pvp_points')::integer then raise exception 'BP response mismatch'; end if;
 select count(*) into v_count from public.battle_replay_sessions where requester_user_id=v_actor;
 v_missing := gen_random_uuid();
 begin
  perform public.start_pvp_battle(v_missing,v_ids,'ATTACK_PRIORITY');
  raise exception 'missing formation accepted';
 exception when sqlstate 'P0002' then
  get stacked diagnostics v_error=message_text;
  if v_error<>'opponent main formation not found' then raise exception 'unexpected failure: %',v_error; end if;
 end;
 if (select pvp_points from public.users where id=v_actor)<>v_after
 or (select count(*) from public.battle_replay_sessions where requester_user_id=v_actor)<>v_count then raise exception 'failed start leaked BP/replay'; end if;
end $test$;
select 'PASS: Main-only opponent / five-member snapshots / BP response / replay authority / failed-start atomic rollback' result;
rollback;
