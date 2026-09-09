import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='docs/development/raid-production-release',phase=process.argv[2];
assert.ok(['db','cron','settings','open'].includes(phase));
const manifest=JSON.parse(fs.readFileSync(root+'/bundle-manifest.json'));
for(const f of manifest.files)assert.equal(createHash('sha256').update(fs.readFileSync(root+'/bundle/'+f.file)).digest('hex'),f.sha256,'Bundle drift '+f.file);
assert.equal(JSON.parse(fs.readFileSync(root+'/rehearsal.json')).status,'PASS');
const receipt=root+'/'+phase+'-applied.json';assert.ok(!fs.existsSync(receipt),'Previous outcome exists: do not resend');
if(phase!=='db')assert.equal(JSON.parse(fs.readFileSync(root+'/db-applied.json')).status,'PASS');
if(phase==='cron')assert.equal(JSON.parse(fs.readFileSync(root+'/edge-applied.json')).status,'PASS');
if(['settings','open'].includes(phase))assert.equal(JSON.parse(fs.readFileSync(root+'/frontend-readback.json')).status,'PASS');
const pat=fs.readFileSync(path.join(os.homedir(),'.supabase/access-token'),'utf8').trim();
async function query(sql){const r=await fetch('https://api.supabase.com/v1/projects/ktpolnkyyfkowxdmijww/database/query',{method:'POST',headers:{Authorization:`Bearer ${pat}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});const data=await r.json();if(!r.ok){const e=new Error('Production SQL failed');e.details=data;throw e;}return data;}
const pre=await query("begin read only;select jsonb_build_object('bossHash',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from raid_bosses t),'pending',(select count(*) from battle_replay_sessions where battle_mode='RAID' and finalization_status='PENDING'),'kpi',(select jsonb_agg(jsonb_build_object('name',proname,'hash',md5(pg_get_functiondef(oid))) order by proname) from pg_proc where proname in ('kpi_daily_engagement_v1','refresh_kpi_overview_saved_results')),'cron',(select jsonb_agg(to_jsonb(j) order by jobid) from cron.job j)) state;rollback;");
let sql;if(phase==='db')sql=fs.readFileSync(root+'/bundle/apply-db.sql','utf8');
if(phase==='cron'){const s=fs.readFileSync(root+'/bundle/03-expiry-cron.sql','utf8');sql=s.slice(s.indexOf('begin;'),s.indexOf('\\if :raid_commit'))+'commit;';}
if(phase==='settings'||phase==='open')sql="begin;set local lock_timeout='2s';set local statement_timeout='15s';"+fs.readFileSync(root+'/bundle/'+(phase==='settings'?'08-approved-settings.sql':'09-open-operations.sql'),'utf8')+'commit;';
fs.writeFileSync(receipt,JSON.stringify({phase,at:new Date().toISOString(),status:'OUTCOME_UNKNOWN',pre},null,2));
try{const result=await query(sql);fs.writeFileSync(receipt,JSON.stringify({phase,at:new Date().toISOString(),status:'PASS',pre,result},null,2));console.log(JSON.stringify({phase,status:'PASS'}));}catch(e){fs.writeFileSync(receipt,JSON.stringify({phase,at:new Date().toISOString(),status:'FAILED_INSPECT_BEFORE_RETRY',error:e.details??e.message,pre},null,2));console.log(JSON.stringify({phase,status:'FAILED',error:e.details??e.message}));process.exitCode=1;}
