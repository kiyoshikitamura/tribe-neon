/** API orchestration with isolated DB/Stripe fixtures. No network or persistent data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import ts from 'typescript';
import * as contracts from '../../src/server/billing/contracts.ts';
import * as catalog from '../../src/server/billing/catalog.ts';
import { reconcileCheckout } from '../../src/server/billing/reconciliation.ts';
import { billingFetch, billingRequestId } from '../../src/utils/billing_client.ts';

const origin = 'https://qa.example.com';
const requestId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const products = [
  ...catalog.PAID_PACKS.map(p => ({ ...p, title: p.id, validity_days: 120, items: Object.entries(p.items).map(([itemId, quantity]) => ({ itemId, quantity })) })),
  ...catalog.DIA_PRODUCTS.map(p => ({ ...p, title: p.id, validity_days: 120 })),
];
const response = (data, status = 200) => Response.json(data, { status });
const failure = error => response({ error: error.message }, error instanceof contracts.BillingError ? error.status : 500);
function route(name, service) {
  const path = new URL(`../../src/app/api/billing/${name}/route.ts`, import.meta.url);
  const compiled = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = {
    '@/server/billing/contracts': contracts,
    '@/server/billing/catalog': catalog,
    '@/server/billing/reconciliation': { terminalOrderResult: item => ['GRANTED', 'EXPIRED'].includes(item.status) ? { status: item.status, order_id: item.id } : null },
    '@/server/billing/service': { billingService: () => service, billingResponse: response, billingFailure: failure },
  };
  new Function('require', 'exports', compiled)(id => {
    if (!(id in modules)) throw Error(`Unexpected dependency: ${id}`);
    return modules[id];
  }, exports);
  return exports.POST;
}
function fixture() {
  let item = { id: orderId, user_id: userId, product_id: 'beginner_pack_01', amount_jpy: 100, billing_mode: 'sandbox', status: 'PENDING', stripe_session_id: null, created_at: new Date().toISOString(), product_snapshot: products[0] };
  let session = { id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/fixture', livemode: false, status: 'open', payment_status: 'unpaid', amount_total: 100, currency: 'jpy', client_reference_id: orderId, metadata: { order_id: orderId, user_id: userId, product_id: item.product_id } };
  const calls = [];
  const service = {
    config: { origin, mode: 'sandbox', webhookSecret: 'whsec_fixture' },
    assertPurchasingAllowed: async () => {},
    authenticatedUser: async request => {
      if (request.headers.get('authorization') !== 'Bearer fixture') throw new contracts.BillingError('login', 401);
      return userId;
    },
    db: { from: () => ({ select: async () => ({ data: products }) }) },
    order: async (id, owner) => {
      if (id !== orderId || (owner && owner !== item.user_id)) throw new contracts.BillingError('order', 404);
      return { ...item };
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'billing_reserve_order') return { ...item };
      if (name === 'billing_attach_session') item.stripe_session_id = args.p_session_id;
      if (name === 'billing_grant_order') item.status = 'GRANTED';
      if (name === 'billing_expire_order' && item.status !== 'GRANTED') item.status = 'EXPIRED';
      return { status: item.status, order_id: item.id };
    },
    stripe: async (path, body, key) => {
      calls.push({ name: 'stripe', path, body, key });
      return { ...session };
    },
  };
  service.reconcile = (value, existing) => reconcileCheckout(value, { order: service.order, rpc: service.rpc, validate: contracts.validateSession }, existing);
  return { service, calls, item: patch => Object.assign(item, patch), session: patch => Object.assign(session, patch) };
}
const req = (body, base = origin, token = 'fixture') => new Request(`${base}/api/billing/checkout`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, origin: base }, body: JSON.stringify(body),
});
const input = { requestId, productId: 'beginner_pack_01' };

for (const name of ['checkout', 'shop']) {
  const f = fixture();
  f.service.assertPurchasingAllowed = async (feature, owner) => {
    assert.equal(owner, userId, 'Only server-authenticated owner is checked');
    assert.equal(feature, name === 'checkout' ? 'PAYMENT' : 'SHOP');
    throw new contracts.BillingError('maintenance', 503);
  };
  assert.equal((await route(name, f.service)(req(input))).status, 503);
  assert.deepEqual(f.calls, [], 'Closed operations must not reserve, charge or create Stripe sessions');
}
for (const feature of ['PAYMENT', 'SHOP']) {
  const open = [{ feature_key: 'MAINTENANCE', state: 'CLOSED', mutation_allowed: false }, { feature_key: feature, state: 'OPEN', mutation_allowed: true }];
  contracts.assertPurchaseOperatingStates(open, feature);
  contracts.assertPurchaseOperatingStates([{ ...open[0], state: 'MAINTENANCE' }, open[1]], feature, true);
  assert.throws(() => contracts.assertPurchaseOperatingStates([{ ...open[0], state: 'MAINTENANCE' }, { ...open[1], state: 'CLOSED' }], feature, true));
  for (const rows of [null, [], open.slice(1), open.slice(0, 1),
    [{ ...open[0], state: 'MAINTENANCE' }, open[1]],
    [open[0], { ...open[1], state: 'CLOSED' }],
    [open[0], { ...open[1], mutation_allowed: false }]]) {
    assert.throws(() => contracts.assertPurchaseOperatingStates(rows, feature), error => error.status === 503);
  }
}

// Client price/quantity are not authoritative; retry only retrieves attached session.
{
  const f = fixture(), post = route('checkout', f.service);
  const first = await post(req({ ...input, amount: 1, quantity: 999 }));
  assert.equal(first.status, 200);
  const creation = f.calls.find(c => c.name === 'stripe');
  assert.equal(creation.body.get('line_items[0][price_data][unit_amount]'), '100');
  assert.equal(creation.body.get('line_items[0][quantity]'), '1');
  assert.equal(creation.body.get('success_url'), `${origin}/billing/return?order=${orderId}`);
  assert.equal(creation.key, `tn-sandbox-${orderId}`);
  await post(req(input));
  assert.equal(f.calls.filter(c => c.name === 'stripe' && c.body).length, 1);
  assert.equal(f.calls.filter(c => c.name === 'billing_grant_order').length, 0);
}
// Reject auth/origin/product before creating or reserving an order.
for (const request of [req(input, 'https://old.example.com'), req(input, origin, 'invalid'), req({ ...input, productId: 'invented' })]) {
  const f = fixture();
  assert.ok((await route('checkout', f.service)(request)).status >= 400);
  assert.equal(f.calls.length, 0);
}
{
  const f = fixture();
  f.item({ created_at: new Date(Date.now() - 24 * 3600_000).toISOString() });
  assert.equal((await route('checkout', f.service)(req(input))).status, 409);
  assert.equal(f.calls.some(c => c.name === 'stripe'), false);
}
const webhook = (f, patch = {}, valid = true) => {
  const raw = JSON.stringify({ livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_test_fixture' } }, ...patch });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', valid ? 'whsec_fixture' : 'whsec_wrong').update(`${t}.${raw}`).digest('hex');
  return route('webhook', f.service)(new Request(`${origin}/api/billing/webhook`, { method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
};
{
  const f = fixture();
  assert.equal((await webhook(f, {}, false)).status, 400);
  assert.equal((await webhook(f, { livemode: true })).status, 400);
  assert.equal(f.calls.length, 0);
  // A signed completion event cannot grant while the retrieved session is unpaid.
  assert.equal((await webhook(f)).status, 200);
  assert.equal(f.calls.some(c => c.name === 'billing_grant_order'), false);
  f.session({ status: 'complete', payment_status: 'paid' });
  assert.equal((await webhook(f)).status, 200);
  assert.equal((await webhook(f)).status, 200);
  assert.equal(f.calls.filter(c => c.name === 'billing_grant_order').length, 1);
  f.session({ status: 'expired', payment_status: 'unpaid' });
  assert.equal((await webhook(f, { type: 'checkout.session.expired' })).status, 200);
  assert.equal(f.calls.some(c => c.name === 'billing_expire_order'), false);
}
for (const patch of [{ amount_total: 1 }, { metadata: { order_id: orderId, user_id: 'another', product_id: 'beginner_pack_01' } }]) {
  const f = fixture(); f.session({ status: 'complete', payment_status: 'paid', ...patch });
  assert.equal((await webhook(f)).status, 409);
  assert.equal(f.calls.some(c => c.name === 'billing_grant_order'), false);
}
{
  const f = fixture(); f.item({ user_id: 'another' });
  assert.equal((await route('restore', f.service)(req({ orderId }))).status, 404);
  assert.equal(f.calls.length, 0);
}
// Browser transport timeout preserves the original purchase request ID.
const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
try {
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const id = billingRequestId(userId, input.productId, 'checkout');
  let abort, timerCleared = false;
  globalThis.setTimeout = (fn, milliseconds) => { assert.equal(milliseconds, 30_000); abort = fn; return 1; };
  globalThis.clearTimeout = () => { timerCleared = true; };
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('timeout')));
    abort();
  });
  await assert.rejects(billingFetch('checkout', 'fixture', { ...input, requestId: id }), /同じ商品から再試行/);
  assert.equal(billingRequestId(userId, input.productId, 'checkout'), id);
  assert.equal(timerCleared, true);
} finally {
  globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage;
  globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout;
}
console.log('PASS: API fixture checkout/retry/origin/auth/catalog, signed webhook/unpaid/duplicate/late/mismatch, restore owner, client timeout/request-ID retention. No real Stripe/DB calls.');
