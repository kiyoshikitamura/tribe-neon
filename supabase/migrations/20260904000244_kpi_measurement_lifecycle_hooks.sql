-- Capture KPI facts before gameplay rows can be removed or overwritten.

create or replace function public.kpi_ensure_subject(
  p_user_id uuid,
  p_registered_at timestamptz default now(),
  p_registration_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_subject_id uuid;
  v_registration_type text := p_registration_type;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  select subject_id into v_subject_id
  from public.kpi_subjects
  where source_user_id = p_user_id;
  if v_subject_id is not null then
    return v_subject_id;
  end if;

  if v_registration_type is null then
    select case when au.is_anonymous then 'anonymous' else 'authenticated' end
    into v_registration_type
    from auth.users au
    where au.id = p_user_id;
  end if;
  v_registration_type := coalesce(v_registration_type, 'unknown');

  begin
    insert into public.kpi_subjects(source_user_id, registered_at, registration_type)
    values(p_user_id, coalesce(p_registered_at, now()), v_registration_type)
    returning subject_id into v_subject_id;
  exception when unique_violation then
    select subject_id into v_subject_id
    from public.kpi_subjects
    where source_user_id = p_user_id;
  end;

  return v_subject_id;
end;
$$;

create or replace function public.on_kpi_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.kpi_ensure_subject(new.id, new.created_at, null);
  return new;
end;
$$;

drop trigger if exists kpi_user_created_trigger on public.users;
create trigger kpi_user_created_trigger
after insert on public.users
for each row execute function public.on_kpi_user_created();

create or replace function public.on_kpi_user_detaching()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.kpi_subjects
  set source_user_id = null,
      detached_at = coalesce(detached_at, clock_timestamp()),
      deletion_reason = coalesce(deletion_reason, 'gameplay_user_deleted'),
      updated_at = clock_timestamp()
  where source_user_id = old.id;
  return old;
end;
$$;

drop trigger if exists kpi_user_detaching_trigger on public.users;
create trigger kpi_user_detaching_trigger
before delete on public.users
for each row execute function public.on_kpi_user_detaching();

create or replace function public.on_kpi_auth_method_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_id uuid;
begin
  v_subject_id := public.kpi_ensure_subject(new.user_id, new.authenticated_at, 'authenticated');
  update public.kpi_subjects
  set first_authenticated_at = least(
        coalesce(first_authenticated_at, new.authenticated_at),
        new.authenticated_at
      ),
      updated_at = clock_timestamp()
  where subject_id = v_subject_id;
  return new;
end;
$$;

drop trigger if exists kpi_auth_method_created_trigger on public.user_account_auth_methods;
create trigger kpi_auth_method_created_trigger
after insert or update of authenticated_at on public.user_account_auth_methods
for each row execute function public.on_kpi_auth_method_created();

create or replace function public.kpi_record_daily_activity(
  p_user_id uuid,
  p_occurred_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_id uuid;
  v_activity_date date;
begin
  v_subject_id := public.kpi_ensure_subject(p_user_id, p_occurred_at, null);
  v_activity_date := (p_occurred_at at time zone 'Asia/Tokyo')::date;

  insert into public.kpi_daily_user_activity(
    activity_date, subject_id, first_active_at, last_active_at, source
  ) values (
    v_activity_date, v_subject_id, p_occurred_at, p_occurred_at, 'sync_active_users'
  )
  on conflict (activity_date, subject_id) do update
  set first_active_at = least(public.kpi_daily_user_activity.first_active_at, excluded.first_active_at),
      last_active_at = greatest(public.kpi_daily_user_activity.last_active_at, excluded.last_active_at);
end;
$$;

create or replace function public.sync_active_users()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_day date;
  v_count integer;
  v_power bigint;
  v_guild_id uuid;
begin
  if v_uid is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_day := (v_now at time zone 'Asia/Tokyo')::date;
  update public.users set last_active_at = v_now where id = v_uid;

  if not found then
    select count(*) into v_count
    from public.users
    where last_active_at >= v_now - interval '5 minutes';
    return v_count;
  end if;

  v_power := public.calculate_user_total_power(v_uid);
  select member.guild_id into v_guild_id
  from public.guild_members member
  where member.user_id = v_uid
  limit 1;

  insert into public.ranking_daily_activity_snapshots(
    ranking_day_key, user_id, total_power, guild_id, first_active_at, last_active_at
  ) values (
    v_day, v_uid, v_power, v_guild_id, v_now, v_now
  )
  on conflict (ranking_day_key, user_id) do update
  set total_power = excluded.total_power,
      guild_id = excluded.guild_id,
      first_active_at = least(public.ranking_daily_activity_snapshots.first_active_at, excluded.first_active_at),
      last_active_at = greatest(public.ranking_daily_activity_snapshots.last_active_at, excluded.last_active_at);

  perform public.kpi_record_daily_activity(v_uid, v_now);

  select count(*) into v_count
  from public.users
  where last_active_at >= v_now - interval '5 minutes';
  return v_count;
end;
$$;

create or replace function public.on_kpi_tutorial_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_id uuid;
begin
  if new.step_id = 'COMPLETE'
     and (tg_op = 'INSERT' or old.step_id is distinct from 'COMPLETE') then
    v_subject_id := public.kpi_ensure_subject(new.user_id, coalesce(new.completed_at, now()), null);
    insert into public.kpi_tutorial_completion_facts(subject_id, completed_at, source)
    values(v_subject_id, coalesce(new.completed_at, now()), 'tutorial_progress')
    on conflict (subject_id) do update
    set completed_at = least(public.kpi_tutorial_completion_facts.completed_at, excluded.completed_at);
  end if;
  return new;
end;
$$;

drop trigger if exists kpi_tutorial_complete_trigger on public.tutorial_progress;
create trigger kpi_tutorial_complete_trigger
after insert or update of step_id on public.tutorial_progress
for each row execute function public.on_kpi_tutorial_complete();

create or replace function public.on_kpi_gacha_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_id uuid;
  v_gacha_type text;
begin
  if new.status <> 'COMPLETED' or new.completed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'COMPLETED' then
    return new;
  end if;

  select upper(master.gacha_type) into v_gacha_type
  from public.gacha_masters master
  where master.id = new.gacha_id;
  if v_gacha_type not in ('CHARACTER', 'SKILL', 'EQUIPMENT') then
    raise exception 'unsupported KPI gacha type: %', coalesce(v_gacha_type, '<null>');
  end if;

  v_subject_id := public.kpi_ensure_subject(new.user_id, new.created_at, null);
  insert into public.kpi_gacha_execution_facts(
    subject_id, request_id, gacha_id, gacha_type, payment_source, pull_count, completed_at
  ) values (
    v_subject_id, new.request_id, new.gacha_id, v_gacha_type,
    new.payment_source, new.pull_count, new.completed_at
  )
  on conflict (subject_id, request_id) do nothing;
  return new;
end;
$$;

drop trigger if exists kpi_gacha_completed_trigger on public.gacha_execution_history;
create trigger kpi_gacha_completed_trigger
after insert or update of status on public.gacha_execution_history
for each row execute function public.on_kpi_gacha_completed();

create or replace function public.on_kpi_guild_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_id uuid;
begin
  v_subject_id := public.kpi_ensure_subject(new.user_id, new.joined_at, null);

  update public.kpi_guild_membership_periods
  set left_at = new.joined_at,
      leave_reason = 'transfer'
  where subject_id = v_subject_id
    and left_at is null
    and guild_id <> new.guild_id;

  if not exists (
    select 1 from public.kpi_guild_membership_periods
    where subject_id = v_subject_id and guild_id = new.guild_id and left_at is null
  ) then
    insert into public.kpi_guild_membership_periods(
      guild_id, subject_id, joined_at, leave_reason, source_membership_id
    ) values (
      new.guild_id, v_subject_id, new.joined_at, null, new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists kpi_guild_member_joined_trigger on public.guild_members;
create trigger kpi_guild_member_joined_trigger
after insert on public.guild_members
for each row execute function public.on_kpi_guild_member_joined();

create or replace function public.on_kpi_guild_member_leaving()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.kpi_guild_membership_periods period
  set left_at = clock_timestamp(),
      leave_reason = coalesce(nullif(current_setting('app.kpi_guild_leave_reason', true), ''), 'unknown')
  from public.kpi_subjects subject
  where subject.source_user_id = old.user_id
    and period.subject_id = subject.subject_id
    and period.guild_id = old.guild_id
    and period.left_at is null;
  return old;
end;
$$;

drop trigger if exists kpi_guild_member_leaving_trigger on public.guild_members;
create trigger kpi_guild_member_leaving_trigger
before delete on public.guild_members
for each row execute function public.on_kpi_guild_member_leaving();

create or replace function public.enforce_kpi_classification_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.kpi_account_classification_periods existing
    where existing.subject_id = new.subject_id
      and existing.id <> coalesce(new.id, -1)
      and tstzrange(existing.valid_from, coalesce(existing.valid_to, 'infinity'::timestamptz), '[)')
          && tstzrange(new.valid_from, coalesce(new.valid_to, 'infinity'::timestamptz), '[)')
  ) then
    raise exception 'KPI classification periods overlap' using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists kpi_classification_no_overlap_trigger on public.kpi_account_classification_periods;
create trigger kpi_classification_no_overlap_trigger
before insert or update on public.kpi_account_classification_periods
for each row execute function public.enforce_kpi_classification_no_overlap();

-- Backfill is safe for the current empty Production and preserves non-empty development data.
insert into public.kpi_subjects(
  source_user_id, registered_at, registration_type, first_authenticated_at
)
select u.id,
       u.created_at,
       case when au.is_anonymous then 'anonymous' else 'authenticated' end,
       method.authenticated_at
from public.users u
join auth.users au on au.id = u.id
left join public.user_account_auth_methods method on method.user_id = u.id
on conflict do nothing;

insert into public.kpi_daily_user_activity(
  activity_date, subject_id, first_active_at, last_active_at, source
)
select activity.ranking_day_key,
       subject.subject_id,
       activity.first_active_at,
       activity.last_active_at,
       'ranking_daily_activity_backfill'
from public.ranking_daily_activity_snapshots activity
join public.kpi_subjects subject on subject.source_user_id = activity.user_id
on conflict (activity_date, subject_id) do update
set first_active_at = least(public.kpi_daily_user_activity.first_active_at, excluded.first_active_at),
    last_active_at = greatest(public.kpi_daily_user_activity.last_active_at, excluded.last_active_at);

insert into public.kpi_tutorial_completion_facts(subject_id, completed_at, source)
select subject.subject_id, progress.completed_at, 'tutorial_progress_backfill'
from public.tutorial_progress progress
join public.kpi_subjects subject on subject.source_user_id = progress.user_id
where progress.step_id = 'COMPLETE' and progress.completed_at is not null
on conflict (subject_id) do update
set completed_at = least(public.kpi_tutorial_completion_facts.completed_at, excluded.completed_at);

insert into public.kpi_gacha_execution_facts(
  subject_id, request_id, gacha_id, gacha_type, payment_source, pull_count, completed_at
)
select subject.subject_id,
       history.request_id,
       history.gacha_id,
       upper(master.gacha_type),
       history.payment_source,
       history.pull_count,
       history.completed_at
from public.gacha_execution_history history
join public.kpi_subjects subject on subject.source_user_id = history.user_id
join public.gacha_masters master on master.id = history.gacha_id
where history.status = 'COMPLETED'
  and history.completed_at is not null
  and upper(master.gacha_type) in ('CHARACTER', 'SKILL', 'EQUIPMENT')
on conflict (subject_id, request_id) do nothing;

insert into public.kpi_guild_membership_periods(
  guild_id, subject_id, joined_at, source_membership_id
)
select member.guild_id, subject.subject_id, member.joined_at, member.id
from public.guild_members member
join public.kpi_subjects subject on subject.source_user_id = member.user_id
where not exists (
  select 1 from public.kpi_guild_membership_periods existing
  where existing.subject_id = subject.subject_id and existing.left_at is null
);

revoke all on function public.kpi_ensure_subject(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.kpi_record_daily_activity(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.on_kpi_user_created() from public, anon, authenticated;
revoke all on function public.on_kpi_user_detaching() from public, anon, authenticated;
revoke all on function public.on_kpi_auth_method_created() from public, anon, authenticated;
revoke all on function public.on_kpi_tutorial_complete() from public, anon, authenticated;
revoke all on function public.on_kpi_gacha_completed() from public, anon, authenticated;
revoke all on function public.on_kpi_guild_member_joined() from public, anon, authenticated;
revoke all on function public.on_kpi_guild_member_leaving() from public, anon, authenticated;
revoke all on function public.enforce_kpi_classification_no_overlap() from public, anon, authenticated;

grant execute on function public.sync_active_users() to authenticated;
