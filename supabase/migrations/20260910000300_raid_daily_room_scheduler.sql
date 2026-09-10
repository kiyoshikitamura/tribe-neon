begin;

-- Daily auto-hosted Rooms use a non-player owner because raid_rooms.owner_user_id
-- is intentionally NOT NULL and existing projections require an owner profile.
-- This row is never authenticated and cannot initiate battles or receive rewards.
do $$
begin
  insert into public.users(id, username, level, favorite_character_id)
  values ('00000000-0000-0000-0000-524149445359'::uuid, 'RaidHost', 1, null)
  on conflict (id) do nothing;
end;
$$;

-- A daily target/variant can have at most one scheduler-owned Boss instance.
create unique index if not exists raid_bosses_daily_variant_unique
  on public.raid_bosses (raid_day_key, raid_variant_id)
  where raid_day_key like 'DAILY:%' and raid_variant_id is not null;

-- Daily system Rooms are public to authenticated Raid browsers. User-owned
-- Rooms retain the existing owner/member/progress visibility rules.
create or replace function public.raid_room_can_read_v1(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where r.id = p_room_id
      and (
        (b.raid_day_key like 'DAILY:%' and b.status = 'ACTIVE'
          and b.current_hp > 0 and b.expires_at > statement_timestamp()
          and b.outcome_finalized_at is null)
        or (b.rotation_date = (statement_timestamp() at time zone 'Asia/Tokyo')::date
          and b.status = 'ACTIVE' and b.current_hp > 0
          and b.expires_at > statement_timestamp()
          and b.outcome_finalized_at is null
          and exists (
            select 1 from private.raid_daily_targets d
            where d.date_jst = (statement_timestamp() at time zone 'Asia/Tokyo')::date
              and b.raid_variant_id in (d.first_variant_id, d.second_variant_id)
          ))
        or r.owner_user_id = auth.uid()
        or exists (
          select 1 from public.raid_room_members m
          where m.room_id = r.id and m.user_id = auth.uid()
        )
        or exists (
          select 1 from public.raid_instance_user_progress p
          where p.raid_boss_instance_id = r.raid_boss_instance_id
            and p.user_id = auth.uid() and p.finalized_battles > 0
        )
      )
  )
$$;
revoke all on function public.raid_room_can_read_v1(uuid) from public, anon, authenticated;

-- Idempotently materialize the two authoritative JST targets as beginner Rooms.
-- This is an internal scheduler entrypoint; it is not a client RPC.
create or replace function public.ensure_daily_raid_rooms_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_system_owner constant uuid := '00000000-0000-0000-0000-524149445359'::uuid;
  v_day date;
  v_now timestamptz;
  v_target record;
  v_variant public.canonical_raid_variants%rowtype;
  v_rule public.raid_room_lifecycle_rules%rowtype;
  v_instance_id uuid;
  v_room_id uuid;
  v_was_existing boolean;
  v_created integer := 0;
  v_existing integer := 0;
  v_rooms jsonb := '[]'::jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'read committed required' using errcode = '25001';
  end if;

  -- private.raid_daily_targets_v1() intentionally requires an authenticated
  -- context. The fixed internal owner is only used as that scheduler identity.
  perform set_config('request.jwt.claim.sub', v_system_owner::text, true);
  v_day := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  perform pg_advisory_xact_lock(
    hashtextextended('raid_daily_room_generation:' || v_day::text, 0)
  );

  -- Resolve/initialize today's two-target authority once, then freeze the day.
  -- Recheck across midnight so a boundary during the first call cannot leave
  -- the scheduler with a stale date and zero targets.
  loop
    v_day := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
    perform private.raid_daily_targets_v1();
    exit when v_day = (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  end loop;

  select * into v_rule
  from public.raid_room_lifecycle_rules
  where difficulty = 'beginner'
  for update;
  if not found then
    raise exception 'beginner lifecycle rule unavailable' using errcode = '55000';
  end if;

  for v_target in
    select date_jst, first_variant_id as variant_id
    from private.raid_daily_targets
    where date_jst = v_day
    union all
    select date_jst, second_variant_id
    from private.raid_daily_targets
    where date_jst = v_day
  loop
    select * into v_variant
    from public.canonical_raid_variants
    where raid_variant_id = v_target.variant_id
      and is_production_enabled
    for share;
    if not found or v_variant.max_hp is null or v_variant.max_hp <= 0 then
      raise exception 'daily raid variant unavailable: %', v_target.variant_id
        using errcode = '55000';
    end if;

    v_now := clock_timestamp();
    select r.id into v_room_id
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.rotation_date = v_day
      and b.raid_variant_id = v_target.variant_id
      and r.difficulty_id = 'beginner'
      and b.status = 'ACTIVE'
      and b.current_hp > 0
      and b.expires_at > v_now
      and b.outcome_finalized_at is null
    order by r.created_at, r.id
    limit 1;

    if found then
      v_was_existing := true;
      v_existing := v_existing + 1;
    else
      v_was_existing := false;
      if (
        select count(*)
        from public.raid_rooms r
        join public.raid_bosses b on b.id = r.raid_boss_instance_id
        where r.difficulty_id = 'beginner'
          and b.status = 'ACTIVE'
          and b.current_hp > 0
          and b.expires_at > v_now
          and b.outcome_finalized_at is null
      ) >= v_rule.max_active_rooms then
        raise exception 'active beginner room limit reached' using errcode = '55000';
      end if;

      v_instance_id := gen_random_uuid();
      insert into public.raid_bosses(
        id, boss_id, boss_master_id, current_hp, max_hp, base_id, status,
        spawned_at, expires_at, cycle_id, rotation_date, raid_variant_id, raid_day_key
      ) values (
        v_instance_id,
        v_variant.raid_variant_id,
        v_variant.raid_variant_id,
        v_variant.max_hp,
        v_variant.max_hp,
        lower(v_variant.area_id),
        'ACTIVE',
        v_now,
        v_now + make_interval(hours => v_rule.duration_hours),
        gen_random_uuid(),
        v_day,
        v_variant.raid_variant_id,
        'DAILY:' || v_day::text || ':' || v_variant.raid_variant_id
      );

      v_room_id := gen_random_uuid();
      insert into public.raid_rooms(
        id, raid_boss_instance_id, owner_user_id, difficulty_id, created_at
      ) values (
        v_room_id, v_instance_id, v_system_owner, 'beginner', v_now
      );
      insert into public.raid_room_members(room_id, user_id, joined_at)
      values (v_room_id, v_system_owner, v_now);
      v_created := v_created + 1;
    end if;

    v_rooms := v_rooms || jsonb_build_array(jsonb_build_object(
      'dateJst', v_day,
      'variantId', v_target.variant_id,
      'roomId', v_room_id,
      'created', not v_was_existing
    ));
  end loop;

  return jsonb_build_object(
    'dateJst', v_day,
    'created', v_created,
    'existing', v_existing,
    'rooms', v_rooms
  );
end;
$$;

revoke all on function public.ensure_daily_raid_rooms_v1() from public, anon, authenticated, service_role;
grant execute on function public.ensure_daily_raid_rooms_v1() to service_role;

-- Separate responsibility from raid-room-expiry-minute. Frequent retries make
-- a missed midnight harmless while the daily advisory lock makes them safe.
do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'raid-daily-room-start';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'raid-daily-room-start',
    '*/5 * * * *',
    $job$select public.ensure_daily_raid_rooms_v1();$job$
  );
end;
$schedule$;

commit;
notify pgrst, 'reload schema';
