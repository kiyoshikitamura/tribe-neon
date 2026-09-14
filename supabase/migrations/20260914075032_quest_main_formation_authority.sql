-- Quest combat uses saved Main Formation; exploration character remains independent.
begin;
create or replace function public.create_patrol_battle_replay(p_patrol_id uuid,p_tactic_id text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_patrol public.user_patrols%rowtype; v_ids text[]; v_player jsonb; v_enemy jsonb; v_replay uuid; v_seed bigint; v_enemy_tactic text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_tactic_id not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS') then raise exception 'invalid tactic' using errcode='22023'; end if;
 select * into v_patrol from public.user_patrols where id=p_patrol_id and user_id=v_uid and (status='CLAIMABLE' or(status='ONGOING' and expires_at<=now())) and has_battle_event and not coalesce(battle_resolved,false) for update;
 if not found or v_patrol.encounter_snapshot is null then raise exception 'eligible patrol encounter not found' using errcode='P0002'; end if;
 update public.user_patrols set status='CLAIMABLE' where id=p_patrol_id and status='ONGOING';
 -- Read the saved Main Formation for every new battle, in saved slot order.
 -- Exploration ownership/bonus stays on user_patrols and never selects combatants.
 select array_agg(entry.value->>'character_id' order by entry.ordinality) into v_ids
 from jsonb_array_elements(public.get_current_main_formation()->'characters')
 with ordinality entry(value,ordinality);
 if coalesce(cardinality(v_ids),0) not between 1 and 5 then
   raise exception 'saved main formation required' using errcode='23514';
 end if;
 -- Keep the existing tutorial adjustments; these are pass-through outside Tutorial Battle.
 v_player:=public.apply_tutorial_player_snapshot(v_uid,public.build_server_battle_snapshot(v_uid,v_ids,'PLAYER'));
 v_enemy:=v_patrol.encounter_snapshot->'members';
 v_enemy:=public.apply_tutorial_enemy_snapshot(v_uid,v_player,v_enemy);
 v_enemy_tactic:=coalesce(v_patrol.encounter_snapshot->>'enemyTactic','BALANCED');
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,enemy_tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority) values(v_uid,'QUEST',p_patrol_id,p_tactic_id,v_enemy_tactic,v_seed,v_player,v_enemy,'PATROL_SERVER') returning id into v_replay;
 return jsonb_build_object('replay_session_id',v_replay,'player_snapshot',v_player,'enemy_snapshot',v_enemy,'enemy_tactic',v_enemy_tactic);
end $$;
revoke all on function public.create_patrol_battle_replay(uuid,text) from public,anon;
grant execute on function public.create_patrol_battle_replay(uuid,text) to authenticated;
commit;
notify pgrst, 'reload schema';
