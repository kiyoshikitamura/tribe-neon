do $$
declare
  v_definition text;
  v_payload jsonb;
begin
  if to_regprocedure('public.get_public_ranking_reward_master()') is null then
    raise exception 'public ranking reward master RPC is missing';
  end if;

  if has_function_privilege('anon', 'public.get_public_ranking_reward_master()', 'execute')
     or not has_function_privilege('authenticated', 'public.get_public_ranking_reward_master()', 'execute')
     or not has_function_privilege('service_role', 'public.get_public_ranking_reward_master()', 'execute') then
    raise exception 'public ranking reward master privilege mismatch';
  end if;

  select public.get_public_ranking_reward_master() into v_payload;
  if jsonb_array_length(coalesce(v_payload #> '{daily,POWER}', '[]'::jsonb)) <> 10
     or jsonb_array_length(coalesce(v_payload #> '{daily,GUILD_POWER}', '[]'::jsonb)) <> 10
     or jsonb_array_length(coalesce(v_payload #> '{daily,PVP}', '[]'::jsonb)) <> 10
     or jsonb_array_length(coalesce(v_payload #> '{daily,RAID_PERSONAL}', '[]'::jsonb)) <> 10 then
    raise exception 'Daily ranking reward projection mismatch';
  end if;

  if jsonb_array_length(coalesce(v_payload -> 'guildSeasonCosmetics', '[]'::jsonb)) <> 4 then
    raise exception 'pre-open Guild cosmetic projection mismatch';
  end if;

  select pg_get_functiondef('public.get_public_ranking_reward_master()'::regprocedure)
  into v_definition;
  if position('canonical_ranking_reward_payload' in v_definition) = 0
     or position('cosmetic_master' in v_definition) = 0
     or position('ranking_guild_power_season_master' in v_definition) = 0 then
    raise exception 'ranking reward projection is not Authority-backed';
  end if;
end;
$$;
