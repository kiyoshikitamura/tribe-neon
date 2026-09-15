create or replace function public.get_raid_season_rankings(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'invalid pagination' using errcode='22023'; end if;
 return jsonb_build_object('status','RETIRED','individual','[]'::jsonb,'guild','[]'::jsonb,'selfRank',null,'season_id',null,'starts_at',null,'ends_at',null);
end $$;