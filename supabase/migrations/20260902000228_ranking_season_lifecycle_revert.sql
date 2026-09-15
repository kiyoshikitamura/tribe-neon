-- TN-09 safety correction: restore the exact pre-00227 ranking lifecycle.
begin;

do $$
declare
  v_new_pvp constant uuid:='74bacb55-cad3-4c23-bca7-67a2aeac931d';
  v_new_raid constant uuid:='e7f40125-3f35-4774-ad2d-839b213cc1fd';
  v_old_pvp constant uuid:='90106a5f-ec9b-415f-98d0-754a525c1eb7';
  v_old_raid constant uuid:='2828d27e-ebfd-4005-ba3b-0d618618c286';
begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20260902000227') then raise exception '00227 is not registered'; end if;
  -- The original incident repair is exact and may only touch the known Preview
  -- inventory. Every other environment falls through to the schema-only safety
  -- restoration below; it must never fail on Preview-specific identities.
  if (select count(*) from public.ranking_seasons where id=v_new_pvp and ranking_type='PVP' and status='ACTIVE' and starts_at='2026-08-31 15:00:00+00' and ends_at='2026-09-30 15:00:00+00')=1
     and (select count(*) from public.ranking_seasons where id=v_new_raid and ranking_type='RAID' and status='ACTIVE' and starts_at='2026-08-30 15:00:00+00' and ends_at='2026-09-06 15:00:00+00')=1
     and (select count(*) from public.ranking_seasons where id=v_old_pvp and ranking_type='PVP' and status='CLOSED' and starts_at='2026-07-31 15:00:00+00' and ends_at='2026-08-31 15:00:00+00')=1
     and (select count(*) from public.ranking_seasons where id=v_old_raid and ranking_type='RAID' and status='CLOSED' and starts_at='2026-07-31 15:00:00+00' and ends_at='2026-08-31 15:00:00+00')=1 then
    if exists(select 1 from public.pvp_ranking_reward_grants where season_id in(v_new_pvp,v_new_raid))
      or exists(select 1 from public.gvg_guild_season_rankings where season_id in(v_new_pvp,v_new_raid))
      or exists(select 1 from public.gvg_individual_season_rankings where season_id in(v_new_pvp,v_new_raid)) then raise exception 'new season has dependent rows'; end if;
    if exists(select 1 from public.raid_damage_logs where created_at>='2026-09-02 06:47:40+00')
      or exists(select 1 from public.pvp_ranks where updated_at>='2026-09-02 06:47:40+00')
      or exists(select 1 from public.pvp_ranking_reward_grants where granted_at>='2026-09-02 06:47:40+00')
      or exists(select 1 from public.battle_replay_sessions where finalized_at>='2026-09-02 06:47:40+00') then raise exception 'ranking activity occurred after 00227'; end if;

    delete from public.ranking_seasons where id in(v_new_pvp,v_new_raid);
    update public.ranking_seasons set status='ACTIVE',updated_at=created_at where id in(v_old_pvp,v_old_raid);
  end if;
end;
$$;

drop trigger if exists raid_damage_logs_ensure_season on public.raid_damage_logs;

create or replace function public.get_public_pvp_rankings(p_daily boolean,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_season uuid:=public.current_ranking_season_id('PVP');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
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
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_season public.ranking_seasons%rowtype;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
  select * into v_season from public.ranking_seasons where id=public.current_ranking_season_id('RAID');
  return jsonb_build_object(
    'season_id',v_season.id,'starts_at',v_season.starts_at,'ends_at',v_season.ends_at,
    'individual',coalesce((with totals as (
      select log.user_id,player.username,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at
      from public.raid_damage_logs log join public.users player on player.id=log.user_id
      where log.raid_boss_instance_id is not null and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
      group by log.user_id,player.username), ranked as (select totals.*,rank() over(order by contribution desc) rank_position from totals)
      select jsonb_agg(to_jsonb(page) order by page.rank_position,page.achieved_at,page.user_id) from (select * from ranked order by rank_position,achieved_at,user_id limit p_limit offset p_offset) page),'[]'::jsonb),
    'guild',coalesce((with totals as (
      select log.guild_id,guild.name guild_name,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at,count(distinct log.user_id)::integer participant_count
      from public.raid_damage_logs log join public.guilds guild on guild.id=log.guild_id
      where log.raid_boss_instance_id is not null and log.guild_id is not null and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at
      group by log.guild_id,guild.name), ranked as (select totals.*,rank() over(order by contribution desc) rank_position from totals)
      select jsonb_agg(to_jsonb(page) order by page.rank_position,page.achieved_at,page.guild_id) from (select * from ranked order by rank_position,achieved_at,guild_id limit p_limit offset p_offset) page),'[]'::jsonb),
    'selfRank',(with totals as (
      select log.user_id,sum(log.raw_damage)::bigint contribution,min(log.created_at) achieved_at from public.raid_damage_logs log
      where log.raid_boss_instance_id is not null and log.created_at>=v_season.starts_at and log.created_at<v_season.ends_at group by log.user_id), ranked as (
      select totals.*,rank() over(order by contribution desc) rank_position from totals) select to_jsonb(ranked) from ranked where user_id=v_uid));
end;
$$;

create or replace function public.get_active_ranking_seasons()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('season_id',season.id,'ranking_type',season.ranking_type,'starts_at',season.starts_at,'ends_at',season.ends_at,'status',season.status) order by season.ranking_type)
    from public.ranking_seasons season where season.status='ACTIVE' and clock_timestamp()>=season.starts_at and clock_timestamp()<season.ends_at),'[]'::jsonb);
end;
$$;

revoke all on function public.get_public_pvp_rankings(boolean,integer,integer),public.get_raid_season_rankings(integer,integer),public.get_active_ranking_seasons() from public,anon;
grant execute on function public.get_public_pvp_rankings(boolean,integer,integer),public.get_raid_season_rankings(integer,integer),public.get_active_ranking_seasons() to authenticated,service_role;
drop function if exists public.ensure_raid_ranking_season_on_damage();
drop function if exists public.ensure_current_ranking_season(text,timestamptz);
drop function if exists public.ranking_period_bounds(text,timestamptz);

commit;
