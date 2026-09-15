do $$
declare
  v_payload jsonb;
begin
  if to_regclass('public.ranking_reward_notifications') is null then
    raise exception 'ranking reward notification ledger missing';
  end if;
  if to_regprocedure('public.get_public_ranking_reward_master()') is null
     or to_regprocedure('public.get_my_pending_ranking_reward_notification()') is null
     or to_regprocedure('public.acknowledge_ranking_reward_notifications(uuid[])') is null then
    raise exception 'ranking reward notification RPC contract incomplete';
  end if;
  if has_table_privilege('authenticated','public.ranking_reward_notifications','SELECT')
     or has_table_privilege('authenticated','public.ranking_reward_notifications','UPDATE') then
    raise exception 'ranking reward notification ledger exposed directly';
  end if;
  if has_function_privilege('anon','public.get_public_ranking_reward_master()','EXECUTE')
     or has_function_privilege('anon','public.get_my_pending_ranking_reward_notification()','EXECUTE')
     or has_function_privilege('anon','public.acknowledge_ranking_reward_notifications(uuid[])','EXECUTE') then
    raise exception 'ranking reward RPC exposed to anon';
  end if;
  if not has_function_privilege('authenticated','public.get_public_ranking_reward_master()','EXECUTE')
     or not has_function_privilege('authenticated','public.get_my_pending_ranking_reward_notification()','EXECUTE')
     or not has_function_privilege('authenticated','public.acknowledge_ranking_reward_notifications(uuid[])','EXECUTE') then
    raise exception 'ranking reward RPC unavailable to authenticated users';
  end if;
  select public.canonical_ranking_reward_payload() into v_payload;
  if coalesce(jsonb_array_length(v_payload#>'{progression,PVP}'),0)=0
     or coalesce(jsonb_array_length(v_payload#>'{progression,RAID_PERSONAL}'),0)=0
     or coalesce(jsonb_array_length(v_payload#>'{progression,RAID_GUILD}'),0)=0 then
    raise exception 'canonical season ranking reward master incomplete';
  end if;
  -- This is an explicit safety assertion, not a missing migration feature:
  -- daily ranking rewards must remain absent until canonical values are frozen.
  if v_payload#>'{dailyProgression}' is not null then
    raise exception 'unexpected daily ranking reward master requires reviewed grant implementation';
  end if;
end;
$$;
