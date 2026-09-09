import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const git = args => execFileSync('git', args, {maxBuffer: 16 * 1024 * 1024});
const names = git(['diff', '--cached', '--name-only', '-z']).toString().split('\0').filter(Boolean);
const allowed = name => /^docs\/development\/agent_tasks\/RAID-STEP6-SUPPLEMENT-[ABC]\.md$/.test(name)
  || /^docs\/development\/raid_step6_supplement_(?:a|b|c|report)\.md$/.test(name)
  || name.startsWith('docs/development/evidence/raid-step6-supplement/')
  || name.startsWith('scripts/raid-step6-supplement/');
if (!names.length || names.some(name => !allowed(name))) throw Error('Unexpected staged scope');
if (git(['diff', '--cached', '--name-only', '--diff-filter=MDR']).length) throw Error('Prior tracked evidence/source changed');
const privateRoot = path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14');
const credentials = JSON.parse(fs.readFileSync(path.join(privateRoot, 'outputs/raid-device-credentials.private.json'), 'utf8'));
const env = parseEnv(fs.readFileSync(path.join(privateRoot, '.env.raid-preview.local'), 'utf8'));
const forbidden = [...credentials.users.flatMap(user => [user.password, user.email]), env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean);
for (const name of names.filter(name => !name.endsWith('.png'))) {
  const text = git(['show', `:${name}`]).toString();
  if (forbidden.some(value => text.includes(value)) || /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text)) {
    throw Error(`Sensitive content rejected: ${name}`);
  }
}
const root = 'docs/development/evidence/raid-step6-supplement';
const manifest = JSON.parse(git(['show', `:${root}/manifest.json`]));
for (const artifact of manifest.artifacts) {
  const bytes = git(['show', `:${root}/${artifact.file}`]);
  if (bytes.length !== artifact.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw Error(`Manifest mismatch: ${artifact.file}`);
}
// A literal unified patch preserves context/removed whitespace from the original source.
const patch = 'scripts/raid-step6-supplement/parent-equipment-projection.patch';
git(['diff', '--cached', '--check', '--', '.', `:(exclude)${patch}`]);
git(['apply', '--check', patch]);
console.log(JSON.stringify({stagedFiles: names.length, artifactHashes: manifest.artifacts.length, scope: 'PASS', textSecrets: 'PASS', priorFilesUnchanged: true, diffCheck: 'PASS excluding literal patch context whitespace', unappliedPatchCheck: 'PASS'}));
