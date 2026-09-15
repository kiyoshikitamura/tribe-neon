begin;

-- Human Acceptance 2026-09-01: PvP has one player formation. Retire the
-- defense-deck concept from opponent selection without deleting historical
-- defense rows/logs, and give a first-PvP user a lower-power candidate first.
create or replace function public.get_pvp_opponents_page(
  p_user_id uuid,
  p_my_points integer,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_my_power bigint;
  v_total integer;
  v_effective_offset integer;
  v_items jsonb;
  v_first_pvp_pending boolean;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_offset < 0 or p_offset > 10000 then
    raise exception 'invalid pagination' using errcode='22023';
  end if;

  select coalesce(total_power,0) into v_my_power
  from public.user_power_rankings where user_id=p_user_id;
  v_first_pvp_pending := not exists(
    select 1 from public.user_funnel_milestones
    where user_id=p_user_id and milestone='first_pvp'
  );

  select count(distinct player.id)::integer into v_total
  from public.users player
  join public.user_main_formations formation on formation.user_id=player.id
  where player.id<>p_user_id;

  v_effective_offset := case
    when v_total=0 then 0
    when p_offset>=v_total then 0
    else p_offset
  end;

  with daily_scores as (
    select rank.user_id,coalesce(daily.wins,0) score
    from public.pvp_ranks rank
    left join public.pvp_daily_wins daily
      on daily.user_id=rank.user_id
     and daily.activity_date=(clock_timestamp() at time zone 'Asia/Tokyo')::date
  ), daily_ranked as (
    select user_id,dense_rank() over(order by score desc,user_id) rank_position
    from daily_scores
  ), candidates as (
    select player.id,player.username,coalesce(rank.rank_points,1000) rating,
      coalesce(power.total_power,0) total_power,'BALANCED'::text tactic,
      array_agg(formation.user_character_id::text order by formation.slot) character_ids,
      daily_ranked.rank_position opponent_rank,
      case
        when abs(coalesce(rank.rank_points,1000)-coalesce(p_my_points,1000))<=300
          and (coalesce(v_my_power,0)<=0 or coalesce(power.total_power,0)*10000 between v_my_power*7000 and v_my_power*14000) then 1
        when abs(coalesce(rank.rank_points,1000)-coalesce(p_my_points,1000))<=500
          and (coalesce(v_my_power,0)<=0 or coalesce(power.total_power,0)*10000 between v_my_power*5000 and v_my_power*18000) then 2
        else 3
      end match_tier
    from public.users player
    join public.user_main_formations formation on formation.user_id=player.id
    left join public.pvp_ranks rank on rank.user_id=player.id
    left join public.user_power_rankings power on power.user_id=player.id
    left join daily_ranked on daily_ranked.user_id=player.id
    where player.id<>p_user_id
    group by player.id,player.username,rank.rank_points,power.total_power,daily_ranked.rank_position
  ), selected as (
    select * from candidates
    order by
      case when v_first_pvp_pending and v_my_power>0 and total_power<v_my_power then 0 else 1 end,
      case when v_first_pvp_pending then abs(v_my_power-total_power) else match_tier end,
      match_tier,abs(rating-coalesce(p_my_points,1000)),id
    limit 5 offset v_effective_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'opponent_user_id',id,'opponent_username',username,'opponent_points',rating,
    'opponent_power',total_power,'opponent_rank',opponent_rank,'match_tier',match_tier,
    'rating_difference',rating-coalesce(p_my_points,1000),
    'opponent_class',case when total_power<coalesce(v_my_power,0) then 'WEAKER' when total_power>coalesce(v_my_power,0) then 'STRONGER' else 'EQUAL' end,
    'win_rating_delta',public.canonical_pvp_rating_delta(coalesce(p_my_points,1000),rating,'WIN'),
    'loss_rating_delta',public.canonical_pvp_rating_delta(coalesce(p_my_points,1000),rating,'LOSS'),
    'tactic',tactic,'defense_character_ids',to_jsonb(character_ids),
    'defense_characters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot',picked.ordinality,'character_master_id',release.character_id,
        'display_name',release.display_name,'rarity',release.rarity,
        'level',coalesce(owned.level,1),'asset_identifier',release.asset_path
      ) order by picked.ordinality)
      from unnest(selected.character_ids) with ordinality picked(owned_id,ordinality)
      join public.user_characters owned on owned.user_id=selected.id and owned.id::text=picked.owned_id
      join public.character_release_master release on release.character_id=owned.character_id and release.is_enabled
    ),'[]'::jsonb)
  ) order by
    case when v_first_pvp_pending and v_my_power>0 and total_power<v_my_power then 0 else 1 end,
    case when v_first_pvp_pending then abs(v_my_power-total_power) else match_tier end,
    match_tier,abs(rating-coalesce(p_my_points,1000)),id),'[]'::jsonb)
  into v_items from selected;

  return jsonb_build_object(
    'items',v_items,'total_count',v_total,'offset',v_effective_offset,
    'next_offset',case when v_total<=5 then 0 when v_effective_offset+5>=v_total then 0 else v_effective_offset+5 end
  );
end $$;

revoke all on function public.get_pvp_opponents_page(uuid,integer,integer) from public,anon;
grant execute on function public.get_pvp_opponents_page(uuid,integer,integer) to authenticated;

commit;
notify pgrst,'reload schema';
