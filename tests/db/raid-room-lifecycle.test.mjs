import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(resolve(process.env.RAID_TEST_RUNTIME??root,'package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const migration=readFileSync(resolve(root,'supabase/migrations/20260908000252_raid_room_lifecycle.sql'),'utf8');
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const register=(id,owner=uid(1),difficulty='beginner')=>value('select public._raid_room_register_v1($1::uuid,$2::uuid,$3::text) as value',[id,owner,difficulty]);
const join=(room,user=uid(2))=>value('select public._raid_room_add_member_v1($1::uuid,$2::uuid) as value',[room,user]);
async function isolated(fn,setup='') { await db.exec(`begin; ${setup}`); try {await fn();} finally {await db.exec('rollback');} }
async function rejected(fn,code) { await db.exec('savepoint expected_error'); try {await assert.rejects(fn,e=>!code||e.code===code);} finally {await db.exec('rollback to savepoint expected_error; release savepoint expected_error');} }
async function boss(overrides={}) {
 const id=await value("insert into public.raid_bosses(id,current_hp,max_hp,status,spawned_at,expires_at) values(gen_random_uuid(),1000,1000,'ACTIVE',now()-interval '1 hour',now()+interval '23 hours') returning id as value");
 for(const [column,expression] of Object.entries(overrides)) await db.query(`update public.raid_bosses set ${column}=${expression} where id=$1`,[id]);
 return id;
}
async function room(difficulty='beginner') {const id=await boss(); return {id,...await register(id,uid(1),difficulty)};}
before(async()=>{
 await db.exec(readFileSync(new URL('./raid-room-read-projection-fixture.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('./raid-room-lifecycle-fixture.sql',import.meta.url),'utf8'));
 for(const path of ['20260908000250_raid_room_read_projection.sql','20260908000251_raid_room_condition_rules.sql']) await db.exec(readFileSync(resolve(root,'supabase/migrations',path),'utf8'));
 await db.exec(migration);
 console.log('SQL engine:',await value('select version() as value'));
});
after(()=>db.close());
test('4難度seedは10/10/10/5、20人、24時間',async()=>{
 const rows=(await db.query('select * from public.raid_room_lifecycle_rules order by difficulty')).rows;
 assert.equal(rows.length,4);
 for(const r of rows){assert.equal(r.max_active_rooms,r.difficulty==='expert'?5:10);assert.equal(r.member_capacity,20);assert.equal(r.duration_hours,24);}
});
test('未使用Instance登録は24時間を保持しownerを参加者projectionへ反映',()=>isolated(async()=>{
 const r=await room();assert.equal(r.status,'registered');
 assert.equal(await value('select extract(epoch from expires_at-spawned_at)::int as value from raid_bosses where id=$1',[r.id]),86400);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);
 const dto=await value('select get_raid_room_v1($1) as value',[r.roomId]);
 assert.equal(dto.participantCount.value,1);assert.equal(dto.state.value,'active');
 assert.equal(dto.serverEligibility.status,'unknown');
}));
test('24時間以外・未来開始・期限切れ・撃破・HP不正を登録拒否',()=>isolated(async()=>{
 for(const overrides of [{expires_at:"spawned_at+interval '25 hours'"},{spawned_at:"now()+interval '1 hour'",expires_at:"now()+interval '25 hours'"},{spawned_at:"now()-interval '24 hours'",expires_at:'now()'},{status:"'CLEARED'"},{status:"'EXPIRED'"},{current_hp:'0'},{current_hp:'999'},{max_hp:'0',current_hp:'0'},{expires_at:'null'},{spawned_at:'null'}]){
  const id=await boss(overrides); await rejected(()=>register(id));
  assert.equal(await value('select count(*)::int as value from raid_rooms where raid_boss_instance_id=$1',[id]),0);
 }
}));
test('既存進捗またはDamageログのあるInstanceを新Roomへ転用しない',()=>isolated(async()=>{
 for(const kind of ['progress','log']){const id=await boss();
 if(kind==='progress') await db.query('insert into raid_instance_user_progress values($1,$2,0)',[id,uid(1)]);
 else await db.query('insert into raid_damage_logs values(gen_random_uuid(),$1,$2,null,0,0,now())',[id,uid(1)]);
 await rejected(()=>register(id));}
}));
test('登録再送は終了後も同じID、所有者・難度変更は拒否',()=>isolated(async()=>{
 const r=await room();await db.query("update raid_bosses set status='CLEARED',current_hp=0 where id=$1",[r.id]);
 assert.deepEqual(await register(r.id),{roomId:r.roomId,status:'already_registered'});
 await rejected(()=>register(r.id,uid(2)));await rejected(()=>register(r.id,uid(1),'expert'));
 assert.equal(await value('select count(*)::int as value from raid_rooms'),1);
}));
test('全難度の開催上限直前・一致・超過、難度間を独立集計',()=>isolated(async()=>{
 for(const difficulty of ['beginner','intermediate','advanced','expert']){
 const limit=difficulty==='expert'?5:10;
 for(let i=0;i<limit;i++) assert.equal((await room(difficulty)).status,'registered');
 const extra=await boss();await rejected(()=>register(extra,uid(1),difficulty));
 assert.equal(await value('select count(*)::int as value from raid_rooms where difficulty_id=$1',[difficulty]),limit);
 }
}));
test('撃破・期限終了・ACTIVE期限超過・HP0を開催数から除外',()=>isolated(async()=>{
 for(let i=0;i<10;i++) await room();
 for(const change of ["status='CLEARED',current_hp=0","status='EXPIRED'","expires_at=now()","current_hp=0"]){
 await db.exec(`update raid_bosses set ${change} where id=(select b.id from raid_bosses b join raid_rooms r on r.raid_boss_instance_id=b.id where b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() limit 1)`);
 assert.equal((await room()).status,'registered');
 }
 assert.equal(await value('select count(*)::int as value from raid_rooms'),14);
}));
test('参加19→20人まで成功、21人目拒否・既参加再送は成功',()=>isolated(async()=>{
 const r=await room();for(let n=2;n<=20;n++)assert.equal((await join(r.roomId,uid(n))).status,'joined');
 await rejected(()=>join(r.roomId,uid(21)));
 assert.equal((await join(r.roomId,uid(20))).status,'already_joined');
 assert.equal((await join(r.roomId,uid(1))).status,'already_joined');
 assert.equal(await value('select raid_room_projection_v1($1)->\'participantCount\'->\'value\' as value',[r.roomId]),20);
}));
test('owner/member/finalized progressのUNIONで定員計算、重複は一人',()=>isolated(async()=>{
 const r=await room();await join(r.roomId,uid(2));
 for(let n=1;n<=19;n++)await db.query('insert into raid_instance_user_progress values($1,$2,1)',[r.id,uid(n)]);
 assert.equal((await join(r.roomId,uid(20))).status,'joined');
 await rejected(()=>join(r.roomId,uid(21)));
 assert.equal((await join(r.roomId,uid(3))).status,'joined');
 assert.equal((await join(r.roomId,uid(3))).status,'already_joined');
 assert.equal(await value('select raid_room_projection_v1($1)->\'participantCount\'->\'value\' as value',[r.roomId]),20);
}));
test('未確定progressは定員を消費せず、加入後は一人',()=>isolated(async()=>{
 const r=await room();await db.query('insert into raid_instance_user_progress values($1,$2,0)',[r.id,uid(2)]);
 assert.equal((await join(r.roomId)).status,'joined');
 assert.equal(await value('select raid_room_projection_v1($1)->\'participantCount\'->\'value\' as value',[r.roomId]),2);
}));
test('終了Roomへの新規参加は拒否、既参加の終了後再送は書込なし',()=>isolated(async()=>{
 for(const change of ["status='CLEARED',current_hp=0","status='EXPIRED'","expires_at=now()","current_hp=0"]){
 const r=await room();await join(r.roomId);
 await db.query(`update raid_bosses set ${change} where id=$1`,[r.id]);
 const before=await value('select jsonb_agg(m order by user_id) as value from raid_room_members m where room_id=$1',[r.roomId]);
 await rejected(()=>join(r.roomId,uid(3)));
 assert.equal((await join(r.roomId)).status,'already_joined');
 assert.deepEqual(await value('select jsonb_agg(m order by user_id) as value from raid_room_members m where room_id=$1',[r.roomId]),before);
 }
}));
test('NULL/不明ID/不明難度/不存在userを拒否し孤立台帳を作らない',()=>isolated(async()=>{
 const id=await boss();
 for(const args of [[null,uid(1),'beginner'],[uid(99),uid(1),'beginner'],[id,null,'beginner'],[id,uid(99),'beginner'],[id,uid(1),null],[id,uid(1),'unknown']]) await rejected(()=>register(...args));
 const r=await register(id);
 for(const args of [[null,uid(1)],[uid(99),uid(1)],[r.roomId,null],[r.roomId,uid(99)]])await rejected(()=>join(...args));
 assert.equal(await value('select count(*)::int as value from raid_rooms'),1);
}));
test('認証roleとPUBLIC継承roleは内部関数の権限も実呼出しも拒否',()=>isolated(async()=>{
 for(const role of ['anon','authenticated','service_role','lifecycle_public_probe']) for(const [signature,sql] of [['_raid_room_register_v1(uuid,uuid,text)',"select _raid_room_register_v1(null,null,'beginner')"],['_raid_room_add_member_v1(uuid,uuid)','select _raid_room_add_member_v1(null,null)']]){
 assert.equal(await value("select has_function_privilege($1,$2,'EXECUTE') as value",[role,'public.'+signature]),false);
 await rejected(async()=>{await db.exec(`set local role ${role}`);await db.exec(sql);},'42501');
 }
}));
test('設定tableはRLS・default deny、内部関数はinvoker/pg_catalog',async()=>{
 for(const role of ['anon','authenticated','service_role','lifecycle_public_probe']) for(const p of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,'public.raid_room_lifecycle_rules',p]),false);
 assert.equal(await value("select relrowsecurity as value from pg_class where oid='raid_room_lifecycle_rules'::regclass"),true);
 for(const r of (await db.query("select prosecdef,proconfig from pg_proc where proname in ('_raid_room_register_v1','_raid_room_add_member_v1')")).rows){assert.equal(r.prosecdef,false);assert.ok(r.proconfig.includes('search_path=pg_catalog'));}
});
test('REPEATABLE READ/SERIALIZABLEでは両writerを拒否',async()=>{
 for(const level of ['repeatable read','serializable'])await isolated(async()=>{
 await rejected(()=>register(uid(99)),'25001');await rejected(()=>join(uid(99)),'25001');
 },`set transaction isolation level ${level};`);
});
test('親transaction rollbackはRoom/参加書込を一括取消',async()=>{
 const before=await value('select count(*)::int as value from raid_rooms');
 await isolated(async()=>{const r=await room();await join(r.roomId);});
 assert.equal(await value('select count(*)::int as value from raid_rooms'),before);
 assert.equal(await value('select count(*)::int as value from raid_room_members'),0);
});
test('設定変更は実際の上限・定員・期限に反映、未設定難度は拒否',()=>isolated(async()=>{
 await db.exec("update raid_room_lifecycle_rules set max_active_rooms=1,member_capacity=2,duration_hours=12 where difficulty='beginner'");
 const id=await boss({expires_at:"spawned_at+interval '12 hours'"});const r=await register(id);
 assert.equal((await join(r.roomId)).status,'joined');await rejected(()=>join(r.roomId,uid(3)));
 const id2=await boss({expires_at:"spawned_at+interval '12 hours'"});await rejected(()=>register(id2));
 await db.exec("delete from raid_room_lifecycle_rules where difficulty='beginner'");
 await rejected(()=>join(r.roomId,uid(3)));await rejected(()=>register(id2));
}));
test('transaction開始時刻より後でも実時計で期限を判定',()=>isolated(async()=>{
 const r=await room();
 // now()はtransaction開始時刻。実時計との差を作り、期限がnow()より未来でも過去なら拒否する。
 await db.query("update raid_bosses set expires_at=clock_timestamp()-interval '1 microsecond' where id=$1",[r.id]);
 assert.equal(await value('select expires_at>now() as value from raid_bosses where id=$1',[r.id]),true);
 await rejected(()=>join(r.roomId));
}));
test('再適用は調整済み設定を保持',async()=>{
 await db.exec("update raid_room_lifecycle_rules set max_active_rooms=7 where difficulty='expert'");
 await db.exec(migration);
 assert.equal(await value("select max_active_rooms as value from raid_room_lifecycle_rules where difficulty='expert'"),7);
});
