import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(process.env.RAID_TEST_RUNTIME ? resolve(process.env.RAID_TEST_RUNTIME, 'package.json') : resolve(root, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const owner=id(1), member=id(2), stranger=id(3), room=id(10), room2=id(11), boss=id(20), boss2=id(21), guildNow=id(30), guildThen=id(31);
const queryValue = async sql => (await db.query(sql)).rows[0].value;
async function asUser(user, sql, role='authenticated') {
  await db.exec(`begin read only; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user ?? '']);
    return await queryValue(sql);
  } finally { await db.exec('rollback'); }
}
before(async () => {
  await db.exec(readFileSync(new URL('./raid-room-read-projection-fixture.sql', import.meta.url),'utf8'));
  const migrations=resolve(root,'supabase/migrations');
  const target=readdirSync(migrations).filter(n=>n.includes('00250'));
  assert.equal(target.length,1,'00250 migration一意');
  await db.exec(readFileSync(resolve(migrations,target[0]),'utf8'));
  await db.exec(`
    insert into users values ('${owner}','Owner'),('${member}','Member'),('${stranger}','Stranger');
    insert into raid_bosses values ('${boss}',600,1000,'ACTIVE','2030-01-01',null),('${boss2}',0,2000,'CLEARED','2030-01-01','2026-09-08');
    insert into raid_rooms(id,raid_boss_instance_id,owner_user_id,difficulty_id,created_at) values
      ('${room}','${boss}','${owner}','intermediate','2026-09-08'),('${room2}','${boss2}','${owner}','expert','2026-09-07');
    insert into raid_instance_user_progress values ('${boss}','${member}',2),('${boss2}','${member}',1),('${boss}','${stranger}',0);
    insert into guilds values ('${guildNow}','Now'),('${guildThen}','Then');
    insert into guild_members values ('${member}','${guildNow}');
    insert into raid_damage_logs values
      ('${id(40)}','${boss}','${member}',null,100,90,'2026-09-07'),
      ('${id(41)}','${boss}','${member}','${guildThen}',300,250,'2026-09-08'),
      ('${id(42)}','${boss2}','${member}','${guildNow}',900,800,'2026-09-08');
  `);
  console.log('SQL engine:',await queryValue('select version() as value'));
});
after(async()=>db.close());

test('Owner・確定参加者は閲覧でき、Room参加記録なしの第三者は一覧非公開',async()=>{
  for(const user of [owner,member]) {
    const v=await asUser(user,`select get_raid_room_v1('${room}') as value`);
    assert.equal(v.roomId,room); assert.equal(v.serverEligibility.status,'unknown');
    assert.equal(v.participantCount.value,2); assert.equal(v.hp.value.current,600);
  }
  const v=await asUser(stranger,'select list_raid_rooms_v1() as value'); assert.deepEqual(v.rooms,[]);
});
test('不存在・権限なしは同一エラー、authなし拒否',async()=>{
  for(const target of [room,id(99)]) await assert.rejects(asUser(stranger,`select get_raid_room_v1('${target}') as value`),e=>e.code==='P0002');
  await assert.rejects(asUser(null,'select list_raid_rooms_v1() as value'),e=>e.code==='42501');
  await assert.rejects(asUser(null,'select list_raid_rooms_v1() as value','anon'),e=>e.code==='42501');
});
test('直SELECT/INSERT/内部helperをauthenticatedへ公開しない',async()=>{
  for(const sql of ['select count(*) as value from raid_rooms',`select raid_room_projection_v1('${room}') as value`,`select raid_room_can_read_v1('${room}') as value`])
    await assert.rejects(asUser(member,sql),e=>e.code==='42501');
  const grants=await queryValue("select has_table_privilege('authenticated','raid_rooms','INSERT') as value"); assert.equal(grants,false);
  assert.equal(await queryValue("select relrowsecurity as value from pg_class where oid='raid_rooms'::regclass"),true);
});
test('Room別集計・raw/applied分離・現在所属と最後確定戦所属を保持',async()=>{
  const v=await asUser(owner,`select get_raid_room_participants_v1('${room}') as value`);
  assert.equal(v.participants.length,2);const p=v.participants.find(p=>p.player.userId===member);
  assert.equal(p.finalizedBattles.value,2); assert.equal(p.rawDamage.value,400); assert.equal(p.appliedDamage.value,340);
  assert.equal(p.currentGuild.value.guildId,guildNow);assert.equal(p.battleGuildSnapshot.value.guildId,guildThen);
  assert.equal(p.player.leaderIconUrl.status,'unknown');
  const q=await asUser(member,`select get_raid_room_participants_v1('${room2}') as value`);assert.equal(q.participants.find(p=>p.player.userId===member).rawDamage.value,900);
});
test('list難度filter・pagination・不正引数',async()=>{
  const first=await asUser(owner,'select list_raid_rooms_v1(null,1,0) as value');assert.equal(first.nextOffset,1);assert.equal(first.rooms[0].roomId,room);
  const last=await asUser(owner,'select list_raid_rooms_v1(null,1,1) as value');assert.equal(last.nextOffset,null);assert.equal(last.rooms[0].roomId,room2);
  const filtered=await asUser(owner,"select list_raid_rooms_v1('expert') as value");assert.equal(filtered.rooms.length,1);
  for(const args of ["'normal',20,0","null,0,0","null,20,-1","null,101,0"])
    await assert.rejects(asUser(owner,`select list_raid_rooms_v1(${args}) as value`),e=>e.code==='22023');
});
test('READ ONLY参照後もHP・log・Roomが不変',async()=>{
  const snapshot=()=>queryValue("select jsonb_build_object('boss',(select jsonb_agg(b) from raid_bosses b),'logs',(select jsonb_agg(l) from raid_damage_logs l),'rooms',(select jsonb_agg(r) from raid_rooms r)) as value");
  const before=await snapshot();await asUser(owner,'select list_raid_rooms_v1() as value');await asUser(member,`select get_raid_room_participants_v1('${room}') as value`);assert.deepEqual(await snapshot(),before);
});
test('SQL実応答をB adapterが受理、参照のみで参加許可を返さない',async()=>{
  const {createRaidRoomRpcTransport}=await import('../../src/domain/raidRoomRpcTransport.ts');
  const rpc=async(name,args={})=>{
    let sql;
    if(name==='list_raid_rooms_v1') sql=`select list_raid_rooms_v1(null,${args.p_limit},${args.p_offset}) as value`;
    else if(name==='get_raid_room_v1') sql=`select get_raid_room_v1('${args.p_room_id}') as value`;
    else if(name==='get_raid_room_participants_v1') sql=`select get_raid_room_participants_v1('${args.p_room_id}',${args.p_limit},${args.p_offset}) as value`;
    else throw Error('unexpected RPC');
    return {data:await asUser(member,sql),error:null};
  };
  const transport=createRaidRoomRpcTransport({rpc});assert.equal((await transport.listRooms()).length,2);
  assert.equal((await transport.getRoom(room)).serverEligibility.status,'unknown');assert.equal((await transport.listParticipants(room)).find(p=>p.player.userId===member).rawDamage.value,400);
  await assert.rejects(transport.joinRoom({roomId:room}));await assert.rejects(transport.getRewards(room));
});

test('参加記録あり未確定のメンバーを表示・閲覧し、Damage不在はunknown',async()=>{
  await db.exec(`insert into raid_room_members(room_id,user_id) values ('${room}','${stranger}')`);
  try {
    const detail=await asUser(stranger,`select get_raid_room_v1('${room}') as value`);assert.equal(detail.participantCount.value,3);
    const response=await asUser(stranger,`select get_raid_room_participants_v1('${room}') as value`);
    const pending=response.participants.find(p=>p.player.userId===stranger);
    assert.equal(pending.finalizedBattles.value,0);assert.equal(pending.rawDamage.status,'unknown');assert.equal(pending.appliedDamage.status,'unknown');
    assert.equal(pending.battleGuildSnapshot.status,'unknown');
    const ownerEntry=response.participants.find(p=>p.player.userId===owner);assert.ok(ownerEntry);
    assert.equal(ownerEntry.finalizedBattles.value,0);
  } finally { await db.exec(`delete from raid_room_members where room_id='${room}' and user_id='${stranger}'`); }
});
test('期限超過ACTIVEとHP0 ACTIVEを開催中として表示しない、READ ONLYで永続状態不変',async()=>{
  await db.exec(`update raid_bosses set expires_at='2000-01-01' where id='${boss}'`);
  try {
    const expired=await asUser(owner,`select get_raid_room_v1('${room}') as value`);assert.equal(expired.state.value,'expired');
    assert.equal(await queryValue(`select status as value from raid_bosses where id='${boss}'`),'ACTIVE');
    await db.exec(`update raid_bosses set current_hp=0 where id='${boss}'`);
    const pending=await asUser(owner,`select get_raid_room_v1('${room}') as value`);assert.equal(pending.state.status,'unknown');
  } finally { await db.exec(`update raid_bosses set expires_at='2030-01-01',current_hp=600 where id='${boss}'`); }
});
