-- Pre-open guild Power season: immutable close snapshot and guild-owned cosmetic rewards.
begin;

create extension if not exists pg_cron with schema pg_catalog;

-- Preview intentionally does not require the broader 00233 migration. Keep the
-- notification/acknowledgement contract needed by 00234 and this season local
-- and convergent when the table already exists.
create table if not exists public.ranking_reward_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  period_kind text not null check (period_kind in ('DAILY','SEASON')),
  period_key text not null,
  awarded_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  unique(recipient_user_id,period_kind,period_key)
);
create index if not exists ranking_reward_notifications_pending_idx
  on public.ranking_reward_notifications(recipient_user_id,awarded_at,id)
  where acknowledged_at is null;
create unique index if not exists ranking_reward_notifications_recipient_period_uidx
  on public.ranking_reward_notifications(recipient_user_id,period_kind,period_key);

create table if not exists public.ranking_guild_power_season_master (
  season_id uuid primary key references public.ranking_seasons(id),
  event_key text not null unique,
  display_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  display_period_text text not null,
  created_at timestamptz not null default clock_timestamp(),
  check (ends_at > starts_at)
);

-- Deliberately empty until Operations explicitly registers a guild. Never infer
-- exclusions from names because that could suppress a real guild's reward.
create table if not exists public.ranking_guild_exclusions (
  guild_id uuid primary key references public.guilds(id) on delete cascade,
  reason text not null,
  registered_at timestamptz not null default clock_timestamp()
);

create table if not exists public.ranking_guild_power_season_snapshots (
  season_id uuid not null references public.ranking_seasons(id),
  guild_id uuid not null,
  guild_name text not null,
  total_power bigint not null check (total_power > 0),
  member_count integer not null check (member_count > 0),
  rank_position integer not null check (rank_position > 0),
  snapshotted_at timestamptz not null default clock_timestamp(),
  primary key (season_id,guild_id)
);

create table if not exists public.ranking_guild_power_reward_grants (
  season_id uuid not null references public.ranking_seasons(id),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  cosmetic_id text not null references public.cosmetic_master(id),
  rank_position integer not null check (rank_position > 0),
  granted_at timestamptz not null default clock_timestamp(),
  primary key (season_id,guild_id,cosmetic_id)
);

create table if not exists public.ranking_guild_power_reward_recipients (
  season_id uuid not null references public.ranking_seasons(id),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  captured_at timestamptz not null default clock_timestamp(),
  primary key (season_id,guild_id,recipient_user_id)
);

create table if not exists public.ranking_guild_power_finalization_audits (
  season_id uuid primary key references public.ranking_seasons(id),
  ranked_guild_count integer not null,
  reward_grant_count integer not null,
  completed_at timestamptz not null default clock_timestamp()
);

create or replace function public.reject_guild_power_snapshot_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if exists(
      select 1 from public.ranking_guild_power_finalization_audits audit
      where audit.season_id=new.season_id
    ) then
      raise exception 'final guild Power snapshot is immutable' using errcode='55000';
    end if;
    return new;
  end if;
  raise exception 'final guild Power snapshot is immutable' using errcode='55000';
end;
$$;
drop trigger if exists ranking_guild_power_snapshot_immutable
  on public.ranking_guild_power_season_snapshots;
create trigger ranking_guild_power_snapshot_immutable
before insert or update or delete on public.ranking_guild_power_season_snapshots
for each row execute function public.reject_guild_power_snapshot_mutation();

insert into public.cosmetic_master(
  id,owner_scope,slot,rarity,display_name,asset_key,source_type,source_reference,metadata,active
) values
  ('guild_preopen_2026_participation','GUILD','GUILD_DECORATION','EVENT',
   'プレオープン参加記念ギルド装飾','guild_preopen_2026_participation','RANKING','PREOPEN_GUILD_POWER_2026',
   '{"effect":"NONE","competitive_advantage":false,"asset_status":"PENDING_FINAL_ASSET"}'::jsonb,true),
  ('guild_preopen_2026_rank_1','GUILD','GUILD_DECORATION','EVENT',
   'プレオープン第1位限定ギルド装飾','guild_preopen_2026_rank_1','RANKING','PREOPEN_GUILD_POWER_2026',
   '{"effect":"NONE","competitive_advantage":false,"asset_status":"PENDING_FINAL_ASSET"}'::jsonb,true),
  ('guild_preopen_2026_rank_2','GUILD','GUILD_DECORATION','EVENT',
   'プレオープン第2位限定ギルド装飾','guild_preopen_2026_rank_2','RANKING','PREOPEN_GUILD_POWER_2026',
   '{"effect":"NONE","competitive_advantage":false,"asset_status":"PENDING_FINAL_ASSET"}'::jsonb,true),
  ('guild_preopen_2026_rank_3','GUILD','GUILD_DECORATION','EVENT',
   'プレオープン第3位限定ギルド装飾','guild_preopen_2026_rank_3','RANKING','PREOPEN_GUILD_POWER_2026',
   '{"effect":"NONE","competitive_advantage":false,"asset_status":"PENDING_FINAL_ASSET"}'::jsonb,true)
on conflict(id) do update set
  owner_scope=excluded.owner_scope,slot=excluded.slot,rarity=excluded.rarity,
  display_name=excluded.display_name,asset_key=excluded.asset_key,
  source_type=excluded.source_type,source_reference=excluded.source_reference,
  metadata=excluded.metadata,active=excluded.active;

insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
values(
  'GUILD_POWER',
  '2026-09-03 15:00:00+00'::timestamptz,'2026-09-08 15:00:00+00'::timestamptz,
  'PREPARING'
)
on conflict(ranking_type,starts_at) do update set
  ends_at=excluded.ends_at,
  status=case when public.ranking_seasons.status='CLOSED' then 'CLOSED' else 'PREPARING' end,
  updated_at=clock_timestamp();

insert into public.ranking_guild_power_season_master(
  season_id,event_key,display_name,starts_at,ends_at,display_period_text
) select season.id,'PREOPEN_GUILD_POWER_2026','プレオープン限定 ギルド総合力ランキング',
  season.starts_at,season.ends_at,'9/4 0:00〜9/8 23:59'
from public.ranking_seasons season
where season.ranking_type='GUILD_POWER'
  and season.starts_at='2026-09-03 15:00:00+00'::timestamptz
on conflict(event_key) do update set
  season_id=excluded.season_id,display_name=excluded.display_name,
  starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  display_period_text=excluded.display_period_text;

create or replace function public.activate_preopen_guild_power_season()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_job_id bigint;
begin
  select season.* into strict v_season
  from public.ranking_seasons season
  join public.ranking_guild_power_season_master master on master.season_id=season.id
  where master.event_key='PREOPEN_GUILD_POWER_2026'
  for update of season;
  perform pg_advisory_xact_lock(hashtextextended('PREOPEN_GUILD_POWER_2026',0));

  if v_season.status='CLOSED' then
    select jobid into v_job_id from cron.job
    where jobname='preopen-guild-power-activate-20260904-jst';
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    return jsonb_build_object('season_id',v_season.id,'status','ALREADY_CLOSED');
  end if;
  if clock_timestamp()<v_season.starts_at then
    return jsonb_build_object('season_id',v_season.id,'status','NOT_STARTED');
  end if;

  -- Only the start-boundary authority may supersede the generic active season.
  update public.ranking_seasons
  set status='CLOSED',updated_at=clock_timestamp()
  where ranking_type='GUILD_POWER' and status='ACTIVE' and id<>v_season.id;
  update public.ranking_seasons
  set status=case when clock_timestamp()<ends_at then 'ACTIVE' else 'FINALIZING' end,
      updated_at=clock_timestamp()
  where id=v_season.id;

  select jobid into v_job_id from cron.job
  where jobname='preopen-guild-power-activate-20260904-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  return jsonb_build_object(
    'season_id',v_season.id,
    'status',case when clock_timestamp()<v_season.ends_at then 'ACTIVE' else 'FINALIZING' end
  );
end;
$$;

do $$
begin
  if clock_timestamp()>='2026-09-03 15:00:00+00'::timestamptz then
    perform public.activate_preopen_guild_power_season();
  end if;
end;
$$;

create or replace function public.finalize_preopen_guild_power_season()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_ranked_count integer;
  v_grant_count integer;
  v_job_id bigint;
begin
  -- All paths lock the season row before the event advisory lock. This avoids
  -- inversion with a transaction that edits season state then Power inputs.
  select season.* into strict v_season
  from public.ranking_seasons season
  join public.ranking_guild_power_season_master master on master.season_id=season.id
  where master.event_key='PREOPEN_GUILD_POWER_2026'
  for update of season;
  if v_season.status='PREPARING' and clock_timestamp()>=v_season.starts_at then
    perform public.activate_preopen_guild_power_season();
    select * into strict v_season from public.ranking_seasons where id=v_season.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('PREOPEN_GUILD_POWER_2026',0));

  if clock_timestamp()<v_season.ends_at then
    raise exception 'pre-open guild Power season is not closed' using errcode='22023';
  end if;

  if exists(select 1 from public.ranking_guild_power_finalization_audits audit
            where audit.season_id=v_season.id) then
    select jobid into v_job_id from cron.job
    where jobname='preopen-guild-power-finalize-20260909-jst';
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    return (select jsonb_build_object(
      'season_id',audit.season_id,'status','ALREADY_FINALIZED',
      'ranked_guild_count',audit.ranked_guild_count,
      'reward_grant_count',audit.reward_grant_count)
      from public.ranking_guild_power_finalization_audits audit
      where audit.season_id=v_season.id);
  end if;

  update public.ranking_seasons set status='FINALIZING',updated_at=clock_timestamp()
  where id=v_season.id and status<>'CLOSED';

  insert into public.ranking_guild_power_season_snapshots(
    season_id,guild_id,guild_name,total_power,member_count,rank_position
  )
  with totals as (
    select guild.id guild_id,guild.name guild_name,
      sum(public.calculate_user_total_power(member.user_id))::bigint total_power,
      count(*)::integer member_count
    from public.guilds guild
    join public.guild_members member on member.guild_id=guild.id
    where not exists(
      select 1 from public.ranking_guild_exclusions exclusion where exclusion.guild_id=guild.id
    )
    group by guild.id,guild.name
    having sum(public.calculate_user_total_power(member.user_id))>0
  ), ranked as (
    select totals.*,rank() over(order by totals.total_power desc)::integer rank_position
    from totals
  )
  select v_season.id,ranked.guild_id,ranked.guild_name,ranked.total_power,
    ranked.member_count,ranked.rank_position
  from ranked
  on conflict(season_id,guild_id) do nothing;

  insert into public.ranking_guild_power_reward_grants(
    season_id,guild_id,cosmetic_id,rank_position
  )
  select snapshot.season_id,snapshot.guild_id,reward.cosmetic_id,snapshot.rank_position
  from public.ranking_guild_power_season_snapshots snapshot
  cross join lateral (
    values ('guild_preopen_2026_participation'::text),
      (case snapshot.rank_position
        when 1 then 'guild_preopen_2026_rank_1'
        when 2 then 'guild_preopen_2026_rank_2'
        when 3 then 'guild_preopen_2026_rank_3'
        else null end)
  ) reward(cosmetic_id)
  where snapshot.season_id=v_season.id and reward.cosmetic_id is not null
  on conflict(season_id,guild_id,cosmetic_id) do nothing;

  insert into public.guild_cosmetics(
    guild_id,cosmetic_id,source_type,source_reference
  )
  select grant_row.guild_id,grant_row.cosmetic_id,'RANKING',
    concat('PREOPEN_GUILD_POWER_2026:',grant_row.season_id)
  from public.ranking_guild_power_reward_grants grant_row
  where grant_row.season_id=v_season.id
  on conflict(guild_id,cosmetic_id) do nothing;

  insert into public.ranking_guild_power_reward_recipients(
    season_id,guild_id,recipient_user_id
  )
  select snapshot.season_id,snapshot.guild_id,member.user_id
  from public.ranking_guild_power_season_snapshots snapshot
  join public.guild_members member on member.guild_id=snapshot.guild_id
  where snapshot.season_id=v_season.id
  on conflict(season_id,guild_id,recipient_user_id) do nothing;

  insert into public.ranking_reward_notifications(
    recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
  )
  select recipient.recipient_user_id,'SEASON',recipient.season_id::text,clock_timestamp(),null
  from public.ranking_guild_power_reward_recipients recipient
  where recipient.season_id=v_season.id
  on conflict(recipient_user_id,period_kind,period_key) do update set
    awarded_at=excluded.awarded_at,acknowledged_at=null;

  select count(*) into v_ranked_count
  from public.ranking_guild_power_season_snapshots where season_id=v_season.id;
  select count(*) into v_grant_count
  from public.ranking_guild_power_reward_grants where season_id=v_season.id;

  update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp()
  where id=v_season.id;
  insert into public.ranking_guild_power_finalization_audits(
    season_id,ranked_guild_count,reward_grant_count
  ) values(v_season.id,v_ranked_count,v_grant_count);

  select jobid into v_job_id from cron.job
  where jobname='preopen-guild-power-finalize-20260909-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  return jsonb_build_object(
    'season_id',v_season.id,'status','FINALIZED',
    'ranked_guild_count',v_ranked_count,'reward_grant_count',v_grant_count
  );
end;
$$;

do $$
begin
  if clock_timestamp()>='2026-09-08 15:00:00+00'::timestamptz then
    perform public.finalize_preopen_guild_power_season();
  end if;
end;
$$;

-- A mutation after the exact close boundary first freezes the pre-mutation
-- state. This closes the cron-delay gap without changing other rank types.
create or replace function public.guard_preopen_guild_power_cutoff()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_season_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status text;
  v_finalized boolean;
begin
  select season.id,season.starts_at,season.ends_at,season.status,
    exists(select 1 from public.ranking_guild_power_finalization_audits audit
           where audit.season_id=season.id)
  into strict v_season_id,v_starts_at,v_ends_at,v_status,v_finalized
  from public.ranking_guild_power_season_master master
  join public.ranking_seasons season on season.id=master.season_id
  where master.event_key='PREOPEN_GUILD_POWER_2026';

  if clock_timestamp()<v_starts_at then
    return null;
  end if;
  if v_status='PREPARING' then
    perform public.activate_preopen_guild_power_season();
  end if;
  if v_finalized then
    return null;
  elsif clock_timestamp()>=v_ends_at then
    perform public.finalize_preopen_guild_power_season();
  else
    -- Pre-cutoff work is admitted by season-row/share then advisory/share.
    -- The finalizer uses the same order with exclusive modes and waits for it.
    perform 1 from public.ranking_seasons where id=v_season_id for share;
    -- A transaction admitted before cutoff holds a shared lock through commit.
    -- The finalizer's exclusive lock therefore waits for all admitted writes.
    perform pg_advisory_xact_lock_shared(hashtextextended('PREOPEN_GUILD_POWER_2026',0));
  end if;
  return null;
end;
$$;

drop trigger if exists guild_members_preopen_power_cutoff_guard on public.guild_members;
create trigger guild_members_preopen_power_cutoff_guard before insert or update or delete on public.guild_members
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists guilds_preopen_power_cutoff_guard on public.guilds;
create trigger guilds_preopen_power_cutoff_guard before insert or update or delete on public.guilds
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists guild_exclusions_preopen_power_cutoff_guard on public.ranking_guild_exclusions;
create trigger guild_exclusions_preopen_power_cutoff_guard before insert or update or delete on public.ranking_guild_exclusions
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists user_main_formations_preopen_power_cutoff_guard on public.user_main_formations;
create trigger user_main_formations_preopen_power_cutoff_guard before insert or update or delete on public.user_main_formations
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists user_characters_preopen_power_cutoff_guard on public.user_characters;
create trigger user_characters_preopen_power_cutoff_guard before insert or update or delete on public.user_characters
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists user_equipments_preopen_power_cutoff_guard on public.user_equipments;
create trigger user_equipments_preopen_power_cutoff_guard before insert or update or delete on public.user_equipments
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists character_growth_preopen_power_cutoff_guard on public.character_growth_patterns;
create trigger character_growth_preopen_power_cutoff_guard before insert or update or delete on public.character_growth_patterns
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists character_awakening_preopen_power_cutoff_guard on public.character_awakening_master;
create trigger character_awakening_preopen_power_cutoff_guard before insert or update or delete on public.character_awakening_master
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists character_battle_preopen_power_cutoff_guard on public.character_battle_master;
create trigger character_battle_preopen_power_cutoff_guard before insert or update or delete on public.character_battle_master
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists equipment_battle_preopen_power_cutoff_guard on public.equipment_battle_master;
create trigger equipment_battle_preopen_power_cutoff_guard before insert or update or delete on public.equipment_battle_master
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists canonical_character_preopen_power_cutoff_guard on public.canonical_character_master;
create trigger canonical_character_preopen_power_cutoff_guard before insert or update or delete on public.canonical_character_master
for each statement execute function public.guard_preopen_guild_power_cutoff();
drop trigger if exists canonical_equipment_preopen_power_cutoff_guard on public.canonical_equipment_master;
create trigger canonical_equipment_preopen_power_cutoff_guard before insert or update or delete on public.canonical_equipment_master
for each statement execute function public.guard_preopen_guild_power_cutoff();

create or replace function public.get_preopen_guild_power_ranking(
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_season public.ranking_seasons%rowtype;
  v_master public.ranking_guild_power_season_master%rowtype;
  v_my_guild_id uuid;
  v_rows jsonb:='[]'::jsonb;
  v_self jsonb;
  v_updated_at timestamptz;
  v_is_final boolean;
  v_is_current_context boolean;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then
    raise exception 'invalid pagination' using errcode='22023';
  end if;
  select master.* into strict v_master from public.ranking_guild_power_season_master master
  where master.event_key='PREOPEN_GUILD_POWER_2026';
  select * into strict v_season from public.ranking_seasons where id=v_master.season_id;
  if clock_timestamp()>=v_season.starts_at and v_season.status='PREPARING' then
    perform public.activate_preopen_guild_power_season();
    select * into strict v_season from public.ranking_seasons where id=v_master.season_id;
  end if;
  if clock_timestamp()>=v_season.ends_at and v_season.status<>'CLOSED' then
    perform public.finalize_preopen_guild_power_season();
    select * into strict v_season from public.ranking_seasons where id=v_master.season_id;
  end if;
  select member.guild_id into v_my_guild_id from public.guild_members member
  where member.user_id=v_uid;
  v_is_final:=v_season.status='CLOSED';
  v_is_current_context:=clock_timestamp()>=v_season.starts_at and not exists(
    select 1 from public.ranking_seasons newer
    where newer.ranking_type=v_season.ranking_type
      and newer.starts_at>v_season.starts_at
  );

  if v_is_final then
    select coalesce(jsonb_agg(to_jsonb(page) order by page.rank_position,page.guild_id),'[]'::jsonb)
    into v_rows from (
      select snapshot.guild_id,snapshot.guild_name name,snapshot.total_power current_power,
        snapshot.total_power score,snapshot.member_count,snapshot.rank_position,snapshot.snapshotted_at updated_at
      from public.ranking_guild_power_season_snapshots snapshot
      where snapshot.season_id=v_season.id
      order by snapshot.rank_position,snapshot.guild_id limit p_limit offset p_offset
    ) page;
    select to_jsonb(self_row) into v_self from (
      select snapshot.guild_id,snapshot.guild_name name,snapshot.total_power current_power,
        snapshot.total_power score,snapshot.member_count,snapshot.rank_position,snapshot.snapshotted_at updated_at
      from public.ranking_guild_power_season_snapshots snapshot
      where snapshot.season_id=v_season.id and snapshot.guild_id=v_my_guild_id
    ) self_row;
    select max(snapshot.snapshotted_at) into v_updated_at
    from public.ranking_guild_power_season_snapshots snapshot where snapshot.season_id=v_season.id;
  elsif clock_timestamp()>=v_season.starts_at and clock_timestamp()<v_season.ends_at then
    with totals as (
      select guild.id guild_id,guild.name,
        sum(public.calculate_user_total_power(member.user_id))::bigint current_power,
        count(*)::integer member_count
      from public.guilds guild join public.guild_members member on member.guild_id=guild.id
      where not exists(select 1 from public.ranking_guild_exclusions exclusion where exclusion.guild_id=guild.id)
      group by guild.id,guild.name
      having sum(public.calculate_user_total_power(member.user_id))>0
    ), ranked as (
      select totals.*,totals.current_power score,
        rank() over(order by totals.current_power desc)::integer rank_position,
        row_number() over(order by totals.current_power desc,totals.guild_id)::integer row_position
      from totals
    )
    select
      coalesce(
        jsonb_agg(to_jsonb(ranked)-'row_position' order by ranked.rank_position,ranked.guild_id)
          filter(where ranked.row_position>p_offset and ranked.row_position<=p_offset+p_limit),
        '[]'::jsonb
      ),
      (jsonb_agg(to_jsonb(ranked)-'row_position')
        filter(where ranked.guild_id=v_my_guild_id))->0
    into v_rows,v_self
    from ranked;
    v_updated_at:=clock_timestamp();
  else
    -- Before opening or during the short server-only finalization interval.
    v_rows:='[]'::jsonb;
    v_self:=null;
    v_updated_at:=v_season.updated_at;
  end if;

  return jsonb_build_object(
    'season_id',v_season.id,'event_key',v_master.event_key,
    'display_name',v_master.display_name,'display_period_text',v_master.display_period_text,
    'starts_at',v_season.starts_at,'ends_at',v_season.ends_at,'status',v_season.status,
    'is_finalized',v_is_final,'is_current_context',v_is_current_context,
    'server_updated_at',v_updated_at,
    'rows',v_rows,'self_guild',v_self
  );
end;
$$;

create or replace function public.get_my_pending_ranking_reward_notification()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_notification_ids jsonb; v_grants jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_agg(notification.id order by notification.awarded_at,notification.id)
  into v_notification_ids from public.ranking_reward_notifications notification
  where notification.recipient_user_id=v_uid and notification.acknowledged_at is null;
  if v_notification_ids is null then return null; end if;
  with grant_rows as (
    select notification.awarded_at notification_at,notification.period_kind,notification.period_key,
      season.ranking_category,season.rank_position,season.resolved_item_id item_id,
      season.quantity,season.granted_at,season.reward_key ordering_key,
      'ITEM'::text reward_kind,null::text display_name
    from public.ranking_reward_notifications notification
    join public.ranking_season_reward_grants season
      on notification.period_kind='SEASON' and season.season_id::text=notification.period_key
      and season.recipient_user_id=notification.recipient_user_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      award.ranking_type,award.rank_position,item.item_id,item.quantity,item.granted_at,item.item_id,
      'ITEM'::text,null::text
    from public.ranking_reward_notifications notification
    join public.ranking_daily_reward_awards award
      on notification.period_kind='DAILY' and award.ranking_day_key::text=notification.period_key
      and award.recipient_user_id=notification.recipient_user_id
    join public.ranking_daily_reward_item_grants item on item.award_id=award.id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      'GUILD_POWER',grant_row.rank_position,grant_row.cosmetic_id,1,
      grant_row.granted_at,grant_row.cosmetic_id,'GUILD_COSMETIC',cosmetic.display_name
    from public.ranking_reward_notifications notification
    join public.ranking_guild_power_reward_recipients recipient
      on notification.period_kind='SEASON' and recipient.season_id::text=notification.period_key
      and recipient.recipient_user_id=notification.recipient_user_id
    join public.ranking_guild_power_reward_grants grant_row
      on grant_row.season_id=recipient.season_id and grant_row.guild_id=recipient.guild_id
    join public.cosmetic_master cosmetic on cosmetic.id=grant_row.cosmetic_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_kind',grant_row.period_kind,'period_key',grant_row.period_key,
    'ranking_category',grant_row.ranking_category,'rank_position',grant_row.rank_position,
    'item_id',grant_row.item_id,'quantity',grant_row.quantity,'granted_at',grant_row.granted_at,
    'reward_kind',grant_row.reward_kind,'display_name',grant_row.display_name
  ) order by grant_row.notification_at,grant_row.ranking_category,
    grant_row.rank_position,grant_row.ordering_key),'[]'::jsonb)
  into v_grants from grant_rows grant_row;
  return jsonb_build_object('notification_ids',v_notification_ids,'grants',v_grants);
end;
$$;

create or replace function public.acknowledge_ranking_reward_notifications(
  p_notification_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid();
  v_acknowledged integer:=0;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if coalesce(cardinality(p_notification_ids),0)=0 then
    return jsonb_build_object('acknowledged',0);
  end if;
  update public.ranking_reward_notifications notification
  set acknowledged_at=clock_timestamp()
  where notification.recipient_user_id=v_uid
    and notification.id=any(p_notification_ids)
    and notification.acknowledged_at is null;
  get diagnostics v_acknowledged=row_count;
  return jsonb_build_object('acknowledged',v_acknowledged);
end;
$$;

alter table public.ranking_guild_power_season_master enable row level security;
alter table public.ranking_guild_exclusions enable row level security;
alter table public.ranking_guild_power_season_snapshots enable row level security;
alter table public.ranking_guild_power_reward_grants enable row level security;
alter table public.ranking_guild_power_reward_recipients enable row level security;
alter table public.ranking_guild_power_finalization_audits enable row level security;
alter table public.ranking_reward_notifications enable row level security;

revoke all on public.ranking_guild_power_season_master,
  public.ranking_guild_exclusions,public.ranking_guild_power_season_snapshots,
  public.ranking_guild_power_reward_grants,public.ranking_guild_power_reward_recipients,
  public.ranking_guild_power_finalization_audits
  from public,anon,authenticated;
grant all on public.ranking_guild_power_season_master,
  public.ranking_guild_exclusions,public.ranking_guild_power_season_snapshots,
  public.ranking_guild_power_reward_grants,public.ranking_guild_power_reward_recipients,
  public.ranking_guild_power_finalization_audits
  to service_role;
revoke all on public.ranking_reward_notifications from public,anon,authenticated;
grant all on public.ranking_reward_notifications to service_role;

revoke all on function public.finalize_preopen_guild_power_season() from public,anon,authenticated;
grant execute on function public.finalize_preopen_guild_power_season() to service_role;
revoke all on function public.activate_preopen_guild_power_season() from public,anon,authenticated;
grant execute on function public.activate_preopen_guild_power_season() to service_role;
revoke all on function public.guard_preopen_guild_power_cutoff() from public,anon,authenticated;
grant execute on function public.guard_preopen_guild_power_cutoff() to service_role;
revoke all on function public.reject_guild_power_snapshot_mutation() from public,anon,authenticated;
grant execute on function public.reject_guild_power_snapshot_mutation() to service_role;
revoke all on function public.get_preopen_guild_power_ranking(integer,integer) from public,anon;
grant execute on function public.get_preopen_guild_power_ranking(integer,integer) to authenticated,service_role;
revoke all on function public.get_my_pending_ranking_reward_notification(),
  public.acknowledge_ranking_reward_notifications(uuid[]) from public,anon,authenticated;
grant execute on function public.get_my_pending_ranking_reward_notification(),
  public.acknowledge_ranking_reward_notifications(uuid[]) to authenticated,service_role;

do $$
declare v_job_id bigint; v_activation_job_id bigint;
begin
  select jobid into v_activation_job_id from cron.job
  where jobname='preopen-guild-power-activate-20260904-jst';
  if v_activation_job_id is not null then perform cron.unschedule(v_activation_job_id); end if;
  if clock_timestamp()<'2026-09-03 15:00:00+00'::timestamptz then
    perform cron.schedule(
      'preopen-guild-power-activate-20260904-jst','* 15 3 9 *',
      $job$select public.activate_preopen_guild_power_season();$job$
    );
  end if;
  select jobid into v_job_id from cron.job where jobname='preopen-guild-power-finalize-20260909-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  if clock_timestamp()<'2026-09-08 15:00:00+00'::timestamptz then
    perform cron.schedule(
      'preopen-guild-power-finalize-20260909-jst','* 15 8 9 *',
      $job$select public.finalize_preopen_guild_power_season();$job$
    );
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;
