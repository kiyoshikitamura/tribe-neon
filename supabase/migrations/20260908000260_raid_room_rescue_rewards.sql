-- 救援成功本人Room1回、Present自動送付30日。数値設定は未投入。
begin;
create table public.raid_room_rescue_reward_rules (
 difficulty text primary key references public.raid_room_difficulty_rules(difficulty),
 enabled boolean not null default false,
 reward_version bigint not null default 1 check(reward_version>0)
);
insert into public.raid_room_rescue_reward_rules(difficulty)
 select difficulty from public.raid_room_difficulty_rules;
create table public.raid_room_rescue_reward_items (
 difficulty text not null references public.raid_room_rescue_reward_rules(difficulty),
 item_id text not null check(length(btrim(item_id))>0),
 quantity integer not null check(quantity>0), primary key(difficulty,item_id)
);
create table public.raid_room_rescue_rewards (
 room_id uuid not null, user_id uuid not null, primary key(room_id,user_id),
 foreign key(room_id,user_id) references public.raid_room_rescue_members(room_id,user_id),
 rule_version bigint not null, reward_version bigint not null,
 finalized_battles bigint not null, contribution_damage bigint not null,
 rescue_gate jsonb not null,
 issued_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at=issued_at+interval '30 days')
);
create table public.raid_room_rescue_reward_grants (
 room_id uuid not null,user_id uuid not null,item_id text not null,quantity integer not null check(quantity>0),
 present_id uuid not null unique references public.presents(id),
 primary key(room_id,user_id,item_id),
 foreign key(room_id,user_id) references public.raid_room_rescue_rewards(room_id,user_id)
);
alter table public.raid_room_rescue_reward_rules enable row level security;
alter table public.raid_room_rescue_reward_items enable row level security;
alter table public.raid_room_rescue_rewards enable row level security;
alter table public.raid_room_rescue_reward_grants enable row level security;
revoke all on public.raid_room_rescue_reward_rules,public.raid_room_rescue_reward_items,
 public.raid_room_rescue_rewards,public.raid_room_rescue_reward_grants from public,anon,authenticated,service_role;

-- 集計は保存済みRoom Replay/開始receiptに限定。終了前開始の後確定も含む。
create function public._raid_room_rescue_reward_progress_v1(p_room_id uuid,p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_member public.raid_room_rescue_members%rowtype;v_via boolean;v_count bigint:=0;v_damage bigint:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_member from public.raid_room_rescue_members where room_id=p_room_id and user_id=p_user_id;
 v_via:=found and v_room.owner_user_id<>p_user_id;
 if v_via then
  select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
  from public.raid_damage_logs l
  join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id and s.room_id=p_room_id
  where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
   and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
   and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
   and b.official_context->>'roomId'=p_room_id::text
   and b.finalization_status='FINALIZED' and b.finalized_at>=v_member.joined_at
   and (b.official_context->>'startedAt')::timestamptz>=v_member.joined_at
   and (b.official_context->>'startedAt')::timestamptz<v_boss.expires_at
   and (v_boss.outcome_finalized_at is null or (b.official_context->>'startedAt')::timestamptz<v_boss.outcome_finalized_at);
 end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'rescueGate',public._raid_room_rescue_gate_v1(v_room.difficulty_id,v_via,v_count,v_damage,
    coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $$;

create function public._issue_raid_room_rescue_rewards_v1(p_room_id uuid) returns integer
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_rescue_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_rescue_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled then return 0;end if;
 perform 1 from public.raid_room_difficulty_rules where difficulty=v_room.difficulty_id for share;
 perform 1 from public.raid_room_rescue_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
  from public.raid_room_rescue_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_rescue_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_rescue_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_rescue_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'rescueGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_rescue_rewards(room_id,user_id,rule_version,reward_version,
   finalized_battles,contribution_damage,rescue_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,(v_progress->'rescueGate'->>'ruleVersion')::bigint,v_rule.reward_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'rescueGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド救援成功報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_RESCUE',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'ruleVersion',(v_progress->'rescueGate'->>'ruleVersion')::bigint,'rewardVersion',v_rule.reward_version))
   returning id into v_present;
   insert into public.raid_room_rescue_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

-- logsとReplay確定後に実行。CLEAR時はそれまでに条件達成した全救援者を再評価する。
-- 付与失敗は戦闘確定全体と同一transactionでROLLBACK。例外を握りつぶさない。
create function public.on_raid_room_rescue_reward_finalized_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_room uuid;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED'
  or new.battle_mode<>'RAID' or new.resolution_authority<>'RAID_SERVER' then return new;end if;
 select id into v_room from public.raid_rooms where raid_boss_instance_id=new.source_reference_id;
 if found then perform public._issue_raid_room_rescue_rewards_v1(v_room);end if;
 return new;
end $$;
create trigger raid_room_rescue_reward_finalized_v1
 after update of finalization_status on public.battle_replay_sessions
 for each row execute function public.on_raid_room_rescue_reward_finalized_v1();

create function public.get_raid_room_rescue_reward_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_saved public.raid_room_rescue_rewards%rowtype;
 v_progress jsonb;v_items jsonb:='[]';v_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_saved from public.raid_room_rescue_rewards where room_id=p_room_id and user_id=v_uid;
 if found then
  v_status:='issued';v_progress:=jsonb_build_object('rescueGate',v_saved.rescue_gate);
  select coalesce(jsonb_agg(jsonb_build_object('itemId',g.item_id,'quantity',g.quantity,
   'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at) order by g.item_id),'[]') into v_items
  from public.raid_room_rescue_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id
  where g.room_id=p_room_id and g.user_id=v_uid;
 else
  v_progress:=public._raid_room_rescue_reward_progress_v1(p_room_id,v_uid);
  if v_progress->'rescueGate'->>'status'='unknown' or not exists(
   select 1 from public.raid_room_rescue_reward_rules r where r.difficulty=v_room.difficulty_id and r.enabled
    and exists(select 1 from public.raid_room_rescue_reward_items i where i.difficulty=r.difficulty)) then v_status:='unconfigured';
  elsif v_progress->'rescueGate'->>'status'='succeeded' then v_status:='pending';
  else v_status:='not_eligible';end if;
 end if;
 return jsonb_build_object('roomId',p_room_id,'status',v_status,'rescueGate',v_progress->'rescueGate',
  'issuedAt',v_saved.issued_at,'expiresAt',v_saved.expires_at,'items',v_items);
end $$;
revoke all on function public._raid_room_rescue_reward_progress_v1(uuid,uuid),
 public._issue_raid_room_rescue_rewards_v1(uuid),public.on_raid_room_rescue_reward_finalized_v1(),
 public.get_raid_room_rescue_reward_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_rescue_reward_v1(uuid) to authenticated;

-- usersの主キーを変更しないRoom writerはNO KEY UPDATEで同userを直列化。
-- boss保持中のPresent user FK KEY SHAREとの逆順待ちを防ぐ。
-- 元定義: Migration 253 / users行ロック強度のみ変更。
create or replace function public.create_raid_room_v1(
 p_difficulty_id text,p_raid_variant_id text,p_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare
 v_uid uuid := auth.uid();
 v_level integer;
 v_enabled boolean;
 v_power bigint;
 v_gate jsonb;
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_variant public.canonical_raid_variants%rowtype;
 v_request public.raid_room_creation_requests%rowtype;
 v_instance uuid;
 v_room uuid;
 v_now timestamptz;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_request_id is null or p_difficulty_id is null or p_raid_variant_id is null
   or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then
   raise exception 'invalid creation input' using errcode='22023';
 end if;
 -- 設定無効時は再送も拒否する。作成済みRoomの参照は既存参照RPCを使う。
 select enabled into v_enabled from public.raid_room_creation_settings where singleton for share;
 if v_enabled is distinct from true then
   raise exception 'room creation disabled' using errcode='55000';
 end if;
 -- ユーザー単位で異なる難度を含む再送を直列化。全生成経路のロック順を揃える。
 select level into v_level from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501'; end if;
 select * into v_request from public.raid_room_creation_requests where user_id=v_uid and request_id=p_request_id;
 if found then
   if v_request.difficulty_id<>p_difficulty_id or v_request.raid_variant_id<>p_raid_variant_id then
     raise exception 'request payload conflict' using errcode='22023';
   end if;
   return public.raid_room_projection_v1(v_request.room_id);
 end if;
 if v_level is null or v_level<5 then raise exception 'raid level requirement' using errcode='42501'; end if;
 -- 難度枠を先にロックし、待機後に総合力と生成時刻を取得する。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 空編成を既存集計関数のcoalesceで0として判定しない。初級には総合力制限がない。
 if p_difficulty_id<>'beginner' and not exists(
   select 1 from public.user_main_formations where user_id=v_uid
 ) then raise exception 'power unavailable' using errcode='42501'; end if;
 v_power := public.calculate_user_total_power(v_uid);
 if p_difficulty_id<>'beginner' and (v_power is null or v_power<0) then
   raise exception 'power unavailable' using errcode='42501';
 end if;
 v_gate := public._raid_room_power_gate_v1(p_difficulty_id,v_power);
 if v_gate->>'status' is distinct from 'passed' then
   raise exception 'raid power requirement' using errcode='42501';
 end if;
 select * into v_variant from public.canonical_raid_variants
   where raid_variant_id=p_raid_variant_id and is_production_enabled;
 if not found or v_variant.max_hp is null or v_variant.max_hp<=0 then
   raise exception 'raid variant unavailable' using errcode='22023';
 end if;
 v_now := clock_timestamp();
 v_instance := gen_random_uuid();
 -- 日次グループとの識別のみ。旧writerを遮断するものではないため設定は無効で出荷。
 insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,
   spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_instance,v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,
   lower(v_variant.area_id),'ACTIVE',v_now,v_now+make_interval(hours=>v_rule.duration_hours),
   gen_random_uuid(),(v_now at time zone 'Asia/Tokyo')::date,v_variant.raid_variant_id,'ROOM:'||v_instance::text);
 v_room := (public._raid_room_register_v1(v_instance,v_uid,p_difficulty_id)->>'roomId')::uuid;
 insert into public.raid_room_creation_requests(user_id,request_id,difficulty_id,raid_variant_id,room_id)
 values(v_uid,p_request_id,p_difficulty_id,p_raid_variant_id,v_room);
 -- Room登録・所有者参加・再送台帳まで同一transaction。資源消費や戦闘開始は行わない。
 return public.raid_room_projection_v1(v_room);
end $$;

-- 元定義: Migration 255 / users行ロック強度のみ変更。
create or replace function public.register_raid_room_v1(p_room_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_level integer;v_brief jsonb;v_result jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select level into v_level from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 if exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid) then
 return jsonb_build_object('roomId',p_room_id,'membershipStatus','already_joined');end if;
 v_brief:=public.get_raid_room_briefing_v1(p_room_id);
 if v_brief#>>'{joinEligibility,status}' is distinct from 'passed' then raise exception 'raid participation requirement' using errcode='42501';end if;
 -- private helperがboss/Roomをロック後に期限と定員を再検証する。
 v_result:=public._raid_room_add_member_v1(p_room_id,v_uid);
 return jsonb_build_object('roomId',p_room_id,'membershipStatus',v_result->>'status');
end $$;

-- 元定義: Migration 258 / users行ロック強度のみ変更。
create or replace function public.cancel_raid_room_battle_request_v1(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_receipt jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023';end if;
 perform 1 from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 v_receipt:=public.get_raid_room_battle_start_receipt_v1(p_request_id);
 if v_receipt is not null then return jsonb_build_object('status','started','receipt',v_receipt);end if;
 insert into public.raid_room_battle_request_cancellations(user_id,request_id)
 values(v_uid,p_request_id) on conflict(user_id,request_id) do nothing;
 return jsonb_build_object('status','cancelled');
end $$;

-- 元定義: Migration 258 / users行ロック強度のみ変更。
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
 select * into v_user from public.users where id=v_uid for no key update;
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

-- 元定義: Migration 259 / users行ロック強度のみ変更。
create or replace function public.request_raid_room_rescue_v1(p_room_id uuid,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_saved public.raid_room_rescue_requests%rowtype;v_name text;v_avatar text;v_guild_id uuid;
 v_activity integer;v_guild integer;v_enabled boolean;v_id uuid;v_publications jsonb:='[]';v_result jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_room_id is null or p_request_id is null then raise exception 'invalid rescue input' using errcode='22023';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 -- 設定→user→boss→Room: 開始/参加と同じ順序。設定の切替とも直列化する。
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 select username,avatar_url into v_name,v_avatar from public.users where id=v_uid for no key update;
 if not found or v_name is null then raise exception 'user unavailable' using errcode='42501';end if;
 select * into v_saved from public.raid_room_rescue_requests where user_id=v_uid and request_id=p_request_id;
 if found then
  if v_saved.room_id<>p_room_id then raise exception 'request payload mismatch' using errcode='22023';end if;
  return v_saved.response;
 end if;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 if v_room.owner_user_id<>v_uid then raise exception 'room owner required' using errcode='42501';end if;
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 perform 1 from public.raid_rooms where id=p_room_id for update;
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0 or v_boss.expires_at is null or v_boss.expires_at<=clock_timestamp() or v_boss.outcome_finalized_at is not null then raise exception 'room inactive' using errcode='22023';end if;
 select guild_id into v_guild_id from public.guild_members where user_id=v_uid for share;
 select count(*) filter(where channel='ACTIVITY'),count(*) filter(where channel='GUILD') into v_activity,v_guild from public.raid_room_rescue_publications where room_id=p_room_id;
 if v_activity>=3 and (v_guild_id is null or v_guild>=3) then raise exception 'rescue publication limit' using errcode='22023';end if;
 if v_activity<3 then
  v_activity:=v_activity+1;
  insert into public.raid_room_rescue_publications(room_id,requester_user_id,request_id,channel,ordinal)
   values(p_room_id,v_uid,p_request_id,'ACTIVITY',v_activity) returning id into v_id;
  insert into public.social_activity_feed(activity_type,actor_user_id,actor_display_name,display_payload)
   values('RAID_HELP_REQUEST',v_uid,v_name,jsonb_build_object('roomId',p_room_id,'rescueId',v_id));
  v_publications:=v_publications||jsonb_build_array(jsonb_build_object('rescueId',v_id,'channel','ACTIVITY','guildId',null));
 end if;
 if v_guild_id is not null and v_guild<3 then
  v_guild:=v_guild+1;
  insert into public.raid_room_rescue_publications(room_id,requester_user_id,request_id,channel,guild_id,ordinal)
   values(p_room_id,v_uid,p_request_id,'GUILD',v_guild_id,v_guild) returning id into v_id;
  -- システム投稿: 発言報酬/mission/KPI/human responseとchatters集計へ混入させない。
  insert into public.board_posts(title,content,author_id,user_id,author_name,author_avatar_url,target_type,target_id,is_system,raid_rescue_id)
   values('','レイドの救援をお願いします。',v_uid,null,v_name,v_avatar,'GUILD',v_guild_id,true,v_id);
  v_publications:=v_publications||jsonb_build_array(jsonb_build_object('rescueId',v_id,'channel','GUILD','guildId',v_guild_id));
 end if;
 v_result:=jsonb_build_object('roomId',p_room_id,'requestId',p_request_id,'publications',v_publications,'activityCount',v_activity,'guildCount',v_guild,'maxPerChannel',3);
 insert into public.raid_room_rescue_requests values(v_uid,p_request_id,p_room_id,v_result);
 return v_result;
end $$;

-- 元定義: Migration 259 / users行ロック強度のみ変更。
create or replace function public.join_raid_room_rescue_v1(p_rescue_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_ref jsonb;v_room uuid;v_result jsonb;v_via boolean;v_enabled boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 perform 1 from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 v_ref:=public.get_raid_room_rescue_v1(p_rescue_id);v_room:=(v_ref->>'roomId')::uuid;
 -- 通常登録と同じuserロック下で加入。既存通常参加を救援へ昇格させない。
 v_result:=public.register_raid_room_v1(v_room);
 if v_result->>'membershipStatus'='joined' and not exists(select 1 from public.raid_rooms where id=v_room and owner_user_id=v_uid) then
  insert into public.raid_room_rescue_members(room_id,user_id,rescue_id,joined_at)
   select room_id,user_id,p_rescue_id,joined_at from public.raid_room_members where room_id=v_room and user_id=v_uid;
 end if;
 select exists(select 1 from public.raid_room_rescue_members where room_id=v_room and user_id=v_uid) into v_via;
 return v_result||jsonb_build_object('viaRescue',v_via);
end $$;

commit;
notify pgrst, 'reload schema';
