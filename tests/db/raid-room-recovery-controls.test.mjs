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
 for(const f of readdirSync(dir).filter(f=>/^2026090800025[0-8]_/.test(f)).sort())await db.exec(readFileSync(resolve(dir,f),'utf8'));
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
const list=(n=20)=>value('select list_raid_room_battle_recoveries_v1($1) as value',[n]);
const ack=id=>value('select acknowledge_raid_room_battle_recovery_v1($1) as value',[id]);
const cancel=id=>value('select cancel_raid_room_battle_request_v1($1) as value',[id]);
test('取消先行は遅い開始を拒否しRP/Replay副作用なし',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();assert.equal((await cancel(req)).status,'cancelled');const prev=await snapshot();await rejected(()=>start(r.roomId,req),'23514');assert.deepEqual(await snapshot(),prev);assert.equal((await cancel(req)).status,'cancelled');}));
test('開始先行は取消せず同receiptを返す',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req),prev=await snapshot();assert.deepEqual(await cancel(req),{status:'started',receipt:s});assert.deepEqual(await snapshot(),prev);}));
test('同requestでも他人の取消は開始済本人へ影響しない',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req);await asUser(2);assert.equal((await cancel(req)).status,'cancelled');assert.deepEqual(await list(),[]);await asUser();assert.deepEqual(await receipt(req),s);assert.equal((await cancel(req)).status,'started');}));
test('未確定ackは拒否、確定後ackは冪等で戦闘経済不変',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req);await rejected(()=>ack(req),'23514');assert.equal((await list()).length,1);await service();await finalize(s.replay_session_id);await asUser();const prev=await state();await asUser();assert.equal((await ack(req)).status,'acknowledged');assert.equal((await ack(req)).status,'acknowledged');assert.deepEqual(await list(),[]);assert.deepEqual(await state(),prev);}));
test('一覧は未ackだけlimit指定し保存payload/receipt一致、参照副作用なし',()=>isolated(async()=>{const r=await create();await enabled();const reqs=[randomUUID(),randomUUID(),randomUUID()].sort(),ss=[];for(const req of reqs)ss.push(await start(r.roomId,req));const prev=await snapshot(),items=await list(2);assert.equal(items.length,2);assert.deepEqual(items.map(x=>x.requestId),reqs.slice(0,2));for(let i=0;i<2;i++){assert.equal(items[i].roomId,r.roomId);assert.deepEqual(items[i].receipt,ss[i]);assert.deepEqual(items[i].payload,{p_room_id:r.roomId,p_character_ids:['fixture-player'],p_tactic:'BALANCED',p_request_id:reqs[i]});}assert.deepEqual(await snapshot(),prev);}));
test('一覧limit不正は拒否、未開始ackは拒否',()=>isolated(async()=>{for(const n of [null,0,-1,101])await rejected(()=>list(n),'22023');await rejected(()=>ack(randomUUID()),'P0002');}));
test('匿名権限とnull要求の拒否',()=>isolated(async()=>{await rejected(()=>ack(null),'22023');await rejected(()=>cancel(null),'22023');await asUser(null);for(const fn of [()=>list(),()=>ack(randomUUID()),()=>cancel(randomUUID())])await rejected(fn);await admin();await db.exec('set local role anon');for(const fn of [()=>list(),()=>ack(randomUUID()),()=>cancel(randomUUID())])await rejected(fn,'42501');}));
test('運用false/期限後も保存済一覧とcancel startedを返す',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req);await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");await admin();await db.exec('update raid_room_battle_settings set enabled=false');await asUser();assert.equal((await list())[0].requestId,req);assert.deepEqual((await cancel(req)).receipt,s);}));
test('取消台帳はauth/service直接参照書込不可、他人のack不可',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();const s=await start(r.roomId,req);await service();await finalize(s.replay_session_id);await asUser(2);await rejected(()=>ack(req),'P0002');for(const role of ['authenticated','service_role']){await admin();await db.exec('set local role '+role);await rejected(()=>db.query('select * from raid_room_battle_request_cancellations'),'42501');await rejected(()=>db.query('insert into raid_room_battle_request_cancellations(user_id,request_id) values($1,$2)',[uid(1),randomUUID()]),'42501');}}));
test('取消済みrequest以外は通常開始できる、再送は再消費しない',()=>isolated(async()=>{const r=await create();await enabled();await cancel(randomUUID());const req=randomUUID(),s=await start(r.roomId,req),prev=await snapshot();assert.deepEqual(await start(r.roomId,req),s);assert.deepEqual(await snapshot(),prev);}));
test('破損receiptはlist/ack/cancel全て拒否し取消に置換しない',()=>isolated(async()=>{const r=await create(),req=randomUUID();await enabled();await start(r.roomId,req);await admin();await db.query("update raid_room_battle_start_requests set response=jsonb_set(response,'{player_snapshot}','[]'::jsonb) where request_id=$1",[req]);await asUser();for(const fn of [()=>list(),()=>ack(req),()=>cancel(req)])await rejected(fn,'23514');await admin();assert.equal(await value('select count(*)::int as value from raid_room_battle_request_cancellations'),0);}));
