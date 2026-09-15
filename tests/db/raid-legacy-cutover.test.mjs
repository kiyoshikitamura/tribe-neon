import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=createRequire(resolve(process.env.RAID_TEST_RUNTIME??root,'package.json'))('@electric-sql/pglite');
const db=new PGlite();
const uid='00000000-0000-0000-0000-000000000001';
const sqlFile=n=>readFileSync(resolve(root,'supabase/migrations',n),'utf8');
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
// 指定旧関数定義を境界で切り出す。本文を書換えず新Migration前の依存として使用。
function oldFunction(file,name){const text=sqlFile(file);const start=text.indexOf(`create or replace function public.${name}(`);assert.ok(start>=0,name);const body=text.indexOf('$$',start);const end=text.indexOf('$$;',body+2);assert.ok(end>body,name);return text.slice(start,end+3);}
const m210='20260830000210_canonical_master_freeze_runtime.sql';
async function isolated(fn){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,code){await db.exec('savepoint expected_error');try{await assert.rejects(fn,e=>e.code===code);}finally{await db.exec('rollback to savepoint expected_error; release savepoint expected_error');}}
async function boss(room=false){const id=await value("insert into raid_bosses(boss_id,boss_master_id,raid_variant_id,current_hp,max_hp,status,spawned_at,expires_at,base_id,rotation_date,raid_day_key) values('BOSS_A','BOSS_A','BOSS_A',1000,1000,'ACTIVE',now()-interval '1 hour',now()+interval '23 hours','shinjuku',(now() at time zone 'Asia/Tokyo')::date,(now() at time zone 'Asia/Tokyo')::date::text) returning id as value");if(room)await value('select _raid_room_register_v1($1,$2,\'beginner\') as value',[id,uid]);return id;}
const start=id=>value("select start_raid_battle($1,array['fixture-player']) as value",[id]);
async function replay(id){return value("insert into battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,resolution_authority,finalization_status,official_context) values($1,'RAID',$2,'RAID_SERVER','PENDING','{\"costType\":\"RAID_POINT\"}') returning id as value",[uid,id]);}
const result=damage=>({playerRawDamage:damage,events:[{index:0,round:1,type:'DAMAGE',payload:{amount:damage}}]});
const finalize=(id,damage=100)=>value('select finalize_raid_battle($1,$2::jsonb) as value',[id,JSON.stringify(result(damage))]);
async function snapshot(){const out={};for(const t of ['users','raid_bosses','raid_rooms','raid_room_members','battle_replay_sessions','battle_replay_events','raid_damage_logs','raid_instance_user_progress','presents','raid_clear_reward_claims','raid_clear_reward_deliveries','canonical_daily_activity_claims','raid_reward_grants','raid_production_reward_grants','isolation_calls','raid_legacy_settings'])out[t]=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from ${t} t`);return out;}
before(async()=>{
 for(const f of ['raid-room-read-projection-fixture.sql','raid-room-lifecycle-fixture.sql','raid-room-creation-fixture.sql','raid-room-legacy-isolation-fixture.sql'])await db.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 for(const f of ['20260908000250_raid_room_read_projection.sql','20260908000251_raid_room_condition_rules.sql','20260908000252_raid_room_lifecycle.sql','20260908000253_raid_room_creation.sql'])await db.exec(sqlFile(f));
 for(const name of ['canonical_raid_rotation_pair','on_canonical_daily_activity_finalized'])await db.exec(oldFunction(m210,name));
 await db.exec('create trigger canonical_daily_activity_finalized after update of finalization_status on battle_replay_sessions for each row execute function on_canonical_daily_activity_finalized()');
 await db.exec(sqlFile('20260908000254_raid_room_legacy_isolation.sql'));
 await db.exec(sqlFile('20260908000263_raid_legacy_cutover.sql'));
 console.log('SQL engine:',await value('select version() as value'));
});
after(()=>db.close());

const disable = () => db.exec('update raid_legacy_settings set enabled=false where singleton');
async function rotationVariants(){
 const pair=await value("select canonical_raid_rotation_pair((now() at time zone 'Asia/Tokyo')::date) as value");
 await db.query("update canonical_raid_variants set area_id=upper($1) where raid_variant_id='BOSS_A'",[pair[0]]);
 await db.query("update canonical_raid_variants set area_id=upper($1) where raid_variant_id='BOSS_B'",[pair[1]]);
}

test('defaultは旧経路enabled=true、Room作成はfalseを維持',async()=>{
 assert.equal(await value('select enabled as value from raid_legacy_settings where singleton'),true);
 assert.equal(await value('select enabled as value from raid_room_creation_settings'),false);
});
test('defaultの旧日次生成/一覧は2枠を維持',()=>isolated(async()=>{
 await rotationVariants();const list=await value('select get_active_raids() as value');
 assert.equal(list.length,2);assert.equal(await value('select count(*)::int as value from raid_bosses'),2);
}));
test('defaultの旧開始は初回無料とRP1を維持',()=>isolated(async()=>{
 const id=await boss();assert.equal((await start(id)).cost,0);assert.equal((await start(id)).cost,1);
 assert.equal(await value('select raid_points as value from users where id=$1',[uid]),8);
}));
test('defaultの撃破済みrespawnを維持',()=>isolated(async()=>{
 const id=await boss();await finalize(await replay(id),1200);
 await db.query("update raid_bosses set respawn_after=now()-interval '1 minute' where id=$1",[id]);
 assert.ok(await value('select respawn_cleared_raid_slot($1) as value',[id]));
 assert.equal(await value('select respawn_cleared_raid_slot($1) as value',[id]),null);
}));
test('停止後の日次生成と副作用付き一覧は状態/台帳を変更しない',()=>isolated(async()=>{
 await rotationVariants();const id=await boss();await db.query("update raid_bosses set expires_at=now()-interval '1 second' where id=$1",[id]);
 await disable();const before=await snapshot();await db.exec('select rotate_daily_raids()');
 assert.deepEqual(await value('select get_active_raids() as value'),[]);assert.deepEqual(await snapshot(),before);
}));
test('停止後の期限到達済みrespawnはnullで生成しない',()=>isolated(async()=>{
 const id=await boss();await finalize(await replay(id),1200);
 await db.query("update raid_bosses set respawn_after=now()-interval '1 minute' where id=$1",[id]);
 await disable();const before=await snapshot();assert.equal(await value('select respawn_cleared_raid_slot($1) as value',[id]),null);
 assert.deepEqual(await snapshot(),before);
}));
test('停止後の旧新規開始は無料/RPを消費せず回復/Replay生成も行わない',()=>isolated(async()=>{
 const id=await boss();await disable();for(const used of [false,true]){
  await db.query('update users set raid_free_entry_consumed=$1 where id=$2',[used,uid]);const before=await snapshot();
  await rejected(()=>start(id),'55000');assert.deepEqual(await snapshot(),before);
 }
}));
test('停止前に発行したReplayは停止後も確定でき同一再送は冪等',()=>isolated(async()=>{
 const id=await boss();await start(id);const rid=await value('select id as value from battle_replay_sessions limit 1');
 await disable();const result=await finalize(rid,100);
 assert.equal(result.remainingBossHp,900);assert.equal(result.rawDamage,100);
 assert.equal(await value('select count(*)::int as value from raid_damage_logs'),1);
 const before=await snapshot();assert.deepEqual(await finalize(rid,100),result);assert.deepEqual(await snapshot(),before);
}));
test('停止後も開始済みの致死確定を受け付け新規respawnは止める',()=>isolated(async()=>{
 const id=await boss();await start(id);const rid=await value('select id as value from battle_replay_sessions limit 1');await disable();
 assert.equal((await finalize(rid,1200)).appliedDamage,1000);
 assert.equal(await value('select status as value from raid_bosses where id=$1',[id]),'CLEARED');
 await db.query("update raid_bosses set respawn_after=now()-interval '1 minute' where id=$1",[id]);
 assert.equal(await value('select respawn_cleared_raid_slot($1) as value',[id]),null);
}));
test('一般roleとservice_roleは停止設定を直接変更できず、確定ACLは維持',()=>isolated(async()=>{
 for(const role of ['anon','authenticated','service_role'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']){
  assert.equal(await value('select has_table_privilege($1,\'public.raid_legacy_settings\',$2) as value',[role,privilege]),false);
 }
 assert.equal(await value("select relrowsecurity as value from pg_class where oid='public.raid_legacy_settings'::regclass"),true);
 assert.equal(await value("select has_function_privilege('authenticated','finalize_raid_battle(uuid,jsonb)','EXECUTE') as value"),false);
 assert.equal(await value("select has_function_privilege('service_role','finalize_raid_battle(uuid,jsonb)','EXECUTE') as value"),true);
 await db.exec('set local role authenticated');await rejected(()=>db.exec('update raid_legacy_settings set enabled=true'),'42501');await db.exec('reset role');
}));
test('設定欠落時は旧開始/生成を停止し、値が復旧すれば従来開始できる',()=>isolated(async()=>{
 const id=await boss();await db.exec('delete from raid_legacy_settings');
 const before=await snapshot();await rejected(()=>start(id),'55000');await db.exec('select rotate_daily_raids()');
 assert.deepEqual(await value('select get_active_raids() as value'),[]);assert.deepEqual(await snapshot(),before);
 await db.exec('insert into raid_legacy_settings(singleton,enabled) values(true,true)');assert.equal((await start(id)).cost,0);
}));
