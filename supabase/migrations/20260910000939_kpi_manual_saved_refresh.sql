create or replace function public.request_kpi_overview_saved_refresh(
  p_today date default (now() at time zone 'Asia/Tokyo')::date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_today is null or p_today > (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'invalid observation date';
  end if;
  return public.refresh_kpi_overview_saved_results(p_today);
end;
$$;

revoke all on function public.request_kpi_overview_saved_refresh(date) from public, anon, authenticated;
grant execute on function public.request_kpi_overview_saved_refresh(date) to service_role;
