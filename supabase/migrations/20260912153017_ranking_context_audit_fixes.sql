-- Ranking audit fixes: response metadata only; rank formula, rewards, lifecycle and grants unchanged.
-- Verified Preview definitions, 2026-09-12. Do not apply to Production without approval.
do $guard$
begin
 if md5(pg_get_functiondef('public.get_preopen_guild_power_ranking(integer,integer)'::regprocedure)) <> 'c01a20bb92acda08be56ee39afaccc12'
 or md5(pg_get_functiondef('public.get_ranking_self_context(text,boolean)'::regprocedure)) <> '44fc540998a7eadf3e6374cd650d8f86' then
   raise exception 'ranking definition drift; re-review before applying';
 end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.get_preopen_guild_power_ranking(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_self_status text;
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
    -- Number the complete snapshot BEFORE selecting self; tied ranks are not row offsets.
    select to_jsonb(self_row) into v_self from (
      select snapshot.guild_id,snapshot.guild_name name,snapshot.total_power current_power,
        snapshot.total_power score,snapshot.member_count,snapshot.rank_position,snapshot.snapshotted_at updated_at,
        row_number() over(order by snapshot.rank_position,snapshot.guild_id)::integer row_position
      from public.ranking_guild_power_season_snapshots snapshot
      where snapshot.season_id=v_season.id
    ) self_row where self_row.guild_id=v_my_guild_id;
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
      (jsonb_agg(to_jsonb(ranked))
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

  v_self_status := case
    when v_self is not null then 'RANKED'
    when v_my_guild_id is null then 'NO_GUILD'
    when clock_timestamp()<v_season.starts_at then 'NOT_STARTED'
    when v_is_final then 'NO_SNAPSHOT'
    when exists(select 1 from public.ranking_guild_exclusions e where e.guild_id=v_my_guild_id) then 'EXCLUDED'
    else 'NO_RANKING_RECORD' end;
  return jsonb_build_object(
    'season_id',v_season.id,'event_key',v_master.event_key,
    'display_name',v_master.display_name,'display_period_text',v_master.display_period_text,
    'starts_at',v_season.starts_at,'ends_at',v_season.ends_at,'status',v_season.status,
    'is_finalized',v_is_final,'is_current_context',v_is_current_context,
    'server_updated_at',v_updated_at,
    'rows',v_rows,'self_guild',v_self,'self_status',v_self_status
  );
end;
$function$;

create or replace function public.get_ranking_self_context(p_category text, p_daily boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_start timestamptz := date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
 v_end timestamptz := v_start + interval '1 day';
 v_today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
 v_season uuid := public.current_ranking_season_id('PVP');
 v_uid uuid := auth.uid(); v_guild uuid; v_result jsonb; v_self_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_daily is null or p_category is null then raise exception 'invalid ranking input' using errcode='22023'; end if;
 select guild_id into v_guild from public.guild_members where user_id=v_uid;
 if p_category='power' then
 with ranked as (
    select ranking.user_id,player.username,player.avatar_url,ranking.total_power current_power,ranking.updated_at,
      member.guild_id,guild.name guild_name,
      dense_rank() over(order by ranking.total_power desc,ranking.updated_at asc) rank_position,
      (player.last_active_at>=v_start and player.last_active_at<v_end) is_daily_active
    from public.user_power_rankings ranking join public.users player on player.id=ranking.user_id
    left join public.guild_members member on member.user_id=ranking.user_id left join public.guilds guild on guild.id=member.guild_id
    where not p_daily or (player.last_active_at>=v_start and player.last_active_at<v_end)
    order by ranking.total_power desc,ranking.updated_at asc

), numbered as (select ranked.*, row_number() over(order by rank_position,user_id) position from ranked), mine as (select * from numbered where user_id=v_uid)
 select jsonb_build_object('self', (select to_jsonb(mine)-'position' from mine),
 'neighbors',coalesce((select jsonb_agg(to_jsonb(n)-'position' order by n.position) from numbered n, mine m where n.position between m.position-2 and m.position+2),'[]'::jsonb)) into v_result;
 elsif p_category='guild_power' then
 with ranked as (
    select aggregated.*,dense_rank() over(order by aggregated.score desc,aggregated.guild_id) rank_position from (
      select guild.id guild_id,guild.name,
        sum(power.total_power)::bigint current_power,
        coalesce(sum(power.total_power) filter(where player.last_active_at>=v_start and player.last_active_at<v_end),0)::bigint daily_power,
        count(*)::integer member_count,
        count(*) filter(where player.last_active_at>=v_start and player.last_active_at<v_end)::integer active_member_count,
        case when p_daily then coalesce(sum(power.total_power) filter(where player.last_active_at>=v_start and player.last_active_at<v_end),0) else sum(power.total_power) end::bigint score
      from public.guilds guild join public.guild_members member on member.guild_id=guild.id
      join public.users player on player.id=member.user_id join public.user_power_rankings power on power.user_id=member.user_id
      group by guild.id,guild.name
    ) aggregated where not p_daily or aggregated.active_member_count>0
    order by score desc,guild_id

), numbered as (select ranked.*, row_number() over(order by rank_position,guild_id) position from ranked), mine as (select * from numbered where guild_id=v_guild)
 select jsonb_build_object('self', (select to_jsonb(mine)-'position' from mine),
 'neighbors',coalesce((select jsonb_agg(to_jsonb(n)-'position' order by n.position) from numbered n, mine m where n.position between m.position-2 and m.position+2),'[]'::jsonb)) into v_result;
 elsif p_category='pvp' then
 with ranked as (
    select row_data.*,dense_rank() over(order by row_data.score desc,row_data.user_id) rank_position from (
      select rank.user_id,player.username,player.avatar_url,coalesce(rank.rank_points,1000) rank_points,
        coalesce(daily.wins,0) daily_wins,coalesce(power.total_power,0) current_power,
        member.guild_id,guild.name guild_name,v_season season_id,
        case when p_daily then coalesce(daily.wins,0) else coalesce(rank.rank_points,1000) end score
      from public.pvp_ranks rank join public.users player on player.id=rank.user_id
      left join public.pvp_daily_wins daily on daily.user_id=rank.user_id and daily.activity_date=v_today
      left join public.user_power_rankings power on power.user_id=rank.user_id
      left join public.guild_members member on member.user_id=rank.user_id left join public.guilds guild on guild.id=member.guild_id
    ) row_data order by score desc,user_id

), numbered as (select ranked.*, row_number() over(order by rank_position,user_id) position from ranked), mine as (select * from numbered where user_id=v_uid)
 select jsonb_build_object('self', (select to_jsonb(mine)-'position' from mine),
 'neighbors',coalesce((select jsonb_agg(to_jsonb(n)-'position' order by n.position) from numbered n, mine m where n.position between m.position-2 and m.position+2),'[]'::jsonb)) into v_result;
 else raise exception 'invalid category' using errcode='22023'; end if;
 v_self_status := case
   when v_result->'self' is not null and v_result->'self'<>'null'::jsonb then 'RANKED'
   when p_category='guild_power' and v_guild is null then 'NO_GUILD'
   when p_category='pvp' and not exists(select 1 from public.pvp_ranks where user_id=v_uid) then 'NO_PVP_RECORD'
   when p_category='power' and not exists(select 1 from public.user_power_rankings where user_id=v_uid) then 'NO_POWER_RECORD'
   when p_category='power' and p_daily and not exists(
     select 1 from public.users where id=v_uid and last_active_at>=v_start and last_active_at<v_end
   ) then 'DAILY_INACTIVE'
   when p_category='guild_power' and p_daily and not exists(
     select 1 from public.guild_members m join public.users u on u.id=m.user_id
       join public.user_power_rankings r on r.user_id=m.user_id
     where m.guild_id=v_guild and u.last_active_at>=v_start and u.last_active_at<v_end
   ) then 'DAILY_INACTIVE'
   else 'NO_RANKING_RECORD' end;
 return v_result || jsonb_build_object('self_status',v_self_status,'updated_at',clock_timestamp(), 'starts_at',case when p_daily then v_start else null end,'ends_at',case when p_daily then v_end else null end);
end; $$;
revoke all on function public.get_ranking_self_context(text,boolean) from public,anon;
grant execute on function public.get_ranking_self_context(text,boolean) to authenticated;
