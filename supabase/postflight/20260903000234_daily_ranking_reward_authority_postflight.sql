do $$
declare v_definition text; v_payload jsonb;
begin
  if to_regclass('public.canonical_daily_ranking_reward_master') is null
     or to_regclass('public.ranking_daily_reward_awards') is null
     or to_regclass('public.ranking_daily_reward_item_grants') is null
     or to_regclass('public.ranking_daily_participation') is null
     or to_regclass('public.ranking_daily_activity_snapshots') is null
     or to_regprocedure('public.finalize_daily_ranking_rewards(date)') is null
     or to_regprocedure('public.grant_canonical_daily_ranking_reward(date,text,uuid,uuid,integer,bigint)') is null then
    raise exception 'daily ranking reward authority contract incomplete';
  end if;
  if (select count(*) from public.canonical_daily_ranking_reward_master
      where version='2026-09-03' and is_production_enabled)<>40 then
    raise exception 'daily ranking reward master row count mismatch';
  end if;
  if exists(
    select 1 from unnest(array['POWER','GUILD_POWER','PVP','RAID_PERSONAL']) as category(ranking_type)
    cross join generate_series(1,100) rank_position
    where (select count(*) from public.canonical_daily_ranking_reward_master master
      where master.version='2026-09-03' and master.is_production_enabled
        and master.ranking_type=category.ranking_type
        and rank_position between master.rank_min and master.rank_max)<>2
  ) then raise exception 'daily ranking rank coverage must resolve exactly two items'; end if;
  if exists(select 1 from public.canonical_daily_ranking_reward_master
    where version='2026-09-03' and item_id not in ('CHAR_EXP_M','CHAR_EXP_L','EQUIP_EXP_M','EQUIP_EXP_L')) then
    raise exception 'daily ranking contains a forbidden reward item';
  end if;
  if exists(select 1 from public.canonical_item_master
    where version='2026-08-22' and item_id in ('CHAR_EXP_M','CHAR_EXP_L','EQUIP_EXP_M','EQUIP_EXP_L')
      and not source_categories?'RANKING') then
    raise exception 'ranking source category missing from EXP item master';
  end if;
  if has_table_privilege('authenticated','public.ranking_daily_reward_awards','SELECT')
     or has_table_privilege('authenticated','public.ranking_daily_participation','SELECT')
     or has_function_privilege('authenticated','public.finalize_daily_ranking_rewards(date)','EXECUTE')
     or has_function_privilege('anon','public.finalize_daily_ranking_rewards(date)','EXECUTE') then
    raise exception 'daily ranking authority is exposed to a client role';
  end if;
  select public.canonical_ranking_reward_payload() into v_payload;
  if v_payload->>'version'<>'2026-09-03'
     or v_payload->>'dailyDelivery'<>'DIRECT_USER_ITEMS'
     or (select count(*) from jsonb_object_keys(v_payload->'daily'))<>4 then
    raise exception 'daily ranking public master projection mismatch';
  end if;
  select pg_get_functiondef('public.grant_canonical_daily_ranking_reward(date,text,uuid,uuid,integer,bigint)'::regprocedure)
    into v_definition;
  if position('ranking_daily_reward_awards' in v_definition)=0
     or position('ON CONFLICT' in upper(v_definition))=0
     or position('user_items' in v_definition)=0
     or position('presents' in v_definition)>0 then
    raise exception 'daily reward must be exactly-once and grant directly to the bag';
  end if;
  select pg_get_functiondef('public.finalize_daily_ranking_rewards(date)'::regprocedure) into v_definition;
  if position('Asia/Tokyo' in v_definition)=0
     or position('ranking_daily_participation' in v_definition)=0
     or position('ranking_daily_activity_snapshots' in v_definition)=0
     or position('raid_damage_logs' in v_definition)=0
     or position('calculate_user_total_power' in v_definition)>0
     or position('last_active_at' in v_definition)>0 then
    raise exception 'daily ranking eligibility or JST boundary contract missing';
  end if;
  if not exists(select 1 from cron.job
    where jobname='daily-ranking-reward-finalize-jst-midnight' and schedule='0 15 * * *') then
    raise exception 'daily ranking JST midnight cron missing';
  end if;
end;
$$;
