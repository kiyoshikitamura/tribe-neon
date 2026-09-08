-- 実行していないレビュー用。接続先を管理APIとDB hostで照合してから使用する。
-- GUCは誤操作防止だけで接続先検証の代わりではない。既定ではROLLBACK。
-- MCP単一SQLリクエスト: 例外時はtransaction中断、ROLLBACKは末尾を保持
begin;
set local statement_timeout='60s';
set local lock_timeout='2s';
set local search_path=public,pg_catalog;
-- BEGIN INCLUDE 00-baseline-guard.sql
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f')::text) is distinct from 'c0dd840db9d54c8b4f641accec3168a2' then
  raise exception '工程2 baseline drift: public function body/signature/owner/ACL。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(t order by version) from (select version,name from supabase_migrations.schema_migrations)t)::text) is distinct from '304f86a3786d03a956107a98febaf20d' then
  raise exception '工程2 baseline drift: migration history。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(t order by jobid) from (select jobid,jobname,schedule,command,active,database,username from cron.job)t)::text) is distinct from '23ecae21c408e484c8abcb81229d7fa4' then
  raise exception '工程2 baseline drift: Cron jobs。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped)::text) is distinct from 'ff302978bb0cb375dc5afb503eae9798' then
  raise exception '工程2 baseline drift: columns。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text,c.conname) from pg_constraint c where c.connamespace='public'::regnamespace)::text) is distinct from '3f422037e810338f7cf9adbc47ffe578' then
  raise exception '工程2 baseline drift: constraints。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace,'auth'::regnamespace)))::text) is distinct from '1e9d5e31d31948d24cc75f7052abc452' then
  raise exception '工程2 baseline drift: triggers。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_object_agg(relname,jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl)) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m'))::text) is distinct from '7b0c3845ba3966b5261a479a6a4bb95e' then
  raise exception '工程2 baseline drift: table RLS and grants。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_object_agg(indexname,to_jsonb(t)) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public')t)::text) is distinct from '0a6ab21d8af915f1c0d39041d57d05f5' then
  raise exception '工程2 baseline drift: indexes。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(t)) from (select * from pg_policies where schemaname='public')t)::text) is distinct from 'de49453e0afda5128cb753ba7cc875c5' then
  raise exception '工程2 baseline drift: policies。再取得・再照合が必要';
 end if;
end $guard$;

-- END INCLUDE 00-baseline-guard.sql
-- BEGIN INCLUDE 01-snapshot-dependency.sql
-- 00232全再適用は禁止。現PreviewのSPD/LUK補正を残し表示metadataだけ追加。
CREATE OR REPLACE FUNCTION public.build_server_battle_snapshot(p_user_id uuid, p_character_ids text[], p_team text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_base jsonb; v_result jsonb;
begin
  v_base := public.build_server_battle_snapshot_00168(p_user_id,p_character_ids,p_team);
  select jsonb_agg(
    jsonb_set(
      jsonb_set(unit.value || (projection.value-'_equipmentUtilityCorrection'),'{stats,spd}',
        to_jsonb((unit.value#>>'{stats,spd}')::integer+coalesce((projection.value#>>'{_equipmentUtilityCorrection,spd}')::integer,0))),
      '{stats,luk}',to_jsonb((unit.value#>>'{stats,luk}')::integer+coalesce((projection.value#>>'{_equipmentUtilityCorrection,luk}')::integer,0))
    ) || jsonb_build_object('characterId',owned.character_id,'level',owned.level,
      'awakeningLevel',owned.awakening_level,'rarity',master.rarity) order by unit.ordinality)
  into v_result
  from jsonb_array_elements(v_base) with ordinality unit(value,ordinality)
  join public.user_characters owned on owned.user_id=p_user_id
    and owned.id=regexp_replace(unit.value->>'id','^[^_]+_','')::uuid
  join public.canonical_character_master master on master.version='2026-08-21'
    and master.character_id=owned.character_id
  cross join lateral (select public.canonical_equipment_runtime_projection(
    p_user_id,regexp_replace(unit.value->>'id','^[^_]+_','')::uuid
  ) value) projection;
  if coalesce(jsonb_array_length(v_result),0)<>coalesce(jsonb_array_length(v_base),0) then
    raise exception 'battle snapshot presentation metadata is incomplete' using errcode='23503';
  end if;
  return coalesce(v_result,'[]'::jsonb);
end $function$
;
-- CREATE OR REPLACEで既存owner/ACLを保持。GRANT/REVOKE追加なし。

-- END INCLUDE 01-snapshot-dependency.sql
-- BEGIN INCLUDE 02-raid-delta.sql
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

-- END INCLUDE 02-raid-delta.sql
-- BEGIN INCLUDE 04-postflight.sql
-- 同一transaction内の保存前チェック。業務RPCは呼び出さない。
do $verify$
declare r record;
begin
 for r in select * from (values ('accept_friend_request','p_request_id uuid','0dbb460d66ec4aafa006c203bf538e4a'),
('accept_friend_request','p_user_id uuid, p_friend_id uuid','2cadfef91678559a15258439cc6f2a99'),
('accept_friend_request_core_20260823','p_request_id uuid','0abcb9c9125d1abe89a4869111032cfe'),
('acknowledge_kpi_first_mypage_access_v1','p_context_id uuid, p_idempotency_key text','9e929d99d351a4f0581102433332dbd8'),
('acknowledge_ranking_reward_notifications','p_notification_ids uuid[]','3c260aab8e1c652ab43031cd07f887a0'),
('activate_gvg_match_session','p_match_session_id uuid','4714f2e43f3df693652eaf9b0a916d87'),
('activate_preopen_guild_power_season','','84b4de6e3b3f88fe7e95d32b34f67021'),
('add_test_cash','p_user_id uuid, p_amount integer','47dc27bd8676320ea58b5d972ba1f07b'),
('add_test_diamonds','p_user_id uuid','1dd06ed734bb7731052ff1bd67f02e6f'),
('add_test_diamonds','p_user_id uuid, p_amount integer','539450c847ea456256031669ddbe384b'),
('add_user_vitality','p_user_id uuid, p_amount integer','440861973abdf4c7df27e27b648f44dd'),
('add_user_xp','p_user_id uuid, p_xp_amount integer','eaf4f0ffc2cb0646ddf44be858505049'),
('admin_add_guild_funds','p_guild_id uuid, p_amount numeric','b795cb181ff98c3b629f54c70b8d6501'),
('admin_reset_daily_missions','p_user_id uuid, p_mission_ids text[]','637a5e1636e158fc8014ae3935fd8119'),
('admin_respawn_raid_boss','p_boss_id text, p_max_hp integer, p_base_id text','3a22d60e7a35ab3ef1b8703ded57d697'),
('admin_update_guild','p_guild_id uuid, p_funds numeric, p_level integer, p_xp integer','f67170215e4f4f36780efa8a22abc891'),
('admin_update_guild_finals','p_guild_id uuid, p_funds_add numeric, p_decorations jsonb','ba7ea18e15849844953e19a51e79b3f7'),
('advance_all_ranking_seasons','p_at timestamp with time zone','1a08be5a596a6a2495201147ed9781f3'),
('advance_current_tutorial_after_growth','','3f9be4c05391c57da9ae57d27930363f'),
('advance_tutorial_progress','p_expected_step text, p_next_step text','a979c5504fda4c61d810661d953504d0'),
('apply_canonical_guild_exp','p_guild_id uuid, p_exp integer','6a06e3c9d5ccf15a884ca5d1ac943b18'),
('apply_character_awakening_equivalent','p_user_id uuid, p_character_id uuid, p_equivalents integer','3812063e5df0e11f2ad64a880c4ecdc6'),
('apply_current_player_invitation','p_gift_code text','c6c24450ba3869dbaf849f71471c1804'),
('apply_recommended_main_loadout','','88ee52e7c64d5d5289005a3527199bd0'),
('apply_tutorial_enemy_snapshot','p_user_id uuid, p_player_snapshot jsonb, p_enemy_snapshot jsonb','cabd2edd5ddd015795f51678d5f428b1'),
('apply_tutorial_player_snapshot','p_user_id uuid, p_snapshot jsonb','50e0e9cf0db33e69faa7893ba3accce0'),
('apply_user_xp','p_user_id uuid, p_xp_amount integer','30681161f3dde0a78577b970ca1700a2'),
('assert_feature_mutation_allowed','p_feature_key text','78998ebe2bdcd3cb6905b18382528b1c'),
('assert_pvp_boundary_replay_continuity','p_season_id uuid, p_transition_at timestamp with time zone','541e30490836cd0d8da4b00e1eae6e5e'),
('audit_feature_operating_state_change','','41c69f8850753b38d32dce4be6b15656'),
('awaken_character','p_character_id uuid','4b518634fe2e6bdd68206c0822d49714'),
('begin_gvg_attack','p_match_session_id uuid','a1a7d29a6f3c977b950a4ceeec746d83'),
('begin_gvg_attack_core_20260817','p_match_session_id uuid','59747780175ee3b3a3138663941b06df'),
('begin_kpi_acquisition_journey_v1','p_token text, p_source text','22b2d9790128c32b6bf2685708850beb'),
('bind_kpi_acquisition_subject_v1','p_token text, p_source text','037c7b605c337261049a222b6b7a42e4'),
('build_server_battle_snapshot_00168','p_user_id uuid, p_character_ids text[], p_team text','640982c95a025de067aabd474bd3fbd3'),
('buy_avatar_part','p_user_id uuid, p_part_id text, p_currency_type text, p_price integer','a2745c2ac4053f47f6df7f7911acb9fb'),
('buy_guild_decoration','p_user_id uuid, p_guild_id uuid, p_decoration_id text, p_cost integer','fdc012e296e2dea65700004729069bb2'),
('buy_guild_decoration_v2','p_guild_id uuid, p_type text, p_item_id text, p_cost bigint','0ceadae7ff3d17a87e8603f59fa2067b'),
('buy_normal_shop_product','p_user_id uuid, p_product_id text','bf15a191b2395bbe8e62733080c0b717'),
('buy_normal_shop_product_core_20260823','p_user_id uuid, p_product_id text','b8f1a48178bdd78bb66ce4a5815bf81d'),
('calculate_user_character_power','p_user_id uuid, p_user_character_id uuid','3fbae747e60182823a197254c569b70c'),
('calculate_user_total_power','p_user_id uuid','ab6772b65f3e345778686bfd49322828'),
('cancel_guild_join_request','p_request_id uuid','698079e994d79c5c4486e171fb0f59b1'),
('cancel_unresolved_gvg_attack','p_attack_id uuid','cfabef2a96d832e1bd829e744ed9e911'),
('canonical_character_awakening_required','p_awakening_level integer','d6fb6dc2c9330967049322fee337afb8'),
('canonical_character_stats','p_character_id text, p_level integer, p_awakening integer','2c196719fe8fcd72b10ffc2c5e578d7e'),
('canonical_equipment_flat_stat','p_master_flat integer, p_level integer, p_plus_val integer','a4173272e34c820bbc15a8d231d17e9d'),
('canonical_equipment_lb_multiplier','p_plus_val integer','f97ead1de687f72e022618e162605a0e'),
('canonical_equipment_lb_options','p_category text, p_plus_val integer','6cad83b63cf141fcf00cbd2a77a6ae4c'),
('canonical_equipment_level_cap','p_plus_val integer','637294d90e18b0fbc33c19c953439f2d'),
('canonical_equipment_runtime_projection','p_user_id uuid, p_user_character_id uuid','4a8ce837af11f1d5d79326c0aaaed685'),
('canonical_equipment_runtime_projection_00170','p_user_id uuid, p_user_character_id uuid','5b219ded4759f8099502806bcd6d9305'),
('canonical_equipment_runtime_projection_00171','p_user_id uuid, p_user_character_id uuid','50d356959819468068e1cd4d51abafc5'),
('canonical_funnel_milestone_satisfied','p_user_id uuid, p_trigger_type text','04b68bee5751c4978e8286f74b9c1774'),
('canonical_guild_member_cap','p_guild_id uuid','6618619b58dc813ae2c1710517aad8f5'),
('canonical_pvp_expected_score','p_player integer, p_opponent integer','4a7b585263a5ba777c84c8cbfda989dd'),
('canonical_pvp_rating_delta','p_player integer, p_opponent integer, p_result text','9072fc7fe6c9df578ed18b05135ef058'),
('canonical_pvp_soft_reset','p_rating integer','08d9a159c73030d4493d18c988c8ef4c'),
('canonical_quest_enemy_snapshot','p_quest_id text','7132654e1394bd15cda22d79ad5cba55'),
('canonical_quest_is_unlocked','p_user_id uuid, p_quest_id text','aac3dfd36532421236223e4941ddd649'),
('canonical_raid_rotation_pair','p_date date','e817f2add5cb0a890b3c586950603372'),
('canonical_ranking_reward_payload','','3856197479d12f5501e3c514850fef39'),
('canonical_skill_slot_count','p_awakening integer','a449aa62bc862a5ec94cc8330fd6f2fc'),
('capture_current_lifetime_onboarding_grant','p_user_id uuid','5d12c5febe8f4a500f1be418a19ca4af'),
('capture_daily_ranking_guild_membership','','06ca83f0d587446475dfa03282d0fd6f'),
('capture_gvg_guild_result','','4621c1f1a5ee729b6c2a4a4431deb34f'),
('capture_gvg_individual_damage','','9471b9314e3098eadc7121f0d7eaa5b0'),
('capture_lifetime_onboarding_grant_after_formation','','b82be2762312bfc1c7c244e238dbfc4d'),
('capture_pvp_daily_win','','47d2c7c90dcec5e658b1f205e3de3f3e'),
('character_awaken','p_user_id uuid, p_character_id text, p_cash_cost integer','ec29fead012754766f462e6a949d8d73'),
('character_level_up','p_user_id uuid, p_character_id text, p_exp_item_id text, p_count integer, p_cash_cost integer','2ac69714af6ad7d88c5b309bc2333c3a'),
('check_current_gameplay_reset_eligibility','','e58f672cd863306f43f1dac44468df59'),
('claim_all_mission_rewards','p_mission_ids text[]','33ef8e0c11fa3d860c1bd4e96830274b'),
('claim_all_mission_rewards','p_user_id uuid, p_mission_ids text[]','9c15657c8de784867a98edc91dfab711'),
('claim_all_presents','','4d25888ddccc3571bea583a0b4a4e188'),
('claim_all_presents','p_user_id uuid','b627add278fa3f93e72f7c9574aa9e95'),
('claim_battle_rewards','p_user_id uuid, p_cash_amount integer, p_exp_amount integer, p_item_rewards jsonb','18ce186c990b6b4aa626216eaf17b5ea'),
('claim_daily_pass_reward','p_user_id uuid','8cd06488434b3ff6711687b3529f6095'),
('claim_daily_pass_reward_core_20260823','p_user_id uuid','48908c9ca6b58aa8a466a53cec22bebe'),
('claim_gvg_base','p_guild_id uuid, p_base_id text','69bc32be07a557df586ca35ff6387ff8'),
('claim_mission_reward','p_mission_id text','6885b4abc3e6ec66affdaf7538327ff6'),
('claim_mission_reward','p_user_id uuid, p_mission_id text','dfb14d7d92e7d0473a498430ec44e7b7'),
('claim_patrol_rewards','p_patrol_id uuid','cc9e982cb792ce285fc16d33964bd9b9'),
('claim_present','p_present_id uuid','087cc231b3713064f63d6d82b4579738'),
('claim_present','p_user_id uuid, p_present_id uuid','d5b68be10a35dc997b988ac0c7ab3b7d'),
('cleanup_expired_anonymous_onboarding','','3ba0418b18b29a43b851acfdde51d242'),
('complete_activation_mission_handoff','','fa3de4d25192a5f9827962ddb4dadf73'),
('complete_current_tutorial_formation','','de5936a052d2adfc88ab6a42732e9b7a'),
('complete_gvg_match_on_timeout','p_match_session_id uuid','2c23d241cc8e130523c9577bd99df17a'),
('complete_patrol_instant','p_user_id uuid, p_patrol_id uuid, p_diamond_cost integer','7733a20b1c5e12b4daaa3da4d32e01f9'),
('complete_patrol_instantly','p_user_id uuid, p_patrol_id uuid, p_use_currency text','af4b032d3fed3f6f0ee457c8806bf082'),
('complete_patrol_preopen','p_patrol_id uuid','3dc5022885e08f4aa249c792ab49b29b'),
('complete_patrol_v2','p_user_id uuid, p_patrol_id uuid, p_cash bigint, p_xp integer, p_course_name text, p_reward_item_id text, p_reward_qty integer, p_gear_dropped boolean, p_is_victory boolean, p_battle_reward_item_id text, p_battle_reward_qty integer','cdd4083df53d28b41501fd7bae8849c7'),
('complete_tutorial_authentication','p_auth_method text','37bfcab1aafeb44c1e54b7090881b121'),
('consume_pvp_point','p_user_id uuid','7ca44a6fb712cd2779216a6182b7934a'),
('consume_raid_attempt','p_user_id uuid, p_cost_type text, p_cost_amount integer','811c883465c9b2873d94c5fcb6608077'),
('consume_tutorial_character_daily_free_gacha','','60aae8399f1e82e519d5d19d3709d46d'),
('consume_vitality_for_gvg','p_user_id uuid, p_cost integer','8018d6509cab617d923c5a64496acdb5'),
('create_battle_replay_pending','p_battle_mode text, p_tactic_id text, p_random_seed bigint, p_player_snapshot jsonb, p_enemy_snapshot jsonb, p_source_reference_id uuid','d6feffce9081f52529d8ba944f950aab'),
('create_bbs_post','p_thread_id uuid, p_content text','dfd2334cf70fd0df24cd26e8e26c5030'),
('create_bbs_thread','p_category text, p_title text, p_content text','5a3d3aca93dd2e97a217857e8c0e87ef'),
('create_guild','p_user_id uuid, p_guild_name text, p_guild_description text, p_guild_logo text, p_guild_color text, p_creation_cost integer','a8bd7d7fc680e04eca33d3cb738e5bc6'),
('create_guild_v2','p_user_id uuid, p_guild_name text, p_creation_cost integer','d10782e4cc472779bd9e8402b0164b74'),
('create_gvg_match_session','p_session_key text, p_scheduled_start_at timestamp with time zone, p_scheduled_end_at timestamp with time zone, p_guild_a_id uuid, p_guild_b_id uuid, p_guild_a_phase_hp bigint, p_guild_b_phase_hp bigint, p_npc_guild_name text','d3faa77510cff45277b34d372b95eadb'),
('create_kpi_marketing_import_batch_v1','p_source text, p_actor_identifier uuid, p_file_hash text, p_idempotency_key text, p_metadata jsonb','95ceb09ba97170e6a62ad086a30c403c'),
('create_patrol_battle_replay','p_patrol_id uuid, p_tactic_id text','13556d4e12397f5e42e94f1cefb00ea7'),
('current_gameplay_reset_eligibility','p_user_id uuid','f402f3ae207cff32c55168557a2695cb'),
('current_ranking_season_id','p_type text, p_at timestamp with time zone','2398684382ee553f6112770de2d56059'),
('defer_tutorial_authentication','','f34e434fbe9f6a2c76a289192f055006'),
('discard_current_anonymous_account_for_switch','','1c114253eaa2e1ed8527fedb75ce7219'),
('dispatch_completed_free_normal_gacha_mission','','27a98fdf6e5803baab9cdd3d68645f69'),
('dispatch_guild_chat_mission','','7875fb30fa8804c9f16598d742838172'),
('distribute_ranking_rewards','','2132dc0004b1caa369c158f51df9d8bc'),
('donate_to_guild','p_user_id uuid, p_guild_id uuid, p_amount integer','58a1a40190c4d5c11a47dbf874fe3939'),
('draw_gacha_item','p_gacha_id text, p_rarity text','c9f5c6fab09217b478c72b0304a41209'),
('draw_gacha_rarity','p_gacha_id text','1aec8cbdd86df7ea7a00b57334bc5529'),
('enforce_canonical_guild_join_level','','faa335ea125186b5f51a5ec46f6fcd24'),
('enforce_guild_member_cap','','709b948b343cd78f09b87797ae8becd6'),
('enforce_kpi_classification_no_overlap','','18c212f9c714f5fc548b8fb59b7b6546'),
('enforce_mission_claim_prerequisite','','55b23d6cba3d6afdc5b26f53ba45555e'),
('ensure_active_special_missions','p_user_id uuid','5f9eec093495681e151f63e8032f13a5'),
('ensure_current_player_profile','','f5401aeae77a84a0985dce6c26b8791b'),
('equip_character_cosmetic','p_user_character_id uuid, p_slot text, p_cosmetic_id text','05f42f1087dcd0829dd2aa04883ce2d7'),
('equip_gear_bulk','p_character_id text, p_user_id uuid, p_gear_ids jsonb','832dba94f8cc8aee86c0652019c342a4'),
('equip_guild_cosmetic','p_guild_id uuid, p_slot text, p_cosmetic_id text','4b9aa6ccbbc0a52ab35c9780c0265301'),
('equip_guild_decoration','p_guild_id uuid, p_type text, p_item_id text','7a6d769c53c21e391fc9d4a238a3d860'),
('equip_owned_title','p_title_id text','57d9537c9c356dde0b6457df13d0f638'),
('equip_skill_bulk','p_character_id text, p_user_id uuid, p_skill_ids jsonb','202545ea2161cebf6117487cc37b32b6'),
('equip_user_cosmetic','p_slot text, p_cosmetic_id text','81ec6195e52c1331530b001fad32c7da'),
('equipment_level_battle_scale','p_level integer','ff8b3e5cce3b34d786c94729e97fedb0'),
('evaluate_mission_progress','p_user_id uuid, p_trigger_type text, p_progress_increment integer','20899b4e22436402bbb339131bfed7cf'),
('exchange_pity_reward','p_user_id uuid, p_reward_type text, p_reward_id text','e688ca55c782156075b306d69e1d1dc6'),
('execute_asset_gacha','p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text','4a58a268469ac2edb83e224ebc47fdd4'),
('execute_asset_gacha','p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text, p_request_id uuid','9b75f6a837a575248e749482a95805a9'),
('execute_asset_gacha_core_20260812','p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text','658d7dba8af0bc8d9855364159fc7054'),
('execute_character_gacha','p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text','1897afa43530c219671c7b53d097971a'),
('execute_character_gacha','p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text, p_request_id uuid','3fd3650c352db0c436a570e88d766b1e'),
('execute_character_gacha_core_20260812','p_user_id uuid, p_gacha_id text, p_pull_count integer, p_currency_type text','e2682622fbe1395a0b9d8a8a19463c2d'),
('execute_gacha','p_user_id uuid, p_currency_type text, p_currency_cost integer, p_results jsonb','2ed0a1e1223c915e54f89765bcbd56d2'),
('execute_gacha','p_user_id uuid, p_scout_type text, p_scout_count integer, p_use_currency text','556ddf209b9efbeb7c1d9af446d6f9e9'),
('execute_tutorial_character_gacha','p_request_id uuid','b439298c362a5d20136afa1b4fb2f0af'),
('finalize_preopen_guild_power_season','','690013ab3e31ca44888d3eeaa7038d87'),
('finalize_pvp_battle','p_replay_id uuid, p_result jsonb','aa6c814928008083bc9b37feb2e9de89'),
('finalize_pvp_season_rewards','p_season_id uuid','1a6f423418867c949274173a82903cf3'),
('find_gvg_match_opponent','p_session_key text, p_guild_id uuid','45230bb6313ab7d14618fb5ada9c766e'),
('funnel_mission_trigger_type','p_milestone text','7eac666ed03afee549f99f9a496d2dce'),
('generate_canonical_quest_encounter_snapshot','p_user_id uuid, p_quest_id text, p_allow_repeat_reroll boolean','7ed2c4d726ec72cb028d0a78a54acfd6'),
('generate_current_user_invite_code','','a6825bb95a1232981247631e430ff629'),
('generate_user_gift_code','p_user_id uuid','152b68895587973c67daf508ec7de808'),
('get_active_mission_events','','1b77af7557924f1419ae3ce0fe8ac5ef'),
('get_bbs_unread_counts','','9392b9bee958c5a5c317469d8d4c4e0f'),
('get_canonical_quest_progression','','c5d936603f60cd6ea6666226db22ba70'),
('get_chat_unread_counts','','48e0dd9daab3df0313d0a6211ef664b2'),
('get_current_main_formation','','f477b9774aca2a94e4ad4da42763d611'),
('get_current_onboarding_state','','bccaf749d20388e527892eab29abeb8d'),
('get_current_raid_attempt_state','','3d709a09c6d662ffd83cd810d2205159'),
('get_current_raid_battle_rewards','p_replay_id uuid','7ad2e0aab34e6de5129c35ba6094ae97'),
('get_current_skill_display','p_skill_ids text[]','040a6d92844da6b1cb75568c7aa99887'),
('get_direct_message_unread_counts','','997726207ff396d7beb2c5369d8cad47'),
('get_friend_helper_loadout','p_friend_user_id uuid','f9e5ffc8a99ec999102b32c99f40ae24'),
('get_friend_helper_loadout_core_20260823','p_friend_user_id uuid','270aa029c9ea8cd872da3d6d3f8e152b'),
('get_kpi_refresh_run','p_run_id uuid','95fd7f2a1199f01ff497f637672095ff'),
('get_latest_kpi_snapshots','p_category text, p_period_type text, p_period_start date, p_period_end date','2891c35763495c5cd885a62209c0c7a9'),
('get_my_pending_ranking_reward_notification','','ab1deffe5443077a151eea404d616a1b'),
('get_my_power_snapshot','','a64728eef1d171a831bc99d9684aad1b'),
('get_patrol_battle_enemy','p_patrol_id uuid','e495674fac17a3f1f18dd2e2c0e51349'),
('get_pending_mission_event_dialog','','44fcdb9a6594282ac1ec13211ba59acf'),
('get_preopen_guild_power_ranking','p_limit integer, p_offset integer','c01a20bb92acda08be56ee39afaccc12'),
('get_public_battle_loadout','p_target_user_id uuid','bfec2c1beaaba02aa2e9c58ca6c0f3b3'),
('get_public_battle_roster','p_target_user_id uuid','6fa2c771c2cb58ae4cec75e1613bd55a'),
('get_public_battle_roster_by_character_ids','p_character_ids uuid[]','a5cd541bc87f4f00d3885f16e6900266'),
('get_public_guild_base_controls','','840a9f46149f8fa9480351af45b926eb'),
('get_public_guild_detail','p_guild_id uuid','f7859f3760487b9c6fc9fb32fd216326'),
('get_public_guild_power_rankings','p_daily boolean, p_limit integer, p_offset integer','fd4cbcc8783a962c7efb21f3886ca2dc'),
('get_public_gvg_rankings','p_limit integer, p_offset integer','bf190ff2b2cd5629238c70fca30305a4'),
('get_public_leader_characters','p_user_ids uuid[]','f0b40cc4a1953ee300a4dba8a9b89451'),
('get_public_player_detail','p_user_id uuid','e08b7e63fbd33b89687d6e6b530f0be9'),
('get_public_power_rankings','','e972d6469c30432f9838a99c961e3403'),
('get_public_power_rankings','p_daily boolean, p_limit integer, p_offset integer','d2056d1931c624356ebe3c4197a0b5db'),
('get_public_profiles','p_user_ids uuid[]','23f0a9cd61a47bd16d000193b9c3bde5'),
('get_public_pvp_rankings','p_daily boolean, p_limit integer, p_offset integer','d61155b55ce3db78be178127c0609fdf'),
('get_public_ranking_reward_master','','be874eb8f7b825f27e8296f7d6ae1a3b'),
('get_pvp_opponents','p_user_id uuid, p_my_points integer','6a197f4bf603b88a99ad4d7240c60906'),
('get_pvp_opponents_page','p_user_id uuid, p_my_points integer, p_offset integer','0e14d5a126a5efea924a6de341006f97'),
('get_pvp_rankings_page','p_limit integer, p_offset integer','2b1636854292e2d55b1d0295f4f0ad55'),
('get_recent_social_activity_feed','p_limit integer','42b76f9e10097e4d8dfc968d8ecc3d5b'),
('get_recommended_guilds','p_limit integer','889c4cb461c20519520710c835edea6a'),
('get_user_setup_status','','224372d31c2b4756defed5eb49deabf0'),
('grant_canonical_guild_daily_exp','p_user_id uuid, p_source text, p_source_reference_id uuid','e3a225c815316d9b0ff8b990656733a8'),
('grant_mission_reward_bundle','p_delivery_ledger_id uuid, p_user_id uuid, p_mission_id text','6255f30d4868a6b104af5b687bf3b19c'),
('grant_present_payload','p_user_id uuid, p_item_id text, p_quantity integer','baecae7e945e8b77f5b1c50dc6b384af'),
('grant_raid_completion_xp','p_boss_id text','af4d3ce78d3ea35c4bed07595b21e2ba'),
('guard_daily_profile_changes','','c87b519b2c7d427df36c125bb6ed2fab'),
('guard_equipped_title_ownership','','2320efd123aab8f41b8ddd47fd1aff84'),
('guard_gvg_defense_deck_lock','','f3d40484b03ca0838e9569c743aeb0fe'),
('guard_gvg_membership_lock','','5affb7ec196ec8cd2d3dea4e51ebd070'),
('guard_preopen_guild_power_cutoff','','7b07e6db655350ba278663c48e4cca10'),
('guild_jst_date','p_at timestamp with time zone','72aa09be13de8dda5fd6de3498c592df'),
('gvg_season_reset','','6aedc5f7c2a060b204fdb385b49b3dae'),
('initialize_current_player','p_username text','6e5b13312b51d1f956fed288b72ea106'),
('initialize_current_player','p_username text, p_invite_code text','c50b9a91b3dc7cd968ce11e82acb093d'),
('initialize_new_user','p_user_id uuid, p_name text','bc1e5d34e51e49f6bf8f250035df1f28'),
('initialize_new_user','p_user_id uuid, p_username text, p_character_id text, p_area_id text, p_gift_code text, p_gender text, p_hair_id text, p_face_id text','11730b6d456379097d6fa2d6c968f84e'),
('is_current_guild_master','p_guild_id uuid','2a9edc09a4d5e4cd1b466ec8ba61ed5e'),
('is_current_guild_member','p_guild_id uuid','0de816fbabce36fc37420e9ef33891aa'),
('issue_kpi_mypage_ready_context_v1','p_tutorial_version text, p_idempotency_key text, p_source text','06f1f50df335948bf70076a78bb044c9'),
('join_guild','p_guild_id uuid','1abd956fa67e58a327ed105809fb0093'),
('kick_guild_member','p_guild_id uuid, p_user_id uuid','3b87a8677878f8c49a6c2c84cb0a69b9'),
('kpi_ensure_subject','p_user_id uuid, p_registered_at timestamp with time zone, p_registration_type text','14499368ed882281efbec073523213e1'),
('kpi_is_subject_excluded','p_subject_id uuid, p_at timestamp with time zone','0e0c5bf5b3de73c7c9320dbf76749756'),
('kpi_jst_day_start','p_date date','d3e774b97d4db2ea0b014f8bdc09e60e'),
('kpi_overview_saved_rate','n bigint, d bigint, t numeric, r text','6c38c5367f0f65e118b36cde7adfdd2f'),
('kpi_record_daily_activity','p_user_id uuid, p_occurred_at timestamp with time zone','adb47936758d7b0d07a0b2692a7b99b5'),
('kpi_v249_current_subject','','0e99a14600e2afc4c7af37f5d60c9b0b'),
('kpi_v249_metadata_valid','p_metadata jsonb','a54929782dd0ff8e1b1367418411ebb2'),
('kpi_v250_landing_metadata_valid','p_metadata jsonb','7b26e494710e9e2f23d4b3dc11d1b12b'),
('leave_guild','p_user_id uuid, p_guild_id uuid, p_is_master boolean, p_has_others boolean','a1c1ec5935ec0209dce609d4c3c683f7'),
('level_up_character','p_character_id uuid, p_exp_item_id text, p_count integer','2a5702935249e017dcc30e9dae1f6484'),
('level_up_equipment','p_equipment_id uuid, p_exp_item_id text, p_count integer','3df209dcd45990b813f4474a51881799'),
('limit_break_equipment','p_equipment_id uuid, p_use_wildcard boolean, p_dupe_id uuid','1a7f8a053ede81dd02f7d37ca023eb96'),
('limit_break_gear','p_user_id uuid, p_equipment_id uuid, p_cash_cost integer, p_hammer_cost integer','cf2c4affa6cede57fe68a63417e8698e'),
('limit_break_gear_v2','p_user_id uuid, p_equipment_id uuid, p_cash_cost integer, p_use_wildcard boolean, p_dupe_id uuid, p_new_options jsonb','baec89ad134237e5a42fc2df0821c3d9'),
('limit_break_skill','p_skill_id uuid, p_use_wildcard boolean, p_dupe_id uuid','531fb948eef6aa7edd2e70b8d08be696'),
('limit_break_skill','p_user_id uuid, p_skill_id uuid, p_cash_cost integer, p_book_cost integer','4263e04ef6d7dad67e066722751106f2'),
('limit_break_skill_v2','p_user_id uuid, p_skill_id uuid, p_cash_cost integer, p_use_wildcard boolean, p_dupe_id uuid, p_wildcard_item_id text','b530004a2bfa75316e9f883f7bcbbdbf'),
('mark_bbs_thread_read','p_thread_id uuid','ef90b1b6c5713636323957a30d13ece1'),
('mark_chat_channel_read','p_target_type text','04c22e9327f1f7a0faea27073cec8de6'),
('mark_direct_message_read','p_message_id uuid','ff7f870924d5f0bfb9dbbea139abe723'),
('mark_mission_event_dialog_viewed','p_event_id text, p_jst_date date','fe06cfbb31b7db43b4957dbdd2b97115'),
('move_current_user_base','p_base_id text','dee9f3912fffe38771fe9bc2b1e37293'),
('normalize_user_mission_progress','','f84b59a616cc36eaba55266aa2f7f7af'),
('on_canonical_guild_chat_exp','','80e6345e6aa66213cfd286ce5ac262f7'),
('on_canonical_guild_quest_exp','','211c7aec1f35a665db110d6013e833f9'),
('on_canonical_hard_quest_complete','','c8780be8765c71188d7df2084517ff10'),
('on_canonical_patrol_snapshot','','91dab9c97f6a147ba923532bcb4e05c3'),
('on_daily_mission_authority_change','','44ffbbeb8063bf4e9000ab28f3e95f51'),
('on_first_official_battle_funnel','','748ebf654a4ecfb312b976d0ee216c3a'),
('on_funnel_mission_progress','','d8a928abf41a97d9fdb49cb2a209623f'),
('on_guild_chat_activation','','e3627b83c9f052ff229a8524901aac1a'),
('on_guild_funnel','','8131e80b8bc307e33c1b5820b3d2a3e0'),
('on_kpi_auth_method_created','','04ab30a54fcad18405d579bc698e2e3b'),
('on_kpi_gacha_completed','','be3fa56706d89a8b21396cf098b8937e'),
('on_kpi_guild_member_joined','','c68374d752d5859d4565a0923b57d150'),
('on_kpi_guild_member_leaving','','d770927376e7844c8ebc5c2723973fb8'),
('on_kpi_tutorial_complete','','43e7e462f531f4ced07b6024b5fade67'),
('on_kpi_user_created','','adabb4abec934151fd3301bfd95788b1'),
('on_kpi_user_detaching','','c88dbbb3cd482fe5233eb9daf1b90b51'),
('on_kpi_v249_guild_chat_message','','0dfad866bb02106f451b655a50de2be7'),
('on_kpi_v249_guild_member_joined','','ccb28c035f48cd2b3215dba9dab7c54d'),
('on_login_bonus_mission_progress','','7d045f6cd4c93c196c91cc67d57f5e44'),
('on_m9x_first_human_response','','03873062d2428076acd6552846a922f2'),
('on_m9x_gacha_activity','','15e6a5ab922a8e9bf5b1821a8ae8a882'),
('on_m9x_guild_created_activity','','fb5890987934d8496645c7cec1305e5e'),
('on_m9x_join_approved_metric','','3a83f7de96399f277081d837581cb99f'),
('on_m9x_power_leader_activity','','baf68eaa73ad7efbdd4b31ece593919e'),
('on_main_formation_special_mission_change','','addcb73b52bff112d233b1bc50564919'),
('on_mission_claim_unlock','','0a774c68487e8309add0df4824b83e8f'),
('on_official_battle_funnel','','505de67d3de0117059e76a2823a454c2'),
('on_post_tutorial_free_asset_gacha','','6164120db7bbd74a8974bed1bc99f5bf'),
('on_progression_growth_funnel','','fe7cfdadf90902453ccba3f416daeda0'),
('on_ranking_successful_view_special_mission','','a06f792aa5fc185db59d2660d7f56cb6'),
('on_special_mission_status_change','','34482e60796c7a4c6db57e868061383a'),
('on_tutorial_complete_funnel','','ef3d0ffe2e1e4a81dae83ed47a7fb1cc'),
('operations_feature_state','p_feature_key text','bad2dbaa023200340954e71405a10107'),
('power_projection_master_changed','','54ae3db4cd110609e17742c6122d6e6f'),
('power_projection_owned_row_changed','','9ee23308f50790cf4b7209b0f359ca26'),
('prepare_current_tutorial_growth','','d23175ec5a46c7327a2914bcfb52a52d'),
('process_daily_reset','p_user_id uuid','c8822e687a455f528edb016e134c38f7'),
('process_gvg_battle_result','p_user_id uuid, p_guild_id uuid, p_base_id text, p_is_practice boolean, p_is_win boolean','8ca2ef802386ab6e8bc588043ab52dcb'),
('process_gvg_battle_result_v2','p_guild_id uuid, p_battle_id text, p_points integer, p_is_guild_a boolean','0b69cd929b7ceed124c3cd8cb2f0e8db'),
('process_gvg_battle_result_v2','p_user_id uuid, p_guild_id uuid, p_base_id text, p_is_practice boolean, p_is_win boolean','2d467c5a7a817a1ae6ec548377872a80'),
('process_login_bonus','','3a4968b1d67efa2d6adbeb37b8600cff'),
('process_pvp_match_result','p_user_id uuid, p_target_user_id uuid, p_is_win boolean, p_point_diff integer, p_cash_reward integer','4f26057a958d6e596c913ca08b43d572'),
('process_pvp_match_result_v2','p_user_id uuid, p_is_win boolean, p_point_diff integer, p_cash_reward integer','5825e0bb3b33f6ffdf7fde0ef1387c6b'),
('process_stripe_shop_purchase','p_user_id uuid, p_product_id text','8cf8c77310d2ec842d3ce22f5eee4899'),
('process_stripe_shop_purchase','p_user_id uuid, p_product_id text, p_stripe_session_id text','305d58753cbe80b488dff353b0e868d9'),
('process_stripe_shop_purchase','p_user_id uuid, p_stripe_session_id text, p_product_id text, p_amount_jpy integer, p_items jsonb, p_product_title text, p_is_beginner boolean, p_purchase_limit integer','3b0785c6b73e63133dfac1d021babd58'),
('purchase_monthly_pass','p_user_id uuid','83067b1eb902123483e1d1b1c171e89c'),
('purchase_monthly_pass_core_20260823','p_user_id uuid','2f4722e86b82b43560e5bd9591ec2cd2'),
('pvp_season_reset','p_user_id uuid, p_current_rate integer','b56fe345a613dad462251405144f95e0'),
('raid_boss_defeat','','5a7c2f185063303cdd712f6074a047e7'),
('ranking_period_bounds','p_type text, p_at timestamp with time zone','3fcc033ba5354189298a9317b1a8f33d'),
('reconcile_pvp_after_season_boundary','p_season_id uuid, p_transition_at timestamp with time zone','0f0e49666a1e7c9e4f25f9829247b0dd'),
('record_client_funnel_event','p_event_name text, p_source_screen text, p_source_cta text, p_object_id text, p_metadata jsonb','9f7eda8403a6989cef0dd831631f0ec3'),
('record_current_guild_login','','fe808bfb9d7e5e03d872b6ba4ae7f2e0'),
('record_funnel_milestone','p_user_id uuid, p_milestone text, p_metadata jsonb','336cca756fba10a141315d42d837d729'),
('record_guild_activity','p_action_type text, p_source_id uuid','7293d7ae2e8f3954d5722ee35ce9249a'),
('record_kpi_acquisition_landing_v1','p_token text, p_metadata jsonb, p_source text','4c43e8a8f46f1e6afedd21f03d816692'),
('record_kpi_acquisition_observation_v1','p_token text, p_event_type text, p_idempotency_key text, p_metadata jsonb, p_source text','44e979464caacdc3e9e17f338c730af2'),
('record_kpi_marketing_daily_revision_v1','p_batch_id uuid, p_report_date_jst date, p_account_key text, p_campaign_key text, p_campaign_name text, p_line_item_key text, p_line_item_name text, p_creative_key text, p_creative_name text, p_reporting_grain text, p_spend numeric, p_currency text, p_impressions bigint, p_clicks bigint, p_external_key text, p_revision integer, p_idempotency_key text, p_metadata jsonb','4e447a2a75ba84789bbb3affa06380f1'),
('record_kpi_subject_identity_transition_v1','p_from_subject_id uuid, p_to_subject_id uuid, p_transition_type text, p_context_id uuid, p_idempotency_key text, p_metadata jsonb, p_source text','97aedb25efddb9b75304d86806dceb60'),
('record_mission_event_telemetry','p_event_id text, p_event_name text, p_source text, p_mission_id text, p_metadata jsonb','c254295ddf9eeeb3401e54663481c2a5'),
('record_post_tutorial_guide_milestone','p_user_id uuid, p_milestone text, p_metadata jsonb','aae38bdc17b12c669d46240a14157341'),
('record_raid_boss_damage','p_user_id uuid, p_boss_id text, p_damage integer','7d8bb02940db32b284c745e474c2df30'),
('record_raid_boss_damage_v2','p_user_id uuid, p_boss_id text, p_damage integer','aed48467e3910accde968188a0a8fce5'),
('refresh_all_user_power_projections','','eca0d26cba0553cc42b71c6e1a08c72c'),
('refresh_daily_mission_completion_aggregates','p_user_id uuid, p_cycle_date date','2694c17f0c53cd2183bfa3f8325f652a'),
('refresh_kpi_acquisition','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','15018bcd6f8c2141e6de9f369b84cd0a'),
('refresh_kpi_acquisition_v2','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','9d3de280711a947db1a0cd1c1b8c64bb'),
('refresh_kpi_active_retention','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','cd100f7d276738f480141aac852751f5'),
('refresh_kpi_active_timeseries_v2','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','32e8e56a3176b009b97b48c30e0f1c66'),
('refresh_kpi_content','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','c75843220dbb8fc89ac42139cc6e7825'),
('refresh_kpi_guild','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','6c4c82ef00d7e10e2326fd64dd70b4b2'),
('refresh_kpi_guild_timeseries_v2','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamp with time zone','7d1797e5211d17669a3e598454262ed9'),
('refresh_kpi_overview_saved_results','p_today date','3eae1df662610cbda1d282511759548e'),
('refresh_kpi_revenue','p_run_id uuid, p_period_type text, p_period_start date, p_period_end date','70deb9586b11159415d2a2e9d08ae406'),
('refresh_kpi_snapshots','p_category text, p_period_type text, p_period_start date, p_period_end date, p_requested_by uuid','57430f5e50277a74519e692bfb1dd59f'),
('refresh_special_event_completion','p_user_id uuid, p_event_id text','9cd3a0e7d0e9c28c17c143c97fff5e3f'),
('refresh_user_power_projection','p_user_id uuid','c3de2fefae26a75743224cd474e0ba83'),
('reject_friend_request','p_request_id uuid','077a37c0937d17a844f60cc4a5fa8bf6'),
('reject_friend_request_core_20260823','p_request_id uuid','5bc795c55f2f361e19dd0d1083adbf97'),
('reject_guild_power_snapshot_mutation','','16a94fedaa556e15ffcbb3668bc8df1d'),
('reject_mutation_during_maintenance','','aae535ae719992a18a5a677f13b7b27c'),
('remove_friend','p_friend_id uuid','2c74cb47bd720904e4a8a1e1781a4f1b'),
('remove_friend','p_user_id uuid, p_friend_id uuid','5d34faa974c4ab97306b0a832c3a4448'),
('remove_friend_core_20260823','p_friend_id uuid','3efef587967fa5f086f05dccbebc0de9'),
('remove_legacy_pvp_cash_before_finalize','','31f426ba2c981a450eb2d3252fe0c183'),
('request_guild_join','p_guild_id uuid','0cc99bcde40425942c10f312532c3573'),
('reset_current_gameplay','p_request_id uuid, p_acknowledged boolean','9f22fe9c38352cfe67cbf68d848398e3'),
('reset_daily_power_rankings','','bf393df5c44e053acbb154f30f8c1e1b'),
('reset_seasonal_power_rankings','','66280659ed7234d7d0b099210e6e29b7'),
('resolve_canonical_reward_item','p_reward_id text','46a0d55407484540243456e2138280cc'),
('resolve_gvg_attack','p_attack_id uuid, p_battle_replay_session_id uuid, p_is_victory boolean, p_raw_damage bigint','9dbad9acacb2c1286197f99a7798f7e7'),
('resolve_gvg_attack_core_20260817','p_attack_id uuid, p_battle_replay_session_id uuid, p_is_victory boolean, p_raw_damage bigint','d9e875a36ecde7013b0dce78428386e0'),
('resolve_gvg_attack_legacy','p_attack_id uuid, p_battle_replay_session_id uuid, p_is_victory boolean, p_raw_damage bigint','aeaf4bf1f4edadab3f53756793bd8d3e'),
('review_guild_join_request','p_request_id uuid, p_approve boolean','2a936eca2c3e8eb657ed611571606b87'),
('save_gvg_defense_deck','p_character_ids text[]','8d3e4ae53ed439c313bbfd80ee533319'),
('save_main_formation','p_character_ids text[]','b7ec8c13a05e9913fb70ceb02ec5513e'),
('save_pvp_defense_deck','p_character_ids text[], p_tactic text','2f32285b6a354bc941e71e7259fd948d'),
('save_recommended_main_formation','','661294beb21b8c858e13ac09386ca521'),
('search_guilds','p_query text','5fdde7c786e5b1d49abd987e100e68a4'),
('search_user_by_name','p_username text','d9d9729f17dc100aed6c7820efe6a496'),
('search_user_by_name_core_20260823','p_username text','4889b50f78e76993253fb86573aca560'),
('sell_gear_bulk','p_user_id uuid, p_gear_ids jsonb','a146084ce875d62c0ff8a79964e1c083'),
('sell_owned_equipment','p_equipment_ids uuid[]','36fa9695be4078dcab47f6e85c77ca99'),
('send_chat_message','p_target_type text, p_content text','56ef123754afe88990d7e56ea41967eb'),
('send_chat_message','p_target_type text, p_content text, p_reply_to_message_id uuid','598b8a5cc6dd10989df5304e3afd5245'),
('send_direct_message','p_recipient_id uuid, p_message text','077a60a1fbe5a83ff124e9975f5790d4'),
('send_friend_request','p_receiver_id uuid','e559800a14458533ec72115f27151cc0'),
('send_friend_request','p_user_id uuid, p_friend_id uuid','b19d35213c0c7cefe8990606202a6699'),
('send_friend_request_core_20260823','p_receiver_id uuid','56a95c626e89de5f6975765795a5ec4e'),
('set_character_equipment','p_character_id uuid, p_equipment_id uuid, p_slot_index integer','79a63dc891986c863d763f3dc3a6320d'),
('set_character_equipment_bulk','p_character_id uuid, p_equipment_ids uuid[], p_slot_indexes integer[]','eddf330bfc06f60bea888620d3a92dbe'),
('set_character_skill','p_character_id uuid, p_skill_id uuid, p_slot_index integer','ee95359be8e4105aa50226a11f81f07a'),
('set_character_skill_loadout','p_character_id uuid, p_skill_ids uuid[], p_slot_indexes integer[]','351de17c8b83db820ed536ad63e8857d'),
('set_current_guild_welcome_message','p_message text','1bd07bce53ffad692897ab6b64b1a7c8'),
('set_guild_member_role','p_guild_id uuid, p_target_user_id uuid, p_new_role text','aecf1a4742c8b855c3de994c76126e5c'),
('snapshot_gvg_match_members','p_match_session_id uuid','97c7b0a494e38e72a5a616fe7ad869c4'),
('soft_reset_pvp_ratings','','1efc4088fa514f1dc661238c8659b21c'),
('start_patrol','p_course_id text, p_character_id text','cd17d858c64d98038dd53447eda7899f'),
('start_patrol_v2','p_user_id uuid, p_course_id text, p_character_id text, p_duration_seconds integer, p_cost_vitality integer, p_battle_chance numeric','8e6e6c656400652cacfe76a056410b21'),
('start_pvp_battle','p_opponent_user_id uuid, p_character_ids text[], p_tactic text','56157fe8200aa512a459b6fbd8333474'),
('start_tutorial_progress','','592b106b167eee9397b1ee8beb7b57f3'),
('sync_active_users','','f3767dd0fb22e70a4db2fca11acdbca4'),
('sync_and_evaluate_raid_timeout','p_user_id uuid','db263ff3e5eddae1bf468f328dffef44'),
('sync_and_recover_vitality_and_pvp_points','p_user_id uuid','08818aa1a48b6998ea05ddfc0e0cb4be'),
('sync_current_missions','','9e563fb5507a978d8396e868d2dd49d5'),
('sync_legacy_guild_cosmetics','p_guild_id uuid','e8273bcaf925ff10003e424f6bc00cf6'),
('sync_legacy_user_cosmetics','','9ba99fd4549ece57e00723e8fbe187de'),
('sync_user_guild_membership','','ec7654c3a4da7dc7d8b7975eec114d38'),
('transfer_guild_leader','p_guild_id uuid, p_old_id uuid, p_new_id uuid','65ee37ffb508323e936c2bf0a9bd9589'),
('unequip_character_equipment','p_equipment_id uuid','5fceb9c321bc39f7f9e6c73c8c0c6084'),
('unequip_character_equipment_bulk','p_character_id uuid','941c4e41ccc9f73db4e65ab2f51d6aa1'),
('unequip_character_skill','p_skill_id uuid','9c15acba856aca438c26019ce059cb5a'),
('unequip_gear_bulk','p_character_id text, p_user_id uuid','4bfb117a781571eb86a08976b2501f3f'),
('unequip_skill_bulk','p_character_id text, p_user_id uuid','69eb5547edef5b8cffa3e5f75381852d'),
('unlock_eligible_user_cosmetics','','2ed84b3b65c57431c8abae052a19113a'),
('update_favorite_character','p_user_id uuid, p_character_id text','c6de0cae0d0acdeb6681703f6d17430c'),
('update_guild_alignment','p_guild_id uuid, p_main text, p_sub text','988e868160f683fd2ba7a8a4414b1314'),
('update_guild_recruitment','p_guild_id uuid, p_mode text, p_description text','79907467e92f6924a213daf5721fdb91'),
('update_guild_settings','p_guild_id uuid, p_desc text, p_approval boolean, p_kick_days integer','7bf50bffa90199a6c372df3002869f91'),
('upgrade_gear','p_user_id uuid, p_equipment_id uuid, p_exp_item_id text, p_count integer, p_cash_cost integer','e6f33a5d771f5cf19519c152e9d8e789'),
('use_action_resource_ticket','p_item_id text','e26b5757ae23d3b1e21ecbe1d67fffa9'),
('use_energy_drink','','d7529158f8bf4e0b785cc9fdfdab776f'),
('use_energy_drink','p_user_id uuid','d6878cc3d9892a3f143b2fbd19715998'),
('use_inventory_item','p_user_id uuid, p_item_id text, p_quantity integer, p_vitality_gain integer','d63afb49a1a99b8bb03e18a2b91ac5b9'),
('validate_official_battle_result','p_result jsonb','83982e617acdc623d4b80377f013d513')) x(name,args,hash) loop
  if not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=r.name and pg_get_function_identity_arguments(p.oid)=r.args and md5(pg_get_functiondef(p.oid))=r.hash) then raise exception 'protected function changed: %',r.name; end if;
 end loop;
 if (select jsonb_agg(t order by jobid) from (select jobid,jobname,schedule,command,active,database,username from cron.job)t) is distinct from '[{"jobid":2,"active":true,"command":"select public.cleanup_expired_anonymous_onboarding();","jobname":"anonymous-onboarding-cleanup-daily","database":"postgres","schedule":"0 18 * * *","username":"postgres"},{"jobid":3,"active":true,"command":"select public.advance_ranking_season(''PVP'',clock_timestamp());","jobname":"ranking-pvp-monthly-jst","database":"postgres","schedule":"0 15 * * *","username":"postgres"},{"jobid":4,"active":true,"command":"select public.advance_ranking_season(''RAID'',clock_timestamp());","jobname":"ranking-raid-weekly-jst","database":"postgres","schedule":"0 15 * * 0","username":"postgres"},{"jobid":5,"active":true,"command":"select public.finalize_daily_ranking_rewards();","jobname":"daily-ranking-reward-finalize-jst-midnight","database":"postgres","schedule":"0 15 * * *","username":"postgres"},{"jobid":7,"active":true,"command":"select public.finalize_preopen_guild_power_season();","jobname":"preopen-guild-power-finalize-20260909-jst","database":"postgres","schedule":"* 15 8 9 *","username":"postgres"},{"jobid":12,"active":true,"command":"set statement_timeout=''120s''; select public.refresh_kpi_overview_saved_results();","jobname":"kpi-overview-saved-results-half-hourly","database":"postgres","schedule":"7,37 * * * *","username":"postgres"}]'::jsonb then raise exception 'existing Cron changed'; end if;
 if (select jsonb_agg(t order by version) from (select version,name from supabase_migrations.schema_migrations)t) is distinct from '[{"name":"initial_schema","version":"20260731000000"},{"name":"rpc_functions","version":"20260731000001"},{"name":"seed_master_data","version":"20260731000002"},{"name":"phase2_rpc_functions","version":"20260803000000"},{"name":"phase2_rpc_lb_v2","version":"20260803000001"},{"name":"phase2_rpc_guild","version":"20260803000002"},{"name":"phase2_rpc_guild_misc","version":"20260803000003"},{"name":"phase2_rpc_guild_deco","version":"20260803000004"},{"name":"phase2_rpc_inventory","version":"20260803000005"},{"name":"phase2_rpc_inventory2","version":"20260803000006"},{"name":"phase2_rpc_patrol","version":"20260803000007"},{"name":"phase2_rpc_battle","version":"20260803000008"},{"name":"phase2_rpc_raid","version":"20260803000009"},{"name":"phase2_rpc_gvg","version":"20260803000010"},{"name":"phase3_stubs","version":"20260803000011"},{"name":"phase3_additional","version":"20260803000012"},{"name":"vitality_timer_recovery","version":"20260804000001"},{"name":"gvg_bases_migration","version":"20260804000002"},{"name":"gvg_consume_vitality","version":"20260804000003"},{"name":"raid_attempts","version":"20260804000004"},{"name":"raid_consume_rpc","version":"20260804000005"},{"name":"monthly_pass","version":"20260804000006"},{"name":"gacha_banners","version":"20260804000007"},{"name":"user_friends","version":"20260804000008"},{"name":"has_shown_guild_dialog","version":"20260804000009"},{"name":"distribute_ranking_rewards","version":"20260804000011"},{"name":"daily_reset_rpc","version":"20260804000013"},{"name":"phase4_season_reset_rpcs","version":"20260804000014"},{"name":"dev_rpc_reconciliation","version":"20260805000000"},{"name":"dev_gacha_charge_rpc","version":"20260805000001"},{"name":"character_gacha_rpc","version":"20260805000002"},{"name":"pvp_opponents_rpc","version":"20260805000003"},{"name":"skill_equipment_gacha_seed","version":"20260805000004"},{"name":"asset_gacha_rpc","version":"20260805000005"},{"name":"user_characters_identity_index","version":"20260805000006"},{"name":"exchange_pity_reward_rpc","version":"20260805000007"},{"name":"public_battle_loadout_rpc","version":"20260805000008"},{"name":"public_battle_roster_rpc","version":"20260805000009"},{"name":"public_battle_roster_by_character_rpc","version":"20260805000010"},{"name":"public_leader_characters_rpc","version":"20260805000011"},{"name":"owner_rls_user_assets","version":"20260805000012"},{"name":"public_profiles_rpc","version":"20260805000013"},{"name":"public_power_rankings_rpc","version":"20260805000014"},{"name":"public_profiles_friend_fields","version":"20260805000015"},{"name":"active_users_rpc","version":"20260805000016"},{"name":"users_last_active_at","version":"20260805000017"},{"name":"user_setup_status_rpc","version":"20260805000018"},{"name":"owner_rls_users","version":"20260805000019"},{"name":"owner_rls_user_progress","version":"20260805000020"},{"name":"fix_power_ranking_column","version":"20260805000021"},{"name":"owner_rls_user_invitations","version":"20260805000022"},{"name":"split_rls_user_power_rankings","version":"20260805000023"},{"name":"owner_rls_payments_presents","version":"20260805000024"},{"name":"login_bonus_30_cycle","version":"20260805000025"},{"name":"users_username_length","version":"20260805000026"},{"name":"replace_pvp_tickets_with_points","version":"20260805000027"},{"name":"gvg_session_foundation","version":"20260805000028"},{"name":"battle_replay_foundation","version":"20260805000029"},{"name":"gvg_matching_snapshot","version":"20260805000030"},{"name":"gvg_damage_resolution","version":"20260805000031"},{"name":"gvg_lifecycle","version":"20260805000032"},{"name":"gvg_matchmaking","version":"20260805000033"},{"name":"gvg_membership_lock","version":"20260805000034"},{"name":"gvg_read_policy","version":"20260805000035"},{"name":"gvg_timeout_timestamp","version":"20260805000036"},{"name":"gvg_defense_lock","version":"20260805000037"},{"name":"battle_replay_server_seed","version":"20260805000038"},{"name":"gvg_full_defense_snapshot","version":"20260805000039"},{"name":"gvg_matchmaking_candidate","version":"20260805000040"},{"name":"title_ownership","version":"20260805000041"},{"name":"equip_owned_title","version":"20260805000042"},{"name":"profile_daily_change_limit","version":"20260805000043"},{"name":"profile_field_validation","version":"20260805000044"},{"name":"gvg_attack_log_read_policy","version":"20260805000045"},{"name":"enforce_equipped_title_ownership","version":"20260805000046"},{"name":"pvp_defense_tactic_and_opponents","version":"20260805000047"},{"name":"raid_completion_xp","version":"20260805000048"},{"name":"gvg_one_pending_attack_per_user","version":"20260805000049"},{"name":"tutorial_progress_foundation","version":"20260805000050"},{"name":"tutorial_free_patrol_instant","version":"20260805000051"},{"name":"tutorial_patrol_battle","version":"20260805000052"},{"name":"initialize_anonymous_player","version":"20260805000053"},{"name":"single_auth_method","version":"20260805000054"},{"name":"guild_member_cap","version":"20260805000055"},{"name":"guild_decoration_permissions","version":"20260805000056"},{"name":"guild_shop_price_validation","version":"20260805000057"},{"name":"guild_member_permissions","version":"20260805000058"},{"name":"guild_settings_permissions","version":"20260805000059"},{"name":"guild_creation_and_join_security","version":"20260805000060"},{"name":"direct_message_permissions","version":"20260805000061"},{"name":"bbs_foundation","version":"20260805000062"},{"name":"guild_donation_resolution","version":"20260805000063"},{"name":"public_profile_guild_affiliation","version":"20260805000064"},{"name":"realtime_community_tables","version":"20260805000065"},{"name":"chat_message_foundation","version":"20260805000066"},{"name":"gvg_attack_resolution_authorization","version":"20260805000067"},{"name":"gvg_resolve_from_server_replay","version":"20260806000068"},{"name":"cancel_unresolved_gvg_attack","version":"20260806000069"},{"name":"restore_user_progression_columns","version":"20260806000070"},{"name":"remove_legacy_initialize_new_user_overload","version":"20260806000071"},{"name":"cancel_pending_gvg_replay","version":"20260806000072"},{"name":"harden_direct_message_rls","version":"20260806000073"},{"name":"add_direct_message_read_state","version":"20260806000074"},{"name":"add_guild_compatibility_columns","version":"20260806000075"},{"name":"add_progression_compatibility_columns","version":"20260806000076"},{"name":"fix_gvg_snapshot_character_id_types","version":"20260806000077"},{"name":"fix_uuid_present_claim","version":"20260806000078"},{"name":"fix_claim_all_presents","version":"20260806000079"},{"name":"add_legacy_reward_schema_compatibility","version":"20260806000080"},{"name":"resolve_remaining_legacy_lint","version":"20260806000081"},{"name":"retire_incompatible_legacy_rpcs","version":"20260806000082"},{"name":"retire_remaining_legacy_rpc_overloads","version":"20260806000083"},{"name":"reimplement_admin_season_resets","version":"20260806000084"},{"name":"fix_raid_season_reset_schema","version":"20260806000085"},{"name":"google_player_bootstrap_and_qa_fixture","version":"20260807000086"},{"name":"cosmetics_foundation","version":"20260807000087"},{"name":"cosmetics_equip_rpcs","version":"20260807000088"},{"name":"cosmetic_ownership_sync","version":"20260807000089"},{"name":"qa_cosmetic_fixture","version":"20260807000090"},{"name":"fix_qa_cosmetic_fixture_access","version":"20260807000091"},{"name":"make_cosmetic_unlock_legacy_safe","version":"20260807000092"},{"name":"character_cosmetic_equip","version":"20260807000093"},{"name":"home_banner_master","version":"20260807000094"},{"name":"guild_cosmetic_legacy_sync","version":"20260807000095"},{"name":"equip_guild_cosmetic","version":"20260807000096"},{"name":"secure_competition_decks","version":"20260809000097"},{"name":"secure_patrol_start","version":"20260809000098"},{"name":"reload_patrol_rpc_schema","version":"20260809000099"},{"name":"secure_patrol_instant_completion","version":"20260810000100"},{"name":"secure_patrol_reward_claim","version":"20260810000101"},{"name":"ui1_review_fixture","version":"20260810000102"},{"name":"ui1_runtime_contracts","version":"20260810000103"},{"name":"onboarding_state_rpc","version":"20260812000104"},{"name":"initialize_current_player","version":"20260812000105"},{"name":"complete_authentication_hardening","version":"20260812000106"},{"name":"auth_identity_integrity","version":"20260812000107"},{"name":"m1_rpc_anon_execute_lockdown","version":"20260812000108"},{"name":"tutorial_patrol_instant_flow","version":"20260812000109"},{"name":"patrol_reward_claim","version":"20260812000110"},{"name":"patrol_npc_master_read","version":"20260812000111"},{"name":"patrol_battle_enemy_rpc","version":"20260812000112"},{"name":"tutorial_patrol_enemy_master","version":"20260812000113"},{"name":"restore_tutorial_battle_retry","version":"20260812000114"},{"name":"patrol_instant_costs","version":"20260812000115"},{"name":"patrol_ap_atomicity","version":"20260812000116"},{"name":"mandatory_patrol_npc_battles","version":"20260812000117"},{"name":"patrol_equipment_snapshot","version":"20260812000118"},{"name":"secure_character_equipment_loadout","version":"20260812000119"},{"name":"secure_character_awakening","version":"20260812000120"},{"name":"secure_provisional_progression","version":"20260812000121"},{"name":"equipment_level_battle_curve","version":"20260812000122"},{"name":"replaceable_skill_battle_master","version":"20260812000123"},{"name":"secure_character_skill_loadout","version":"20260812000124"},{"name":"normal_gacha_contract","version":"20260812000125"},{"name":"provisional_character_gacha_master","version":"20260812000126"},{"name":"secure_guild_membership_flow","version":"20260812000127"},{"name":"canonical_guild_roles","version":"20260812000128"},{"name":"secure_chat_read_state","version":"20260812000129"},{"name":"secure_bbs_read_state","version":"20260812000130"},{"name":"secure_direct_message_unread","version":"20260812000131"},{"name":"secure_login_bonus_cycle","version":"20260812000132"},{"name":"secure_mission_foundation","version":"20260812000133"},{"name":"internal_mission_progress_dispatch","version":"20260812000134"},{"name":"provisional_open_beta_missions","version":"20260812000135"},{"name":"m8_critical_economy_rpc_lockdown","version":"20260813000136"},{"name":"m8_critical_economy_rpc_lockdown_postflight","version":"20260813000137"},{"name":"m8_secure_gacha_state_tables","version":"20260813000138"},{"name":"m8_retire_unsafe_legacy_mutations","version":"20260813000139"},{"name":"remove_client_qa_fixtures","version":"20260813000140"},{"name":"schema_convergence","version":"20260813000141"},{"name":"restore_canonical_guild_role_rpc","version":"20260813000142"},{"name":"restore_canonical_guild_lifecycle_rpcs","version":"20260813000143"},{"name":"official_battle_replay_contract","version":"20260813000144"},{"name":"server_authoritative_pvp","version":"20260813000145"},{"name":"server_authoritative_raid","version":"20260813000146"},{"name":"funnel_milestones_and_guild_recommendation","version":"20260813000147"},{"name":"server_funnel_event_hooks","version":"20260813000148"},{"name":"p0_plus_funnel_enhancement","version":"20260813000149"},{"name":"feature_freeze_friend_time_contracts","version":"20260813000150"},{"name":"m9_tutorial_growth_contract","version":"20260814000151"},{"name":"m9_v0_public_display_contracts","version":"20260817000152"},{"name":"m9_activation_public_guild_and_ranking","version":"20260817000153"},{"name":"ranking_power_p0_foundation","version":"20260817000154"},{"name":"jst_midnight_daily_contract","version":"20260817000155"},{"name":"ranking_source_table_lockdown","version":"20260817000156"},{"name":"retire_direct_pvp_ranking_policy","version":"20260817000157"},{"name":"public_guild_base_snapshot","version":"20260817000158"},{"name":"gacha_launch_control_foundation","version":"20260817000159"},{"name":"gacha_launch_control_rpcs","version":"20260817000160"},{"name":"m9x_cold_start_social_foundation","version":"20260818000161"},{"name":"m9x_activity_welcome_retention","version":"20260818000162"},{"name":"m9x_tutorial_formation_runtime_fix","version":"20260818000163"},{"name":"m9x_tutorial_character_continuity","version":"20260819000164"},{"name":"m9x_tutorial_starter_skill","version":"20260819000165"},{"name":"m9x_fresh_player_zero_roster","version":"20260820000166"},{"name":"m9x_patrol_battle_idempotency","version":"20260820000167"},{"name":"gameplay_foundation_canonical","version":"20260821000168"},{"name":"canonical_character_stats_bigint","version":"20260821000169"},{"name":"canonical_battle_runtime_snapshot","version":"20260821000170"},{"name":"canonical_battle_snapshot_character_id","version":"20260821000171"},{"name":"equipment_level_curve_final","version":"20260821000172"},{"name":"mission_production_master","version":"20260821000173"},{"name":"economy_foundation_canonical","version":"20260822000174"},{"name":"character_awakening_copy_equivalent","version":"20260822000175"},{"name":"user_level_action_resource_foundation","version":"20260822000176"},{"name":"user_level_rpc_access","version":"20260822000177"},{"name":"action_resource_recovery_projection","version":"20260822000178"},{"name":"user_level_recovery_ticket_final","version":"20260822000179"},{"name":"user_level_cap_constraint","version":"20260822000180"},{"name":"quest_production_foundation","version":"20260822000181"},{"name":"quest_master_read_policies","version":"20260822000182"},{"name":"retire_legacy_quest_speedup_rpc","version":"20260822000183"},{"name":"pvp_raid_ranking_production","version":"20260822000184"},{"name":"quest_gameplay_v2","version":"20260822000185"},{"name":"guild_production_social_core","version":"20260823000186"},{"name":"guild_production_compatibility_guards","version":"20260823000187"},{"name":"operations_preopen_exposure","version":"20260823000188"},{"name":"operations_closed_rpc_grants","version":"20260823000189"},{"name":"tutorial_first_home_canonical_reconciliation","version":"20260823000190"},{"name":"remove_noncanonical_character_gacha_pool_rows","version":"20260823000191"},{"name":"tutorial_canonical_growth_before_formation","version":"20260823000192"},{"name":"tutorial_growth_milestone_authority","version":"20260823000193"},{"name":"reconcile_character_ssr_candidate_pool","version":"20260824000194"},{"name":"tutorial_durability_and_anonymous_cleanup","version":"20260825000195"},{"name":"account_switch_lifecycle","version":"20260825000196"},{"name":"pvp_opponent_pagination","version":"20260826000197"},{"name":"profile_bio_identity_default","version":"20260826000198"},{"name":"gameplay_reset_authority","version":"20260827000199"},{"name":"patrol_replay_idempotency_convergence","version":"20260827000200"},{"name":"ranking_server_projection","version":"20260827000201"},{"name":"raid_battle_reward_projection","version":"20260827000202"},{"name":"guild_activation_identity_projection","version":"20260827000203"},{"name":"phase5_activation_mission_handoff","version":"20260828000191"},{"name":"guild_human_acceptance_projection","version":"20260828000204"},{"name":"guild_attribute_submaster_authority","version":"20260828000205"},{"name":"guild_creation_level5_authority","version":"20260828000206"},{"name":"guild_join_cooldown_authority","version":"20260828000207"},{"name":"gacha_result_projection_parity","version":"20260828000208"},{"name":"account_switch_power_projection_delete_guard","version":"20260828000209"},{"name":"canonical_preapply_compatibility_preservation","version":"20260829000209"},{"name":"canonical_master_freeze_runtime","version":"20260830000210"},{"name":"canonical_raid_runtime_reward_convergence","version":"20260830000211"},{"name":"existing_patrol_replay_snapshot_convergence","version":"20260830000212"},{"name":"canonical_authority_rls_convergence","version":"20260830000213"},{"name":"canonical_quest_enemy_unique_runtime_ids","version":"20260831000214"},{"name":"anonymous_tutorial_cleanup_24h","version":"20260831000215"},{"name":"optional_account_authentication","version":"20260901000219"},{"name":"post_tutorial_loadout_guide","version":"20260901000220"},{"name":"activation_membership_mission_handoff","version":"20260902000221"},{"name":"daily_mission_authority_convergence","version":"20260902000222"},{"name":"daily_mission_authority_corrections","version":"20260902000223"},{"name":"starter_cash_authority","version":"20260902000224"},{"name":"mission_direct_grant_refresh","version":"20260902000225"},{"name":"location_movement_authority","version":"20260902000226"},{"name":"ranking_season_lifecycle","version":"20260902000227"},{"name":"ranking_season_lifecycle_revert","version":"20260902000228"},{"name":"ranking_season_lifecycle_authority","version":"20260902000229"},{"name":"ranking_lifecycle_safety_convergence","version":"20260902000230"},{"name":"daily_ranking_reward_authority","version":"20260903000234"},{"name":"preopen_gvg_preparation_missions","version":"20260903000235"},{"name":"preopen_gvg_preparation_period_extension","version":"20260903000236"},{"name":"preopen_guild_power_season_authority","version":"20260903000237"},{"name":"preopen_promotion_asset_urls","version":"20260903000238"},{"name":"public_ranking_reward_master_projection","version":"20260904000239"},{"name":"recent_social_activity_authority","version":"20260904000240"},{"name":"production_daily_activity_schema_parity","version":"20260904000242"},{"name":"kpi_measurement_fact_foundation","version":"20260904000243"},{"name":"kpi_measurement_lifecycle_hooks","version":"20260904000244"},{"name":"kpi_snapshot_foundation","version":"20260904000245"},{"name":"kpi_snapshot_refresh_rpcs","version":"20260904000246"},{"name":"kpi_measurement_security","version":"20260904000247"},{"name":"kpi_timeseries_dashboard","version":"20260905000248"},{"name":"kpi_authority_extensions","version":"20260906000249"},{"name":"acquisition_attribution_landing_authority","version":"20260907000250"},{"name":"kpi_overview_saved_results","version":"20260908041511"}]'::jsonb then raise exception 'migration history changed'; end if;
 if exists(select 1 from public.raid_room_creation_settings where enabled) or exists(select 1 from public.raid_room_battle_settings where enabled) or exists(select 1 from public.raid_room_rescue_settings where enabled) then raise exception 'Room unexpectedly enabled'; end if;
 if not exists(select 1 from public.raid_legacy_settings where singleton and enabled) then raise exception 'legacy flag changed'; end if;
 if exists(select 1 from public.raid_room_clear_reward_rules where enabled) or exists(select 1 from public.raid_room_rescue_reward_rules where enabled) then raise exception 'reward unexpectedly enabled'; end if;
 if (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'raid_room%' and relkind='r' and not relrowsecurity)>0 then raise exception 'Room RLS missing'; end if;
end $verify$;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),p.prosecdef,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%raid_room%' or p.proname='get_raid_battle_route_v1') order by p.proname;

-- END INCLUDE 04-postflight.sql
select jsonb_build_object('phase','POSTFLIGHT_PASSED_BEFORE_ROLLBACK','transaction_id',txid_current(),'at',clock_timestamp(),'new_room_tables',(select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and (relname like 'raid_room%' or relname='raid_legacy_settings')),'room_creation_enabled',(select enabled from public.raid_room_creation_settings),'room_battle_enabled',(select enabled from public.raid_room_battle_settings),'room_rescue_enabled',(select enabled from public.raid_room_rescue_settings),'legacy_enabled',(select enabled from public.raid_legacy_settings),'room_count',(select count(*) from public.raid_rooms),'room_cron_count',(select count(*) from cron.job where jobname='raid-room-expiry-minute'),'snapshot_has_metadata',position('characterId' in pg_get_functiondef('public.build_server_battle_snapshot(uuid,text[],text)'::regprocedure))>0,'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like '%raid_room%' or p.proname='get_raid_battle_route_v1'))) as audit;
notify pgrst,'reload schema';
rollback;
-- 後続工程で保存する場合のみ、レビュー後に上のROLLBACKをCOMMITへ変更。
-- 8本の履歴repairも14本の履歴偽装も行わない。独立した適用記録を残す。
