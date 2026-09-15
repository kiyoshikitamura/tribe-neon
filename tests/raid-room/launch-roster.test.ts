import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRaidEnemyInfo } from '../../src/domain/raidPages';
import { resolveRaidTopEnemy } from '../../src/domain/raidTopAssets';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RaidEnemySelection from '../../src/app/components/raid/RaidEnemySelection';
import RaidEnemyRoster from '../../src/app/components/raid/RaidEnemyRoster';

const variantId = 'RAID_SHINJUKU_V1';
const ids = ['char_tomoya_01', 'char_yuki_01', 'char_shin_01', 'char_serika_01', 'char_jihoon_01'];
const payload = {
  variantId, memberCharacterIds: ids,
  skillsByCharacterId: Object.fromEntries(ids.map(id => [id, [{ id: 'SKILL_001', name: 'ストリートパンチ' }]])),
  clearPlan: { status: 'unconfigured', items: [] }, rescuePlan: { status: 'unconfigured', items: [] },
};
const client = (data: unknown) => ({ rpc: async () => ({ data, error: null }) });

test('difficulty roster from server replaces static variant members while preserving area and party name', async () => {
  const info = await loadRaidEnemyInfo(client(payload), variantId, 'beginner');
  assert.deepEqual(info.memberCharacterIds, ids);
  const enemy = resolveRaidTopEnemy(info.variantId, info.memberCharacterIds);
  assert.deepEqual(enemy?.roster.map(member => member.id), ids);
  assert.equal(enemy?.bossName, 'キングス・クラウン');
  assert.equal(enemy?.roster[0].name, 'トモヤ');
  assert.deepEqual(Object.keys(info.skillsByCharacterId), ids);
});

test('unknown, duplicate, missing and mismatched server roster references are rejected', async () => {
  for (const memberCharacterIds of [[...ids.slice(0, 4), 'missing'], [...ids.slice(0, 4), ids[0]], ids.slice(0, 4)]) {
    await assert.rejects(() => loadRaidEnemyInfo(client({ ...payload, memberCharacterIds }), variantId, 'beginner'));
  }
  await assert.rejects(() => loadRaidEnemyInfo(client({ ...payload, variantId: 'other' }), variantId, 'beginner'));
  await assert.rejects(() => loadRaidEnemyInfo(client({ ...payload, skillsByCharacterId: {} }), variantId, 'beginner'));
});

test('legacy display callers keep the canonical variant roster', () => {
  assert.equal(resolveRaidTopEnemy(variantId)?.roster[0].id, 'char_reiji_01');
});

test('create selection displays server leader and hides static leader while room data is unknown', () => {
  const base = { choices: { status: 'success' as const, data: [{ raidVariantId: variantId, name: 'キングス・クラウン' }], error: null }, selectedVariantId: variantId, difficultyId: 'beginner' as const, onSelectVariant() {}, onSelectDifficulty() {}, onConfirm() {}, onCancel() {}, onRetry() {}, busy: false };
  const loaded = renderToStaticMarkup(React.createElement(RaidEnemySelection, { ...base, memberCharacterIds: ids }));
  assert.match(loaded, /先頭：トモヤ/);
  assert.doesNotMatch(loaded, /先頭：レイジ/);
  const pending = renderToStaticMarkup(React.createElement(RaidEnemySelection, { ...base, memberCharacterIds: null }));
  assert.match(pending, /敵編成は未取得です/);
  assert.doesNotMatch(pending, /先頭：|raid-enemy-selection__leader/);
  const legacy = renderToStaticMarkup(React.createElement(RaidEnemySelection, base));
  assert.match(legacy, /先頭：レイジ/);
});

test('room detail unknown roster does not fall back to canonical five characters', () => {
  const html = renderToStaticMarkup(React.createElement(RaidEnemyRoster, { bossMasterId: variantId, memberCharacterIds: null }));
  assert.match(html, /敵の編成情報は未取得です/);
  assert.doesNotMatch(html, /レイジ/);
});
