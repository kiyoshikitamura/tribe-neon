begin;
do $$
declare v_definition text; v_payload jsonb;
begin
  if (select count(distinct ranking_type) from public.canonical_daily_ranking_reward_master
      where version='2026-09-03' and is_production_enabled)<>4
     or (select count(*) from public.canonical_daily_ranking_reward_master
      where version='2026-09-03' and is_production_enabled)<>40 then
    raise exception 'expected four Daily categories and forty item-tier rows';
  end if;
  if exists(
    select 1 from unnest(array['POWER','GUILD_POWER','PVP','RAID_PERSONAL']) as category(ranking_type)
    cross join (values (1,2,'CHAR_EXP_L'),(1,2,'EQUIP_EXP_L'),
      (2,1,'CHAR_EXP_L'),(2,1,'EQUIP_EXP_L'),(4,3,'CHAR_EXP_M'),(4,3,'EQUIP_EXP_M'),
      (11,2,'CHAR_EXP_M'),(11,2,'EQUIP_EXP_M'),(31,1,'CHAR_EXP_M'),(31,1,'EQUIP_EXP_M'))
      expected(rank_position,quantity,item_id)
    where not exists(select 1 from public.canonical_daily_ranking_reward_master master
      where master.version='2026-09-03' and master.ranking_type=category.ranking_type
        and expected.rank_position between master.rank_min and master.rank_max
        and master.item_id=expected.item_id and master.quantity=expected.quantity)
  ) then raise exception 'Workbook M7 Daily reward tier mismatch'; end if;
  if not exists(select 1 from pg_constraint constraint_row
    where constraint_row.conrelid='public.ranking_daily_reward_awards'::regclass
      and constraint_row.contype='u'
      and pg_get_constraintdef(constraint_row.oid) ilike '%ranking_day_key%ranking_type%recipient_user_id%') then
    raise exception 'Daily exactly-once award key missing';
  end if;
  select pg_get_functiondef('public.capture_daily_ranking_participation()'::regprocedure) into v_definition;
  if position('battle_mode' in v_definition)=0
     or position('RAID_PERSONAL' in v_definition)=0
     or position('finalization_status' in v_definition)=0 then
    raise exception 'finalized participation trigger contract mismatch';
  end if;
  select pg_get_functiondef('public.finalize_daily_ranking_rewards(date)'::regprocedure) into v_definition;
  if position('ranking_daily_activity_snapshots' in v_definition)=0
     or position('participation.finalized_count' in v_definition)=0
     or position('sum(log.raw_damage)' in v_definition)=0
     or position('snapshot.ranked_entity_id' in v_definition)=0
     or position('calculate_user_total_power' in v_definition)>0
     or position('player.last_active_at' in v_definition)>0 then
    raise exception 'Daily eligibility contract mismatch';
  end if;
  select public.get_public_ranking_reward_master() into v_payload;
  if v_payload#>'{daily,POWER}' is null or v_payload#>'{daily,RAID_PERSONAL}' is null then
    raise exception 'Daily reward UI projection missing';
  end if;
  select pg_get_functiondef('public.get_my_pending_ranking_reward_notification()'::regprocedure) into v_definition;
  if position('notification.period_kind' in v_definition)=0
     or position('DAILY' in v_definition)=0
     or position('ranking_daily_reward_item_grants' in v_definition)=0 then
    raise exception 'aggregated Daily notification projection missing';
  end if;
end;
$$;
rollback;
