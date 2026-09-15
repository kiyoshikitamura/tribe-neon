import { createHash, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { ReplacementError } from './replaceGoogle.ts';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
type GoogleJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
let cached: { keys: GoogleJwk[]; expires: number } | null = null;
function rejected(): never { throw new ReplacementError('同じGoogleアカウントで本人確認をやり直してください。'); }
/** Signature, issuer, audience, expiry and the prepared intent nonce are checked
 * before retiring any data. No claims from an unverified JWT grant authority. */
export async function verifiedGoogleSubject(
  token: string, audience: string, intentId: string,
  options: { now?: number; fetcher?: typeof fetch } = {},
): Promise<string> {
  if (!audience.trim()) throw new ReplacementError('Googleによる置き換え確認は準備中です。', 503);
  if (token.length > 16_384) rejected();
  const pieces = token.split('.');
  if (pieces.length !== 3) rejected();
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
  } catch { return rejected(); }
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') rejected();
  const now = options.now ?? Date.now();
  const fetcher = options.fetcher ?? fetch;
  async function keys(force: boolean) {
    if (!options.fetcher && !force && cached && cached.expires > now) return cached.keys;
    const result = await fetcher(CERTS_URL, { signal: AbortSignal.timeout(5000) });
    if (!result.ok) throw new ReplacementError('Googleの本人確認を検証できません。時間をおいて再度お試しください。', 503);
    const jwks = await result.json() as { keys?: GoogleJwk[] };
    if (!Array.isArray(jwks.keys)) throw new ReplacementError('Googleの本人確認を検証できません。', 503);
    if (!options.fetcher) cached = { keys: jwks.keys, expires: now + 300_000 };
    return jwks.keys;
  }
  let key = (await keys(false)).find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256'));
  if (!key) key = (await keys(true)).find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256'));
  if (!key || (key.use && key.use !== 'sig')) rejected();
  try {
    if (!verify('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(pieces[2], 'base64url'))) rejected();
  } catch { return rejected(); }
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') rejected();
  const aud = claims.aud;
  if (aud !== audience && !(Array.isArray(aud) && aud.includes(audience))) rejected();
  if ((Array.isArray(aud) && aud.length > 1 || claims.azp !== undefined) && claims.azp !== audience) rejected();
  // Leave time for supported native linking after the irreversible confirmation.
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now + 60_000 ||
      typeof claims.iat !== 'number' || claims.iat * 1000 > now + 60_000) rejected();
  const nonce = createHash('sha256').update(intentId).digest('hex');
  if (claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub) rejected();
  return claims.sub;
}
