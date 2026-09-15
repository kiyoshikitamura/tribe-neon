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
const start=(id,request=randomUUID(),ids=['fixture-player'],tactic='BALANCED')=>value('select start_raid_room_battle_v1($1,$2::text[],$3,$4) as value',[id,ids,tactic,request]);
async function asUser(n=1){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[n===null?'':uid(n)]);await db.exec('set local role authenticated');}
async function admin(){await db.exec('reset role');}
async function isolated(fn){await db.exec('begin');try{await db.exec('update raid_room_creation_settings set enabled=true');await asUser();await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,code){await db.exec('savepoint expected_error');try{await assert.rejects(fn,e=>!code||e.code===code);}finally{await db.exec('rollback to savepoint expected_error; release savepoint expected_error');}}
async function enabled(){await admin();await db.exec('update raid_room_battle_settings set enabled=true');await asUser();}
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
 await db.exec(readFileSync(new URL('raid-room-integrated-fixture.sql',import.meta.url),'utf8'));
 for(const n of ['00229_','00233_','00234_']){const text=readFileSync(resolve(dir,readdirSync(dir).find(x=>x.includes(n))),'utf8');for(const m of text.matchAll(/create table if not exists public\.[\s\S]*?\n\);/gi))await db.exec(m[0]);}
 for(const f of readdirSync(dir).filter(f=>/^20260908000261_/ .test(f)))await db.exec(readFileSync(resolve(dir,f),'utf8'));
 for(const f of readdirSync(dir).filter(f=>/^20260908000262_/.test(f)))await db.exec(readFileSync(resolve(dir,f),'utf8'));
 for(const f of readdirSync(dir).filter(f=>/^20260908000263_/.test(f)))await db.exec(readFileSync(resolve(dir,f),'utf8'));
 console.log('SQL engine:',await value('select version() as value'));
});
after(()=>db.close());

const result=(raw=100)=>({winner:'ENEMY',rounds:1,enemyRawDamage:100,playerRawDamage:raw,events:[{index:0,round:1,type:'DAMAGE',payload:{damage:raw}}]});
async function service(){await admin();await db.exec('set local role service_role');}
const finalize=(id,raw=100)=>value('select finalize_raid_room_battle_v1($1,$2::jsonb) as value',[id,JSON.stringify(result(raw))]);
async function changeBoss(roomId,assignment){await admin();await db.query(`update raid_bosses set ${assignment} where id=(select raid_boss_instance_id from raid_rooms where id=$1)`,[roomId]);if(assignment.includes('expires_at='))await db.query("update battle_replay_sessions set official_context=jsonb_set(official_context,'{startedAt}',to_jsonb((clock_timestamp()-interval '2 seconds')::text)) where source_reference_id=(select raid_boss_instance_id from raid_rooms where id=$1)",[roomId]);await service();}
const batch=(limit=100)=>value('select finalize_expired_raid_rooms_v1($1) as value',[limit]);
const request=(id,req=randomUUID())=>value('select request_raid_room_rescue_v1($1,$2) as value',[id,req]);
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
async function cutover(){await admin();await db.exec('update raid_legacy_settings set enabled=false');await asUser();}
async function noRanking(){await admin();assert.equal(await value('select count(*)::int as value from ranking_daily_participation'),0);assert.equal(await value('select count(*)::int as value from ranking_season_reward_grants'),0);assert.equal(await value('select count(*)::int as value from ranking_daily_reward_awards'),0);await asUser();assert.equal((await value('select get_raid_season_rankings(100,0) as value')).status,'RETIRED');}
test('実SQL250〜263を同じschemaへ順次適用し既定値を保持',async()=>{assert.equal(await value('select enabled as value from raid_legacy_settings'),true);for(const t of ['raid_room_creation_settings','raid_room_battle_settings','raid_room_rescue_settings'])assert.equal(await value(`select enabled as value from ${t}`),false);});
test('旧停止下でRoom作成→両公開先救援→戦闘→両Present→既存claim、再送・順位停止共存',()=>isolated(async()=>{
 await cutover();await clearConfigured();await configured();await guild();const r=await create();await enabled();await rescueEnabled();const reqId=randomUUID(),x=await request(r.roomId,reqId);assert.equal(x.publications.length,2);assert.deepEqual(await request(r.roomId,reqId),x);await asUser(2);await rescueJoin(x.publications[0].rescueId);const s=await start(r.roomId);await service();await finalize(s.replay_session_id,101);await clearWithOwner(r);await asUser(2);const a=await clearReward(r.roomId),b=await reward(r.roomId);assert.equal(a.status,'issued');assert.equal(b.status,'issued');assert.notEqual(a.items[0].presentId,b.items[0].presentId);for(const v of [a,b]){assert.equal((await value('select claim_present($1) as value',[v.items[0].presentId])).status,'success');await rejected(()=>value('select claim_present($1) as value',[v.items[0].presentId]));}
 await service();await finalize(s.replay_session_id,101);await admin();assert.equal(await value('select cash as value from users where id=$1',[uid(2)]),12345+19+37);assert.equal(await count(),3);await noRanking();
}));
test('通常参加者・主催者も討伐対象、救援未帰属なら救援報酬なし',()=>isolated(async()=>{await cutover();await clearConfigured();await configured();const r=await normal();await service();await finalize(r.replay_session_id,101);await clearWithOwner(r);await asUser(2);assert.equal((await clearReward(r.roomId)).status,'issued');assert.notEqual((await reward(r.roomId)).status,'issued');await asUser();assert.equal((await clearReward(r.roomId)).status,'issued');assert.equal(await count(),2);await noRanking();}));
test('旧停止下の撃破後確定は救援のみ、討伐貢献へ混入しない',()=>isolated(async()=>{await cutover();await clearConfigured();await configured();const r=await setup();await clearWithOwner(r);await service();assert.equal((await finalize(r.replay_session_id,101)).lateFinalization,true);await asUser(2);assert.equal((await reward(r.roomId)).status,'issued');assert.notEqual((await clearReward(r.roomId)).status,'issued');assert.equal(await count(),2);await noRanking();}));
test('旧停止下の24時間終了と期限後確定は両報酬なし',()=>isolated(async()=>{await cutover();await clearConfigured();await configured();const r=await setup();await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");await batch();assert.equal((await finalize(r.replay_session_id,28000000)).lateFinalization,true);await asUser(2);assert.notEqual((await reward(r.roomId)).status,'issued');assert.notEqual((await clearReward(r.roomId)).status,'issued');assert.equal(await count(),0);await noRanking();}));
test('旧開始済みReplayは停止後も確定、旧新規開始・生成を拒否、発行済み順位Presentは受取可',()=>isolated(async()=>{
 await admin();const id=await value("insert into raid_bosses(boss_id,boss_master_id,raid_variant_id,current_hp,max_hp,status,spawned_at,expires_at,base_id,rotation_date,raid_day_key) values('BOSS_A','BOSS_A','BOSS_A',1000,1000,'ACTIVE',now()-interval '1 hour',now()+interval '23 hours','shinjuku',current_date,current_date::text) returning id as value");await asUser();await value("select start_raid_battle($1,array['fixture-player']) as value",[id]);await admin();const rid=await value('select id as value from battle_replay_sessions where source_reference_id=$1',[id]);assert.ok(rid);await cutover();await rejected(()=>value("select start_raid_battle($1,array['fixture-player']) as value",[id]),'55000');await service();const out=await value('select finalize_raid_battle($1,$2::jsonb) as value',[rid,JSON.stringify(result(100))]);assert.equal(out.rawDamage,100);assert.deepEqual(await value('select finalize_raid_battle($1,$2::jsonb) as value',[rid,JSON.stringify(result(100))]),out);await admin();const n=await value('select count(*)::int as value from raid_bosses');await db.exec('select rotate_daily_raids()');assert.deepEqual(await value('select get_active_raids() as value'),[]);assert.equal(await value('select count(*)::int as value from raid_bosses'),n);const pid=await value("insert into presents(user_id,item_id,quantity,message,status,expire_at) values($1,'CASH',11,'旧レイド順位報酬','UNCLAIMED',now()+interval '30 days') returning id as value",[uid(1)]);await asUser();assert.equal((await value('select claim_present($1) as value',[pid])).status,'success');await noRanking();
}));
