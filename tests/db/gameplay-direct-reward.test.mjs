process.on('uncaughtException',e=>{console.error(e.message, e.code || '', e.where || '');process.exit(1);});
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const runtime=process.env.PGLITE_RUNTIME;
if(!runtime)throw new Error('Set PGLITE_RUNTIME to the isolated @electric-sql/pglite dist/index.js');
const {PGlite}=await import(pathToFileURL(runtime));
const db=new PGlite();
// Contract fixture: existing Raid registration/power/daily services are explicit doubles.
// This tests new SQL execution and idempotency, not live Raid authority integration.
await db.exec(`
create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table users(id uuid primary key,level int,power bigint);
create table tutorial_progress(user_id uuid,step_id text);
create table user_patrols(id uuid primary key,user_id uuid,status text,battle_result text,battle_resolved boolean,has_battle_event boolean,course_id text,quest_id text);
create table canonical_quest_master(version text,quest_id text,town_id text,is_production_enabled boolean);
create table canonical_raid_variants(raid_variant_id text primary key,area_id text,raid_name text,max_hp bigint,member_character_ids jsonb,is_production_enabled boolean);
create table raid_room_creation_settings(singleton boolean,enabled boolean);
create table raid_room_lifecycle_rules(difficulty text,max_active_rooms int,duration_hours int);
create table raid_bosses(id uuid primary key,boss_id text,boss_master_id text,current_hp bigint,max_hp bigint,base_id text,status text,spawned_at timestamptz,expires_at timestamptz,cycle_id uuid,rotation_date date,raid_variant_id text,raid_day_key text,outcome_finalized_at timestamptz);
create table raid_rooms(id uuid primary key,raid_boss_instance_id uuid,owner_user_id uuid,difficulty_id text);
create table raid_room_clear_rewards(room_id uuid,user_id uuid);
create table raid_room_rescue_rewards(room_id uuid,user_id uuid);
create table presents(user_id uuid,item_id text,quantity int,message text,status text,created_at timestamptz,expire_at timestamptz,source_kind text,source_key text,source_metadata jsonb);
create function quest_town_key(v text) returns text language sql immutable as $$select lower(v)$$;
create function calculate_user_total_power(u uuid) returns bigint language sql stable as $$select power from public.users where id=u$$;
create function _raid_room_power_gate_v1(d text,p bigint) returns jsonb language sql stable as $$select jsonb_build_object('status',case when d='beginner' or p>=200000 then 'passed' else 'failed' end)$$;
create function private.raid_daily_targets_v1() returns jsonb language sql stable as $$select '{"targets":[{"variantId":"SHIBUYA"}]}'::jsonb$$;
create function _raid_room_register_v1(i uuid,u uuid,d text) returns jsonb language plpgsql as $$declare r uuid:=gen_random_uuid();begin insert into public.raid_rooms values(r,i,u,d);return jsonb_build_object('roomId',r);end$$;
insert into users values('00000000-0000-0000-0000-000000000001',5,300000),('00000000-0000-0000-0000-000000000002',5,300000);
insert into tutorial_progress select id,'COMPLETE' from users;
insert into canonical_quest_master values('2026-08-30','Q_EASY','shibuya',true);
insert into canonical_raid_variants values('SHIBUYA','SHIBUYA','強敵',1000,'["char_ageha_01"]',true);
insert into raid_room_creation_settings values(true,true);
insert into raid_room_lifecycle_rules values('beginner',10,24),('intermediate',10,24),('advanced',10,24);
select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
`);
await db.exec(fs.readFileSync('supabase/migrations/20260913105642_quest_raid_encounter.sql','utf8'));
const scalar=async sql=>(await db.query(sql)).rows[0].v;
async function quest(n,user=1,result='VICTORY'){
 const id=`00000000-0000-0000-0001-${String(n).padStart(12,'0')}`;
 await db.query(`insert into user_patrols values($1,$2,'CLAIMABLE',$3,true,true,'Q_EASY',null)`,[id,`00000000-0000-0000-0000-${String(user).padStart(12,'0')}`,result]);
 await db.query(`update user_patrols set status='COMPLETED' where id=$1`,[id]);return id;
}
const resolve=async id=>(await db.query('select resolve_quest_raid_encounter_v1($1) v',[id])).rows[0].v;
await db.exec(`
alter table raid_bosses add column outcome text;
alter table presents add column id uuid default gen_random_uuid() unique;
create table raid_room_members(room_id uuid,user_id uuid);
create table raid_room_rescue_members(room_id uuid,user_id uuid);
create table raid_room_difficulty_rules(difficulty text);
create table raid_room_clear_reward_rules(difficulty text,enabled boolean,minimum_contribution_damage bigint,rule_version bigint);
create table raid_room_rescue_reward_rules(difficulty text,enabled boolean,rule_version bigint,reward_version bigint);
create table raid_room_clear_reward_items(difficulty text,item_id text,quantity int);
create table raid_room_rescue_reward_items(difficulty text,item_id text,quantity int);
alter table raid_room_clear_rewards add column rule_version bigint,add column finalized_battles bigint,add column contribution_damage bigint,add column clear_gate jsonb,add column issued_at timestamptz,add column expires_at timestamptz,add unique(room_id,user_id);
alter table raid_room_rescue_rewards add column rule_version bigint,add column reward_version bigint,add column finalized_battles bigint,add column contribution_damage bigint,add column rescue_gate jsonb,add column issued_at timestamptz,add column expires_at timestamptz,add unique(room_id,user_id);
create table raid_room_clear_reward_grants(room_id uuid,user_id uuid,item_id text,quantity int,present_id uuid,primary key(room_id,user_id,item_id));
create table raid_room_rescue_reward_grants(like raid_room_clear_reward_grants including all);
create function _raid_room_clear_reward_progress_v1(r uuid,u uuid) returns jsonb language sql as $$select '{"finalizedBattles":1,"contributionDamage":100,"clearGate":{"status":"succeeded","ruleVersion":1}}'::jsonb$$;
create function _raid_room_rescue_reward_progress_v1(r uuid,u uuid) returns jsonb language sql as $$select '{"finalizedBattles":1,"contributionDamage":100,"rescueGate":{"status":"succeeded","ruleVersion":1}}'::jsonb$$;
insert into raid_room_clear_reward_rules values('advanced',true,1,1);
insert into raid_room_rescue_reward_rules values('advanced',true,1,1);
insert into raid_room_clear_reward_items values('advanced','CASH',300),('advanced','CHAR_EXP_L',2);
insert into raid_room_rescue_reward_items values('advanced','CASH',100),('advanced','EQUIP_EXP_L',3);
`);
await db.exec(fs.readFileSync('supabase/migrations/20260913120930_quest_raid_approved_occurrence_and_double_rewards.sql','utf8'));

// The reused Encounter fixture doubles eligibility only; actual issuers and migration execute below.
await db.exec(`
alter table users add column cash bigint not null default 0, add column neon_diamonds bigint not null default 0;
create table equipment_battle_master(equipment_id text primary key);
create table user_equipments(id uuid default gen_random_uuid(),user_id uuid,equipment_id text,equipment_master_id text,level int,plus_val int);
create table user_items(user_id uuid,item_id text,quantity int,primary key(user_id,item_id));
create function resolve_canonical_reward_item(text) returns text language sql immutable as $$ select $1 $$;
create table login_bonus_master(day_number int primary key,item_id text,quantity int,item_name text,is_featured boolean);
create table user_login_bonuses(user_id uuid primary key,current_day int,total_logins int,last_claimed_at timestamptz);
insert into login_bonus_master values(1,'CASH',25,'Cash',false);
alter table presents add column claimed_at timestamptz;
`);
const functionSql=(filename,name)=>{
 const source=fs.readFileSync('supabase/migrations/'+filename,'utf8');
 const start=source.search(new RegExp('create (?:or replace )?function public\\.'+name+'\\(','i'));
 assert.ok(start>=0,name);
 const rest=source.slice(start), dollar=rest.match(/AS (\$[a-z_]*\$)/i)[1];
 return rest.slice(0,rest.indexOf(dollar,rest.indexOf(dollar)+dollar.length)+dollar.length)+';';
};
for(const name of ['grant_present_payload'])await db.exec(functionSql('20260812000135_provisional_open_beta_missions.sql',name));
await db.exec(functionSql('20260812000132_secure_login_bonus_cycle.sql','process_login_bonus'));
await db.exec(functionSql('20260913032942_quest_hometown_reward_bonus.sql','claim_patrol_rewards'));
await db.exec(functionSql('20260908000261_raid_ranking_retirement.sql','grant_canonical_ranking_season_reward'));
for(const kind of ['clear','rescue'])await db.exec(functionSql(kind==='clear'?'20260908000262_raid_room_clear_rewards.sql':'20260908000260_raid_room_rescue_rewards.sql',`get_raid_room_${kind}_reward_v1`));
await db.exec(fs.readFileSync('supabase/migrations/20260914110219_gameplay_direct_reward_delivery.sql','utf8'));
await db.exec("update quest_raid_encounter_settings set enabled=true,probability_bp=10000,beginner_weight=0,intermediate_weight=0,advanced_weight=1");
const first=await resolve(await quest(11));assert.equal(first.status,'CREATED');
await db.query("update raid_bosses set outcome='DEFEAT_SUCCESS',status='DEFEATED' where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[first.roomId]);
await db.query('insert into raid_room_members select $1,id from users',[first.roomId]);
await db.exec('insert into raid_room_rescue_members select * from raid_room_members');
// Existing billing/compensation Present must remain untouched.
await db.exec("insert into presents(user_id,item_id,quantity,message,status,expire_at) values('00000000-0000-0000-0000-000000000001','CASH',9,'課金旧Present','UNCLAIMED',now()+interval '30 days')");
await db.exec(`create function fail_delivery() returns trigger language plpgsql as $$begin raise exception 'test delivery failure';end$$;create trigger fail_delivery before insert on user_items for each row execute function fail_delivery();`);
await assert.rejects(db.query('select _issue_raid_room_clear_rewards_v1($1)',[first.roomId]),/test delivery failure/);
assert.equal(await scalar('select count(*)::int v from gameplay_reward_delivery_ledger'),0);
assert.equal(await scalar('select count(*)::int v from raid_room_clear_rewards'),0);
assert.equal(await scalar('select sum(cash)::int v from users'),0);
await db.exec('drop trigger fail_delivery on user_items');
for(const kind of ['clear','rescue']) {
 assert.equal((await db.query(`select _issue_raid_room_${kind}_rewards_v1($1) v`,[first.roomId])).rows[0].v,2);
 assert.equal((await db.query(`select _issue_raid_room_${kind}_rewards_v1($1) v`,[first.roomId])).rows[0].v,0);
 const receipt=(await db.query(`select get_raid_room_${kind}_reward_v1($1) v`,[first.roomId])).rows[0].v;
 assert.equal(receipt.expiresAt,null);
 assert.equal(receipt.items.length,2);
 assert.ok(receipt.items.every(i=>i.delivery==='DIRECT'&&i.presentId===null&&i.claimedAt&&i.expiresAt===null));
}
assert.equal(await scalar('select sum(cash)::int v from users'),1600);
assert.equal(await scalar("select sum(quantity)::int v from user_items where item_id='CHAR_EXP_L'"),8);
assert.equal(await scalar("select sum(quantity)::int v from user_items where item_id='EQUIP_EXP_L'"),12);
assert.equal(await scalar('select count(*)::int v from presents'),1);
assert.equal(await scalar('select count(*)::int v from gameplay_reward_delivery_ledger'),8);
const login=await scalar('select process_login_bonus() v');assert.equal(login.delivery,'DIRECT');assert.equal(login.claimed,true);
const again=await scalar('select process_login_bonus() v');assert.equal(again.delivery,'DIRECT');assert.equal(again.already_claimed,true);
assert.equal(await scalar('select sum(cash)::int v from users'),1625);
assert.equal(await scalar('select count(*)::int v from presents'),1);
await assert.rejects(db.exec("set role authenticated; select public._grant_gameplay_reward_v1('00000000-0000-0000-0000-000000000001','LOGIN_BONUS','hack','CASH',100000)"),/permission denied/);await db.exec('reset role');
await assert.rejects(db.query("select _grant_gameplay_reward_v1($1,'RAID_ROOM_CLEAR',$2,'CASH',1)",['00000000-0000-0000-0000-000000000001',first.roomId]),/replay mismatch/);

// Actual Quest claim function: deterministic probability-100% drops, including equipment instances.
await db.exec(`
alter table canonical_quest_master add column display_name text default 'Quest',add column user_exp int default 5,add column reward_pool_id text default 'fixture',add column cash_reward int default 100;
alter table user_patrols add column expires_at timestamptz default now(),add column hometown_bonus_snapshot jsonb default '{"cash":10,"drop_bonus_bp":0,"matched":true}',add column rewards_accrued jsonb;
create table user_quest_first_clears(user_id uuid,quest_id text,primary key(user_id,quest_id));
create table canonical_quest_reward_pool_items(version text,reward_pool_id text,roll_index int,item_id text,quantity int,probability_bp int);
insert into equipment_battle_master values('TEST_GEAR');
insert into canonical_quest_reward_pool_items values('2026-08-30','fixture',1,'TEST_GEAR',2,10000),('2026-08-30','fixture',2,'CHAR_EXP_S',3,10000);
create function apply_user_xp(uuid,integer) returns jsonb language sql as $$select '{"level":5,"xp":5,"leveled_up":false}'::jsonb$$;
create function evaluate_mission_progress(uuid,text,integer) returns void language sql as $$select$$;
insert into user_patrols(id,user_id,status,battle_result,battle_resolved,has_battle_event,course_id) values('00000000-0000-0000-0001-000000000099','00000000-0000-0000-0000-000000000001','CLAIMABLE','VICTORY',true,true,'Q_EASY');
`);
const patrolId='00000000-0000-0000-0001-000000000099';
const claimed=(await db.query('select claim_patrol_rewards($1) v',[patrolId])).rows[0].v;
assert.equal(claimed.items.length,2);assert.equal(claimed.cash,110);
assert.equal(await scalar('select count(*)::int v from user_equipments'),2);
assert.equal(await scalar("select quantity v from user_items where item_id='CHAR_EXP_S'"),3);
await assert.rejects(db.query('select claim_patrol_rewards($1)',[patrolId]),/already claimed/);
assert.equal(await scalar('select count(*)::int v from user_equipments'),2);
assert.equal(await scalar('select count(*)::int v from presents'),1);
// Previous deliveries retain Present ownership and expiry projection.
const legacyRoom='00000000-0000-0000-0002-000000000001';
await db.query("insert into raid_rooms values($1,(select id from raid_bosses limit 1),'00000000-0000-0000-0000-000000000001','advanced')",[legacyRoom]);
await db.query("insert into raid_room_clear_rewards(room_id,user_id,issued_at,expires_at,clear_gate) values($1,auth.uid(),now(),now()+interval '30 days','{}')",[legacyRoom]);
await db.query("insert into raid_room_clear_reward_grants(room_id,user_id,item_id,quantity,present_id) select $1,user_id,item_id,quantity,id from presents",[legacyRoom]);
const legacy=(await db.query('select get_raid_room_clear_reward_v1($1) v',[legacyRoom])).rows[0].v;
assert.equal(legacy.items[0].delivery,'PRESENT');assert.ok(legacy.items[0].presentId);assert.ok(legacy.expiresAt);
await db.close();console.log('PASS: Quest equipment/item direct grants, legacy receipts, Direct x2 Clear+Rescue, retry, asset and ledger rollback, unchanged old Present, expiry-free receipts, login exact-once, private helper denied, replay mismatch. Eligibility is a fixture; live acceptance remains required.');
