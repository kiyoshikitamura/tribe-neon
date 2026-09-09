import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';

const sourceSha = '2d2d2b1563e92f1471f9c86fa8a7cc59040ec726';
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();
if (git('rev-parse', 'HEAD') !== sourceSha) throw Error('Run before the evidence commit from exact source SHA');
const privateRoot = path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14');
const credentials = JSON.parse(fs.readFileSync(path.join(privateRoot, 'outputs/raid-device-credentials.private.json'), 'utf8'));
const env = parseEnv(fs.readFileSync(path.join(privateRoot, '.env.raid-preview.local'), 'utf8'));
const forbidden = [...credentials.users.flatMap(user => [user.password, user.email]), env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean);
const files = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
if (!files.length) throw Error('No staged evidence');
for (const file of files) {
  if (!/^(scripts\/raid-step6\/|docs\/development\/(evidence\/raid-step6\/|raid_step6_[^/]+\.md$|agent_tasks\/RAID-STEP6-[ABC]\.md$))/.test(file)) throw Error(`Unexpected staged path: ${file}`);
  if (file.endsWith('.png')) continue; // Parent reviews every screenshot visually.
  const text = git('show', `:${file}`);
  if (forbidden.some(value => text.includes(value)) || /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text)) throw Error(`Sensitive content rejected: ${file}`);
}
git('diff', '--exit-code', sourceSha, '--', 'src', 'supabase/migrations');
console.log(JSON.stringify({sourceSha, stagedFiles: files.length, textSecretScan: 'PASS', productSourceUnchanged: true, screenshots: 'require separate parent visual review'}));
