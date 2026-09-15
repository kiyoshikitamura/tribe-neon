-- READ ONLY。出力を実行直前にも確認する。
begin read only;
select * from public.feature_operating_states where feature_key='MAINTENANCE';
select tablename from pg_tables where schemaname='public' and tablename like 'billing%';
select p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'billing%' or p.proname in ('claim_present','claim_all_presents'));
rollback;
