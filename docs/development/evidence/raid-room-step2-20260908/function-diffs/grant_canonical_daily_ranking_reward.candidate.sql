create or replace function public.grant_canonical_daily_ranking_reward(
  p_ranking_day_key date,
  p_ranking_type text,
  p_recipient_user_id uuid,
  p_ranked_entity_id uuid,
  p_rank_position integer,
  p_score bigint
) returns integer language plpgsql security definer set search_path=public as $$
declare v_award_id uuid; v_reward record; v_granted integer:=0; v_master_count integer;
begin
  if p_ranking_type='RAID_PERSONAL' then return 0; end if;
  if p_ranking_type not in ('POWER','GUILD_POWER','PVP','RAID_PERSONAL')
     or p_rank_position not between 1 and 100 then
    raise exception 'invalid daily ranking award' using errcode='22023';
  end if;
  select count(*) into v_master_count
  from public.canonical_daily_ranking_reward_master master
  where master.version='2026-09-03' and master.is_production_enabled
    and master.ranking_type=p_ranking_type
    and p_rank_position between master.rank_min and master.rank_max;
  if v_master_count<>2 then
    raise exception 'daily ranking reward master must resolve exactly two items' using errcode='23514';
  end if;

  insert into public.ranking_daily_reward_awards(
    ranking_day_key,ranking_type,recipient_user_id,ranked_entity_id,rank_position,score
  ) values(p_ranking_day_key,p_ranking_type,p_recipient_user_id,p_ranked_entity_id,p_rank_position,p_score)
  on conflict(ranking_day_key,ranking_type,recipient_user_id) do nothing
  returning id into v_award_id;
  if v_award_id is null then return 0; end if;

  for v_reward in
    select master.item_id,master.quantity
    from public.canonical_daily_ranking_reward_master master
    where master.version='2026-09-03' and master.is_production_enabled
      and master.ranking_type=p_ranking_type
      and p_rank_position between master.rank_min and master.rank_max
    order by master.item_id
  loop
    insert into public.ranking_daily_reward_item_grants(award_id,item_id,quantity)
    values(v_award_id,v_reward.item_id,v_reward.quantity);
    insert into public.user_items(user_id,item_id,quantity)
    values(p_recipient_user_id,v_reward.item_id,v_reward.quantity)
    on conflict(user_id,item_id) do update set
      quantity=public.user_items.quantity+excluded.quantity,updated_at=clock_timestamp();
    v_granted:=v_granted+1;
  end loop;

  insert into public.ranking_reward_notifications(
    recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
  ) values(p_recipient_user_id,'DAILY',p_ranking_day_key::text,clock_timestamp(),null)
  on conflict(recipient_user_id,period_kind,period_key) do update set
    awarded_at=excluded.awarded_at,acknowledged_at=null;
  return v_granted;
end;
$$;