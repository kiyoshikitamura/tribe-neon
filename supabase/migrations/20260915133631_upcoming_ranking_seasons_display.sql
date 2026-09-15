-- 読み取り専用の公開予定期間API。シーズン作成・開始・成績更新は行わない。
begin;
create function public.get_upcoming_ranking_seasons_v1()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'season_id', planned.id, 'ranking_type', planned.ranking_type,
      'starts_at', planned.starts_at, 'ends_at', planned.ends_at, 'status', planned.status
    ) order by planned.ranking_type)
    from (
      select distinct on (season.ranking_type) season.*
      from public.ranking_seasons season
      where season.ranking_type in ('POWER', 'GUILD_POWER', 'PVP')
        and season.status in ('PREPARING', 'ACTIVE')
        and season.starts_at > statement_timestamp()
        and season.ends_at > season.starts_at
        and not exists (
          select 1 from public.ranking_seasons current_season
          where current_season.ranking_type = season.ranking_type
            and current_season.status = 'ACTIVE'
            and current_season.starts_at <= statement_timestamp()
            and current_season.ends_at > statement_timestamp()
        )
      order by season.ranking_type, season.starts_at, season.id
    ) planned
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_upcoming_ranking_seasons_v1() from public, anon;
grant execute on function public.get_upcoming_ranking_seasons_v1() to authenticated, service_role;
notify pgrst, 'reload schema';
commit;

