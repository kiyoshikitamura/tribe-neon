import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production hook with controlled React state and RPC transport.
const source = fs.readFileSync('src/app/context/hooks/useCharacterProgression.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let states = [], index = 0, locked = false, releaseRpc, fail = false;
let hook, dialog, errors = [], calls = [], syncs = 0;
const rows = [
  { id: 'owned-A', character_id: 'master-A', awakening_level: 4, awakening_progress: 3 },
  { id: 'owned-B', character_id: 'master-B', awakening_level: 0, awakening_progress: 0 },
];
const react = {
  useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
  useRef(initial) { const i = index++; if (!(i in states)) states[i] = { current: initial }; return states[i]; },
};
const exports = {};
vm.runInNewContext(compiled, { exports, console: { warn() {} }, require(name) {
  if (name === 'react') return react;
  if (name === '@/hooks/useImmediateActionLock') return { useImmediateActionLock: () => ({ isLocked: locked, beginAction: () => { if (locked) return false; locked = true; return true; }, endAction: () => { locked = false; } }) };
  if (name === '@/utils/supabase') return { supabase: { rpc: async (method, args) => {
    assert.equal(method, 'awaken_character');
    calls.push(args.p_character_id);
    if (fail) throw Error('network');
    await new Promise(resolve => { releaseRpc = resolve; });
    const row = rows.find(row => row.id === args.p_character_id);
    row.awakening_level += 1;
    row.awakening_progress = 0;
    return { data: { awakening_level: row.awakening_level, awakening_progress: 0, awakening_required: 1, outcome: 'awakening' } };
  } } };
  return {};
} });
const render = () => {
  index = 0;
  // Deliberately keep the legacy selected master on A while clicking B by owned ID.
  hook = exports.useCharacterProgression({ user: { id: 'qa' } }, 0, () => {}, 0, 0, 0, 0, 0, 0, 0, 0, 'master-A', error => errors.push(error), () => {}, async () => {
    syncs++;
    hook.setUserCharactersDbList(rows.map(row => ({ ...row })));
    hook.setCharacterAwaken(rows[0].awakening_level); // bootstrap's profile-leader projection
  }, config => { dialog = config; });
};
render();
hook.setUserCharactersDbList(rows.map(row => ({ ...row })));
hook.setCharacterAwaken(4);
render();
let pending = hook.handleCharacterAwaken('owned-A');
await hook.handleCharacterAwaken('owned-A');
assert.deepEqual(calls, ['owned-A'], 'double click must not submit a second mutation');
releaseRpc(); await pending;
assert.equal(rows[0].awakening_level, 5);
render();
assert.equal(hook.characterAwaken, 5, 'reproduce the leader reaching max after first use');
pending = hook.handleCharacterAwaken('owned-B');
assert.deepEqual(calls, ['owned-A', 'owned-B'], 'B must execute despite leader A max and stale master selection');
releaseRpc(); await pending;
assert.equal(rows[1].awakening_level, 1);
assert.equal(syncs, 2);
assert.match(dialog.message, /\+1/);
render();
await hook.handleCharacterAwaken('owned-A');
assert.match(errors.at(-1), /最大覚醒/);
await hook.handleCharacterAwaken('unknown-owned-id');
assert.match(errors.at(-1), /見つかりません/);
assert.equal(calls.length, 2, 'invalid/max target never mutates');
fail = true;
await hook.handleCharacterAwaken('owned-B');
assert.match(errors.at(-1), /再読み込み/, 'transport failure must not be silent');
assert.equal(locked, false, 'failure releases the action lock');
assert.equal(syncs, 2);
fail = false;
pending = hook.handleCharacterAwaken('owned-B');
releaseRpc(); await pending;
assert.equal(rows[1].awakening_level, 2, 'a subsequent explicit action works after transport failure');
assert.equal(rows[0].awakening_level, 5, 'switching never mutates the other target');
console.log('Awakening target switch PASS: A max → B, owned-ID authority, double click, cap, missing target, failure/retry, bootstrap refresh.');
