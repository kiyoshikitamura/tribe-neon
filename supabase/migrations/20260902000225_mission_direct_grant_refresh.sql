-- TN-10: ミッション報酬を直接付与し、確定した報酬内容をサイクル単位で監査可能にする。
begin;

do $$
begin
  if to_regprocedure('public.grant_present_payload(uuid,text,integer)') is null
    or to_regprocedure('public.claim_mission_reward(text)') is null
    or to_regprocedure('public.claim_all_mission_rewards(text[])') is null then
    raise exception 'TN-10 mission reward prerequisites are missing';
  end if;
end;
$$;

create table if not exists public.mission_reward_delivery_ledger (
  id uuid primary key default gen_random_uuid(),
  claim_key text not null unique,
  user_mission_id uuid not null references public.user_missions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  mission_id text not null references public.missions(id),
  cycle_date date,
  resolved_item_id text,
  item_quantity integer not null default 0 check (item_quantity >= 0),
  cash_quantity integer not null default 0 check (cash_quantity >= 0),
  delivery_status text not null check (delivery_status in ('PENDING', 'DELIVERED')),
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists mission_reward_delivery_ledger_owner_idx
  on public.mission_reward_delivery_ledger(user_id, delivered_at desc);

alter table public.mission_reward_delivery_ledger enable row level security;
drop policy if exists mission_reward_delivery_ledger_owner_read
  on public.mission_reward_delivery_ledger;
create policy mission_reward_delivery_ledger_owner_read
  on public.mission_reward_delivery_ledger
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.claim_mission_reward(p_mission_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_progress public.user_missions%rowtype;
  v_reward_item_id text;
  v_claim_key text;
  v_rewards jsonb := '[]'::jsonb;
begin
  if v_uid is null or p_mission_id is null then
    raise exception 'Player authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':missions', 0));
  perform public.sync_current_missions();

  select * into v_progress
  from public.user_missions
  where user_id = v_uid and mission_id = p_mission_id
  for update;
  if not found or v_progress.status <> 'CLEAR' then
    raise exception 'Mission reward is not claimable' using errcode = '23514';
  end if;

  select * into strict v_mission
  from public.missions
  where id = p_mission_id and is_enabled;

  v_reward_item_id := public.resolve_canonical_reward_item(v_mission.reward_item_id);
  v_claim_key := concat_ws(':', v_uid::text, p_mission_id, coalesce(v_progress.cycle_date::text, 'ONCE'));

  insert into public.mission_reward_delivery_ledger (
    claim_key, user_mission_id, user_id, mission_id, cycle_date,
    resolved_item_id, item_quantity, cash_quantity, delivery_status
  ) values (
    v_claim_key, v_progress.id, v_uid, p_mission_id, v_progress.cycle_date,
    nullif(v_reward_item_id, ''), greatest(coalesce(v_mission.reward_quantity, 0), 0),
    greatest(coalesce(v_mission.cash_reward, 0), 0), 'PENDING'
  );

  if coalesce(v_reward_item_id, '') <> '' and coalesce(v_mission.reward_quantity, 0) > 0 then
    perform public.grant_present_payload(v_uid, v_reward_item_id, v_mission.reward_quantity);
    v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
      'item_id', v_reward_item_id,
      'quantity', v_mission.reward_quantity
    ));
  end if;
  if coalesce(v_mission.cash_reward, 0) > 0 then
    perform public.grant_present_payload(v_uid, 'CASH', v_mission.cash_reward);
    v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
      'item_id', 'CASH',
      'quantity', v_mission.cash_reward
    ));
  end if;

  update public.user_missions
  set status = 'CLAIMED', claimed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_progress.id;

  insert into public.user_missions(user_id, mission_id, current_progress, progress_val, status)
  select v_uid, next.id, 0, 0, 'PROGRESS'
  from public.missions next
  where next.is_enabled
    and next.category = 'NORMAL'
    and next.prerequisite_mission_id = p_mission_id
  on conflict(user_id, mission_id) do nothing;

  update public.mission_reward_delivery_ledger
  set delivery_status = 'DELIVERED', delivered_at = clock_timestamp()
  where claim_key = v_claim_key;

  return jsonb_build_object(
    'claimed', true,
    'mission_id', p_mission_id,
    'delivery', 'DIRECT',
    'rewards', v_rewards
  );
end;
$$;

create or replace function public.claim_all_mission_rewards(p_mission_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entry record;
  v_count integer := 0;
  v_reward_item_id text;
  v_claim_key text;
  v_rewards jsonb := '[]'::jsonb;
begin
  if v_uid is null or p_mission_ids is null or cardinality(p_mission_ids) not between 1 and 100 then
    raise exception 'Invalid mission claim request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':missions', 0));
  perform public.sync_current_missions();

  for v_entry in
    select um.id as user_mission_id, um.cycle_date, um.mission_id, m.*
    from public.user_missions um
    join public.missions m on m.id = um.mission_id and m.is_enabled
    where um.user_id = v_uid
      and um.status = 'CLEAR'
      and um.mission_id in (select distinct unnest(p_mission_ids))
    order by m.display_order, um.mission_id
    for update of um
  loop
    v_reward_item_id := public.resolve_canonical_reward_item(v_entry.reward_item_id);
    v_claim_key := concat_ws(':', v_uid::text, v_entry.mission_id, coalesce(v_entry.cycle_date::text, 'ONCE'));

    insert into public.mission_reward_delivery_ledger (
      claim_key, user_mission_id, user_id, mission_id, cycle_date,
      resolved_item_id, item_quantity, cash_quantity, delivery_status
    ) values (
      v_claim_key, v_entry.user_mission_id, v_uid, v_entry.mission_id, v_entry.cycle_date,
      nullif(v_reward_item_id, ''), greatest(coalesce(v_entry.reward_quantity, 0), 0),
      greatest(coalesce(v_entry.cash_reward, 0), 0), 'PENDING'
    );

    if coalesce(v_reward_item_id, '') <> '' and coalesce(v_entry.reward_quantity, 0) > 0 then
      perform public.grant_present_payload(v_uid, v_reward_item_id, v_entry.reward_quantity);
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
        'mission_id', v_entry.mission_id,
        'item_id', v_reward_item_id,
        'quantity', v_entry.reward_quantity
      ));
    end if;
    if coalesce(v_entry.cash_reward, 0) > 0 then
      perform public.grant_present_payload(v_uid, 'CASH', v_entry.cash_reward);
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
        'mission_id', v_entry.mission_id,
        'item_id', 'CASH',
        'quantity', v_entry.cash_reward
      ));
    end if;

    update public.user_missions
    set status = 'CLAIMED', claimed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = v_entry.user_mission_id;

    insert into public.user_missions(user_id, mission_id, current_progress, progress_val, status)
    select v_uid, next.id, 0, 0, 'PROGRESS'
    from public.missions next
    where next.is_enabled
      and next.category = 'NORMAL'
      and next.prerequisite_mission_id = v_entry.mission_id
    on conflict(user_id, mission_id) do nothing;

    update public.mission_reward_delivery_ledger
    set delivery_status = 'DELIVERED', delivered_at = clock_timestamp()
    where claim_key = v_claim_key;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'claimed_count', v_count,
    'delivery', 'DIRECT',
    'rewards', v_rewards
  );
end;
$$;

revoke all on public.mission_reward_delivery_ledger from public, anon, authenticated;
grant select on public.mission_reward_delivery_ledger to authenticated;
grant all on public.mission_reward_delivery_ledger to service_role;
revoke all on function public.claim_mission_reward(text) from public, anon;
revoke all on function public.claim_all_mission_rewards(text[]) from public, anon;
grant execute on function public.claim_mission_reward(text) to authenticated;
grant execute on function public.claim_all_mission_rewards(text[]) to authenticated;

notify pgrst, 'reload schema';
commit;
