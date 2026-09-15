-- TN-02: free-gacha and daily-mission server authority convergence.
begin;

do $$
begin
  if to_regclass('public.gacha_execution_history') is null
    or to_regclass('public.user_daily_gacha_claims') is null
    or to_regclass('public.user_missions') is null
    or to_regclass('public.missions') is null
    or to_regclass('public.board_posts') is null
    or to_regclass('public.canonical_master_freeze_versions') is null then
    raise exception 'TN-02 prerequisite relation is missing';
  end if;
  if to_regprocedure('public.evaluate_mission_progress(uuid,text,integer)') is null then
    raise exception 'TN-02 prerequisite mission evaluator is missing';
  end if;
  if not exists (
    select 1
    from public.canonical_master_freeze_versions
    where domain = 'MISSION' and version = '2026-08-30'
  ) then
    raise exception 'TN-02 canonical mission base payload is missing';
  end if;
end;
$$;

-- The tutorial RPC inserts this authority row before granting any draw result.
-- Its free entitlement therefore participates in the same transaction as the
-- tutorial result. Replays are exempt because the tutorial RPC resolves the
-- existing request after its ON CONFLICT insert.
create or replace function public.consume_tutorial_character_daily_free_gacha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_consumed integer := 0;
begin
  if new.gacha_id <> 'CHAR_NORMAL'
    or new.payment_source <> 'free'
    or new.pull_count <> 10
    or not exists (
      select 1
      from public.tutorial_progress progress
      where progress.user_id = new.user_id
        and progress.step_id = 'FREE_GACHA'
    ) then
    return new;
  end if;

  if exists (
    select 1
    from public.gacha_execution_history history
    where history.user_id = new.user_id
      and history.request_id = new.request_id
  ) then
    return new;
  end if;

  insert into public.user_daily_gacha_claims (
    user_id, gacha_type, last_claimed_date, updated_at
  ) values (
    new.user_id, 'CHARACTER', v_today, clock_timestamp()
  )
  on conflict (user_id, gacha_type) do update
  set last_claimed_date = excluded.last_claimed_date,
      updated_at = excluded.updated_at
  where public.user_daily_gacha_claims.last_claimed_date < excluded.last_claimed_date;

  get diagnostics v_consumed = row_count;
  if v_consumed <> 1 then
    raise exception 'daily free gacha already claimed' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists consume_tutorial_character_daily_free_gacha_trigger
on public.gacha_execution_history;
create trigger consume_tutorial_character_daily_free_gacha_trigger
before insert on public.gacha_execution_history
for each row execute function public.consume_tutorial_character_daily_free_gacha();

create or replace function public.evaluate_mission_progress(
  p_user_id uuid,
  p_trigger_type text,
  p_progress_increment integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_types text[];
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Mission progress owner mismatch' using errcode = '42501';
  end if;
  if p_trigger_type is null
    or btrim(p_trigger_type) = ''
    or p_progress_increment not between 1 and 1000 then
    raise exception 'Invalid mission progress event' using errcode = '22023';
  end if;

  v_types := case p_trigger_type
    when 'GACHA_PULL' then array['NORMAL_FREE_GACHA_PULL_COUNT']
    when 'CHAR_LEVEL_UP' then array['CHARACTER_ENHANCE_COUNT', 'CHARACTER_LEVEL_AT_LEAST']
    when 'GEAR_UPGRADE' then array['EQUIPMENT_ENHANCE_COUNT', 'EQUIPMENT_LEVEL_AT_LEAST']
    when 'GEAR_LIMIT_BREAK' then array['EQUIPMENT_LIMIT_BREAK_COUNT']
    when 'SKILL_LIMIT_BREAK' then array['SKILL_ENHANCE_COUNT', 'SKILL_LEVEL_AT_LEAST']
    when 'PATROL_CLEAR' then array['QUEST_COMPLETE_COUNT']
    when 'PVP_FINALIZED' then array['PVP_FINALIZED_BATTLE_COUNT']
    when 'PVP_BATTLE_COUNT' then array['PVP_FINALIZED_BATTLE_COUNT']
    when 'PVP_WIN' then array['PVP_WIN_COUNT']
    when 'RAID_FINALIZED' then array['RAID_FINALIZED_BATTLE_COUNT']
    when 'RAID_CLEAR_ELIGIBLE' then array['RAID_CLEAR_ELIGIBLE_COUNT']
    when 'GUILD_JOIN' then array['GUILD_JOIN_COUNT']
    when 'GUILD_ACTIVITY' then array['GUILD_ACTIVITY_COUNT']
    when 'GUILD_CHAT' then array['GUILD_ACTIVITY_COUNT']
    when 'GVG_FINALIZED' then array['GVG_FINALIZED_BATTLE_COUNT']
    when 'GVG_WIN' then array['GVG_WIN_COUNT']
    else array[p_trigger_type]
  end;

  update public.user_missions um
  set current_progress = least(m.target_value, um.current_progress + p_progress_increment),
      progress_val = least(m.target_value, um.current_progress + p_progress_increment),
      status = case
        when um.current_progress + p_progress_increment >= m.target_value then 'CLEAR'
        else 'PROGRESS'
      end,
      updated_at = clock_timestamp()
  from public.missions m
  where um.user_id = p_user_id
    and um.mission_id = m.id
    and m.is_enabled
    and m.trigger_type = any(v_types)
    and um.status = 'PROGRESS';
end;
$$;

create or replace function public.dispatch_completed_free_normal_gacha_mission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'COMPLETED'
    and old.status is distinct from new.status
    and new.payment_source = 'free'
    and new.pull_count = 10
    and new.gacha_id in ('CHAR_NORMAL', 'SKILL_NORMAL', 'EQUIP_NORMAL') then
    perform public.evaluate_mission_progress(new.user_id, 'GACHA_PULL', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists dispatch_completed_free_normal_gacha_mission_trigger
on public.gacha_execution_history;
create trigger dispatch_completed_free_normal_gacha_mission_trigger
after update of status on public.gacha_execution_history
for each row execute function public.dispatch_completed_free_normal_gacha_mission();

create or replace function public.dispatch_guild_chat_mission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.user_id, new.author_id);
begin
  if new.target_type = 'GUILD'
    and not coalesce(new.is_system, false)
    and v_user_id is not null then
    perform public.evaluate_mission_progress(v_user_id, 'GUILD_CHAT', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists dispatch_guild_chat_mission_trigger on public.board_posts;
create trigger dispatch_guild_chat_mission_trigger
after insert on public.board_posts
for each row execute function public.dispatch_guild_chat_mission();

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
  if old.status is not distinct from new.status then
    return new;
  end if;
  select * into v_mission from public.missions where id = new.mission_id;
  if not found
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
for each row execute function public.on_daily_mission_authority_change();

update public.missions
set title = 'ギルドで発言しよう',
    desc_text = 'ギルドで発言しよう',
    description = 'ギルドで発言しよう'
where id = 'MIS_D_006';

with source as (
  select payload
  from public.canonical_master_freeze_versions
  where domain = 'MISSION' and version = '2026-08-30'
), rewritten as (
  select jsonb_set(
    jsonb_set(source.payload, '{version}', to_jsonb('2026-09-02'::text)),
    '{missions}',
    (
      select jsonb_agg(
        case when mission.value->>'id' = 'MIS_D_006'
          then mission.value || jsonb_build_object(
            'title', 'ギルドで発言しよう',
            'description', 'ギルドで発言しよう'
          )
          else mission.value
        end
        order by mission.ordinality
      )
      from jsonb_array_elements(source.payload->'missions') with ordinality mission(value, ordinality)
    )
  ) as payload
  from source
)
insert into public.canonical_master_freeze_versions (
  domain, version, payload, is_production_enabled
)
select 'MISSION', '2026-09-02', payload, true from rewritten
on conflict (domain, version) do update
set payload = excluded.payload,
    is_production_enabled = true;

update public.canonical_master_freeze_versions
set is_production_enabled = false
where domain = 'MISSION' and version <> '2026-09-02';

do $$
declare
  v_entry record;
begin
  for v_entry in
    select distinct user_id, cycle_date
    from public.user_missions
    where cycle_date = (clock_timestamp() at time zone 'Asia/Tokyo')::date
  loop
    perform public.refresh_daily_mission_completion_aggregates(v_entry.user_id, v_entry.cycle_date);
  end loop;
end;
$$;

revoke all on function public.consume_tutorial_character_daily_free_gacha() from public, anon, authenticated;
revoke all on function public.evaluate_mission_progress(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.dispatch_completed_free_normal_gacha_mission() from public, anon, authenticated;
revoke all on function public.dispatch_guild_chat_mission() from public, anon, authenticated;
revoke all on function public.refresh_daily_mission_completion_aggregates(uuid, date) from public, anon, authenticated;
revoke all on function public.on_daily_mission_authority_change() from public, anon, authenticated;

do $$
begin
  if (select title from public.missions where id = 'MIS_D_006') <> 'ギルドで発言しよう' then
    raise exception 'TN-02 guild mission copy mismatch';
  end if;
  if not exists (
    select 1 from public.canonical_master_freeze_versions
    where domain = 'MISSION' and version = '2026-09-02' and is_production_enabled
  ) then
    raise exception 'TN-02 canonical mission payload was not activated';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
