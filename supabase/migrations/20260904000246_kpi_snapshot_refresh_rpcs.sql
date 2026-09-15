-- Category-scoped manual KPI aggregation. Dashboard reads snapshots only.

create or replace function public.kpi_jst_day_start(p_date date)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select p_date::timestamp at time zone 'Asia/Tokyo';
$$;

create or replace function public.kpi_is_subject_excluded(
  p_subject_id uuid,
  p_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.kpi_account_classification_periods period
    where period.subject_id = p_subject_id
      and period.classification in ('admin', 'qa', 'test', 'fraud_suspended')
      and period.valid_from <= p_at
      and (period.valid_to is null or period.valid_to > p_at)
  );
$$;

create or replace function public.refresh_kpi_acquisition(
  p_run_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_watermark timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_period_type not in ('daily', 'monthly') then
    raise exception 'acquisition supports daily or monthly periods';
  end if;
  if p_period_type = 'monthly'
     and (p_period_start <> date_trunc('month', p_period_start)::date
          or p_period_end <> (p_period_start + interval '1 month')::date) then
    raise exception 'monthly period must be one complete calendar month';
  end if;

  with buckets as (
    select day_value::date bucket_start,
           day_value::date + 1 bucket_end,
           jsonb_build_object('date', day_value::date) dimension_key,
           public.kpi_jst_day_start(day_value::date + 8) tutorial_deadline
    from generate_series(
      p_period_start::timestamp,
      (p_period_end - 1)::timestamp,
      interval '1 day'
    ) generated(day_value)
    where p_period_type = 'daily'
    union all
    select p_period_start,
           p_period_end,
           jsonb_build_object('month', to_char(p_period_start, 'YYYY-MM')),
           public.kpi_jst_day_start(p_period_end + 7)
    where p_period_type = 'monthly'
  ), counts as (
    select bucket.*,
      (select count(*)
       from public.kpi_subjects subject
       where subject.registered_at >= public.kpi_jst_day_start(bucket.bucket_start)
         and subject.registered_at < public.kpi_jst_day_start(bucket.bucket_end)
         and not public.kpi_is_subject_excluded(subject.subject_id, subject.registered_at)) new_total,
      (select count(*)
       from public.kpi_subjects subject
       where subject.registration_type = 'anonymous'
         and subject.registered_at >= public.kpi_jst_day_start(bucket.bucket_start)
         and subject.registered_at < public.kpi_jst_day_start(bucket.bucket_end)
         and not public.kpi_is_subject_excluded(subject.subject_id, subject.registered_at)) new_anonymous,
      (select count(*)
       from public.kpi_subjects subject
       where subject.first_authenticated_at >= public.kpi_jst_day_start(bucket.bucket_start)
         and subject.first_authenticated_at < public.kpi_jst_day_start(bucket.bucket_end)
         and not public.kpi_is_subject_excluded(subject.subject_id, subject.first_authenticated_at)) new_authenticated,
      (select count(*)
       from public.kpi_subjects subject
       join public.kpi_tutorial_completion_facts completion using(subject_id)
       where subject.registered_at >= public.kpi_jst_day_start(bucket.bucket_start)
         and subject.registered_at < public.kpi_jst_day_start(bucket.bucket_end)
         and completion.completed_at < least(bucket.tutorial_deadline, p_watermark)
         and not public.kpi_is_subject_excluded(subject.subject_id, subject.registered_at)
         and not public.kpi_is_subject_excluded(subject.subject_id, completion.completed_at)) tutorial_completed
    from buckets bucket
  )
  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, numerator, denominator,
    value_status, null_reason, calculated_at
  )
  select p_run_id,
         metric.metric_id,
         counts.dimension_key,
         metric.value,
         metric.numerator,
         metric.denominator,
         case
           when metric.metric_id = 'tutorial.completion_rate' and p_watermark < counts.tutorial_deadline
             then 'provisional'
           when p_watermark < public.kpi_jst_day_start(counts.bucket_end)
             then 'provisional'
           else 'final'
         end,
         metric.null_reason,
         clock_timestamp()
  from counts
  cross join lateral (
    values
      ('user.new_anonymous', counts.new_anonymous::numeric, counts.new_anonymous, null::bigint, null::text),
      ('user.new_authenticated', counts.new_authenticated::numeric, counts.new_authenticated, null::bigint, null::text),
      ('user.new_total', counts.new_total::numeric, counts.new_total, null::bigint, null::text),
      ('tutorial.completion_rate',
        case when counts.new_total = 0 then null else counts.tutorial_completed::numeric / counts.new_total end,
        counts.tutorial_completed,
        counts.new_total,
        case when counts.new_total = 0 then 'zero_denominator' else null end)
  ) metric(metric_id, value, numerator, denominator, null_reason);
end;
$$;

create or replace function public.refresh_kpi_active_retention(
  p_run_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_watermark timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_period_type = 'daily' then
    insert into public.kpi_metric_snapshots(
      run_id, metric_id, dimension_key, value, numerator, value_status, calculated_at
    )
    select p_run_id,
           'active.dau',
           jsonb_build_object('date', day_value::date),
           count(activity.subject_id)::numeric,
           count(activity.subject_id),
           case when p_watermark < public.kpi_jst_day_start(day_value::date + 1) then 'provisional' else 'final' end,
           clock_timestamp()
    from generate_series(
      p_period_start::timestamp,
      (p_period_end - 1)::timestamp,
      interval '1 day'
    ) generated(day_value)
    left join public.kpi_daily_user_activity activity
      on activity.activity_date = day_value::date
     and not public.kpi_is_subject_excluded(activity.subject_id, activity.last_active_at)
    group by day_value;
  elsif p_period_type = 'monthly' then
    if p_period_start <> date_trunc('month', p_period_start)::date
       or p_period_end <> (p_period_start + interval '1 month')::date then
      raise exception 'monthly period must be one complete calendar month';
    end if;
    insert into public.kpi_metric_snapshots(
      run_id, metric_id, dimension_key, value, numerator, value_status, calculated_at
    )
    select p_run_id,
           'active.mau',
           jsonb_build_object('month', to_char(p_period_start, 'YYYY-MM')),
           count(distinct activity.subject_id)::numeric,
           count(distinct activity.subject_id),
           case when p_watermark < public.kpi_jst_day_start(p_period_end) then 'provisional' else 'final' end,
           clock_timestamp()
    from public.kpi_daily_user_activity activity
    where activity.activity_date >= p_period_start
      and activity.activity_date < p_period_end
      and not public.kpi_is_subject_excluded(activity.subject_id, activity.last_active_at);
  elsif p_period_type = 'cohort' then
    with cohort_days as (
      select generated::date cohort_date
      from generate_series(
        p_period_start::timestamp,
        (p_period_end - 1)::timestamp,
        interval '1 day'
      ) generated
    ), offsets(day_number) as (
      values (1), (2), (3), (4), (5), (6), (7), (14), (21), (30), (60)
    ), cohort_members as (
      select day.cohort_date, subject.subject_id
      from cohort_days day
      join public.kpi_subjects subject
        on subject.registered_at >= public.kpi_jst_day_start(day.cohort_date)
       and subject.registered_at < public.kpi_jst_day_start(day.cohort_date + 1)
       and not public.kpi_is_subject_excluded(subject.subject_id, subject.registered_at)
    ), result as (
      select day.cohort_date,
             offset_row.day_number,
             public.kpi_jst_day_start(day.cohort_date + offset_row.day_number + 1) observation_end,
             count(member.subject_id) denominator_value,
             count(activity.subject_id) numerator_value
      from cohort_days day
      cross join offsets offset_row
      left join cohort_members member on member.cohort_date = day.cohort_date
      left join public.kpi_daily_user_activity activity
        on activity.subject_id = member.subject_id
       and activity.activity_date = day.cohort_date + offset_row.day_number
       and not public.kpi_is_subject_excluded(activity.subject_id, activity.last_active_at)
      group by day.cohort_date, offset_row.day_number
    )
    insert into public.kpi_metric_snapshots(
      run_id, metric_id, dimension_key, value, numerator, denominator,
      value_status, null_reason, calculated_at
    )
    select p_run_id,
           format('retention.d%s', lpad(day_number::text, 2, '0')),
           jsonb_build_object('cohort_date', cohort_date, 'day', day_number),
           case
             when p_watermark < observation_end or denominator_value = 0 then null
             else numerator_value::numeric / denominator_value
           end,
           case when p_watermark < observation_end then null else numerator_value end,
           case when p_watermark < observation_end then null else denominator_value end,
           case when p_watermark < observation_end then 'provisional' else 'final' end,
           case
             when p_watermark < observation_end then 'observation_incomplete'
             when denominator_value = 0 then 'zero_denominator'
             else null
           end,
           clock_timestamp()
    from result;
  else
    raise exception 'active_retention supports daily, monthly, or cohort periods';
  end if;
end;
$$;

create or replace function public.refresh_kpi_guild(
  p_run_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_watermark timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_period_type <> 'daily' then
    raise exception 'guild supports daily periods only';
  end if;

  with days as (
    select generated::date metric_date,
           public.kpi_jst_day_start(generated::date + 1) period_end_at
    from generate_series(
      p_period_start::timestamp,
      (p_period_end - 1)::timestamp,
      interval '1 day'
    ) generated
  ), valid_guilds as (
    select day.metric_date, day.period_end_at, guild.id guild_id
    from days day
    join public.guilds guild
      on guild.created_at < day.period_end_at
     and (guild.disbanded_at is null or guild.disbanded_at >= day.period_end_at)
    where not exists (
      select 1
      from public.kpi_subjects leader
      where leader.source_user_id = guild.leader_id
        and public.kpi_is_subject_excluded(leader.subject_id, day.period_end_at - interval '1 microsecond')
    )
  ), member_counts as (
    select valid.metric_date, valid.period_end_at, valid.guild_id,
           count(distinct membership.subject_id) member_count
    from valid_guilds valid
    left join public.kpi_guild_membership_periods membership
      on membership.guild_id = valid.guild_id
     and membership.joined_at < valid.period_end_at
     and (membership.left_at is null or membership.left_at >= valid.period_end_at)
     and not public.kpi_is_subject_excluded(
       membership.subject_id,
       valid.period_end_at - interval '1 microsecond'
     )
    group by valid.metric_date, valid.period_end_at, valid.guild_id
  ), active_guilds as (
    select member.metric_date, member.guild_id,
           count(distinct activity.subject_id) active_members
    from member_counts member
    join public.kpi_guild_membership_periods membership
      on membership.guild_id = member.guild_id
     and membership.joined_at < member.period_end_at
     and (membership.left_at is null or membership.left_at >= member.period_end_at)
    join public.kpi_daily_user_activity activity
      on activity.subject_id = membership.subject_id
     and activity.activity_date = member.metric_date
     and not public.kpi_is_subject_excluded(activity.subject_id, activity.last_active_at)
    group by member.metric_date, member.guild_id
  )
  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, numerator, value_status, calculated_at
  )
  select p_run_id,
         'guild.valid_count',
         jsonb_build_object('date', day.metric_date),
         count(valid.guild_id)::numeric,
         count(valid.guild_id),
         case when p_watermark < day.period_end_at then 'provisional' else 'final' end,
         clock_timestamp()
  from days day
  left join valid_guilds valid on valid.metric_date = day.metric_date
  group by day.metric_date, day.period_end_at
  union all
  select p_run_id,
         'guild.member_count',
         jsonb_build_object('date', member.metric_date, 'guild_id', member.guild_id),
         member.member_count::numeric,
         member.member_count,
         case when p_watermark < member.period_end_at then 'provisional' else 'final' end,
         clock_timestamp()
  from member_counts member
  union all
  select p_run_id,
         'guild.active_count',
         jsonb_build_object('date', day.metric_date),
         count(active.guild_id) filter (where active.active_members >= 3)::numeric,
         count(active.guild_id) filter (where active.active_members >= 3),
         case when p_watermark < day.period_end_at then 'provisional' else 'final' end,
         clock_timestamp()
  from days day
  left join active_guilds active on active.metric_date = day.metric_date
  group by day.metric_date, day.period_end_at;
end;
$$;

create or replace function public.refresh_kpi_content(
  p_run_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_watermark timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_period_type not in ('daily', 'monthly') then
    raise exception 'content supports daily or monthly periods';
  end if;
  if p_period_type = 'monthly'
     and (p_period_start <> date_trunc('month', p_period_start)::date
          or p_period_end <> (p_period_start + interval '1 month')::date) then
    raise exception 'monthly period must be one complete calendar month';
  end if;

  with buckets as (
    select day_value::date bucket_start,
           day_value::date + 1 bucket_end,
           jsonb_build_object('date', day_value::date) dimension_key
    from generate_series(
      p_period_start::timestamp,
      (p_period_end - 1)::timestamp,
      interval '1 day'
    ) generated(day_value)
    where p_period_type = 'daily'
    union all
    select p_period_start,
           p_period_end,
           jsonb_build_object('month', to_char(p_period_start, 'YYYY-MM'))
    where p_period_type = 'monthly'
  ), types(gacha_type, metric_id) as (
    values
      ('CHARACTER', 'gacha.free10.character'),
      ('SKILL', 'gacha.free10.skill'),
      ('EQUIPMENT', 'gacha.free10.equipment')
  )
  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, numerator, value_status, calculated_at
  )
  select p_run_id,
         type_row.metric_id,
         bucket.dimension_key,
         count(fact.request_id)::numeric,
         count(fact.request_id),
         case when p_watermark < public.kpi_jst_day_start(bucket.bucket_end) then 'provisional' else 'final' end,
         clock_timestamp()
  from buckets bucket
  cross join types type_row
  left join public.kpi_gacha_execution_facts fact
    on fact.gacha_type = type_row.gacha_type
   and fact.payment_source = 'free'
   and fact.pull_count = 10
   and fact.completed_at >= public.kpi_jst_day_start(bucket.bucket_start)
   and fact.completed_at < public.kpi_jst_day_start(bucket.bucket_end)
   and not public.kpi_is_subject_excluded(fact.subject_id, fact.completed_at)
  group by bucket.bucket_start, bucket.bucket_end, bucket.dimension_key,
           type_row.gacha_type, type_row.metric_id;
end;
$$;

create or replace function public.refresh_kpi_revenue(
  p_run_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_closed boolean;
begin
  select state = 'CLOSED' and not visibility and not mutation_allowed
  into v_payment_closed
  from public.feature_operating_states
  where feature_key = 'PAYMENT';

  if not coalesce(v_payment_closed, false) then
    raise exception 'formal revenue KPI definitions F10-F13 are not fixed';
  end if;

  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, value_status, null_reason, calculated_at
  )
  select p_run_id,
         metric_id,
         jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end),
         null,
         'not_applicable',
         'payment_closed',
         clock_timestamp()
  from unnest(array['revenue.pu', 'revenue.gross', 'revenue.arppu', 'revenue.arpu']) metric_id;
end;
$$;

create or replace function public.refresh_kpi_snapshots(
  p_category text,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_requested_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_watermark timestamptz := clock_timestamp();
  v_error_state text;
  v_error_message text;
begin
  if p_category not in ('acquisition', 'active_retention', 'guild', 'content', 'revenue') then
    raise exception 'unsupported KPI category';
  end if;
  if p_period_type not in ('daily', 'monthly', 'cohort') then
    raise exception 'unsupported KPI period type';
  end if;
  if p_period_end <= p_period_start or p_period_end > p_period_start + 31 then
    raise exception 'KPI period must contain between 1 and 31 days';
  end if;

  insert into public.kpi_aggregation_runs(
    category, period_type, period_start, period_end, status, requested_by,
    aggregation_version, exclusion_rule_version, source_watermark
  ) values (
    p_category, p_period_type, p_period_start, p_period_end, 'pending', p_requested_by,
    'p0-v1', 'period-classification-v1', v_watermark
  ) returning run_id into v_run_id;

  begin
    if not pg_try_advisory_xact_lock(
      hashtextextended(concat_ws(':', p_category, p_period_type, p_period_start, p_period_end), 0)
    ) then
      raise exception 'KPI refresh already running for this category and period';
    end if;

    perform set_config('statement_timeout', '15000', true);
    update public.kpi_aggregation_runs
    set status = 'running', started_at = clock_timestamp()
    where run_id = v_run_id;

    case p_category
      when 'acquisition' then
        perform public.refresh_kpi_acquisition(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'active_retention' then
        perform public.refresh_kpi_active_retention(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'guild' then
        perform public.refresh_kpi_guild(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'content' then
        perform public.refresh_kpi_content(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'revenue' then
        perform public.refresh_kpi_revenue(v_run_id, p_period_type, p_period_start, p_period_end);
    end case;

    update public.kpi_aggregation_runs
    set status = 'succeeded', finished_at = clock_timestamp()
    where run_id = v_run_id;
  exception
  when query_canceled then
    delete from public.kpi_metric_snapshots where run_id = v_run_id;
    update public.kpi_aggregation_runs
    set status = 'failed',
        finished_at = clock_timestamp(),
        error_code = '57014',
        error_detail = 'KPI refresh exceeded statement timeout'
    where run_id = v_run_id;
  when others then
    get stacked diagnostics
      v_error_state = returned_sqlstate,
      v_error_message = message_text;
    delete from public.kpi_metric_snapshots where run_id = v_run_id;
    update public.kpi_aggregation_runs
    set status = 'failed',
        finished_at = clock_timestamp(),
        error_code = v_error_state,
        error_detail = left(v_error_message, 2000)
    where run_id = v_run_id;
  end;

  return v_run_id;
end;
$$;

revoke all on function public.kpi_jst_day_start(date) from public, anon, authenticated;
revoke all on function public.kpi_is_subject_excluded(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_acquisition(uuid, text, date, date, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_active_retention(uuid, text, date, date, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_guild(uuid, text, date, date, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_content(uuid, text, date, date, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_revenue(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.refresh_kpi_snapshots(text, text, date, date, uuid) from public, anon, authenticated;
grant execute on function public.refresh_kpi_snapshots(text, text, date, date, uuid) to service_role;
