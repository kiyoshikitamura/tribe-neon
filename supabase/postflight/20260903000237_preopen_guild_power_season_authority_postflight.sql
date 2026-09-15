do $$
declare v_season public.ranking_seasons%rowtype;
begin
  select season.* into strict v_season from public.ranking_seasons season
  join public.ranking_guild_power_season_master master on master.season_id=season.id
  where master.event_key='PREOPEN_GUILD_POWER_2026';
  if v_season.ranking_type<>'GUILD_POWER'
     or v_season.starts_at<>'2026-09-03 15:00:00+00'::timestamptz
     or v_season.ends_at<>'2026-09-08 15:00:00+00'::timestamptz then
    raise exception 'pre-open guild Power JST boundary mismatch';
  end if;
  if clock_timestamp()<v_season.starts_at then
    if v_season.status<>'PREPARING' then
      raise exception 'pre-open guild season activated before its inclusive start';
    end if;
    if not exists(select 1 from cron.job
      where jobname='preopen-guild-power-activate-20260904-jst'
        and schedule='* 15 3 9 *') then
      raise exception 'pre-open guild activation cron mismatch';
    end if;
  elsif exists(select 1 from cron.job
               where jobname='preopen-guild-power-activate-20260904-jst') then
    raise exception 'successful pre-open activation cron was not unscheduled';
  end if;
  if (select count(*) from public.cosmetic_master
      where id like 'guild_preopen_2026_%' and owner_scope='GUILD' and active)<>4 then
    raise exception 'pre-open guild cosmetic master mismatch';
  end if;
  if has_function_privilege('authenticated','public.finalize_preopen_guild_power_season()','execute') then
    raise exception 'authenticated role can execute the season finalizer';
  end if;
  if has_function_privilege('authenticated','public.activate_preopen_guild_power_season()','execute') then
    raise exception 'authenticated role can execute the season activator';
  end if;
  if not has_function_privilege('authenticated','public.get_preopen_guild_power_ranking(integer,integer)','execute') then
    raise exception 'authenticated role cannot read the pre-open guild ranking';
  end if;
  if exists(select 1 from public.ranking_guild_power_finalization_audits
            where season_id=v_season.id) then
    if exists(select 1 from cron.job
              where jobname='preopen-guild-power-finalize-20260909-jst') then
      raise exception 'finalized pre-open guild cron was not unscheduled';
    end if;
  elsif not exists(select 1 from cron.job
    where jobname='preopen-guild-power-finalize-20260909-jst'
      and schedule='* 15 8 9 *') then
    raise exception 'pre-open guild finalizer cron mismatch';
  end if;
  if not exists(select 1 from pg_trigger
    where tgrelid='public.ranking_guild_power_season_snapshots'::regclass
      and tgname='ranking_guild_power_snapshot_immutable' and not tgisinternal) then
    raise exception 'immutable final snapshot trigger is missing';
  end if;
  if (select count(*) from pg_trigger
      where tgname like '%preopen_power_cutoff_guard' and not tgisinternal)<>12 then
    raise exception 'pre-open cutoff mutation guards are incomplete';
  end if;
  if to_regclass('public.ranking_guild_power_reward_recipients') is null then
    raise exception 'guild result notification recipient Authority is missing';
  end if;
  if to_regclass('public.ranking_reward_notifications') is null
     or not has_function_privilege('authenticated',
       'public.acknowledge_ranking_reward_notifications(uuid[])','execute') then
    raise exception 'ranking result one-time notification/ack contract is incomplete';
  end if;
  if to_regclass('public.ranking_reward_notifications_recipient_period_uidx') is null
     or to_regclass('public.ranking_reward_notifications_pending_idx') is null then
    raise exception 'ranking notification exactly-once/pending indexes are missing';
  end if;
  if position('is_current_context' in
      pg_get_functiondef('public.get_preopen_guild_power_ranking(integer,integer)'::regprocedure))=0 then
    raise exception 'future-season context guard is missing';
  end if;
  if position('newer.status' in
      pg_get_functiondef('public.get_preopen_guild_power_ranking(integer,integer)'::regprocedure))>0 then
    raise exception 'closed/preparing future season can reactivate pre-open presentation';
  end if;
  if not exists(select 1 from pg_trigger
    where tgname='canonical_character_preopen_power_cutoff_guard' and not tgisinternal)
     or not exists(select 1 from pg_trigger
    where tgname='canonical_equipment_preopen_power_cutoff_guard' and not tgisinternal) then
    raise exception 'canonical Power master cutoff guards are missing';
  end if;
end;
$$;
