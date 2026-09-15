import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('src/app/context/hooks/useCharacterProgression.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const lbMaster = JSON.parse(fs.readFileSync('src/domain/gameplay/canonical/data/equipment_limit_break_20260821.json', 'utf8'));
function harness(kind) {
  let states = [], index = 0, locked = false, release, hook, calls = [], errors = [], cash = kind === 'skill' ? 50000 : 0, parts = 10;
  const rows = [
    { id: 'A', equipment_id: 'eq', skill_card_id: 'sk', plus_val: 9, equipped_character_id: null },
    { id: 'B', equipment_id: 'eq', skill_card_id: 'sk', plus_val: 0, equipped_character_id: null },
  ];
  const react = { useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useRef(initial) { const i = index++; if (!(i in states)) states[i] = { current: initial }; return states[i]; } };
  const exports = {};
  vm.runInNewContext(compiled, { exports, console: { warn() {} }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/canonical/masters')) return { CANONICAL_EQUIPMENT_LIMIT_BREAK: lbMaster };
    if (name.endsWith('/skills_master_data')) return { CANONICAL_SKILL_VIEW: [{ id: 'sk', is_exclusive: false }] };
    if (name.includes('useImmediateActionLock')) return { useImmediateActionLock: () => ({ isLocked: locked, beginAction() { if (locked) return false; return locked = true; }, endAction() { locked = false; } }) };
    if (name === '@/utils/supabase') return { supabase: { rpc: async (method, args) => {
      assert.equal(method, kind === 'skill' ? 'limit_break_skill' : 'limit_break_equipment');
      const id = args.p_skill_id || args.p_equipment_id;
      calls.push(id);
      await new Promise(resolve => { release = resolve; });
      const row = rows.find(row => row.id === id);
      row.plus_val++;
      return { data: { plus_val: row.plus_val } };
    } } };
    return {};
  } });
  const refresh = () => {
    hook.setUserEquipmentsList(rows.map(row => ({ ...row })));
    hook.setUserSkillsList(rows.map(row => ({ ...row })));
  };
  const render = () => { index = 0; hook = exports.useCharacterProgression({ user: { id: 'qa' } }, cash, () => {}, 0, 0, 0, 0, 0, 0, parts, 10, 'master-A', error => errors.push(error), () => {}, async () => refresh(), () => {}); };
  render(); refresh(); render();
  return {
    get hook() { return hook; }, calls, rows, errors, render,
    select(id, stalePlus) { const row = { ...rows.find(row => row.id === id) }; if (stalePlus !== undefined) row.plus_val = stalePlus; kind === 'skill' ? hook.setSelectedSkill(row) : hook.setSelectedEquipment(row); render(); },
    run() { return kind === 'skill' ? hook.handleSkillUpgrade(true) : hook.handleEquipmentLimitBreak(true); },
    release() { release(); },
    get selected() { return kind === 'skill' ? hook.selectedSkill : hook.selectedEquipment; },
    parts(n) { parts = n; render(); },
  };
}
for (const kind of ['equipment', 'skill']) {
  const h = harness(kind);
  h.select('A');
  // Stale global equipment state must not affect eligibility/cost/result.
  h.hook.setEquipmentLimitBreak(10); h.render();
  const pendingA = h.run();
  assert.deepEqual(h.calls, ['A']);
  await h.run();
  assert.equal(h.calls.length, 1, 'in-flight double click rejected');
  h.select('B'); // switch while A's response/refresh is pending
  h.release(); await pendingA; h.render();
  assert.equal(h.selected.id, 'B');
  assert.equal(h.selected.plus_val, 0, 'A response must not overwrite B selection');
  // An outdated selected object must not supply B's cap or cost.
  h.select('B', 10);
  const pendingB = h.run();
  assert.deepEqual(h.calls, ['A', 'B']);
  h.release(); await pendingB; h.render();
  assert.equal(h.selected.plus_val, 1);
  assert.equal(h.rows[0].plus_val, 10);
  h.select('A', 0);
  await h.run();
  assert.equal(h.calls.length, 2, 'owned max cannot be bypassed with stale selected state');
  if (kind === 'equipment') {
    h.rows[1].plus_val = 9;
    h.hook.setUserEquipmentsList(h.rows.map(row => ({ ...row }))); h.parts(3); h.select('B');
    await h.run();
    assert.match(h.errors.at(-1), /不足/);
    assert.equal(h.calls.length, 2, '+9 requires four canonical parts');
  }
}
console.log('LB target switch PASS: equipment CASH 0, A max → B, stale global/selected state, switch during RPC, double click, cap and canonical parts.');
