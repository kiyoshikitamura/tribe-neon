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
 create table user_equipments(id uuid primary key default gen_random_uuid(),user_id uuid,equipment_id text,level int,plus_val int,equipped_character_id text,slot_index int,random_options jsonb);
 alter table user_equipments enable row level security;
 create policy own_read on user_equipments for select to authenticated using(user_id=auth.uid());
 grant select on user_equipments to authenticated;
 create table canonical_equipment_master(version text,equipment_id text,primary key(version,equipment_id));
 create table gacha_execution_history(user_id uuid,status text,result_payload jsonb);`);
const master=JSON.parse(readFileSync('src/domain/gameplay/canonical/data/equipment_20260821.json','utf8'));
for(const e of master.equipments)await db.query('insert into canonical_equipment_master values($1,$2)',[master.version,e.equipment_id]);
await db.exec(readFileSync('supabase/migrations/20260909075933_initial_equipment_authority.sql','utf8'));
const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':uid(n)]);await db.exec('set role authenticated');};
const admin=async sql=>{await db.exec('reset role');return db.exec(sql);};
const count=async (n=1)=>(await db.query('select count(*)::int n from user_equipments where user_id=$1',[uid(n)])).rows[0].n;
const call=async()=> (await db.query('select ensure_initial_equipment_v1() result')).rows[0].result;
const initialize=async n=>{await actor(n);await db.query('select initialize_current_player($1)',[`QA${n}`]);};
const roster=async n=>admin(`insert into user_characters(user_id,character_id) values('${uid(n)}','char_ren_01');insert into gacha_execution_history values('${uid(n)}','COMPLETED','{"tutorial":true}');`);
try{
 await actor(null);await assert.rejects(call,/authentication required/);results.push('unauthenticated denied');await actor(88);await assert.rejects(call,/player profile required/);results.push('missing current user fails closed');await db.exec('reset role;set role anon');await assert.rejects(call,/permission denied/);results.push('anonymous API role cannot execute');
 await admin(`insert into users(id,username) values('${uid(9)}','Legacy');`);await initialize(9);assert.equal((await call()).status,'not_eligible');results.push('existing empty user never retro-enrolled');
 await initialize(1);assert.equal((await call()).status,'pending');assert.equal(await count(),0);results.push('new initialization zero roster remains pending');
 await roster(1);await actor(1);await assert.rejects(()=>db.exec(`insert into user_equipments(user_id) values('${uid(1)}')`),/permission denied/);results.push('direct authenticated insert remains forbidden');
 const issued=await call();assert.equal(issued.status,'granted');assert.equal(issued.equipmentIds.length,5);assert.equal(await count(),5);
 const rows=(await db.query('select * from user_equipments order by slot_index')).rows;assert.deepEqual(rows.map(r=>r.slot_index),[0,2,3,4,5]);assert.deepEqual(rows.map(r=>r.equipment_id),['WEAPON_001','HEAD_001','BODY_001','LEGS_001','ACCESSORY_001']);assert.ok(rows.every(r=>r.level===1&&r.plus_val===0&&r.random_options.length===4));results.push('fixed five canonical persisted rows and slots');
 const retries=await Promise.all(Array.from({length:8},()=>call()));assert.ok(retries.every(r=>JSON.stringify(r)===JSON.stringify(issued)));assert.equal(await count(),5);results.push('eight queued retries stable receipt (single PGlite connection)');
 await admin(`delete from user_equipments where user_id='${uid(1)}'`);await actor(1);assert.deepEqual(await call(),issued);assert.equal(await count(),0);results.push('sale/reset does not recreate spent equipment');
 await initialize(2);await roster(2);await admin(`insert into user_equipments(user_id,equipment_id) values('${uid(2)}','WEAPON_001')`);await actor(2);assert.equal((await call()).status,'skipped');await admin(`delete from user_equipments where user_id='${uid(2)}'`);await actor(2);assert.equal((await call()).status,'skipped');assert.equal(await count(2),0);results.push('nonempty inventory seals skipped receipt without additions');
 await initialize(3);await roster(3);await admin(`create function reject_head() returns trigger language plpgsql as $$begin if new.equipment_id='HEAD_001' then raise exception 'test persistence failure';end if;return new;end$$;create trigger reject_head before insert on user_equipments for each row execute function reject_head();`);await actor(3);await assert.rejects(call,/test persistence failure/);assert.equal(await count(3),0);await admin('drop trigger reject_head on user_equipments');await actor(3);assert.equal((await call()).equipmentIds.length,5);results.push('mid-insert failure rolls back all rows and receipt; retry succeeds');
 await actor(2);assert.equal(await count(3),0);await assert.rejects(()=>db.exec('select * from private.initial_equipment_receipts'),/permission denied/);results.push('caller isolation and private receipt unreadable');
 await initialize(4);await roster(4);await admin("delete from canonical_equipment_master where equipment_id='HEAD_001'");await actor(4);await assert.rejects(call,/master unavailable/);assert.equal(await count(4),0);results.push('missing canonical master fails closed with no grants'); // Real reset retains users; deletion of public.users belongs to discard/cleanup.
 await admin(`update users set favorite_character_id=null where id='${uid(1)}'`);await actor(1);assert.deepEqual(await call(),issued);assert.equal(await count(),0);results.push('profile-preserving reset retains one-time receipt');
 for(const [n,status] of [[1,'GRANTED'],[2,'SKIPPED'],[4,'PENDING']]){
  await db.exec('reset role');assert.equal((await db.query('select state from private.initial_equipment_receipts where user_id=$1',[uid(n)])).rows[0].state,status);
  await db.query('delete from users where id=$1',[uid(n)]);
  assert.equal((await db.query('select count(*)::int n from private.initial_equipment_receipts where user_id=$1',[uid(n)])).rows[0].n,0);
  await actor(n);await assert.rejects(call,/player profile required/);
 }
 results.push('account deletion cascades pending/granted/skipped receipts and cannot grant without profile');
 mkdirSync('outputs/raid-step6-local-fixes',{recursive:true});writeFileSync('outputs/raid-step6-local-fixes/c-authority-local.json',JSON.stringify({engine:'PGlite in memory',results,externalExecuted:false,multiConnectionConcurrencyTested:false},null,2));

 console.log(`PASS ${results.length} local SQL groups; external DB untested`);
}finally{await db.close();}
