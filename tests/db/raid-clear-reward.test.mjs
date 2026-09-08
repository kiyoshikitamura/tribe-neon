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
 await db.exec(readFileSync(new URL('raid-room-rescue-fixture.sql',import.meta.url),'utf8'));
 const dir=resolve(root,'supabase/migrations');
 const validation=readFileSync(resolve(dir,'20260813000144_official_battle_replay_contract.sql'),'utf8').match(/create or replace function public\.validate_official_battle_result[\s\S]*?\$\$;/)[0];
 await db.exec(validation);
 for(const f of readdirSync(dir).filter(f=>/^2026090800025[0-9]_/.test(f)).sort())await db.exec(readFileSync(resolve(dir,f),'utf8'));
 await db.exec(`create trigger canonical_daily_activity_finalized after update of finalization_status on public.battle_replay_sessions for each row execute function public.on_canonical_daily_activity_finalized(); create trigger canonical_guild_official_battle_exp_trigger after update of finalization_status on public.battle_replay_sessions for each row execute function public.on_canonical_guild_official_battle_exp(); create trigger ranking_daily_participation_capture after update of finalization_status on public.battle_replay_sessions for each row execute function public.capture_daily_ranking_participation();`);
 await db.exec(readFileSync(new URL('raid-room-rescue-rewards-fixture.sql',import.meta.url),'utf8'));
 const presentSource=readFileSync(resolve(dir,'20260812000135_provisional_open_beta_missions.sql'),'utf8');
 for(const name of ['grant_present_payload','claim_present'])await db.exec(presentSource.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\([\\s\\S]*?\\$\\$;'))[0]);
 await db.exec("REVOKE ALL ON FUNCTION public.grant_present_payload(uuid,text,integer) FROM PUBLIC,anon,authenticated;REVOKE ALL ON FUNCTION public.claim_present(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.claim_present(uuid) TO authenticated;");
 for(const f of readdirSync(dir).filter(f=>/^20260908000260_/.test(f)))await db.exec(readFileSync(resolve(dir,f),'utf8'));
 for(const f of readdirSync(dir).filter(f=>/^20260908000262_/.test(f)))await db.exec(readFileSync(resolve(dir,f),'utf8'));
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
const rescueStatus=id=>value('select get_raid_room_rescue_status_v1($1) as value',[id]);
const request=(id,req=randomUUID())=>value('select request_raid_room_rescue_v1($1,$2) as value',[id,req]);
const link=id=>value('select get_raid_room_rescue_v1($1) as value',[id]);
const rescueJoin=id=>value('select join_raid_room_rescue_v1($1) as value',[id]);
async function rescueEnabled(){await admin();await db.exec('update raid_room_rescue_settings set enabled=true');await asUser();}
async function guild(n=1,g=1){await admin();await db.query('delete from guild_members where user_id=$1',[uid(n)]);if(g)await db.query('insert into guild_members(user_id,guild_id) values($1,$2)',[uid(n),uid(100+g)]);await asUser(n);}
const reward=id=>value('select get_raid_room_rescue_reward_v1($1) as value',[id]);
async function configured(){await admin();await db.exec("update raid_room_difficulty_rules set rescue_min_battles=1,rescue_min_contribution_damage=100 where difficulty='beginner';update raid_room_rescue_reward_rules set enabled=true where difficulty='beginner';insert into raid_room_rescue_reward_items(difficulty,item_id,quantity) values('beginner','CASH',37)");await asUser();}
async function setup(){const r=await create();await rescueEnabled();await enabled();const x=await request(r.roomId);await asUser(2);await rescueJoin(x.publications[0].rescueId);const s=await start(r.roomId);return {...r,...s,rescueId:x.publications[0].rescueId};}
async function clearWithOwner(r){await asUser();const s=await start(r.roomId);await service();await finalize(s.replay_session_id,28000000);return s;}
async function count(){await admin();return value('select count(*)::int as value from presents');}

const clearReward=id=>value('select get_raid_room_clear_reward_v1($1) as value',[id]);
async function clearConfigured(threshold=100){await admin();await db.query("update raid_room_clear_reward_rules set enabled=true,minimum_contribution_damage=$1 where difficulty='beginner'",[threshold]);await db.exec("insert into raid_room_clear_reward_items(difficulty,item_id,quantity) values('beginner','CASH',19)");await asUser();}
async function normal(){const r=await create();await enabled();await asUser(2);await join(r.roomId);const s=await start(r.roomId);return {...r,...s};}
test('未設定は撃破しても討伐報酬を発行しない',()=>isolated(async()=>{const r=await normal();await service();await finalize(r.replay_session_id,28000000);await asUser(2);assert.equal((await clearReward(r.roomId)).status,'unconfigured');assert.equal(await count(),0);}));
test('累積閾値の未満・一致は不成立、超過しても未討伐なら未発行',()=>isolated(async()=>{await clearConfigured();const r=await normal();await service();await finalize(r.replay_session_id,99);await asUser(2);let x=await clearReward(r.roomId);assert.equal(x.clearGate.contributionDamage,99);assert.equal(x.clearGate.status,'not_succeeded');const s=await start(r.roomId);await service();await finalize(s.replay_session_id,1);await asUser(2);x=await clearReward(r.roomId);assert.equal(x.clearGate.contributionDamage,100);assert.equal(x.clearGate.status,'not_succeeded');const z=await start(r.roomId);await service();await finalize(z.replay_session_id,1);await asUser(2);x=await clearReward(r.roomId);assert.equal(x.clearGate.contributionDamage,101);assert.notEqual(x.status,'issued');assert.equal(await count(),0);}));
test('他参加者の撃破でACTIVE中に超過した本人へ1回送付、撃破した主催者も対象',()=>isolated(async()=>{await clearConfigured();const r=await normal();await service();await finalize(r.replay_session_id,101);await clearWithOwner(r);await asUser(2);let x=await clearReward(r.roomId);assert.equal(x.status,'issued');assert.equal(x.items[0].quantity,19);assert.equal(Date.parse(x.expiresAt)-Date.parse(x.issuedAt),30*86400000);await asUser();assert.equal((await clearReward(r.roomId)).status,'issued');assert.equal(await count(),2);}));
test('撃破打そのものを集計し、撃破後確定で閾値超過しても追加資格なし',()=>isolated(async()=>{await clearConfigured();const r=await normal();const kill=await clearWithOwner(r);await admin();assert.equal(await value('select s.finalized_at>=b.outcome_finalized_at as value from battle_replay_sessions s join raid_bosses b on b.id=s.source_reference_id where s.id=$1',[kill.replay_session_id]),true);await asUser();const owner=await clearReward(r.roomId);assert.equal(owner.status,'issued');assert.equal(owner.clearGate.contributionDamage,28000000);await service();const late=await finalize(r.replay_session_id,101);assert.equal(late.lateFinalization,true);await asUser(2);const x=await clearReward(r.roomId);assert.equal(x.clearGate.contributionDamage,0);assert.notEqual(x.status,'issued');assert.equal(await count(),1);}));
test('撃破時に閾値一致だった本人は後確定を足しても資格なし',()=>isolated(async()=>{await clearConfigured();const r=await normal();const later=await start(r.roomId);await service();await finalize(r.replay_session_id,100);await clearWithOwner(r);await service();await finalize(later.replay_session_id,1);await asUser(2);const x=await clearReward(r.roomId);assert.equal(x.clearGate.contributionDamage,100);assert.notEqual(x.status,'issued');assert.equal(await count(),1);}));
test('TIMEOUTと期限後確定は未発行',()=>isolated(async()=>{await clearConfigured();const r=await normal();await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");await batch();await finalize(r.replay_session_id,28000000);await asUser(2);assert.notEqual((await clearReward(r.roomId)).status,'issued');assert.equal(await count(),0);}));
test('確定再送で二重送付せず、既存claimで受取・他人/再受取拒否',()=>isolated(async()=>{await clearConfigured();const r=await normal();await service();await finalize(r.replay_session_id,28000000);await finalize(r.replay_session_id,28000000);await asUser(2);const x=await clearReward(r.roomId),id=x.items[0].presentId;assert.equal(await count(),1);await asUser(3);await rejected(()=>value('select claim_present($1) as value',[id]));await asUser(2);assert.equal((await value('select claim_present($1) as value',[id])).status,'success');await rejected(()=>value('select claim_present($1) as value',[id]));assert.equal((await clearReward(r.roomId)).items[0].presentStatus,'CLAIMED');await admin();assert.equal(await value('select cash as value from users where id=$1',[uid(2)]),12345+19);}));
test('期限切れPresent受取拒否、直接台帳/内部発行/匿名参照拒否',()=>isolated(async()=>{await clearConfigured();const r=await normal();await service();await finalize(r.replay_session_id,28000000);await asUser(2);const id=(await clearReward(r.roomId)).items[0].presentId;await admin();await db.query("update presents set expire_at=clock_timestamp()-interval '1 second' where id=$1",[id]);await asUser(2);await rejected(()=>value('select claim_present($1) as value',[id]));await rejected(()=>value('select count(*) as value from raid_room_clear_rewards'),'42501');await rejected(()=>value('select _issue_raid_room_clear_rewards_v1($1) as value',[r.roomId]),'42501');await asUser(null);await rejected(()=>clearReward(r.roomId));}));
test('討伐報酬と救援成功報酬は共存して別Present、救援の後確定条件も保持',()=>isolated(async()=>{await clearConfigured();await configured();const r=await setup();await service();await finalize(r.replay_session_id,101);await clearWithOwner(r);await asUser(2);assert.equal((await clearReward(r.roomId)).status,'issued');assert.equal((await reward(r.roomId)).status,'issued');assert.equal(await count(),3);await service();await finalize(r.replay_session_id,101);await admin();const sources=(await db.query('select source_kind from presents where user_id=$1 order by source_kind',[uid(2)])).rows.map(x=>x.source_kind);assert.deepEqual(sources,['RAID_ROOM_CLEAR','RAID_ROOM_RESCUE']);assert.equal(await count(),3);}));
test('終了前開始・終了後確定は救援報酬のみ対象、討伐報酬と混同しない',()=>isolated(async()=>{await clearConfigured();await configured();const r=await setup();await clearWithOwner(r);await service();await finalize(r.replay_session_id,101);await asUser(2);assert.equal((await reward(r.roomId)).status,'issued');assert.notEqual((await clearReward(r.roomId)).status,'issued');assert.equal(await count(),2);}));
