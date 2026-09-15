-- TN-09: canonical JST season lifecycle for monthly PvP and weekly Raid rankings.
begin;

create or replace function public.ranking_period_bounds(p_type text,p_at timestamptz default clock_timestamp())
returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql immutable security definer set search_path=public as $$
declare v_local timestamp:=p_at at time zone 'Asia/Tokyo'; v_start timestamp;
begin
  case upper(p_type)
    when 'PVP' then v_start:=date_trunc('month',v_local);
    when 'RAID' then v_start:=date_trunc('week',v_local);
    else raise exception 'unsupported automatic ranking season type' using errcode='22023';
  end case;
  starts_at:=v_start at time zone 'Asia/Tokyo';
  ends_at:=(v_start + case upper(p_type) when 'PVP' then interval '1 month' else interval '1 week' end) at time zone 'Asia/Tokyo';
  return next;
end;
$$;

create or replace function public.ensure_current_ranking_season(p_type text,p_at timestamptz default clock_timestamp())
returns uuid language plpgsql volatile security definer set search_path=public as $$
declare v_type text:=upper(p_type); v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  if v_type not in ('PVP','RAID') then raise exception 'unsupported automatic ranking season type' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ranking-season:'||v_type,0));
  select bounds.starts_at,bounds.ends_at into v_start,v_end from public.ranking_period_bounds(v_type,p_at) bounds;

  perform 1 from public.ranking_seasons where ranking_type=v_type for update;
  update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp()
    where ranking_type=v_type and status='ACTIVE' and (starts_at<>v_start or ends_at<>v_end or p_at>=ends_at);

  insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
  values(v_type,v_start,v_end,'ACTIVE')
  on conflict(ranking_type,starts_at) do update set ends_at=excluded.ends_at,status='ACTIVE',updated_at=clock_timestamp()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ensure_raid_ranking_season_on_damage()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.ensure_current_ranking_season('RAID',clock_timestamp());
  return new;
end;
$$;

drop trigger if exists raid_damage_logs_ensure_season on public.raid_damage_logs;
create trigger raid_damage_logs_ensure_season after insert on public.raid_damage_logs
for each statement execute function public.ensure_raid_ranking_season_on_damage();

select public.ensure_current_ranking_season('PVP',clock_timestamp());
select public.ensure_current_ranking_season('RAID',clock_timestamp());

create or replace function public.get_public_pvp_rankings(p_daily boolean,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_season uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
  v_season:=public.ensure_current_ranking_season('PVP',clock_timestamp());
  return coalesce((select jsonb_agg(to_jsonb(ranked) order by ranked.rank_position) from (
    select row_data.*,dense_rank() over(order by row_data.score desc,row_data.user_id) rank_position from (
      select rank.user_id,player.username,player.avatar_url,coalesce(rank.rank_points,1000) rank_points,
        coalesce(daily.wins,0) daily_wins,coalesce(power.total_power,0) current_power,
        member.guild_id,guild.name guild_name,v_season season_id,
        case when p_daily then coalesce(daily.wins,0) else coalesce(rank.rank_points,1000) end score
      from public.pvp_ranks rank join public.users player on player.id=rank.user_id
      left join public.pvp_daily_wins daily on daily.user_id=rank.user_id and daily.activity_date=v_today
      left join public.user_power_rankings power on power.user_id=rank.user_id
      left join public.guild_members member on member.user_id=rank.user_id left join public.guilds guild on guild.id=member.guild_id
    ) row_data order by score desc,user_id limit p_limit offset p_offset
  ) ranked),'[]'::jsonb);
end;
$$;

create or replace function public.get_raid_season_rankings(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_season public.ranking_seasons%rowtype; v_season_id uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
  v_season_id:=public.ensure_current_ranking_season('RAID',clock_timestamp());
  select * into strict v_season from public.ranking_seasons where id=v_season_id;
  return jsonb_build_object('season_id',v_season.id,'starts_at',v_season.starts_at,'ends_at',v_season.ends_at,
    'individual',coalesce((with totals as (
      select log.user_id,player.username,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at
      from public.raid_damage_logs log join public.users player on player.id=log.user_id
      where log.raid_boss_instance_id is not null and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
      group by log.user_id,player.username), ranked as (
      select totals.*,rank() over(order by contribution desc) rank_position from totals)
      select jsonb_agg(to_jsonb(page) order by page.rank_position,page.achieved_at,page.user_id)
      from (select * from ranked order by rank_position,achieved_at,user_id limit p_limit offset p_offset) page),'[]'::jsonb),
    'guild',coalesce((with totals as (
      select log.guild_id,guild.name guild_name,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at,count(distinct log.user_id)::integer participant_count
      from public.raid_damage_logs log join public.guilds guild on guild.id=log.guild_id
      where log.raid_boss_instance_id is not null and log.guild_id is not null and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
      group by log.guild_id,guild.name), ranked as (
      select totals.*,rank() over(order by contribution desc) rank_position from totals)
      select jsonb_agg(to_jsonb(page) order by page.rank_position,page.achieved_at,page.guild_id)
      from (select * from ranked order by rank_position,achieved_at,guild_id limit p_limit offset p_offset) page),'[]'::jsonb),
    'selfRank',(with totals as (
      select log.user_id,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at from public.raid_damage_logs log
      where log.raid_boss_instance_id is not null and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at group by log.user_id), ranked as (
      select totals.*,rank() over(order by contribution desc) rank_position from totals)
      select to_jsonb(ranked) from ranked where user_id=v_uid));
end;
$$;

create or replace function public.get_active_ranking_seasons()
returns jsonb language plpgsql volatile security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform public.ensure_current_ranking_season('PVP',clock_timestamp());
  perform public.ensure_current_ranking_season('RAID',clock_timestamp());
  return coalesce((select jsonb_agg(jsonb_build_object('season_id',season.id,'ranking_type',season.ranking_type,'starts_at',season.starts_at,'ends_at',season.ends_at,'status',season.status) order by season.ranking_type)
    from public.ranking_seasons season where season.status='ACTIVE' and clock_timestamp()>=season.starts_at and clock_timestamp()<season.ends_at),'[]'::jsonb);
end;
$$;

revoke all on function public.ranking_period_bounds(text,timestamptz),public.ensure_current_ranking_season(text,timestamptz),public.ensure_raid_ranking_season_on_damage() from public,anon,authenticated;
grant execute on function public.ranking_period_bounds(text,timestamptz),public.ensure_current_ranking_season(text,timestamptz),public.ensure_raid_ranking_season_on_damage() to service_role;
revoke all on function public.get_public_pvp_rankings(boolean,integer,integer),public.get_raid_season_rankings(integer,integer),public.get_active_ranking_seasons() from public,anon;
grant execute on function public.get_public_pvp_rankings(boolean,integer,integer),public.get_raid_season_rankings(integer,integer),public.get_active_ranking_seasons() to authenticated,service_role;

commit;
