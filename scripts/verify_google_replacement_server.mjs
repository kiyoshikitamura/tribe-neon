import assert from 'node:assert/strict';
import { replaceGoogle, previewReplacementAllowed } from '../src/server/auth/replaceGoogle.ts';
const sourceId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const intentId = '33333333-3333-4333-8333-333333333333';
const google = (id, subject = 'google-sub') => ({ id, is_anonymous: false, identities: [{ id: subject, provider: 'google' }] });
const guest = { id: sourceId, is_anonymous: true, identities: [] };
function fixture() {
  let intent = null, target = google(targetId), current = guest, deleted = 0, retired = 0;
  let loseDeleteResponse = false, failLookup = false;
  const store = {
    async googleSubject(token, id) { assert.equal(id, intentId); if (token === 'valid-google-id-token') return 'google-sub'; if (token === 'wrong-google-id-token') return 'wrong-sub'; throw Error('invalid Google ID token'); },
    async verifiedUser(token) { if (token === 'guest') return current; if (token === 'google') return target; throw Error('bad token'); },
    async userById() { if (failLookup) throw Error('network'); return target; },
    async username(id) { return id === sourceId ? 'current game' : 'old game'; },
    async prepare(value) { intent = { ...value, id: intentId, updated_at: '1' }; return { ...intent }; },
    async intent() { return intent && { ...intent }; },
    async transition(previous, status) {
      if (intent.status !== previous.status || intent.updated_at !== previous.updated_at) return null;
      if (status === 'DELETING') retired++;
      intent = { ...intent, status, updated_at: String(Number(intent.updated_at) + 1) };
      return { ...intent };
    },
    async deleteUser(id) {
      assert.equal(id, targetId); assert.equal(intent.status, 'DELETING'); assert.equal(retired, 1);
      deleted++; target = null;
      if (loseDeleteResponse) { loseDeleteResponse = false; throw Error('lost response'); }
    },
  };
  return { store, get deleted() { return deleted; }, get intent() { return intent; },
    current(value) { current = value; }, target(value) { target = value; },
    lose() { loseDeleteResponse = true; }, fail() { failLookup = true; } };
}
const prepare = f => replaceGoogle(f.store, 'guest', { phase: 'prepare', googleAccessToken: 'google' });
const confirm = f => replaceGoogle(f.store, 'guest', { phase: 'confirm', intentId, confirmed: true, googleIdToken: 'valid-google-id-token' });
const finish = f => replaceGoogle(f.store, 'guest', { phase: 'finalize', intentId });
const env = { GOOGLE_ACCOUNT_REPLACEMENT_ENABLED: 'true', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/formal-open-integration-preview-20260914', NEXT_PUBLIC_SUPABASE_URL: 'https://sufvuqdnqohpfzkwxohq.supabase.co' };
assert.equal(previewReplacementAllowed(env), true);
for (const patch of [{ GOOGLE_ACCOUNT_REPLACEMENT_ENABLED: undefined }, { GOOGLE_ACCOUNT_REPLACEMENT_ENABLED: 'false' }, { VERCEL_ENV: 'production' }, { VERCEL_GIT_COMMIT_REF: 'main' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://ktpolnkyyfkowxdmijww.supabase.co' }]) assert.equal(previewReplacementAllowed({ ...env, ...patch }), false);
{
 const f = fixture(); await prepare(f); assert.equal(f.deleted, 0);
 await assert.rejects(replaceGoogle(f.store, 'guest', { phase: 'confirm', intentId }), /再確認/);
 assert.equal(f.deleted, 0);
 await assert.rejects(replaceGoogle(f.store, 'guest', { phase: 'confirm', intentId, confirmed: true }), /本人確認/);
 await assert.rejects(replaceGoogle(f.store, 'guest', { phase: 'confirm', intentId, confirmed: true, googleIdToken: 'wrong-google-id-token' }), /本人確認/);
 assert.equal(f.deleted, 0); assert.equal(f.intent.status, 'PREPARED');
 const results = await Promise.allSettled([confirm(f), confirm(f)]);
 assert.equal(results.some(r => r.status === 'fulfilled'), true); assert.equal(f.deleted, 1);
 assert.equal((await confirm(f)).status, 'RELEASED'); assert.equal(f.deleted, 1);
 await assert.rejects(finish(f), /まだ完了/);
 f.current(google(sourceId, 'wrong-google')); await assert.rejects(finish(f), /まだ完了/);
 f.current(google(targetId)); await assert.rejects(finish(f), /確認できません/);
 f.current(google(sourceId)); assert.equal((await finish(f)).status, 'COMPLETED');
 assert.equal((await finish(f)).status, 'COMPLETED');
}
{
 const f = fixture(); await prepare(f); f.lose(); await assert.rejects(confirm(f), /lost response/);
 assert.equal(f.intent.status, 'DELETING'); assert.equal((await confirm(f)).status, 'RELEASED'); assert.equal(f.deleted, 1);
}
{
 const f = fixture(); await prepare(f); f.fail(); await assert.rejects(confirm(f), /network/); assert.equal(f.deleted, 0); assert.equal(f.intent.status, 'PREPARED');
}
{
 const f = fixture(); await prepare(f); f.target(google(targetId, 'changed'));
 await assert.rejects(confirm(f), /変更/); assert.equal(f.deleted, 0);
}
{
 const f = fixture(); await prepare(f); await replaceGoogle(f.store, 'guest', { phase: 'cancel', intentId });
 await assert.rejects(confirm(f), /終了/); assert.equal(f.deleted, 0);
}
{
 const f = fixture(); f.target({ ...google(targetId), identities: [...google(targetId).identities, { provider: 'email', id: 'email-id' }] });
 await assert.rejects(prepare(f), /確認できません/); assert.equal(f.deleted, 0);
}
console.log('PASS Google replacement server: environment isolation, second confirmation, concurrent/retry, lost response, fail-closed lookup, exact original identity, cancellation, multiple identity rejection');
