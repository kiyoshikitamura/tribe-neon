// Local, in-memory PostgreSQL acceptance. No credentials and no network calls.
// PGLITE_MODULE may point at an isolated tool installation; not a runtime dependency.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const read = file => fs.readFileSync(file,'utf8');
const migrations='supabase/migrations/';
const migrationPath=fs.readdirSync(migrations).find(f=>f.endsWith('_special_gacha_release_contract.sql'));
function loadTs(file) {
 const absolute=path.resolve(file); const module={exports:{}};
 const code=ts.transpileModule(read(absolute),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>loadTs(path.resolve(path.dirname(absolute),name)+'.ts')});
 return module.exports;
}
const fn=(file,name)=>{const s=read(migrations+file); const match=s.match(new RegExp('create(?: or replace)? function public\\.'+name+'\\([\\s\\S]*?\\$\\$;','i'));assert.ok(match,name);return match[0];};
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table users(id uuid primary key,cash bigint default 100000,neon_diamonds bigint default 100000);
create table gacha_masters(id text primary key,name text not null,gacha_type text,cost_cash integer,cost_diamond integer);
create table gacha_items_master(id text primary key,gacha_id text references gacha_masters,item_type text,item_id text,rarity text,weight integer,is_pickup boolean);
create table gacha_rarity_rates(gacha_id text,rarity text,weight integer,primary key(gacha_id,rarity));
create table canonical_character_master(version text,character_id text primary key,display_name text,rarity text,attribute text);
create table skill_battle_master(skill_id text primary key,display_name text,enabled boolean,exclusive_character_id text);
create table equipment_battle_master(equipment_id text primary key,display_name text,is_exclusive boolean,rarity text);
create table feature_operating_states(feature_key text primary key,state text);
insert into feature_operating_states values('SPECIAL_GACHA','CLOSED');
create table user_gacha_pity_points(user_id uuid,pity_master_id text,current_points integer,updated_at timestamptz,primary key(user_id,pity_master_id));
create table user_items(user_id uuid,item_id text,quantity integer,updated_at timestamptz,primary key(user_id,item_id));
create table user_characters(id uuid primary key default gen_random_uuid(),user_id uuid,character_id text,level integer,awakening_level integer,awakening_progress integer default 0);
create table user_skills(id uuid primary key default gen_random_uuid(),user_id uuid,skill_card_id text,plus_val integer);
create table user_equipments(id uuid primary key default gen_random_uuid(),user_id uuid,equipment_id text,level integer,plus_val integer,random_options jsonb);
create table user_daily_gacha_claims(user_id uuid,gacha_type text,last_claimed_date date,updated_at timestamptz,primary key(user_id,gacha_type));
create table gacha_execution_history(user_id uuid,request_id uuid,gacha_id text,payment_source text,pull_count integer,ticket_item_id text,cost_amount integer,pity_before integer,pity_after integer,result_payload jsonb,status text default 'PENDING',completed_at timestamptz,primary key(user_id,request_id));
create function record_funnel_milestone(uuid,text,jsonb) returns void language sql as $$ select $$;
`);
const CHARACTERS_MASTER=JSON.parse(read('src/domain/gameplay/canonical/data/characters_20260821.json')).characters.map(c=>({id:c.character_id,jpName:c.name,rarity:c.rarity,alignment:c.attribute}));
for(const c of CHARACTERS_MASTER) await db.query("insert into canonical_character_master values('2026-08-21',$1,$2,$3,$4)",[c.id,c.jpName,c.rarity,c.alignment]);
for(const [prefix,type] of [['CHAR','CHARACTER'],['SKILL','SKILL'],['EQUIP','EQUIPMENT']]) {
 for(const kind of ['NORMAL','SPECIAL']) {
  const id=`${prefix}_${kind}`;
  await db.query('insert into gacha_masters values($1,$1,$2,1000,300)',[id,type]);
  for(const [rarity,weight] of [['N',50],['R',40],['SR',9],['SSR',1]]) await db.query('insert into gacha_rarity_rates values($1,$2,$3)',[id,rarity,weight]);
 }
}
// Actual character master; asset fixtures retain every dedicated ID and canonical rarity.
await db.exec(`insert into gacha_items_master select g.id||':'||c.character_id,g.id,'CHARACTER',c.character_id,c.rarity,1,false from canonical_character_master c cross join gacha_masters g where g.gacha_type='CHARACTER';`);
for(let n=1;n<=70;n++) {
 const id=`SKILL_${String(n).padStart(3,'0')}`; const rarity=n<=10?'N':n<=20?'R':n<=35?'SR':n<=60?'SSR':'SR';
 await db.query('insert into skill_battle_master values($1,$1,true,$2)',[id,n>=51?'owner':null]);
 if(n<=50) for(const gid of ['SKILL_NORMAL','SKILL_SPECIAL']) await db.query('insert into gacha_items_master values($1,$2,\'SKILL\',$3,$4,1,false)',[`${gid}:${id}`,gid,id,rarity]);
}
const equipment=['WEAPON_047','WEAPON_048','WEAPON_049','WEAPON_050','HEAD_020','BODY_029','BODY_030','LEGS_020','ACCESSORY_049','ACCESSORY_050'];
for(const id of equipment) await db.query('insert into equipment_battle_master values($1,$1,true,\'SSR\')',[id]);
for(const rarity of ['N','R','SR','SSR']) {
 const id=`GENERIC_${rarity}`; await db.query('insert into equipment_battle_master values($1,$1,false,$2)',[id,rarity]);
 for(const gid of ['EQUIP_NORMAL','EQUIP_SPECIAL']) await db.query('insert into gacha_items_master values($1,$2,\'EQUIPMENT\',$3,$4,1,false)',[`${gid}:${id}`,gid,id,rarity]);
}
for(const name of ['draw_gacha_rarity','draw_gacha_item']) await db.exec(fn('20260817000159_gacha_launch_control_foundation.sql',name));
for(const name of ['canonical_character_awakening_required','apply_character_awakening_equivalent','execute_character_gacha','exchange_pity_reward']) await db.exec(fn('20260822000175_character_awakening_copy_equivalent.sql',name));
await db.exec(fn('20260821000173_mission_production_master.sql','execute_asset_gacha'));
await db.exec(read(migrations+'20260828000208_gacha_result_projection_parity.sql'));
const normalBefore=(await db.query(`select jsonb_agg(to_jsonb(p) order by id) data from gacha_items_master p where gacha_id like '%_NORMAL'`)).rows[0].data;
await db.exec(read(migrations+migrationPath));
const normalAfter=(await db.query(`select jsonb_agg(to_jsonb(p) order by id) data from gacha_items_master p where gacha_id like '%_NORMAL'`)).rows[0].data;
assert.deepEqual(normalAfter,normalBefore,'Normal pool unchanged');
const user=randomUUID();
await db.query('insert into users(id) values($1)',[user]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
const catalog=()=>db.query('select get_special_gacha_catalog() data').then(r=>r.rows[0].data);
let data=await catalog(); assert.equal(data.available,false);
const domain=loadTs('src/domain/gacha/specialGacha.ts'); assert.ok(domain.parseSpecialGachaCatalog(data));
const expected={CHAR_JUSTICE_EVIL_SPECIAL:{R:65,SR:30,SSR:5},CHAR_ORDER_CHAOS_SPECIAL:{R:65,SR:30,SSR:5},SKILL_SPECIAL:{R:57,SR:35,SSR:8},EQUIP_SPECIAL:{R:52,SR:38,SSR:10}};
for(const g of data.gachas) {
 for(const [rarity,total] of Object.entries(expected[g.id])) assert.ok(Math.abs(g.items.filter(i=>i.rarity===rarity).reduce((a,i)=>a+Number(i.probability),0)-total)<1e-8,`${g.id}:${rarity}`);
 if(g.id.startsWith('CHAR_')) {
  const alignments=g.id.includes('JUSTICE')?['JUSTICE','EVIL']:['ORDER','CHAOS'];
  for(const item of g.items) assert.ok(alignments.includes(CHARACTERS_MASTER.find(c=>c.id===item.item_id).alignment));
  assert.equal(g.items.filter(i=>i.rarity==='SSR').length,g.id.includes('JUSTICE')?4:6);
 }
}
assert.equal(data.gachas.find(g=>g.id==='SKILL_SPECIAL').items.filter(i=>i.rarity==='SSR'&&i.is_exclusive).reduce((a,i)=>a+Number(i.probability),0).toFixed(1),'4.8');
assert.equal(data.gachas.find(g=>g.id==='EQUIP_SPECIAL').items.filter(i=>i.rarity==='SSR'&&i.is_exclusive).reduce((a,i)=>a+Number(i.probability),0).toFixed(1),'6.0');
const draw=(gid,count,currency,request=randomUUID())=>db.query(`select ${gid.startsWith('CHAR_')?'execute_character_gacha':'execute_asset_gacha'}($1,$2,$3,$4,$5) data`,[user,gid,count,currency,request]).then(r=>r.rows[0].data);
await assert.rejects(draw('SKILL_SPECIAL',1,'diamonds'),/closed/);
await db.exec("update feature_operating_states set state='OPEN';");
for(const ticket of ['CHARACTER','SKILL','EQUIPMENT']) await db.query('insert into user_items values($1,$2,100,now())',[user,`SPECIAL_TICKET_${ticket}`]);
let totalPoints=0;
for(const g of data.gachas) {
 for(const currency of ['diamonds','ticket']) for(const count of [1,10]) {
  const req=randomUUID(); const before=(await db.query('select cash,neon_diamonds from users where id=$1',[user])).rows[0];
  const ticket=domain.specialTicketId(g.id);
  const ticketBefore=Number((await db.query('select quantity from user_items where user_id=$1 and item_id=$2',[user,ticket])).rows[0].quantity);
  const first=await draw(g.id,count,currency,req); const retry=await draw(g.id,count,currency,req);
  assert.deepEqual(retry,first,'retry result'); assert.equal(first.results.length,count);
  const after=(await db.query('select cash,neon_diamonds from users where id=$1',[user])).rows[0];
  assert.equal(Number(before.cash),Number(after.cash));
  assert.equal(Number(before.neon_diamonds)-Number(after.neon_diamonds),currency==='diamonds'?g.cost_diamond*count:0);
  const ticketAfter=Number((await db.query('select quantity from user_items where user_id=$1 and item_id=$2',[user,ticket])).rows[0].quantity);
  assert.equal(ticketBefore-ticketAfter,currency==='ticket'?count:0);
  totalPoints+=count; assert.equal(first.pity_after,totalPoints);
 }
 for(const currency of ['cash','free',null]) await assert.rejects(draw(g.id,1,currency),/SPECIAL_REQUIRES/);
 await assert.rejects(draw(g.id,2,'diamonds'),/SPECIAL_INVALID_PULL_COUNT/);
}
for(const gid of ['CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL']) {
 const normal=await draw(gid,10,'free'); assert.equal(normal.results.length,10); assert.equal(normal.pity_after,totalPoints);
 const cash=await draw(gid,1,'cash'); assert.equal(cash.results.length,1); assert.equal(cash.pity_after,totalPoints);
}
await assert.rejects(draw('CHAR_SPECIAL',1,'diamonds'),/unsupported character/);
await db.query("update user_gacha_pity_points set current_points=250 where user_id=$1",[user]);
const exchange=(type,id,request)=>db.query('select exchange_special_gacha_reward($1,$2,$3) data',[type,id,request]).then(r=>r.rows[0].data);
const req=randomUUID(); const first=await exchange('SKILL','SKILL_051',req);
assert.equal(first.current_points,150); assert.deepEqual(await exchange('SKILL','SKILL_051',req),first);
await assert.rejects(exchange('SKILL','SKILL_052',req),/different exchange/);
await assert.rejects(exchange('SKILL','SKILL_061',randomUUID()),/invalid pity/);
assert.equal((await catalog()).pity_points,150);
await exchange('EQUIPMENT','WEAPON_047',randomUUID());
assert.equal((await catalog()).pity_points,50);
await assert.rejects(exchange('EQUIPMENT','WEAPON_048',randomUUID()),/insufficient pity/);
// Authenticated direct access to the old grant helper must be impossible.
assert.equal((await db.query("select has_function_privilege('authenticated','public._exchange_pity_reward_before_special_release(uuid,text,text)','execute') allowed")).rows[0].allowed,false);
console.log('PASS: local PostgreSQL migration, real RPC 16 paid draws/retries, currency/count guards, exact rates/alignments, dedicated pools, SSR-only 100Pt exchange/retries, Normal pool retained');
if (process.env.SPECIAL_GACHA_KEEP_DB !== '1') await db.close();
export { db, user, draw, catalog, exchange };
