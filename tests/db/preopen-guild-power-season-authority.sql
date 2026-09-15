begin;

do $$
declare
  v_season_id uuid;
  v_character_id text;
  v_user_1 uuid:=gen_random_uuid();
  v_user_2 uuid:=gen_random_uuid();
  v_user_3 uuid:=gen_random_uuid();
  v_guild_1 uuid:=gen_random_uuid();
  v_guild_2 uuid:=gen_random_uuid();
  v_guild_3 uuid:=gen_random_uuid();
  v_owned_1 uuid:=gen_random_uuid();
  v_owned_2 uuid:=gen_random_uuid();
  v_owned_3 uuid:=gen_random_uuid();
  v_other_seasons_before jsonb;
  v_other_seasons_after jsonb;
  v_snapshot_power bigint;
  v_current_power bigint;
  v_result jsonb;
  v_activation_result jsonb;
  v_previous_season_id uuid:=gen_random_uuid();
  v_pending jsonb;
  v_notification_ids uuid[];
  v_acknowledged_count integer;
  v_grant_count integer;
begin
  select master.season_id into strict v_season_id
  from public.ranking_guild_power_season_master master
  where master.event_key='PREOPEN_GUILD_POWER_2026';

  select master.character_id into strict v_character_id
  from public.canonical_character_master master
  where master.version='2026-08-21'
    and master.lv1_hp+master.lv1_atk+master.lv1_def>0
    and master.lv100_hp+master.lv100_atk+master.lv100_def
      > master.lv1_hp+master.lv1_atk+master.lv1_def
  order by master.character_id limit 1;

  select coalesce(jsonb_agg(to_jsonb(season) order by season.id),'[]'::jsonb)
  into v_other_seasons_before
  from public.ranking_seasons season where season.ranking_type<>'GUILD_POWER';

  -- Before the inclusive start, pre-open stays PREPARING and the prior active
  -- Guild Power season remains authoritative.
  update public.ranking_seasons set status='PREPARING',
    starts_at=clock_timestamp()+interval '1 day',ends_at=clock_timestamp()+interval '6 days'
  where id=v_season_id;
  update public.ranking_seasons set status='CLOSED'
  where ranking_type='GUILD_POWER' and status='ACTIVE' and id<>v_season_id;
  insert into public.ranking_seasons(id,ranking_type,starts_at,ends_at,status)
  values(v_previous_season_id,'GUILD_POWER',clock_timestamp()-interval '10 days',
    clock_timestamp()+interval '10 days','ACTIVE');
  update public.ranking_guild_power_season_master
  set starts_at=clock_timestamp()+interval '1 day',ends_at=clock_timestamp()+interval '6 days'
  where season_id=v_season_id;
  perform cron.unschedule(jobid) from cron.job
  where jobname='preopen-guild-power-activate-20260904-jst';
  perform cron.schedule('preopen-guild-power-activate-20260904-jst','* * * * *','select 1');
  v_activation_result:=public.activate_preopen_guild_power_season();
  if v_activation_result->>'status'<>'NOT_STARTED'
     or (select status from public.ranking_seasons where id=v_season_id)<>'PREPARING'
     or (select status from public.ranking_seasons where id=v_previous_season_id)<>'ACTIVE'
     or not exists(select 1 from cron.job where jobname='preopen-guild-power-activate-20260904-jst') then
    raise exception 'pre-start activation changed the current Guild Power context';
  end if;

  -- Isolate existing guilds from this rollback-only fixture without guessing IDs.
  insert into public.ranking_guild_exclusions(guild_id,reason)
  select guild.id,'DB_CONTRACT_EXISTING' from public.guilds guild
  on conflict(guild_id) do nothing;

  -- Canonical guild membership requires player level 3. Other required user
  -- state remains on the production defaults so this fixture exercises the
  -- same initialization contract as a newly eligible player.
  insert into public.users(id,username,level) values
    (v_user_1,'DBCT-A',3),(v_user_2,'DBCT-B',3),(v_user_3,'DBCT-C',3);
  insert into public.guilds(id,name,leader_id) values
    (v_guild_1,'DBCT-G1',v_user_1),(v_guild_2,'DBCT-G2',v_user_2),(v_guild_3,'DBCT-G3',v_user_3);
  insert into public.guild_members(guild_id,user_id,role) values
    (v_guild_1,v_user_1,'MASTER'),(v_guild_2,v_user_2,'MASTER'),(v_guild_3,v_user_3,'MASTER');
  insert into public.user_characters(id,user_id,character_id,level) values
    (v_owned_1,v_user_1,v_character_id,2),
    (v_owned_2,v_user_2,v_character_id,2),
    (v_owned_3,v_user_3,v_character_id,1);
  insert into public.user_main_formations(user_id,slot,user_character_id) values
    (v_user_1,1,v_owned_1),(v_user_2,1,v_owned_2),(v_user_3,1,v_owned_3);

  perform set_config('request.jwt.claim.sub',v_user_1::text,true);
  v_result:=public.get_preopen_guild_power_ranking();
  if coalesce((v_result->>'is_current_context')::boolean,true)
     or jsonb_array_length(v_result->'rows')<>0 then
    raise exception 'pre-start dedicated read did not fall back safely';
  end if;

  -- The inclusive start closes only the previous active Guild Power season,
  -- activates pre-open and removes the transient start cron.
  update public.ranking_seasons set starts_at=clock_timestamp(),
    ends_at=clock_timestamp()+interval '5 days' where id=v_season_id;
  update public.ranking_guild_power_season_master set starts_at=clock_timestamp(),
    ends_at=clock_timestamp()+interval '5 days' where season_id=v_season_id;
  v_activation_result:=public.activate_preopen_guild_power_season();
  if v_activation_result->>'status'<>'ACTIVE'
     or (select status from public.ranking_seasons where id=v_season_id)<>'ACTIVE'
     or (select status from public.ranking_seasons where id=v_previous_season_id)<>'CLOSED'
     or exists(select 1 from cron.job where jobname='preopen-guild-power-activate-20260904-jst') then
    raise exception 'inclusive start activation contract failed';
  end if;

  -- Move this transaction's boundary into the past. The next Power mutation
  -- must synchronously finalize before applying that mutation.
  update public.ranking_seasons
  set starts_at=clock_timestamp()-interval '2 days',
      ends_at=clock_timestamp()-interval '1 second',status='ACTIVE'
  where id=v_season_id;
  update public.ranking_guild_power_season_master
  set starts_at=clock_timestamp()-interval '2 days',
      ends_at=clock_timestamp()-interval '1 second'
  where season_id=v_season_id;

  -- Canonical Character is a direct dependency of current Power calculation;
  -- even a no-op master write must cross the same cutoff guard.
  update public.canonical_character_master set display_name=display_name
  where version='2026-08-21' and character_id=v_character_id;
  update public.user_characters set level=3 where id=v_owned_1;

  if not exists(select 1 from public.ranking_guild_power_finalization_audits
                where season_id=v_season_id) then
    raise exception 'cutoff mutation did not synchronously finalize';
  end if;
  select total_power into strict v_snapshot_power
  from public.ranking_guild_power_season_snapshots
  where season_id=v_season_id and guild_id=v_guild_1;
  v_current_power:=public.calculate_user_total_power(v_user_1);
  if v_snapshot_power>=v_current_power then
    raise exception 'post-cutoff character growth leaked into final snapshot';
  end if;

  if (select array_agg(rank_position order by rank_position,guild_id)
      from public.ranking_guild_power_season_snapshots
      where season_id=v_season_id)<>array[1,1,3] then
    raise exception 'competition ranks are not 1,1,3';
  end if;

  if (select count(*) from public.ranking_guild_power_reward_grants
      where season_id=v_season_id and cosmetic_id='guild_preopen_2026_participation')<>3
     or (select count(*) from public.ranking_guild_power_reward_grants
         where season_id=v_season_id and cosmetic_id='guild_preopen_2026_rank_1')<>2
     or (select count(*) from public.ranking_guild_power_reward_grants
         where season_id=v_season_id and cosmetic_id='guild_preopen_2026_rank_3')<>1
     or exists(select 1 from public.ranking_guild_power_reward_grants
               where season_id=v_season_id and cosmetic_id='guild_preopen_2026_rank_2') then
    raise exception 'participation plus tied top-three rewards are incorrect';
  end if;
  if (select count(*) from public.ranking_reward_notifications notification
      where notification.period_kind='SEASON' and notification.period_key=v_season_id::text
        and notification.recipient_user_id in(v_user_1,v_user_2,v_user_3))<>3 then
    raise exception 'guild result notifications were not issued';
  end if;
  if not exists(
    select 1 from public.ranking_reward_notifications notification
    join public.ranking_guild_power_reward_recipients recipient
      on recipient.season_id::text=notification.period_key
     and recipient.recipient_user_id=notification.recipient_user_id
    where notification.period_kind='SEASON' and recipient.season_id=v_season_id
      and notification.acknowledged_at is null
  ) then
    raise exception 'pending notification is not backed by a guild reward recipient';
  end if;
  perform set_config('request.jwt.claim.sub',v_user_1::text,true);
  v_pending:=public.get_my_pending_ranking_reward_notification();
  if v_pending is null
     or not exists(select 1 from jsonb_array_elements(v_pending->'grants') grant_row
                   where grant_row->>'reward_kind'='GUILD_COSMETIC'
                     and coalesce(grant_row->>'display_name','')<>'') then
    raise exception 'cosmetic notification metadata contract is incomplete';
  end if;
  select array_agg(value::uuid) into v_notification_ids
  from jsonb_array_elements_text(v_pending->'notification_ids') ids(value);
  v_acknowledged_count:=(
    public.acknowledge_ranking_reward_notifications(v_notification_ids)->>'acknowledged'
  )::integer;
  if v_acknowledged_count<>1 then
    raise exception 'first notification acknowledgement did not update exactly one row';
  end if;
  if public.get_my_pending_ranking_reward_notification() is not null then
    raise exception 'acknowledged notification remained pending';
  end if;
  v_acknowledged_count:=(
    public.acknowledge_ranking_reward_notifications(v_notification_ids)->>'acknowledged'
  )::integer;
  if v_acknowledged_count<>0
     or public.get_my_pending_ranking_reward_notification() is not null then
    raise exception 'notification acknowledgement is not idempotent';
  end if;

  select count(*) into v_grant_count from public.ranking_guild_power_reward_grants
  where season_id=v_season_id;
  v_result:=public.finalize_preopen_guild_power_season();
  if v_result->>'status'<>'ALREADY_FINALIZED'
     or (select count(*) from public.ranking_guild_power_reward_grants
         where season_id=v_season_id)<>v_grant_count then
    raise exception 'finalizer retry is not idempotent';
  end if;
  if public.get_my_pending_ranking_reward_notification() is not null then
    raise exception 'finalizer retry reopened an acknowledged notification';
  end if;
  if exists(select 1 from cron.job
            where jobname='preopen-guild-power-finalize-20260909-jst') then
    raise exception 'successful finalizer did not unschedule its cron';
  end if;

  begin
    insert into public.ranking_guild_power_season_snapshots(
      season_id,guild_id,guild_name,total_power,member_count,rank_position
    ) values(v_season_id,gen_random_uuid(),'LATE INSERT',1,1,99);
    raise exception 'final snapshot accepted a post-finalization insert';
  exception when sqlstate '55000' then null;
  end;

  delete from public.guilds where id=v_guild_3;
  if exists(select 1 from public.ranking_guild_power_reward_grants where guild_id=v_guild_3)
     or exists(select 1 from public.guild_cosmetics where guild_id=v_guild_3) then
    raise exception 'guild-owned cosmetic rights survived guild deletion';
  end if;
  if not exists(select 1 from public.ranking_guild_power_season_snapshots
                where season_id=v_season_id and guild_id=v_guild_3) then
    raise exception 'immutable historical snapshot was deleted with guild';
  end if;

  select coalesce(jsonb_agg(to_jsonb(season) order by season.id),'[]'::jsonb)
  into v_other_seasons_after
  from public.ranking_seasons season where season.ranking_type<>'GUILD_POWER';
  if v_other_seasons_after<>v_other_seasons_before then
    raise exception 'non-GUILD_POWER ranking seasons were changed';
  end if;
end;
$$;

rollback;
