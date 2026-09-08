-- 通常一覧専用の保存済み投影。元Authority・既存Snapshot・Gameplayは変更しない。
create table public.kpi_overview_saved_results (
  period_type text not null check (period_type in ('daily','monthly')),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null,
  generation_id uuid not null,
  definition_version text not null,
  payload jsonb not null,
  primary key (period_type,period_start),
  check (period_end > period_start and period_end <= period_start + 31)
);
alter table public.kpi_overview_saved_results enable row level security;
revoke all on public.kpi_overview_saved_results from public,anon,authenticated,service_role;
grant select on public.kpi_overview_saved_results to service_role;

create function public.kpi_overview_saved_rate(n bigint,d bigint,t numeric,r text default null)
returns jsonb language sql immutable set search_path = public,pg_temp as $$
select jsonb_build_object('numerator',n,'denominator',d,'value',n::numeric/nullif(d,0),'target',t,
  'status',case when d is null or d=0 then 'NOT_READY' when n::numeric/d>=t then 'PASS' else 'FAIL' end,
  'reason',case when d=0 then 'zero_denominator' when d is null then 'immature_cohorts' else r end,
  'observation_status',case when d is null then 'incomplete' when r='mature_cohorts_only' then 'partial' else 'complete' end);
$$;
revoke all on function public.kpi_overview_saved_rate(bigint,bigint,numeric,text) from public,anon,authenticated,service_role;

create function public.refresh_kpi_overview_saved_results(p_today date default (now() at time zone 'Asia/Tokyo')::date)
returns integer language plpgsql security invoker set search_path = public,pg_temp as $$
declare
  v_from date := (date_trunc('month',p_today) - interval '11 months')::date;
  v_generated timestamptz := clock_timestamp();
  v_generation uuid := gen_random_uuid();
  v_count integer;
begin
  if p_today is null or p_today > (now() at time zone 'Asia/Tokyo')::date then raise exception 'invalid observation date'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('kpi-overview-saved-results-v1',0)) then return 0; end if;
  -- 同一statement snapshotで全期間を計算し、成功時だけ全行を置換する。
  with periods as materialized (
    select 'daily'::text kind,d::date start_at,d::date+1 end_at from generate_series(v_from::timestamp,p_today::timestamp,interval '1 day') d
    union all
    select 'monthly',m::date,(m+interval '1 month')::date from generate_series(v_from::timestamp,date_trunc('month',p_today),interval '1 month') m
  ), all_subjects as materialized (
    select s.*,(s.registered_at at time zone 'Asia/Tokyo')::date registered_date
    from public.kpi_subjects s where s.registered_at < public.kpi_jst_day_start(p_today+1)
      and not public.kpi_is_subject_excluded(s.subject_id,s.registered_at)
  ), subjects as materialized (
    select * from all_subjects where registered_date>=v_from
  ), evidence as (
    select f.subject_id,f.completed_at from public.kpi_tutorial_completion_facts f join subjects s using(subject_id)
    union all
    select f.subject_id,f.completed_at from public.kpi_canonical_tutorial_completions_v1 f join subjects s using(subject_id)
    union all
    select s.subject_id,m.first_occurred_at from subjects s join public.user_funnel_milestones m
      on m.user_id=s.source_user_id and m.milestone='tutorial_complete'
  ), completions as materialized (
    -- source_user_idは既存unique indexで一意。detached subjectの履歴はsubject単位で維持。
    select e.subject_id,min(e.completed_at) completed_at from evidence e
    where not public.kpi_is_subject_excluded(e.subject_id,e.completed_at) group by e.subject_id
  ), memberships as materialized (
    select m.*,
      (select count(*) from public.kpi_guild_conversion_facts f where f.membership_period_id=m.id
        and not public.kpi_is_subject_excluded(f.subject_id,f.occurred_at)) conversion_count,
      exists(select 1 from public.kpi_guild_conversion_facts f where f.membership_period_id=m.id and f.conversion_type='CREATE'
        and not public.kpi_is_subject_excluded(f.subject_id,f.occurred_at)) created,
      exists(select 1 from public.kpi_guild_conversion_facts f where f.membership_period_id=m.id and f.conversion_type='JOIN'
        and not public.kpi_is_subject_excluded(f.subject_id,f.occurred_at)) joined,
      exists(select 1 from public.kpi_guild_chat_activation_facts f where f.membership_period_id=m.id
        and not public.kpi_is_subject_excluded(f.subject_id,f.occurred_at)) canonical_chat,
      exists(select 1 from public.board_posts b join subjects s on s.source_user_id=b.user_id
        where s.subject_id=m.subject_id and b.target_type='GUILD' and b.is_system=false and b.target_id=m.guild_id
          and b.created_at>=m.joined_at and (m.left_at is null or b.created_at<m.left_at)) legacy_chat
    from public.kpi_guild_membership_periods m join completions c using(subject_id) where m.joined_at>=c.completed_at
  ), membership_summary as materialized (
    select subject_id,count(*) membership_count,sum(conversion_count) conversion_count,
      bool_or(created) created,bool_or(joined) joined,bool_or(canonical_chat) canonical_chat,
      bool_or(canonical_chat or legacy_chat) activated from memberships group by subject_id
  ), flags as materialized (
    select s.subject_id,s.registered_date,c.completed_at,m.membership_count,m.conversion_count,m.created,m.joined,m.canonical_chat,m.activated from subjects s left join completions c using(subject_id)
      left join membership_summary m using(subject_id)
  ), activity as materialized (
    select a.subject_id,a.activity_date from public.kpi_daily_user_activity a
    where a.activity_date>=v_from and a.activity_date<=p_today
      and not public.kpi_is_subject_excluded(a.subject_id,a.last_active_at)
  ), cohort_counts as (
    select p.kind,p.start_at,p.end_at,count(f.subject_id) new_users,count(f.completed_at) tutorial_n,
      count(*) filter(where f.membership_count>0) guild_n,count(*) filter(where f.activated) chat_n,
      coalesce(sum(f.membership_count),0) membership_count,coalesce(sum(f.conversion_count),0) conversion_count,
      count(*) filter(where f.created) created,count(*) filter(where f.joined) joined,bool_or(f.canonical_chat) canonical_chat
    from periods p left join flags f on f.registered_date>=p.start_at and f.registered_date<p.end_at group by p.kind,p.start_at,p.end_at
  ), retained as (
    select p.kind,p.start_at,d.day,count(f.subject_id) all_count,
      count(f.subject_id) filter(where f.registered_date+d.day<p_today) mature_count,
      count(a.subject_id) filter(where f.registered_date+d.day<p_today) retained_count
    from periods p cross join generate_series(1,5) d(day)
    left join flags f on f.registered_date>=p.start_at and f.registered_date<p.end_at
    left join activity a on a.subject_id=f.subject_id and a.activity_date=f.registered_date+d.day
    group by p.kind,p.start_at,d.day
  ), retention_json as (
    select kind,start_at,jsonb_agg(jsonb_build_object('day',day)||public.kpi_overview_saved_rate(
      case when mature_count>0 then retained_count end, nullif(mature_count,0),
      (array[.38,.30,.26,.23,.21]::numeric[])[day],case when mature_count<all_count then 'mature_cohorts_only' end) order by day) retention
    from retained group by kind,start_at
  ), active_counts as (
    -- MAUは日次合計ではなく、月の活動集合内で重複除外する。
    select p.kind,p.start_at,count(distinct a.subject_id) active_users from periods p
    left join activity a on a.activity_date>=p.start_at and a.activity_date<p.end_at group by p.kind,p.start_at
  ), guild_days as materialized (
    select * from public.kpi_effective_active_guild_daily_v1 where activity_date>=v_from and activity_date<=p_today
  ), guild_counts as (
    -- 月次は月内に1日以上、既存の日次条件を満たしたdistinct guild。
    select p.kind,p.start_at,count(distinct g.guild_id) filter(where g.is_active_guild) active_guilds,
      count(distinct g.guild_id) filter(where g.is_effective_active_guild) effective_active_guilds
    from periods p left join guild_days g on g.activity_date>=p.start_at and g.activity_date<p.end_at group by p.kind,p.start_at
  ), cumulative as (
    select p.kind,p.start_at,count(s.subject_id) total_registered from periods p left join all_subjects s on s.registered_date<p.end_at group by p.kind,p.start_at
  ), payment as (
    select case when exists(select 1 from public.feature_operating_states where feature_key='PAYMENT'
      and state='CLOSED' and not visibility and not mutation_allowed) then 'payment_closed' else 'definition_unavailable' end reason
  )
  insert into public.kpi_overview_saved_results(period_type,period_start,period_end,generated_at,generation_id,definition_version,payload)
  select c.kind,c.start_at,c.end_at,v_generated,v_generation,'kpi-overview-saved-v1',
    jsonb_build_object('date',case when c.kind='daily' then to_char(c.start_at,'YYYY-MM-DD') else to_char(c.start_at,'YYYY-MM') end,
      'from',c.start_at,'to',least(c.end_at-1,p_today),'partial',c.end_at>p_today,
      'new_users',c.new_users,'active_users',a.active_users,'total_registered',u.total_registered,
      'tutorial',public.kpi_overview_saved_rate(c.tutorial_n,c.new_users,.6)||jsonb_build_object('authority','tutorial_completion_union_v1','authority_label','統合計測（既存完了＋MyPage・重複除外）'),
      'guild',public.kpi_overview_saved_rate(c.guild_n,c.tutorial_n,.4)||jsonb_build_object(
        'authority',case when c.membership_count>0 and c.conversion_count=c.membership_count then 'canonical' else 'membership_periods' end,
        'create',case when c.membership_count>0 and c.conversion_count=c.membership_count then c.created end,
        'join',case when c.membership_count>0 and c.conversion_count=c.membership_count then c.joined end),
      'chat',public.kpi_overview_saved_rate(c.chat_n,c.guild_n,.3)||jsonb_build_object('authority',case when c.canonical_chat then 'canonical_and_legacy' else 'legacy_surviving_posts' end),
      'retention',r.retention,'active_guilds',g.active_guilds,'effective_active_guilds',g.effective_active_guilds,
      'monetization',jsonb_build_object('payers',null,'payer_rate',null,'revenue',null,'arppu',null,'arpu',null,'reason',payment.reason),
      'generated_at',v_generated)
  from cohort_counts c join active_counts a using(kind,start_at) join cumulative u using(kind,start_at)
    join retention_json r using(kind,start_at) join guild_counts g using(kind,start_at) cross join payment
  on conflict(period_type,period_start) do update set period_end=excluded.period_end,generated_at=excluded.generated_at,
    generation_id=excluded.generation_id,definition_version=excluded.definition_version,payload=excluded.payload;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.refresh_kpi_overview_saved_results(date) from public,anon,authenticated,service_role;
-- DB管理者が所有する既存Cron基盤を利用。画面アクセスから更新を起動しない。
select cron.schedule('kpi-overview-saved-results-half-hourly','7,37 * * * *',
  $job$set statement_timeout='120s'; select public.refresh_kpi_overview_saved_results();$job$);

