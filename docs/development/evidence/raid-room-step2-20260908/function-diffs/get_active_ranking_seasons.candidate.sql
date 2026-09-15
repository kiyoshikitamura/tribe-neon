create or replace function public.get_active_ranking_seasons()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('season_id',season.id,'ranking_type',season.ranking_type,'starts_at',season.starts_at,'ends_at',season.ends_at,'status',season.status) order by season.ranking_type)
    from public.ranking_seasons season where season.ranking_type<>'RAID' and season.status='ACTIVE' and clock_timestamp()>=season.starts_at and clock_timestamp()<season.ends_at),'[]'::jsonb);
end;
$$;