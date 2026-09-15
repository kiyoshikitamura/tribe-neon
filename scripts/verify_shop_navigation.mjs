import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const slots = [];
let cursor = 0;
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
  },
  useRef(initial) { const [value] = react.useState({ current: initial }); return value; },
  useEffect() {},
  useCallback(fn, deps) {
    const i = cursor++;
    if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { fn, deps };
    return slots[i].fn;
  },
};
function compile(path, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)(id => {
    assert.ok(id in dependencies, `Unexpected import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}
const master = JSON.parse(fs.readFileSync('src/domain/operations/data/operations_feature_state_20260823.json', 'utf8'));
const operations = compile('src/domain/operations/operations.ts', {
  './data/operations_feature_state_20260823.json': { default: master },
});
const { useNavigation } = compile('src/app/context/hooks/useNavigation.ts', {
  react,
  '@/domain/operations/operations': operations,
  '@/utils/legalSettingsReturn': { hasPendingLegalSettingsReturn: () => false },
});
function render(states) { cursor = 0; return useNavigation(() => {}, () => {}, states); }
const closed = operations.DEFAULT_OPERATIONS_STATE;
const open = { ...closed, SHOP: 'OPEN' };
render(closed).navigateTab('shop');
assert.equal(render(closed).activeTab, 'home');
render(open).navigateTab('shop');
assert.equal(render(open).activeTab, 'shop', 'Server OPEN must allow footer navigation after hydration');
render(closed).navigateTab('shop');
assert.equal(render(closed).activeTab, 'home', 'Closing SHOP must restore the guard');
render(open).navigateTab('gvg');
assert.equal(render(open).activeTab, 'home', 'Other closed features stay blocked');
render(open).navigateTab('character', 'party');
assert.equal(render(open).activeTab, 'character');
assert.equal(render(open).characterEntryView, 'party');
console.log('PASS: shop CLOSED → OPEN → CLOSED navigation; GVG guard; character subtab. Isolated hook test, no network.');
