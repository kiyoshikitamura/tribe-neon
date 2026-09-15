-- 375a0adの未存在14本だけ。各ファイル内transactionを外し、単一transactionへ統合。

-- SOURCE: 20260908000250_raid_room_read_projection.sql

-- 参照経路だけを準備する。生成・公開・参加・報酬ルールの確定や既存Instanceの割当は行わない。
create table public.raid_rooms (
  id uuid primary key default gen_random_uuid(),
  raid_boss_instance_id uuid not null unique references public.raid_bosses(id),
  owner_user_id uuid not null references public.users(id),
  difficulty_id text not null check (difficulty_id in ('beginner','intermediate','advanced','expert')),
  created_at timestamptz not null default now()
);
create table public.raid_room_members (
  room_id uuid not null references public.raid_rooms(id),
  user_id uuid not null references public.users(id),
  joined_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
alter table public.raid_room_members enable row level security;
revoke all on table public.raid_room_members from public, anon, authenticated;
create index raid_room_members_user_idx on public.raid_room_members(user_id,room_id);
create index raid_rooms_owner_created_idx on public.raid_rooms(owner_user_id, created_at desc, id);
alter table public.raid_rooms enable row level security;
-- default-deny RLS。未確定の公開方針をテーブルSELECT権限で迂回できない。
revoke all on table public.raid_rooms from public, anon, authenticated;

create function public.raid_room_can_read_v1(p_room_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.raid_rooms r where r.id = p_room_id
    and (r.owner_user_id = auth.uid() or exists (
      select 1 from public.raid_room_members m where m.room_id=r.id and m.user_id=auth.uid()
    ) or exists (
      select 1 from public.raid_instance_user_progress p
      where p.raid_boss_instance_id = r.raid_boss_instance_id
        and p.user_id = auth.uid() and p.finalized_battles > 0
    ))
  )
$$;
revoke all on function public.raid_room_can_read_v1(uuid) from public, anon, authenticated;

-- 内部専用のDTO生成。取得時に既存rotate/finalizeを呼ばない。
create function public.raid_room_projection_v1(p_room_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'roomId',r.id,'difficultyId',r.difficulty_id,
    'owner',jsonb_build_object('status','available','value',jsonb_build_object(
      'userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown'))),
    'state',case when b.status='ACTIVE' and b.current_hp=0 then jsonb_build_object('status','unknown')
      when b.status='ACTIVE' and b.expires_at<=now() then jsonb_build_object('status','available','value','expired')
      when b.status in ('ACTIVE','CLEARED','EXPIRED')
      then jsonb_build_object('status','available','value',lower(b.status))
      else jsonb_build_object('status','unknown') end,
    'createdAt',jsonb_build_object('status','available','value',r.created_at),
    'expiresAt',jsonb_build_object('status','available','value',b.expires_at),
    'endedAt',jsonb_build_object('status','available','value',b.outcome_finalized_at),
    'hp',case when b.current_hp is not null and b.max_hp is not null
      then jsonb_build_object('status','available','value',jsonb_build_object('current',b.current_hp,'max',b.max_hp))
      else jsonb_build_object('status','unknown') end,
    'participantCount',jsonb_build_object('status','available','value',(
      select count(*) from (
        select r.owner_user_id as user_id
        union select m.user_id from public.raid_room_members m where m.room_id=r.id
        union select p.user_id from public.raid_instance_user_progress p
          where p.raid_boss_instance_id=r.raid_boss_instance_id and p.finalized_battles>0
      ) participants)),
    'serverEligibility',jsonb_build_object('status','unknown')
  ) from public.raid_rooms r join public.raid_bosses b on b.id = r.raid_boss_instance_id
    join public.users u on u.id = r.owner_user_id
  where r.id = p_room_id
$$;
revoke all on function public.raid_room_projection_v1(uuid) from public, anon, authenticated;

create function public.list_raid_rooms_v1(
  p_difficulty_id text default null, p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_items jsonb; v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000
    or (p_difficulty_id is not null and p_difficulty_id not in ('beginner','intermediate','advanced','expert')) then
    raise exception 'invalid pagination or difficulty' using errcode='22023';
  end if;
  with page as (
    select r.id,r.created_at from public.raid_rooms r
    where (p_difficulty_id is null or r.difficulty_id=p_difficulty_id)
      and public.raid_room_can_read_v1(r.id)
    order by r.created_at desc,r.id limit p_limit + 1 offset p_offset
  ), numbered as (select *,row_number() over(order by created_at desc,id) n from page)
  select coalesce(jsonb_agg(public.raid_room_projection_v1(id) order by created_at desc,id)
    filter(where n <= p_limit),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('rooms',v_items,'nextOffset',case when v_count > p_limit then p_offset+p_limit else null end);
end $$;

create function public.get_raid_room_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.raid_room_can_read_v1(p_room_id) then
    raise exception 'room unavailable' using errcode='P0002';
  end if;
  return public.raid_room_projection_v1(p_room_id);
end $$;

create function public.get_raid_room_participants_v1(
  p_room_id uuid,p_limit integer default 20,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_items jsonb; v_count integer; v_instance uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.raid_room_can_read_v1(p_room_id) then
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

revoke all on function public.list_raid_rooms_v1(text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_raid_room_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_raid_room_participants_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_raid_rooms_v1(text,integer,integer) to authenticated;
grant execute on function public.get_raid_room_v1(uuid) to authenticated;
grant execute on function public.get_raid_room_participants_v1(uuid,integer,integer) to authenticated;



-- SOURCE: 20260908000251_raid_room_condition_rules.sql
-- Raid Room条件判定の準備。権利付与・既存戦闘・報酬経路へは接続しない。
create table if not exists public.raid_room_difficulty_rules (
  difficulty text primary key check (difficulty in ('beginner', 'intermediate', 'advanced', 'expert')),
  minimum_power bigint,
  rescue_min_battles bigint check (rescue_min_battles >= 0),
  rescue_min_contribution_damage bigint check (rescue_min_contribution_damage >= 0),
  rule_version bigint not null default 1 check (rule_version > 0),
  constraint raid_room_difficulty_power_valid check (
    (difficulty = 'beginner' and minimum_power is null)
    or (difficulty <> 'beginner' and minimum_power is not null and minimum_power >= 0)
  )
);

alter table public.raid_room_difficulty_rules enable row level security;
revoke all on table public.raid_room_difficulty_rules from public, anon, authenticated;

-- 確定済み参加下限のみ登録する。救援候補値は採用せず未設定を維持する。
-- 再適用時に調整済み設定・版番号を上書きしない。
insert into public.raid_room_difficulty_rules
  (difficulty, minimum_power, rescue_min_battles, rescue_min_contribution_damage, rule_version)
values ('beginner', null, null, null, 1),
       ('intermediate', 160000, null, null, 1),
       ('advanced', 200000, null, null, 1),
       ('expert', 240000, null, null, 1)
on conflict (difficulty) do nothing;

create or replace function public._raid_room_power_gate_v1(p_difficulty text, p_power bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_minimum bigint;
  v_actual bigint := case when p_power >= 0 then p_power else null end;
  v_status text;
  v_reason text;
begin
  if p_difficulty is null or p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert') then
    v_status := 'unknown';
    v_reason := 'invalid_difficulty';
  else
    select r.minimum_power into v_minimum
      from public.raid_room_difficulty_rules r where r.difficulty = p_difficulty;
    if not found then
      v_status := 'unknown';
      v_reason := 'rule_unavailable';
    elsif v_minimum is null then
      -- 初級は総合力条件だけを通過。参加許可全体を意味しない。
      v_status := 'passed';
      v_reason := 'no_power_restriction';
    elsif v_actual is null then
      v_status := 'unknown';
      v_reason := case when p_power is null then 'power_unavailable' else 'invalid_power' end;
    elsif v_actual >= v_minimum then
      v_status := 'passed';
      v_reason := 'meets_minimum';
    else
      v_status := 'failed';
      v_reason := 'below_minimum';
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'minimumPower', v_minimum,
    'actualPower', v_actual, 'reason', v_reason);
end;
$$;

create or replace function public._raid_room_rescue_gate_v1(
  p_difficulty text,
  p_via_rescue boolean,
  p_finalized_battles bigint,
  p_contribution_damage bigint,
  p_room_cleared boolean
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_rule public.raid_room_difficulty_rules%rowtype;
  v_status text := 'unknown';
  v_reason text;
begin
  if p_difficulty is null or p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert') then
    v_reason := 'invalid_difficulty';
  else
    select r.* into v_rule from public.raid_room_difficulty_rules r where r.difficulty = p_difficulty;
    if not found then
      v_reason := 'rule_unavailable';
    elsif v_rule.rescue_min_battles is null or v_rule.rescue_min_contribution_damage is null then
      v_reason := 'thresholds_unconfigured';
    elsif p_finalized_battles < 0 or p_contribution_damage < 0 then
      v_reason := 'invalid_input';
    elsif p_via_rescue is null or p_finalized_battles is null
      or p_contribution_damage is null or p_room_cleared is null then
      v_reason := 'input_unavailable';
    elsif p_via_rescue and p_room_cleared
      and p_finalized_battles >= v_rule.rescue_min_battles
      and p_contribution_damage >= v_rule.rescue_min_contribution_damage then
      v_status := 'succeeded';
      v_reason := 'conditions_met';
    else
      v_status := 'not_succeeded';
      v_reason := 'conditions_not_met';
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'reason', v_reason,
    'ruleVersion', v_rule.rule_version,
    'minimumBattles', v_rule.rescue_min_battles,
    'minimumContributionDamage', v_rule.rescue_min_contribution_damage);
end;
$$;

revoke all on function public._raid_room_power_gate_v1(text, bigint) from public, anon, authenticated;
revoke all on function public._raid_room_rescue_gate_v1(text, boolean, bigint, bigint, boolean) from public, anon, authenticated;

comment on table public.raid_room_difficulty_rules is 'Raid Room条件設定。救援閾値の初期NULLは未設定。権利確定時は採用した設定版を別途保存する。';
comment on function public._raid_room_power_gate_v1(text, bigint) is '非公開の総合力条件判定。呼出側がサーバー正本を取得する必要があり、参加許可そのものではない。';
comment on function public._raid_room_rescue_gate_v1(text, boolean, bigint, bigint, boolean) is '非公開の救援AND条件判定。信頼済み確定集計のみを渡す。報酬権利の作成・付与は行わない。';


-- SOURCE: 20260908000252_raid_room_lifecycle.sql

-- 公開生成・参加APIではない。資格・費用を検証する将来のwriterだけが利用する。
create table if not exists public.raid_room_lifecycle_rules (
  difficulty text primary key check (difficulty in ('beginner','intermediate','advanced','expert')),
  max_active_rooms integer not null check (max_active_rooms > 0),
  member_capacity integer not null check (member_capacity > 0),
  duration_hours integer not null check (duration_hours > 0)
);
alter table public.raid_room_lifecycle_rules enable row level security;
revoke all on table public.raid_room_lifecycle_rules from public, anon, authenticated, service_role;
insert into public.raid_room_lifecycle_rules values
 ('beginner',10,20,24),('intermediate',10,20,24),('advanced',10,20,24),('expert',5,20,24)
on conflict (difficulty) do nothing;
-- service_roleの既定権限も除去し、直接更新で登録処理を迂回させない。
revoke all on table public.raid_rooms, public.raid_room_members from public, anon, authenticated, service_role;

create or replace function public._raid_room_register_v1(
 p_instance_id uuid, p_owner_user_id uuid, p_difficulty_id text
) returns jsonb language plpgsql volatile security invoker set search_path = pg_catalog
as $$
declare
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_boss public.raid_bosses%rowtype;
 v_room public.raid_rooms%rowtype;
 v_now timestamptz;
 v_count bigint;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_instance_id is null or p_owner_user_id is null or p_difficulty_id is null then
   raise exception 'invalid registration input' using errcode='22023';
 end if;
 -- 同難度の枠確認と登録を直列化。待機後の別SQLで最新の確定行を数える。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 select * into v_boss from public.raid_bosses where id=p_instance_id for update;
 if not found then raise exception 'instance unavailable' using errcode='P0002'; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=p_instance_id;
 if found then
   if v_room.owner_user_id<>p_owner_user_id or v_room.difficulty_id<>p_difficulty_id then
     raise exception 'registration conflict' using errcode='22023';
   end if;
   -- 終了後の再送も登録済み事実のみ返す。再開・再参加を許可しない。
   return jsonb_build_object('roomId',v_room.id,'status','already_registered');
 end if;
 v_now := clock_timestamp();
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0
   or v_boss.expires_at is null or v_boss.expires_at<=v_now
   or v_boss.outcome_finalized_at is not null then
   raise exception 'instance inactive' using errcode='22023';
 end if;
 if v_boss.spawned_at is null or not isfinite(v_boss.spawned_at) or v_boss.spawned_at>v_now
   or v_boss.expires_at is distinct from v_boss.spawned_at + make_interval(hours=>v_rule.duration_hours) then
   raise exception 'invalid instance lifetime' using errcode='22023';
 end if;
 if v_boss.current_hp is distinct from v_boss.max_hp
   or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id)
   or exists(select 1 from public.raid_damage_logs where raid_boss_instance_id=p_instance_id) then
   raise exception 'instance already used' using errcode='22023';
 end if;
 select count(*) into v_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
 where r.difficulty_id=p_difficulty_id and b.status='ACTIVE' and b.current_hp>0
   and b.expires_at>v_now and b.outcome_finalized_at is null;
 if v_count>=v_rule.max_active_rooms then raise exception 'active room limit reached' using errcode='22023'; end if;
 insert into public.raid_rooms(raid_boss_instance_id,owner_user_id,difficulty_id,created_at)
 values(p_instance_id,p_owner_user_id,p_difficulty_id,v_boss.spawned_at) returning * into v_room;
 insert into public.raid_room_members(room_id,user_id,joined_at) values(v_room.id,p_owner_user_id,v_now);
 return jsonb_build_object('roomId',v_room.id,'status','registered');
end;
$$;

create or replace function public._raid_room_add_member_v1(p_room_id uuid,p_user_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = pg_catalog
as $$
declare
 v_room public.raid_rooms%rowtype;
 v_boss public.raid_bosses%rowtype;
 v_capacity integer;
 v_count bigint;
 v_now timestamptz;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_room_id is null or p_user_id is null then raise exception 'invalid membership input' using errcode='22023'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002'; end if;
 -- 戦闘確定と同じInstanceを先にロックし、終了判定と定員判定を直列化する。
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if not found then raise exception 'instance unavailable' using errcode='P0002'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id for update;
 if not found or v_room.raid_boss_instance_id<>v_boss.id then
   raise exception 'room changed' using errcode='40001';
 end if;
 if v_room.owner_user_id=p_user_id or exists(
   select 1 from public.raid_room_members where room_id=p_room_id and user_id=p_user_id
 ) then
   return jsonb_build_object('roomId',p_room_id,'userId',p_user_id,'status','already_joined');
 end if;
 v_now := clock_timestamp();
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0
   or v_boss.expires_at is null or v_boss.expires_at<=v_now or v_boss.outcome_finalized_at is not null then
   raise exception 'room inactive' using errcode='22023';
 end if;
 select member_capacity into v_capacity from public.raid_room_lifecycle_rules where difficulty=v_room.difficulty_id;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 参照RPCと同じ集合。旧確定参加者が存在する場合も人数から脱落させない。
 select count(*) into v_count from (
   select v_room.owner_user_id as user_id
   union select user_id from public.raid_room_members where room_id=p_room_id
   union select user_id from public.raid_instance_user_progress
     where raid_boss_instance_id=v_boss.id and finalized_battles>0
 ) participants;
 if v_count>=v_capacity and not exists(
   select 1 from public.raid_instance_user_progress
   where raid_boss_instance_id=v_boss.id and user_id=p_user_id and finalized_battles>0
 ) then raise exception 'room full' using errcode='22023'; end if;
 insert into public.raid_room_members(room_id,user_id,joined_at) values(p_room_id,p_user_id,v_now);
 return jsonb_build_object('roomId',p_room_id,'userId',p_user_id,'status','joined');
end;
$$;

revoke all on function public._raid_room_register_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public._raid_room_add_member_v1(uuid,uuid) from public,anon,authenticated,service_role;


-- SOURCE: 20260908000253_raid_room_creation.sql

-- 旧開始・終了・報酬経路の分離前には有効化しない。公開操作から設定変更不可。
create table public.raid_room_creation_settings (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false
);
insert into public.raid_room_creation_settings values (true,false);
alter table public.raid_room_creation_settings enable row level security;
revoke all on public.raid_room_creation_settings from public,anon,authenticated,service_role;

create table public.raid_room_creation_requests (
 user_id uuid not null references public.users(id),
 request_id uuid not null,
 difficulty_id text not null,
 raid_variant_id text not null,
 room_id uuid not null references public.raid_rooms(id),
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.raid_room_creation_requests enable row level security;
revoke all on public.raid_room_creation_requests from public,anon,authenticated,service_role;

create function public.list_raid_room_boss_choices_v1() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 return jsonb_build_object('choices',coalesce((select jsonb_agg(
   jsonb_build_object('raidVariantId',raid_variant_id,'name',raid_name) order by raid_variant_id)
   from public.canonical_raid_variants where is_production_enabled),'[]'::jsonb));
end $$;

create function public.create_raid_room_v1(
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
 select level into v_level from public.users where id=v_uid for update;
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

revoke all on function public.list_raid_room_boss_choices_v1() from public,anon,authenticated,service_role;
revoke all on function public.create_raid_room_v1(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_raid_room_boss_choices_v1() to authenticated;
grant execute on function public.create_raid_room_v1(text,text,uuid) to authenticated;


-- SOURCE: 20260908000254_raid_room_legacy_isolation.sql

-- 第7工程: 既存非Room処理を維持し、新Roomを旧戦闘・報酬・再生成から隔離する。
-- 既存定義の出典: 00146 / 00184 / 00210 / 00211。運用フラグは変更しない。

create or replace function public.start_raid_battle(p_instance_id uuid,p_character_ids text[],p_tactic text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_user public.users%rowtype; v_instance record; v_cost integer; v_cost_type text; v_guild uuid; v_players jsonb; v_enemy jsonb:='[]'; v_member text; v_entry record; v_skill_refs jsonb; v_skills jsonb; v_replay uuid; v_seed bigint; v_slot integer:=0;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_tactic not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS') then raise exception 'invalid tactic' using errcode='22023'; end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid); select * into v_user from public.users where id=v_uid for update;
 if v_user.level<5 then raise exception 'player level 5 is required' using errcode='23514'; end if;
 select boss.*,variant.raid_name,variant.atk,variant.def,variant.spd,variant.member_character_ids into v_instance from public.raid_bosses boss join public.canonical_raid_variants variant on variant.raid_variant_id=boss.raid_variant_id where boss.id=p_instance_id and boss.status='ACTIVE' and boss.expires_at>now() for update of boss;
 if not found then raise exception 'Raid instance is not active' using errcode='P0002'; end if;

 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then raise exception 'Room battles require the Room entry point' using errcode='55000'; end if;
 if not v_user.raid_free_entry_consumed then v_cost:=0;v_cost_type:='FREE_FIRST';update public.users set raid_free_entry_consumed=true where id=v_uid;
 elsif v_user.raid_points>=1 then v_cost:=1;v_cost_type:='RAID_POINT';update public.users set raid_points=raid_points-1,raid_points_last_recovered_at=case when raid_points=5 then now() else raid_points_last_recovered_at end where id=v_uid;v_user.raid_points:=v_user.raid_points-1;
 else raise exception 'insufficient Raid points' using errcode='23514'; end if;
 select guild_id into v_guild from public.guild_members where user_id=v_uid; v_players:=public.build_server_battle_snapshot(v_uid,p_character_ids,'PLAYER');
 for v_member in select value from jsonb_array_elements_text(v_instance.member_character_ids) loop
  v_slot:=v_slot+1; select * into v_entry from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by(local_affinity)desc,weight desc limit 1;
  v_skill_refs:=coalesce(v_entry.skill_loadout,(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name,'activationType',s.activation_type,'cooldown',s.cooldown,'availableFromRound',s.available_from_round,'target',s.target,'effects',s.effects,'exclusiveCharacterId',s.exclusive_character_id) order by x.ordinality),'[]') into v_skills from jsonb_array_elements_text(v_skill_refs) with ordinality x(skill_id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.skill_id;
  v_enemy:=v_enemy||jsonb_build_array(jsonb_build_object('id','raid_'||v_instance.id||'_'||v_slot,'characterId',v_member,'name',coalesce((select display_name from public.canonical_character_master where version='2026-08-21' and character_id=v_member),v_member),'team','ENEMY','alignment',coalesce((select attribute from public.canonical_character_master where version='2026-08-21' and character_id=v_member),'NEUTRAL'),'level',30,'stats',jsonb_build_object('hp',ceil(v_instance.max_hp::numeric/5),'atk',v_instance.atk,'def',v_instance.def,'spd',v_instance.spd,'luk',0),'equippedSkillRefs',v_skill_refs,'skills',v_skills,'equipment','[]'::jsonb));
 end loop;
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority,finalization_status,official_context) values(v_uid,'RAID',p_instance_id,p_tactic,v_seed,v_players,v_enemy,'RAID_SERVER','PENDING',jsonb_build_object('guildIdSnapshot',v_guild,'costType',v_cost_type,'cost',v_cost,'remainingRaidPoints',v_user.raid_points,'bossHpAtStart',v_instance.current_hp,'bossMaxHp',v_instance.max_hp,'baseId',v_instance.base_id,'raidDayKey',v_instance.raid_day_key,'raidVariantId',v_instance.raid_variant_id)) returning id into v_replay;
 return jsonb_build_object('replay_session_id',v_replay,'player_snapshot',v_players,'enemy_snapshot',v_enemy,'cost_type',v_cost_type,'cost',v_cost,'remaining_raid_points',v_user.raid_points,'guild_id_snapshot',v_guild);
end $$;

create or replace function public.finalize_raid_battle(
  p_replay_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  perform public.validate_official_battle_result(p_result);
  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;


 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=v_instance.id) then raise exception 'Room battles require the Room finalization entry point' using errcode='55000'; end if;
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
$$;

create or replace function public.finalize_expired_raid_instance(p_instance_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_instance public.raid_bosses%rowtype; v_user record;
begin
 select * into v_instance from public.raid_bosses where id=p_instance_id for update;
 if not found or v_instance.outcome_finalized_at is not null then return; end if;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return; end if;

 if v_instance.status='ACTIVE' and v_instance.current_hp>0 and v_instance.expires_at>clock_timestamp() then return; end if;
 if v_instance.current_hp=0 then
  update public.raid_bosses set status='CLEARED',outcome='DEFEAT_SUCCESS',outcome_finalized_at=now(),cleared_at=now(),respawn_after=now()+interval '5 minutes',raid_day_key=coalesce(raid_day_key,rotation_date::text) where id=p_instance_id returning * into v_instance;
  for v_user in select user_id from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id and finalized_battles>0 loop
   perform public.grant_canonical_raid_day_clear_reward(p_instance_id,v_user.user_id);
  end loop;
 else
  update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=now() where id=p_instance_id;
 end if;
end $$;

create or replace function public.respawn_cleared_raid_slot(p_cleared_instance_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_old public.raid_bosses%rowtype; v_new uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cleared_instance_id::text||':respawn',0));
 select * into v_old from public.raid_bosses where id=p_cleared_instance_id and status='CLEARED' and respawn_after<=now() for update;
 if not found then return null; end if;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_cleared_instance_id) then return null; end if;

 if exists(select 1 from public.raid_bosses where raid_day_key=v_old.raid_day_key and base_id=v_old.base_id and status='ACTIVE' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id)) then return null; end if;
 insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_old.boss_id,v_old.boss_master_id,v_old.max_hp,v_old.max_hp,v_old.base_id,'ACTIVE',now(),v_old.expires_at,gen_random_uuid(),v_old.rotation_date,v_old.raid_variant_id,v_old.raid_day_key) returning id into v_new;
 return v_new;
end $$;

create or replace function public.grant_canonical_raid_day_clear_reward(p_instance_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_instance public.raid_bosses%rowtype; v_claim public.raid_clear_reward_claims%rowtype; v_item record; v_inserted boolean; v_row_count integer;
begin
 select * into v_instance from public.raid_bosses where id=p_instance_id for update;
 if not found or v_instance.status<>'CLEARED' or v_instance.raid_day_key is null then return jsonb_build_object('eligible',false); end if;

 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return jsonb_build_object('eligible',false); end if;
 if not exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id and user_id=p_user_id and finalized_battles>0) then return jsonb_build_object('eligible',false); end if;
 insert into public.raid_clear_reward_claims(raid_day_key,user_id,reward_type,source_instance_id)
 values(v_instance.raid_day_key,p_user_id,'CLEAR_REWARD',p_instance_id)
 on conflict do nothing; get diagnostics v_row_count=row_count; v_inserted:=v_row_count=1;
 select * into v_claim from public.raid_clear_reward_claims where raid_day_key=v_instance.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD' for update;
 if v_inserted then
  update public.raid_clear_reward_claims set ticket_roll=random()<0.30,ticket_item_id=public.resolve_canonical_reward_item('NORMAL_GACHA_TICKET_RANDOM'),awakening_roll=random()<0.01
  where raid_day_key=v_instance.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD' returning * into v_claim;
 end if;
 if not v_inserted and v_claim.delivery_status='DELIVERED' then return jsonb_build_object('eligible',true,'already_claimed',true); end if;
 begin
  for v_item in select * from (values('SKILL_MANUAL'::text,1,true),(v_claim.ticket_item_id,1,v_claim.ticket_roll),('AWAKENING_BOOK',1,v_claim.awakening_roll)) x(item_id,quantity,selected) where selected loop
   insert into public.raid_clear_reward_deliveries values(v_claim.raid_day_key,p_user_id,'CLEAR_REWARD',v_item.item_id,v_item.quantity,v_claim.source_instance_id,now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user_id,v_item.item_id,v_item.quantity,'レイドクリア報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end loop;
  update public.raid_clear_reward_claims set delivery_status='DELIVERED',delivered_at=now(),last_error=null where raid_day_key=v_claim.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD';
 exception when others then
  update public.raid_clear_reward_claims set delivery_status='PENDING',last_error=sqlstate where raid_day_key=v_claim.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD';
 end;
 return jsonb_build_object('eligible',true,'already_claimed',not v_inserted,'ticket_roll',v_claim.ticket_roll,'awakening_roll',v_claim.awakening_roll);
end $$;

create or replace function public.grant_canonical_raid_reward(p_instance uuid,p_user uuid,p_type text,p_key text) returns integer language plpgsql security definer set search_path=public as $$
declare row record; granted integer:=0;
begin
 perform 1 from public.raid_bosses where id=p_instance for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance) then return 0; end if;
 for row in select * from public.canonical_raid_reward_master where version='2026-08-22' and reward_type=p_type and reward_key=p_key loop
 insert into public.raid_production_reward_grants values(p_instance,p_user,p_type,p_key,row.item_id,row.quantity,now()) on conflict do nothing;
 if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user,row.item_id,row.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days'); granted:=granted+1; end if;
 end loop; return granted; end $$;

create or replace function public.grant_raid_reward(
  p_instance_id uuid, p_user_id uuid, p_reward_id integer, p_reason text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_reward record;
begin
  perform 1 from public.raid_bosses where id=p_instance_id for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return false; end if;
  insert into public.raid_reward_grants(raid_boss_instance_id,user_id,reward_id,reward_reason)
  values(p_instance_id,p_user_id,p_reward_id,p_reason) on conflict do nothing;
  if not found then return false; end if;
  select coalesce(reward_item_id,item_id) item_id, greatest(coalesce(reward_quantity,quantity,1),1) quantity
  into v_reward from public.raid_rewards_master where id=p_reward_id;
  insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
  values(p_user_id,v_reward.item_id,v_reward.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days');
  return true;
end; $$;

create or replace function public.rotate_daily_raids() returns void language plpgsql security definer set search_path=public as $$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_pair text[]; v_area text; v_variant public.canonical_raid_variants%rowtype; v_start timestamptz; v_end timestamptz; v_cleared record;
begin
 perform pg_advisory_xact_lock(hashtextextended('CANONICAL_RAID_ROTATION:'||v_today::text,0));
 for v_cleared in select id from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and status='ACTIVE' and (current_hp=0 or expires_at<=now()) for update loop perform public.finalize_expired_raid_instance(v_cleared.id); end loop;
 for v_cleared in select id from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and status='CLEARED' and raid_day_key=v_today::text and respawn_after<=now() for update loop perform public.respawn_cleared_raid_slot(v_cleared.id); end loop;
 v_pair:=public.canonical_raid_rotation_pair(v_today); v_start:=(v_today::timestamp at time zone 'Asia/Tokyo'); v_end:=v_start+interval '24 hours';
 foreach v_area in array v_pair loop
  if not exists(select 1 from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and raid_day_key=v_today::text and base_id=v_area and status='ACTIVE') and not exists(select 1 from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and raid_day_key=v_today::text and base_id=v_area and status='CLEARED' and respawn_after>now()) then
   select * into v_variant from public.canonical_raid_variants where area_id=upper(v_area) and is_production_enabled order by raid_variant_id limit 1;
   insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key) values(v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,v_area,'ACTIVE',greatest(now(),v_start),v_end,gen_random_uuid(),v_today,v_variant.raid_variant_id,v_today::text);
  end if;
 end loop;
end $$;

create or replace function public.get_active_raids() returns jsonb language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if; perform public.rotate_daily_raids();
 return coalesce((select jsonb_agg(jsonb_build_object('id',boss.id,'bossMasterId',master.boss_id,'bossName',master.display_name,'profileType',master.profile_type,'attribute',master.attribute,'level',master.reference_level,'currentHp',boss.current_hp,'maxHp',boss.max_hp,'baseId',boss.base_id,'spawnedAt',boss.spawned_at,'expiresAt',boss.expires_at,'status',boss.status,'skillLoadout',master.skill_loadout) order by boss.base_id) from public.raid_bosses boss join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id) and boss.status='ACTIVE' and boss.expires_at>clock_timestamp()),'[]'::jsonb);
end $$;
-- 公開権限は既存と同じ。Room専用の参加・確定は公開しない。
revoke all on function public.start_raid_battle(uuid,text[],text), public.get_active_raids() from public,anon;
grant execute on function public.start_raid_battle(uuid,text[],text), public.get_active_raids() to authenticated;
revoke all on function public.finalize_raid_battle(uuid,jsonb), public.finalize_expired_raid_instance(uuid), public.respawn_cleared_raid_slot(uuid), public.grant_canonical_raid_day_clear_reward(uuid,uuid), public.grant_canonical_raid_reward(uuid,uuid,text,text), public.grant_raid_reward(uuid,uuid,integer,text), public.rotate_daily_raids() from public,anon,authenticated;
grant execute on function public.finalize_raid_battle(uuid,jsonb), public.finalize_expired_raid_instance(uuid), public.respawn_cleared_raid_slot(uuid), public.grant_canonical_raid_day_clear_reward(uuid,uuid), public.grant_canonical_raid_reward(uuid,uuid,text,text), public.grant_raid_reward(uuid,uuid,integer,text), public.rotate_daily_raids() to service_role;




-- SOURCE: 20260908000255_raid_room_entry.sql

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


-- SOURCE: 20260908000256_raid_room_finalization.sql

-- Roomの正本は台帳と開始receipt。クライアント指定metadataだけでは認定しない。
create function public.get_raid_battle_route_v1(p_replay_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_replay public.battle_replay_sessions%rowtype; v_room public.raid_rooms%rowtype;
begin
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id;
 if not found or v_replay.battle_mode<>'RAID' or v_replay.resolution_authority<>'RAID_SERVER' then
  raise exception 'official Raid replay required' using errcode='42501'; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=v_replay.source_reference_id;
 if not found then
  if v_replay.official_context ? 'roomId' or exists(select 1 from public.raid_room_battle_start_requests where replay_session_id=p_replay_id) then
   raise exception 'Room authority mismatch' using errcode='23514'; end if;
  return 'LEGACY';
 end if;
 if v_replay.official_context->>'roomId' is distinct from v_room.id::text
 or v_replay.official_context->>'raidRoomVersion' is distinct from '1'
 or not exists(select 1 from public.raid_room_battle_start_requests q
  where q.replay_session_id=p_replay_id and q.user_id=v_replay.requester_user_id and q.room_id=v_room.id
   and q.tactic=v_replay.tactic_id and q.response->>'replay_session_id'=p_replay_id::text
   and q.response->>'room_id'=v_room.id::text)
 then raise exception 'Room start receipt missing or mismatched' using errcode='23514'; end if;
 return 'ROOM';
end $$;

-- service用期限確定。期限終了後のHPや既確定の討伐結果は上書きしない。
create function public.finalize_expired_raid_room_v1(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_instance public.raid_bosses%rowtype; v_now timestamptz;
begin
 select b.* into v_instance from public.raid_bosses b join public.raid_rooms r on r.raid_boss_instance_id=b.id
 where r.id=p_room_id for update of b;
 if not found then raise exception 'Room missing' using errcode='P0002'; end if;
 v_now:=clock_timestamp();
 if v_instance.status='ACTIVE' and v_instance.outcome_finalized_at is null and v_instance.expires_at<=v_now then
  update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=v_now
  where id=v_instance.id returning * into v_instance;
 end if;
 return jsonb_build_object('roomId',p_room_id,'state',lower(v_instance.status),'outcome',v_instance.outcome,'remainingBossHp',v_instance.current_hp);
end $$;

create function public.finalize_raid_room_battle_v1(
  p_replay_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_replay public.battle_replay_sessions%rowtype;
  v_instance public.raid_bosses%rowtype;
  v_room public.raid_rooms%rowtype;
  v_now timestamptz;
  v_late boolean;
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
  if public.get_raid_battle_route_v1(p_replay_id)<>'ROOM' then
    raise exception 'Room replay required' using errcode='42501';
  end if;
  if v_replay.finalization_status = 'FINALIZED' then
    return v_replay.finalization_result;
  end if;
  if v_replay.status <> 'PENDING'
     or v_replay.finalization_status <> 'PENDING' then
    raise exception 'Raid replay is not finalizable' using errcode = '23514';
  end if;

  perform public.validate_official_battle_result(p_result);
  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;

  select * into strict v_room from public.raid_rooms where raid_boss_instance_id=v_instance.id;
  -- 開始時刻は255が生成したもの。期限前に正規開始済みの戦闘だけを保存する。
  if v_replay.official_context->>'startedAt' is null
    or (v_replay.official_context->>'startedAt')::timestamptz>=v_instance.expires_at then
    raise exception 'Room battle did not start before expiry' using errcode='23514'; end if;
  v_now:=clock_timestamp();
  v_late:=v_instance.status<>'ACTIVE' or v_instance.outcome_finalized_at is not null
    or v_instance.expires_at<=v_now or v_instance.current_hp<=0;
  v_raw := greatest(coalesce((p_result->>'playerRawDamage')::bigint, 0), 0);
  v_applied := case when v_late then 0 else least(v_raw,greatest(v_instance.current_hp,0)) end;
  v_remaining := greatest(v_instance.current_hp-v_applied,0);
  if not v_late then
    update public.raid_bosses set current_hp=v_remaining,
      status=case when v_remaining=0 then 'CLEARED' else status end,
      outcome=case when v_remaining=0 then 'DEFEAT_SUCCESS' else outcome end,
      outcome_finalized_at=case when v_remaining=0 then v_now else outcome_finalized_at end,
      cleared_at=case when v_remaining=0 then v_now else cleared_at end
    where id=v_instance.id returning * into v_instance;
  elsif v_instance.status='ACTIVE' and v_instance.outcome_finalized_at is null and v_instance.expires_at<=v_now then
    update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=v_now
    where id=v_instance.id returning * into v_instance;
  end if;

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
    'roomId', v_room.id,
    'roomOutcome', v_instance.outcome,
    'lateFinalization', v_late,
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

  -- Room報酬・旧ミッション資格はここで新規付与しない。
  return v_final;
end
$$;

create function public.get_raid_room_battle_result_v1(p_replay_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_replay public.battle_replay_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id and requester_user_id=auth.uid();
 if not found then raise exception 'owned replay missing' using errcode='P0002'; end if;
 if public.get_raid_battle_route_v1(p_replay_id)<>'ROOM' then raise exception 'Room replay required' using errcode='42501'; end if;
 if v_replay.finalization_status='FINALIZED' then return v_replay.finalization_result; end if;
 return null;
end $$;

create or replace function public.on_canonical_daily_activity_finalized() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  v_key:='PVP_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"CHAR_EXP_S","quantity":1}]',now()) on conflict do nothing;
  if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'CHAR_EXP_S',1,'PvPバトル報酬','UNCLAIMED',now()+interval '30 days'); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='PVP' and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'PVP_DAILY_3',new.id,'[{"itemId":"SKILL_MANUAL","quantity":1},{"itemId":"CASH","quantity":40}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'SKILL_MANUAL',1,'PvPデイリー報酬','UNCLAIMED',now()+interval '30 days'),(new.requester_user_id,'CASH',40,'PvPデイリー報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1}]',now()) on conflict do nothing;
  if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'EQUIP_EXP_S',1,'レイドバトル報酬','UNCLAIMED',now()+interval '30 days'); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1},{"itemId":"CASH","quantity":40}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'CHAR_EXP_M',1,'レイドデイリー報酬','UNCLAIMED',now()+interval '30 days'),(new.requester_user_id,'CASH',40,'レイドデイリー報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'EQUIP_LB_PART',1,'レイド参加報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
 end if;
 return new;
end $$;

create or replace function public.on_canonical_guild_official_battle_exp() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.finalization_status='FINALIZED' and old.finalization_status is distinct from 'FINALIZED' then
 if new.battle_mode='PVP' and new.resolution_authority='PVP_SERVER' then perform public.grant_canonical_guild_daily_exp(new.requester_user_id,'PVP_FINALIZED',new.id);
 elsif new.battle_mode='RAID' and new.resolution_authority='RAID_SERVER' and not exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then perform public.grant_canonical_guild_daily_exp(new.requester_user_id,'RAID_FINALIZED',new.id); end if; end if; return new; end $$;

create or replace function public.capture_daily_ranking_participation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_day date;
begin
  if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
  if new.battle_mode='RAID' and exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_type:=case new.battle_mode when 'PVP' then 'PVP' when 'RAID' then 'RAID_PERSONAL' end;
  if v_type is null or new.finalized_at is null then return new; end if;
  v_day:=(new.finalized_at at time zone 'Asia/Tokyo')::date;
  insert into public.ranking_daily_participation(
    ranking_day_key,ranking_type,user_id,finalized_count,first_finalized_at,last_finalized_at
  ) values(v_day,v_type,new.requester_user_id,1,new.finalized_at,new.finalized_at)
  on conflict(ranking_day_key,ranking_type,user_id) do update set
    finalized_count=public.ranking_daily_participation.finalized_count+1,
    first_finalized_at=least(public.ranking_daily_participation.first_finalized_at,excluded.first_finalized_at),
    last_finalized_at=greatest(public.ranking_daily_participation.last_finalized_at,excluded.last_finalized_at);
  return new;
end;
$$;


create or replace function public.finalize_raid_battle(
  p_replay_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;


 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=v_instance.id) then raise exception 'Room battles require the Room finalization entry point' using errcode='55000'; end if;
  -- 229の非Roomランキングlifecycle hookを復元。Room拒否後にのみ実行。
  perform public.advance_ranking_season('RAID',clock_timestamp());
  perform public.validate_official_battle_result(p_result);
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
$$;


revoke all on function public.get_raid_battle_route_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_raid_battle_route_v1(uuid) to service_role;
revoke all on function public.finalize_expired_raid_room_v1(uuid) from public,anon,authenticated;
grant execute on function public.finalize_expired_raid_room_v1(uuid) to service_role;
revoke all on function public.finalize_raid_room_battle_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_raid_room_battle_v1(uuid,jsonb) to service_role;
revoke all on function public.get_raid_room_battle_result_v1(uuid) from public,anon;
grant execute on function public.get_raid_room_battle_result_v1(uuid) to authenticated;





-- SOURCE: 20260908000257_raid_room_recovery_and_expiry.sql

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
-- 毎分Cronは03-expiry-cron.sqlへ分離。既存jobは変更しない。





-- SOURCE: 20260908000258_raid_room_recovery_controls.sql

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




-- SOURCE: 20260908000259_raid_room_rescue.sql
-- 救援依頼・公開先別上限・参加帰属。報酬発行とランキングは変更しない。

create table public.raid_room_rescue_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into public.raid_room_rescue_settings values(true,false);
create table public.raid_room_rescue_requests (
 user_id uuid not null references public.users(id), request_id uuid not null,
 room_id uuid not null references public.raid_rooms(id), response jsonb not null,
 primary key(user_id,request_id)
);
create table public.raid_room_rescue_publications (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.raid_rooms(id),
 requester_user_id uuid not null references public.users(id), request_id uuid not null,
 channel text not null check(channel in ('ACTIVITY','GUILD')),
 guild_id uuid references public.guilds(id), ordinal integer not null check(ordinal between 1 and 3),
 created_at timestamptz not null default clock_timestamp(),
 check((channel='ACTIVITY' and guild_id is null) or (channel='GUILD' and guild_id is not null)),
 unique(room_id,channel,ordinal),unique(requester_user_id,request_id,channel)
);
create table public.raid_room_rescue_members (
 room_id uuid not null, user_id uuid not null, rescue_id uuid not null references public.raid_room_rescue_publications(id),
 joined_at timestamptz not null, primary key(room_id,user_id),
 foreign key(room_id,user_id) references public.raid_room_members(room_id,user_id)
);
alter table public.raid_room_rescue_settings enable row level security;
alter table public.raid_room_rescue_requests enable row level security;
alter table public.raid_room_rescue_publications enable row level security;
alter table public.raid_room_rescue_members enable row level security;
revoke all on public.raid_room_rescue_settings,public.raid_room_rescue_requests,public.raid_room_rescue_publications,public.raid_room_rescue_members from public,anon,authenticated,service_role;
alter table public.social_activity_feed drop constraint social_activity_feed_activity_type_check;
alter table public.social_activity_feed add constraint social_activity_feed_activity_type_check check(activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST'));
alter table public.board_posts add column raid_rescue_id uuid references public.raid_room_rescue_publications(id);

create function public.get_raid_room_rescue_v1(p_rescue_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_publication public.raid_room_rescue_publications%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_publication from public.raid_room_rescue_publications where id=p_rescue_id;
 if not found then raise exception 'rescue unavailable' using errcode='P0002';end if;
 if v_publication.channel='GUILD' and not exists(select 1 from public.guild_members where user_id=auth.uid() and guild_id=v_publication.guild_id) then
 raise exception 'guild membership required' using errcode='42501';end if;
 return jsonb_build_object('rescueId',v_publication.id,'roomId',v_publication.room_id,'channel',v_publication.channel,'guildId',v_publication.guild_id);
end $$;

create function public.get_raid_room_rescue_status_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_activity integer;v_guild integer;v_member public.raid_room_rescue_members%rowtype;v_count bigint:=0;v_damage bigint:=0;
 v_via boolean;v_enabled boolean;v_has_guild boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select count(*) filter(where channel='ACTIVITY'),count(*) filter(where channel='GUILD') into v_activity,v_guild from public.raid_room_rescue_publications where room_id=p_room_id;
 select * into v_member from public.raid_room_rescue_members where room_id=p_room_id and user_id=v_uid;
 v_via:=found;
 if v_via then
  select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
  from public.raid_damage_logs l join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=v_uid
   and b.requester_user_id=v_uid and b.source_reference_id=v_room.raid_boss_instance_id
   and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
   and b.finalization_status='FINALIZED' and b.finalized_at>=v_member.joined_at;
 end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton;
 select exists(select 1 from public.guild_members where user_id=v_uid) into v_has_guild;
 return jsonb_build_object('roomId',p_room_id,'isOwner',v_room.owner_user_id=v_uid,
 'requestEnabled',coalesce(v_enabled,false) and v_room.owner_user_id=v_uid and v_boss.status='ACTIVE' and v_boss.current_hp>0 and v_boss.expires_at>statement_timestamp() and v_boss.outcome_finalized_at is null and (v_activity<3 or (v_has_guild and v_guild<3)),
 'activityCount',v_activity,'guildCount',v_guild,'maxPerChannel',3,
 'viaRescue',v_via,'finalizedBattles',v_count,'contributionDamage',v_damage,
 'rescueGate',public._raid_room_rescue_gate_v1(v_room.difficulty_id,v_via,v_count,v_damage,coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $$;

create function public.request_raid_room_rescue_v1(p_room_id uuid,p_request_id uuid) returns jsonb
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
 select username,avatar_url into v_name,v_avatar from public.users where id=v_uid for update;
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

create function public.join_raid_room_rescue_v1(p_rescue_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_ref jsonb;v_room uuid;v_result jsonb;v_via boolean;v_enabled boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 perform 1 from public.users where id=v_uid for update;
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
revoke all on function public.get_raid_room_rescue_v1(uuid),public.get_raid_room_rescue_status_v1(uuid),public.request_raid_room_rescue_v1(uuid,uuid),public.join_raid_room_rescue_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_rescue_v1(uuid),public.get_raid_room_rescue_status_v1(uuid),public.request_raid_room_rescue_v1(uuid,uuid),public.join_raid_room_rescue_v1(uuid) to authenticated;




-- SOURCE: 20260908000260_raid_room_rescue_rewards.sql
-- 救援成功本人Room1回、Present自動送付30日。数値設定は未投入。

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





-- SOURCE: 20260908000261_raid_ranking_retirement.sql
-- レイドランキング廃止。既存履歴・発行済み報酬・Room貢献は保持。

create or replace function public.get_raid_rankings(p_instance_id uuid,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
 return jsonb_build_object('status','RETIRED','individual','[]'::jsonb,'guild','[]'::jsonb,'selfRank',null,'season_id',null,'starts_at',null,'ends_at',null);
end $$;

create or replace function public.get_raid_season_rankings(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
 return jsonb_build_object('status','RETIRED','individual','[]'::jsonb,'guild','[]'::jsonb,'selfRank',null,'season_id',null,'starts_at',null,'ends_at',null);
end $$;

create or replace function public.get_raid_rankings(p_instance_id uuid) returns jsonb language sql stable security definer set search_path=public as $$ select public.get_raid_rankings(p_instance_id,100,0) $$;

create or replace function public.get_my_raid_contribution_v1(p_instance_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_day text; v_room boolean; v_contribution bigint;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select raid_day_key into v_day from public.raid_bosses where id=p_instance_id;
 if not found then raise exception 'Raid not found' using errcode='P0002'; end if;
 select exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) into v_room;
 select coalesce(sum(log.raw_damage),0) into v_contribution
 from public.raid_damage_logs log join public.raid_bosses boss on boss.id=log.raid_boss_instance_id
 where log.user_id=v_uid and ((v_room and boss.id=p_instance_id) or (not v_room and boss.raid_day_key=v_day));
 return jsonb_build_object('contribution',v_contribution);
end $$;
revoke all on function public.get_my_raid_contribution_v1(uuid) from public,anon;
grant execute on function public.get_my_raid_contribution_v1(uuid) to authenticated,service_role;

create or replace function public.finalize_raid_season_rewards(p_season_id uuid) returns integer language sql security definer set search_path=public as $$ select 0 $$;

create or replace function public.raid_season_reset() returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin role required'; end if;
 return;
end $$;

create or replace function public.advance_ranking_season(
  p_type text,
  p_at timestamptz default clock_timestamp()
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_type text := upper(p_type);
  v_expired public.ranking_seasons%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_current_id uuid;
begin
  if v_type='RAID' then return null; end if;
  if v_type not in ('PVP','RAID') then
    raise exception 'unsupported automatic ranking season type' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ranking-season:'||v_type,0));

  select * into v_expired
  from public.ranking_seasons
  where ranking_type=v_type and status='ACTIVE' and ends_at<=p_at
  order by starts_at
  limit 1 for update;

  if found then
    update public.ranking_seasons set status='FINALIZING',updated_at=clock_timestamp()
    where id=v_expired.id;
    if v_type='PVP' then
      perform public.assert_pvp_boundary_replay_continuity(v_expired.id,p_at);
      perform public.finalize_pvp_season_rewards(v_expired.id);
      perform public.reconcile_pvp_after_season_boundary(v_expired.id,p_at);
    else
      perform public.finalize_raid_season_rewards(v_expired.id);
    end if;
    update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp()
    where id=v_expired.id;
  end if;

  select season.id into v_current_id
  from public.ranking_seasons season
  where season.ranking_type=v_type and season.status='ACTIVE'
    and p_at>=season.starts_at and p_at<season.ends_at
  order by season.starts_at desc limit 1;
  if v_current_id is not null then return v_current_id; end if;

  select bounds.starts_at,bounds.ends_at into v_start,v_end
  from public.ranking_period_bounds(v_type,p_at) bounds;
  insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
  values(v_type,v_start,v_end,'ACTIVE')
  on conflict(ranking_type,starts_at) do update set
    ends_at=excluded.ends_at,status='ACTIVE',updated_at=clock_timestamp()
  returning id into v_current_id;
  return v_current_id;
end;
$$;

create or replace function public.get_active_ranking_seasons()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('season_id',season.id,'ranking_type',season.ranking_type,'starts_at',season.starts_at,'ends_at',season.ends_at,'status',season.status) order by season.ranking_type)
    from public.ranking_seasons season where season.ranking_type<>'RAID' and season.status='ACTIVE' and clock_timestamp()>=season.starts_at and clock_timestamp()<season.ends_at),'[]'::jsonb);
end;
$$;

create or replace function public.grant_canonical_ranking_season_reward(
  p_season_id uuid,
  p_category text,
  p_recipient_user_id uuid,
  p_ranked_entity_id uuid,
  p_rank_position integer
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_entry record;
  v_reward_id text;
  v_item_id text;
  v_quantity integer;
  v_reward_key text;
  v_granted integer := 0;
  v_message text;
  v_present_id uuid;
begin
  if p_category in ('RAID_PERSONAL','RAID_GUILD') then return 0; end if;
  if p_category not in ('PVP','RAID_PERSONAL','RAID_GUILD') then
    raise exception 'unsupported ranking reward category' using errcode='22023';
  end if;
  v_message := case p_category
    when 'PVP' then 'PvPシーズンランキング報酬'
    when 'RAID_PERSONAL' then 'レイド個人ランキング報酬'
    else 'レイドギルドランキング報酬'
  end;

  for v_entry in
    select entry.value,entry.ordinality
    from jsonb_array_elements(public.canonical_ranking_reward_payload()#>array['progression',p_category])
      with ordinality entry(value,ordinality)
    where p_rank_position between (entry.value->>0)::integer and (entry.value->>1)::integer
  loop
    v_reward_id := v_entry.value->>2;
    v_quantity := (v_entry.value->>3)::integer;
    v_reward_key := concat_ws(':',v_entry.value->>0,v_entry.value->>1,v_reward_id,v_entry.ordinality);
    v_item_id := public.resolve_canonical_reward_item(v_reward_id);

    insert into public.ranking_season_reward_grants(
      season_id,ranking_category,recipient_user_id,ranked_entity_id,rank_position,
      reward_key,master_reward_id,resolved_item_id,quantity
    ) values (
      p_season_id,p_category,p_recipient_user_id,p_ranked_entity_id,p_rank_position,
      v_reward_key,v_reward_id,v_item_id,v_quantity
    ) on conflict do nothing;

    if found then
      insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(p_recipient_user_id,v_item_id,v_quantity,v_message,'UNCLAIMED',clock_timestamp()+interval '30 days')
      returning id into v_present_id;
      update public.ranking_season_reward_grants set present_id=v_present_id
      where season_id=p_season_id and ranking_category=p_category
        and recipient_user_id=p_recipient_user_id and reward_key=v_reward_key;

      -- One notification per user and season. Personal and guild Raid rewards
      -- are therefore shown in the same Home dialog. A later genuinely new
      -- grant for the same season reopens an already acknowledged notification.
      insert into public.ranking_reward_notifications(
        recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
      ) values (
        p_recipient_user_id,'SEASON',p_season_id::text,clock_timestamp(),null
      ) on conflict(recipient_user_id,period_kind,period_key) do update set
        awarded_at=excluded.awarded_at,acknowledged_at=null;
      v_granted := v_granted + 1;
    end if;
  end loop;
  return v_granted;
end;
$$;

create or replace function public.grant_canonical_daily_ranking_reward(
  p_ranking_day_key date,
  p_ranking_type text,
  p_recipient_user_id uuid,
  p_ranked_entity_id uuid,
  p_rank_position integer,
  p_score bigint
) returns integer language plpgsql security definer set search_path=public as $$
declare v_award_id uuid; v_reward record; v_granted integer:=0; v_master_count integer;
begin
  if p_ranking_type='RAID_PERSONAL' then return 0; end if;
  if p_ranking_type not in ('POWER','GUILD_POWER','PVP','RAID_PERSONAL')
     or p_rank_position not between 1 and 100 then
    raise exception 'invalid daily ranking award' using errcode='22023';
  end if;
  select count(*) into v_master_count
  from public.canonical_daily_ranking_reward_master master
  where master.version='2026-09-03' and master.is_production_enabled
    and master.ranking_type=p_ranking_type
    and p_rank_position between master.rank_min and master.rank_max;
  if v_master_count<>2 then
    raise exception 'daily ranking reward master must resolve exactly two items' using errcode='23514';
  end if;

  insert into public.ranking_daily_reward_awards(
    ranking_day_key,ranking_type,recipient_user_id,ranked_entity_id,rank_position,score
  ) values(p_ranking_day_key,p_ranking_type,p_recipient_user_id,p_ranked_entity_id,p_rank_position,p_score)
  on conflict(ranking_day_key,ranking_type,recipient_user_id) do nothing
  returning id into v_award_id;
  if v_award_id is null then return 0; end if;

  for v_reward in
    select master.item_id,master.quantity
    from public.canonical_daily_ranking_reward_master master
    where master.version='2026-09-03' and master.is_production_enabled
      and master.ranking_type=p_ranking_type
      and p_rank_position between master.rank_min and master.rank_max
    order by master.item_id
  loop
    insert into public.ranking_daily_reward_item_grants(award_id,item_id,quantity)
    values(v_award_id,v_reward.item_id,v_reward.quantity);
    insert into public.user_items(user_id,item_id,quantity)
    values(p_recipient_user_id,v_reward.item_id,v_reward.quantity)
    on conflict(user_id,item_id) do update set
      quantity=public.user_items.quantity+excluded.quantity,updated_at=clock_timestamp();
    v_granted:=v_granted+1;
  end loop;

  insert into public.ranking_reward_notifications(
    recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
  ) values(p_recipient_user_id,'DAILY',p_ranking_day_key::text,clock_timestamp(),null)
  on conflict(recipient_user_id,period_kind,period_key) do update set
    awarded_at=excluded.awarded_at,acknowledged_at=null;
  return v_granted;
end;
$$;

create or replace function public.finalize_daily_ranking_rewards(p_ranking_day_key date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_day date:=coalesce(p_ranking_day_key,(clock_timestamp() at time zone 'Asia/Tokyo')::date-1);
  v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_start timestamptz; v_end timestamptz; v_row record;
  v_power integer:=0; v_guild integer:=0; v_pvp integer:=0; v_raid integer:=0;
begin
  if v_day>=v_today then raise exception 'daily ranking day is not closed' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('DAILY_RANKING:'||v_day::text,0));
  if exists(select 1 from public.ranking_daily_finalization_audits audit where audit.ranking_day_key=v_day) then
    return (select jsonb_build_object('ranking_day_key',audit.ranking_day_key,'status','ALREADY_FINALIZED',
      'POWER',audit.power_recipients,'GUILD_POWER',audit.guild_recipients,
      'PVP',audit.pvp_recipients,'RAID_PERSONAL',audit.raid_recipients)
      from public.ranking_daily_finalization_audits audit where audit.ranking_day_key=v_day);
  end if;
  v_start:=v_day::timestamp at time zone 'Asia/Tokyo';
  v_end:=(v_day+1)::timestamp at time zone 'Asia/Tokyo';

  insert into public.ranking_daily_entity_snapshots(ranking_day_key,ranking_type,ranked_entity_id,score,rank_position)
  select v_day,'POWER',ranked.user_id,ranked.score,ranked.rank_position
  from (
    select activity.user_id,activity.total_power score,
      row_number() over(order by activity.total_power desc,activity.user_id)::integer rank_position
    from public.ranking_daily_activity_snapshots activity
    where activity.ranking_day_key=v_day
  ) ranked where ranked.rank_position<=100;
  insert into public.ranking_daily_recipient_snapshots
  select snapshot.ranking_day_key,snapshot.ranking_type,snapshot.ranked_entity_id,
    snapshot.ranked_entity_id,snapshot.rank_position,snapshot.score
  from public.ranking_daily_entity_snapshots snapshot
  where snapshot.ranking_day_key=v_day and snapshot.ranking_type='POWER';

  with active_members as (
    select activity.guild_id,activity.user_id,activity.total_power member_power
    from public.ranking_daily_activity_snapshots activity
    where activity.ranking_day_key=v_day and activity.guild_id is not null
  ), ranked as (
    select member.guild_id,sum(member.member_power)::bigint score,
      row_number() over(order by sum(member.member_power) desc,member.guild_id)::integer rank_position
    from active_members member group by member.guild_id
  )
  insert into public.ranking_daily_entity_snapshots(ranking_day_key,ranking_type,ranked_entity_id,score,rank_position)
  select v_day,'GUILD_POWER',ranked.guild_id,ranked.score,ranked.rank_position
  from ranked where ranked.rank_position<=100;
  insert into public.ranking_daily_recipient_snapshots
  select snapshot.ranking_day_key,snapshot.ranking_type,snapshot.ranked_entity_id,
    member.user_id,snapshot.rank_position,snapshot.score
  from public.ranking_daily_entity_snapshots snapshot
  join public.ranking_daily_activity_snapshots member
    on member.ranking_day_key=snapshot.ranking_day_key
   and member.guild_id=snapshot.ranked_entity_id
  where snapshot.ranking_day_key=v_day and snapshot.ranking_type='GUILD_POWER'
    and member.guild_id is not null;

  insert into public.ranking_daily_entity_snapshots(ranking_day_key,ranking_type,ranked_entity_id,score,rank_position)
  select v_day,'PVP',ranked.user_id,ranked.score,ranked.rank_position
  from (
    select participation.user_id,coalesce(wins.wins,0)::bigint score,
      row_number() over(order by coalesce(wins.wins,0) desc,participation.first_finalized_at,participation.user_id)::integer rank_position
    from public.ranking_daily_participation participation
    left join public.pvp_daily_wins wins on wins.activity_date=v_day and wins.user_id=participation.user_id
    where participation.ranking_day_key=v_day and participation.ranking_type='PVP'
      and participation.finalized_count>=1
  ) ranked where ranked.rank_position<=100;
  insert into public.ranking_daily_recipient_snapshots
  select snapshot.ranking_day_key,snapshot.ranking_type,snapshot.ranked_entity_id,
    snapshot.ranked_entity_id,snapshot.rank_position,snapshot.score
  from public.ranking_daily_entity_snapshots snapshot
  where snapshot.ranking_day_key=v_day and snapshot.ranking_type='PVP';

  -- レイド順位snapshotと新規受取者は生成しない。
  for v_row in
    select * from public.ranking_daily_recipient_snapshots recipient
    where recipient.ranking_day_key=v_day and recipient.ranking_type<>'RAID_PERSONAL'
    order by recipient.ranking_type,recipient.rank_position,recipient.recipient_user_id
  loop
    perform public.grant_canonical_daily_ranking_reward(v_day,v_row.ranking_type,
      v_row.recipient_user_id,v_row.ranked_entity_id,v_row.rank_position,v_row.score);
  end loop;
  select count(*) filter(where ranking_type='POWER'),count(*) filter(where ranking_type='GUILD_POWER'),
    count(*) filter(where ranking_type='PVP'),count(*) filter(where ranking_type='RAID_PERSONAL')
  into v_power,v_guild,v_pvp,v_raid
  from public.ranking_daily_reward_awards where ranking_day_key=v_day;
  insert into public.ranking_daily_finalization_audits(
    ranking_day_key,power_recipients,guild_recipients,pvp_recipients,raid_recipients
  ) values(v_day,v_power,v_guild,v_pvp,v_raid);
  return jsonb_build_object('ranking_day_key',v_day,'status','FINALIZED','POWER',v_power,
    'GUILD_POWER',v_guild,'PVP',v_pvp,'RAID_PERSONAL',v_raid);
end;
$$;

create or replace function public.capture_daily_ranking_participation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_day date;
begin
  if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
  if new.battle_mode='RAID' then return new; end if;
  v_type:=case new.battle_mode when 'PVP' then 'PVP' when 'RAID' then 'RAID_PERSONAL' end;
  if v_type is null or new.finalized_at is null then return new; end if;
  v_day:=(new.finalized_at at time zone 'Asia/Tokyo')::date;
  insert into public.ranking_daily_participation(
    ranking_day_key,ranking_type,user_id,finalized_count,first_finalized_at,last_finalized_at
  ) values(v_day,v_type,new.requester_user_id,1,new.finalized_at,new.finalized_at)
  on conflict(ranking_day_key,ranking_type,user_id) do update set
    finalized_count=public.ranking_daily_participation.finalized_count+1,
    first_finalized_at=least(public.ranking_daily_participation.first_finalized_at,excluded.first_finalized_at),
    last_finalized_at=greatest(public.ranking_daily_participation.last_finalized_at,excluded.last_finalized_at);
  return new;
end;
$$;

create or replace function public.grant_canonical_raid_reward(p_instance uuid,p_user uuid,p_type text,p_key text) returns integer language plpgsql security definer set search_path=public as $$
declare row record; granted integer:=0;
begin
 if p_type in ('PERSONAL_RANK','GUILD_RANK') then return 0; end if;
 perform 1 from public.raid_bosses where id=p_instance for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance) then return 0; end if;
 for row in select * from public.canonical_raid_reward_master where version='2026-08-22' and reward_type=p_type and reward_key=p_key loop
 insert into public.raid_production_reward_grants values(p_instance,p_user,p_type,p_key,row.item_id,row.quantity,now()) on conflict do nothing;
 if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user,row.item_id,row.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days'); granted:=granted+1; end if;
 end loop; return granted; end $$;

create or replace function public.grant_raid_reward(
  p_instance_id uuid, p_user_id uuid, p_reward_id integer, p_reason text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_reward record;
begin
  if p_reason in ('RANK_PERSONAL','RANK_GUILD','PERSONAL_RANK','GUILD_RANK') or exists(select 1 from public.raid_rewards_master where id=p_reward_id and reward_type in ('RANK_PERSONAL','RANK_GUILD','PERSONAL_RANK','GUILD_RANK')) then return false; end if;
  perform 1 from public.raid_bosses where id=p_instance_id for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return false; end if;
  insert into public.raid_reward_grants(raid_boss_instance_id,user_id,reward_id,reward_reason)
  values(p_instance_id,p_user_id,p_reward_id,p_reason) on conflict do nothing;
  if not found then return false; end if;
  select coalesce(reward_item_id,item_id) item_id, greatest(coalesce(reward_quantity,quantity,1),1) quantity
  into v_reward from public.raid_rewards_master where id=p_reward_id;
  insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
  values(p_user_id,v_reward.item_id,v_reward.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days');
  return true;
end; $$;

create or replace function public.converge_ranking_lifecycle_safety(
  p_at timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_orphan record;
  v_active public.ranking_seasons%rowtype;
  v_previous public.ranking_seasons%rowtype;
  v_orphans integer := 0;
  v_cutovers integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('ranking-lifecycle-safety-convergence',0));

  -- A non-Preview clean chain may have run 00227 and then the schema-only path
  -- of 00228. Reconcile only the immediately superseded row left by that pair.
  for v_orphan in
    select distinct on (closed.ranking_type) closed.*
    from public.ranking_seasons closed
    join public.ranking_seasons active
      on active.ranking_type=closed.ranking_type and active.status='ACTIVE'
     and active.starts_at<closed.ends_at+interval '1 second'
     and active.ends_at>closed.ends_at
     and abs(extract(epoch from (active.created_at-closed.updated_at)))<300
    where closed.ranking_type='PVP' and closed.status='CLOSED'
      and closed.ends_at<=p_at
      and not exists(select 1 from public.ranking_season_transition_audits audit where audit.season_id=closed.id)
      and not exists(select 1 from public.ranking_pvp_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_raid_personal_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_raid_guild_season_snapshots snapshot where snapshot.season_id=closed.id)
      and not exists(select 1 from public.ranking_season_reward_grants grant_row where grant_row.season_id=closed.id)
    order by closed.ranking_type,closed.ends_at desc
  loop
    perform public.assert_pvp_boundary_replay_continuity(v_orphan.id,p_at);
    perform public.finalize_pvp_season_rewards(v_orphan.id);
    perform public.reconcile_pvp_after_season_boundary(v_orphan.id,p_at);
    v_orphans:=v_orphans+1;
  end loop;

  -- 廃止済みRaid Season境界は変更しない。
  return jsonb_build_object('orphanSeasons',v_orphans,'raidCutovers',v_cutovers);
end;
$$;



-- SOURCE: 20260908000262_raid_room_clear_rewards.sql
-- 討伐本人Room1回。Present自動送付30日は救援共通の実装前提。数値設定は未投入。

create table public.raid_room_clear_reward_rules (
 difficulty text primary key references public.raid_room_difficulty_rules(difficulty),
 enabled boolean not null default false,
 minimum_contribution_damage bigint check(minimum_contribution_damage>=0),
 rule_version bigint not null default 1 check(rule_version>0)
);
insert into public.raid_room_clear_reward_rules(difficulty)
 select difficulty from public.raid_room_difficulty_rules;
create table public.raid_room_clear_reward_items (
 difficulty text not null references public.raid_room_clear_reward_rules(difficulty),
 item_id text not null check(length(btrim(item_id))>0),
 quantity integer not null check(quantity>0), primary key(difficulty,item_id)
);
create table public.raid_room_clear_rewards (
 room_id uuid not null, user_id uuid not null, primary key(room_id,user_id),
 foreign key(room_id,user_id) references public.raid_room_members(room_id,user_id),
 rule_version bigint not null,
 finalized_battles bigint not null, contribution_damage bigint not null,
 clear_gate jsonb not null,
 issued_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at=issued_at+interval '30 days')
);
create table public.raid_room_clear_reward_grants (
 room_id uuid not null,user_id uuid not null,item_id text not null,quantity integer not null check(quantity>0),
 present_id uuid not null unique references public.presents(id),
 primary key(room_id,user_id,item_id),
 foreign key(room_id,user_id) references public.raid_room_clear_rewards(room_id,user_id)
);
alter table public.raid_room_clear_reward_rules enable row level security;
alter table public.raid_room_clear_reward_items enable row level security;
alter table public.raid_room_clear_rewards enable row level security;
alter table public.raid_room_clear_reward_grants enable row level security;
revoke all on public.raid_room_clear_reward_rules,public.raid_room_clear_reward_items,
 public.raid_room_clear_rewards,public.raid_room_clear_reward_grants from public,anon,authenticated,service_role;

-- 信頼済みRoom確定のlateFinalization=falseだけを集計。撃破打はfalseのため含む。
create function public._raid_room_clear_reward_progress_v1(p_room_id uuid,p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_count bigint:=0;v_damage bigint:=0;v_status text;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id;
 select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
 from public.raid_damage_logs l
 join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id and s.room_id=p_room_id
 join public.raid_room_members m on m.room_id=p_room_id and m.user_id=p_user_id
 where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
  and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
  and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
  and b.official_context->>'roomId'=p_room_id::text
  and b.finalization_status='FINALIZED'
  and b.finalization_result->'lateFinalization'='false'::jsonb;
 if v_rule.minimum_contribution_damage is null then v_status:='unknown';
 elsif v_count>0 and v_damage>v_rule.minimum_contribution_damage and v_boss.outcome='DEFEAT_SUCCESS' then v_status:='succeeded';
 else v_status:='not_succeeded';end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'clearGate',jsonb_build_object('status',v_status,'ruleVersion',coalesce(v_rule.rule_version,1),
   'contributionDamage',v_damage,'minimumContributionDamage',v_rule.minimum_contribution_damage,
   'cleared',coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $$;

create function public._issue_raid_room_clear_rewards_v1(p_room_id uuid) returns integer
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled or v_rule.minimum_contribution_damage is null then return 0;end if;
 perform 1 from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
  from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'clearGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_clear_rewards(room_id,user_id,rule_version,
   finalized_battles,contribution_damage,clear_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,v_rule.rule_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'clearGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド討伐報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_CLEAR',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'ruleVersion',(v_progress->'clearGate'->>'ruleVersion')::bigint))
   returning id into v_present;
   insert into public.raid_room_clear_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

-- logsとReplay確定後に実行。CLEAR時はそれまでに条件達成した全参加者を再評価する。
-- 付与失敗は戦闘確定全体と同一transactionでROLLBACK。例外を握りつぶさない。
create function public.on_raid_room_clear_reward_finalized_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_room uuid;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED'
  or new.battle_mode<>'RAID' or new.resolution_authority<>'RAID_SERVER' then return new;end if;
 select id into v_room from public.raid_rooms where raid_boss_instance_id=new.source_reference_id;
 if found then perform public._issue_raid_room_clear_rewards_v1(v_room);end if;
 return new;
end $$;
create trigger raid_room_clear_reward_finalized_v1
 after update of finalization_status on public.battle_replay_sessions
 for each row execute function public.on_raid_room_clear_reward_finalized_v1();

create function public.get_raid_room_clear_reward_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_saved public.raid_room_clear_rewards%rowtype;
 v_progress jsonb;v_items jsonb:='[]';v_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_saved from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_uid;
 if found then
  v_status:='issued';v_progress:=jsonb_build_object('clearGate',v_saved.clear_gate);
  select coalesce(jsonb_agg(jsonb_build_object('itemId',g.item_id,'quantity',g.quantity,
   'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at) order by g.item_id),'[]') into v_items
  from public.raid_room_clear_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id
  where g.room_id=p_room_id and g.user_id=v_uid;
 else
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_uid);
  if v_progress->'clearGate'->>'status'='unknown' or not exists(
   select 1 from public.raid_room_clear_reward_rules r where r.difficulty=v_room.difficulty_id and r.enabled
    and exists(select 1 from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty)) then v_status:='unconfigured';
  elsif v_progress->'clearGate'->>'status'='succeeded' then v_status:='pending';
  else v_status:='not_eligible';end if;
 end if;
 return jsonb_build_object('roomId',p_room_id,'status',v_status,'clearGate',v_progress->'clearGate',
  'issuedAt',v_saved.issued_at,'expiresAt',v_saved.expires_at,'items',v_items);
end $$;
revoke all on function public._raid_room_clear_reward_progress_v1(uuid,uuid),
 public._issue_raid_room_clear_rewards_v1(uuid),public.on_raid_room_clear_reward_finalized_v1(),
 public.get_raid_room_clear_reward_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_clear_reward_v1(uuid) to authenticated;



-- SOURCE: 20260908000263_raid_legacy_cutover.sql

-- 第18工程: Room移行時の旧生成/旧新規開始停止。既存維持がdefault。
-- SQL254の4本体に入口guardのみ追加。既存確定/報酬/Replayは変更しない。
create table public.raid_legacy_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true
);
insert into public.raid_legacy_settings(singleton,enabled) values(true,true);
alter table public.raid_legacy_settings enable row level security;
revoke all on table public.raid_legacy_settings from public,anon,authenticated,service_role;
comment on table public.raid_legacy_settings is '旧Raid生成/新規開始。停止変更はDB管理者がこの設定だけを単独transactionで更新。業務rowを先にlockしない。既存確定/Presentを停止しない。';

create or replace function public.start_raid_battle(p_instance_id uuid,p_character_ids text[],p_tactic text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_legacy_enabled boolean; v_uid uuid:=auth.uid(); v_user public.users%rowtype; v_instance record; v_cost integer; v_cost_type text; v_guild uuid; v_players jsonb; v_enemy jsonb:='[]'; v_member text; v_entry record; v_skill_refs jsonb; v_skills jsonb; v_replay uuid; v_seed bigint; v_slot integer:=0;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then raise exception 'legacy Raid entry disabled' using errcode='55000'; end if;

 if p_tactic not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS') then raise exception 'invalid tactic' using errcode='22023'; end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid); select * into v_user from public.users where id=v_uid for update;
 if v_user.level<5 then raise exception 'player level 5 is required' using errcode='23514'; end if;
 select boss.*,variant.raid_name,variant.atk,variant.def,variant.spd,variant.member_character_ids into v_instance from public.raid_bosses boss join public.canonical_raid_variants variant on variant.raid_variant_id=boss.raid_variant_id where boss.id=p_instance_id and boss.status='ACTIVE' and boss.expires_at>now() for update of boss;
 if not found then raise exception 'Raid instance is not active' using errcode='P0002'; end if;

 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then raise exception 'Room battles require the Room entry point' using errcode='55000'; end if;
 if not v_user.raid_free_entry_consumed then v_cost:=0;v_cost_type:='FREE_FIRST';update public.users set raid_free_entry_consumed=true where id=v_uid;
 elsif v_user.raid_points>=1 then v_cost:=1;v_cost_type:='RAID_POINT';update public.users set raid_points=raid_points-1,raid_points_last_recovered_at=case when raid_points=5 then now() else raid_points_last_recovered_at end where id=v_uid;v_user.raid_points:=v_user.raid_points-1;
 else raise exception 'insufficient Raid points' using errcode='23514'; end if;
 select guild_id into v_guild from public.guild_members where user_id=v_uid; v_players:=public.build_server_battle_snapshot(v_uid,p_character_ids,'PLAYER');
 for v_member in select value from jsonb_array_elements_text(v_instance.member_character_ids) loop
  v_slot:=v_slot+1; select * into v_entry from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by(local_affinity)desc,weight desc limit 1;
  v_skill_refs:=coalesce(v_entry.skill_loadout,(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name,'activationType',s.activation_type,'cooldown',s.cooldown,'availableFromRound',s.available_from_round,'target',s.target,'effects',s.effects,'exclusiveCharacterId',s.exclusive_character_id) order by x.ordinality),'[]') into v_skills from jsonb_array_elements_text(v_skill_refs) with ordinality x(skill_id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.skill_id;
  v_enemy:=v_enemy||jsonb_build_array(jsonb_build_object('id','raid_'||v_instance.id||'_'||v_slot,'characterId',v_member,'name',coalesce((select display_name from public.canonical_character_master where version='2026-08-21' and character_id=v_member),v_member),'team','ENEMY','alignment',coalesce((select attribute from public.canonical_character_master where version='2026-08-21' and character_id=v_member),'NEUTRAL'),'level',30,'stats',jsonb_build_object('hp',ceil(v_instance.max_hp::numeric/5),'atk',v_instance.atk,'def',v_instance.def,'spd',v_instance.spd,'luk',0),'equippedSkillRefs',v_skill_refs,'skills',v_skills,'equipment','[]'::jsonb));
 end loop;
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority,finalization_status,official_context) values(v_uid,'RAID',p_instance_id,p_tactic,v_seed,v_players,v_enemy,'RAID_SERVER','PENDING',jsonb_build_object('guildIdSnapshot',v_guild,'costType',v_cost_type,'cost',v_cost,'remainingRaidPoints',v_user.raid_points,'bossHpAtStart',v_instance.current_hp,'bossMaxHp',v_instance.max_hp,'baseId',v_instance.base_id,'raidDayKey',v_instance.raid_day_key,'raidVariantId',v_instance.raid_variant_id)) returning id into v_replay;
 return jsonb_build_object('replay_session_id',v_replay,'player_snapshot',v_players,'enemy_snapshot',v_enemy,'cost_type',v_cost_type,'cost',v_cost,'remaining_raid_points',v_user.raid_points,'guild_id_snapshot',v_guild);
end $$;

create or replace function public.respawn_cleared_raid_slot(p_cleared_instance_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_legacy_enabled boolean; v_old public.raid_bosses%rowtype; v_new uuid;
begin
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return null; end if;

 perform pg_advisory_xact_lock(hashtextextended(p_cleared_instance_id::text||':respawn',0));
 select * into v_old from public.raid_bosses where id=p_cleared_instance_id and status='CLEARED' and respawn_after<=now() for update;
 if not found then return null; end if;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_cleared_instance_id) then return null; end if;

 if exists(select 1 from public.raid_bosses where raid_day_key=v_old.raid_day_key and base_id=v_old.base_id and status='ACTIVE' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id)) then return null; end if;
 insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_old.boss_id,v_old.boss_master_id,v_old.max_hp,v_old.max_hp,v_old.base_id,'ACTIVE',now(),v_old.expires_at,gen_random_uuid(),v_old.rotation_date,v_old.raid_variant_id,v_old.raid_day_key) returning id into v_new;
 return v_new;
end $$;

create or replace function public.rotate_daily_raids() returns void language plpgsql security definer set search_path=public as $$
declare v_legacy_enabled boolean; v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_pair text[]; v_area text; v_variant public.canonical_raid_variants%rowtype; v_start timestamptz; v_end timestamptz; v_cleared record;
begin
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return; end if;

 perform pg_advisory_xact_lock(hashtextextended('CANONICAL_RAID_ROTATION:'||v_today::text,0));
 for v_cleared in select id from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and status='ACTIVE' and (current_hp=0 or expires_at<=now()) for update loop perform public.finalize_expired_raid_instance(v_cleared.id); end loop;
 for v_cleared in select id from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and status='CLEARED' and raid_day_key=v_today::text and respawn_after<=now() for update loop perform public.respawn_cleared_raid_slot(v_cleared.id); end loop;
 v_pair:=public.canonical_raid_rotation_pair(v_today); v_start:=(v_today::timestamp at time zone 'Asia/Tokyo'); v_end:=v_start+interval '24 hours';
 foreach v_area in array v_pair loop
  if not exists(select 1 from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and raid_day_key=v_today::text and base_id=v_area and status='ACTIVE') and not exists(select 1 from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and raid_day_key=v_today::text and base_id=v_area and status='CLEARED' and respawn_after>now()) then
   select * into v_variant from public.canonical_raid_variants where area_id=upper(v_area) and is_production_enabled order by raid_variant_id limit 1;
   insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key) values(v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,v_area,'ACTIVE',greatest(now(),v_start),v_end,gen_random_uuid(),v_today,v_variant.raid_variant_id,v_today::text);
  end if;
 end loop;
end $$;

create or replace function public.get_active_raids() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_legacy_enabled boolean;
begin if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return '[]'::jsonb; end if;
 perform public.rotate_daily_raids();
 return coalesce((select jsonb_agg(jsonb_build_object('id',boss.id,'bossMasterId',master.boss_id,'bossName',master.display_name,'profileType',master.profile_type,'attribute',master.attribute,'level',master.reference_level,'currentHp',boss.current_hp,'maxHp',boss.max_hp,'baseId',boss.base_id,'spawnedAt',boss.spawned_at,'expiresAt',boss.expires_at,'status',boss.status,'skillLoadout',master.skill_loadout) order by boss.base_id) from public.raid_bosses boss join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id) and boss.status='ACTIVE' and boss.expires_at>clock_timestamp()),'[]'::jsonb);
end $$;

-- 公開範囲は254を維持。サービス役にも設定tableの直接権限は与えない。
revoke all on function public.start_raid_battle(uuid,text[],text),public.get_active_raids() from public,anon;
grant execute on function public.start_raid_battle(uuid,text[],text),public.get_active_raids() to authenticated;
revoke all on function public.rotate_daily_raids(),public.respawn_cleared_raid_slot(uuid) from public,anon,authenticated;
grant execute on function public.rotate_daily_raids(),public.respawn_cleared_raid_slot(uuid) to service_role;
