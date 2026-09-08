import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bootstrap,Client,user,value,uid,root} from './pg-harness.mjs';
const {db,config,database}=await bootstrap();const results=[];
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
const admin=()=>db.query('reset role');
const top=()=>value(db,'select public.get_raid_top_v1() value');
const choices=()=>value(db,'select public.list_raid_room_boss_choices_v1() value');
const create=(variant,request=randomUUID())=>value(db,"select public.create_raid_room_v1('beginner',$1,$2) value",[variant,request]);
const request=room=>value(db,'select public.request_raid_room_rescue_v1($1,$2) value',[room,randomUUID()]);
const joinRescue=id=>value(db,'select public.join_raid_room_rescue_v1($1) value',[id]);
const setGuild=async(n,g)=>{await admin();await db.query('delete from guild_members where user_id=$1',[uid(n)]);if(g)await db.query('insert into guild_members values($1,$2)',[uid(n),uid(100+g)]);await user(db,n);};
try{
 await admin();await db.query('update raid_room_creation_settings set enabled=true;update raid_room_rescue_settings set enabled=true');
 await check('同時12要求・異なるユーザーでも日次2エリアが一致し正本1行',async()=>{
  const snapshots=await Promise.all(Array.from({length:12},async(_,i)=>{const c=new Client(config);await c.connect();try{await user(c,i+1);return await value(c,'select public.get_raid_top_v1() value');}finally{await c.end();}}));
  for(const s of snapshots)assert.deepEqual(s.dailyTargets,snapshots[0].dailyTargets);
  assert.equal(new Set(snapshots[0].dailyTargets.data.targets.map(t=>t.variantId)).size,2);
  assert.equal(await value(db,'select count(*)::int value from private.raid_daily_targets'),1);
 });
 await user(db,1);
 await check('空一覧readyは0件、匿名/偽ユーザーは認証失敗',async()=>{
  const s=await top();assert.deepEqual(s.participating,{status:'ready',data:[]});assert.deepEqual(s.rescues,{status:'ready',data:[]});
  await user(db,null);await assert.rejects(top,e=>e.code==='42501');await user(db,999);await assert.rejects(top,e=>e.code==='42501');await user(db,1);
 });
 let originalRoom,originalVariant,originalRequest;
 await check('選択肢とtopの日次正本一致・対象外新規拒否・対象内受付',async()=>{
  const s=await top(),ids=s.dailyTargets.data.targets.map(t=>t.variantId);assert.deepEqual((await choices()).choices.map(c=>c.raidVariantId).sort(),ids.slice().sort());
  await admin();const outside=await value(db,'select raid_variant_id value from canonical_raid_variants where not(raid_variant_id=any($1::text[])) limit 1',[ids]);await user(db,1);
  await assert.rejects(()=>create(outside),e=>e.code==='22023');originalVariant=ids[0];originalRequest=randomUUID();originalRoom=await create(originalVariant,originalRequest);
  assert.deepEqual(await create(originalVariant,originalRequest),originalRoom);
 });
 await check('参加者・owner所属・顔最大5・本人roleの一括投影',async()=>{
  await setGuild(1,1);await admin();await db.query('insert into raid_room_members(room_id,user_id) select $1,id from users where id=any($2::uuid[]) on conflict do nothing',[originalRoom.roomId,[2,3,4,5,6,7].map(uid)]);await user(db,1);
  let s=await top();const e=s.participating.data.find(e=>e.room.roomId===originalRoom.roomId);assert.equal(e.membership.value,'owner');assert.equal(e.room.participantCount.value,7);assert.equal(e.participants.value.length,5);assert.equal(e.ownerGuild.value.guildId,uid(101));
  await user(db,2);s=await top();assert.equal(s.participating.data[0].membership.value,'member');await user(db,1);
 });
 let publication;
 await check('最新閲覧可能救援1件/Guild非所属はACTIVITYへ、同GuildのみGUILD',async()=>{
  const a=await request(originalRoom.roomId);publication=a.publications.find(p=>p.channel==='ACTIVITY');await admin();await db.query("update raid_room_rescue_publications set created_at=clock_timestamp()+interval '1 second' where room_id=$1 and channel='GUILD'",[originalRoom.roomId]);await user(db,8);
  let s=await top();assert.equal(s.rescues.data.length,1);assert.equal(s.rescues.data[0].rescue.value.rescueId,publication.rescueId);assert.equal(s.rescues.data[0].rescue.value.scope,'ACTIVITY');
  await setGuild(8,1);s=await top();assert.equal(s.rescues.data.length,1);assert.equal(s.rescues.data[0].rescue.value.scope,'GUILD');assert.equal(s.rescues.data[0].rescue.value.guildId,uid(101));
  await setGuild(8,2);s=await top();assert.equal(s.rescues.data[0].rescue.value.scope,'ACTIVITY');
 });
 await check('非所属Guildリンク閲覧と参加拒否・救援参加role保持',async()=>{
  await admin();const guildId=await value(db,"select id value from raid_room_rescue_publications where room_id=$1 and channel='GUILD'",[originalRoom.roomId]);await user(db,8);
  await assert.rejects(()=>value(db,'select public.get_raid_room_rescue_v1($1) value',[guildId]),e=>e.code==='42501');await assert.rejects(()=>joinRescue(guildId),e=>e.code==='42501');
  await joinRescue(publication.rescueId);const s=await top();assert.equal(s.participating.data.find(e=>e.room.roomId===originalRoom.roomId).membership.value,'rescue');
  const out=resolve(root,'outputs/raid-top-data');await mkdir(out,{recursive:true});await writeFile(resolve(out,'actual-pg-snapshot.json'),JSON.stringify(s,null,2));
 });
 await check('JST境界・日跨ぎ成功再送・前日の参加と救援は日次対象外でも継続',async()=>{
  await admin();const definition=await value(db,"select pg_get_functiondef('private.raid_daily_targets_v1()'::regprocedure) value");
  await db.query("create function public.raid_top_test_clock() returns timestamptz language sql volatile as $$select coalesce(nullif(current_setting('raid_top.test_clock',true), '')::timestamptz,clock_timestamp())$$");
  const createDefinition=await value(db,"select pg_get_functiondef('public.create_raid_room_v1(text,text,uuid)'::regprocedure) value");
  await db.query(definition.replaceAll('clock_timestamp()','public.raid_top_test_clock()'));await db.query(createDefinition.replaceAll('clock_timestamp()','public.raid_top_test_clock()'));
  try{
   await user(db,1);await db.query("select set_config('raid_top.test_clock','2030-01-01T14:59:59Z',false)");assert.equal((await top()).dailyTargets.data.dateJst,'2030-01-01');
   await db.query("select set_config('raid_top.test_clock','2030-01-01T15:00:00Z',false)");assert.equal((await top()).dailyTargets.data.dateJst,'2030-01-02');
   await admin();const alternatives=(await db.query('select raid_variant_id,area_id from canonical_raid_variants where raid_variant_id<>$1 order by raid_variant_id limit 2',[originalVariant])).rows;
   await db.query("update private.raid_daily_targets set first_variant_id=$1,first_area_id=$2,second_variant_id=$3,second_area_id=$4 where date_jst='2030-01-02'",[alternatives[0].raid_variant_id,alternatives[0].area_id,alternatives[1].raid_variant_id,alternatives[1].area_id]);await user(db,1);
   const replayed=await create(originalVariant,originalRequest);assert.equal(replayed.roomId,originalRoom.roomId);assert.deepEqual(replayed.createdAt,originalRoom.createdAt);assert.deepEqual(replayed.expiresAt,originalRoom.expiresAt);await assert.rejects(()=>create(originalVariant),e=>e.code==='22023');
   await admin();await db.query("update raid_bosses set spawned_at=(date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')-interval '1 second',expires_at=(date_trunc('day',clock_timestamp() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')+interval '24 hours'-interval '1 second' where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[originalRoom.roomId]);await db.query("update raid_rooms set created_at=(select spawned_at from raid_bosses where id=raid_rooms.raid_boss_instance_id) where id=$1",[originalRoom.roomId]);
   await user(db,9);await value(db,'select public.register_raid_room_v1($1) value',[originalRoom.roomId]);assert.ok((await top()).participating.data.some(e=>e.room.roomId===originalRoom.roomId));
   await user(db,10);await joinRescue(publication.rescueId);assert.ok((await top()).participating.data.some(e=>e.room.roomId===originalRoom.roomId));
  }finally{await admin();await db.query(definition);await db.query(createDefinition);await db.query("select set_config('raid_top.test_clock','',false)");await db.query('drop function public.raid_top_test_clock()');}
 });
 await check('20件上限・撃破/HP0/期限終了をトップから除外、元期限は24時間',async()=>{
  await user(db,1);const id=(await choices()).choices[0].raidVariantId;const rooms=[];for(let i=31;i<54;i++){await user(db,i);const r=await value(db,"select public.create_raid_room_v1($1,$2,$3) value",[["beginner","intermediate","advanced"][i%3],id,randomUUID()]);rooms.push(r);await request(r.roomId);await admin();await db.query('insert into raid_room_members(room_id,user_id) values($1,$2) on conflict do nothing',[r.roomId,uid(1)]);}
  await user(db,1);assert.equal((await top()).participating.data.length,20);await user(db,30);assert.equal((await top()).rescues.data.length,20);await admin();
  const span=await value(db,'select extract(epoch from (expires_at-spawned_at))::int value from raid_bosses where id=(select raid_boss_instance_id from raid_rooms where id=$1)',[originalRoom.roomId]);assert.equal(span,86400);
  await db.query("update raid_bosses set current_hp=0 where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[originalRoom.roomId]);await user(db,8);assert.ok(!(await top()).participating.data.some(e=>e.room.roomId===originalRoom.roomId));assert.ok(!(await top()).rescues.data.some(e=>e.room.roomId===originalRoom.roomId));
  await admin();await db.query("update raid_bosses set expires_at=clock_timestamp()-interval '1 second' where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[rooms[0].roomId]);await user(db,1);assert.ok(!(await top()).participating.data.some(e=>e.room.roomId===rooms[0].roomId));
 });
 await check('authenticated/anonのprivate table書込と内部日次直接呼出しを拒否',async()=>{
  await user(db,1);await assert.rejects(()=>db.query('select * from private.raid_daily_targets'),e=>e.code==='42501');await assert.rejects(()=>db.query('delete from private.raid_daily_targets'),e=>e.code==='42501');await assert.rejects(()=>db.query('select private.raid_daily_targets_v1()'),e=>e.code==='42501');
  await admin();await db.query('set role anon');await assert.rejects(top,e=>e.code==='42501');await admin();
 });
 await check('日次master不足は55000失敗で空readyを返さず、テストclockは復元済み',async()=>{
  await admin();assert.equal(await value(db,"select count(*)::int value from pg_proc where pronamespace in ('private'::regnamespace,'public'::regnamespace) and (prosrc like '%raid_top_test_clock%' or proname='raid_top_test_clock')"),0);
  await db.query('begin');try{await db.query('delete from private.raid_daily_targets');await db.query("update canonical_raid_variants set is_production_enabled=false where area_id='SHINJUKU'");await user(db,1);await assert.rejects(top,e=>e.code==='55000');}finally{await db.query('rollback');await admin();}
 });
 const out=resolve(root,'outputs/raid-top-data');await mkdir(out,{recursive:true});await writeFile(resolve(out,'pg-report.json'),JSON.stringify({database,engine:'PostgreSQL 17 isolated localhost 55462',results,limitation:'Minimal existing schema fixture; no PostgREST/GoTrue. Boundary clock replacement only inside test DB and restored.'},null,2));
 console.log(JSON.stringify({database,passed:results.length}));
}finally{await db.end();}
