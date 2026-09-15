CREATE OR REPLACE FUNCTION public.kpi_daily_engagement_v1(p_from date, p_to date)
 RETURNS TABLE(activity_date date, dau bigint, guild_dau bigint, social_active_uu bigint, raid_point_active_uu bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with activity as materialized (
  -- 保存済みOverviewと同一のCanonical DAU・除外Authority。
  select a.activity_date,a.subject_id,s.source_user_id,
    exists(select 1 from public.kpi_guild_membership_periods m
      where m.subject_id=a.subject_id
        and m.joined_at<public.kpi_jst_day_start(a.activity_date+1)
        and (m.left_at is null or m.left_at>=public.kpi_jst_day_start(a.activity_date+1))) guild_member
  from public.kpi_daily_user_activity a
  left join public.kpi_subjects s using(subject_id)
  where a.activity_date between p_from and p_to
    and not public.kpi_is_subject_excluded(a.subject_id,a.last_active_at)
), actions as (
  -- Guild/Global Chatは現存する人間投稿。削除後も残る旧Activation Factとは区別する。
  select b.user_id,b.created_at
  from public.board_posts b
  where b.created_at>=public.kpi_jst_day_start(p_from)
    and b.created_at<public.kpi_jst_day_start(p_to+1)
    and b.target_type in ('GUILD','GLOBAL') and not b.is_system and b.user_id is not null
    and char_length(trim(b.content)) between 1 and 140
    and (b.target_type='GLOBAL' or exists(
      select 1 from public.kpi_guild_membership_periods m join public.kpi_subjects s using(subject_id)
      where s.source_user_id=b.user_id and m.guild_id=b.target_id
        and m.joined_at<=b.created_at and (m.left_at is null or b.created_at<m.left_at)))
  union all
  select d.sender_id,d.created_at from public.direct_messages d
  where d.created_at>=public.kpi_jst_day_start(p_from)
    and d.created_at<public.kpi_jst_day_start(p_to+1)
    and d.sender_id<>d.recipient_id and char_length(trim(d.message)) between 1 and 140
  union all
  -- スレッドの本文投稿と返信投稿は別Authority。どちらもBBS投稿。
  select t.user_id,t.created_at from public.bbs_threads t
  where t.created_at>=public.kpi_jst_day_start(p_from)
    and t.created_at<public.kpi_jst_day_start(p_to+1)
    and t.category in ('RECRUIT','STRATEGY_CHAT')
    and char_length(trim(t.title)) between 1 and 50 and char_length(trim(t.content)) between 1 and 200
  union all
  select p.user_id,p.created_at from public.bbs_posts p
  join public.bbs_threads t on t.id=p.thread_id
  where p.created_at>=public.kpi_jst_day_start(p_from)
    and p.created_at<public.kpi_jst_day_start(p_to+1)
    and t.category in ('RECRUIT','STRATEGY_CHAT') and char_length(trim(p.content)) between 1 and 200
), social as (
  select distinct a.activity_date,a.subject_id
  from activity a join actions x on x.user_id=a.source_user_id
    and x.created_at>=public.kpi_jst_day_start(a.activity_date)
    and x.created_at<public.kpi_jst_day_start(a.activity_date+1)
  where a.guild_member and not public.kpi_is_subject_excluded(a.subject_id,x.created_at)
), raid as (
  -- 開始transactionで減算と同時に記録されたcost。無料・Cash・Diamondや完了回数は使わない。
  select a.activity_date,a.subject_id
  from activity a join public.battle_replay_sessions r on r.requester_user_id=a.source_user_id
    and r.created_at>=public.kpi_jst_day_start(a.activity_date)
    and r.created_at<public.kpi_jst_day_start(a.activity_date+1)
  where r.battle_mode='RAID' and r.resolution_authority='RAID_SERVER'
    and r.official_context->>'costType'='RAID_POINT'
    and not public.kpi_is_subject_excluded(a.subject_id,r.created_at)
  group by a.activity_date,a.subject_id
  having sum(case when jsonb_typeof(r.official_context->'cost')='number'
      and r.official_context->>'cost' ~ '^[0-9]+$'
    then (r.official_context->>'cost')::numeric else 0 end)>=3
)
select d::date,count(a.subject_id),count(a.subject_id) filter(where a.guild_member),
  count(s.subject_id),count(r.subject_id)
from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
left join activity a on a.activity_date=d::date
left join social s on s.activity_date=a.activity_date and s.subject_id=a.subject_id
left join raid r on r.activity_date=a.activity_date and r.subject_id=a.subject_id
group by d order by d;
$function$
