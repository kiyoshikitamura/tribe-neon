create or replace function public.raid_season_reset() returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin role required'; end if;
 return;
end $$;