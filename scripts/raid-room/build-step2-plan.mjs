// 固定SHAと取得済catalogからレビュー用SQLを生成する。DB接続・適用・履歴登録を行わない。
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha='375a0ad642a81e9db10a9379f03e5e5f77fb4562';
const evidence='docs/development/evidence/raid-room-step2-20260908';
const out='docs/development/raid-room-step2';
const c=JSON.parse(fs.readFileSync(`${evidence}/catalog.json`,'utf8'));
fs.mkdirSync(out,{recursive:true});
const write=(name,s)=>fs.writeFileSync(`${out}/${name}`,s.trimEnd()+'\n');
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const hash=s=>createHash('sha256').update(s).digest('hex');
// PostgreSQL jsonb::textのキー順・空白へ正規化。実DBのSELECTでhash一致も検証する。
const pgJson=v=>Array.isArray(v)?'['+v.map(pgJson).join(', ')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>JSON.stringify(k)+': '+pgJson(v[k])).join(', ')+'}':JSON.stringify(v);
const pgMd5=v=>createHash('md5').update(pgJson(v)).digest('hex');
const files=fs.readdirSync('supabase/migrations').filter(n=>/^202609080002[56]\d_/.test(n)).sort();
if(files.length!==14)throw new Error('14本の固定manifestが必要');
const manifest=[];let bundle='-- 375a0adの未存在14本だけ。各ファイル内transactionを外し、単一transactionへ統合。\n';
let writers=new Set();
for(const file of files){
 const src=execFileSync('git',['show',`${sha}:supabase/migrations/${file}`],{encoding:'utf8'});
 const local=fs.readFileSync(`supabase/migrations/${file}`,'utf8');
 if(src.replaceAll('\r\n','\n')!==local.replaceAll('\r\n','\n'))throw new Error(`固定SHA不一致: ${file}`);
 for(const m of src.matchAll(/create (?:or replace )?function public\.(\w+)/gi))writers.add(m[1]);
 const adjusted=src.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'').replace(/^notify pgrst[^\n]*$/gmi,'').replace(/do \$schedule\$[\s\S]*?\$schedule\$;/i,'-- 毎分Cronは03-expiry-cron.sqlへ分離。既存jobは変更しない。');
 manifest.push({file,sha256:hash(src),adjustments:file.includes('00257_')?['transaction/notify統合','Cron登録分離']:['transaction/notify統合']});
 bundle+=`\n-- SOURCE: ${file}\n${adjusted}\n`;
}
write('02-raid-delta.sql',bundle);
const original=c.functions.find(f=>f.name==='build_server_battle_snapshot').definition.replaceAll('\r\n','\n');
let patch=original.replace(') order by unit.ordinality)',`) || jsonb_build_object('characterId',owned.character_id,'level',owned.level,\n      'awakeningLevel',owned.awakening_level,'rarity',master.rarity) order by unit.ordinality)`)
 .replace('  cross join lateral (select public.canonical_equipment_runtime_projection(',`  join public.user_characters owned on owned.user_id=p_user_id\n    and owned.id=regexp_replace(unit.value->>'id','^[^_]+_','')::uuid\n  join public.canonical_character_master master on master.version='2026-08-21'\n    and master.character_id=owned.character_id\n  cross join lateral (select public.canonical_equipment_runtime_projection(`)
 .replace("  return coalesce(v_result,'[]'::jsonb);",`  if coalesce(jsonb_array_length(v_result),0)<>coalesce(jsonb_array_length(v_base),0) then\n    raise exception 'battle snapshot presentation metadata is incomplete' using errcode='23503';\n  end if;\n  return coalesce(v_result,'[]'::jsonb);`);
if(patch===original||!patch.includes("'characterId',owned.character_id")||!patch.includes('join public.user_characters owned'))throw new Error('snapshot差分anchor不一致');
write('01-snapshot-dependency.sql','-- 00232全再適用は禁止。現PreviewのSPD/LUK補正を残し表示metadataだけ追加。\n'+patch+';\n-- CREATE OR REPLACEで既存owner/ACLを保持。GRANT/REVOKE追加なし。');
const fnExpected=c.functions.map(f=>({name:f.name,args:f.args,md5:f.md5,owner:f.owner,acl:f.acl}));
const fnQuery=`select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`;
const checks=[
 ['public function body/signature/owner/ACL',fnQuery,fnExpected],
 ['migration history','select jsonb_agg(t order by version) from (select version,name from supabase_migrations.schema_migrations)t',c.migrations],
 ['Cron jobs','select jsonb_agg(t order by jobid) from (select jobid,jobname,schedule,command,active,database,username from cron.job)t',c.cron],
 ['columns',`select jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped`,c.columns],
 ['constraints',`select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text,c.conname) from pg_constraint c where c.connamespace='public'::regnamespace`,c.constraints],
 ['triggers',`select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace,'auth'::regnamespace))`,c.triggers],
 ];
checks.push(['table RLS and grants',`select jsonb_object_agg(relname,jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl)) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m')`,Object.fromEntries(c.relations.map(r=>[r.name,r]))]);
checks.push(['indexes',`select jsonb_object_agg(indexname,to_jsonb(t)) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public')t`,Object.fromEntries(c.indexes.map(r=>[r.indexname,r]))]);
checks.push(['policies',`select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(t)) from (select * from pg_policies where schemaname='public')t`,Object.fromEntries(c.policies.map(r=>[r.schemaname+'.'+r.tablename+'.'+r.policyname,r]))]);
write('00-baseline-guard.sql',checks.map(([label,sql,expected])=>`do $guard$ begin\n if md5((${sql})::text) is distinct from ${lit(pgMd5(expected))} then\n  raise exception ${lit('工程2 baseline drift: '+label+'。再取得・再照合が必要')};\n end if;\nend $guard$;`).join('\n'));
write('00-readonly-recheck.sql',"begin read only;\nset local statement_timeout='20s';\nset local lock_timeout='2s';\nselect jsonb_agg(t) as checks from (\n"+checks.map(([label,sql,expected])=>`select ${lit(label)} as check_name, md5((${sql})::text) is not distinct from ${lit(pgMd5(expected))} as matches`).join('\nunion all\n')+'\n)t;\nrollback;');
write('review-apply.psql',`-- 実行していないレビュー用。接続先を管理APIとDB hostで照合してから使用する。\n-- GUCは誤操作防止だけで接続先検証の代わりではない。既定ではROLLBACK。\n\\set ON_ERROR_STOP on\nbegin;\nset local statement_timeout='60s';\nset local lock_timeout='2s';\nset local search_path=public,pg_catalog;\n\\ir 00-baseline-guard.sql\n\\ir 01-snapshot-dependency.sql\n\\ir 02-raid-delta.sql\n\\ir 04-postflight.sql\nnotify pgrst,'reload schema';\nrollback;\n-- 後続工程で保存する場合のみ、レビュー後に上のROLLBACKをCOMMITへ変更。\n-- 8本の履歴repairも14本の履歴偽装も行わない。独立した適用記録を残す。`);
write('03-expiry-cron.sql',`-- DB/Edge対応・運用競合解消後の別transaction。既定ROLLBACK。\nbegin;\nset local lock_timeout='2s';\nset local statement_timeout='10s';\ndo $schedule$\nbegin\n if to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)') is null then raise exception 'Room expiry RPC missing'; end if;\n if exists(select 1 from cron.job where jobname='raid-room-expiry-minute') then raise exception 'Room job already exists; inspect definition'; end if;\n perform cron.schedule('raid-room-expiry-minute','* * * * *',$job$select public.finalize_expired_raid_rooms_v1(100);$job$);\nend $schedule$;\nselect jobid,jobname,schedule,command,active from cron.job order by jobid;\nrollback;`);
const preserve=c.functions.filter(f=>!writers.has(f.name)&&f.name!=='build_server_battle_snapshot');
write('04-postflight.sql',`-- 同一transaction内の保存前チェック。業務RPCは呼び出さない。\ndo $verify$\ndeclare r record;\nbegin\n for r in select * from (values ${preserve.map(f=>`(${lit(f.name)},${lit(f.args)},${lit(f.md5)})`).join(',\n')}) x(name,args,hash) loop\n  if not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=r.name and pg_get_function_identity_arguments(p.oid)=r.args and md5(pg_get_functiondef(p.oid))=r.hash) then raise exception 'protected function changed: %',r.name; end if;\n end loop;\n if (${checks[2][1]}) is distinct from ${lit(JSON.stringify(c.cron))}::jsonb then raise exception 'existing Cron changed'; end if;\n if (${checks[1][1]}) is distinct from ${lit(JSON.stringify(c.migrations))}::jsonb then raise exception 'migration history changed'; end if;\n if exists(select 1 from public.raid_room_creation_settings where enabled) or exists(select 1 from public.raid_room_battle_settings where enabled) or exists(select 1 from public.raid_room_rescue_settings where enabled) then raise exception 'Room unexpectedly enabled'; end if;\n if not exists(select 1 from public.raid_legacy_settings where singleton and enabled) then raise exception 'legacy flag changed'; end if;\n if exists(select 1 from public.raid_room_clear_reward_rules where enabled) or exists(select 1 from public.raid_room_rescue_reward_rules where enabled) then raise exception 'reward unexpectedly enabled'; end if;\n if (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'raid_room%' and relkind='r' and not relrowsecurity)>0 then raise exception 'Room RLS missing'; end if;\nend $verify$;\nselect n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),p.prosecdef,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%raid_room%' or p.proname='get_raid_battle_route_v1') order by p.proname;`);
fs.writeFileSync(`${evidence}/plan-manifest.json`,JSON.stringify({sha,project_ref:c.project_ref,observed_at:c.observed_at,sources:manifest,existing_function_names_replaced:[...writers].filter(n=>c.functions.some(f=>f.name===n)),snapshot_additive_patch:true,cron_registration_deferred:true,unregistered_files_reapplied:[],artifacts:fs.readdirSync(out).filter(n=>/sql$/.test(n)).map(n=>({file:n,sha256:hash(fs.readFileSync(`${out}/${n}`))}))},null,2)+'\n');
console.log(`レビューSQL生成: ${files.length}本、既存関数${[...writers].filter(n=>c.functions.some(f=>f.name===n)).length}名を照合。DB未接続。`);
