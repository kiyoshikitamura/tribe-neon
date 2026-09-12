import assert from 'node:assert/strict';
import { loadRaidGuideAvailability } from '../src/domain/raidGuideAvailability.ts';
import { resolveHomeInitialCta } from '../src/domain/presentation/homeInitialGuide.ts';
const now = Date.parse('2026-09-12T00:00:00Z');
const available = value => ({ status: 'available', value });
const room = (overrides = {}) => ({ state: available('active'), hp: available({ current: 10 }), expiresAt: available('2026-09-13T00:00:00Z'), ...overrides });
const run = async (roomEnabled, data, error = null) => {
  const calls = [];
  const result = await loadRaidGuideAvailability({ roomEnabled, now,
    client: { rpc: async name => { calls.push(name); return { data, error }; } },
    listRooms: async () => { calls.push('rooms'); if (error) throw error; return data; },
  });
  assert.deepEqual(calls, [roomEnabled ? 'rooms' : 'get_active_raids']);
  return result;
};
for (const mode of [false, true]) {
  assert.equal(await run(mode, []), 'inactive');
  assert.equal(await run(mode, [], new Error('offline')), 'unknown');
  assert.equal(await run(mode, null), 'unknown');
}
assert.equal(await run(false, [{ id: 'raid', status: 'ACTIVE', currentHp: 5, expiresAt: '2026-09-13T00:00:00Z' }]), 'active');
assert.equal(await run(false, [{}]), 'unknown');
for (const currentHp of [null, NaN]) assert.equal(await run(false, [{ id: 'raid', status: 'ACTIVE', currentHp, expiresAt: '2026-09-13T00:00:00Z' }]), 'unknown');
assert.equal(await run(false, [{ id: 'raid', status: 'ACTIVE', currentHp: 5, expiresAt: '2026-09-11T00:00:00Z' }]), 'inactive');
assert.equal(await run(true, [room()]), 'active');
assert.equal(await run(true, [room({ state: { status: 'unknown' } })]), 'unknown');
assert.equal(await run(true, [room({ hp: { status: 'unknown' } })]), 'unknown');
assert.equal(await run(true, [room({ expiresAt: available('invalid') })]), 'unknown');
assert.equal(await run(true, [room({ expiresAt: available('2026-09-11T00:00:00Z') })]), 'inactive');
assert.equal(await run(true, [room({ hp: available({ current: 0 }) })]), 'inactive');
assert.equal(await run(true, [room({ state: { status: 'unknown' } }), room()]), 'active');
const milestones = new Set(['first_free_skill_ten_pull', 'first_free_equipment_ten_pull', 'first_main_loadout', 'post_tutorial_quest', 'first_pvp']);
const cta = raidAvailability => resolveHomeInitialCta({ ready: true, gameplayAuthorized: true, milestones, raidAvailability });
for (const mode of [false, true]) {
  const inactive = await run(mode, []);
  assert.equal(cta(inactive).tab, 'guild');
  milestones.add('post_tutorial_guild_view');
  assert.equal(cta(inactive).action, 'mission_handoff');
  milestones.add('activation_mission_handoff');
  assert.equal(cta(inactive), null);
  assert.equal(cta('active').tab, 'raid');
  assert.equal(milestones.has('first_raid'), false);
  milestones.delete('post_tutorial_guild_view'); milestones.delete('activation_mission_handoff');
}
console.log('PASS: legacy/room selection, empty/error/malformed/partial/expiry, Guild → Mission, Raid再案内・未参加Fact保持');
