CREATE OR REPLACE FUNCTION public.advance_ranking_season(p_type text, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text := upper(p_type);
  v_expired public.ranking_seasons%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_current_id uuid;
begin
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

  select bounds.starts_at,bounds.ends_at into v_start,v_end
  from public.ranking_period_bounds(v_type,p_at) bounds;
  insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status)
  values(v_type,v_start,v_end,'ACTIVE')
  on conflict(ranking_type,starts_at) do update set
    ends_at=excluded.ends_at,status='ACTIVE',updated_at=clock_timestamp()
  returning id into v_current_id;
  return v_current_id;
end;
$function$
;