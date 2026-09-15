-- Preview検証用。Production適用は別途承認後。
-- Derived from 20260817000154 POWER/GUILD and 20260902000228 PVP (identical read query); verify deployed definitions before applying.
-- No rewards, ranking rules, existing RPCs or tables changed.
create or replace function public.get_ranking_self_context(p_category text, p_daily boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_start timestamptz := date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
 v_end timestamptz := v_start + interval '1 day';
 v_today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
 v_season uuid := public.current_ranking_season_id('PVP');
 v_uid uuid := auth.uid(); v_guild uuid; v_result jsonb;
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
 return v_result || jsonb_build_object('updated_at',clock_timestamp(), 'starts_at',case when p_daily then v_start else null end,'ends_at',case when p_daily then v_end else null end);
end; $$;
revoke all on function public.get_ranking_self_context(text,boolean) from public,anon;
grant execute on function public.get_ranking_self_context(text,boolean) to authenticated;
