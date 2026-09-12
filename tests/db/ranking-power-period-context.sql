-- Previewのみ。候補migration適用後の検証。fixture、状態変更は全てROLLBACK。
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';
create temporary table ranking_power_period_checks(check_name text, result text) on commit drop;
do $test$
declare
 v_uid uuid; v_season uuid; v_before jsonb; v_after jsonb; v_rows jsonb; v_daily jsonb;
 v_expected_start timestamptz := '2026-07-31 15:00:00+00';
 v_expected_end timestamptz := '2026-08-31 15:00:00+00';
begin
 select id into strict v_uid from public.users order by id limit 1;
 perform set_config('request.jwt.claim.sub',v_uid::text,true);
 select id into strict v_season from public.ranking_seasons where ranking_type='POWER' and status='ACTIVE';
 v_rows:=public.get_public_power_rankings(false,100,0);
 v_before:=public.get_ranking_self_context('power',false);
 update public.ranking_seasons set starts_at=v_expected_start,ends_at=v_expected_end where id=v_season;
 v_after:=public.get_ranking_self_context('power',false);
 if v_after->>'season_id' is distinct from v_season::text
    or (v_after->>'starts_at')::timestamptz is distinct from v_expected_start
    or (v_after->>'ends_at')::timestamptz is distinct from v_expected_end
    or v_after->>'status' is distinct from 'ACTIVE' then raise exception 'expired POWER metadata not returned'; end if;
 if v_before->'self' is distinct from v_after->'self'
    or v_before->'neighbors' is distinct from v_after->'neighbors'
    or v_rows is distinct from public.get_public_power_rankings(false,100,0) then raise exception 'ranking data changed'; end if;
 insert into ranking_power_period_checks values('期間外ACTIVEの実期間を返す・順位不変','PASS');
 v_daily:=public.get_ranking_self_context('power',true);
 if (v_daily->>'starts_at')::timestamptz is distinct from date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
    or (v_daily->>'ends_at')::timestamptz - (v_daily->>'starts_at')::timestamptz <> interval '1 day'
    or v_daily ? 'season_id' then raise exception 'daily period contract changed'; end if;
 insert into ranking_power_period_checks values('Daily期間契約維持','PASS');
 update public.ranking_seasons set status='CLOSED' where id=v_season;
 v_after:=public.get_ranking_self_context('power',false);
 if v_after ? 'season_id' or v_after ? 'starts_at' then raise exception 'closed season reused for live score'; end if;
 if (select status from public.ranking_seasons where id=v_season)<>'CLOSED' then raise exception 'read advanced season'; end if;
 insert into ranking_power_period_checks values('CLOSEDを現在総合力に流用しない・読取で状態変更なし','PASS');
end $test$;
select * from ranking_power_period_checks;
rollback;
