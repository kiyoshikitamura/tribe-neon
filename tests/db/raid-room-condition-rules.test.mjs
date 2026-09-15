import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRaidPowerGate } from '../../src/domain/raidRoom.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(resolve(process.env.RAID_TEST_RUNTIME ?? root, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const migration = readFileSync(resolve(root, 'supabase/migrations/20260908000251_raid_room_condition_rules.sql'), 'utf8');
const powerSql = 'select public._raid_room_power_gate_v1($1::text,$2::bigint) as value';
const rescueSql = 'select public._raid_room_rescue_gate_v1($1::text,$2::boolean,$3::bigint,$4::bigint,$5::boolean) as value';
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const power = (difficulty, amount) => value(powerSql, [difficulty, amount]);
const rescue = (...args) => value(rescueSql, args);
async function rollbackRun(fn, setup = '') {
  await db.exec(`begin; ${setup}`);
  try { return await fn(); } finally { await db.exec('rollback'); }
}
// 閾値 3/100 は本テストだけの入力。確定仕様・候補seedではない。
const configured = fn => rollbackRun(fn, "update public.raid_room_difficulty_rules set rescue_min_battles=3,rescue_min_contribution_damage=100,rule_version=77 where difficulty='intermediate';");
before(async () => {
  await db.exec(readFileSync(new URL('./raid-room-condition-rules-fixture.sql', import.meta.url), 'utf8'));
  await db.exec(migration);
  console.log('SQL engine:', await value('select version() as value'));
});
after(async () => db.close());

test('4難度の確定下限のみseed、救援閾値は全件未設定', async () => {
  const rows = (await db.query('select * from public.raid_room_difficulty_rules order by difficulty')).rows;
  assert.equal(rows.length, 4);
  const expected = { beginner: null, intermediate: 160000, advanced: 200000, expert: 240000 };
  for (const row of rows) {
    assert.equal(row.minimum_power === null ? null : Number(row.minimum_power), expected[row.difficulty]);
    assert.equal(row.rescue_min_battles, null);
    assert.equal(row.rescue_min_contribution_damage, null);
    assert.equal(Number(row.rule_version), 1);
  }
});

test('総合力境界直前/一致/直後と初級・不明・負数は既存TSと完全一致', async () => {
  const cases = [['beginner', null], ['beginner', 0], ['beginner', -1], ['beginner', 1],
    ['intermediate', null], ['intermediate', -1], ['advanced', null], ['expert', -1],
    ['unknown', 240000], [null, null], ['unknown', -1]];
  for (const [difficulty, minimum] of [['intermediate', 160000], ['advanced', 200000], ['expert', 240000]]) {
    for (const amount of [0, minimum - 1, minimum, minimum + 1]) cases.push([difficulty, amount]);
  }
  for (const [difficulty, amount] of cases) {
    assert.deepEqual(await power(difficulty, amount), evaluateRaidPowerGate(difficulty, amount), `${difficulty}/${amount}`);
  }
});

test('bigint APIは非整数文字列・非有限・範囲外を成功扱いしない', async () => {
  for (const amount of ['159999.9', 'NaN', 'Infinity', '9223372036854775808', '-9223372036854775809']) {
    await assert.rejects(power('intermediate', amount), error => ['22P02', '22003'].includes(error.code));
  }
});

test('bigint精度保持と明示numeric CASTの丸めを区別する', async () => {
  assert.equal(await value("select public._raid_room_power_gate_v1('expert',9223372036854775807::bigint)->>'actualPower' as value"), '9223372036854775807');
  assert.equal(await value("select public._raid_room_power_gate_v1('intermediate',159999.9::numeric::bigint)->>'actualPower' as value"), '160000');
});

test('救援閾値未設定・未知難度は成功不明、未設定を0として扱わない', async () => {
  for (const difficulty of ['beginner', 'intermediate', 'advanced', 'expert']) {
    const result = await rescue(difficulty, true, 100, 999999, true);
    assert.equal(result.status, 'unknown');
    assert.equal(result.reason, 'thresholds_unconfigured');
    assert.equal(result.minimumBattles, null);
    assert.equal(result.minimumContributionDamage, null);
  }
  for (const difficulty of ['unknown', null]) {
    const result = await rescue(difficulty, true, 100, 999999, true);
    assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'invalid_difficulty');
  }
});

test('救援4条件ANDの全16組を判定、一致以上のみ成功', async () => configured(async () => {
  for (const via of [false, true]) for (const battles of [2, 3])
    for (const damage of [99, 100]) for (const cleared of [false, true]) {
      const result = await rescue('intermediate', via, battles, damage, cleared);
      const success = via && battles >= 3 && damage >= 100 && cleared;
      assert.equal(result.status, success ? 'succeeded' : 'not_succeeded');
      assert.equal(result.reason, success ? 'conditions_met' : 'conditions_not_met');
      assert.equal(result.ruleVersion, 77); assert.equal(result.minimumBattles, 3);
      assert.equal(result.minimumContributionDamage, 100);
    }
  assert.equal((await rescue('intermediate', true, 4, 101, true)).status, 'succeeded');
}));

test('救援の各必須値null・負数はunknown、false条件併存でも不明を保持', async () => configured(async () => {
  for (let index = 1; index <= 4; index++) {
    const args = ['intermediate', true, 3, 100, true]; args[index] = null;
    const result = await rescue(...args);
    assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'input_unavailable');
  }
  for (const args of [['intermediate', true, -1, 100, true], ['intermediate', false, 3, -1, false]]) {
    const result = await rescue(...args);
    assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'invalid_input');
  }
  assert.equal((await rescue('intermediate', false, null, 100, false)).status, 'unknown');
}));

test('救援閾値0は未設定NULLと区別し、経由とCLEARを要求する', async () => {
  await rollbackRun(async () => {
    assert.equal((await rescue('beginner', true, 0, 0, true)).status, 'succeeded');
    assert.equal((await rescue('beginner', false, 0, 0, true)).status, 'not_succeeded');
    assert.equal((await rescue('beginner', true, 0, 0, false)).status, 'not_succeeded');
  }, "update public.raid_room_difficulty_rules set rescue_min_battles=0,rescue_min_contribution_damage=0 where difficulty='beginner';");
});

test('救援片側だけの設定を成功判定に使わない', async () => {
  for (const column of ['rescue_min_battles', 'rescue_min_contribution_damage']) {
    await rollbackRun(async () => {
      assert.equal((await rescue('intermediate', true, 100, 999999, true)).status, 'unknown');
    }, `update public.raid_room_difficulty_rules set ${column}=3 where difficulty='intermediate';`);
  }
});

test('不正設定を制約拒否、難度の欠落はunknown', async () => {
  for (const assignment of ['minimum_power=-1', 'rescue_min_battles=-1', 'rescue_min_contribution_damage=-1', 'rule_version=0']) {
    await assert.rejects(rollbackRun(() => db.exec(`update public.raid_room_difficulty_rules set ${assignment} where difficulty='intermediate'`)), error => error.code === '23514');
  }
  await rollbackRun(async () => {
    const result = await rescue('intermediate', true, 3, 100, true);
    assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'rule_unavailable');
    assert.equal((await power('intermediate', 999999)).status, 'unknown');
  }, "delete from public.raid_room_difficulty_rules where difficulty='intermediate';");
});

test('PUBLIC継承・anon・authenticated・service_roleへtable/helper公開なし', async () => {
  for (const role of ['condition_public_probe', 'anon', 'authenticated', 'service_role']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal(await value('select has_table_privilege($1, $2, $3) as value', [role, 'public.raid_room_difficulty_rules', privilege]), false);
    }
    for (const signature of ['public._raid_room_power_gate_v1(text,bigint)', 'public._raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)']) {
      assert.equal(await value('select has_function_privilege($1,$2,\'EXECUTE\') as value', [role, signature]), false);
    }
    for (const sql of ["select * from public.raid_room_difficulty_rules", "select public._raid_room_power_gate_v1('intermediate',999999)", "select public._raid_room_rescue_gate_v1('intermediate',true,99,999999,true)"]) {
      await assert.rejects(rollbackRun(() => db.exec(sql), `set local role ${role};`), error => error.code === '42501');
    }
  }
});

test('RLSは有効かつpolicyなし、SELECT権限だけ与えても行を返さない', async () => {
  assert.equal(await value("select relrowsecurity as value from pg_class where oid='public.raid_room_difficulty_rules'::regclass"), true);
  assert.equal(await value("select count(*)::int as value from pg_policies where schemaname='public' and tablename='raid_room_difficulty_rules'"), 0);
  await rollbackRun(async () => {
    assert.equal(await value('select count(*)::int as value from public.raid_room_difficulty_rules'), 0);
  }, 'grant select on public.raid_room_difficulty_rules to authenticated; set local role authenticated;');
});

test('helperはSTABLE/安全search_path、READ ONLYで動作し設定不変', async () => {
  const functions = (await db.query("select provolatile,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('_raid_room_power_gate_v1','_raid_room_rescue_gate_v1')")).rows;
  assert.equal(functions.length, 2);
  for (const fn of functions) { assert.equal(fn.provolatile, 's'); assert.ok(fn.proconfig.includes('search_path=pg_catalog')); }
  const snapshot = () => value('select jsonb_agg(r order by difficulty) as value from public.raid_room_difficulty_rules r');
  const initial = await snapshot();
  await rollbackRun(async () => {
    assert.equal((await power('expert', 240000)).status, 'passed');
    assert.equal((await rescue('expert', true, 5, 1000000, true)).status, 'unknown');
  }, 'set transaction read only;');
  assert.deepEqual(await snapshot(), initial);
});

test('Migration再適用は調整済み設定・版を上書きしない', async () => {
  await db.exec("update public.raid_room_difficulty_rules set rescue_min_battles=7,rescue_min_contribution_damage=1234,rule_version=9 where difficulty='intermediate'");
  const snapshot = () => value('select jsonb_agg(r order by difficulty) as value from public.raid_room_difficulty_rules r');
  const initial = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(), initial);
});
