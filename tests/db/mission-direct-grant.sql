\set ON_ERROR_STOP on
begin;

insert into public.users(id, username, current_base_id)
values ('25100000-0000-4000-8000-000000000001', '報酬直結2510', 'shinjuku');

set local role authenticated;
select set_config('request.jwt.claim.sub', '25100000-0000-4000-8000-000000000001', true);
select public.sync_current_missions();
reset role;

update public.user_missions
set current_progress = 10, progress_val = 10, status = 'CLEAR'
where user_id = '25100000-0000-4000-8000-000000000001'
  and mission_id = 'MIS_N_B001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '25100000-0000-4000-8000-000000000001', true);
select public.claim_mission_reward('MIS_N_B001');
reset role;

do $$
declare
  v_resolved text;
begin
  select resolved_item_id into v_resolved
  from public.mission_reward_delivery_ledger
  where user_id = '25100000-0000-4000-8000-000000000001'
    and mission_id = 'MIS_N_B001'
    and delivery_status = 'DELIVERED';
  if v_resolved not in (
    'NORMAL_GACHA_TICKET_CHARACTER',
    'NORMAL_GACHA_TICKET_SKILL',
    'NORMAL_GACHA_TICKET_EQUIPMENT'
  ) then
    raise exception 'resolved random reward was not audited: %', v_resolved;
  end if;
  if not exists (
    select 1 from public.user_items
    where user_id = '25100000-0000-4000-8000-000000000001'
      and item_id = v_resolved and quantity = 1
  ) then
    raise exception 'resolved random reward was not granted directly';
  end if;
  if exists (
    select 1 from public.presents
    where user_id = '25100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'single mission claim created a present';
  end if;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '25100000-0000-4000-8000-000000000001', true);
  begin
    perform public.claim_mission_reward('MIS_N_B001');
    raise exception 'duplicate mission claim unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

update public.user_missions
set current_progress = target.target_value,
    progress_val = target.target_value,
    status = 'CLEAR'
from public.missions target
where public.user_missions.user_id = '25100000-0000-4000-8000-000000000001'
  and public.user_missions.mission_id = target.id
  and target.id in ('MIS_D_001', 'MIS_N_P001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '25100000-0000-4000-8000-000000000001', true);
select public.claim_all_mission_rewards(array['MIS_D_001', 'MIS_N_P001', 'MIS_D_001']);
reset role;

do $$
begin
  if (select cash from public.users where id = '25100000-0000-4000-8000-000000000001') <> 2700 then
    raise exception 'bulk CASH reward was not granted directly exactly once';
  end if;
  if not exists (
    select 1 from public.user_items
    where user_id = '25100000-0000-4000-8000-000000000001'
      and item_id = 'CHAR_EXP_S' and quantity = 1
  ) then
    raise exception 'bulk item reward was not granted directly';
  end if;
  if (select count(*) from public.mission_reward_delivery_ledger
      where user_id = '25100000-0000-4000-8000-000000000001'
        and delivery_status = 'DELIVERED') <> 3 then
    raise exception 'delivery ledger count mismatch';
  end if;
  if exists (
    select 1 from public.presents
    where user_id = '25100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'bulk mission claim created a present';
  end if;
end;
$$;

rollback;
