import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bootstrap, user, value, uid, root } from '../raid-top-data/pg-harness.mjs';
const { db, database } = await bootstrap();
const results = [];
const check = async (name, action) => { await action(); results.push({ name, status: 'PASS' }); };
try {
  await db.query(await readFile(resolve(root, 'supabase/migrations/20260908000262_raid_room_clear_rewards.sql'), 'utf8'));
  await db.query(await readFile(resolve(root, 'supabase/migrations/20260908181251_raid_room_display_projection.sql'), 'utf8'));
  await db.query('update raid_room_creation_settings set enabled=true; update raid_room_rescue_settings set enabled=true');
  await user(db, 1);
  const choices = await value(db, 'select list_raid_room_boss_choices_v1() value');
  const room = await value(db, "select create_raid_room_v1('beginner',$1,$2) value", [choices.choices[0].raidVariantId, randomUUID()]);
  const display = () => value(db, 'select get_raid_room_display_v1($1) value', [room.roomId]);
  await check('owner/no Guild and unconfigured plans are observed independently from issued Presents', async () => {
    const data = await display();
    assert.equal(data.membership, 'owner');
    assert.deepEqual(data.ownerGuild, { status: 'available', value: null });
    assert.equal(data.leaderCharacterIds[uid(1)], 'char_reiji_01');
    assert.deepEqual(data.clearPlan, { status: 'unconfigured', items: [] });
    assert.deepEqual(data.rescuePlan, { status: 'unconfigured', items: [] });
  });
  await check('outsider sees only owner leader; member/rescue roles use existing join authorities', async () => {
    await user(db, 2);
    assert.equal((await display()).membership, 'not_joined');
    assert.deepEqual(Object.keys((await display()).leaderCharacterIds), [uid(1)]);
    await value(db, 'select register_raid_room_v1($1) value', [room.roomId]);
    assert.equal((await display()).membership, 'member');
    await user(db, 1);
    const rescue = await value(db, 'select request_raid_room_rescue_v1($1,$2) value', [room.roomId, randomUUID()]);
    await user(db, 3);
    await value(db, 'select join_raid_room_rescue_v1($1) value', [rescue.publications[0].rescueId]);
    assert.equal((await display()).membership, 'rescue');
    assert.equal(Object.keys((await display()).leaderCharacterIds).length, 3);
    await user(db, 4);
    assert.deepEqual(Object.keys((await display()).leaderCharacterIds), [uid(1)]);
  });
  await check('configured plans have no Present identity/status and do not issue or mutate battle data', async () => {
    await db.query('reset role');
    await db.query("update raid_room_clear_reward_rules set enabled=true,minimum_contribution_damage=100 where difficulty='beginner'; insert into raid_room_clear_reward_items values('beginner','CASH',10); update raid_room_rescue_reward_rules set enabled=true where difficulty='beginner'; insert into raid_room_rescue_reward_items values('beginner','DIAMOND',2)");
    await db.query('insert into guild_members(user_id,guild_id) values($1,$2)', [uid(1), uid(101)]);
    const before = await value(db, "select jsonb_build_object('presents',(select count(*) from presents),'boss',(select to_jsonb(b) from raid_bosses b where id=$1),'members',(select count(*) from raid_room_members)) value", [room.roomId === '' ? null : (await value(db, 'select raid_boss_instance_id value from raid_rooms where id=$1', [room.roomId]))]);
    await user(db, 3);
    const data = await display();
    assert.deepEqual(data.clearPlan, { status: 'configured', items: [{ itemId: 'CASH', quantity: 10 }] });
    assert.deepEqual(data.rescuePlan, { status: 'configured', items: [{ itemId: 'DIAMOND', quantity: 2 }] });
    assert.equal(data.ownerGuild.value.guildId, uid(101));
    const out = resolve(root, 'outputs/raid-detail'); await mkdir(out, { recursive: true });
    await writeFile(resolve(out, 'actual-display.json'), JSON.stringify(data, null, 2));
    await db.query('reset role');
    const after = await value(db, "select jsonb_build_object('presents',(select count(*) from presents),'boss',(select to_jsonb(b) from raid_bosses b where id=(select raid_boss_instance_id from raid_rooms where id=$1)),'members',(select count(*) from raid_room_members)) value", [room.roomId]);
    assert.deepEqual(after, before);
  });
  await check('unknown room/anonymous/nonexistent user and private table reads are denied', async () => {
    await user(db, 1);
    await assert.rejects(() => value(db, 'select get_raid_room_display_v1($1) value', [randomUUID()]), error => error.code === 'P0002');
    await assert.rejects(() => db.query('select * from raid_room_clear_reward_items'), error => error.code === '42501');
    await user(db, null); await assert.rejects(display, error => error.code === '42501');
    await user(db, 999); await assert.rejects(display, error => error.code === '42501');
    await db.query('reset role; set role anon'); await assert.rejects(display, error => error.code === '42501');
  });
  const out = resolve(root, 'outputs/raid-detail'); await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'pg-report.json'), JSON.stringify({ database, results, scope: 'Isolated PG17 minimal surrounding fixture; real migrations and roles; no HTTP Auth/Preview' }, null, 2));
  console.log(JSON.stringify({ database, results }));
} finally { await db.end(); }
