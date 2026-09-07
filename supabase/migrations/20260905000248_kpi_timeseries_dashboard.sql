-- Additive v2 KPI snapshots for the paged daily/monthly dashboard.
-- Existing runs and snapshots remain immutable.

create or replace function public.refresh_kpi_acquisition_v2(
  p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamptz
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.refresh_kpi_acquisition(p_run_id, p_period_type, p_period_start, p_period_end, p_watermark);

  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, numerator, value_status, calculated_at
  )
  select p_run_id, metric.metric_id, period.dimension_key,
         metric.metric_value::numeric, metric.metric_value,
         case when p_watermark < period.period_end_at then 'provisional' else 'final' end,
         clock_timestamp()
  from (
    select case when p_period_type = 'daily'
                then jsonb_build_object('date', p_period_start)
                else jsonb_build_object('month', to_char(p_period_start, 'YYYY-MM')) end dimension_key,
           public.kpi_jst_day_start(p_period_end) period_end_at
  ) period
  cross join lateral (
    values
      ('user.new_authenticated_eop', (
        select count(*) from public.kpi_subjects subject
        where subject.registered_at >= public.kpi_jst_day_start(p_period_start)
          and subject.registered_at < period.period_end_at
          and (subject.registration_type = 'authenticated' or subject.first_authenticated_at < period.period_end_at)
          and not public.kpi_is_subject_excluded(subject.subject_id, subject.registered_at)
      )),
      ('user.new_anonymous_eop', (
        select count(*) from public.kpi_subjects subject
        where subject.registered_at >= public.kpi_jst_day_start(p_period_start)
          and subject.registered_at < period.period_end_at
          and subject.registration_type <> 'authenticated'
          and (subject.first_authenticated_at is null or subject.first_authenticated_at >= period.period_end_at)
          and not public.kpi_is_subject_excluded(subject.subject_id, subject.registered_at)
      ))
  ) metric(metric_id, metric_value);
end;
$$;

create or replace function public.refresh_kpi_active_timeseries_v2(
  p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamptz
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_total_metric text := case when p_period_type = 'daily' then 'active.dau' else 'active.mau' end;
  v_auth_metric text := case when p_period_type = 'daily' then 'active.dau_authenticated' else 'active.mau_authenticated' end;
  v_anon_metric text := case when p_period_type = 'daily' then 'active.dau_anonymous' else 'active.mau_anonymous' end;
  v_dimension jsonb := case when p_period_type = 'daily'
                            then jsonb_build_object('date', p_period_start)
                            else jsonb_build_object('month', to_char(p_period_start, 'YYYY-MM')) end;
  v_period_end_at timestamptz := public.kpi_jst_day_start(p_period_end);
begin
  if p_period_type not in ('daily', 'monthly') then
    raise exception 'active timeseries supports daily or monthly periods';
  end if;

  with active_subjects as (
    select distinct activity.subject_id
    from public.kpi_daily_user_activity activity
    where activity.activity_date >= p_period_start
      and activity.activity_date < p_period_end
      and not public.kpi_is_subject_excluded(activity.subject_id, activity.last_active_at)
  ), counts as (
    select count(*) total_count,
           count(*) filter (
             where subject.registration_type = 'authenticated'
                or subject.first_authenticated_at < v_period_end_at
           ) authenticated_count,
           count(*) filter (
             where subject.registration_type <> 'authenticated'
               and (subject.first_authenticated_at is null or subject.first_authenticated_at >= v_period_end_at)
           ) anonymous_count
    from active_subjects active
    join public.kpi_subjects subject using(subject_id)
  )
  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, numerator, value_status, calculated_at
  )
  select p_run_id, metric.metric_id, v_dimension,
         metric.metric_value::numeric, metric.metric_value,
         case when p_watermark < v_period_end_at then 'provisional' else 'final' end,
         clock_timestamp()
  from counts
  cross join lateral (
    values (v_total_metric, total_count),
           (v_auth_metric, authenticated_count),
           (v_anon_metric, anonymous_count)
  ) metric(metric_id, metric_value);
end;
$$;

create or replace function public.refresh_kpi_guild_timeseries_v2(
  p_run_id uuid, p_period_type text, p_period_start date, p_period_end date, p_watermark timestamptz
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_period_type not in ('daily', 'monthly') then
    raise exception 'guild timeseries supports daily or monthly periods';
  end if;
  if p_period_type = 'monthly'
     and (p_period_start <> date_trunc('month', p_period_start)::date
          or p_period_end <> (p_period_start + interval '1 month')::date) then
    raise exception 'monthly period must be one complete calendar month';
  end if;

  with bounds as (
    select public.kpi_jst_day_start(p_period_start) period_start_at,
           public.kpi_jst_day_start(p_period_end) period_end_at,
           case when p_period_type = 'daily'
                then jsonb_build_object('date', p_period_start)
                else jsonb_build_object('month', to_char(p_period_start, 'YYYY-MM')) end dimension_key
  ), valid_guilds as (
    select guild.id
    from public.guilds guild, bounds
    where guild.created_at < bounds.period_end_at
      and (guild.disbanded_at is null or guild.disbanded_at >= bounds.period_end_at)
      and not exists (
        select 1 from public.kpi_subjects leader
        where leader.source_user_id = guild.leader_id
          and public.kpi_is_subject_excluded(leader.subject_id, bounds.period_end_at - interval '1 microsecond')
      )
  ), period_days as (
    select generated::date metric_date, public.kpi_jst_day_start(generated::date + 1) day_end_at
    from generate_series(p_period_start::timestamp, (p_period_end - 1)::timestamp, interval '1 day') generated
  ), active_per_day as (
    select day.metric_date, membership.guild_id, count(distinct activity.subject_id) active_members
    from period_days day
    join public.kpi_guild_membership_periods membership
      on membership.joined_at < day.day_end_at
     and (membership.left_at is null or membership.left_at >= day.day_end_at)
    join public.kpi_daily_user_activity activity
      on activity.subject_id = membership.subject_id
     and activity.activity_date = day.metric_date
     and not public.kpi_is_subject_excluded(activity.subject_id, activity.last_active_at)
    join valid_guilds valid on valid.id = membership.guild_id
    group by day.metric_date, membership.guild_id
  ), aggregate_values as (
    select
      (select count(*) from valid_guilds)::bigint valid_count,
      (select count(distinct guild_id) from active_per_day where active_members >= 3)::bigint active_count,
      (select count(distinct membership.subject_id)
       from public.kpi_guild_membership_periods membership
       join valid_guilds valid on valid.id = membership.guild_id
       cross join bounds
       where membership.joined_at < bounds.period_end_at
         and (membership.left_at is null or membership.left_at >= bounds.period_end_at)
         and not public.kpi_is_subject_excluded(membership.subject_id, bounds.period_end_at - interval '1 microsecond'))::bigint member_total,
      (select count(*) from public.guilds guild, bounds
       where guild.created_at >= bounds.period_start_at and guild.created_at < bounds.period_end_at)::bigint created_count,
      (select count(*) from public.guilds guild, bounds
       where guild.disbanded_at >= bounds.period_start_at and guild.disbanded_at < bounds.period_end_at)::bigint disbanded_count
  )
  insert into public.kpi_metric_snapshots(
    run_id, metric_id, dimension_key, value, numerator, denominator,
    value_status, null_reason, calculated_at
  )
  select p_run_id, metric.metric_id, bounds.dimension_key,
         metric.metric_value, metric.numerator, metric.denominator,
         case when p_watermark < bounds.period_end_at then 'provisional' else 'final' end,
         metric.null_reason, clock_timestamp()
  from aggregate_values values_row
  cross join bounds
  cross join lateral (
    values
      ('guild.valid_count', values_row.valid_count::numeric, values_row.valid_count, null::bigint, null::text),
      ('guild.active_count', values_row.active_count::numeric, values_row.active_count, null::bigint, null::text),
      ('guild.active_rate', case when values_row.valid_count = 0 then null else values_row.active_count::numeric / values_row.valid_count end,
        values_row.active_count, values_row.valid_count, case when values_row.valid_count = 0 then 'zero_denominator' else null end),
      ('guild.member_total', values_row.member_total::numeric, values_row.member_total, null::bigint, null::text),
      ('guild.member_average', case when values_row.valid_count = 0 then null else values_row.member_total::numeric / values_row.valid_count end,
        values_row.member_total, values_row.valid_count, case when values_row.valid_count = 0 then 'zero_denominator' else null end),
      ('guild.created_count', values_row.created_count::numeric, values_row.created_count, null::bigint, null::text),
      ('guild.disbanded_count', values_row.disbanded_count::numeric, values_row.disbanded_count, null::bigint, null::text)
  ) metric(metric_id, metric_value, numerator, denominator, null_reason);
end;
$$;

create or replace function public.refresh_kpi_snapshots(
  p_category text, p_period_type text, p_period_start date, p_period_end date,
  p_requested_by uuid default auth.uid()
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run_id uuid;
  v_watermark timestamptz := clock_timestamp();
  v_error_state text;
  v_error_message text;
begin
  if p_category not in ('acquisition', 'active_retention', 'guild', 'content', 'revenue') then raise exception 'unsupported KPI category'; end if;
  if p_period_type not in ('daily', 'monthly', 'cohort') then raise exception 'unsupported KPI period type'; end if;
  if p_period_end <= p_period_start or p_period_end > p_period_start + 31 then raise exception 'KPI period must contain between 1 and 31 days'; end if;

  insert into public.kpi_aggregation_runs(
    category, period_type, period_start, period_end, status, requested_by,
    aggregation_version, exclusion_rule_version, source_watermark
  ) values (
    p_category, p_period_type, p_period_start, p_period_end, 'pending', p_requested_by,
    'p0-v2-timeseries', 'period-classification-v1', v_watermark
  ) returning run_id into v_run_id;

  begin
    if not pg_try_advisory_xact_lock(hashtextextended(concat_ws(':', p_category, p_period_type, p_period_start, p_period_end), 0)) then
      raise exception 'KPI refresh already running for this category and period';
    end if;
    perform set_config('statement_timeout', '15000', true);
    update public.kpi_aggregation_runs set status = 'running', started_at = clock_timestamp() where run_id = v_run_id;

    case p_category
      when 'acquisition' then perform public.refresh_kpi_acquisition_v2(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'active_retention' then
        if p_period_type = 'cohort' then
          perform public.refresh_kpi_active_retention(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
        else
          perform public.refresh_kpi_active_timeseries_v2(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
        end if;
      when 'guild' then perform public.refresh_kpi_guild_timeseries_v2(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'content' then perform public.refresh_kpi_content(v_run_id, p_period_type, p_period_start, p_period_end, v_watermark);
      when 'revenue' then perform public.refresh_kpi_revenue(v_run_id, p_period_type, p_period_start, p_period_end);
    end case;

    update public.kpi_aggregation_runs set status = 'succeeded', finished_at = clock_timestamp() where run_id = v_run_id;
  exception when query_canceled then
    delete from public.kpi_metric_snapshots where run_id = v_run_id;
    update public.kpi_aggregation_runs set status='failed', finished_at=clock_timestamp(), error_code='57014', error_detail='KPI refresh exceeded statement timeout' where run_id=v_run_id;
  when others then
    get stacked diagnostics v_error_state = returned_sqlstate, v_error_message = message_text;
    delete from public.kpi_metric_snapshots where run_id = v_run_id;
    update public.kpi_aggregation_runs set status='failed', finished_at=clock_timestamp(), error_code=v_error_state, error_detail=left(v_error_message,2000) where run_id=v_run_id;
  end;
  return v_run_id;
end;
$$;

revoke all on function public.refresh_kpi_acquisition_v2(uuid,text,date,date,timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_active_timeseries_v2(uuid,text,date,date,timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_guild_timeseries_v2(uuid,text,date,date,timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_kpi_snapshots(text,text,date,date,uuid) from public, anon, authenticated;
grant execute on function public.refresh_kpi_snapshots(text,text,date,date,uuid) to service_role;
