import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseEnv} from 'node:util';

// Explicit safe files only. Never collect storageState, command gates, HAR or logs.
const source = 'outputs/raid-step6-supplement';
const destination = 'docs/development/evidence/raid-step6-supplement';
const names = [
  'a-room.json', 'a-ui-start-first-attempt.json', 'a-ui-start.json', 'a-db-confirmation.json',
  'a-setup.png', 'a-result.png', 'a-result-reloaded.png', 'a-returned-room.png',
  'b-actor.json', 'b-actor-2.json', 'b-normal-http.json', 'b-outsider-read.json',
  'b-normal-power-selection.png', 'b-normal-power-refused.png', 'b-normal-ui-refusal.json', 'b-level-result.json',
  'b-outsider-activity.png', 'b-outsider-joined.png', 'b-outsider-join.json', 'b-assert-read.json',
  'b-outsider-ended-card.png', 'b-outsider-ended-detail.png', 'b-outsider-ended-ui.json',
  'b-final-actor.json', 'b-fresh-equipment403.json', 'b-summary.json',
  'c-equipment-local.json', 'c-projection-local.json', 'c-initializer-candidate.sql',
  'parent-candidate-typecheck.json', 'parent-deployment-before.json', 'parent-deployment-final.json',
  'parent-natural-expiry.json', 'parent-qa-classification.json', 'parent-candidate-absent.json', 'parent-lint.json',
];
// Additional B results are reviewed and named explicitly in this file before collection.
const privateRoot = path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14');
const credentials = JSON.parse(fs.readFileSync(path.join(privateRoot, 'outputs/raid-device-credentials.private.json'), 'utf8'));
const env = parseEnv(fs.readFileSync(path.join(privateRoot, '.env.raid-preview.local'), 'utf8'));
const forbidden = [...credentials.users.flatMap(user => [user.password, user.email]), env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(destination, {recursive: true});
const artifacts = names.map(name => {
  let bytes = fs.readFileSync(path.join(source, name));
  const originalSha256 = hash(bytes);
  if (!name.endsWith('.png')) {
    const text = bytes.toString('utf8');
    if (forbidden.some(value => text.includes(value)) || /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text)) {
      throw Error(`Sensitive content rejected: ${name}`);
    }
    if (name.endsWith('.json')) JSON.parse(text);
    bytes = Buffer.from(text.replace(/\r\n/g, '\n'));
  }
  fs.writeFileSync(path.join(destination, name), bytes);
  return {file: name, bytes: bytes.length, sha256: hash(bytes), originalSha256};
});
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({
  sourceSha: '2d2d2b1563e92f1471f9c86fa8a7cc59040ec726',
  priorEvidenceSha: 'b8ad912782f49fb6a58eef4f12b0cea95856e4f0',
  sha256Scope: 'Git blob bytes: text LF-normalized; PNG unchanged; originalSha256 records source worktree bytes.',
  artifacts,
}, null, 2) + '\n');
console.log(JSON.stringify({collected: artifacts.length, textCredentialScan: 'PASS'}));
