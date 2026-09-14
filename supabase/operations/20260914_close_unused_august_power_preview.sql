-- User authorized 2026-09-14: close unused August POWER, no rewards or reset.
-- Operational script; Preview target must be verified before execution. Not a migration.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
DO $$
declare sid uuid;r record;n bigint;before_assets text;after_assets text;original_status text;
begin
 select id,status into strict sid,original_status from public.ranking_seasons
 where ranking_type='POWER' and starts_at='2026-07-31 15:00+00' and ends_at='2026-08-31 15:00+00' for update;
 if original_status='CLOSED' then return;end if;
 if original_status<>'ACTIVE' then raise exception 'Unexpected old POWER state';end if;
 for r in select n.nspname,c.relname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and a.attname='season_id' and not a.attisdropped
 loop
 execute format('lock table %I.%I in share mode',r.nspname,r.relname);
 execute format('select count(*) from %I.%I where season_id::text=$1::text',r.nspname,r.relname) into n using sid;
 if n<>0 then raise exception 'Old POWER has references in %',r.relname;end if;
 end loop;
 if exists(select 1 from public.ranking_reward_notifications where period_kind='SEASON' and period_key=sid::text) then raise exception 'Old POWER notification exists';end if;
 select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(x) order by id) from public.users x),
 (select jsonb_agg(to_jsonb(x) order by user_id,item_id) from public.user_items x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.user_characters x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.user_equipments x),
 (select jsonb_agg(to_jsonb(x) order by user_id) from public.user_power_rankings x))::text) into before_assets;
 update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp() where id=sid;
 select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(x) order by id) from public.users x),
 (select jsonb_agg(to_jsonb(x) order by user_id,item_id) from public.user_items x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.user_characters x),
 (select jsonb_agg(to_jsonb(x) order by id) from public.user_equipments x),
 (select jsonb_agg(to_jsonb(x) order by user_id) from public.user_power_rankings x))::text) into after_assets;
 if before_assets is distinct from after_assets then raise exception 'Asset or power changed';end if;
end $$;
select id,ranking_type,starts_at,ends_at,status from public.ranking_seasons
where ranking_type='POWER' and starts_at='2026-07-31 15:00+00' and ends_at='2026-08-31 15:00+00';
commit;
