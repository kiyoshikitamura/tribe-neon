import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(resolve(process.env.RAID_TEST_RUNTIME??root,'package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const create=(difficulty='beginner',variant='BOSS_A',request=randomUUID())=>value('select create_raid_room_v1($1,$2,$3::uuid) as value',[difficulty,variant,request]);
async function asUser(n=1){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[n===null?'':uid(n)]);await db.exec('set local role authenticated');}
async function admin(){await db.exec('reset role');}
async function isolated(fn,enabled=true){await db.exec('begin');try{if(enabled)await db.exec('update raid_room_creation_settings set enabled=true');await asUser();await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,code){await db.exec('savepoint expected_error');try{await assert.rejects(fn,e=>!code||e.code===code);}finally{await db.exec('rollback to savepoint expected_error; release savepoint expected_error');}}
async function count(table){await admin();const n=await value(`select count(*)::int as value from ${table}`);await asUser();return n;}
before(async()=>{
 for(const f of ['raid-room-read-projection-fixture.sql','raid-room-lifecycle-fixture.sql','raid-room-creation-fixture.sql'])await db.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 for(const f of ['20260908000250_raid_room_read_projection.sql','20260908000251_raid_room_condition_rules.sql','20260908000252_raid_room_lifecycle.sql','20260908000253_raid_room_creation.sql'])await db.exec(readFileSync(resolve(root,'supabase/migrations',f),'utf8'));
 console.log('SQL engine:',await value('select version() as value'));
});
after(()=>db.close());
test('初期disabledは認証ユーザーにも生成を拒否し副作用なし',()=>isolated(async()=>{
 await rejected(()=>create(),'55000');
 for(const t of ['raid_bosses','raid_rooms','raid_room_members'])assert.equal(await count(t),0);
},false));
test('authenticated実呼出しで本人Room・owner参加を生成し24時間・HPを保持',()=>isolated(async()=>{
 const dto=await create();assert.ok(dto.roomId);assert.equal(dto.participantCount.value,1);
 await admin();
 const r=(await db.query('select r.owner_user_id,b.* from raid_rooms r join raid_bosses b on b.id=r.raid_boss_instance_id where r.id=$1',[dto.roomId])).rows[0];
 assert.equal(r.owner_user_id,uid(1));assert.equal(Number(r.current_hp),28000000);assert.equal(Number(r.max_hp),28000000);
 assert.equal(new Date(r.expires_at)-new Date(r.spawned_at),86400000);
}));
test('生成成功・再送・拒否でユーザー全行と所持資産は不変',()=>isolated(async()=>{
 await admin();const snapshot=await value('select jsonb_agg(u order by id) as value from users u');await asUser();
 const id=randomUUID();await create('beginner','BOSS_A',id);await create('beginner','BOSS_A',id);await rejected(()=>create('unknown'));
 await admin();assert.deepEqual(await value('select jsonb_agg(u order by id) as value from users u'),snapshot);
}));
test('認証無し・プロフィール無し・Lv4・LvNULLは拒否、Lv5は許可',()=>isolated(async()=>{
 await asUser(null);await rejected(()=>create(),'42501');await asUser(99);await rejected(()=>create(),'42501');
 for(const level of [4,null]){await admin();await db.query('update users set level=$1 where id=$2',[level,uid(1)]);await asUser();await rejected(()=>create(),'42501');}
 await admin();await db.query('update users set level=5 where id=$1',[uid(1)]);await asUser();assert.ok((await create()).roomId);
}));
test('anonは生成RPCの実行権限なし',()=>isolated(async()=>{
 await admin();await db.exec('set local role anon');await rejected(()=>create(),'42501');
}));
for(const [difficulty,threshold] of [['intermediate',160000],['advanced',200000],['expert',240000]])test(`${difficulty}下限直前拒否、一致と直後成功`,()=>isolated(async()=>{
 for(const power of [threshold-1,threshold,threshold+1]){
 await admin();await db.query('update creation_fixture_power set power=$1 where user_id=$2',[power,uid(1)]);await asUser();
 if(power<threshold)await rejected(()=>create(difficulty),'42501');else assert.ok((await create(difficulty)).roomId);
 }
}));
test('非初級はpower不明・負・空編成を拒否、初級は総合力制限なし',()=>isolated(async()=>{
 for(const power of [null,-1]){await admin();await db.query('update creation_fixture_power set power=$1 where user_id=$2',[power,uid(1)]);await asUser();await rejected(()=>create('intermediate'),'42501');}
 await admin();await db.exec('delete from user_main_formations');await asUser();await rejected(()=>create('intermediate'),'42501');assert.ok((await create()).roomId);
}));
test('NULL/未知難度・未知/非公開boss・NULLrequestを拒否',()=>isolated(async()=>{
 for(const args of [[null,'BOSS_A'],['unknown','BOSS_A'],['beginner',null],['beginner','missing'],['beginner','DISABLED'],['beginner','BOSS_A',null]])await rejected(()=>create(...args));
 assert.equal(await count('raid_bosses'),0);
}));
test('同request再送は同一Room、難度またはboss差替えを拒否',()=>isolated(async()=>{
 const id=randomUUID();const first=await create('beginner','BOSS_A',id);assert.equal((await create('beginner','BOSS_A',id)).roomId,first.roomId);
 await rejected(()=>create('expert','BOSS_A',id),'22023');await rejected(()=>create('beginner','BOSS_B',id),'22023');assert.equal(await count('raid_rooms'),1);
}));
test('同requestを別ユーザーが使っても所有者のRoomを返さない',()=>isolated(async()=>{
 const id=randomUUID();const first=await create('beginner','BOSS_A',id);await asUser(2);const second=await create('beginner','BOSS_A',id);assert.notEqual(second.roomId,first.roomId);
 await admin();assert.equal(await value('select owner_user_id as value from raid_rooms where id=$1',[second.roomId]),uid(2));
}));
test('撃破後再送は新Roomを作らず元Roomを返す',()=>isolated(async()=>{
 const id=randomUUID();const first=await create('beginner','BOSS_A',id);await admin();await db.query("update raid_bosses set current_hp=0,status='DEFEATED' where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[first.roomId]);await asUser();assert.equal((await create('beginner','BOSS_A',id)).roomId,first.roomId);assert.equal(await count('raid_rooms'),1);
}));
test('難度ごとの同時開催上限、超過失敗は孤立bossを残さない',()=>isolated(async()=>{
 for(const difficulty of ['beginner','intermediate','advanced','expert']){
 const limit=difficulty==='expert'?5:10;for(let i=0;i<limit;i++)await create(difficulty);
 const before=await count('raid_bosses');await rejected(()=>create(difficulty));assert.equal(await count('raid_bosses'),before);
 }
}));
test('期限経過したRoomは開催上限から外れ、新規生成可能',()=>isolated(async()=>{
 for(let i=0;i<10;i++)await create();await admin();await db.exec('update raid_bosses set expires_at=clock_timestamp()');await asUser();assert.ok((await create()).roomId);
}));
test('親transaction rollbackでboss/Room/owner台帳を一括取消',async()=>{
 await isolated(async()=>{await create();});for(const t of ['raid_bosses','raid_rooms','raid_room_members'])assert.equal(await value(`select count(*)::int as value from ${t}`),0);
});
test('公開boss候補はDB公開フラグで絞り込む',()=>isolated(async()=>{
 const dto=await value('select list_raid_room_boss_choices_v1() as value');assert.deepEqual(dto.choices.map(c=>c.raidVariantId).sort(),['BOSS_A','BOSS_B']);
}));
test('設定・request台帳は公開ロールから変更不可、RPCはdefiner/search_path固定',()=>isolated(async()=>{
 await admin();
 for(const role of ['anon','authenticated','service_role','lifecycle_public_probe'])for(const table of ['raid_room_creation_settings','raid_room_creation_requests'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,table,privilege]),false);
 const rows=(await db.query("select prosecdef,proconfig from pg_proc where proname in ('create_raid_room_v1','list_raid_room_boss_choices_v1')")).rows;
 assert.equal(rows.length,2);for(const r of rows){assert.equal(r.prosecdef,true);assert.ok(r.proconfig.includes('search_path=pg_catalog'));}
 await asUser();await rejected(()=>db.exec('update raid_room_creation_settings set enabled=false'),'42501');
}));
test('生成停止後は既存request再送も拒否し記録を増やさない',()=>isolated(async()=>{
 const id=randomUUID();await create('beginner','BOSS_A',id);await admin();await db.exec('update raid_room_creation_settings set enabled=false');await asUser();await rejected(()=>create('beginner','BOSS_A',id),'55000');
 assert.equal(await count('raid_room_creation_requests'),1);assert.equal(await count('raid_bosses'),1);
}));
test('旧boss_master参照欠落はFKで失敗しboss/Room/requestを残さない',()=>isolated(async()=>{
 await admin();await db.exec("delete from raid_boss_master where id='BOSS_A'");await asUser();await rejected(()=>create(),'23503');
 for(const t of ['raid_bosses','raid_rooms','raid_room_creation_requests'])assert.equal(await count(t),0);
}));
