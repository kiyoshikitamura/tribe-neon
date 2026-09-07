-- Restore the Production-only daily ranking activity contract to source control.
-- This migration is intentionally non-destructive for the existing Production table.

create table if not exists public.ranking_daily_activity_snapshots (
  ranking_day_key date not null,
  user_id uuid not null references public.users(id) on delete cascade,
  total_power bigint not null check (total_power >= 0),
  guild_id uuid,
  first_active_at timestamptz not null,
  last_active_at timestamptz not null,
  primary key (ranking_day_key, user_id)
);

alter table public.ranking_daily_activity_snapshots enable row level security;
revoke all on table public.ranking_daily_activity_snapshots from public, anon, authenticated;
grant all on table public.ranking_daily_activity_snapshots to service_role;

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

  insert into public.ranking_daily_activity_snapshots (
    ranking_day_key, user_id, total_power, guild_id, first_active_at, last_active_at
  ) values (
    v_day, v_uid, v_power, v_guild_id, v_now, v_now
  )
  on conflict (ranking_day_key, user_id) do update
  set total_power = excluded.total_power,
      guild_id = excluded.guild_id,
      first_active_at = least(public.ranking_daily_activity_snapshots.first_active_at, excluded.first_active_at),
      last_active_at = greatest(public.ranking_daily_activity_snapshots.last_active_at, excluded.last_active_at);

  select count(*) into v_count
  from public.users
  where last_active_at >= v_now - interval '5 minutes';
  return v_count;
end;
$$;

revoke all on function public.sync_active_users() from public, anon;
grant execute on function public.sync_active_users() to authenticated;
