// Integration candidate: canonical equipment safety and Character HOME identity.
// In-memory Mock only. Does not connect to a database or mutate project files.
import assert from 'node:assert/strict';
import { resolveHomeCharacter } from '../../src/app/components/character/characterHomeSelection.ts';
import { CANONICAL_EQUIPMENTS, CANONICAL_CHARACTERS } from '../../src/domain/gameplay/canonical/masters.ts';
const storage = new Map();
globalThis.window = {};
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
localStorage.setItem('tribe_demo_uuid', 'review-owner');
const { executeMockRpc } = await import('../../src/utils/mock/mockRpc.ts');
const client = { getStorage: key => storage.has(key) ? JSON.parse(storage.get(key)) : [], setStorage: (key, value) => storage.set(key, JSON.stringify(value)) };
const exclusive = CANONICAL_EQUIPMENTS.find(item => item.category === 'WEAPON' && item.exclusive_character_id);
assert(exclusive);
const character = CANONICAL_CHARACTERS.find(item => item.character_id !== exclusive.exclusive_character_id);
assert(character);
const normal = CANONICAL_EQUIPMENTS.filter(item => item.category === 'WEAPON' && !item.exclusive_character_id).slice(0, 2);
assert.equal(normal.length, 2);
client.setStorage('user_characters', [{ id: 'owned-c', user_id: 'review-owner', character_id: character.character_id }]);
client.setStorage('user_equipments', [
  { id: 'exclusive', user_id: 'review-owner', equipment_id: exclusive.equipment_id },
  { id: 'one', user_id: 'review-owner', equipment_id: normal[0].equipment_id },
  { id: 'two', user_id: 'review-owner', equipment_id: normal[1].equipment_id },
]);
const before = JSON.stringify(client.getStorage('user_equipments'));
const denied = await executeMockRpc(client, 'set_character_equipment', { p_character_id: 'owned-c', p_equipment_id: 'exclusive', p_slot_index: 0 });
assert.equal(denied.error?.code, '42501');
assert.equal(JSON.stringify(client.getStorage('user_equipments')), before, 'rejected equip must not mutate inventory');
const bulk = await executeMockRpc(client, 'set_character_equipment_bulk', { p_character_id: 'owned-c', p_equipment_ids: ['one', 'two'], p_slot_indexes: [0, 1] });
assert.equal(bulk.error, null);
assert.deepEqual(client.getStorage('user_equipments').filter(item => item.equipped_character_id === 'owned-c').map(item => [item.id, item.slot_index]), [['one', 0], ['two', 1]]);
const first = { character_id: 'a' }, second = { character_id: 'b' };
assert.equal(resolveHomeCharacter([first, second], 'b'), second);
assert.equal(resolveHomeCharacter([second, first], 'b'), second);
assert.equal(resolveHomeCharacter([first], 'b'), first);
assert.equal(resolveHomeCharacter([], 'a'), undefined);
const off = await executeMockRpc(client, 'list_raid_room_battle_recoveries_v1', { p_limit: 1 });
assert.equal(off.data, null);
localStorage.setItem('mock_rpc_fixture:empty_raid_recoveries', 'true');
const on = await executeMockRpc(client, 'list_raid_room_battle_recoveries_v1', { p_limit: 1 });
assert.deepEqual(on, { data: [], error: null });
const unrelated = await executeMockRpc(client, 'unhandled_rpc_contract_probe', {});
assert.equal(unrelated.data, null);
console.log('Integration A PASS: canonical exclusive rejection/no mutation, bulk two-slot equip, selection reorder/removal/empty (6 groups), opt-in recovery fixture off/on/unrelated (3 groups).');
