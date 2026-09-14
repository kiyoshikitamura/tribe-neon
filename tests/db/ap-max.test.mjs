import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CANONICAL_ACTION_RESOURCES, recoverCanonicalResource, canUseEnergyDrink } from '../../src/domain/gameplay/canonical/action_resources.ts';
const runtime=process.env.PGLITE_RUNTIME_DIR;
const {PGlite}=runtime ? await import(pathToFileURL(`${runtime}/node_modules/@electric-sql/pglite/dist/index.js`).href) : await import('@electric-sql/pglite');
const db=new PGlite();
const read=name=>readFileSync(`supabase/migrations/${name}`,'utf8');
const user='00000000-0000-0000-0000-000000000001';
try {
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
create table users(id uuid primary key,vitality int default 100,pvp_points int default 5,raid_points int default 5,vitality_last_recovered_at timestamptz default now(),pvp_points_last_recovered_at timestamptz default now(),raid_points_last_recovered_at timestamptz default now(),cash int default 0,neon_diamonds int default 0,raid_free_entry_consumed boolean default false);
create table canonical_action_resource_master(version text,resource_type text,natural_max int,hard_cap int,recovery_amount int,recovery_interval_seconds int,entry_cost int,primary key(version,resource_type));
insert into canonical_action_resource_master values('2026-08-22','VITALITY',100,500,1,360,null);
create table user_characters(id uuid default gen_random_uuid(),user_id uuid,character_id text);
create table canonical_quest_master(version text,quest_id text,is_production_enabled boolean,vitality_cost int,duration_sec int);
create table user_patrols(id uuid default gen_random_uuid(),user_id uuid,course_id text,character_id text,started_at timestamptz,expires_at timestamptz,status text,has_battle_event boolean,battle_resolved boolean,hometown_bonus_snapshot jsonb default '{}');
create table user_items(user_id uuid,item_id text,quantity int);
create function canonical_quest_is_unlocked(uuid,text) returns boolean language sql as $$select true$$;
insert into users(id,vitality) values('${user}',97);
insert into user_characters(user_id,character_id) values('${user}','char_ageha_01');
insert into canonical_quest_master values('2026-08-30','easy',true,3,300),('2026-08-30','normal',true,10,300),('2026-08-30','hard',true,20,300);
`);
await db.exec(read('20260822000178_action_resource_recovery_projection.sql'));
let start=read('20260913032942_quest_hometown_reward_bonus.sql'); start=start.slice(start.indexOf('CREATE OR REPLACE FUNCTION public.start_patrol('));
await db.exec(start);
let drink=read('20260822000176_user_level_action_resource_foundation.sql'); drink=drink.slice(drink.indexOf('create or replace function public.use_energy_drink()'),drink.indexOf('create or replace function public.get_current_raid_attempt_state()'));
await db.exec(drink);
await db.exec(read('20260914074959_formal_open_ap_max_50.sql'));
assert.equal((await db.query('select vitality from users')).rows[0].vitality,97,'migration must preserve existing AP');
await db.exec("insert into users(id) values('00000000-0000-0000-0000-000000000002')");
assert.equal((await db.query('select vitality from users where id<>$1',[user])).rows[0].vitality,50,'new profile starts at MAX50');
for (const value of [51,97,120,500]) {
 await db.query("update users set vitality=$1,vitality_last_recovered_at=now()-interval '1 day' where id=$2",[value,user]);
 const {rows}=await db.query('select sync_and_recover_vitality_and_pvp_points($1) result',[user]);
 assert.equal(rows[0].result.out_vitality,value);assert.equal(rows[0].result.vitality_next_recovery_at,null);
}
await db.query("update users set vitality=49,vitality_last_recovered_at=now()-interval '1 hour' where id=$1",[user]);
assert.equal((await db.query('select sync_and_recover_vitality_and_pvp_points($1) r',[user])).rows[0].r.out_vitality,50);
for (const [quest,cost] of [['easy',3],['normal',10],['hard',20]]) {
 await db.exec('truncate user_patrols');
 await db.query("update users set vitality=52,vitality_last_recovered_at=now()-interval '1 day' where id=$1",[user]);
 const {rows}=await db.query("select start_patrol($1,'char_ageha_01') r",[quest]);assert.equal(rows[0].r.remaining_vitality,52-cost);
 const saved=(await db.query('select vitality,extract(epoch from (now()-vitality_last_recovered_at)) age from users where id=$1',[user])).rows[0];
 assert.ok(Number(saved.age)<5,'cross-cap spend must restart timer');
 assert.equal((await db.query('select sync_and_recover_vitality_and_pvp_points($1) r',[user])).rows[0].r.out_vitality,52-cost,'old capped time must not instantly refill');
}
await db.query("update users set vitality=60 where id=$1",[user]);
await db.query("insert into user_items values($1,'ENERGY_DRINK',2)",[user]);
assert.equal((await db.query('select use_energy_drink() r')).rows[0].r.vitality,110,'item recovery retains overflow');
await db.query('update users set vitality=480 where id=$1',[user]);
await assert.rejects(db.query('select use_energy_drink()'));
assert.equal((await db.query("select quantity from user_items where item_id='ENERGY_DRINK'")).rows[0].quantity,1);
assert.equal(CANONICAL_ACTION_RESOURCES.resources.VITALITY.naturalMax,50);
assert.deepEqual(CANONICAL_ACTION_RESOURCES.questCosts,{EASY:3,NORMAL:10,HARD:20});
assert.equal(recoverCanonicalResource(49,0,360000,'VITALITY').value,50);
assert.equal(recoverCanonicalResource(97,0,3600000,'VITALITY').value,97);
assert.equal(canUseEnergyDrink(450),true);assert.equal(canUseEnergyDrink(451),false);
console.log('PASS: AP50 migration preserves overflow; recovery ceiling/timer; all Quest costs; new profile; drink overflow/atomic rejection; canonical runtime');
} finally {await db.close();}
