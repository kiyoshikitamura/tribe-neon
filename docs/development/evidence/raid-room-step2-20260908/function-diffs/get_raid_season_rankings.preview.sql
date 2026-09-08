CREATE OR REPLACE FUNCTION public.get_raid_season_rankings(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;