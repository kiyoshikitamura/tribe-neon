import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const out=path.resolve('outputs/raid-prepublication-deploy');const team='team_ounFOJd7sfCvcytYCkExbj77',project='prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb';const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');
const cliDir=fs.readdirSync(cache).map(n=>path.join(cache,n,'node_modules/vercel')).find(p=>{try{return json(path.join(p,'package.json')).version==='59.13.1';}catch{return false;}});
if(!cliDir)throw Error('Pinned Vercel CLI runtime missing');
const require=createRequire(path.join(cliDir,'package.json'));
const {readCliAuthConfig}=require('@vercel/cli-auth/credentials-store.js');
const credentials=readCliAuthConfig(require('@vercel/cli-config').getGlobalPathConfig());
const token=credentials.token;
if(typeof token!=='string'||token.length<20||/[<>\s]/.test(token))throw Error('Authenticated CLI credential unavailable');
const headers={Authorization:`Bearer ${token}`};
async function api(endpoint,options={}){const r=await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?')?'&':'?'}teamId=${team}`,{...options,headers:{...headers,...options.headers}});let data;try{data=await r.json();}catch{data=null;}if(!r.ok)throw Error(`Vercel HTTP ${r.status} code ${data?.error?.code??'unknown'}`);return data;}

if(!process.argv.includes('--after')&&fs.existsSync(path.join(out,'aliases-before.json')))throw Error('Baseline exists; do not overwrite deployment authority');
const data=await api('/v4/aliases?projectId='+project+'&limit=100');if(data.pagination?.next)throw Error('pagination');const safe={at:new Date().toISOString(),aliases:data.aliases.map(x=>({alias:x.alias,deploymentId:x.deploymentId}))};fs.writeFileSync(path.join(out,process.argv.includes('--after')?'aliases-after.json':'aliases-before.json'),JSON.stringify(safe,null,2));console.log({aliases:safe.aliases.length});if(process.argv.includes('--after')){const attempt=json(path.join(out,'rest-deployment-attempt.json'));const d=await api('/v13/deployments/'+attempt.id);const state={id:d.id,url:d.url,readyState:d.readyState,target:d.target??null,alias:d.alias??[],automaticAliases:d.automaticAliases??[],sourceSha:d.meta?.raidSourceSha};fs.writeFileSync(path.join(out,'deployment-state.json'),JSON.stringify(state,null,2));console.log(state);}