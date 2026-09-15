/** In-memory PGlite only. No network, env credentials, or external database. */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const runtime=resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14/outputs/raid-test-runtime/package.json');
const {PGlite}=createRequire(runtime)('@electric-sql/pglite');
const db=new PGlite();const results=[];const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{"is_anonymous":true}'::jsonb$$;
 grant usage on schema auth to authenticated;
 create table users(id uuid primary key,username text,current_base_id text,favorite_character_id text);
 create table tutorial_progress(user_id uuid primary key,step_id text);
 create table user_characters(id uuid primary key default gen_random_uuid(),user_id uuid,character_id text,created_at timestamptz default now());
 create table user_equipments(id uuid primary key default gen_random_uuid(),user_id uuid,equipment_id text,level int,plus_val int,equipped_character_id text,slot_index int,random_options jsonb,created_at timestamptz default now());
 alter table user_equipments enable row level security;
 create policy own_read on user_equipments for select to authenticated using(user_id=auth.uid());
 grant select on user_equipments to authenticated;
 create table canonical_equipment_master(version text,equipment_id text,primary key(version,equipment_id));
 create table gacha_execution_history(user_id uuid,status text,result_payload jsonb);`);
const master=JSON.parse(readFileSync('src/domain/gameplay/canonical/data/equipment_20260821.json','utf8'));
for(const e of master.equipments)await db.query('insert into canonical_equipment_master values($1,$2)',[master.version,e.equipment_id]);
const migration=process.env.C_EQUIPMENT_MIGRATION;
if(migration){
 assert.match(migration,/^supabase\/migrations\/\d+_[a-z0-9_]+\.sql$/);
 await db.exec(readFileSync(migration,'utf8'));
}else{
await db.exec(readFileSync('scripts/raid-step6-supplement/c-equipment-candidate.sql','utf8'));
const source=readFileSync('supabase/migrations/20260823000190_tutorial_first_home_canonical_reconciliation.sql','utf8');
let initializer=source.match(/create or replace function public\.initialize_current_player[\s\S]*?\$\$;/)[0];
const anchor="values(v_user_id,v_username,'shinjuku',null);";assert.ok(initializer.includes(anchor));
initializer=initializer.replace(anchor,anchor+'\n  insert into private.initial_equipment_receipts(user_id) values(v_user_id);');
await db.exec(initializer+'revoke all on function initialize_current_player(text) from public;grant execute on function initialize_current_player(text) to authenticated;');
}
const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':uid(n)]);await db.exec('set role authenticated');};
const admin=async sql=>{await db.exec('reset role');return db.exec(sql);};
const count=async (n=1)=>(await db.query('select count(*)::int n from user_equipments where user_id=$1',[uid(n)])).rows[0].n;
const call=async()=> (await db.query('select ensure_initial_equipment_v1() result')).rows[0].result;
const initialize=async n=>{await actor(n);await db.query('select initialize_current_player($1)',[`QA${n}`]);};
const roster=async n=>admin(`insert into user_characters(user_id,character_id) values('${uid(n)}','char_ren_01');insert into gacha_execution_history values('${uid(n)}','COMPLETED','{"tutorial":true}');`);

const ts=createRequire(resolve('package.json'))('typescript');
const game=readFileSync('src/app/context/GameContext.tsx','utf8');
const start=game.indexOf('      const readPersistedEquipment');
const end=game.indexOf('      // 総合力データの同期',start);
const useProposal=process.env.C_EQUIPMENT_PROPOSAL==='true';
if(!useProposal)assert.ok(start>=0&&end>start,'Parent must integrate actual GameContext projection before this acceptance run');
const projection=useProposal?readFileSync('scripts/raid-step6-supplement/c-equipment-projection.txt','utf8'):game.slice(start,end);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('supabase','userId','charsData','currentAuthUserIdRef','selectedEquipment','setUserEquipmentsList','setSelectedEquipment','setEquipmentLevel','setEquipmentLimitBreak','setSubOptions','console',ts.transpile(projection,{target:ts.ScriptTarget.ES2022})+'\nreturn equipsData;');
async function project(n,{lostRpc=false,failSecondRead=false,switchAfterRpc=false}={}){
 await actor(n);const ref={current:uid(n)},state={},calls=[];let reads=0;
 const supabase={from(name){assert.equal(name,'user_equipments');return {select(){return this;},eq(key,value){assert.equal(key,'user_id');assert.equal(value,uid(n));return this;},async order(){reads++;if(failSecondRead&&reads===2)return {data:null,error:{code:'TEST_READ_FAILURE'}};return {data:(await db.query('select * from user_equipments where user_id=$1 order by created_at desc',[uid(n)])).rows,error:null};}};},async rpc(name){assert.equal(name,'ensure_initial_equipment_v1');calls.push(name);try{const result=await call();if(switchAfterRpc)ref.current=null;return {data:lostRpc?null:result,error:lostRpc?{code:'TEST_LOST_RESPONSE'}:null};}catch(error){return {data:null,error:{code:error.code}};}}};
 const returned=await execute(supabase,uid(n),[{id:'owned'}],ref,null,v=>state.list=v,v=>state.selected=v,v=>state.level=v,v=>state.lb=v,v=>state.options=v,{warn(){}});
 return {state,calls,returned,reads};
}
try{
 await db.exec('reset role');
 const functions=(await db.query("select n.nspname,p.prosecdef,p.pronargs,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='ensure_initial_equipment_v1' order by n.nspname")).rows;
 assert.equal(functions.length,2);assert.equal(functions.find(f=>f.nspname==='private').prosecdef,true);assert.equal(functions.find(f=>f.nspname==='public').prosecdef,false);assert.ok(functions.every(f=>f.pronargs===0&&f.proconfig.includes('search_path=""')));
 const acl=(await db.query("select has_function_privilege('authenticated','public.ensure_initial_equipment_v1()','EXECUTE') allowed,has_function_privilege('anon','public.ensure_initial_equipment_v1()','EXECUTE') anonymous,has_table_privilege('authenticated','private.initial_equipment_receipts','INSERT') receipt_insert,has_table_privilege('authenticated','user_equipments','INSERT') direct_insert")).rows[0];assert.deepEqual(acl,{allowed:true,anonymous:false,receipt_insert:false,direct_insert:false});
 const receipt=(await db.query("select relrowsecurity from pg_class where oid='private.initial_equipment_receipts'::regclass")).rows[0];assert.equal(receipt.relrowsecurity,true);assert.equal((await db.query("select confdeltype from pg_constraint where conrelid='private.initial_equipment_receipts'::regclass and contype='f'")).rows[0].confdeltype,'c');results.push('actual SQL catalog: invoker/definer empty search_path ACL private RLS CASCADE');
 await initialize(1);await roster(1);let r=await project(1);assert.equal(await count(1),5);assert.equal(r.state.list.length,5);assert.equal(r.state.list,r.returned);const ids=r.returned.map(e=>e.id).sort();results.push('first bootstrap persists exact five and projects identical power input');
 for(let attempt=0;attempt<3;attempt++){await actor(null);r=await project(1);assert.equal(r.calls.length,0);assert.deepEqual(r.returned.map(e=>e.id).sort(),ids);assert.equal(await count(1),5);}results.push('three logout/relogin projections have zero duplicate grants');
 await initialize(2);await roster(2);r=await project(2,{lostRpc:true});assert.equal(r.calls.length,1);assert.equal(r.state.list.length,5);assert.equal(await count(2),5);r=await project(2);assert.equal(r.calls.length,0);assert.equal(await count(2),5);results.push('committed grant with lost response reconciles and retry adds zero');
 await initialize(3);await roster(3);await admin(`create function reject_head() returns trigger language plpgsql as $$begin if new.equipment_id='HEAD_001' then raise exception 'test persistence failure';end if;return new;end$$;create trigger reject_head before insert on user_equipments for each row execute function reject_head();`);r=await project(3);assert.equal(await count(3),0);assert.deepEqual(r.state.list,[]);assert.equal(r.state.selected,null);await admin('drop trigger reject_head on user_equipments');r=await project(3);assert.equal(await count(3),5);assert.equal(r.state.list.length,5);results.push('partial DB failure yields zero phantom rows; retry atomic five');
 await initialize(4);await roster(4);await assert.rejects(()=>project(4,{failSecondRead:true}),/projection unavailable/);assert.equal(await count(4),5);r=await project(4);assert.equal(r.calls.length,0);assert.equal(r.state.list.length,5);results.push('post-commit read failure then relogin reconciles five without another grant');
 await initialize(5);await roster(5);r=await project(5,{switchAfterRpc:true});assert.deepEqual(r.state,{});assert.equal(r.returned,undefined);assert.equal(await count(5),5);r=await project(5);assert.equal(r.state.list.length,5);assert.equal(r.calls.length,0);results.push('logout during grant hides old-user response; same user relogin reads once');
 await admin(`insert into users(id,username) values('${uid(9)}','Legacy');`);await roster(9);r=await project(9);assert.equal(await count(9),0);assert.deepEqual(r.state.list,[]);results.push('legacy empty inventory cannot receive new enrollment grant');
 await admin(`delete from user_equipments where user_id='${uid(1)}'`);r=await project(1);assert.equal(await count(1),0);assert.deepEqual(r.state.list,[]);results.push('spent equipment receipt prevents regrant on later empty bootstrap');
 mkdirSync('outputs/raid-step6-local-fixes',{recursive:true});writeFileSync('outputs/raid-step6-local-fixes/c-equipment-vertical.json',JSON.stringify({results,projection:useProposal?'proposal':'actual GameContext source',sqlSource:migration||'prior proposal plus initializer fixture',engine:'in-memory PGlite',externalExecuted:false,multiConnectionConcurrencyTested:false},null,2));console.log(`PASS ${results.length} local SQL/frontend vertical groups (${useProposal?'proposal':'actual source'})`);
}finally{await db.close();}
