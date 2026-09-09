begin;

-- 確認済み印は結果の表示確認だけに用いる。戦闘結果・報酬資格は変更しない。
alter table public.raid_room_battle_start_requests add column recovery_acknowledged_at timestamptz;
create index raid_room_battle_unacknowledged_idx on public.raid_room_battle_start_requests(user_id,created_at,request_id)
 where recovery_acknowledged_at is null;

-- 開始と同じusers行lock下で記録し、遅れて届く未開始要求を封鎖する。
create table public.raid_room_battle_request_cancellations (
 user_id uuid not null references public.users(id) on delete cascade,
 request_id uuid not null,
 cancelled_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table public.raid_room_battle_request_cancellations enable row level security;
revoke all on table public.raid_room_battle_request_cancellations from public,anon,authenticated,service_role;

create function public.list_raid_room_battle_recoveries_v1(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_request record;v_receipt jsonb;v_items jsonb:='[]'::jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'limit must be between 1 and 100' using errcode='22023';end if;
 for v_request in select * from public.raid_room_battle_start_requests
 where user_id=v_uid and recovery_acknowledged_at is null
 order by created_at,request_id limit p_limit
 loop
  v_receipt:=public.get_raid_room_battle_start_receipt_v1(v_request.request_id);
  if v_receipt is null then raise exception 'Room start receipt missing' using errcode='23514';end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object(
   'requestId',v_request.request_id,'roomId',v_request.room_id,
   'payload',jsonb_build_object('p_room_id',v_request.room_id,'p_character_ids',v_request.character_ids,
    'p_tactic',v_request.tactic,'p_request_id',v_request.request_id),'receipt',v_receipt));
 end loop;
 return v_items;
end $$;

create function public.acknowledge_raid_room_battle_recovery_v1(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_request public.raid_room_battle_start_requests%rowtype;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023';end if;
 select * into v_request from public.raid_room_battle_start_requests
 where user_id=v_uid and request_id=p_request_id for update;
 if not found then raise exception 'owned Room start request missing' using errcode='P0002';end if;
 perform public.get_raid_room_battle_start_receipt_v1(p_request_id);
 if not exists(select 1 from public.battle_replay_sessions where id=v_request.replay_session_id
  and requester_user_id=v_uid and finalization_status='FINALIZED') then
  raise exception 'Room battle not finalized' using errcode='23514';end if;
 update public.raid_room_battle_start_requests
 set recovery_acknowledged_at=coalesce(recovery_acknowledged_at,clock_timestamp())
 where user_id=v_uid and request_id=p_request_id;
 return jsonb_build_object('status','acknowledged','requestId',p_request_id);
end $$;

create function public.cancel_raid_room_battle_request_v1(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_receipt jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023';end if;
 perform 1 from public.users where id=v_uid for update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 v_receipt:=public.get_raid_room_battle_start_receipt_v1(p_request_id);
 if v_receipt is not null then return jsonb_build_object('status','started','receipt',v_receipt);end if;
 insert into public.raid_room_battle_request_cancellations(user_id,request_id)
 values(v_uid,p_request_id) on conflict(user_id,request_id) do nothing;
 return jsonb_build_object('status','cancelled');
end $$;

-- SQL255の開始処理を保持し、users行lock直後の取消拒否のみ追加する。
create or replace function public.start_raid_room_battle_v1(p_room_id uuid,p_character_ids text[],p_tactic text,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_user public.users%rowtype;v_instance record;v_room public.raid_rooms%rowtype;
 v_request public.raid_room_battle_start_requests%rowtype;v_enabled boolean;v_power bigint;v_gate jsonb;v_response jsonb;
 v_cost integer;v_cost_type text;v_guild uuid;v_players jsonb;v_enemy jsonb:='[]';v_member text;
 v_entry record;v_skill_refs jsonb;v_skills jsonb;v_replay uuid;v_seed bigint;v_slot integer:=0;v_started_at timestamptz;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 if p_room_id is null or p_request_id is null or p_tactic is null
 or p_tactic not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS')
 or p_character_ids is null or cardinality(p_character_ids) not between 1 and 5
 or array_position(p_character_ids,null) is not null
 or (select count(distinct x) from unnest(p_character_ids) x)<>cardinality(p_character_ids)
 then raise exception 'invalid battle input' using errcode='22023';end if;
 select enabled into v_enabled from public.raid_room_battle_settings where singleton for share;
 if v_enabled is distinct from true then raise exception 'room battle disabled' using errcode='55000';end if;
 select * into v_user from public.users where id=v_uid for update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 if exists(select 1 from public.raid_room_battle_request_cancellations where user_id=v_uid and request_id=p_request_id)
 then raise exception 'battle request cancelled' using errcode='23514';end if;
 select * into v_request from public.raid_room_battle_start_requests where user_id=v_uid and request_id=p_request_id;
 if found then
 if v_request.room_id<>p_room_id or v_request.character_ids is distinct from p_character_ids or v_request.tactic<>p_tactic
 then raise exception 'request payload conflict' using errcode='22023';end if;
 return v_request.response;end if;
 if v_user.level is null or v_user.level<5 then raise exception 'raid level requirement' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select boss.*,variant.raid_name,variant.atk,variant.def,variant.spd,variant.member_character_ids into v_instance
 from public.raid_bosses boss join public.canonical_raid_variants variant on variant.raid_variant_id=boss.raid_variant_id
 where boss.id=v_room.raid_boss_instance_id and variant.is_production_enabled for update of boss;
 if not found then raise exception 'raid instance unavailable' using errcode='P0002';end if;
 if v_instance.status is distinct from 'ACTIVE' or v_instance.current_hp is null or v_instance.current_hp<=0
 or v_instance.expires_at is null or v_instance.expires_at<=clock_timestamp()
 or v_instance.spawned_at is null or v_instance.spawned_at>clock_timestamp() or v_instance.outcome_finalized_at is not null
 then raise exception 'room ended' using errcode='23514';end if;
 if not exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid)
 then raise exception 'room membership required' using errcode='42501';end if;
 v_players:=public.build_server_battle_snapshot(v_uid,p_character_ids,'PLAYER');
 if v_players is null or jsonb_array_length(v_players)<>cardinality(p_character_ids)
 or (select count(distinct x->>'id') from jsonb_array_elements(v_players) x)<>cardinality(p_character_ids)
 then raise exception 'invalid snapshot' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(v_players) x cross join (values('hp'),('atk'),('def')) k(key)
 where jsonb_typeof(x->'stats'->k.key) is distinct from 'number')
 then raise exception 'invalid snapshot stats' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(v_players) x cross join (values('hp'),('atk'),('def')) k(key)
 where (x->'stats'->>k.key)::numeric<0 or (x->'stats'->>k.key)::numeric>2147483647
 or trunc((x->'stats'->>k.key)::numeric)<>(x->'stats'->>k.key)::numeric
 or (k.key='hp' and (x->'stats'->>k.key)::numeric=0))
 then raise exception 'invalid snapshot stats' using errcode='23514';end if;
 select sum((x#>>'{stats,hp}')::bigint+(x#>>'{stats,atk}')::bigint+(x#>>'{stats,def}')::bigint) into v_power
 from jsonb_array_elements(v_players) x;
 v_gate:=public._raid_room_power_gate_v1(v_room.difficulty_id,v_power);
 if v_gate->>'status' is distinct from 'passed' then raise exception 'raid power requirement' using errcode='42501';end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid);
 select * into v_user from public.users where id=v_uid;
 if v_user.raid_free_entry_consumed is false then
 v_cost:=0;v_cost_type:='FREE_FIRST';update public.users set raid_free_entry_consumed=true where id=v_uid;
 elsif v_user.raid_points>=1 then
 v_cost:=1;v_cost_type:='RAID_POINT';update public.users set raid_points=raid_points-1,
 raid_points_last_recovered_at=case when raid_points=5 then now() else raid_points_last_recovered_at end where id=v_uid;
 v_user.raid_points:=v_user.raid_points-1;
 else raise exception 'insufficient Raid points' using errcode='23514';end if;
 select guild_id into v_guild from public.guild_members where user_id=v_uid;

 for v_member in select value from jsonb_array_elements_text(v_instance.member_character_ids) loop
  v_slot:=v_slot+1; select * into v_entry from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by(local_affinity)desc,weight desc limit 1;
  v_skill_refs:=coalesce(v_entry.skill_loadout,(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name,'activationType',s.activation_type,'cooldown',s.cooldown,'availableFromRound',s.available_from_round,'target',s.target,'effects',s.effects,'exclusiveCharacterId',s.exclusive_character_id) order by x.ordinality),'[]') into v_skills from jsonb_array_elements_text(v_skill_refs) with ordinality x(skill_id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.skill_id;
  v_enemy:=v_enemy||jsonb_build_array(jsonb_build_object('id','raid_'||v_instance.id||'_'||v_slot,'characterId',v_member,'name',coalesce((select display_name from public.canonical_character_master where version='2026-08-21' and character_id=v_member),v_member),'team','ENEMY','alignment',coalesce((select attribute from public.canonical_character_master where version='2026-08-21' and character_id=v_member),'NEUTRAL'),'level',30,'stats',jsonb_build_object('hp',ceil(v_instance.max_hp::numeric/5),'atk',v_instance.atk,'def',v_instance.def,'spd',v_instance.spd,'luk',0),'equippedSkillRefs',v_skill_refs,'skills',v_skills,'equipment','[]'::jsonb));
 end loop;
 if jsonb_array_length(v_enemy)<>5 then raise exception 'invalid enemy formation' using errcode='23514';end if;
 v_started_at:=clock_timestamp();
 if v_instance.expires_at<=v_started_at then raise exception 'room ended' using errcode='23514';end if;
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority,finalization_status,official_context)
 values(v_uid,'RAID',v_instance.id,p_tactic,v_seed,v_players,v_enemy,'RAID_SERVER','PENDING',
 jsonb_build_object('guildIdSnapshot',v_guild,'costType',v_cost_type,'cost',v_cost,'remainingRaidPoints',v_user.raid_points,
 'bossHpAtStart',v_instance.current_hp,'bossMaxHp',v_instance.max_hp,'baseId',v_instance.base_id,
 'raidDayKey',v_instance.raid_day_key,'raidVariantId',v_instance.raid_variant_id,
 'roomId',p_room_id,'raidRoomVersion',1,'difficultyId',v_room.difficulty_id,'formationPower',v_power,
 'roomExpiresAt',v_instance.expires_at,'startedAt',v_started_at)) returning id into v_replay;
 v_response:=jsonb_build_object('room_id',p_room_id,'replay_session_id',v_replay,'player_snapshot',v_players,
 'enemy_snapshot',v_enemy,'cost_type',v_cost_type,'cost',v_cost,'remaining_raid_points',v_user.raid_points,'guild_id_snapshot',v_guild);
 insert into public.raid_room_battle_start_requests(user_id,request_id,room_id,character_ids,tactic,replay_session_id,response)
 values(v_uid,p_request_id,p_room_id,p_character_ids,p_tactic,v_replay,v_response);
 return v_response;
end $$;

revoke all on function public.list_raid_room_battle_recoveries_v1(integer),
 public.acknowledge_raid_room_battle_recovery_v1(uuid),public.cancel_raid_room_battle_request_v1(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.list_raid_room_battle_recoveries_v1(integer),
 public.acknowledge_raid_room_battle_recovery_v1(uuid),public.cancel_raid_room_battle_request_v1(uuid)
 to authenticated;
commit;
notify pgrst,'reload schema';
