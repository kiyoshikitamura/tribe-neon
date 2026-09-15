-- Production適用済み 20260915133606。再適用禁止。
-- 旧シーズン終了から9/16 00:00 JSTまでPvP開始/finalizeは準備中。
-- 一般メンテナンス維持、旧POWER/GUILD_POWERの処分/監査を完了後に適用。
-- start_formal_open_seasons_v1 (旧同時開始版) は呼び出さない。
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $patch$
declare d text; anchor text := E'  perform pg_advisory_xact_lock(hashtextextended(''ranking-season:''||v_type,0));';
begin
 if not exists(select 1 from public.feature_operating_states where feature_key='MAINTENANCE' and state='MAINTENANCE') then raise exception 'Maintenance required'; end if;
 d:=pg_get_functiondef('public.advance_ranking_season(text,timestamptz)'::regprocedure);
 if md5(replace(d,chr(13),'')) <> '958bee68162dca7b1449dad53ea2fe2f' then raise exception 'advance definition drift'; end if;
 if position(anchor in d)=0 then raise exception 'Patch anchor missing';end if;
 d:=replace(d,anchor,anchor||$insert$
  -- Explicit Formal Open reservation; never reopen the old calendar-month row.
  if v_type='PVP' and exists(select 1 from public.ranking_seasons where ranking_type='PVP'
    and starts_at='2026-09-15 15:00:00+00' and ends_at='2026-09-30 15:00:00+00'
    and status='PREPARING') then
    if p_at<'2026-09-15 15:00:00+00'::timestamptz then
      raise exception '新シーズンは9月16日 00:00から開始します' using errcode='55000';
    end if;
    if p_at>='2026-09-30 15:00:00+00'::timestamptz then raise exception 'Missed Formal Open activation requires review';end if;
    if exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status in('ACTIVE','FINALIZING')) then raise exception 'Conflicting PVP lifecycle';end if;
    update public.ranking_seasons set status='ACTIVE',updated_at=clock_timestamp()
    where ranking_type='PVP' and starts_at='2026-09-15 15:00:00+00' and status='PREPARING';
  end if;
$insert$);
 execute d;
end $patch$;

-- Cron calls this wrapper every minute. No arbitrary date supplied by clients.
create function public.activate_formal_open_next_day_seasons_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare n int;
begin
 perform pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0));
 lock table public.ranking_seasons in share row exclusive mode;
 if clock_timestamp()<'2026-09-15 15:00:00+00'::timestamptz then return jsonb_build_object('status','SCHEDULED');end if;
 select count(*) into n from public.ranking_seasons where ranking_type in('PVP','POWER','GUILD_POWER')
   and starts_at='2026-09-15 15:00:00+00' and ends_at='2026-09-30 15:00:00+00' and status='PREPARING';
 if n=0 then return jsonb_build_object('status','NO_PENDING');end if;
 if clock_timestamp()>='2026-09-30 15:00:00+00'::timestamptz then raise exception 'Missed activation requires review';end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in('PVP','POWER','GUILD_POWER') and status<>'CLOSED'
   and starts_at<>'2026-09-15 15:00:00+00'::timestamptz) then raise exception 'Conflicting current season';end if;
 if (select count(*) from public.ranking_seasons where ranking_type in('PVP','POWER','GUILD_POWER')
  and starts_at='2026-09-15 15:00:00+00' and ends_at='2026-09-30 15:00:00+00' and status in('PREPARING','ACTIVE'))<>3 then raise exception 'Incomplete reservation';end if;
 if (select count(*) from public.monthly_power_season_runs r join public.ranking_seasons s on s.id=r.season_id
   where s.starts_at='2026-09-15 15:00:00+00' and s.ranking_type in('POWER','GUILD_POWER'))<>2 then raise exception 'Reward registration required';end if;
 update public.ranking_seasons set status='ACTIVE',updated_at=clock_timestamp()
 where ranking_type in('PVP','POWER','GUILD_POWER') and starts_at='2026-09-15 15:00:00+00' and status='PREPARING';
 return jsonb_build_object('status','ACTIVATED');
end $$;
revoke all on function public.activate_formal_open_next_day_seasons_v1() from public,anon,authenticated;
grant execute on function public.activate_formal_open_next_day_seasons_v1() to service_role;

DO $reserve$
declare oldid uuid; boundary timestamptz:='2026-09-15T11:33:02.765894Z';
begin
 perform pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0));
 lock table public.ranking_seasons in share row exclusive mode;
 if clock_timestamp()>='2026-09-15 15:00:00+00'::timestamptz then raise exception 'Reservation window elapsed';end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in('POWER','GUILD_POWER') and status<>'CLOSED') then raise exception 'Prior POWER disposition required';end if;
 if not exists(select 1 from public.ranking_guild_power_season_master m
   join public.ranking_seasons s on s.id=m.season_id join public.ranking_guild_power_finalization_audits a on a.season_id=s.id
   where m.event_key='PREOPEN_GUILD_POWER_2026' and s.status='CLOSED') then raise exception 'Preopen finalization audit required';end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in('PVP','POWER','GUILD_POWER') and starts_at='2026-09-15 15:00:00+00') then raise exception 'Reservation already exists: do not reapply';end if;
 select id into strict oldid from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' and starts_at<boundary and ends_at>boundary for update;
 if exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status in('PREPARING','FINALIZING')) then raise exception 'Unresolved PVP state';end if;
 -- No interval battles may be silently carried into the next season.
 if exists(select 1 from public.battle_replay_sessions where battle_mode='PVP' and finalization_status='FINALIZED' and finalized_at>=boundary)
   or exists(select 1 from public.pvp_ranks where updated_at>=boundary) then raise exception 'Interval PVP activity requires explicit disposition';end if;
 update public.ranking_seasons set ends_at=boundary,status='FINALIZING',updated_at=clock_timestamp() where id=oldid;
 perform public.assert_pvp_boundary_replay_continuity(oldid,clock_timestamp());
 perform public.finalize_pvp_season_rewards(oldid);
 perform public.reconcile_pvp_after_season_boundary(oldid,clock_timestamp());
 update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp() where id=oldid;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 select t,'2026-09-15 15:00:00+00','2026-09-30 15:00:00+00','PREPARING' from unnest(array['PVP','POWER','GUILD_POWER']) t;
 insert into public.monthly_power_season_runs(season_id,reward_version,eligibility_policy)
 select id,'20260914','CONTINUOUS_JST_DAY1' from public.ranking_seasons where ranking_type in('POWER','GUILD_POWER') and starts_at='2026-09-15 15:00:00+00';
end $reserve$;
-- Existing monthly runner requires ACTIVE registered seasons: execute only after activation.
select cron.schedule('formal-open-next-day-activation-20260916','* * * * *',
 $cron$select public.activate_formal_open_next_day_seasons_v1();$cron$);
select cron.schedule('ranking-power-monthly-finalize-v1','*/5 * * * *',
 $cron$select public.advance_monthly_power_seasons_v1() where clock_timestamp()>='2026-09-15 15:00:00+00'::timestamptz and not exists(select 1 from public.ranking_seasons where ranking_type in('POWER','GUILD_POWER') and status='PREPARING');$cron$);
notify pgrst,'reload schema';
commit;

