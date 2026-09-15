begin;

do $test$
declare
  v_user_id uuid := '54000000-0000-4000-8000-000000000001';
  v_subject_id uuid;
  -- Keep the fixture isolated from any real Preview activity for "today".
  v_day date := date '2199-01-01';
  v_day_start timestamptz;
  v_run_id uuid;
  v_value numeric;
begin
  v_day_start := public.kpi_jst_day_start(v_day);

  insert into public.users(id, username, level, xp, cash, created_at)
  values(v_user_id, 'kpitest1', 5, 0, 10000, v_day_start);

  select subject_id into v_subject_id
  from public.kpi_subjects
  where source_user_id = v_user_id;
  if v_subject_id is null then
    raise exception 'KPI subject was not created';
  end if;

  perform public.kpi_record_daily_activity(v_user_id, v_day_start + interval '1 hour');
  perform public.kpi_record_daily_activity(v_user_id, v_day_start + interval '2 hours');

  if (select count(*) from public.kpi_daily_user_activity
      where subject_id = v_subject_id and activity_date = v_day) <> 1 then
    raise exception 'Daily activity was not idempotent';
  end if;
  if (select first_active_at from public.kpi_daily_user_activity
      where subject_id = v_subject_id and activity_date = v_day) <> v_day_start + interval '1 hour' then
    raise exception 'First activity timestamp changed';
  end if;
  if (select last_active_at from public.kpi_daily_user_activity
      where subject_id = v_subject_id and activity_date = v_day) <> v_day_start + interval '2 hours' then
    raise exception 'Last activity timestamp was not advanced';
  end if;

  delete from public.users where id = v_user_id;
  if exists(select 1 from public.kpi_subjects where subject_id = v_subject_id and source_user_id is not null) then
    raise exception 'Deleted gameplay user was not detached';
  end if;
  if not exists(select 1 from public.kpi_daily_user_activity where subject_id = v_subject_id) then
    raise exception 'Durable KPI activity was deleted with gameplay user';
  end if;

  v_run_id := public.refresh_kpi_snapshots(
    'active_retention', 'daily', v_day, v_day + 1, null
  );
  if (select status from public.kpi_aggregation_runs where run_id = v_run_id) <> 'succeeded' then
    raise exception 'DAU refresh did not succeed';
  end if;
  select value into v_value
  from public.kpi_metric_snapshots
  where run_id = v_run_id and metric_id = 'active.dau';
  if v_value <> 1 then
    raise exception 'Expected DAU 1 before exclusion, got %', v_value;
  end if;

  insert into public.kpi_account_classification_periods(
    subject_id, classification, valid_from, valid_to, reason
  ) values (
    v_subject_id, 'test', v_day_start, v_day_start + interval '1 day', 'KPI e2e fixture'
  );

  begin
    insert into public.kpi_account_classification_periods(
      subject_id, classification, valid_from, valid_to, reason
    ) values (
      v_subject_id, 'qa', v_day_start + interval '1 hour', v_day_start + interval '3 hours', 'overlap fixture'
    );
    raise exception 'Overlapping KPI classifications were accepted' using errcode = 'P0002';
  exception when exclusion_violation then
    null;
  end;

  v_run_id := public.refresh_kpi_snapshots(
    'active_retention', 'daily', v_day, v_day + 1, null
  );
  select value into v_value
  from public.kpi_metric_snapshots
  where run_id = v_run_id and metric_id = 'active.dau';
  if v_value <> 0 then
    raise exception 'Expected excluded DAU 0, got %', v_value;
  end if;
end;
$test$;

rollback;
