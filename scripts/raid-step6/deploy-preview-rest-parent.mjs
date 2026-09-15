import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
const root=path.resolve(import.meta.dirname,'../..'), out=path.join(root,'outputs/raid-step6');
const sourceSha='2d2d2b1563e92f1471f9c86fa8a7cc59040ec726';
const project='prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb',team='team_ounFOJd7sfCvcytYCkExbj77';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const manifest=json(path.join(out,'stage-manifest.json')), dry=json(path.join(out,'deploy-dry.json'));
if(manifest.sourceSha!==sourceSha)throw Error('Wrong source SHA');
const stage=manifest.stage;
if(path.resolve(stage)!==path.join(out,'source-2d2d2b1'))throw Error('Wrong staging path');
const hashes=new Map(manifest.files.map(f=>[f.path,f.sha256]));
const hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
const files=dry.files.map(f=>{
  if(!hashes.has(f.path)||/(^|\/)(\.env[^/]*|\.git|outputs|node_modules|\.next)(\/|$)/.test(f.path))throw Error('Invalid deployment file selection');
  const bytes=fs.readFileSync(path.join(stage,f.path));
  if(bytes.length!==f.size||hash('sha1',bytes)!==f.sha||hash('sha256',bytes)!==hashes.get(f.path))throw Error(`File drift: ${f.path}`);
  return {file:f.path,sha:f.sha,size:f.size,mode:f.mode};
});
const envPath=process.env.RAID_STEP6_PREVIEW_ENV;
if(!envPath)throw Error('RAID_STEP6_PREVIEW_ENV must name the existing private Preview env file');
const sourceEnv=parseEnv(fs.readFileSync(envPath,'utf8'));
const expected={NEXT_PUBLIC_SUPABASE_URL:'https://sufvuqdnqohpfzkwxohq.supabase.co',NEXT_PUBLIC_APP_ENV:'preview',NEXT_PUBLIC_USE_MOCK_DB:'false',NEXT_PUBLIC_RAID_ROOM_UI_ENABLED:'true'};
for(const [key,value]of Object.entries(expected))if(sourceEnv[key]!==value)throw Error(`Environment mismatch: ${key}`);
const publicKey=sourceEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const claims=JSON.parse(Buffer.from(publicKey?.split('.')[1]??'','base64url').toString());
if(claims.ref!=='sufvuqdnqohpfzkwxohq'||claims.role!=='anon')throw Error('Public key target mismatch');
const env={...expected,NEXT_PUBLIC_SUPABASE_ANON_KEY:publicKey};
// API contract: OMIT target => Preview. Never use production/staging or Git source/ref.
const body={version:2,name:'tribe-neon',project,files,alias:[],autoAssignCustomDomains:false,meta:{raidSourceSha:sourceSha,gitCommitSha:sourceSha},env,build:{env}};
const safe={sourceSha,project,target:'preview (target omitted)',autoAssignCustomDomains:false,alias:[],gitSourceAbsent:true,gitMetadataAbsent:true,fileCount:files.length,bytes:files.reduce((n,f)=>n+f.size,0),envKeys:Object.keys(env)};
fs.writeFileSync(path.join(out,'rest-request-manifest.json'),JSON.stringify(safe,null,2));
console.log(JSON.stringify(safe));
if(!process.argv.includes('--execute')&&!process.argv.includes('--auth-check'))process.exit(0);
const attempt=path.join(out,'rest-deployment-attempt.json');
if(fs.existsSync(attempt))throw Error('Previous deployment attempt exists; inspect outcome before any resend');
// Use the installed CLI's own read-only OS-keyring/file credential loader.
// `api --generate curl` emits a placeholder and MUST NOT be used for authentication.
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
const before=json(path.join(out,'aliases-before.json')).aliases;
async function checkAliases(){const result=await api(`/v4/aliases?projectId=${project}&limit=100`);if(result.pagination?.next)throw Error('Alias pagination changed');const current=new Map(result.aliases.map(x=>[x.alias,x.deploymentId]));if(current.size!==before.length||before.some(x=>current.get(x.alias)!==x.deploymentId))throw Error('Shared alias baseline drift');}
await checkAliases();
const projectMetadata=await api(`/v9/projects/${project}`);
if(projectMetadata.id!==project||projectMetadata.accountId!==team)throw Error('Project/team mismatch');
if(process.argv.includes('--auth-check')){console.log('PASS read-only credential loader GET: expected project/team and all 75 alias bindings match');process.exit(0);}
const unique=[...new Map(files.map(f=>[f.sha,f])).values()];let next=0,done=0;
await Promise.all(Array.from({length:8},async()=>{while(next<unique.length){const f=unique[next++];await api('/v2/files',{method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Length':String(f.size),'x-vercel-digest':f.sha},body:fs.readFileSync(path.join(stage,f.file))});if(++done%100===0)console.log(`Uploaded ${done}/${unique.length} unique files`);}}));
await checkAliases();
fs.writeFileSync(attempt,JSON.stringify({sourceSha,at:new Date().toISOString(),status:'OUTCOME_UNKNOWN'},null,2));
const result=await api('/v13/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const response={id:result.id,url:result.url,target:result.target??null,readyState:result.readyState,alias:result.alias??[],automaticAliases:result.automaticAliases??[],sourceSha:result.meta?.raidSourceSha};
fs.writeFileSync(attempt,JSON.stringify(response,null,2));
console.log(JSON.stringify(response));
if(response.target!==null||response.alias.length||response.automaticAliases.length||response.sourceSha!==sourceSha)throw Error('Deployment metadata/alias mismatch; inspect without automatic rollback');
await checkAliases();
