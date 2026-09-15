// Deterministic hook/timer harness: executes the production component; no DOM/CSS assertions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/components/battle/ExclusiveBattlePresentation.tsx', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness(dialogue = 'approved dialogue') {
  let now = 0, cursor = 0, nextTimer = 0, tree, pending = [];
  const slots = [], timers = new Map();
  const props = { dialogue, paused: false, children: { type: 'CUTIN_CHILD' } };
  const hooks = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [slots[i].value, value => { slots[i].value = value; render(); }];
    },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (previous && deps.every((d, n) => Object.is(d, previous.deps[n]))) return;
      pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
  };
  const exports = {};
  const jsx = (type, properties) => ({ type, props: properties });
  vm.runInNewContext(js, {
    exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name.endsWith('exclusiveSkillDialogue')) return { EXCLUSIVE_SKILL_PREFIX_MS: 1100 };
      return {};
    },
    performance: { now: () => now },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function render() {
    cursor = 0;
    tree = exports.ExclusiveSkillSequence(props);
    const effects = pending; pending = []; effects.forEach(effect => effect());
  }
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].callback();
    }
    now = end;
  }
  render();
  return {
    advance,
    pause(value) { props.paused = value; render(); },
    phase: () => tree.props['data-exclusive-phase'],
    child: () => tree.props.children,
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
    timerCount: () => timers.size,
  };
}
const normal = harness();
assert.equal(normal.phase(), 'dark');
normal.advance(180); assert.equal(normal.phase(), 'dialogue');
normal.advance(919); assert.equal(normal.phase(), 'dialogue');
normal.advance(1); assert.equal(normal.phase(), 'cutin');
assert.equal(normal.child().props.children.type, 'CUTIN_CHILD');
for (const stopAt of [90, 500]) {
  const paused = harness(); paused.advance(stopAt); const before = paused.phase();
  paused.pause(true); paused.advance(5000); assert.equal(paused.phase(), before);
  paused.pause(false); paused.advance(1100 - stopAt - 1); assert.notEqual(paused.phase(), 'cutin');
  paused.advance(1); assert.equal(paused.phase(), 'cutin');
  paused.pause(true); paused.advance(5000); assert.equal(paused.phase(), 'cutin');
}
const plain = harness(null); assert.equal(plain.child().type, 'CUTIN_CHILD'); assert.equal(plain.timerCount(), 0);
const cancelled = harness(); cancelled.advance(80); cancelled.dispose(); assert.equal(cancelled.timerCount(), 0);
const replay = harness(); assert.equal(replay.phase(), 'dark'); replay.dispose();
console.log('PASS: 1100ms sequence, dark/dialogue pause and resume, cut-in hold, ordinary skill, unmount, fresh activation. DOM/CSS and live battle require Preview acceptance.');
