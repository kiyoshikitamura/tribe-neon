import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=createRequire(resolve(process.env.RAID_TEST_RUNTIME??root,'package.json'))('@electric-sql/pglite');
const db=new PGlite();
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
async function create(difficulty='beginner'){
 const r=await value("select create_raid_room_v1($1,'BOSS_A',$2) as value",[difficulty,randomUUID()]);
 // 実APIの別transactionを模す。外側rollback内ではnow()が生成clock_timestampより前なので時刻を補正。
 await admin();await db.query("update raid_bosses set spawned_at=now()-interval '1 second',expires_at=now()+interval '24 hours'-interval '1 second' where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[r.roomId]);await asUser();return r;
}
const join=id=>value('select register_raid_room_v1($1) as value',[id]);
const brief=id=>value('select get_raid_room_briefing_v1($1) as value',[id]);
const start=(id,request=randomUUID(),ids=['fixture-player'],tactic='BALANCED')=>value('select start_raid_room_battle_v1($1,$2::text[],$3,$4) as value',[id,ids,tactic,request]);
async function asUser(n=1){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[n===null?'':uid(n)]);await db.exec('set local role authenticated');}
async function admin(){await db.exec('reset role');}
async function isolated(fn){await db.exec('begin');try{await db.exec('update raid_room_creation_settings set enabled=true');await asUser();await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,code){await db.exec('savepoint expected_error');try{await assert.rejects(fn,e=>!code||e.code===code);}finally{await db.exec('rollback to savepoint expected_error; release savepoint expected_error');}}
async function enabled(){await admin();await db.exec('update raid_room_battle_settings set enabled=true');await asUser();}
async function snapshot(){await admin();const out={};for(const t of ['users','raid_bosses','raid_rooms','raid_room_members','battle_replay_sessions','battle_replay_events','raid_damage_logs','raid_instance_user_progress','presents','isolation_calls','raid_room_battle_start_requests'])out[t]=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from ${t} t`);await asUser();return out;}
async function setPower(power,n=2){await admin();await db.query('update creation_fixture_power set power=$1 where user_id=$2',[power,uid(n)]);await asUser(n);}
async function setSnapshot(power,n=1){await admin();await db.query('update entry_fixture_snapshots set payload=$1 where user_id=$2',[JSON.stringify([{id:'fixture-player',stats:{hp:power,atk:0,def:0}}]),uid(n)]);await asUser(n);}
before(async()=>{
 for(const f of ['raid-room-read-projection-fixture.sql','raid-room-lifecycle-fixture.sql','raid-room-creation-fixture.sql','raid-room-legacy-isolation-fixture.sql','raid-room-entry-fixture.sql','raid-room-finalization-fixture.sql'])await db.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('raid-room-recovery-fixture.sql',import.meta.url),'utf8'));
 const dir=resolve(root,'supabase/migrations');
 const validation=readFileSync(resolve(dir,'20260813000144_official_battle_replay_contract.sql'),'utf8').match(/create or replace function public\.validate_official_battle_result[\s\S]*?\$\$;/)[0];
 await db.exec(validation);
 for(const f of readdirSync(dir).filter(f=>/^2026090800025[0-7]_/.test(f)).sort())await db.exec(readFileSync(resolve(dir,f),'utf8'));
 await db.exec(`create trigger canonical_daily_activity_finalized after update of finalization_status on public.battle_replay_sessions for each row execute function public.on_canonical_daily_activity_finalized(); create trigger canonical_guild_official_battle_exp_trigger after update of finalization_status on public.battle_replay_sessions for each row execute function public.on_canonical_guild_official_battle_exp(); create trigger ranking_daily_participation_capture after update of finalization_status on public.battle_replay_sessions for each row execute function public.capture_daily_ranking_participation();`);
 console.log('SQL engine:',await value('select version() as value'));
});
after(()=>db.close());

const result=(raw=100)=>({winner:'ENEMY',rounds:1,enemyRawDamage:100,playerRawDamage:raw,events:[{index:0,round:1,type:'DAMAGE',payload:{damage:raw}}]});
async function service(){await admin();await db.exec('set local role service_role');}
const finalize=(id,raw=100)=>value('select finalize_raid_room_battle_v1($1,$2::jsonb) as value',[id,JSON.stringify(result(raw))]);
const route=id=>value('select get_raid_battle_route_v1($1) as value',[id]);
const ownResult=id=>value('select get_raid_room_battle_result_v1($1) as value',[id]);
async function prepared(){const r=await create();await enabled();const s=await start(r.roomId);await service();return {...r,...s};}
async function state(){await admin();const out={};for(const t of ['raid_bosses','raid_instance_user_progress','raid_damage_logs','battle_replay_sessions','battle_replay_events','presents','canonical_daily_activity_claims','ranking_daily_participation','isolation_calls'])out[t]=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from ${t} t`);await service();return out;}
async function changeBoss(roomId,assignment){await admin();await db.query(`update raid_bosses set ${assignment} where id=(select raid_boss_instance_id from raid_rooms where id=$1)`,[roomId]);if(assignment.includes('expires_at='))await db.query("update battle_replay_sessions set official_context=jsonb_set(official_context,'{startedAt}',to_jsonb((clock_timestamp()-interval '2 seconds')::text)) where source_reference_id=(select raid_boss_instance_id from raid_rooms where id=$1)",[roomId]);await service();}
const receipt=id=>value('select get_raid_room_battle_start_receipt_v1($1) as value',[id]);
const batch=(limit=100)=>value('select finalize_expired_raid_rooms_v1($1) as value',[limit]);
test('本人receiptは未開始null、開始後保存responseと一致、参照副作用なし',()=>isolated(async()=>{
 const r=await create(),req=randomUUID();await rejected(()=>receipt(null),'22023');assert.equal(await receipt(req),null);await enabled();const s=await start(r.roomId,req);const prev=await snapshot();assert.deepEqual(await receipt(req),s);assert.deepEqual(await snapshot(),prev);
}));
test('receiptは別userに同requestがあっても漏れず、匿名は拒否',()=>isolated(async()=>{
 const r=await create(),req=randomUUID();await enabled();await start(r.roomId,req);await asUser(2);assert.equal(await receipt(req),null);await asUser(null);await rejected(()=>receipt(req));await admin();await db.exec('set local role anon');await rejected(()=>receipt(req),'42501');
}));
test('receiptは運用falseと期限後でも既存開始の保存responseを返す',()=>isolated(async()=>{
 const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req);await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");await admin();await db.exec('update raid_room_battle_settings set enabled=false');await asUser();assert.deepEqual(await receipt(req),s);
}));
test('receiptは不整合Replayを正本として返さない',()=>isolated(async()=>{
 const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req);await admin();await db.query("update battle_replay_sessions set official_context=jsonb_set(official_context,'{roomId}',to_jsonb($2::text)) where id=$1",[s.replay_session_id,randomUUID()]);await asUser();await rejected(()=>receipt(req),'23514');await admin();await db.query("update battle_replay_sessions set official_context=jsonb_set(official_context,'{roomId}',to_jsonb($2::text)) where id=$1",[s.replay_session_id,r.roomId]);await db.query("update raid_room_battle_start_requests set response=jsonb_set(response,'{player_snapshot}','[]'::jsonb) where request_id=$1",[req]);await asUser();await rejected(()=>receipt(req),'23514');
}));
test('期限batchは期限前0件、期限到達のみTIMEOUT・HPを保存',()=>isolated(async()=>{
 const r=await create();await service();assert.equal(await batch(),0);await changeBoss(r.roomId,"expires_at=clock_timestamp()");assert.equal(await batch(),1);await admin();const b=await value('select to_jsonb(b) as value from raid_bosses b');assert.equal(b.status,'EXPIRED');assert.equal(b.outcome,'TIMEOUT_FAILURE');assert.equal(b.current_hp,28000000);assert.ok(b.outcome_finalized_at);assert.equal(b.cleared_at,null);
}));
test('期限batch再送は0件で終了HP・時刻・台帳不変',()=>isolated(async()=>{
 const r=await create();await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");assert.equal(await batch(),1);const prev=await state();assert.equal(await batch(),0);assert.deepEqual(await state(),prev);
}));
test('撃破済みRoomは期限が過ぎてもbatchで不変',()=>isolated(async()=>{
 const r=await prepared();await changeBoss(r.roomId,'current_hp=1');await finalize(r.replay_session_id,2);await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");const prev=await state();assert.equal(await batch(),0);assert.deepEqual(await state(),prev);
}));
test('期限batchは非Roomの期限終了を行わない',()=>isolated(async()=>{
 await admin();await db.query("insert into raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,status,spawned_at,expires_at) values($1,'BOSS_A','BOSS_A',10,10,'ACTIVE',clock_timestamp()-interval '25 hours',clock_timestamp()-interval '1 second')",[randomUUID()]);await service();const prev=await state();assert.equal(await batch(),0);assert.deepEqual(await state(),prev);
}));
test('期限batchはlimit件ずつ処理し残りは次回に完了',()=>isolated(async()=>{
 const a=await create(),b=await create(),c=await create();for(const r of [a,b,c])await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");assert.equal(await batch(2),2);assert.equal(await batch(2),1);assert.equal(await batch(2),0);
}));
test('期限batch limit不正値は副作用なしで拒否',()=>isolated(async()=>{
 await service();const prev=await state();for(const n of [null,0,-1,1001])await rejected(()=>batch(n),'22023');assert.deepEqual(await state(),prev);
}));
test('期限batchをanon/authenticatedは実行不可、運用設定false維持',()=>isolated(async()=>{
 for(const role of ['anon','authenticated']){await admin();await db.exec('set local role '+role);await rejected(()=>batch(),'42501');}await admin();assert.equal(await value('select enabled as value from raid_room_battle_settings'),false);
}));
test('batchで先に期限終了しても保存済み戦闘はrawのみ確定',()=>isolated(async()=>{
 const r=await prepared();await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");assert.equal(await batch(),1);const f=await finalize(r.replay_session_id,123);assert.equal(f.rawDamage,123);assert.equal(f.appliedDamage,0);assert.equal(f.remainingBossHp,28000000);
}));
test('毎分Cron登録は模擬jobに1件、登録DO再実行でも重複なし',async()=>{
 const expected={jobname:'raid-room-expiry-minute',schedule:'* * * * *'};
 let jobs=(await db.query('select * from cron.job')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].jobname,expected.jobname);assert.equal(jobs[0].schedule,expected.schedule);assert.match(jobs[0].command,/finalize_expired_raid_rooms_v1\(100\)/);
 const dir=resolve(root,'supabase/migrations'),f=readdirSync(dir).find(f=>/^20260908000257_/.test(f));await db.exec(readFileSync(resolve(dir,f),'utf8').match(/do \$schedule\$[\s\S]*?\$schedule\$;/)[0]);jobs=(await db.query('select * from cron.job')).rows;assert.equal(jobs.length,1);
});
