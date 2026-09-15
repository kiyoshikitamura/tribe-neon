begin read only;
set local statement_timeout='20s';
set local lock_timeout='2s';
select jsonb_agg(t) as checks from (
select 'public function body/signature/owner/ACL' as check_name, md5((select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f')::text) is not distinct from 'c0dd840db9d54c8b4f641accec3168a2' as matches
union all
select 'migration history' as check_name, md5((select jsonb_agg(t order by version) from (select version,name from supabase_migrations.schema_migrations)t)::text) is not distinct from '304f86a3786d03a956107a98febaf20d' as matches
union all
select 'Cron jobs' as check_name, md5((select jsonb_agg(t order by jobid) from (select jobid,jobname,schedule,command,active,database,username from cron.job)t)::text) is not distinct from '23ecae21c408e484c8abcb81229d7fa4' as matches
union all
select 'columns' as check_name, md5((select jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped)::text) is not distinct from 'ff302978bb0cb375dc5afb503eae9798' as matches
union all
select 'constraints' as check_name, md5((select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text,c.conname) from pg_constraint c where c.connamespace='public'::regnamespace)::text) is not distinct from '3f422037e810338f7cf9adbc47ffe578' as matches
union all
select 'triggers' as check_name, md5((select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace,'auth'::regnamespace)))::text) is not distinct from '1e9d5e31d31948d24cc75f7052abc452' as matches
union all
select 'table RLS and grants' as check_name, md5((select jsonb_object_agg(relname,jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl)) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m'))::text) is not distinct from '7b0c3845ba3966b5261a479a6a4bb95e' as matches
union all
select 'indexes' as check_name, md5((select jsonb_object_agg(indexname,to_jsonb(t)) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public')t)::text) is not distinct from '0a6ab21d8af915f1c0d39041d57d05f5' as matches
union all
select 'policies' as check_name, md5((select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(t)) from (select * from pg_policies where schemaname='public')t)::text) is not distinct from 'de49453e0afda5128cb753ba7cc875c5' as matches
)t;
rollback;
