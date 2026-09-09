import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewConfig } from '../../scripts/raid-room/build-preview-config.mjs';

// 以下の値は入力検証専用fixture。実機・本番向けバランス値ではない。
const ids = ['beginner', 'intermediate', 'advanced', 'expert'];
const fixture = () => ({
  environment: 'preview', projectRef: 'abcdefghijklmnopqrst', version: 1,
  difficulties: ids.map(id => ({ id,
    rescue: { minimumBattles: 1, minimumContributionDamage: 0, items: [{ itemId: 'TEST_ONLY_ITEM', quantity: 1 }] },
    clear: { minimumContributionDamage: 0, items: [{ itemId: 'TEST_ONLY_ITEM', quantity: 1 }] },
  })),
});
const rejects = mutate => { const config = fixture(); mutate(config); assert.throws(() => buildPreviewConfig(config)); };

test('4難度の入力から決定的なSQLを生成し、入力オブジェクトを変更しない', () => {
  const config = fixture(); const original = structuredClone(config);
  const sql = buildPreviewConfig(config);
  assert.equal(typeof sql, 'string'); assert.equal(sql, buildPreviewConfig(config));
  assert.deepEqual(config, original);
  for (const id of ids) assert.ok(sql.includes(`'${id}'`));
  assert.ok(sql.includes('TEST_ONLY_ITEM'));
});

test('生成SQLはtransactionとROLLBACKで閉じ、COMMITを含まない', () => {
  const sql = buildPreviewConfig(fixture()).replace(/--[^\n]*/g, '');
  assert.match(sql, /\bBEGIN\s*;/i); assert.match(sql, /\bROLLBACK\s*;\s*$/i);
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/i);
});

test('本番project・preview以外のenvironment・不正projectRefを拒否する', () => {
  for (const environment of ['production', 'development', '', null]) rejects(c => { c.environment = environment; });
  for (const projectRef of ['ktpolnkyyfkowxdmijww', '', null, 'abcdefghijklmnopqrs', 'ABCDEFGHIJKLMNOPQRST', "x'; COMMIT; --"]) {
    rejects(c => { c.projectRef = projectRef; });
  }
});

test('null・欠落・配列でない設定と未知・不足・重複難度を拒否する', () => {
  for (const config of [null, undefined, [], {}]) assert.throws(() => buildPreviewConfig(config));
  for (const difficulties of [null, [], {}, fixture().difficulties.slice(1)]) rejects(c => { c.difficulties = difficulties; });
  rejects(c => { c.difficulties[0].id = 'unknown'; });
  rejects(c => { c.difficulties[0].id = 'expert'; });
  rejects(c => { c.difficulties.push(structuredClone(c.difficulties[0])); });
  rejects(c => { c.difficulties[0] = null; });
  for (const kind of ['rescue', 'clear']) rejects(c => { c.difficulties[0][kind] = null; });
});

test('version・戦数・数量は正整数のみを受理する', () => {
  for (const value of [null, 0, -1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    rejects(c => { c.version = value; });
    rejects(c => { c.difficulties[0].rescue.minimumBattles = value; });
    for (const kind of ['rescue', 'clear']) rejects(c => { c.difficulties[0][kind].items[0].quantity = value; });
  }
});

test('貢献値は0を受理し、null・負・小数・文字列・安全整数範囲外を拒否する', () => {
  assert.doesNotThrow(() => buildPreviewConfig(fixture()));
  for (const kind of ['rescue', 'clear']) for (const value of [null, -1, 1.5, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    rejects(c => { c.difficulties[0][kind].minimumContributionDamage = value; });
  }
});

test('各報酬の空明細・空ID・重複品目を拒否する', () => {
  for (const kind of ['rescue', 'clear']) {
    for (const items of [null, [], {}, [null]]) rejects(c => { c.difficulties[0][kind].items = items; });
    for (const itemId of ['', '   ', null, 123]) rejects(c => { c.difficulties[0][kind].items[0].itemId = itemId; });
    rejects(c => { c.difficulties[0][kind].items.push({ itemId: 'TEST_ONLY_ITEM', quantity: 2 }); });
  }
});

test('引用符を含む品目IDはSQL文字列内に保持する', () => {
  const config = fixture(); config.difficulties[0].clear.items[0].itemId = "TEST'ITEM";
  assert.ok(buildPreviewConfig(config).includes("'TEST''ITEM'"));
});

test('設定生成は運用有効化もPresent発行も行わない', () => {
  const sql = buildPreviewConfig(fixture()).replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /raid_room_(?:creation|battle|rescue)_settings/i);
  assert.doesNotMatch(sql, /\benabled\s*=\s*true\b/i);
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?presents\b/i);
  assert.match(sql, /raid_room_rescue_reward_rules/); assert.match(sql, /raid_room_clear_reward_rules/);
  assert.match(sql, /\bfalse\b/i);
});

test('バックスラッシュと引用符の組合せをescapeし制御文字を拒否する', () => {
  const config = fixture(); config.difficulties[0].clear.items[0].itemId = "TEST\\'ITEM";
  assert.ok(buildPreviewConfig(config).includes("E'TEST\\\\''ITEM'"));
  for (const value of ['TEST\nITEM', 'TEST\0ITEM', 'TEST\tITEM', 'TEST\x7fITEM']) {
    rejects(c => { c.difficulties[0].clear.items[0].itemId = value; });
  }
});

test('入力値を救援・討伐の対応列へ分離し、全報酬規則を無効のまま生成する', () => {
  const config = fixture(); config.version = 7;
  config.difficulties[0].rescue.minimumBattles = 3;
  config.difficulties[0].rescue.minimumContributionDamage = 101;
  config.difficulties[0].clear.minimumContributionDamage = 202;
  const sql = buildPreviewConfig(config);
  assert.match(sql, /UPDATE public\.raid_room_difficulty_rules SET rescue_min_battles=3, rescue_min_contribution_damage=101, rule_version=7 WHERE difficulty=E'beginner';/);
  assert.match(sql, /UPDATE public\.raid_room_clear_reward_rules SET enabled=false, minimum_contribution_damage=202, rule_version=7 WHERE difficulty=E'beginner';/);
  assert.equal((sql.match(/UPDATE public\.raid_room_(?:rescue|clear)_reward_rules SET enabled=false/g) ?? []).length, 8);
});
