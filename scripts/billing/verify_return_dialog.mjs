/** Isolated execution of the return route and status dialog. No DB/Stripe writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path, modules) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(id => {
    assert.ok(id in modules, `unexpected dependency ${id}`);
    return modules[id];
  }, exports);
  return exports.default;
}
const route = load('src/app/billing/return/page.tsx', {
  'next/navigation': { redirect: url => { throw new Error(url); } },
});
await assert.rejects(route({ searchParams: Promise.resolve({ order: 'order&evil=1' }) }), { message: '/?billing_order=order%26evil%3D1' });
await assert.rejects(route({ searchParams: Promise.resolve({}) }), { message: '/?billing_order=' });

async function dialog({ status = 'PENDING', session = true, historyFailure = false, restoreFailure = false } = {}) {
  const states = [], refs = [], effects = [], calls = [], cleared = [], granted = [];
  let stateIndex = 0, refIndex = 0, closed = false;
  const hooks = {
    useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useRef: value => refs[refIndex++] ||= { current: value },
    useCallback: cb => cb,
    useEffect: fn => effects.push(fn),
  };
  const component = load('src/app/components/BillingStatusDialog.tsx', {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/utils/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: session ? { access_token: 'fixture', user: { id: 'u' } } : null } }) } } },
    '@/utils/billing_client': {
      billingFetch: async endpoint => {
        calls.push(endpoint);
        if (endpoint === 'restore') { if (restoreFailure) throw Error('network unavailable'); return { status }; }
        if (historyFailure) throw Error('history unavailable');
        return { orders: [{ id: 'order', product_id: 'pack' }] };
      },
      clearBillingRequest: (...args) => cleared.push(args),
    },
    './ui/CanonicalDialog': { __esModule: true, default: 'Dialog' },
  });
  const render = () => { stateIndex = 0; refIndex = 0; return component({ orderId: 'order', onClose: () => { closed = true; }, onGranted: (...args) => { granted.push(args); return new Promise(() => {}); } }); };
  let tree = render(); effects.forEach(effect => effect());
  // Duplicate auto/manual checks during the same request do not dispatch twice.
  void tree.props.actions[0].onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  return { states, calls, cleared, granted, tree, close: () => { tree.props.onClose(); return closed; } };
}
let result = await dialog();
assert.match(result.states[1], /まだ確定していません/);
assert.deepEqual(result.calls, ['restore']);
assert.ok(result.close());
result = await dialog({ session: false });
assert.match(result.states[1], /ログインし直し/);
assert.deepEqual(result.calls, []);
result = await dialog({ status: 'GRANTED' });
assert.match(result.states[1], /購入が完了/);
assert.deepEqual(result.cleared, [['u', 'pack', 'checkout']]);
assert.deepEqual(result.granted, [['u', 'order']]);
assert.ok(result.close(), 'closing must not wait for bootstrap');
await result.tree.props.actions[0].onClick();
assert.equal(result.granted.length, 1, 'repeat status check must not refresh twice');
result = await dialog({ status: 'GRANTED', historyFailure: true });
assert.match(result.states[1], /購入が完了/);
result = await dialog({ status: 'EXPIRED' });
assert.match(result.states[1], /期限が終了/);
result = await dialog({ restoreFailure: true });
assert.equal(result.states[1], 'network unavailable');
assert.equal(result.tree.props.actions[0].disabled, false);
await result.tree.props.actions[0].onClick();
assert.deepEqual(result.calls, ['restore', 'restore']);
result = await dialog({ status: 'UNKNOWN' });
assert.match(result.states[1], /まだ確定していません/);
console.log('PASS: legacy return encoding, authorized status, pending/unknown, expired, missing session, retry, duplicate request, close, nonblocking history failure');
