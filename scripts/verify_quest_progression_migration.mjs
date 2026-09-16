// ローカルPostgres互換エンジンのみ。外部DBには接続しない。
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.QUEST_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table users(id uuid primary key,cash bigint default 0,xp integer default 0,level integer default 1,vitality integer default 50);
create table user_quest_first_clears(user_id uuid,quest_id text,cleared_at timestamptz default now(),primary key(user_id,quest_id));
create table user_patrols(id uuid primary key,user_id uuid references users(id),course_id text,quest_id text,character_id text,status text,has_battle_event boolean,battle_resolved boolean,battle_result text,rewards_accrued jsonb,started_at timestamptz,expires_at timestamptz,encounter_snapshot jsonb,encounter_party_signature text,hometown_bonus_snapshot jsonb,base_cash_snapshot bigint);
create table canonical_quest_master(version text,quest_id text,user_exp integer,reward_pool_id text);
create table canonical_quest_reward_pool_items(version text,reward_pool_id text,roll_index integer,item_id text,quantity integer,probability_bp integer);
create table presents(id uuid primary key default gen_random_uuid(),user_id uuid,item_id text,quantity integer,message text,status text default 'UNCLAIMED',expire_at timestamptz,claimed_at timestamptz,source_kind text,source_key text,source_metadata jsonb);
create unique index presents_source on presents(user_id,source_kind,source_key) where source_kind is not null and source_key is not null;
create table user_items(user_id uuid,item_id text,quantity integer,primary key(user_id,item_id));
create table user_missions(user_id uuid,mission_id text,status text);
create table quest_raid_encounters(patrol_id uuid references user_patrols(id),room_id uuid);
create function resolve_canonical_reward_item(text) returns text language sql as $$select $1$$;
create function apply_user_xp(uuid,integer) returns void language sql as $$update public.users set xp=xp+$2 where id=$1$$;
create function grant_present_payload(uuid,text,integer) returns void language plpgsql as $$begin if $2='CASH' then update public.users set cash=cash+$3 where id=$1;else insert into public.user_items values($1,$2,$3) on conflict(user_id,item_id) do update set quantity=user_items.quantity+$3;end if;end$$;
insert into canonical_quest_master values('2026-08-30','q_test',50,'pool');
insert into canonical_quest_reward_pool_items values('2026-08-30','pool',1,'CHAR_EXP_S',2,10000);
`);
await db.exec(await readFile(new URL('../supabase/migrations/20260916145956_quest_progression_activation_and_migration.sql',import.meta.url),'utf8'));
const user='00000000-0000-0000-0000-000000000001';
const second='00000000-0000-0000-0000-000000000002';
const third='00000000-0000-0000-0000-000000000003';
const cutoff='2026-09-16T12:00:00Z';
await db.exec(`insert into users(id,cash,xp) values('${user}',1000,10),('${second}',1000,10),('${third}',1000,10);
insert into user_quest_first_clears values('${user}','q_test',now());
insert into user_missions values('${user}','old_mission','CLAIMED');
insert into user_patrols(id,user_id,course_id,status,has_battle_event,battle_resolved,battle_result,started_at,expires_at,base_cash_snapshot,hometown_bonus_snapshot) values
('10000000-0000-0000-0000-000000000001','${user}','q_test','CLAIMABLE',true,true,'VICTORY','2026-09-16 09:00Z','2026-09-16 10:00Z',100,'{"cash":20,"drop_bonus_bp":0}'),
('10000000-0000-0000-0000-000000000002','${user}','q_test','ONGOING',true,false,null,'2026-09-16 09:00Z','2026-09-17 10:00Z',100,'{"cash":20,"drop_bonus_bp":0}'),
('10000000-0000-0000-0000-000000000003','${user}','q_test','CLAIMABLE',true,true,'DEFEAT','2026-09-16 09:00Z','2026-09-16 10:00Z',100,'{"cash":20,"drop_bonus_bp":0}'),
('10000000-0000-0000-0000-000000000004','${user}','q_test','COMPLETED',true,true,'VICTORY','2026-09-16 09:00Z','2026-09-16 10:00Z',100,'{"cash":20,"drop_bonus_bp":0}');
insert into quest_raid_encounters values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');`);
const migrate = (ids=[user],comp=[{item_id:'ENERGY_DRINK',quantity:2}],scope='ACTIVE_PATROLS') => db.query('select migrate_quest_progression_v1($1::uuid[],$2,$3::timestamptz,$4::jsonb,$5) result',[ids,'qa-quest-v1',cutoff,JSON.stringify(comp),scope]);
let result=(await migrate()).rows[0].result.results[0];
assert.deepEqual(result,{replayed:false,retired_patrols:3,presents_created:4,preserved_entitlements:1});
assert.equal((await db.query('select count(*)::int n from user_quest_first_clears')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from quest_raid_encounters')).rows[0].n,1);
assert.equal((await db.query("select status from user_missions")).rows[0].status,'CLAIMED');
assert.deepEqual((await db.query('select cash::int,xp from users where id=$1',[user])).rows[0],{cash:1000,xp:10});
result=(await migrate()).rows[0].result.results[0];assert.equal(result.replayed,true);
assert.equal((await db.query('select count(*)::int n from presents')).rows[0].n,4);
await assert.rejects(migrate([user],[], 'ALL_TARGETS'),/inputs differ/);
await db.query("select set_config('test.uid',$1,false)",[user]);
assert.equal((await db.query('select claim_all_presents() result')).rows[0].result.claimed_count,4);
assert.deepEqual((await db.query('select cash::int,xp from users where id=$1',[user])).rows[0],{cash:1120,xp:60});
assert.equal((await db.query("select count(*)::int n from user_items where item_id='PLAYER_XP'")).rows[0].n,0);
assert.equal((await db.query('select claim_all_presents() result')).rows[0].result.claimed_count,0);
await assert.rejects(db.query('select migrate_quest_progression_v1($1::uuid[],$2,$3::timestamptz,null,$4)',[[second],'missing',cutoff,'ALL_TARGETS']),/compensation/);
await assert.rejects(migrate([second,'00000000-0000-0000-0000-000000000099']),/target missing/);
assert.equal((await db.query('select count(*)::int n from quest_progression_user_versions where user_id=$1',[second])).rows[0].n,0);
await migrate([third],[],'ALL_TARGETS');
assert.equal((await db.query('select count(*)::int n from presents where user_id=$1',[third])).rows[0].n,0);
assert.equal((await db.query("select has_function_privilege('authenticated','public.migrate_quest_progression_v1(uuid[],text,timestamptz,jsonb,text)','EXECUTE') allowed")).rows[0].allowed,false);
assert.equal((await db.query("select has_function_privilege('service_role','public.migrate_quest_progression_v1(uuid[],text,timestamptz,jsonb,text)','EXECUTE') allowed")).rows[0].allowed,true);
await db.close();
console.log('PASS: entitlement preservation, reset, asset/raid/mission retention, replay, XP inbox claims, atomic rollback, explicit inputs and RPC permissions');
