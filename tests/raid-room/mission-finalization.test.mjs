import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const runtime = process.env.PGLITE_RUNTIME_DIR;
const { PGlite } = runtime
  ? await import(pathToFileURL(`${runtime}/node_modules/@electric-sql/pglite/dist/index.js`).href)
  : await import('@electric-sql/pglite');
const db = new PGlite();
const read = name => readFileSync(`supabase/migrations/${name}`, 'utf8');
const functionBody = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
try {
await db.exec(`
create table battle_replay_sessions(id uuid primary key,battle_mode text,resolution_authority text,finalization_status text,status text,finalization_result jsonb,source_reference_id uuid,official_context jsonb,requester_user_id uuid,result jsonb,resolved_at timestamptz,finalized_at timestamptz);
create table raid_bosses(id uuid primary key,boss_id text,raid_day_key date,raid_variant_id text,expires_at timestamptz,status text,outcome_finalized_at timestamptz,current_hp bigint,outcome text,cleared_at timestamptz,base_id text);
create table raid_rooms(id uuid primary key,raid_boss_instance_id uuid,difficulty_id text);
create table raid_damage_logs(boss_id text,raid_boss_id text,user_id uuid,damage bigint,damage_dealt bigint,raid_boss_instance_id uuid,battle_replay_session_id uuid,guild_id uuid,raw_damage bigint,applied_damage bigint);
create table raid_instance_user_progress(raid_boss_instance_id uuid,user_id uuid,finalized_battles bigint,raid_points_consumed bigint,last_guild_id uuid,updated_at timestamptz,primary key(raid_boss_instance_id,user_id));
create table battle_replay_events(battle_replay_session_id uuid,event_index int,round_number int,event_type text,payload jsonb,primary key(battle_replay_session_id,event_index));
create table mission_calls(user_id uuid,event text,amount int);
create function evaluate_mission_progress(uuid,text,int) returns void language plpgsql as $$ begin insert into public.mission_calls values($1,$2,$3); end $$;
create function get_raid_battle_route_v1(uuid) returns text language sql as $$ select case when official_context->>'raidRoute'='ROOM' then 'ROOM' else 'LEGACY' end from public.battle_replay_sessions where id=$1 $$;
create function validate_official_battle_result(jsonb) returns void language plpgsql as $$ begin if $1->'events' is null then raise exception 'invalid battle'; end if; end $$;
create table raid_room_clear_reward_rules(difficulty text,enabled boolean,minimum_contribution_damage bigint,rule_version bigint);
create table raid_room_clear_reward_items(difficulty text,item_id text,quantity int);
create table quest_raid_encounters(room_id uuid,status text,reward_multiplier int);
create table raid_room_members(room_id uuid,user_id uuid);
create table raid_room_clear_rewards(room_id uuid,user_id uuid,rule_version bigint,finalized_battles bigint,contribution_damage bigint,clear_gate jsonb,issued_at timestamptz,expires_at timestamptz,primary key(room_id,user_id));
create table presents(id uuid default gen_random_uuid(),user_id uuid,item_id text,quantity int,message text,status text,created_at timestamptz,expire_at timestamptz,source_kind text,source_key text,source_metadata jsonb);
create table raid_room_clear_reward_grants(room_id uuid,user_id uuid,item_id text,quantity int,present_id uuid);
create table test_clear_gate(user_id uuid,succeeded boolean);
create function _raid_room_clear_reward_progress_v1(uuid,uuid) returns jsonb language sql as $$ select jsonb_build_object('clearGate',jsonb_build_object('status',case when succeeded then 'succeeded' else 'pending' end,'ruleVersion',1),'finalizedBattles',2,'contributionDamage',5000) from public.test_clear_gate where user_id=$2 $$;
`);
await db.exec(functionBody(read('20260908000256_raid_room_finalization.sql'), 'create function public.finalize_raid_room_battle_v1(', 'create function public.get_raid_room_battle_result_v1'));
await db.exec(functionBody(read('20260913120930_quest_raid_approved_occurrence_and_double_rewards.sql'), 'create or replace function public._issue_raid_room_clear_rewards_v1(', '-- Existing receipt/grant keys retain exactly-once authority; base quantity and added quantity are issued atomically.\ncreate or replace function public._issue_raid_room_rescue_rewards_v1'));
await db.exec(read('20260914072512_raid_room_mission_finalization_hooks.sql'));
const ids = Array.from({length:7}, (_,i) => `00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
const [boss,room,user,replay,failed,legacy,other] = ids;
await db.exec(`insert into raid_bosses values('${boss}','BOSS','2026-09-14','v',now()+interval '1 day','ACTIVE',null,10000,null,null,'shinjuku');
insert into raid_rooms values('${room}','${boss}','EASY');
insert into battle_replay_sessions(id,battle_mode,resolution_authority,finalization_status,status,source_reference_id,official_context,requester_user_id)
select id::uuid,'RAID','RAID_SERVER','PENDING',case when id='${failed}' then 'FAILED' else 'PENDING' end,'${boss}',jsonb_build_object('startedAt',now(),'raidRoute',case when id='${legacy}' then 'LEGACY' else 'ROOM' end,'costType','RAID_POINT'),'${user}' from unnest(array['${replay}','${failed}','${legacy}']) id;`);
const result = JSON.stringify({playerRawDamage:100,events:[]});
await db.query('select finalize_raid_room_battle_v1($1,$2::jsonb)',[replay,result]);
await db.query('select finalize_raid_room_battle_v1($1,$2::jsonb)',[replay,result]);
assert.equal((await db.query("select count(*)::int n from mission_calls where event='RAID_FINALIZED'")).rows[0].n,1);
assert.equal((await db.query('select finalized_battles::int n from raid_instance_user_progress')).rows[0].n,1);
for (const id of [failed,legacy]) await assert.rejects(db.query('select finalize_raid_room_battle_v1($1,$2::jsonb)',[id,result]));
assert.equal((await db.query('select count(*)::int n from mission_calls')).rows[0].n,1);
// Invalid result and Tutorial route cannot create Mission progress.
await db.exec(`update battle_replay_sessions set status='PENDING' where id='${failed}'`);
await assert.rejects(db.query('select finalize_raid_room_battle_v1($1,$2::jsonb)',[failed,'{}']));
await db.exec(`update battle_replay_sessions set battle_mode='TUTORIAL' where id='${failed}'`);
await assert.rejects(db.query('select finalize_raid_room_battle_v1($1,$2::jsonb)',[failed,result]));
assert.equal((await db.query('select count(*)::int n from mission_calls')).rows[0].n,1);

await db.exec(`insert into raid_room_clear_reward_rules values('EASY',true,1,1); insert into raid_room_clear_reward_items values('EASY','ITEM_A',1),('EASY','ITEM_B',2);
insert into quest_raid_encounters values('${room}','CREATED',2);
insert into raid_room_members values('${room}','${user}'),('${room}','${other}');
insert into test_clear_gate values('${user}',true),('${other}',false);`);
await db.query('select _issue_raid_room_clear_rewards_v1($1)',[room]);
assert.equal((await db.query("select count(*)::int n from mission_calls where event='RAID_CLEAR_ELIGIBLE'")).rows[0].n,0);
await db.exec(`update raid_bosses set outcome='DEFEAT_SUCCESS' where id='${boss}'`);
await db.query('select _issue_raid_room_clear_rewards_v1($1)',[room]);
await db.query('select _issue_raid_room_clear_rewards_v1($1)',[room]);
assert.deepEqual((await db.query("select user_id,amount from mission_calls where event='RAID_CLEAR_ELIGIBLE'")).rows,[{user_id:user,amount:1}]);
assert.deepEqual((await db.query('select item_id,quantity from presents order by item_id')).rows,[{item_id:'ITEM_A',quantity:2},{item_id:'ITEM_B',quantity:4}]);
// Failure after the event rolls back BOTH qualification and Mission mutation.
await db.exec(`update test_clear_gate set succeeded=true where user_id='${other}'; create function reject_test_present() returns trigger language plpgsql as $$ begin if new.user_id='${other}' then raise exception 'delivery failed'; end if; return new; end $$; create trigger reject_test_present before insert on presents for each row execute function reject_test_present();`);
await assert.rejects(db.query('select _issue_raid_room_clear_rewards_v1($1)',[room]));
assert.equal((await db.query('select count(*)::int n from mission_calls where user_id=$1',[other])).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from raid_room_clear_rewards where user_id=$1',[other])).rows[0].n,0);
console.log('PASS: real Room finalize/clear functions; retry, failed/legacy rejection, clear eligibility, double reward and atomic rollback');
} finally { await db.close(); }
