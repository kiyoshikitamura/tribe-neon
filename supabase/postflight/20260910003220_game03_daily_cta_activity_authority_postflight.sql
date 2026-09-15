do $$
declare v_feed_definition text;
begin
  if not exists(
    select 1 from public.missions
    where id='MIS_D_010' and category='DAILY'
      and trigger_type='PVP_FINALIZED_BATTLE_COUNT' and target_value=2
      and reward_item_id='RAID_POINT_TICKET' and reward_quantity=1
      and repeat_rule='DAILY_RESET' and claim_rule='EXACTLY_ONCE' and is_enabled
  ) then raise exception 'MIS_D_010 authority mismatch'; end if;

  if not exists(
    select 1 from public.canonical_master_freeze_versions
    where domain='MISSION' and version='2026-09-10' and is_production_enabled
  ) then raise exception 'Mission freeze 2026-09-10 is not enabled'; end if;

  if exists(
    select 1 from pg_trigger
    where tgrelid='public.gacha_execution_history'::regclass
      and tgname='m9x_gacha_activity_trigger' and not tgisinternal and tgenabled<>'D'
  ) then raise exception 'SSR Activity source remains enabled'; end if;

  if not exists(
    select 1 from pg_trigger
    where tgrelid='public.raid_bosses'::regclass
      and tgname='raid_boss_defeated_activity_trigger' and not tgisinternal and tgenabled<>'D'
  ) then raise exception 'Raid defeat Activity trigger is missing'; end if;

  select pg_get_functiondef('public.get_recent_social_activity_feed(integer)'::regprocedure)
  into v_feed_definition;
  if v_feed_definition not like '%RAID_BOSS_DEFEATED%'
    or v_feed_definition not like '%GUILD_CREATED%'
    or v_feed_definition not like '%POWER_RANK_1%'
    or v_feed_definition like '%SSR_CHARACTER%' then
    raise exception 'Activity projection allowlist mismatch';
  end if;
end;
$$;

select 'PASS' as status,
  (select jsonb_build_object(
    'id',id,'target',target_value,'reward',reward_item_id,'quantity',reward_quantity
  ) from public.missions where id='MIS_D_010') as daily_mission,
  (select count(*) from public.social_activity_feed
   where activity_type='RAID_BOSS_DEFEATED' and created_at>=statement_timestamp()-interval '24 hours') as raid_defeats_24h;
