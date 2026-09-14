-- 未適用候補を改訂：正式OPENと3カテゴリ同時開始。旧9/16予約仕様は廃止。
-- 関数定義のみ。Migrationでは日付予約・終了処理・開始・cron変更を行わない。
begin;
DO $guard$
begin
 if md5(replace(pg_get_functiondef('public.advance_ranking_season(text,timestamptz)'::regprocedure),chr(13),'')) <> '958bee68162dca7b1449dad53ea2fe2f' then
   raise exception 'advance_ranking_season live definition drift';
 end if;
 if has_function_privilege('anon','public.advance_ranking_season(text,timestamptz)','EXECUTE')
   or has_function_privilege('authenticated','public.advance_ranking_season(text,timestamptz)','EXECUTE')
   or not has_function_privilege('service_role','public.advance_ranking_season(text,timestamptz)','EXECUTE') then
   raise exception 'advance_ranking_season privilege drift';
 end if;
end $guard$;

create function public.start_formal_open_seasons_v1(p_open_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_end timestamptz := '2026-09-30 15:00:00+00';
 v_old public.ranking_seasons%rowtype;
 v_ids jsonb; v_count integer;
begin
 if p_open_at is null or p_open_at<'2026-09-14 15:00:00+00'::timestamptz
   or p_open_at>=v_end or p_open_at>clock_timestamp() or clock_timestamp()>=v_end then
   raise exception 'Confirmed Formal Open timestamp required';
 end if;
 -- 実行はメンテナンスで操作停止を確認後。全カテゴリの行競合を同じTXで排除。
 perform pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0));
 lock table public.ranking_seasons in share row exclusive mode;
 select count(*),jsonb_object_agg(ranking_type,id) into v_count,v_ids
 from public.ranking_seasons where ranking_type in ('PVP','POWER','GUILD_POWER')
   and starts_at=p_open_at and ends_at=v_end and status='ACTIVE';
 if v_count=3 then
   if (select count(*) from public.ranking_seasons where ranking_type in ('PVP','POWER','GUILD_POWER') and status<>'CLOSED')<>3 then
     raise exception 'Unexpected concurrent season state';
   end if;
   if (select count(*) from public.monthly_power_season_runs where season_id in
       ((v_ids->>'POWER')::uuid,(v_ids->>'GUILD_POWER')::uuid))<>2 then
     raise exception 'Formal Open reward registration drift';
   end if;
   return jsonb_build_object('status','ALREADY_STARTED','season_ids',v_ids,'starts_at',p_open_at,'ends_at',v_end);
 end if;
 if exists(select 1 from public.ranking_seasons where ranking_type in ('PVP','POWER','GUILD_POWER')
   and starts_at=p_open_at) then raise exception 'Partial or conflicting Formal Open season requires review';end if;
 -- 旧POWERへの報酬転用・PREOPEN限定Emblemの黙示省略は禁止。
 if exists(select 1 from public.ranking_seasons where ranking_type in ('POWER','GUILD_POWER')
   and status<>'CLOSED') then raise exception 'Prior POWER/GUILD_POWER season disposition required';end if;
 if not exists(select 1 from public.ranking_guild_power_season_master m
   join public.ranking_seasons s on s.id=m.season_id
   join public.ranking_guild_power_finalization_audits a on a.season_id=s.id
   where m.event_key='PREOPEN_GUILD_POWER_2026' and s.status='CLOSED' and s.ends_at<=p_open_at) then
   raise exception 'Preopen Guild Power finalization audit required';
 end if;
 if (select count(*) from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE')<>1
   or exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status in ('PREPARING','FINALIZING')) then
   raise exception 'Unresolved PVP season state requires review';
 end if;
 select * into strict v_old from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' for update;
 if v_old.starts_at>=p_open_at or v_old.ends_at<p_open_at then
   raise exception 'PVP boundary does not cover Formal Open';
 end if;
 update public.ranking_seasons set ends_at=p_open_at,status='FINALIZING',updated_at=clock_timestamp() where id=v_old.id;
 perform public.assert_pvp_boundary_replay_continuity(v_old.id,clock_timestamp());
 perform public.finalize_pvp_season_rewards(v_old.id);
 perform public.reconcile_pvp_after_season_boundary(v_old.id,clock_timestamp());
 update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp() where id=v_old.id;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
 select t,p_open_at,v_end,'ACTIVE' from unnest(array['PVP','POWER','GUILD_POWER']) t;
 insert into public.monthly_power_season_runs(season_id)
 select id from public.ranking_seasons where starts_at=p_open_at and ranking_type in ('POWER','GUILD_POWER');
 select jsonb_object_agg(ranking_type,id) into v_ids from public.ranking_seasons
 where starts_at=p_open_at and ranking_type in ('PVP','POWER','GUILD_POWER');
 return jsonb_build_object('status','STARTED','season_ids',v_ids,'old_pvp_season_id',v_old.id,'starts_at',p_open_at,'ends_at',v_end);
end $$;
revoke all on function public.start_formal_open_seasons_v1(timestamptz) from public,anon,authenticated;
grant execute on function public.start_formal_open_seasons_v1(timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
