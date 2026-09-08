begin;
-- 全認証プレイヤーへの参照公開。テーブル直接権限はdefault denyを維持。
create or replace function public.raid_room_can_read_v1(p_room_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.raid_rooms where id=p_room_id)
$$;

-- 参加者の戦績・所属公開は一覧公開とは別。既存参加者限定を維持。
create or replace function public.get_raid_room_participants_v1(
  p_room_id uuid,p_limit integer default 20,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_items jsonb; v_count integer; v_instance uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.raid_rooms r where r.id=p_room_id and (
    r.owner_user_id=auth.uid() or exists(select 1 from public.raid_room_members m where m.room_id=r.id and m.user_id=auth.uid())
    or exists(select 1 from public.raid_instance_user_progress p where p.raid_boss_instance_id=r.raid_boss_instance_id and p.user_id=auth.uid() and p.finalized_battles>0))) then
    raise exception 'room unavailable' using errcode='P0002';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'invalid pagination' using errcode='22023';
  end if;
  select raid_boss_instance_id into v_instance from public.raid_rooms where id=p_room_id;
  with members as (
    select owner_user_id as user_id from public.raid_rooms where id=p_room_id
    union select user_id from public.raid_room_members where room_id=p_room_id
    union select user_id from public.raid_instance_user_progress
      where raid_boss_instance_id=v_instance and finalized_battles>0
  ), page as (
    select m.user_id,coalesce(p.finalized_battles,0) finalized_battles
    from members m left join public.raid_instance_user_progress p
      on p.raid_boss_instance_id=v_instance and p.user_id=m.user_id
    order by m.user_id limit p_limit+1 offset p_offset
  ), numbered as (select *,row_number() over(order by user_id) n from page), projected as (
    select p.n,p.user_id,jsonb_build_object(
      'roomId',p_room_id,
      'player',jsonb_build_object('userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown')),
      'currentGuild',case when membership.guild_id is not null and current_guild.id is null
        then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',case when current_guild.id is null then null
          else jsonb_build_object('guildId',current_guild.id,'name',current_guild.name) end) end,
      'battleGuildSnapshot',case when latest.id is null or (latest.guild_id is not null and battle_guild.id is null)
        then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',case when latest.guild_id is null then null
          else jsonb_build_object('guildId',latest.guild_id,'name',battle_guild.name) end) end,
      'finalizedBattles',jsonb_build_object('status','available','value',p.finalized_battles),
      'rawDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',damage.raw_damage) end,
      'appliedDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',damage.applied_damage) end
    ) dto
    from numbered p join public.users u on u.id=p.user_id
    left join public.guild_members membership on membership.user_id=p.user_id
    left join public.guilds current_guild on current_guild.id=membership.guild_id
    left join lateral (
      select l.id,l.guild_id from public.raid_damage_logs l
      where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id
      order by l.created_at desc,l.id desc limit 1
    ) latest on true
    left join public.guilds battle_guild on battle_guild.id=latest.guild_id
    left join lateral (
      select count(*) log_count,sum(l.raw_damage) raw_damage,sum(l.applied_damage) applied_damage
      from public.raid_damage_logs l where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id
    ) damage on true
  ) select coalesce(jsonb_agg(dto order by user_id) filter(where n<=p_limit),'[]'::jsonb),count(*)
    into v_items,v_count from projected;
  return jsonb_build_object('participants',v_items,'nextOffset',case when v_count>p_limit then p_offset+p_limit else null end);
end $$;


create table public.raid_room_battle_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into public.raid_room_battle_settings values(true,false);
alter table public.raid_room_battle_settings enable row level security;
revoke all on public.raid_room_battle_settings from public,anon,authenticated,service_role;
create table public.raid_room_battle_start_requests (
 user_id uuid not null references public.users(id), request_id uuid not null,
 room_id uuid not null references public.raid_rooms(id),character_ids text[] not null,
 tactic text not null,replay_session_id uuid not null references public.battle_replay_sessions(id),
 response jsonb not null,created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.raid_room_battle_start_requests enable row level security;
revoke all on public.raid_room_battle_start_requests from public,anon,authenticated,service_role;

-- 参加条件の参照だけを返す。実出撃資格や参加確定とは区別する。
create function public.get_raid_room_briefing_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room record;v_level integer;v_power bigint;v_gate jsonb;
 v_joined boolean;v_reason text;v_status text;v_count bigint;v_capacity integer;v_enabled boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select r.*,b.status,b.current_hp,b.expires_at,b.spawned_at,b.outcome_finalized_at,b.base_id,
 b.raid_variant_id,v.raid_name into v_room from public.raid_rooms r
 join public.raid_bosses b on b.id=r.raid_boss_instance_id
 left join public.canonical_raid_variants v on v.raid_variant_id=b.raid_variant_id where r.id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002'; end if;
 select level into v_level from public.users where id=v_uid;
 v_joined:=exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid);
 v_power:=public.calculate_user_total_power(v_uid);
 if v_room.difficulty_id<>'beginner' and not exists(select 1 from public.user_main_formations where user_id=v_uid) then v_power:=null;end if;
 v_gate:=public._raid_room_power_gate_v1(v_room.difficulty_id,v_power);
 v_status:=v_gate->>'status';v_reason:=v_gate->>'reason';
 select member_capacity into v_capacity from public.raid_room_lifecycle_rules where difficulty=v_room.difficulty_id;
 select count(*) into v_count from (
 select v_room.owner_user_id user_id union select user_id from public.raid_room_members where room_id=p_room_id
 union select user_id from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and finalized_battles>0) m;
 if v_level is null or v_level<5 then v_status:='failed';v_reason:='level_requirement';
 elsif v_room.status is distinct from 'ACTIVE' or v_room.current_hp is null or v_room.current_hp<=0
  or v_room.expires_at is null or v_room.expires_at<=now() or v_room.spawned_at is null or v_room.spawned_at>now()
  or v_room.outcome_finalized_at is not null then v_status:='failed';v_reason:='room_ended';
 elsif v_capacity is null then v_status:='unknown';v_reason:='rule_unavailable';
 elsif not v_joined and v_count>=v_capacity then v_status:='failed';v_reason:='room_full';end if;
 select enabled into v_enabled from public.raid_room_battle_settings where singleton;
 return jsonb_build_object('roomId',p_room_id,'raidBossInstanceId',v_room.raid_boss_instance_id,
 'raidVariantId',v_room.raid_variant_id,'bossName',v_room.raid_name,'baseId',v_room.base_id,
 'membershipStatus',case when v_joined then 'joined' else 'not_joined' end,
 'joinEligibility',v_gate||jsonb_build_object('status',v_status,'reason',v_reason),
 'battleStartEnabled',coalesce(v_enabled,false));
end $$;

create function public.register_raid_room_v1(p_room_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_level integer;v_brief jsonb;v_result jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select level into v_level from public.users where id=v_uid for update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 if exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid) then
 return jsonb_build_object('roomId',p_room_id,'membershipStatus','already_joined');end if;
 v_brief:=public.get_raid_room_briefing_v1(p_room_id);
 if v_brief#>>'{joinEligibility,status}' is distinct from 'passed' then raise exception 'raid participation requirement' using errcode='42501';end if;
 -- private helperがboss/Roomをロック後に期限と定員を再検証する。
 v_result:=public._raid_room_add_member_v1(p_room_id,v_uid);
 return jsonb_build_object('roomId',p_room_id,'membershipStatus',v_result->>'status');
end $$;

create function public.start_raid_room_battle_v1(p_room_id uuid,p_character_ids text[],p_tactic text,p_request_id uuid)
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
revoke all on function public.raid_room_can_read_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_raid_room_briefing_v1(uuid),public.register_raid_room_v1(uuid),public.start_raid_room_battle_v1(uuid,text[],text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_briefing_v1(uuid),public.register_raid_room_v1(uuid),public.start_raid_room_battle_v1(uuid,text[],text,uuid) to authenticated;
commit;
