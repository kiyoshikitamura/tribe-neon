with params as (select date '2026-09-09' target_date),
dau as (
 select a.*,s.source_user_id from public.kpi_daily_user_activity a
 left join public.kpi_subjects s using(subject_id),params
 where a.activity_date=params.target_date and not public.kpi_is_subject_excluded(a.subject_id,a.last_active_at)
), members as (
 select a.* from dau a where exists(
 select 1 from public.kpi_guild_membership_periods m where m.subject_id=a.subject_id
 and m.joined_at<public.kpi_jst_day_start(a.activity_date+1)
 and (m.left_at is null or m.left_at>=public.kpi_jst_day_start(a.activity_date+1)))
), channel_subjects as (
 select distinct a.subject_id,b.target_type channel from members a join public.board_posts b on b.user_id=a.source_user_id
 where b.created_at>=public.kpi_jst_day_start(a.activity_date) and b.created_at<public.kpi_jst_day_start(a.activity_date+1)
 and not b.is_system and b.target_type in ('GUILD','GLOBAL') and char_length(trim(b.content)) between 1 and 140
 and not public.kpi_is_subject_excluded(a.subject_id,b.created_at)
 and (b.target_type='GLOBAL' or exists(select 1 from public.kpi_guild_membership_periods m
 where m.subject_id=a.subject_id and m.guild_id=b.target_id and m.joined_at<=b.created_at and (m.left_at is null or b.created_at<m.left_at)))
 union
 select a.subject_id,'DM' from members a join public.direct_messages d on d.sender_id=a.source_user_id
 where d.created_at>=public.kpi_jst_day_start(a.activity_date) and d.created_at<public.kpi_jst_day_start(a.activity_date+1)
 and d.sender_id<>d.recipient_id and char_length(trim(d.message)) between 1 and 140
 and not public.kpi_is_subject_excluded(a.subject_id,d.created_at)
 union
 select a.subject_id,'BBS' from members a join public.bbs_threads t on t.user_id=a.source_user_id
 where t.created_at>=public.kpi_jst_day_start(a.activity_date) and t.created_at<public.kpi_jst_day_start(a.activity_date+1)
 and t.category in ('RECRUIT','STRATEGY_CHAT') and char_length(trim(t.title)) between 1 and 50
 and char_length(trim(t.content)) between 1 and 200 and not public.kpi_is_subject_excluded(a.subject_id,t.created_at)
 union
 select a.subject_id,'BBS' from members a join public.bbs_posts b on b.user_id=a.source_user_id
 join public.bbs_threads t on t.id=b.thread_id
 where b.created_at>=public.kpi_jst_day_start(a.activity_date) and b.created_at<public.kpi_jst_day_start(a.activity_date+1)
 and t.category in ('RECRUIT','STRATEGY_CHAT') and char_length(trim(b.content)) between 1 and 200
 and not public.kpi_is_subject_excluded(a.subject_id,b.created_at)
), raid_totals as (
 select a.subject_id,sum(case when jsonb_typeof(r.official_context->'cost')='number' and r.official_context->>'cost' ~ '^[0-9]+$'
 then (r.official_context->>'cost')::numeric else 0 end) points
 from dau a join public.battle_replay_sessions r on r.requester_user_id=a.source_user_id
 where r.created_at>=public.kpi_jst_day_start(a.activity_date) and r.created_at<public.kpi_jst_day_start(a.activity_date+1)
 and r.battle_mode='RAID' and r.resolution_authority='RAID_SERVER' and r.official_context->>'costType'='RAID_POINT'
 and not public.kpi_is_subject_excluded(a.subject_id,r.created_at) group by a.subject_id
)
select (select target_date from params) target_date,(select count(*) from dau) dau,(select count(*) from members) guild_dau,
 (select count(*) from channel_subjects where channel='GUILD') guild_chat_uu,
 (select count(*) from channel_subjects where channel='GLOBAL') global_chat_uu,
 (select count(*) from channel_subjects where channel='DM') dm_uu,
 (select count(*) from channel_subjects where channel='BBS') bbs_uu,
 (select count(distinct subject_id) from channel_subjects) social_union_uu,
 (select count(*) from raid_totals where points>=3) raid_point_3_uu,
 (select coalesce(jsonb_agg(jsonb_build_object('subject_id',subject_id,'points',points) order by subject_id),'[]'::jsonb) from raid_totals) raid_user_totals;
