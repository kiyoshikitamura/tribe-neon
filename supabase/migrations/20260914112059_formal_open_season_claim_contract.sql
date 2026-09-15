-- 実運用時刻・限定Emblem IDは未設定。既存no-arg finalizerとcronを変更しない。
-- v2関数は承認済みcutover操作だけが明示実行する。Migration内で実行しない。
begin;
DO $patch$
declare v_definition text; v_anchor text := $anchor$where event.is_enabled and ($anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_active_mission_events()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Formal open source drift: public.get_active_mission_events()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$where event.is_enabled and (event.claim_deadline is null or clock_timestamp()<event.claim_deadline) and ($replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$begin
  select count(*)::integer into v_completed$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.refresh_special_event_completion(uuid,text)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Formal open source drift: public.refresh_special_event_completion(uuid,text)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$begin
  if not exists(select 1 from public.mission_events where id=p_event_id and is_enabled
    and clock_timestamp()>=start_at and clock_timestamp()<progress_end_at) then return;end if;
  select count(*)::integer into v_completed$replacement$);
end $patch$;

create or replace function public.finalize_preopen_guild_power_season_v2(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_season public.ranking_seasons%rowtype;
  v_ranked_count integer;
  v_grant_count integer;
  v_job_id bigint;
begin
  -- All paths lock the season row before the event advisory lock. This avoids
  -- inversion with a transaction that edits season state then Power inputs.
  select season.* into strict v_season
  from public.ranking_seasons season
  join public.ranking_guild_power_season_master master on master.season_id=season.id
  where master.event_key='PREOPEN_GUILD_POWER_2026'
  for update of season;
  if v_season.status='PREPARING' and clock_timestamp()>=v_season.starts_at then
    perform public.activate_preopen_guild_power_season();
    select * into strict v_season from public.ranking_seasons where id=v_season.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('PREOPEN_GUILD_POWER_2026',0));

  if clock_timestamp()<v_season.ends_at then
    raise exception 'pre-open guild Power season is not closed' using errcode='22023';
  end if;

  if exists(select 1 from public.ranking_guild_power_finalization_audits audit
            where audit.season_id=v_season.id) then
    select jobid into v_job_id from cron.job
    where jobname='preopen-guild-power-finalize-20260909-jst';
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    return (select jsonb_build_object(
      'season_id',audit.season_id,'status','ALREADY_FINALIZED',
      'ranked_guild_count',audit.ranked_guild_count,
      'reward_grant_count',audit.reward_grant_count)
      from public.ranking_guild_power_finalization_audits audit
      where audit.season_id=v_season.id);
  end if;

  if v_season.status='CLOSED' then
    raise exception 'Closed season without finalization audit requires review' using errcode='23514';
  end if;
  -- audit済みは上の早期returnで保持。未確定報酬は適切な限定Emblem設定まで停止。
  if not exists(select 1 from public.cosmetic_master cosmetic
    where cosmetic.id=p_cosmetic_id and cosmetic.owner_scope='GUILD'
      and cosmetic.slot='GUILD_EMBLEM' and cosmetic.active
      and not coalesce(cosmetic.metadata @> '{"standard":true}'::jsonb,false)) then
    raise exception 'FORMAL OPEN LIMITED EMBLEM NOT CONFIGURED' using errcode='23514';
  end if;
  if exists(select 1 from public.ranking_guild_power_reward_grants where season_id=v_season.id) then
    raise exception 'Unfinalized historical reward grants require review' using errcode='23514';
  end if;
  update public.ranking_seasons set status='FINALIZING',updated_at=clock_timestamp()
  where id=v_season.id and status<>'CLOSED';

  insert into public.ranking_guild_power_season_snapshots(
    season_id,guild_id,guild_name,total_power,member_count,rank_position
  )
  with totals as (
    select guild.id guild_id,guild.name guild_name,
      sum(public.calculate_user_total_power(member.user_id))::bigint total_power,
      count(*)::integer member_count
    from public.guilds guild
    join public.guild_members member on member.guild_id=guild.id
    where not exists(
      select 1 from public.ranking_guild_exclusions exclusion where exclusion.guild_id=guild.id
    )
    group by guild.id,guild.name
    having sum(public.calculate_user_total_power(member.user_id))>0
  ), ranked as (
    select totals.*,rank() over(order by totals.total_power desc)::integer rank_position
    from totals
  )
  select v_season.id,ranked.guild_id,ranked.guild_name,ranked.total_power,
    ranked.member_count,ranked.rank_position
  from ranked
  on conflict(season_id,guild_id) do nothing;

  insert into public.ranking_guild_power_reward_grants(
    season_id,guild_id,cosmetic_id,rank_position
  )
  select snapshot.season_id,snapshot.guild_id,reward.cosmetic_id,snapshot.rank_position
  from public.ranking_guild_power_season_snapshots snapshot
  cross join lateral (
    select p_cosmetic_id as cosmetic_id
  ) reward
  where snapshot.season_id=v_season.id and snapshot.rank_position=1
  on conflict(season_id,guild_id,cosmetic_id) do nothing;

  insert into public.guild_cosmetics(
    guild_id,cosmetic_id,source_type,source_reference
  )
  select grant_row.guild_id,grant_row.cosmetic_id,'RANKING',
    concat('PREOPEN_GUILD_POWER_2026:',grant_row.season_id)
  from public.ranking_guild_power_reward_grants grant_row
  where grant_row.season_id=v_season.id
  on conflict(guild_id,cosmetic_id) do nothing;

  insert into public.ranking_guild_power_reward_recipients(
    season_id,guild_id,recipient_user_id
  )
  select snapshot.season_id,snapshot.guild_id,member.user_id
  from public.ranking_guild_power_season_snapshots snapshot
  join public.guild_members member on member.guild_id=snapshot.guild_id
  where snapshot.season_id=v_season.id
  on conflict(season_id,guild_id,recipient_user_id) do nothing;

  insert into public.ranking_reward_notifications(
    recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
  )
  select recipient.recipient_user_id,'SEASON',recipient.season_id::text,clock_timestamp(),null
  from public.ranking_guild_power_reward_recipients recipient
  where recipient.season_id=v_season.id and exists(
    select 1 from public.ranking_guild_power_reward_grants grant_row
    where grant_row.season_id=recipient.season_id and grant_row.guild_id=recipient.guild_id)
  on conflict(recipient_user_id,period_kind,period_key) do nothing;

  select count(*) into v_ranked_count
  from public.ranking_guild_power_season_snapshots where season_id=v_season.id;
  select count(*) into v_grant_count
  from public.ranking_guild_power_reward_grants where season_id=v_season.id;

  update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp()
  where id=v_season.id;
  insert into public.ranking_guild_power_finalization_audits(
    season_id,ranked_guild_count,reward_grant_count
  ) values(v_season.id,v_ranked_count,v_grant_count);

  select jobid into v_job_id from cron.job
  where jobname='preopen-guild-power-finalize-20260909-jst';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  return jsonb_build_object(
    'season_id',v_season.id,'status','FINALIZED',
    'ranked_guild_count',v_ranked_count,'reward_grant_count',v_grant_count
  );
end;
$$;
revoke all on function public.finalize_preopen_guild_power_season_v2(text) from public,anon,authenticated;
grant execute on function public.finalize_preopen_guild_power_season_v2(text) to service_role;

-- 呼出しはメンテナンスで操作停止を確認した後のみ。Migrationはこれを実行しない。
create function public.close_gvg_preparation_missions_v1(p_progress_end timestamptz,p_claim_anchor timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.mission_events%rowtype;v_deadline timestamptz;
begin
 if p_progress_end is null or p_claim_anchor is null or p_claim_anchor<p_progress_end
   or p_claim_anchor>clock_timestamp() then raise exception 'Confirmed maintenance timestamps required';end if;
 select * into strict v_event from public.mission_events where id='GVG_PREP_20260904' for update;
 if p_progress_end<=v_event.start_at then raise exception 'Invalid event close boundary';end if;
 v_deadline:=p_claim_anchor+interval '30 days';
 if v_event.claim_deadline is not null and
   (v_event.progress_end_at<>p_progress_end or v_event.claim_deadline<>v_deadline) then
   raise exception 'Existing claim contract differs; explicit review required';
 end if;
 update public.mission_events set progress_end_at=p_progress_end,claim_deadline=v_deadline,updated_at=clock_timestamp()
 where id=v_event.id;
 return jsonb_build_object('event_id',v_event.id,'progress_end_at',p_progress_end,'claim_deadline',v_deadline);
end $$;
revoke all on function public.close_gvg_preparation_missions_v1(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.close_gvg_preparation_missions_v1(timestamptz,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
