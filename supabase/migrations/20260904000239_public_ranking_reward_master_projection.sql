-- Forward-only public projection for ranking reward presentation.
-- Preview intentionally keeps 00233 on HOLD; expose only the read contract
-- required by the ranking page and source Guild cosmetics from DB Authority.
begin;

do $$
begin
  if to_regprocedure('public.canonical_ranking_reward_payload()') is null
     or to_regclass('public.cosmetic_master') is null
     or to_regclass('public.ranking_guild_power_season_master') is null then
    raise exception 'public ranking reward projection prerequisites are missing';
  end if;
end;
$$;

create or replace function public.get_public_ranking_reward_master()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_guild_cosmetics jsonb;
begin
  v_payload := public.canonical_ranking_reward_payload();

  select coalesce(jsonb_agg(jsonb_build_object(
    'cosmeticId', cosmetic.id,
    'displayName', cosmetic.display_name,
    'rewardKind', 'GUILD_COSMETIC',
    'quantity', 1,
    'isParticipation', cosmetic.id = 'guild_preopen_2026_participation',
    'eligibilityLabel', case
      when cosmetic.id = 'guild_preopen_2026_participation' then '参加ギルド'
      else null
    end,
    'rankMin', case cosmetic.id
      when 'guild_preopen_2026_rank_1' then 1
      when 'guild_preopen_2026_rank_2' then 2
      when 'guild_preopen_2026_rank_3' then 3
      else null
    end,
    'rankMax', case cosmetic.id
      when 'guild_preopen_2026_rank_1' then 1
      when 'guild_preopen_2026_rank_2' then 2
      when 'guild_preopen_2026_rank_3' then 3
      else null
    end
  ) order by case cosmetic.id
    when 'guild_preopen_2026_participation' then 0
    when 'guild_preopen_2026_rank_1' then 1
    when 'guild_preopen_2026_rank_2' then 2
    when 'guild_preopen_2026_rank_3' then 3
    else 99
  end), '[]'::jsonb)
  into v_guild_cosmetics
  from public.cosmetic_master cosmetic
  where cosmetic.active
    and cosmetic.owner_scope = 'GUILD'
    and cosmetic.source_type = 'RANKING'
    and cosmetic.source_reference = 'PREOPEN_GUILD_POWER_2026'
    and exists (
      select 1
      from public.ranking_guild_power_season_master season_master
      where season_master.event_key = 'PREOPEN_GUILD_POWER_2026'
    );

  return v_payload || jsonb_build_object(
    'guildSeasonCosmetics', v_guild_cosmetics
  );
end;
$$;

revoke all on function public.get_public_ranking_reward_master()
  from public, anon, authenticated;
grant execute on function public.get_public_ranking_reward_master()
  to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
