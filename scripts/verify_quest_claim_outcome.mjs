import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual hook with controlled React state and RPC responses. This
// exercises the stale local battle projection seen after replay completion.
const source = readFileSync(new URL('../src/app/context/hooks/usePatrol.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function scenario(outcome, suppressResultModal = true, refreshFails = false) {
  const slots = [];
  let cursor = 0;
  const calls = { rpc: 0, refresh: 0, guild: 0, sound: [], level: [], xp: [], errors: [] };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  const result = outcome === 'DEFEAT'
    ? { status: 'success', outcome, cash: 0, xp: 0, items: [], first_clear: false }
    : { status: 'success', outcome, cash: 200, xp: 20, level: 5, current_xp: 80, items: [{ item_id: 'TEST_ITEM', quantity: 1 }] };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === '@/utils/supabase') return { supabase: { rpc: async (method, args) => {
        assert.equal(method, 'claim_patrol_rewards');
        assert.deepEqual(JSON.parse(JSON.stringify(args)), { p_patrol_id: 'quest' });
        calls.rpc++;
        return { data: result, error: null };
      } } };
      if (name === '@/utils/actionPerformance') return { beginActionPerformance() {} };
      if (name === '@/utils/tutorialJourneyTrace') return { traceTutorialJourney() {} };
      throw new Error(`Unexpected import: ${name}`);
    },
    console: { warn() {} },
  });
  const render = () => {
    cursor = 0;
    return exports.usePatrol(
      { user: { id: 'user' } }, 50, () => {}, () => [], 'base',
      error => calls.errors.push(error), sound => calls.sound.push(sound),
      async () => { calls.refresh++; if (refreshFails) throw new Error('offline'); },
      level => calls.level.push(level), xp => calls.xp.push(xp),
      async () => { calls.guild++; }, () => {}, () => {},
    );
  };
  let hook = render();
  hook.setActivePatrols([{ id: 'quest', courseId: 'medium', has_battle_event: true, battle_result: null, status: 'CLAIMABLE' }]);
  hook.setHasActivePatrolBattle(true);
  hook = render();
  assert.equal(await hook.handleClaimRewards('quest', { suppressResultModal }), true);
  hook = render();
  assert.equal(hook.activePatrols.length, 0, 'settlement releases the character and quest slot');
  assert.equal(hook.hasActivePatrolBattle, false);
  assert.equal(hook.dispatchLoading, false);
  assert.equal(calls.refresh, 1);
  assert.equal(calls.errors.length, 0);
  if (outcome === 'DEFEAT') {
    assert.equal(hook.lastPatrolRewards, null, 'defeat never creates a first-clear reward surface');
    assert.equal(hook.showPatrolRewardModal, false);
    assert.equal(calls.guild, 0, 'defeat must not earn guild contribution');
    assert.equal(calls.sound.length, 0, 'defeat must not play reward sound');
    assert.equal(calls.level.length, 0);
    assert.equal(calls.xp.length, 0);
  } else {
    assert.equal(hook.lastPatrolRewards.battleVictory, true, 'server outcome overrides stale local projection');
    assert.equal(hook.lastPatrolRewards.totalCash, 200);
    assert.equal(hook.showPatrolRewardModal, !suppressResultModal);
    assert.equal(calls.guild, 1);
  }
  assert.equal(await hook.handleClaimRewards('quest'), false, 'settled quest cannot be claimed again locally');
  assert.equal(calls.rpc, 1);
}
await scenario('DEFEAT');
await scenario('DEFEAT', false);
await scenario('DEFEAT', true, true);
await scenario('VICTORY');
await scenario('VICTORY', false);
console.log('PASS: Quest defeat settlement, zero reward UI/guild effects, refresh failure, stale projection, win reward, local repeat guard.');
