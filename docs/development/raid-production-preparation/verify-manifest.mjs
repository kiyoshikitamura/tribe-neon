import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'audit-a/plan-manifest.json'),'utf8'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const row of manifest.artifacts){if(sha(path.join(root,'bundle',row.file))!==row.sha256)throw Error('Bundle hash mismatch: '+row.file);}
if(sha(path.join(root,manifest.public_settings.file))!==manifest.public_settings.sha256)throw Error('Public settings hash mismatch');
console.log(JSON.stringify({status:'PASS',bundleFiles:manifest.artifacts.length,publicSettings:'MATCH',activationReady:manifest.public_settings.activation_sql_ready,productionWrites:false}));
