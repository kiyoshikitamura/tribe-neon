begin;
do $$
declare
  v_payload jsonb;
begin
  select public.get_public_ranking_reward_master() into v_payload;

  if (select count(*) from jsonb_object_keys(v_payload -> 'daily')) <> 4 then
    raise exception 'expected four Daily ranking categories';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'guildSeasonCosmetics') reward
    where reward ->> 'rewardKind' <> 'GUILD_COSMETIC'
  ) or jsonb_array_length(v_payload -> 'guildSeasonCosmetics') <> 4 then
    raise exception 'Guild cosmetic reward projection mismatch';
  end if;
  if has_function_privilege('anon', 'public.get_public_ranking_reward_master()', 'execute')
     or not has_function_privilege('authenticated', 'public.get_public_ranking_reward_master()', 'execute') then
    raise exception 'ranking reward projection privilege mismatch';
  end if;
end;
$$;
rollback;
