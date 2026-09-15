import assert from 'node:assert/strict';
import test from 'node:test';
import { readGoogleReplacementIntent, saveGoogleReplacementIntent, saveReplacementGuestSession, readReplacementGuestSession, clearGoogleReplacementIntent } from '../../src/utils/googleReplacementIntent.ts';
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data }; };
test('replacement proof is tab-scoped, cleared on completion, and intent rejects stale/future starts', () => {
  globalThis.window = { localStorage: storage(), sessionStorage: storage() };
  const intent = { method: 'GOOGLE_REPLACE', userId: 'guest', startedAt: Date.now(), phase: 'VERIFY' };
  saveGoogleReplacementIntent(intent);
  saveReplacementGuestSession({ access_token: 'private-access', refresh_token: 'private-refresh', user: { id: 'guest' } });
  assert.equal(readReplacementGuestSession().user.id, 'guest');
  assert.equal(readGoogleReplacementIntent().userId, 'guest');
  assert.equal(JSON.stringify([...window.localStorage.data]).includes('private-'), false);
  saveGoogleReplacementIntent({ ...intent, startedAt: Date.now() - 31 * 60 * 1000 });
  assert.equal(readGoogleReplacementIntent(), null);
  saveGoogleReplacementIntent({ ...intent, startedAt: Date.now() + 60_000 });
  assert.equal(readGoogleReplacementIntent(), null);
  saveGoogleReplacementIntent({ ...intent, intentId: 'durable-id', phase: 'LINK', startedAt: Date.now() - 31 * 60 * 1000 });
  assert.equal(readGoogleReplacementIntent().phase, 'LINK');
  saveGoogleReplacementIntent({ ...intent, intentId: 'durable-id', phase: 'CONFIRM', deletionStarted: true, startedAt: Date.now() - 31 * 60 * 1000 });
  assert.equal(readGoogleReplacementIntent().phase, 'CONFIRM');
  clearGoogleReplacementIntent();
  assert.equal(readReplacementGuestSession(), null);
  assert.equal(window.localStorage.data.size, 0);
});

test('destructive replacement uses one native Google credential and no post-delete account picker', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../src/app/auth/callback/page.tsx', import.meta.url), 'utf8');
  const nativeFlow = source.slice(source.indexOf('  const linkReplacement ='), source.indexOf('  const cancelReplacement ='));
  assert.match(nativeFlow, /linkIdentity\(\{ provider: "google", token, nonce: intent.intentId \}\)/);
  assert.match(nativeFlow, /phase: "confirm"[^\n]*googleIdToken/);
  assert.match(nativeFlow, /linkReplacement\(state, googleIdToken\)/);
  assert.doesNotMatch(nativeFlow, /signInWithOAuth|select_account|redirectTo/);
  assert.match(source, /digest\("SHA-256", new TextEncoder\(\).encode\(replacement.intent.intentId\)\)/);
  assert.match(source, /if \(!googleIdToken\) throw new Error/);
  assert.match(source, /state.intent.phase === "LINK" && await finishReplacement\(state\)/);
});
