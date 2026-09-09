import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const read=f=>process.argv.includes('--index')?execFileSync('git',['show',':'+f],{cwd:root,maxBuffer:20*1024*1024}):fs.readFileSync(path.join(root,f));
const manifest=JSON.parse(read('docs/development/raid-launch-integration/bundle-manifest.json'));
for(const f of manifest.artifacts){if(createHash('sha256').update(read(f.file)).digest('hex')!==f.sha256)throw Error('Artifact hash drift: '+f.file);}
const original=read('config/raid-room/launch-balance.sql').toString();
const expected='-- Transaction is controlled by review-apply-v2.psql. Function bodies/data match 6c6b4fe.\n'+original.replace(/^begin;\n/m,'').replace(/^commit;\s*$/m,'');
if(read('docs/development/raid-launch-integration/bundle/06-launch-balance.sql').toString()!==expected)throw Error('Launch delta differs from accepted SQL');
console.log(JSON.stringify({status:'PASS',artifacts:manifest.artifacts.length,originalBundleUnchanged:true,launchBodiesAndDataIdentical:true,index:process.argv.includes('--index')}));
