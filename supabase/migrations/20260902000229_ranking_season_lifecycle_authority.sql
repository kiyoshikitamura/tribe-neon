-- TN-09: server-only ranking season transition and frozen reward authority.
begin;

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.ranking_pvp_season_snapshots (
  season_id uuid not null references public.ranking_seasons(id),
  user_id uuid not null references public.users(id),
  rank_points integer not null,
  daily_wins integer not null,
  season_wins integer not null,
  rank_position integer not null,
  achieved_at timestamptz not null,
  snapshotted_at timestamptz not null default clock_timestamp(),
  primary key (season_id,user_id)
);

create table if not exists public.ranking_raid_personal_season_snapshots (
  season_id uuid not null references public.ranking_seasons(id),
  user_id uuid not null references public.users(id),
  contribution bigint not null,
  rank_position integer not null,
  achieved_at timestamptz not null,
  snapshotted_at timestamptz not null default clock_timestamp(),
  primary key (season_id,user_id)
);

create table if not exists public.ranking_raid_guild_season_snapshots (
  season_id uuid not null references public.ranking_seasons(id),
  guild_id uuid not null references public.guilds(id),
  contribution bigint not null,
  rank_position integer not null,
  achieved_at timestamptz not null,
  snapshotted_at timestamptz not null default clock_timestamp(),
  primary key (season_id,guild_id)
);

create table if not exists public.ranking_season_reward_grants (
  season_id uuid not null references public.ranking_seasons(id),
  ranking_category text not null check (ranking_category in ('PVP','RAID_PERSONAL','RAID_GUILD')),
  recipient_user_id uuid not null references public.users(id),
  ranked_entity_id uuid not null,
  rank_position integer not null,
  reward_key text not null,
  master_reward_id text not null,
  resolved_item_id text not null,
  quantity integer not null check (quantity > 0),
  present_id uuid references public.presents(id),
  granted_at timestamptz not null default clock_timestamp(),
  primary key (season_id,ranking_category,recipient_user_id,reward_key)
);

create table if not exists public.ranking_season_transition_audits (
  season_id uuid primary key references public.ranking_seasons(id),
  ranking_type text not null,
  replay_count integer not null default 0,
  post_boundary_user_count integer not null default 0,
  before_projection jsonb not null default '[]'::jsonb,
  expected_projection jsonb not null default '[]'::jsonb,
  after_projection jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default clock_timestamp()
);

alter table public.ranking_pvp_season_snapshots enable row level security;
alter table public.ranking_raid_personal_season_snapshots enable row level security;
alter table public.ranking_raid_guild_season_snapshots enable row level security;
alter table public.ranking_season_reward_grants enable row level security;
alter table public.ranking_season_transition_audits enable row level security;
revoke all on public.ranking_pvp_season_snapshots,
  public.ranking_raid_personal_season_snapshots,
  public.ranking_raid_guild_season_snapshots,
  public.ranking_season_reward_grants,
  public.ranking_season_transition_audits from public,anon,authenticated;
grant all on public.ranking_pvp_season_snapshots,
  public.ranking_raid_personal_season_snapshots,
  public.ranking_raid_guild_season_snapshots,
  public.ranking_season_reward_grants,
  public.ranking_season_transition_audits to service_role;

create or replace function public.ranking_period_bounds(
  p_type text,
  p_at timestamptz default clock_timestamp()
) returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql immutable security definer set search_path=public as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Tokyo';
  v_start timestamp;
begin
  case upper(p_type)
    when 'PVP' then v_start := date_trunc('month',v_local);
    when 'RAID' then v_start := date_trunc('week',v_local);
    else raise exception 'unsupported automatic ranking season type' using errcode='22023';
  end case;
  starts_at := v_start at time zone 'Asia/Tokyo';
  ends_at := (v_start + case upper(p_type) when 'PVP' then interval '1 month' else interval '1 week' end)
    at time zone 'Asia/Tokyo';
  return next;
end;
$$;

create or replace function public.canonical_ranking_reward_payload()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_payload jsonb;
begin
  select master.payload into v_payload
  from public.canonical_master_freeze_versions master
  where master.domain='RANKING_REWARD'
    and master.version='2026-08-30'
    and master.is_production_enabled;
  if v_payload is null then
    raise exception 'active canonical ranking reward master is missing' using errcode='P0002';
  end if;
  return v_payload;
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
      v_granted := v_granted + 1;
    end if;
  end loop;
  return v_granted;
end;
$$;

create or replace function public.capture_pvp_daily_win()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_delta integer;
begin
  if coalesce(current_setting('tribe_neon.ranking_reconcile',true),'')='on' then
    return new;
  end if;
  v_delta:=case when tg_op='INSERT' then greatest(coalesce(new.daily_wins,0),0)
                else greatest(coalesce(new.daily_wins,0)-coalesce(old.daily_wins,0),0) end;
  if v_delta>0 then
    insert into public.pvp_daily_wins(activity_date,user_id,wins,updated_at)
    values((clock_timestamp() at time zone 'Asia/Tokyo')::date,new.user_id,v_delta,clock_timestamp())
    on conflict(activity_date,user_id) do update set
      wins=public.pvp_daily_wins.wins+excluded.wins,updated_at=excluded.updated_at;
  end if;
  return new;
end;
$$;

create or replace function public.assert_pvp_boundary_replay_continuity(
  p_season_id uuid,
  p_transition_at timestamptz
) returns integer language plpgsql security definer set search_path=public as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_events integer;
  v_event_users integer;
  v_updated_users integer;
  v_invalid integer;
begin
  select * into strict v_season from public.ranking_seasons where id=p_season_id;

  with events as (
    select replay.id,replay.requester_user_id user_id,replay.finalized_at,
      replay.finalization_result->>'winner' winner,
      (replay.finalization_result->>'oldRating')::integer declared_old,
      (replay.finalization_result->>'opponentRating')::integer opponent_rating,
      (replay.finalization_result->>'rankDelta')::integer rank_delta,
      (replay.finalization_result->>'newRankPoints')::integer new_rank,
      row_number() over(partition by replay.requester_user_id order by replay.finalized_at,replay.id) event_no,
      count(*) over(partition by replay.requester_user_id) event_total,
      lag((replay.finalization_result->>'newRankPoints')::integer)
        over(partition by replay.requester_user_id order by replay.finalized_at,replay.id) previous_new
    from public.battle_replay_sessions replay
    where replay.battle_mode='PVP' and replay.finalization_status='FINALIZED'
      and replay.finalized_at>=v_season.ends_at and replay.finalized_at<p_transition_at
  ), per_user as (
    select event.user_id,count(*) event_count,
      count(*) filter(where event.winner='PLAYER') win_count,
      max(event.new_rank) filter(where event.event_no=1) first_new,
      max(event.new_rank) filter(where event.event_no=event.event_total) last_new,
      max(event.finalized_at) last_finalized,
      count(*) filter(where event.winner is null or event.declared_old is null
        or event.opponent_rating is null or event.rank_delta is null or event.new_rank is null) incomplete,
      count(*) filter(where event.event_no>1 and (
        event.new_rank<>greatest(event.previous_new+event.rank_delta,0)
        or event.declared_old<>event.previous_new)) discontinuities
    from events event group by event.user_id
  )
  select
    (select count(*) from events),
    (select count(*) from per_user),
    (select count(*) from public.pvp_ranks rank where rank.updated_at>=v_season.ends_at),
    (select count(*) from per_user summary
      left join public.pvp_ranks rank on rank.user_id=summary.user_id
      where summary.incomplete<>0 or summary.discontinuities<>0 or summary.first_new=0
        or rank.user_id is null or rank.rank_points<>summary.last_new
        or rank.updated_at>summary.last_finalized
        or rank.daily_wins<summary.win_count or rank.season_wins<summary.win_count)
      + (select count(*) from public.pvp_ranks rank
        where rank.updated_at>=v_season.ends_at
          and not exists(select 1 from per_user summary where summary.user_id=rank.user_id))
  into v_events,v_event_users,v_updated_users,v_invalid;

  if v_invalid<>0 or v_event_users<>v_updated_users then
    raise exception 'PVP boundary replay continuity cannot be proven: events %, users %, updated %, invalid %',
      v_events,v_event_users,v_updated_users,v_invalid using errcode='23514';
  end if;
  return v_events;
end;
$$;

create or replace function public.finalize_pvp_season_rewards(p_season_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_row record;
  v_granted integer := 0;
begin
  select * into v_season from public.ranking_seasons where id=p_season_id for update;
  if not found or v_season.ranking_type<>'PVP'
     or not (v_season.status in ('FINALIZING','CLOSED')
       or (v_season.status='ACTIVE' and v_season.ends_at<=clock_timestamp())) then
    raise exception 'PvP season is not finalizable' using errcode='23514';
  end if;

  insert into public.ranking_pvp_season_snapshots(
    season_id,user_id,rank_points,daily_wins,season_wins,rank_position,achieved_at
  )
  select p_season_id,ranked.user_id,ranked.boundary_rating,ranked.boundary_daily_wins,
    ranked.boundary_season_wins,ranked.rank_position,ranked.achieved_at
  from (
    select boundary.*,
      rank() over(order by boundary.boundary_rating desc) rank_position
    from (
      select rank.user_id,
        coalesce(first_event.new_rank-first_event.rank_delta,rank.rank_points) boundary_rating,
        rank.daily_wins-coalesce(post_events.win_count,0) boundary_daily_wins,
        rank.season_wins-coalesce(post_events.win_count,0) boundary_season_wins,
        case when first_event.user_id is null then rank.updated_at else v_season.ends_at end achieved_at
      from public.pvp_ranks rank
      left join lateral (
        select replay.requester_user_id user_id,
          (replay.finalization_result->>'newRankPoints')::integer new_rank,
          (replay.finalization_result->>'rankDelta')::integer rank_delta
        from public.battle_replay_sessions replay
        where replay.requester_user_id=rank.user_id and replay.battle_mode='PVP'
          and replay.finalization_status='FINALIZED' and replay.finalized_at>=v_season.ends_at
        order by replay.finalized_at,replay.id limit 1
      ) first_event on true
      left join lateral (
        select count(*) filter(where replay.finalization_result->>'winner'='PLAYER')::integer win_count
        from public.battle_replay_sessions replay
        where replay.requester_user_id=rank.user_id and replay.battle_mode='PVP'
          and replay.finalization_status='FINALIZED' and replay.finalized_at>=v_season.ends_at
      ) post_events on true
    ) boundary
  ) ranked
  on conflict do nothing;

  for v_row in
    select snapshot.* from public.ranking_pvp_season_snapshots snapshot
    where snapshot.season_id=p_season_id
    order by snapshot.rank_position,snapshot.achieved_at,snapshot.user_id
  loop
    v_granted := v_granted + public.grant_canonical_ranking_season_reward(
      p_season_id,'PVP',v_row.user_id,v_row.user_id,v_row.rank_position
    );
  end loop;
  return v_granted;
end;
$$;

create or replace function public.reconcile_pvp_after_season_boundary(
  p_season_id uuid,
  p_transition_at timestamptz
) returns integer language plpgsql security definer set search_path=public as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_snapshot record;
  v_event record;
  v_rating integer;
  v_wins integer;
  v_replay_count integer;
  v_before jsonb;
  v_expected jsonb;
  v_after jsonb;
begin
  select * into strict v_season from public.ranking_seasons where id=p_season_id for update;
  v_replay_count:=public.assert_pvp_boundary_replay_continuity(p_season_id,p_transition_at);
  select coalesce(jsonb_agg(jsonb_build_object('user_id',rank.user_id,'rank_points',rank.rank_points,
    'daily_wins',rank.daily_wins,'season_wins',rank.season_wins) order by rank.user_id),'[]'::jsonb)
  into v_before from public.pvp_ranks rank;
  v_expected:='[]'::jsonb;

  perform set_config('tribe_neon.ranking_reconcile','on',true);
  perform public.soft_reset_pvp_ratings();
  for v_snapshot in
    select * from public.ranking_pvp_season_snapshots where season_id=p_season_id order by user_id
  loop
    v_rating:=public.canonical_pvp_soft_reset(v_snapshot.rank_points);
    v_wins:=0;
    for v_event in
      select (replay.finalization_result->>'rankDelta')::integer rank_delta,
        replay.finalization_result->>'winner' winner
      from public.battle_replay_sessions replay
      where replay.requester_user_id=v_snapshot.user_id and replay.battle_mode='PVP'
        and replay.finalization_status='FINALIZED'
        and replay.finalized_at>=v_season.ends_at and replay.finalized_at<p_transition_at
      order by replay.finalized_at,replay.id
    loop
      v_rating:=greatest(v_rating+v_event.rank_delta,0);
      if v_event.winner='PLAYER' then v_wins:=v_wins+1; end if;
    end loop;
    v_expected:=v_expected||jsonb_build_array(jsonb_build_object(
      'user_id',v_snapshot.user_id,'rank_points',v_rating,
      'daily_wins',v_wins,'season_wins',v_wins
    ));
    update public.pvp_ranks set rank_points=v_rating,daily_wins=v_wins,season_wins=v_wins,
      updated_at=clock_timestamp() where user_id=v_snapshot.user_id;
  end loop;
  perform set_config('tribe_neon.ranking_reconcile','off',true);

  select coalesce(jsonb_agg(jsonb_build_object('user_id',rank.user_id,'rank_points',rank.rank_points,
    'daily_wins',rank.daily_wins,'season_wins',rank.season_wins) order by rank.user_id),'[]'::jsonb)
  into v_after from public.pvp_ranks rank;
  if v_after<>v_expected then raise exception 'PVP reconstructed projection mismatch'; end if;
  insert into public.ranking_season_transition_audits(
    season_id,ranking_type,replay_count,post_boundary_user_count,
    before_projection,expected_projection,after_projection
  ) values (
    p_season_id,'PVP',v_replay_count,
    (select count(distinct replay.requester_user_id) from public.battle_replay_sessions replay
      where replay.battle_mode='PVP' and replay.finalization_status='FINALIZED'
        and replay.finalized_at>=v_season.ends_at and replay.finalized_at<p_transition_at),
    v_before,v_expected,v_after
  ) on conflict(season_id) do update set
    replay_count=excluded.replay_count,post_boundary_user_count=excluded.post_boundary_user_count,
    before_projection=excluded.before_projection,expected_projection=excluded.expected_projection,
    after_projection=excluded.after_projection,completed_at=clock_timestamp();
  return v_replay_count;
exception when others then
  perform set_config('tribe_neon.ranking_reconcile','off',true);
  raise;
end;
$$;

create or replace function public.finalize_raid_season_rewards(p_season_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_row record;
  v_member record;
  v_granted integer := 0;
begin
  select * into v_season from public.ranking_seasons where id=p_season_id for update;
  if not found or v_season.ranking_type<>'RAID'
     or not (v_season.status in ('FINALIZING','CLOSED')
       or (v_season.status='ACTIVE' and v_season.ends_at<=clock_timestamp())) then
    raise exception 'Raid season is not finalizable' using errcode='23514';
  end if;

  insert into public.ranking_raid_personal_season_snapshots(
    season_id,user_id,contribution,rank_position,achieved_at
  )
  select p_season_id,ranked.user_id,ranked.contribution,ranked.rank_position,ranked.achieved_at
  from (
    select totals.*,
      rank() over(order by totals.contribution desc) rank_position
    from (
      select log.user_id,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at
      from public.raid_damage_logs log
      where log.raid_boss_instance_id is not null
        and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
      group by log.user_id
    ) totals
  ) ranked
  on conflict do nothing;

  insert into public.ranking_raid_guild_season_snapshots(
    season_id,guild_id,contribution,rank_position,achieved_at
  )
  select p_season_id,ranked.guild_id,ranked.contribution,ranked.rank_position,ranked.achieved_at
  from (
    select totals.*,
      rank() over(order by totals.contribution desc) rank_position
    from (
      select log.guild_id,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at
      from public.raid_damage_logs log
      where log.raid_boss_instance_id is not null and log.guild_id is not null
        and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
      group by log.guild_id
    ) totals
  ) ranked
  on conflict do nothing;

  for v_row in
    select snapshot.* from public.ranking_raid_personal_season_snapshots snapshot
    where snapshot.season_id=p_season_id
    order by snapshot.rank_position,snapshot.achieved_at,snapshot.user_id
  loop
    v_granted := v_granted + public.grant_canonical_ranking_season_reward(
      p_season_id,'RAID_PERSONAL',v_row.user_id,v_row.user_id,v_row.rank_position
    );
  end loop;

  for v_row in
    select snapshot.* from public.ranking_raid_guild_season_snapshots snapshot
    where snapshot.season_id=p_season_id
    order by snapshot.rank_position,snapshot.achieved_at,snapshot.guild_id
  loop
    -- The frozen master holds guild funds. Preserve the established authority:
    -- only users who contributed for this guild in this exact season receive it.
    for v_member in
      select distinct log.user_id
      from public.raid_damage_logs log
      where log.guild_id=v_row.guild_id
        and log.raid_boss_instance_id is not null
        and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
    loop
      v_granted := v_granted + public.grant_canonical_ranking_season_reward(
        p_season_id,'RAID_GUILD',v_member.user_id,v_row.guild_id,v_row.rank_position
      );
    end loop;
  end loop;
  return v_granted;
end;
$$;

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

create or replace function public.advance_all_ranking_seasons(
  p_at timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return jsonb_build_object(
    'PVP',public.advance_ranking_season('PVP',p_at),
    'RAID',public.advance_ranking_season('RAID',p_at)
  );
end;
$$;

-- Keep read RPCs stable and side-effect free. Mutating battle finalizers call
-- the lifecycle before their first season-scoped write, closing the cron race.
do $attach_lifecycle$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_type text;
begin
  foreach v_type in array array['PVP','RAID'] loop
    v_signature := case v_type
      when 'PVP' then to_regprocedure('public.finalize_pvp_battle(uuid,jsonb)')
      else to_regprocedure('public.finalize_raid_battle(uuid,jsonb)')
    end;
    if v_signature is null then raise exception 'required % battle finalizer is missing',v_type; end if;
    select pg_get_functiondef(v_signature) into v_definition;
    if position('advance_ranking_season' in v_definition)>0 then continue; end if;
    v_updated := regexp_replace(
      v_definition,
      '(perform public\.validate_official_battle_result\(p_result\);)',
      format(E'perform public.advance_ranking_season(%L,clock_timestamp());\n \\1',v_type),
      'i'
    );
    if v_updated=v_definition then raise exception '% battle finalizer hook point did not match',v_type; end if;
    execute v_updated;
  end loop;
end;
$attach_lifecycle$;

do $schedule$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='ranking-pvp-monthly-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  select jobid into v_job_id from cron.job where jobname='ranking-raid-weekly-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  -- pg_cron uses UTC: 15:00 UTC is 00:00 JST on the following day.
  -- Run daily at JST midnight; the function is a no-op except at an expired
  -- explicit monthly boundary. This avoids unsupported "last day" cron syntax.
  perform cron.schedule('ranking-pvp-monthly-jst','0 15 * * *',
    $$select public.advance_ranking_season('PVP',clock_timestamp());$$);
  perform cron.schedule('ranking-raid-weekly-jst','0 15 * * 0',
    $$select public.advance_ranking_season('RAID',clock_timestamp());$$);
end;
$schedule$;

revoke all on function public.ranking_period_bounds(text,timestamptz),
  public.canonical_ranking_reward_payload(),
  public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer),
  public.assert_pvp_boundary_replay_continuity(uuid,timestamptz),
  public.finalize_pvp_season_rewards(uuid),
  public.reconcile_pvp_after_season_boundary(uuid,timestamptz),
  public.finalize_raid_season_rewards(uuid),
  public.advance_ranking_season(text,timestamptz),
  public.advance_all_ranking_seasons(timestamptz)
  from public,anon,authenticated;
grant execute on function public.ranking_period_bounds(text,timestamptz),
  public.canonical_ranking_reward_payload(),
  public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer),
  public.assert_pvp_boundary_replay_continuity(uuid,timestamptz),
  public.finalize_pvp_season_rewards(uuid),
  public.reconcile_pvp_after_season_boundary(uuid,timestamptz),
  public.finalize_raid_season_rewards(uuid),
  public.advance_ranking_season(text,timestamptz),
  public.advance_all_ranking_seasons(timestamptz)
  to service_role;

-- Reconcile the intentionally restored expired Preview rows through the same
-- production lifecycle. This is idempotent when the current periods exist.
lock table public.battle_replay_sessions in share row exclusive mode;
lock table public.pvp_ranks in share row exclusive mode;
lock table public.raid_damage_logs in share row exclusive mode;
select public.advance_all_ranking_seasons(clock_timestamp());

commit;
notify pgrst,'reload schema';
