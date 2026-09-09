import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const out='docs/development/raid-production-release';
fs.mkdirSync(out,{recursive:true});
const pat=fs.readFileSync(path.join(os.homedir(),'.supabase/access-token'),'utf8').trim();
async function query(sql){const r=await fetch('https://api.supabase.com/v1/projects/ktpolnkyyfkowxdmijww/database/query',{method:'POST',headers:{Authorization:`Bearer ${pat}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});if(!r.ok)throw Error(`Production readonly HTTP ${r.status}`);return r.json();}
const stamp=new Date().toISOString();
for(const [name,file]of [['baseline','bundle/00-readonly-recheck.sql'],['catalog','audit-a/catalog.sql']]){const result=await query(fs.readFileSync('docs/development/raid-production-preparation/'+file,'utf8'));fs.writeFileSync(`${out}/${name}-before.json`,JSON.stringify(result,null,2));if(name==='baseline')console.log(JSON.stringify(result));}
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');
const cliDir=fs.readdirSync(cache).map(n=>path.join(cache,n,'node_modules/vercel')).find(p=>{try{return json(path.join(p,'package.json')).version==='59.13.1';}catch{return false;}});
if(!cliDir)throw Error('Pinned Vercel runtime missing');
const require=createRequire(path.join(cliDir,'package.json'));
const {readCliAuthConfig}=require('@vercel/cli-auth/credentials-store.js');
const token=readCliAuthConfig(require('@vercel/cli-config').getGlobalPathConfig()).token;
async function api(endpoint){const r=await fetch('https://api.vercel.com'+endpoint+(endpoint.includes('?')?'&':'?')+'teamId=team_ounFOJd7sfCvcytYCkExbj77',{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error(`Vercel readonly HTTP ${r.status}`);return r.json();}
const aliases=await api('/v4/aliases?projectId=prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb&limit=100');if(aliases.pagination?.next)throw Error('Alias pagination');
const safe=aliases.aliases.map(x=>({alias:x.alias,deploymentId:x.deploymentId}));
const prod=safe.find(x=>x.alias==='www.tribe-neon.com');if(!prod)throw Error('Missing game alias');
const d=await api('/v13/deployments/'+prod.deploymentId);
const deployment={id:d.id,url:d.url,sha:d.meta?.migrationSourceSha??d.meta?.raidSourceSha??d.meta?.githubCommitSha??d.meta?.gitCommitSha,meta:d.meta,createdAt:d.createdAt,readyState:d.readyState,target:d.target};
fs.writeFileSync(`${out}/deployment-before.json`,JSON.stringify({at:stamp,aliases:safe,deployment},null,2));console.log(JSON.stringify({deployment,aliases:safe.length}));
