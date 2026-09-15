import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const dest='docs/development/evidence/raid-step6-local-fixes';
const outputs='outputs/raid-step6-local-fixes';
const copy=['c-authority-local.json','c-equipment-vertical.json','typecheck.json','lint.json','regression.json','raid-errors.txt','raid-browser.txt','raid-replay.txt','equipment-projection.txt','equipment-sql.txt','equipment-vertical.txt'];
const verify=process.argv.includes('--verify-staged');
if(!verify){
  for(const name of copy) fs.copyFileSync(`${outputs}/${name}`,`${dest}/${name}`);
  fs.copyFileSync(`${outputs}/a-visual/create-power-390.png`,`${dest}/create-power-390.png`);
  fs.copyFileSync(`${outputs}/a-visual/result.json`,`${dest}/a-visual.json`);
}
const names=[...copy,'create-power-390.png','a-visual.json','natural-expiry-read.json','initializer-preview-read.json','saved-replay-metadata.json','b-replay-normal-390x600.png','b-replay-reload-390x600.png','b-replay-unknown-390x600.png','b-background-visual.json'];
const privateRoot=path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14');
const credentials=JSON.parse(fs.readFileSync(path.join(privateRoot,'outputs/raid-device-credentials.private.json'),'utf8'));
const env=parseEnv(fs.readFileSync(path.join(privateRoot,'.env.raid-preview.local'),'utf8'));
const forbidden=[...credentials.users.flatMap(u=>[u.password,u.email]),env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const artifacts=verify?JSON.parse(fs.readFileSync(`${dest}/manifest.json`,'utf8')).artifacts:names.map(name=>{
  let bytes=fs.readFileSync(`${dest}/${name}`);const originalSha256=hash(bytes);
  if(!name.endsWith('.png')){
    const text=bytes.toString('utf8');
    if(forbidden.some(v=>text.includes(v))||/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text)) throw Error(`Sensitive evidence: ${name}`);
    if(name.endsWith('.json'))JSON.parse(text);
    bytes=Buffer.from(text.replace(/\r\n/g,'\n').trimEnd()+'\n');fs.writeFileSync(`${dest}/${name}`,bytes);
  }
  return {file:name,bytes:bytes.length,sha256:hash(bytes),originalSha256};
});
if(!verify)fs.writeFileSync(`${dest}/manifest.json`,JSON.stringify({baseSha:'648a513038284cfbcb65d3cf3a74ce02872cc9c4',sha256Scope:'Git blob bytes, text LF and one final newline; PNG unchanged',artifacts},null,2)+'\n');
if(process.argv.includes('--verify-staged')){
  const git=args=>execFileSync('git',args,{maxBuffer:16*1024*1024});
  const staged=git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
  for(const name of staged.filter(n=>!n.endsWith('.png'))){const text=git(['show',`:${name}`]).toString();if(forbidden.some(v=>text.includes(v))||/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text))throw Error(`Sensitive staged file: ${name}`);}
  for(const a of artifacts){const bytes=git(['show',`:${dest}/${a.file}`]);if(hash(bytes)!==a.sha256||bytes.length!==a.bytes)throw Error(`Hash mismatch: ${a.file}`);}
  git(['diff','--cached','--check']);
}
console.log(JSON.stringify({artifacts:artifacts.length,secretScan:'PASS',stagedHashes:process.argv.includes('--verify-staged')?'PASS':'not checked'}));
