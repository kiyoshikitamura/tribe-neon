CREATE OR REPLACE FUNCTION public.finalize_daily_ranking_rewards(p_ranking_day_key date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;