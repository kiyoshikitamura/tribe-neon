do $$
declare
  v_single_definition text;
  v_all_definition text;
begin
  if to_regclass('public.mission_reward_delivery_ledger') is null then
    raise exception 'TN-10 delivery ledger is missing';
  end if;

  select pg_get_functiondef('public.claim_mission_reward(text)'::regprocedure)
    into v_single_definition;
  select pg_get_functiondef('public.claim_all_mission_rewards(text[])'::regprocedure)
    into v_all_definition;

  if position('grant_present_payload' in v_single_definition) = 0
    or position('grant_present_payload' in v_all_definition) = 0
    or position('''DIRECT''' in v_single_definition) = 0
    or position('''DIRECT''' in v_all_definition) = 0 then
    raise exception 'TN-10 direct mission delivery contract is incomplete';
  end if;
  if position('insert into public.presents' in lower(v_single_definition)) > 0
    or position('insert into public.presents' in lower(v_all_definition)) > 0 then
    raise exception 'TN-10 mission claim still routes rewards through presents';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mission_reward_delivery_ledger'
      and policyname = 'mission_reward_delivery_ledger_owner_read'
  ) then
    raise exception 'TN-10 delivery ledger owner policy is missing';
  end if;
end;
$$;
