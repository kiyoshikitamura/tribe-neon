do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f')::text) is distinct from 'c0dd840db9d54c8b4f641accec3168a2' then
  raise exception '工程2 baseline drift: public function body/signature/owner/ACL。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(t order by version) from (select version,name from supabase_migrations.schema_migrations)t)::text) is distinct from '304f86a3786d03a956107a98febaf20d' then
  raise exception '工程2 baseline drift: migration history。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(t order by jobid) from (select jobid,jobname,schedule,command,active,database,username from cron.job)t)::text) is distinct from '23ecae21c408e484c8abcb81229d7fa4' then
  raise exception '工程2 baseline drift: Cron jobs。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped)::text) is distinct from 'ff302978bb0cb375dc5afb503eae9798' then
  raise exception '工程2 baseline drift: columns。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text,c.conname) from pg_constraint c where c.connamespace='public'::regnamespace)::text) is distinct from '3f422037e810338f7cf9adbc47ffe578' then
  raise exception '工程2 baseline drift: constraints。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace,'auth'::regnamespace)))::text) is distinct from '1e9d5e31d31948d24cc75f7052abc452' then
  raise exception '工程2 baseline drift: triggers。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_object_agg(relname,jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl)) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m'))::text) is distinct from '7b0c3845ba3966b5261a479a6a4bb95e' then
  raise exception '工程2 baseline drift: table RLS and grants。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_object_agg(indexname,to_jsonb(t)) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public')t)::text) is distinct from '0a6ab21d8af915f1c0d39041d57d05f5' then
  raise exception '工程2 baseline drift: indexes。再取得・再照合が必要';
 end if;
end $guard$;
do $guard$ begin
 if md5((select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(t)) from (select * from pg_policies where schemaname='public')t)::text) is distinct from 'de49453e0afda5128cb753ba7cc875c5' then
  raise exception '工程2 baseline drift: policies。再取得・再照合が必要';
 end if;
end $guard$;
