/** Parent review: real concurrent PostgreSQL sessions in a fresh isolated test database. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bootstrap, Client, user, value, root } from './pg-harness.mjs';

const { db, config, database } = await bootstrap();
const dailyDefinition = await value(db, "select pg_get_functiondef('private.raid_daily_targets_v1()'::regprocedure) value");
const createDefinition = await value(db, "select pg_get_functiondef('public.create_raid_room_v1(text,text,uuid)'::regprocedure) value");
const results = [];
try {
  // A test-only clock shared by separate sessions; production accepts no clock/date override.
  await db.query("create table public.raid_top_test_clock_value(value timestamptz not null); insert into public.raid_top_test_clock_value values('2030-01-01T14:59:59Z'); create function public.raid_top_test_clock() returns timestamptz language sql volatile as $$select value from public.raid_top_test_clock_value$$");
  await db.query(dailyDefinition.replaceAll('clock_timestamp()', 'public.raid_top_test_clock()'));
  await db.query(createDefinition.replaceAll('clock_timestamp()', 'public.raid_top_test_clock()'));
  await db.query('update raid_room_creation_settings set enabled=true');

  const locker = new Client(config);
  const waiting = new Client(config);
  await locker.connect();
  await waiting.connect();
  try {
    await locker.query('begin');
    await locker.query("select pg_advisory_xact_lock(726402,date '2030-01-01'-date '2000-01-01')");
    await user(waiting, 1);
    const pid = await value(waiting, 'select pg_backend_pid() value');
    const pending = value(waiting, 'select public.get_raid_top_v1() value');
    pending.catch(() => {}); // Observed below after releasing the deliberate lock.
    let blocked = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      blocked = await value(db, "select coalesce((select wait_event='advisory' from pg_stat_activity where pid=$1),false) value", [pid]);
      if (blocked) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(blocked, true, 'The second session must actually wait on the day lock');
    await db.query("update public.raid_top_test_clock_value set value='2030-01-01T15:00:00Z'");
    await locker.query('commit');
    const snapshot = await pending;
    assert.equal(snapshot.dailyTargets.data.dateJst, '2030-01-02');
    assert.equal(await value(db, "select count(*)::int value from private.raid_daily_targets where date_jst='2030-01-01'"), 0);
    assert.equal(await value(db, 'select count(*)::int value from private.raid_daily_targets'), 1);
    results.push({ name: '日次ロック待ち中のJST境界越えは新日を再取得し旧日を生成しない', status: 'PASS' });
  } finally {
    await locker.query('rollback');
    await locker.end();
    await waiting.end();
  }

  // Creation concurrency uses the real server clock and unchanged lifecycle validation.
  await db.query(dailyDefinition);
  await db.query(createDefinition);
  await user(db, 2);
  const choices = await value(db, 'select public.list_raid_room_boss_choices_v1() value');
  const variant = choices.choices[0].raidVariantId;
  const request = randomUUID();
  const settled = await Promise.allSettled(Array.from({ length: 8 }, async () => {
    const client = new Client(config);
    await client.connect();
    try {
      await user(client, 2);
      return await value(client, "select public.create_raid_room_v1('beginner',$1,$2) value", [variant, request]);
    } finally { await client.end(); }
  }));
  const receipts = settled.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  await db.query('reset role');
  assert.equal(await value(db, 'select count(*)::int value from raid_room_creation_requests where request_id=$1', [request]), 1);
  assert.equal(await value(db, 'select count(*)::int value from raid_rooms'), 1);
  results.push({ name: '成功する同一要求8同時再送が同一Roomを返し生成/台帳は1件', status: 'PASS' });

  const out = resolve(root, 'outputs/raid-top-data');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'concurrency-report.json'), JSON.stringify({ database, results, clock: 'Test-only SQL clock substitution, restored in finally; real concurrent PostgreSQL sessions.' }, null, 2));
  console.log(JSON.stringify({ database, results }));
} finally {
  await db.query('reset role');
  await db.query(dailyDefinition);
  await db.query(createDefinition);
  await db.query('drop function if exists public.raid_top_test_clock(); drop table if exists public.raid_top_test_clock_value');
  assert.equal(await value(db, "select pg_get_functiondef('private.raid_daily_targets_v1()'::regprocedure) value"), dailyDefinition);
  assert.equal(await value(db, "select pg_get_functiondef('public.create_raid_room_v1(text,text,uuid)'::regprocedure) value"), createDefinition);
  await db.end();
}
