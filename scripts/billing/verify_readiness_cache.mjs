import assert from 'node:assert/strict';
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let now = 1000, calls = 0, finish;
Date.now = () => now;
globalThis.fetch = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
try {
  const { loadBillingReadiness, peekBillingReadiness } = await import('../../src/utils/billing_config_client.ts');
  const ready = { available: true, catalogVersion: '20260913', mode: 'sandbox' };
  const first = loadBillingReadiness();
  const second = loadBillingReadiness();
  assert.equal(calls, 1);
  finish({ ok: true, json: async () => ready });
  assert.deepEqual(await first, ready); assert.deepEqual(await second, ready);
  await loadBillingReadiness(); assert.equal(calls, 1);
  now += 30001;
  assert.equal(peekBillingReadiness(), null);
  const expired = loadBillingReadiness(); assert.equal(calls, 2);
  finish({ ok: true, json: async () => ready }); await expired;
  const forced = loadBillingReadiness(true); assert.equal(calls, 3);
  finish({ ok: true, json: async () => ({ available: false }) }); await forced;
  assert.equal(peekBillingReadiness(), null);
  const recovery = loadBillingReadiness(); assert.equal(calls, 4);
  finish({ ok: true, json: async () => ready }); await recovery;
  console.log('PASS: readiness prefetch deduplicated, fresh reuse, TTL expiry, forced retry, unavailable not cached, recovery. Purchase authority unchanged.');
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
