import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';

// Explicit safe artifacts only; never collect output directories recursively.
const selections = {
  'outputs/step6': ['driver-manifest.json', 'driver-tool-transaction.sql', 'restore-two-functions-review-only.sql', 'parent-apply-result.json', 'postflight.json', 'fresh-equipment-post.json', 'qa-hp-fixture-executed.sql', 'qa-hp-fixture-result.json', 'new-room-issued-presents.json', 'final-protection-readback.json', 'verification-lint.json'],
  'outputs/raid-step6': ['deployment-readback.json', 'deployment-final-readback.json', 'edge-source-match.json', 'asset-get-readback.json', 'preflight-roles.json', 'top-http.json', 'new-room-state.json', 'new-room-projection.json', 'outside-daily.json', 'normal-battle.json', 'qualification-host.json', 'qualification-rescue.json', 'rescue-visibility-http.json', 'browser-login.json', 'normal-recovery-initial.json', 'normal-recovery.json', 'host-final-battle.json', 'new-room-reward-claims.json', 'host-final-ui.json', 'daily-rescue-ui.json', 'normal-daily-rescue-ui.json', 'rescue-daily-rescue-ui.json'],
};
const privateRoot = path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14');
const credentials = JSON.parse(fs.readFileSync(path.join(privateRoot, 'outputs/raid-device-credentials.private.json'), 'utf8'));
const env = parseEnv(fs.readFileSync(path.join(privateRoot, '.env.raid-preview.local'), 'utf8'));
const forbidden = [...credentials.users.flatMap(user => [user.password, user.email]), env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean);
const destination = 'docs/development/evidence/raid-step6';
fs.mkdirSync(destination, {recursive: true});
const manifest = [];
function collect(source, name) {
  if (!fs.existsSync(source)) return;
  let bytes = fs.readFileSync(source);
  const originalSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!name.endsWith('.png')) {
    const text = bytes.toString('utf8');
    if (forbidden.some(value => text.includes(value)) || /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text)) {
      throw Error(`Sensitive content rejected: ${source}`);
    }
    if (name.endsWith('.json')) JSON.parse(text);
    bytes = Buffer.from(text.replace(/\r\n/g, '\n'));
  }
  fs.writeFileSync(path.join(destination, name), bytes);
  manifest.push({file: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), originalSha256});
}
for (const [directory, names] of Object.entries(selections)) {
  for (const name of names) collect(path.join(directory, name), name);
}
// Screenshots are reviewed visually before commit. No storageState, trace or HAR.
const screens = 'outputs/raid-step6/screens';
if (fs.existsSync(screens)) {
  for (const name of fs.readdirSync(screens).filter(name => name.endsWith('.png'))) collect(path.join(screens, name), name);
}
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({sourceSha: '2d2d2b1563e92f1471f9c86fa8a7cc59040ec726', sha256Scope: 'Git blob bytes: text LF-normalized; PNG unchanged. originalSha256 records the collected worktree bytes before normalization.', artifacts: manifest}, null, 2));
console.log(JSON.stringify({collected: manifest.length, textCredentialScan: 'PASS', screenshotsRequireVisualReview: true}));
