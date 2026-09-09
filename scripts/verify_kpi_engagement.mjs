import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const read = p => readFileSync(new URL('../'+p, import.meta.url),'utf8');
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table kpi_subjects(subject_id uuid primary key,source_user_id uuid unique,registered_at timestamptz);
create table kpi_account_classification_periods(subject_id uuid,classification text,valid_from timestamptz,valid_to timestamptz);
create function kpi_jst_day_start(d date) returns timestamptz language sql as $$select d::timestamp at time zone 'Asia/Tokyo'$$;
create table kpi_daily_user_activity(subject_id uuid,activity_date date,first_active_at timestamptz,last_active_at timestamptz,primary key(subject_id,activity_date));
create table kpi_guild_membership_periods(id bigint generated always as identity,subject_id uuid,guild_id uuid,joined_at timestamptz,left_at timestamptz);
create table board_posts(id uuid default gen_random_uuid(),user_id uuid,target_type text,target_id uuid,is_system boolean default false,content text default 'hello',created_at timestamptz);
create table direct_messages(sender_id uuid,recipient_id uuid,message text default 'hello',created_at timestamptz);
create table bbs_threads(id uuid primary key default gen_random_uuid(),user_id uuid,category text default 'STRATEGY_CHAT',title text default 'topic',content text default 'hello',created_at timestamptz);
create table bbs_posts(id uuid default gen_random_uuid(),thread_id uuid,user_id uuid,content text default 'hello',created_at timestamptz);
create table battle_replay_sessions(id uuid default gen_random_uuid(),requester_user_id uuid,battle_mode text default 'RAID',resolution_authority text default 'RAID_SERVER',official_context jsonb,created_at timestamptz);
create table kpi_tutorial_completion_facts(subject_id uuid,completed_at timestamptz);
create table kpi_canonical_tutorial_completions_v1(subject_id uuid,completed_at timestamptz);
create table user_funnel_milestones(user_id uuid,milestone text,first_occurred_at timestamptz);
create table kpi_guild_conversion_facts(subject_id uuid,membership_period_id bigint,conversion_type text,occurred_at timestamptz);
create table kpi_guild_chat_activation_facts(subject_id uuid,membership_period_id bigint,occurred_at timestamptz);
create table kpi_effective_active_guild_daily_v1(guild_id uuid,activity_date date,is_active_guild boolean,is_effective_active_guild boolean);
create table feature_operating_states(feature_key text,state text,visibility boolean,mutation_allowed boolean);
insert into feature_operating_states values('PAYMENT','CLOSED',false,false);
create table kpi_subject_first_touch_v1(subject_id uuid,first_source text,journey_id uuid,first_touch_rule_version text,first_arrived_at timestamptz);
create table kpi_acquisition_valid_journeys_v1(journey_id uuid,metadata jsonb,first_arrived_at timestamptz);
create table kpi_acquisition_subject_bindings(journey_id uuid,subject_id uuid,first_touch_source text,source text);
create function kpi_source_rate_v1(n bigint,d bigint,r text default null) returns jsonb language sql as $$select jsonb_build_object('numerator',n,'denominator',d,'value',n::numeric/nullif(d,0),'status',case when n is null or d is null or d=0 then 'NOT_READY' else 'AVAILABLE' end,'reason',case when d=0 then 'zero_denominator' else r end)$$;
create table kpi_overview_saved_results(period_type text,period_start date,period_end date,generated_at timestamptz,generation_id uuid,definition_version text,payload jsonb,primary key(period_type,period_start));
`);
await db.exec(read('scripts/fixtures/kpi-engagement-baseline.sql'));
const migration=read('supabase/migrations/20260909150352_kpi_social_active_raid_point_daily.sql');
await db.exec(migration);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const day='2026-09-08',at='2026-09-08T03:00:00Z',guild=id(500);
async function reset(n=10) {
  await db.exec('truncate kpi_subjects,kpi_daily_user_activity,kpi_guild_membership_periods,board_posts,direct_messages,bbs_threads,bbs_posts,battle_replay_sessions,kpi_account_classification_periods');
  for(let i=1;i<=12;i++) {
    await db.query('insert into kpi_subjects values($1,$2,$3)',[id(i),id(100+i),'2026-09-08T00:00:00Z']);
    if(i<=n) await db.query('insert into kpi_daily_user_activity values($1,$2,$3,$3)',[id(i),day,at]);
    await db.query('insert into kpi_guild_membership_periods(subject_id,guild_id,joined_at) values($1,$2,$3)',[id(i),guild,'2026-09-07T15:00:00Z']);
  }
}
async function chat(i,type='GUILD',system=false,time=at) { await db.query('insert into board_posts(user_id,target_type,target_id,is_system,created_at) values($1,$2,$3,$4,$5)',[id(100+i),type,guild,system,time]); }
async function raid(i,cost=1,time=at,type='RAID_POINT') { await db.query('insert into battle_replay_sessions(requester_user_id,official_context,created_at) values($1,$2,$3)',[id(100+i),{costType:type,cost},time]); }
async function counts() { return (await db.query('select * from kpi_daily_engagement_v1($1,$1)',[day])).rows[0]; }
let cases=0;
async function check(name,fn) {await reset();await fn();cases++;console.log('PASS '+name);}
await check('Social 1: Guild 2 + Global 1 = 3/10',async()=>{await chat(1);await chat(2);await chat(3,'GLOBAL');assert.equal((await counts()).social_active_uu,3);assert.equal((await counts()).guild_dau,10);});
await check('Social 2: cross-channel and repeated messages = 1UU',async()=>{await chat(1);await chat(1);await db.query('insert into direct_messages(sender_id,recipient_id,created_at) values($1,$2,$3)',[id(101),id(102),at]);const t=(await db.query('insert into bbs_threads(user_id,created_at) values($1,$2) returning id',[id(101),at])).rows[0].id;await db.query('insert into bbs_posts(thread_id,user_id,created_at) values($1,$2,$3)',[t,id(101),at]);assert.equal((await counts()).social_active_uu,1);});
await check('Social 3: non-member excluded from both counts',async()=>{await db.query('delete from kpi_guild_membership_periods where subject_id=$1',[id(1)]);await chat(1,'GLOBAL');assert.equal((await counts()).guild_dau,9);assert.equal((await counts()).social_active_uu,0);});
await check('Social 4: non-DAU guild member excluded',async()=>{await chat(11);assert.equal((await counts()).guild_dau,10);assert.equal((await counts()).social_active_uu,0);});
await check('Social 5: greeting on join day included',async()=>{await db.query('update kpi_guild_membership_periods set joined_at=$1 where subject_id=$2',[at,id(1)]);await chat(1);assert.equal((await counts()).social_active_uu,1);});
await check('Social 6: system/bot posts excluded',async()=>{await chat(1,'GUILD',true);await chat(2,'GLOBAL',true);await db.query("insert into board_posts(user_id,target_type,created_at) values(null,'GLOBAL',$1)",[at]);assert.equal((await counts()).social_active_uu,0);});
await check('Raid 1: 3/5/2 points = 2/10',async()=>{await raid(1,3);await raid(2,5);await raid(3,2);assert.equal((await counts()).raid_point_active_uu,2);assert.equal((await counts()).dau,10);});
await check('Raid 2: three battles of one point included',async()=>{await raid(1);await raid(1);await raid(1);assert.equal((await counts()).raid_point_active_uu,1);});
await check('Raid 3: two points excluded',async()=>{await raid(1,2);assert.equal((await counts()).raid_point_active_uu,0);});
await check('Raid 4: non-DAU excluded',async()=>{await raid(11,5);assert.equal((await counts()).raid_point_active_uu,0);});
await check('Raid 5: zero denominator is null, no Infinity',async()=>{await reset(0);await raid(1,5);const c=await counts();assert.equal(c.dau,0);assert.equal(c.raid_point_active_uu,0);const m=(await db.query('select kpi_overview_saved_rate(0,0,null) m')).rows[0].m;assert.equal(m.value,null);assert.equal(m.reason,'zero_denominator');});
await check('JST start included, next midnight excluded, UTC midnight not split',async()=>{await raid(1,1,'2026-09-07T15:00:00Z');await raid(1,1,'2026-09-08T00:00:00Z');await raid(1,1,'2026-09-08T14:59:59.999Z');await raid(2,2);await raid(2,1,'2026-09-08T15:00:00Z');await chat(1,'GLOBAL',false,'2026-09-07T15:00:00Z');await chat(2,'GLOBAL',false,'2026-09-08T15:00:00Z');assert.equal((await counts()).raid_point_active_uu,1);assert.equal((await counts()).social_active_uu,1);});
await check('Membership day-end authority / duplicate periods / rejoin',async()=>{await db.query('update kpi_guild_membership_periods set left_at=$1 where subject_id=$2',[at,id(1)]);await chat(1,'GLOBAL');assert.equal((await counts()).guild_dau,9);assert.equal((await counts()).social_active_uu,0);await db.query('insert into kpi_guild_membership_periods(subject_id,guild_id,joined_at) values($1,$2,$3)',[id(1),guild,at]);assert.equal((await counts()).guild_dau,10);assert.equal((await counts()).social_active_uu,1);await db.query('insert into kpi_guild_membership_periods(subject_id,guild_id,joined_at) values($1,$2,$3)',[id(1),guild,at]);assert.equal((await counts()).guild_dau,10);});
await check('DM self/null and deleted/invalid posts excluded; BBS thread counts',async()=>{await db.query('insert into direct_messages(sender_id,recipient_id,created_at) values($1,$1,$2),($1,null,$2)',[id(101),at]);await chat(1);await db.exec('delete from board_posts');assert.equal((await counts()).social_active_uu,0);await db.query('insert into bbs_threads(user_id,created_at) values($1,$2)',[id(101),at]);assert.equal((await counts()).social_active_uu,1);await db.exec('delete from bbs_threads');assert.equal((await counts()).social_active_uu,0);});
await check('Free/Cash/wrong mode/invalid cost and excluded subjects',async()=>{await raid(1,5,at,'FREE_FIRST');await raid(2,5,at,'CASH');await raid(3,'5');await raid(4,-5);await raid(5,5);await db.query("update battle_replay_sessions set battle_mode='PVP' where requester_user_id=$1",[id(105)]);await raid(6,5);await chat(6);await db.query("insert into kpi_account_classification_periods values($1,'test','2026-09-01',null)",[id(6)]);assert.equal((await counts()).dau,9);assert.equal((await counts()).raid_point_active_uu,0);assert.equal((await counts()).social_active_uu,0);});
// 実Production旧refreshと新refreshを同じfixtureで比較する。
await reset();await chat(1);await raid(1,3);await raid(2,5);await chat(2,'GLOBAL');
await db.exec(`insert into kpi_tutorial_completion_facts select subject_id,registered_at from kpi_subjects;insert into kpi_canonical_tutorial_completions_v1 select * from kpi_tutorial_completion_facts;insert into kpi_guild_conversion_facts select subject_id,id,'JOIN',joined_at from kpi_guild_membership_periods;insert into kpi_guild_chat_activation_facts select subject_id,id,joined_at from kpi_guild_membership_periods;`);
await db.exec(read('scripts/fixtures/kpi-engagement-baseline.sql'));
await db.query('select refresh_kpi_overview_saved_results($1)',[day]);
const before=(await db.query("select period_type,period_start,payload-'generated_at' payload from kpi_overview_saved_results order by 1,2")).rows;
await db.exec(migration);await db.query('select refresh_kpi_overview_saved_results($1)',[day]);
const after=(await db.query("select period_type,period_start,payload-'generated_at'-'social_active'-'raid_point_consumption' payload from kpi_overview_saved_results order by 1,2")).rows;
assert.deepEqual(after,before,'all existing daily/monthly/First Touch/retention/chat payload fields preserved');
const saved=(await db.query("select payload from kpi_overview_saved_results where period_type='daily' and period_start=$1",[day])).rows[0].payload;
assert.equal(saved.social_active.numerator,2);assert.equal(saved.social_active.denominator,10);assert.equal(saved.social_active.value,.2);
assert.equal(saved.raid_point_consumption.numerator,2);assert.equal(saved.raid_point_consumption.denominator,saved.active_users);assert.equal(saved.raid_point_consumption.value,.2);
assert.equal((await db.query("select count(distinct generation_id)::int n from kpi_overview_saved_results")).rows[0].n,1);
for(const role of ['anon','authenticated','service_role']) {await db.exec('set role '+role);await assert.rejects(db.query('select * from kpi_daily_engagement_v1($1,$1)',[day]),/permission denied/);await db.exec('reset role');}
console.log(`PASS ${cases} behavioral cases; ${after.length} saved rows regression; new payload/DAU parity; same generation; restricted function ACL`);
await db.close();
