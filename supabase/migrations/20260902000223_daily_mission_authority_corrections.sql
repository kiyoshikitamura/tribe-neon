-- TN-02 correction: keep daily aggregates safe during JST rollover and
-- reconcile successful free Normal ten-pulls completed earlier today.
begin;

do $$
begin
  if to_regprocedure('public.refresh_daily_mission_completion_aggregates(uuid,date)') is null
    or to_regprocedure('public.on_daily_mission_authority_change()') is null then
    raise exception 'TN-02 correction prerequisite is missing';
  end if;
end;
$$;

create or replace function public.refresh_daily_mission_completion_aggregates(
  p_user_id uuid,
  p_cycle_date date default (clock_timestamp() at time zone 'Asia/Tokyo')::date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed integer;
begin
  select count(*)::integer into v_completed
  from public.user_missions um
  join public.missions m on m.id = um.mission_id
  where um.user_id = p_user_id
    and um.cycle_date = p_cycle_date
    and m.is_enabled
    and m.category = 'DAILY'
    and m.trigger_type <> 'DAILY_MISSION_COMPLETED_COUNT'
    and um.status in ('CLEAR', 'CLAIMED');

  update public.user_missions um
  set current_progress = least(m.target_value, v_completed),
      progress_val = least(m.target_value, v_completed),
      status = case
        when um.status = 'CLAIMED' then 'CLAIMED'
        when v_completed >= m.target_value then 'CLEAR'
        else 'PROGRESS'
      end,
      updated_at = clock_timestamp()
  from public.missions m
  where um.user_id = p_user_id
    and um.cycle_date = p_cycle_date
    and um.mission_id = m.id
    and m.is_enabled
    and m.category = 'DAILY'
    and m.trigger_type = 'DAILY_MISSION_COMPLETED_COUNT';
end;
$$;

create or replace function public.on_daily_mission_authority_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.missions%rowtype;
begin
  -- Rollover resets CLEAR/CLAIMED rows to PROGRESS in one statement. Ignore
  -- those reverse transitions so this row trigger never updates another row
  -- that the same statement is still scheduled to update.
  if old.status is not distinct from new.status
    or new.status not in ('CLEAR', 'CLAIMED') then
    return new;
  end if;
  select * into v_mission from public.missions where id = new.mission_id;
  if not found
    or not v_mission.is_enabled
    or v_mission.category <> 'DAILY'
    or v_mission.trigger_type = 'DAILY_MISSION_COMPLETED_COUNT'
    or new.cycle_date is null then
    return new;
  end if;
  perform public.refresh_daily_mission_completion_aggregates(new.user_id, new.cycle_date);
  return new;
end;
$$;

drop trigger if exists daily_mission_authority_change_trigger on public.user_missions;
create trigger daily_mission_authority_change_trigger
after update of status on public.user_missions
for each row
when (
  old.status is distinct from new.status
  and new.status in ('CLEAR', 'CLAIMED')
)
execute function public.on_daily_mission_authority_change();

-- Entitlement backfill: every successful free Character Normal ten-pull from
-- the current JST day consumes the same CHARACTER daily entitlement, whether
-- it completed immediately before or after migration 00222 was installed.
insert into public.user_daily_gacha_claims (
  user_id, gacha_type, last_claimed_date, updated_at
)
select
  history.user_id,
  'CHARACTER',
  (clock_timestamp() at time zone 'Asia/Tokyo')::date,
  clock_timestamp()
from public.gacha_execution_history history
where history.status = 'COMPLETED'
  and history.payment_source = 'free'
  and history.pull_count = 10
  and history.gacha_id = 'CHAR_NORMAL'
  and coalesce(history.completed_at, history.created_at) >=
    ((clock_timestamp() at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo')
  and coalesce(history.completed_at, history.created_at) <
    (((clock_timestamp() at time zone 'Asia/Tokyo')::date + 1)::timestamp at time zone 'Asia/Tokyo')
group by history.user_id
on conflict (user_id, gacha_type) do update
set last_claimed_date = greatest(
      public.user_daily_gacha_claims.last_claimed_date,
      excluded.last_claimed_date
    ),
    updated_at = case
      when public.user_daily_gacha_claims.last_claimed_date < excluded.last_claimed_date
        then excluded.updated_at
      else public.user_daily_gacha_claims.updated_at
    end;

-- Mission backfill is a state reconciliation, not an event replay: set the
-- enabled current-cycle mission to its canonical target once for each player
-- with a successful free Normal ten-pull today.
update public.user_missions um
set current_progress = m.target_value,
    progress_val = m.target_value,
    status = case when um.status = 'CLAIMED' then 'CLAIMED' else 'CLEAR' end,
    updated_at = clock_timestamp()
from public.missions m
where um.mission_id = m.id
  and m.is_enabled
  and m.category = 'DAILY'
  and m.trigger_type = 'NORMAL_FREE_GACHA_PULL_COUNT'
  and um.cycle_date = (clock_timestamp() at time zone 'Asia/Tokyo')::date
  and um.status in ('PROGRESS', 'CLEAR', 'CLAIMED')
  and exists (
    select 1
    from public.gacha_execution_history history
    where history.user_id = um.user_id
      and history.status = 'COMPLETED'
      and history.payment_source = 'free'
      and history.pull_count = 10
      and history.gacha_id in ('CHAR_NORMAL', 'SKILL_NORMAL', 'EQUIP_NORMAL')
      and coalesce(history.completed_at, history.created_at) >=
        ((clock_timestamp() at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo')
      and coalesce(history.completed_at, history.created_at) <
        (((clock_timestamp() at time zone 'Asia/Tokyo')::date + 1)::timestamp at time zone 'Asia/Tokyo')
  );

do $$
declare
  v_entry record;
begin
  for v_entry in
    select distinct um.user_id, um.cycle_date
    from public.user_missions um
    join public.missions m on m.id = um.mission_id
    where um.cycle_date = (clock_timestamp() at time zone 'Asia/Tokyo')::date
      and m.is_enabled
      and m.category = 'DAILY'
  loop
    perform public.refresh_daily_mission_completion_aggregates(v_entry.user_id, v_entry.cycle_date);
  end loop;
end;
$$;

revoke all on function public.refresh_daily_mission_completion_aggregates(uuid, date)
  from public, anon, authenticated;
revoke all on function public.on_daily_mission_authority_change()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
