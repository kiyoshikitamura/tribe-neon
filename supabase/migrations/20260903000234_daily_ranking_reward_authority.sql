-- Daily Ranking rewards frozen by
-- TRIBE_NEON_Production_Master_Audit_Book_M1-M8_20260903_PreOpenMission_DailyRanking_FIX.xlsx
-- (M7_DailyRanking_Rewards). Rewards are granted directly to user_items.
begin;

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.canonical_daily_ranking_reward_master (
  version text not null,
  ranking_type text not null check (ranking_type in ('POWER','GUILD_POWER','PVP','RAID_PERSONAL')),
  rank_min integer not null check (rank_min between 1 and 100),
  rank_max integer not null check (rank_max between rank_min and 100),
  item_id text not null,
  quantity integer not null check (quantity > 0),
  is_production_enabled boolean not null default true,
  primary key (version,ranking_type,rank_min,rank_max,item_id)
);

insert into public.canonical_daily_ranking_reward_master(
  version,ranking_type,rank_min,rank_max,item_id,quantity,is_production_enabled
)
select '2026-09-03',category.ranking_type,band.rank_min,band.rank_max,reward.item_id,band.quantity,true
from unnest(array['POWER','GUILD_POWER','PVP','RAID_PERSONAL']) as category(ranking_type)
cross join (values
  (1,1,'L'::text,2),(2,3,'L',1),(4,10,'M',3),(11,30,'M',2),(31,100,'M',1)
) band(rank_min,rank_max,size,quantity)
cross join lateral (values
  ('CHAR_EXP_'||band.size),('EQUIP_EXP_'||band.size)
) reward(item_id)
on conflict(version,ranking_type,rank_min,rank_max,item_id) do update set
  quantity=excluded.quantity,is_production_enabled=excluded.is_production_enabled;

update public.canonical_item_master
set source_categories=source_categories||'["RANKING"]'::jsonb
where version='2026-08-22'
  and item_id in ('CHAR_EXP_M','CHAR_EXP_L','EQUIP_EXP_M','EQUIP_EXP_L')
  and not source_categories?'RANKING';

insert into public.canonical_reward_supply_sources(version,source,status,authority,notes)
values('2026-09-03','RANKING','FROZEN','M7_DailyRanking_Rewards',
  'Daily: POWER/GUILD_POWER/PVP/RAID_PERSONAL; Character and Equipment EXP only')
on conflict(version,source) do update set status=excluded.status,
  authority=excluded.authority,notes=excluded.notes;

insert into public.canonical_master_freeze_versions(domain,version,payload,is_production_enabled)
select 'RANKING_REWARD','2026-09-03',
  master.payload||jsonb_build_object(
    'version','2026-09-03',
    'dailyAuthority','M7_DailyRanking_Rewards',
    'dailyDelivery','DIRECT_USER_ITEMS',
    'dailyExactlyOnce','ranking_day_key + ranking_type + user_id'
  ),true
from public.canonical_master_freeze_versions master
where master.domain='RANKING_REWARD' and master.version='2026-08-30'
on conflict(domain,version) do update set
  payload=excluded.payload,is_production_enabled=true;

update public.canonical_master_freeze_versions
set is_production_enabled=false
where domain='RANKING_REWARD' and version<>'2026-09-03';

create table if not exists public.ranking_daily_participation (
  ranking_day_key date not null,
  ranking_type text not null check (ranking_type in ('PVP','RAID_PERSONAL')),
  user_id uuid not null references public.users(id) on delete cascade,
  finalized_count integer not null default 1 check (finalized_count > 0),
  first_finalized_at timestamptz not null,
  last_finalized_at timestamptz not null,
  primary key (ranking_day_key,ranking_type,user_id)
);

-- Immutable-per-day activity facts used by delayed/retried finalization. The
-- row is updated only while that JST day is open, so a later login, formation
-- change, or guild move cannot rewrite a closed day's ranking inputs.
create table if not exists public.ranking_daily_activity_snapshots (
  ranking_day_key date not null,
  user_id uuid not null references public.users(id) on delete cascade,
  total_power bigint not null check (total_power >= 0),
  guild_id uuid null,
  first_active_at timestamptz not null,
  last_active_at timestamptz not null,
  primary key (ranking_day_key,user_id)
);

create table if not exists public.ranking_daily_entity_snapshots (
  ranking_day_key date not null,
  ranking_type text not null check (ranking_type in ('POWER','GUILD_POWER','PVP','RAID_PERSONAL')),
  ranked_entity_id uuid not null,
  score bigint not null check (score >= 0),
  rank_position integer not null check (rank_position between 1 and 100),
  snapshotted_at timestamptz not null default clock_timestamp(),
  primary key (ranking_day_key,ranking_type,ranked_entity_id),
  unique (ranking_day_key,ranking_type,rank_position)
);

create table if not exists public.ranking_daily_recipient_snapshots (
  ranking_day_key date not null,
  ranking_type text not null check (ranking_type in ('POWER','GUILD_POWER','PVP','RAID_PERSONAL')),
  ranked_entity_id uuid not null,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  rank_position integer not null check (rank_position between 1 and 100),
  score bigint not null check (score >= 0),
  primary key (ranking_day_key,ranking_type,recipient_user_id),
  foreign key (ranking_day_key,ranking_type,ranked_entity_id)
    references public.ranking_daily_entity_snapshots(ranking_day_key,ranking_type,ranked_entity_id)
);

create table if not exists public.ranking_daily_reward_awards (
  id uuid primary key default gen_random_uuid(),
  ranking_day_key date not null,
  ranking_type text not null check (ranking_type in ('POWER','GUILD_POWER','PVP','RAID_PERSONAL')),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  ranked_entity_id uuid not null,
  rank_position integer not null check (rank_position between 1 and 100),
  score bigint not null check (score >= 0),
  granted_at timestamptz not null default clock_timestamp(),
  unique (ranking_day_key,ranking_type,recipient_user_id)
);

create table if not exists public.ranking_daily_reward_item_grants (
  award_id uuid not null references public.ranking_daily_reward_awards(id) on delete cascade,
  item_id text not null,
  quantity integer not null check (quantity > 0),
  granted_at timestamptz not null default clock_timestamp(),
  primary key (award_id,item_id)
);

create table if not exists public.ranking_daily_finalization_audits (
  ranking_day_key date primary key,
  power_recipients integer not null,
  guild_recipients integer not null,
  pvp_recipients integer not null,
  raid_recipients integer not null,
  completed_at timestamptz not null default clock_timestamp()
);

alter table public.canonical_daily_ranking_reward_master enable row level security;
alter table public.ranking_daily_participation enable row level security;
alter table public.ranking_daily_activity_snapshots enable row level security;
alter table public.ranking_daily_entity_snapshots enable row level security;
alter table public.ranking_daily_recipient_snapshots enable row level security;
alter table public.ranking_daily_reward_awards enable row level security;
alter table public.ranking_daily_reward_item_grants enable row level security;
alter table public.ranking_daily_finalization_audits enable row level security;

revoke all on public.canonical_daily_ranking_reward_master,
  public.ranking_daily_participation,public.ranking_daily_activity_snapshots,
  public.ranking_daily_entity_snapshots,
  public.ranking_daily_recipient_snapshots,public.ranking_daily_reward_awards,
  public.ranking_daily_reward_item_grants,public.ranking_daily_finalization_audits
  from public,anon,authenticated;
grant all on public.canonical_daily_ranking_reward_master,
  public.ranking_daily_participation,public.ranking_daily_activity_snapshots,
  public.ranking_daily_entity_snapshots,
  public.ranking_daily_recipient_snapshots,public.ranking_daily_reward_awards,
  public.ranking_daily_reward_item_grants,public.ranking_daily_finalization_audits
  to service_role;

create or replace function public.canonical_ranking_reward_payload()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_payload jsonb; v_daily jsonb;
begin
  select master.payload into v_payload
  from public.canonical_master_freeze_versions master
  where master.domain='RANKING_REWARD' and master.version='2026-09-03'
    and master.is_production_enabled;
  if v_payload is null then
    raise exception 'active canonical ranking reward master is missing' using errcode='P0002';
  end if;
  select jsonb_object_agg(grouped.ranking_type,grouped.rewards order by grouped.ranking_type)
  into v_daily
  from (
    select master.ranking_type,
      jsonb_agg(jsonb_build_array(master.rank_min,master.rank_max,master.item_id,master.quantity)
        order by master.rank_min,master.item_id) rewards
    from public.canonical_daily_ranking_reward_master master
    where master.version='2026-09-03' and master.is_production_enabled
    group by master.ranking_type
  ) grouped;
  return v_payload||jsonb_build_object('daily',coalesce(v_daily,'{}'::jsonb));
end;
$$;

create or replace function public.capture_daily_ranking_participation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_day date;
begin
  if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
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

drop trigger if exists daily_ranking_participation_finalized on public.battle_replay_sessions;
create trigger daily_ranking_participation_finalized
after update of finalization_status on public.battle_replay_sessions
for each row execute function public.capture_daily_ranking_participation();

-- Extend the canonical activity heartbeat with a closed-day-safe snapshot.
create or replace function public.sync_active_users()
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_now timestamptz:=clock_timestamp();
  v_day date; v_count integer; v_power bigint; v_guild_id uuid;
begin
  if v_uid is null then raise exception 'not authorized' using errcode='42501'; end if;
  v_day:=(v_now at time zone 'Asia/Tokyo')::date;
  update public.users set last_active_at=v_now where id=v_uid;
  if not found then
    select count(*) into v_count from public.users where last_active_at>=v_now-interval '5 minutes';
    return v_count;
  end if;
  v_power:=public.calculate_user_total_power(v_uid);
  select member.guild_id into v_guild_id
  from public.guild_members member where member.user_id=v_uid limit 1;
  insert into public.ranking_daily_activity_snapshots(
    ranking_day_key,user_id,total_power,guild_id,first_active_at,last_active_at
  ) values(v_day,v_uid,v_power,v_guild_id,v_now,v_now)
  on conflict(ranking_day_key,user_id) do update set
    total_power=excluded.total_power,guild_id=excluded.guild_id,
    first_active_at=least(public.ranking_daily_activity_snapshots.first_active_at,excluded.first_active_at),
    last_active_at=greatest(public.ranking_daily_activity_snapshots.last_active_at,excluded.last_active_at);
  select count(*) into v_count from public.users where last_active_at>=v_now-interval '5 minutes';
  return v_count;
end;
$$;

-- Keep the open day's score current whenever the canonical power projection is
-- refreshed. This never creates activity eligibility by itself.
create or replace function public.refresh_user_power_projection(p_user_id uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_power bigint; v_day date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
  if p_user_id is null then return 0; end if;
  if not exists(select 1 from public.users where id=p_user_id) then
    delete from public.user_power_rankings where user_id=p_user_id;
    return 0;
  end if;
  v_power:=public.calculate_user_total_power(p_user_id);
  insert into public.user_power_rankings(user_id,total_power,updated_at)
  values(p_user_id,least(v_power,2147483647)::integer,clock_timestamp())
  on conflict(user_id) do update set total_power=excluded.total_power,updated_at=excluded.updated_at;
  update public.ranking_daily_activity_snapshots set total_power=v_power,last_active_at=clock_timestamp()
  where ranking_day_key=v_day and user_id=p_user_id;
  return v_power;
end;
$$;

-- Guild membership at the cutoff is frozen into the open day's existing
-- activity row, without turning an inactive member into an eligible member.
create or replace function public.capture_daily_ranking_guild_membership()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_day date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
  if tg_op='DELETE' then
    update public.ranking_daily_activity_snapshots set guild_id=null
    where ranking_day_key=v_day and user_id=old.user_id;
    return old;
  end if;
  if tg_op='UPDATE' and old.user_id is distinct from new.user_id then
    update public.ranking_daily_activity_snapshots set guild_id=null
    where ranking_day_key=v_day and user_id=old.user_id;
  end if;
  update public.ranking_daily_activity_snapshots set guild_id=new.guild_id
  where ranking_day_key=v_day and user_id=new.user_id;
  return new;
end;
$$;

drop trigger if exists daily_ranking_guild_membership_snapshot on public.guild_members;
create trigger daily_ranking_guild_membership_snapshot
after insert or update of guild_id,user_id or delete on public.guild_members
for each row execute function public.capture_daily_ranking_guild_membership();

-- Backfill any finalized activity from the currently open JST day so rollout
-- does not exclude battles finalized immediately before this migration.
insert into public.ranking_daily_participation(
  ranking_day_key,ranking_type,user_id,finalized_count,first_finalized_at,last_finalized_at
)
select (replay.finalized_at at time zone 'Asia/Tokyo')::date,
  case replay.battle_mode when 'PVP' then 'PVP' else 'RAID_PERSONAL' end,
  replay.requester_user_id,count(*)::integer,min(replay.finalized_at),max(replay.finalized_at)
from public.battle_replay_sessions replay
where replay.finalization_status='FINALIZED' and replay.battle_mode in ('PVP','RAID')
  and replay.finalized_at>=date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
group by 1,2,3
on conflict(ranking_day_key,ranking_type,user_id) do update set
  finalized_count=greatest(public.ranking_daily_participation.finalized_count,excluded.finalized_count),
  first_finalized_at=least(public.ranking_daily_participation.first_finalized_at,excluded.first_finalized_at),
  last_finalized_at=greatest(public.ranking_daily_participation.last_finalized_at,excluded.last_finalized_at);

-- Rollout backfill is limited to the currently open JST day; closed days are
-- never reconstructed from mutable current state.
insert into public.ranking_daily_activity_snapshots(
  ranking_day_key,user_id,total_power,guild_id,first_active_at,last_active_at
)
select (player.last_active_at at time zone 'Asia/Tokyo')::date,player.id,
  public.calculate_user_total_power(player.id),member.guild_id,player.last_active_at,player.last_active_at
from public.users player
left join public.guild_members member on member.user_id=player.id
where player.last_active_at>=date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
on conflict(ranking_day_key,user_id) do update set
  total_power=excluded.total_power,guild_id=excluded.guild_id,
  first_active_at=least(public.ranking_daily_activity_snapshots.first_active_at,excluded.first_active_at),
  last_active_at=greatest(public.ranking_daily_activity_snapshots.last_active_at,excluded.last_active_at);

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

  insert into public.ranking_daily_entity_snapshots(ranking_day_key,ranking_type,ranked_entity_id,score,rank_position)
  select v_day,'RAID_PERSONAL',ranked.user_id,ranked.score,ranked.rank_position
  from (
    select participation.user_id,coalesce(sum(log.raw_damage),0)::bigint score,
      row_number() over(order by coalesce(sum(log.raw_damage),0) desc,
        participation.first_finalized_at,participation.user_id)::integer rank_position
    from public.ranking_daily_participation participation
    join public.raid_damage_logs log on log.user_id=participation.user_id
      and log.created_at>=v_start and log.created_at<v_end
    where participation.ranking_day_key=v_day and participation.ranking_type='RAID_PERSONAL'
      and participation.finalized_count>=1
    group by participation.user_id,participation.first_finalized_at
  ) ranked where ranked.rank_position<=100;
  insert into public.ranking_daily_recipient_snapshots
  select snapshot.ranking_day_key,snapshot.ranking_type,snapshot.ranked_entity_id,
    snapshot.ranked_entity_id,snapshot.rank_position,snapshot.score
  from public.ranking_daily_entity_snapshots snapshot
  where snapshot.ranking_day_key=v_day and snapshot.ranking_type='RAID_PERSONAL';

  for v_row in
    select * from public.ranking_daily_recipient_snapshots recipient
    where recipient.ranking_day_key=v_day
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
      season.quantity,season.granted_at,season.reward_key ordering_key
    from public.ranking_reward_notifications notification
    join public.ranking_season_reward_grants season
      on notification.period_kind='SEASON' and season.season_id::text=notification.period_key
      and season.recipient_user_id=notification.recipient_user_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      award.ranking_type,award.rank_position,item.item_id,item.quantity,item.granted_at,item.item_id
    from public.ranking_reward_notifications notification
    join public.ranking_daily_reward_awards award
      on notification.period_kind='DAILY' and award.ranking_day_key::text=notification.period_key
      and award.recipient_user_id=notification.recipient_user_id
    join public.ranking_daily_reward_item_grants item on item.award_id=award.id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_kind',grant_row.period_kind,'period_key',grant_row.period_key,
    'ranking_category',grant_row.ranking_category,'rank_position',grant_row.rank_position,
    'item_id',grant_row.item_id,'quantity',grant_row.quantity,'granted_at',grant_row.granted_at
  ) order by grant_row.notification_at,grant_row.ranking_category,grant_row.rank_position,grant_row.ordering_key),'[]'::jsonb)
  into v_grants from grant_rows grant_row;
  return jsonb_build_object('notification_ids',v_notification_ids,'grants',v_grants);
end;
$$;

revoke all on function public.capture_daily_ranking_participation(),
  public.capture_daily_ranking_guild_membership(),
  public.grant_canonical_daily_ranking_reward(date,text,uuid,uuid,integer,bigint),
  public.finalize_daily_ranking_rewards(date) from public,anon,authenticated;
grant execute on function public.capture_daily_ranking_participation(),
  public.capture_daily_ranking_guild_membership(),
  public.grant_canonical_daily_ranking_reward(date,text,uuid,uuid,integer,bigint),
  public.finalize_daily_ranking_rewards(date) to service_role;

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='daily-ranking-reward-finalize-jst-midnight';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('daily-ranking-reward-finalize-jst-midnight','0 15 * * *',
    $job$select public.finalize_daily_ranking_rewards();$job$);
end;
$$;

commit;
notify pgrst,'reload schema';
