import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { verifiedGoogleSubject } from '../src/server/auth/googleIdToken.ts';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const audience = 'preview.apps.googleusercontent.com';
const intentId = '33333333-3333-4333-8333-333333333333';
const now = Date.now();
const base = { iss: 'https://accounts.google.com', sub: 'google-user-123', aud: audience, exp: Math.floor(now/1000)+3600, iat: Math.floor(now/1000), nonce: createHash('sha256').update(intentId).digest('hex') };
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const fetcher = async url => { assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs'); return new Response(JSON.stringify({ keys: [jwk] })); };
function token(claims = base, header = { alg: 'RS256', kid: 'test-key' }) {
 const input = [header, claims].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}
const check = jwt => verifiedGoogleSubject(jwt, audience, intentId, { now, fetcher });
assert.equal(await check(token()), base.sub);
for (const patch of [{ aud: 'other-client' }, { iss: 'https://evil.test' }, { exp: Math.floor(now/1000)-1 }, { nonce: 'other-intent' }, { azp: 'other-client' }, { iat: Math.floor(now/1000)+300 }, { sub: '' }]) await assert.rejects(check(token({ ...base, ...patch })));
await assert.rejects(check(token(base, { alg: 'none', kid: 'test-key' })));
const good = token(); await assert.rejects(check(`${good.slice(0, good.lastIndexOf('.')+1)}AAAA`));
await assert.rejects(verifiedGoogleSubject(good, '', intentId, { now, fetcher }), /準備中/);
console.log('PASS Google ID token: RSA signature, issuer, audience/azp, expiry, nonce, sub, missing configuration fail closed');
