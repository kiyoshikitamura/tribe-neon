import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bootstrap, user, value, uid, root } from '../raid-top-data/pg-harness.mjs';

// bootstrap creates a new database only after verifying the isolated PG17 identity.
const { db, database } = await bootstrap();
const results = [];
const check = async (name, action) => { await action(); results.push({ name, status: 'PASS' }); console.log('PASS', name); };
const admin = () => db.query('reset role');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const list = (offset = 0) => value(db, "select list_raid_room_cards_v1('beginner',$1) value", [offset]);
const rescues = ids => value(db, 'select get_raid_rescue_cards_v1($1) value', [ids]);
const enemy = id => value(db, "select get_raid_enemy_info_v1($1,'beginner') value", [id]);
const out = resolve(root, 'outputs/raid-step4');
try {
  const raid = await json('src/domain/gameplay/canonical/data/raid_production_20260830.json');
  const pool = await json('src/domain/gameplay/canonical/data/quest_enemy_pools_20260830.json');
  const skills = (await json('src/domain/gameplay/canonical/data/skills_20260821.json')).skills;
  for (const v of raid.variants) await db.query('update canonical_raid_variants set atk=$2,def=$3,spd=$4,member_character_ids=$5 where raid_variant_id=$1', [v.raidVariantId, v.atk, v.def, v.spd, JSON.stringify(v.memberCharacterIds)]);
  await db.query('delete from canonical_quest_enemy_pool_entries; delete from canonical_skill_master');
  for (const p of pool.entries) await db.query('insert into canonical_quest_enemy_pool_entries values($1,$2,$3,$4,$5,$6)', ['2026-08-30', p.characterId, p.difficulty, p.localAffinity === 'LOCAL', p.weight, JSON.stringify(p.skillLoadout)]);
  for (const s of skills) await db.query('insert into canonical_skill_master values($1,$2,$3,$4,$5,$6,$7,$8,$9)', ['2026-08-21', s.skill_id, s.exclusive_character_id, s.name, s.activation_type, s.cooldown, s.available_from_round, s.target, JSON.stringify(s.effects)]);
  for (const file of ['20260908000262_raid_room_clear_rewards.sql', '20260908181251_raid_room_display_projection.sql', '20260909023226_raid_remaining_pages_projection.sql']) await db.query(await readFile(resolve(root, 'supabase/migrations', file), 'utf8'));
  await db.query('update raid_room_creation_settings set enabled=true; update raid_room_rescue_settings set enabled=true');
  // Isolated fixture only: exceed the ordinary active-room limit to exercise page boundaries.
  await db.query("update raid_room_lifecycle_rules set max_active_rooms=30 where difficulty='beginner'");
  await user(db, 1);
  const variants = (await value(db, 'select list_raid_room_boss_choices_v1() value')).choices;
  const rooms = [];
  await check('empty then 21 active rooms produce bounded 20+1 pages without duplicate ids', async () => {
    assert.deepEqual(await list(), { entries: [], nextOffset: null });
    for (let n = 1; n <= 21; n++) { await user(db, n); rooms.push(await value(db, "select create_raid_room_v1('beginner',$1,$2) value", [variants[0].raidVariantId, randomUUID()])); }
    const first = await list(), second = await list(20);
    assert.equal(first.entries.length, 20); assert.equal(first.nextOffset, 20); assert.equal(second.entries.length, 1); assert.equal(second.nextOffset, null);
    assert.equal(new Set([...first.entries, ...second.entries].map(e => e.room.roomId)).size, 21);
    await mkdir(out, { recursive: true }); await writeFile(resolve(out, 'actual-list.json'), JSON.stringify(first, null, 2));
  });
  await check('authenticated roles, owner leader and current Guild project without inferred membership', async () => {
    await user(db, 1); let entry = (await list()).entries.find(e => e.room.roomId === rooms[0].roomId);
    if (!entry) entry = (await list(20)).entries.find(e => e.room.roomId === rooms[0].roomId);
    assert.equal(entry.membership.value, 'owner'); assert.equal(entry.room.owner.value.leaderCharacterId.value, 'char_reiji_01'); assert.deepEqual(entry.ownerGuild, { status: 'available', value: null });
    await user(db, 30); await value(db, 'select register_raid_room_v1($1) value', [rooms[0].roomId]);
    assert.equal([...((await list()).entries), ...((await list(20)).entries)].find(e => e.room.roomId === rooms[0].roomId).membership.value, 'member');
  });
  let activity, guild;
  await check('Guild publication is scoped to current membership; ACTIVITY remains accessible', async () => {
    await admin(); await db.query('insert into guild_members values($1,$2)', [uid(1), uid(101)]); await user(db, 1);
    const pubs = (await value(db, 'select request_raid_room_rescue_v1($1,$2) value', [rooms[0].roomId, randomUUID()])).publications;
    activity = pubs.find(p => p.channel === 'ACTIVITY').rescueId; guild = pubs.find(p => p.channel === 'GUILD').rescueId;
    await user(db, 29); assert.equal((await rescues([activity, guild])).entries.length, 1);
    await admin(); await db.query('insert into guild_members values($1,$2)', [uid(29), uid(101)]); await user(db, 29);
    assert.equal((await rescues([activity, guild])).entries.length, 2);
    await value(db, 'select join_raid_room_rescue_v1($1) value', [guild]); assert.equal((await rescues([guild])).entries[0].membership.value, 'rescue');
    await admin(); await db.query('update guild_members set guild_id=$2 where user_id=$1', [uid(29), uid(102)]); await user(db, 29);
    assert.equal((await rescues([guild])).entries.length, 0);
    await writeFile(resolve(out, 'actual-rescue.json'), JSON.stringify(await rescues([activity]), null, 2));
  });
  await check('expired and cleared raids leave active list while existing published links remain readable', async () => {
    await admin(); await db.query("update raid_bosses set expires_at=now()-interval '1 second' where id=(select raid_boss_instance_id from raid_rooms where id=$1)", [rooms[0].roomId]); await user(db, 29);
    assert.equal((await rescues([activity])).entries.length, 1); assert.equal((await list()).entries.some(e => e.room.roomId === rooms[0].roomId), false);
    await admin(); await db.query('update raid_bosses set current_hp=0 where id=(select raid_boss_instance_id from raid_rooms where id=$1)', [rooms[1].roomId]); await user(db, 29); assert.equal((await list()).entries.length, 19);
  });
  await check('seven official rosters each resolve five enemies and exact HARD override skill names', async () => {
    for (const v of raid.variants) {
      const info = await enemy(v.raidVariantId); assert.deepEqual(info.memberCharacterIds, v.memberCharacterIds);
      for (const id of v.memberCharacterIds) {
        const rows = pool.entries.filter(p => p.characterId === id && p.difficulty === 'HARD').sort((a,b) => Number(b.localAffinity === 'LOCAL') - Number(a.localAffinity === 'LOCAL') || b.weight - a.weight);
        const refs = rows[0]?.skillLoadout ?? skills.filter(s => s.exclusive_character_id === id).sort((a,b) => a.skill_id.localeCompare(b.skill_id)).slice(0,2).map(s => s.skill_id);
        const expected = refs.length || rows.length ? refs : skills.filter(s => s.exclusive_character_id === null).sort((a,b) => a.skill_id.localeCompare(b.skill_id)).slice(0,2).map(s => s.skill_id);
        assert.deepEqual(info.skillsByCharacterId[id], expected.map(id => ({ id, name: skills.find(s => s.skill_id === id).name })));
      }
    }
    await writeFile(resolve(out, 'actual-enemy.json'), JSON.stringify(await enemy(raid.variants[0].raidVariantId), null, 2));
  });
  await check('empty override, exclusive fallback, regular fallback and missing skill fail distinctly', async () => {
    const v = raid.variants[0], id = v.memberCharacterIds[0];
    await admin(); await db.query('begin');
    try {
      await db.query('delete from canonical_quest_enemy_pool_entries where character_id=$1', [id]);
      await db.query("insert into canonical_quest_enemy_pool_entries values('2026-08-30',$1,'HARD',true,999,'[]')", [id]); await user(db, 1); assert.deepEqual((await enemy(v.raidVariantId)).skillsByCharacterId[id], []);
      await admin(); await db.query('delete from canonical_quest_enemy_pool_entries where character_id=$1', [id]); await db.query("update canonical_skill_master set exclusive_character_id=$1 where skill_id='SKILL_001'", [id]); await user(db, 1);
      assert.ok((await enemy(v.raidVariantId)).skillsByCharacterId[id].some(s => s.id === 'SKILL_001'));
      await admin(); await db.query('delete from canonical_skill_master where exclusive_character_id=$1', [id]); await user(db, 1); assert.equal((await enemy(v.raidVariantId)).skillsByCharacterId[id].length, 2);
      await admin(); await db.query("insert into canonical_quest_enemy_pool_entries values('2026-08-30',$1,'HARD',true,999,'[\"MISSING_SKILL\"]')", [id]); await user(db, 1); await assert.rejects(() => enemy(v.raidVariantId), e => e.code === 'P0002');
    } finally { await db.query('rollback'); await admin(); await user(db, 1); }
  });
  await check('invalid inputs and anonymous/nonexistent users denied; internal helper and tables inaccessible', async () => {
    for (const offset of [-1, null, 1000001]) await assert.rejects(() => list(offset), e => e.code === '22023');
    await assert.rejects(() => rescues(null), e => e.code === '22023'); await assert.rejects(() => rescues(Array.from({ length: 51 }, randomUUID)), e => e.code === '22023');
    assert.deepEqual(await rescues([randomUUID()]), { entries: [] }); await assert.rejects(() => enemy('MISSING'), e => e.code === 'P0002');
    await assert.rejects(() => db.query('select private.raid_page_entry_v1($1)', [rooms[0].roomId]), e => e.code === '42501');
    await assert.rejects(() => db.query('select * from raid_room_clear_reward_items'), e => e.code === '42501');
    for (const id of [null, 999]) { await user(db, id); for (const call of [() => list(), () => rescues([]), () => enemy(raid.variants[0].raidVariantId)]) await assert.rejects(call, e => e.code === '42501'); }
    await admin(); await db.query('set role anon'); await assert.rejects(() => list(), e => e.code === '42501'); await user(db, 1);
  });
  await check('configured reward plans are read-only and no lifecycle, Present, membership or battle mutation occurs', async () => {
    await admin(); await db.query("update raid_room_clear_reward_rules set enabled=true where difficulty='beginner';insert into raid_room_clear_reward_items values('beginner','CASH',10)");
    const snapshot = async () => { await admin(); return value(db, "select jsonb_build_object('bosses',(select jsonb_agg(to_jsonb(b) order by id) from raid_bosses b),'rooms',(select jsonb_agg(to_jsonb(r) order by id) from raid_rooms r),'members',(select count(*) from raid_room_members),'presents',(select count(*) from presents),'replays',(select count(*) from battle_replay_sessions),'daily',(select jsonb_agg(to_jsonb(d)) from private.raid_daily_targets d)) value"); };
    const before = await snapshot(); await user(db, 1); await list(); await rescues([activity]); const info = await enemy(raid.variants[0].raidVariantId);
    assert.deepEqual(info.clearPlan, { status: 'configured', items: [{ itemId: 'CASH', quantity: 10 }] }); assert.deepEqual(await snapshot(), before);
  });
  await writeFile(resolve(out, 'pg-report.json'), JSON.stringify({ database, results, scope: 'Isolated localhost PG17; real migrations and canonical JSON masters over minimal surrounding schema. No PostgREST/Auth HTTP or Preview verification.' }, null, 2));
  console.log(JSON.stringify({ database, passed: results.length }));
} finally { await db.end(); }
