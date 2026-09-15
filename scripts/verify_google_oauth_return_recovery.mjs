import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { shouldAutoDetectAuthReturn, acceptOAuthReturn } from '../src/utils/oauthReturnSession.ts';

const root = 'https://www.tribe-neon.com';
assert.equal(shouldAutoDetectAuthReturn(root), true);
assert.equal(shouldAutoDetectAuthReturn(`${root}/#access_token=email-return`), true);
assert.equal(shouldAutoDetectAuthReturn(`${root}/auth/callback`), false);
assert.equal(shouldAutoDetectAuthReturn(`${root}/auth/callback/#access_token=google-return`), false);
assert.equal(shouldAutoDetectAuthReturn(`${root}/#error=access_denied&error_description=OAuth+state+has+expired`), false);

let current = { user: { id: 'original-guest', is_anonymous: true } };
const calls = [];
const auth = {
  getSession: async () => ({ data: { session: current }, error: null }),
  setSession: async tokens => {
    calls.push('set');
    current = { user: { id: tokens.access_token === 'same-user' ? 'original-guest' : 'other-google', is_anonymous: false } };
    return { data: { session: current }, error: null };
  },
  exchangeCodeForSession: async code => {
    calls.push('exchange');
    return { data: { session: { user: { id: code } } }, error: null };
  },
};
await assert.rejects(acceptOAuthReturn(auth, `${root}/auth/callback#error=access_denied&error_description=OAuth+state+has+expired`), /expired/);
assert.equal(current.user.id, 'original-guest');
assert.deepEqual(calls, []);
await assert.rejects(acceptOAuthReturn(auth, `${root}/auth/callback#access_token=partial`), /不足/);
assert.deepEqual(calls, []);
const original = (await auth.getSession()).data.session;
const same = await acceptOAuthReturn(auth, `${root}/auth/callback#access_token=same-user&refresh_token=test-refresh`);
assert.equal(same.data.session.user.id, original.user.id);
assert.deepEqual(calls, ['set']);
const changed = await acceptOAuthReturn(auth, `${root}/auth/callback#access_token=other-user&refresh_token=test-refresh`);
assert.notEqual(changed.data.session.user.id, original.user.id);
assert.deepEqual(calls, ['set', 'set']);
await acceptOAuthReturn(auth, `${root}/auth/callback?code=pkce-user`);
assert.deepEqual(calls, ['set', 'set', 'exchange']);
await acceptOAuthReturn(auth, `${root}/auth/callback`);
assert.deepEqual(calls, ['set', 'set', 'exchange']);
console.log('PASS: OAuth return routing, expired state, malformed return, implicit same/different UID, PKCE and no-token reload');

// Execute the real callback component with an isolated auth transport. This
// checks the UID guards and restoration, not just the URL parsing helper.
const require = createRequire(import.meta.url);
const callbackCode = ts.transpileModule(fs.readFileSync(new URL('../src/app/auth/callback/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function runCallback({ href, originalId = 'guest', destinationId = 'guest', error = null, hasProfile = true, switching = false }) {
  const effects = [], updates = [], operations = [];
  const storage = new Map();
  const originalSession = { user: { id: originalId, is_anonymous: true }, access_token: 'source-token', refresh_token: 'source-refresh' };
  let session = originalSession;
  if (switching) storage.set('tribe_existing_google_login_intent', JSON.stringify({ method: 'GOOGLE_SWITCH', sourceUserId: originalId }));
  else storage.set('tribe_onboarding_auth_intent', JSON.stringify({ method: 'GOOGLE', userId: originalId, startedAt: Date.now() }));
  let destination = null;
  const win = { location: { href, replace: value => { destination = value; } }, localStorage: {
    getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key), setItem: (key, value) => storage.set(key, value),
  }};
  const transport = {
    getSession: async () => ({ data: { session }, error: null }),
    setSession: async tokens => {
      operations.push(tokens.access_token === 'source-token' ? 'restore' : 'accept');
      if (error && tokens.access_token !== 'source-token') return { data: { session: null }, error: { message: error } };
      session = tokens.access_token === 'source-token' ? originalSession : { user: { id: destinationId, is_anonymous: false }, access_token: 'verified' };
      return { data: { session }, error: null };
    },
    exchangeCodeForSession: async () => transport.setSession({ access_token: 'destination-token' }),
  };
  const mocks = {
    react: { useEffect: f => effects.push(f), useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, v => updates.push(v)] },
    '@/utils/supabase': { supabase: { auth: transport, rpc: async () => ({ data: { has_profile: hasProfile }, error: null }) }, discardAnonymousAccountForSwitch: async () => { operations.push('discard'); return { data: { discardedUserId: originalId, gameplayMerged: false }, error: null }; } },
    '@/utils/oauthReturnSession': { acceptOAuthReturn },
    '@/utils/browserDetection': { consumeRememberedOAuthReturnTo: () => null, getOAuthReturnUrl: () => root + '/', getOAuthCallbackUrl: () => root + '/auth/callback' },
    '@/utils/kpiInstrumentation': { recordSameSubjectIdentityTransition: async () => {}, prepareAccountSwitchIdentityTransition: async () => null, commitAccountSwitchIdentityTransition: async () => {} },
    '@/utils/googleReplacementIntent': { GOOGLE_REPLACEMENT_INTENT_KEY: 'replacement', readGoogleReplacementIntent: () => null, readReplacementGuestSession: () => null },
  };
  const exports = {};
  new Function('require', 'exports', 'window', callbackCode)(name => mocks[name] ?? require(name), exports, win);
  exports.default();
  for (const effect of effects) effect();
  for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
  return { operations, session, destination, updates, storage };
}
const implicitUrl = `${root}/auth/callback#access_token=destination-token&refresh_token=destination-refresh`;
let result = await runCallback({ href: implicitUrl });
assert.deepEqual(result.operations, ['accept']);
assert.equal(result.destination, root + '/');
result = await runCallback({ href: implicitUrl, destinationId: 'different-google' });
assert.deepEqual(result.operations, ['accept', 'restore']);
assert.equal(result.session.user.id, 'guest');
assert.equal(result.destination, null);
assert.ok(result.updates.some(value => typeof value === 'string' && value.includes('account_switch=google')));
result = await runCallback({ href: `${root}/auth/callback?code=test-code`, destinationId: 'different-google' });
assert.deepEqual(result.operations, ['accept', 'restore']);
result = await runCallback({ href: `${root}/auth/callback#error=access_denied&error_description=OAuth+state+has+expired` });
assert.deepEqual(result.operations, []);
assert.equal(result.session.user.id, 'guest');
assert.equal(result.storage.has('tribe_onboarding_auth_intent'), false);
assert.ok(result.updates.some(value => typeof value === 'string' && value.includes('有効期限')));
result = await runCallback({ href: implicitUrl, destinationId: 'empty-google', switching: true, hasProfile: false });
assert.deepEqual(result.operations, ['accept', 'restore']);
assert.ok(result.destination.includes('NO_EXISTING_GAME_DATA'));
result = await runCallback({ href: implicitUrl, error: 'rejected' });
assert.deepEqual(result.operations, ['accept']);
assert.equal(result.destination, null);
console.log('PASS: real callback same-UID, implicit/PKCE collision restore, expiry retry, empty destination and rejected exchange');

const modalCode = ts.transpileModule(fs.readFileSync(new URL('../src/app/components/TutorialAuthentication.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const staleStorage = new Map([['tribe_onboarding_auth_intent', JSON.stringify({ method: 'GOOGLE', userId: 'old-guest', startedAt: Date.now() })]]);
let titleShown = false;
const modalWindow = { location: new URL(root), history: { replaceState() {} }, localStorage: {
  getItem: key => staleStorage.get(key) ?? null, removeItem: key => staleStorage.delete(key), setItem: (key, value) => staleStorage.set(key, value),
}};
const modalMocks = {
  react: { useCallback: f => f, useEffect() {}, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}] },
  '@/utils/supabase': { supabase: {}, usingMockSupabase: true },
  '@/utils/authIntents': { EMAIL_ONBOARDING_INTENT_KEY: 'email-intent', readEmailOnboardingIntent: () => null },
  '@/utils/browserDetection': {},
  '../context/GameContext': { useGame: () => ({ session: { user: { id: 'other-google', is_anonymous: false, identities: [{ provider: 'google' }] } }, onboardingState: { user_id: 'other-google', tutorial_step: 'AUTHENTICATION', gameplay_authorized: true }, setShowTitleView: value => { titleShown = value; } }) },
  '../context/hooks/useAuth': { EXISTING_GOOGLE_LOGIN_INTENT_KEY: 'tribe_existing_google_login_intent' },
  './ExternalBrowserGooglePrompt': { default: () => null },
  '@/utils/kpiInstrumentation': {}, '@/utils/googleReplacementIntent': {},
};
const modalExports = {};
new Function('require', 'exports', 'window', 'document', modalCode)(name => modalMocks[name] ?? require(name), modalExports, modalWindow, { title: 'TRIBE NEON' });
const modal = modalExports.default();
function findButton(node, label) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'button' && node.props.children === label) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = findButton(child, label); if (found) return found; }
  return null;
}
const recoveryButton = findButton(modal, 'タイトルに戻る');
assert.ok(recoveryButton);
assert.notEqual(recoveryButton.props.disabled, true);
recoveryButton.props.onClick();
assert.equal(titleShown, true);
assert.equal(staleStorage.has('tribe_onboarding_auth_intent'), false);
console.log('PASS: real mismatched-user dialog exits to title and clears stale Google intent');
