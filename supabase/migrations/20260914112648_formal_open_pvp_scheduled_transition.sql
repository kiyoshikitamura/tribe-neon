-- PVP予約の構造だけを追加。Migrationで予約・切替・cron変更を実行しない。
-- インターバル中のPvPプレイ可否/Rate扱いは別途確定が必要。運用関数はまだ実行しない。
begin;
-- Preview READ ONLY照合: 2026-09-14。定義と公開権限が変わった場合は再監査。
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
create or replace function public.advance_ranking_season(
  p_type text,
  p_at timestamptz default clock_timestamp()
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_type text := upper(p_type);
  v_expired public.ranking_seasons%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_current_id uuid;
begin
  if v_type='RAID' then return null; end if;
  if v_type not in ('PVP','RAID') then
    raise exception 'unsupported automatic ranking season type' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ranking-season:'||v_type,0));

  select * into v_expired
  from public.ranking_seasons
  where ranking_type=v_type and status='ACTIVE' and ends_at<=p_at
  order by starts_at
  limit 1 for update;

  if found then
    update public.ranking_seasons set status='FINALIZING',updated_at=clock_timestamp()
    where id=v_expired.id;
    if v_type='PVP' then
      perform public.assert_pvp_boundary_replay_continuity(v_expired.id,p_at);
      perform public.finalize_pvp_season_rewards(v_expired.id);
      perform public.reconcile_pvp_after_season_boundary(v_expired.id,p_at);
    else
      perform public.finalize_raid_season_rewards(v_expired.id);
    end if;
    update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp()
    where id=v_expired.id;
  end if;

  select season.id into v_current_id
  from public.ranking_seasons season
  where season.ranking_type=v_type and season.status='ACTIVE'
    and p_at>=season.starts_at and p_at<season.ends_at
  order by season.starts_at desc limit 1;
  if v_current_id is not null then return v_current_id; end if;

  -- 今回承認済みのPVP予約だけに限定。他イベントのPREPARINGは解釈しない。
  select season.id into v_current_id from public.ranking_seasons season
  where season.ranking_type='PVP' and season.status='PREPARING'
    and season.starts_at='2026-09-15 15:00:00+00'::timestamptz
    and season.ends_at='2026-09-30 15:00:00+00'::timestamptz
  for update;
  if v_current_id is not null then
    if p_at<'2026-09-15 15:00:00+00'::timestamptz then return null;end if;
    if p_at>='2026-09-30 15:00:00+00'::timestamptz then
      raise exception 'Scheduled Formal Open season was never activated; review required';
    end if;
    update public.ranking_seasons set status='ACTIVE',updated_at=clock_timestamp() where id=v_current_id;
    return v_current_id;
  end if;

  select bounds.starts_at,bounds.ends_at into v_start,v_end
  from public.ranking_period_bounds(v_type,p_at) bounds;
  insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
  values(v_type,v_start,v_end,'ACTIVE')
  on conflict(ranking_type,starts_at) do nothing
  returning id into v_current_id;
  if v_current_id is null then
    -- 過去CLOSED/FINALIZINGをACTIVEへ戻さない。
    raise exception 'Existing ranking season cannot be reopened' using errcode='23514';
  end if;
  return v_current_id;
end;
$$;

create function public.prepare_formal_open_pvp_season_v1(p_cutoff timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old public.ranking_seasons%rowtype;v_new public.ranking_seasons%rowtype;v_start timestamptz:='2026-09-15 15:00:00+00';v_end timestamptz:='2026-09-30 15:00:00+00';
begin
 if p_cutoff is null or p_cutoff<'2026-09-14 15:00:00+00'::timestamptz
    or p_cutoff>=v_start or p_cutoff>clock_timestamp() or clock_timestamp()>=v_start then
   raise exception 'Confirmed September 15 JST maintenance cutoff required';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0));
 if (select count(*) from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE')>1
    or exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status='FINALIZING') then
   raise exception 'Unresolved PVP season state requires review';
 end if;
 select * into v_new from public.ranking_seasons where ranking_type='PVP' and starts_at=v_start for update;
 if found and (v_new.ends_at<>v_end or v_new.status<>'PREPARING') then
   raise exception 'Existing scheduled PVP season differs; no overwrite';
 end if;
 select * into v_old from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' for update;
 if found and v_old.starts_at>=p_cutoff then raise exception 'Invalid old season cutoff';end if;
 if v_new.id is null then
   insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
   values('PVP',v_start,v_end,'PREPARING') returning * into v_new;
 end if;
 if v_old.id is not null and v_old.ends_at>p_cutoff then
   update public.ranking_seasons set ends_at=p_cutoff,updated_at=clock_timestamp() where id=v_old.id;
 end if;
 -- 既存順序を維持：boundary確認→Snapshot/報酬→reconcile→CLOSED。
 -- 途中失敗は予約/境界変更も含め全rollback。ここでは新SeasonをACTIVEにしない。
 perform public.advance_ranking_season('PVP',clock_timestamp());
 return jsonb_build_object('old_season_id',v_old.id,'scheduled_season_id',v_new.id,
   'starts_at',v_start,'ends_at',v_end,'status','PREPARING');
end $$;
revoke all on function public.prepare_formal_open_pvp_season_v1(timestamptz) from public,anon,authenticated;
grant execute on function public.prepare_formal_open_pvp_season_v1(timestamptz) to service_role;
-- 既存advanceの権限契約を維持。
revoke all on function public.advance_ranking_season(text,timestamptz) from public,anon,authenticated;
grant execute on function public.advance_ranking_season(text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
