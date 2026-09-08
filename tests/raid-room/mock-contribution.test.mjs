import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { executeMockRpc } from '../../src/utils/mock/mockRpc.ts';

let tables;
let actor;
globalThis.window = {};
globalThis.localStorage = { getItem: (key) => key === 'tribe_demo_uuid' ? actor : null };
const client = {
  getStorage: (key) => tables[key] || [],
  setStorage: () => { throw new Error('Contribution read must not mutate storage'); },
};
const rpc = (id, extra = {}) => executeMockRpc(client, 'get_my_raid_contribution_v1', { p_instance_id: id, ...extra });
beforeEach(() => {
  actor = 'self';
  tables = {
    raid_bosses: [
      { id: 'room-a', raid_day_key: 'today' },
      { id: 'room-b', raid_day_key: 'today' },
      { id: 'legacy-a', raid_day_key: 'old-day' },
      { id: 'legacy-b', raid_day_key: 'old-day' },
      { id: 'yesterday', raid_day_key: 'yesterday' },
      { id: 'null-day', raid_day_key: null },
    ],
    raid_rooms: [{ raid_boss_instance_id: 'room-a' }, { raid_boss_instance_id: 'room-b' }],
    raid_damage_logs: [
      { user_id: 'self', raid_boss_instance_id: 'room-a', raw_damage: 17, applied_damage: 3 },
      { user_id: 'self', raid_boss_instance_id: 'room-a', raw_damage: 9, applied_damage: 0 },
      { user_id: 'self', raid_boss_instance_id: 'room-a', raw_damage: 0, damage: 999 },
      { user_id: 'other', raid_boss_instance_id: 'room-a', raw_damage: 500 },
      { user_id: 'self', raid_boss_instance_id: 'room-b', raw_damage: 200 },
      { user_id: 'self', raid_boss_instance_id: 'legacy-a', raw_damage: 31 },
      { user_id: 'self', raid_boss_instance_id: 'legacy-b', raw_damage: 43 },
      { user_id: 'other', raid_boss_instance_id: 'legacy-b', raw_damage: 700 },
      { user_id: 'self', raid_boss_instance_id: 'yesterday', raw_damage: 800 },
      { user_id: 'self', raid_boss_instance_id: 'missing', raw_damage: 900 },
      { user_id: 'self', raid_boss_instance_id: 'null-day', raw_damage: 1000 },
    ],
  };
});

test('Room contribution is own Instance raw, including applied-zero, without rankings or writes', async () => {
  const before = structuredClone(tables);
  assert.deepEqual(await rpc('room-a', { p_user_id: 'other' }), { data: { contribution: 26 }, error: null });
  assert.deepEqual(tables, before);
});
test('legacy contribution aggregates own same-day Instances and excludes other days/users', async () => {
  assert.deepEqual(await rpc('legacy-a'), { data: { contribution: 74 }, error: null });
});
test('SQL null day equality does not match other null day values', async () => {
  assert.deepEqual(await rpc('null-day'), { data: { contribution: 0 }, error: null });
});
test('authenticated caller with no logs gets zero', async () => {
  actor = 'no-logs';
  assert.deepEqual(await rpc('room-a'), { data: { contribution: 0 }, error: null });
});
test('missing Instance returns SQL261 P0002', async () => {
  assert.deepEqual(await rpc('missing'), { data: null, error: { message: 'Raid not found', code: 'P0002' } });
});
test('unauthenticated request cannot use supplied user to read contribution', async () => {
  actor = null;
  assert.deepEqual(await rpc('room-a', { p_user_id: 'self' }), { data: null, error: { message: 'authentication required', code: '42501' } });
});
