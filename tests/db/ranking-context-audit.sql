-- Preview only. Run after 20260912153017. Every fixture and lifecycle side effect is rolled back.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
create temporary table ranking_audit_results(check_name text, result text) on commit drop;
do $test$
declare
 v_uid uuid; v_guild uuid; v_season uuid; v_self jsonb; v_page jsonb; v_all jsonb;
 v_expected integer; v_position integer; v_index integer; v_virtual uuid;
begin
 select user_id,guild_id into strict v_uid,v_guild from public.guild_members order by user_id limit 1;
 perform set_config('request.jwt.claim.sub',v_uid::text,true);
 select season_id into strict v_season from public.ranking_guild_power_season_master where event_key='PREOPEN_GUILD_POWER_2026';

 -- Real current context first: every listed self row has the exact absolute list position.
 v_all:=public.get_preopen_guild_power_ranking(100,0);
 v_self:=v_all->'self_guild';
 if v_self is not null and v_self<>'null'::jsonb then
   select ordinality::integer into v_expected from jsonb_array_elements(v_all->'rows') with ordinality r(value,ordinality)
    where value->>'guild_id'=v_guild::text;
   v_position:=(v_self->>'row_position')::integer;
   if v_expected is not null and v_position is distinct from v_expected then raise exception 'live position mismatch'; end if;
   if v_position is null then raise exception 'live self missing row position'; end if;
   v_page:=public.get_preopen_guild_power_ranking(5,greatest(0,v_position-3));
   if not exists(select 1 from jsonb_array_elements(v_page->'rows') r where r->>'guild_id'=v_guild::text) then raise exception 'live neighbor self missing'; end if;
   insert into ranking_audit_results values('current context self row_position + neighbors','PASS');
 else
   insert into ranking_audit_results values('current context self row_position + neighbors','NO_SELF_IN_CURRENT_DATA');
 end if;

 -- Frozen season fixture: six identical rank1 scores, self is last by UUID order.
 -- No ranking rewards or finalization are invoked: status is already CLOSED in this transaction.
 update public.ranking_seasons set status='CLOSED' where id=v_season;
 delete from public.ranking_guild_power_season_snapshots where season_id=v_season;
 for v_index in 1..5 loop
   v_virtual:=('00000000-0000-0000-0000-'||lpad(v_index::text,12,'0'))::uuid;
   if v_virtual>=v_guild then raise exception 'fixture UUID ordering assumption failed'; end if;
   insert into public.ranking_guild_power_season_snapshots(season_id,guild_id,guild_name,total_power,member_count,rank_position)
    values(v_season,v_virtual,'fixture',100000,1,1);
 end loop;
 insert into public.ranking_guild_power_season_snapshots(season_id,guild_id,guild_name,total_power,member_count,rank_position)
  values(v_season,v_guild,'self fixture',100000,1,1);
 v_all:=public.get_preopen_guild_power_ranking(100,0);
 v_self:=v_all->'self_guild';
 if (v_self->>'row_position')::integer is distinct from 6 then raise exception 'tied self row_position must be6: %',v_self; end if;
 if (v_self->>'rank_position')::integer is distinct from 1 then raise exception 'display rank changed'; end if;
 v_page:=public.get_preopen_guild_power_ranking(5,greatest(0,(v_self->>'row_position')::integer-3));
 if jsonb_array_length(v_page->'rows')<>3 then raise exception 'expected last3 rows'; end if;
 if not exists(select 1 from jsonb_array_elements(v_page->'rows') r where r->>'guild_id'=v_guild::text) then raise exception 'tied self missing in nearby'; end if;
 if exists(select 1 from jsonb_array_elements(v_page->'rows') r where (r->>'rank_position')::integer<>1) then raise exception 'tie ranks changed'; end if;
 insert into ranking_audit_results values('six rank1 guilds; self row6 present in nearby; display rank preserved','PASS');
end $test$;
select * from ranking_audit_results;
rollback;
