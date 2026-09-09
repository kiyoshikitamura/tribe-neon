import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
const ref='sufvuqdnqohpfzkwxohq',uid='216907d1-92e3-4ba8-bafd-953bbd51faec',url='https://'+ref+'.supabase.co';
const expected=['21d843c5-a064-4eb3-b62f-b15129c63183','92416b38-bf5c-4f56-a5c8-8e680c0cf436','ae6ee052-3f55-4a3d-a756-41f624893237','ba5bcb6c-1a95-47b1-8d2c-6c2ae2f382bd','e740ca81-c7c2-40ae-94b3-159f27bfcea9'].sort();
const out='docs/development/raid-prepublication-closeout/fresh-acceptance';
fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),project:ref,userId:uid,sourceSha:'8c0fa6b2131faaed7b63e172ac12424d3fe8f6be',scope:'HTTP Auth/RPC/DB only; not browser UI; prior same-user Fresh progression reused',checks:[],productionWrites:false,emailSent:false};
const token=fs.readFileSync(path.join(os.homedir(),'.supabase/access-token'),'utf8').trim();
async function readJson(r,label){const d=await r.json();if(!r.ok)throw Error(label+' HTTP '+r.status+' '+(d.code||''));return d;}
try{
 const keys=await readJson(await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys',{headers:{Authorization:'Bearer '+token}}),'Preview key lookup');
 const service=keys.find(k=>k.name==='service_role')?.api_key,anon=keys.find(k=>k.name==='anon')?.api_key;
 assert.ok(service&&anon);
 const adminHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 const request=(p,o={})=>fetch(url+p,{...o,headers:{...adminHeaders,...o.headers}});
 const auth=await readJson(await request('/auth/v1/admin/users/'+uid),'Auth read');
 const ids=await readJson(await request('/rest/v1/user_equipments?select=id&user_id=eq.'+uid+'&order=id'),'equipment read');
 assert.deepEqual(ids.map(x=>x.id).sort(),expected);
 report.checks.push({name:'existing same Fresh UID equipment baseline',status:'PASS',ids:expected,anonymous:auth.is_anonymous,hasEmail:!!auth.email,confirmed:!!auth.email_confirmed_at});
 if(!['apply','complete-pending'].includes(process.argv[2])){report.status='PREFLIGHT_PASS';}
 else{
  if(process.env.RAID_FRESH_ACCEPTANCE!=='SAME_QA_HTTP_ONLY')throw Error('Explicit fixed QA apply gate required');
  if(process.argv[2]==='apply'){assert.equal(auth.is_anonymous,true);assert.equal(!!auth.email_confirmed_at,false);}
  else {assert.equal(auth.is_anonymous,false);assert.equal(auth.email,'raid-fresh-216907d1@qa.example.com');assert.ok(auth.email_confirmed_at);}
  const password='Qa!'+randomBytes(24).toString('base64url');
  const email='raid-fresh-216907d1@qa.example.com';
  const changed=await readJson(await request('/auth/v1/admin/users/'+uid,{method:'PUT',body:JSON.stringify({email,password,email_confirm:true})}),'same QA credential setup');
  assert.equal(changed.id,uid);assert.ok(changed.email_confirmed_at);assert.equal(changed.is_anonymous,false);
  report.checks.push({name:'same QA Admin credential setup',status:'PASS',emailConfirmedByAdmin:true,mailboxAcceptance:false,newUserCreated:false});
  const login=async()=>{const d=await readJson(await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})}),'password signin');assert.equal(d.user.id,uid);assert.equal(d.user.is_anonymous,false);return d.access_token;};
  const rpc=async(access,name,args={})=>readJson(await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(args)}),name);
  let access=await login();
  const beforeOnboarding=await rpc(access,'get_current_onboarding_state');
  report.checks.push({name:'password signin first',status:'PASS',userId:uid,onboarding:beforeOnboarding});
  if(process.argv[2]==='complete-pending'){
   assert.equal(beforeOnboarding.authentication_pending,true);
   await rpc(access,'complete_tutorial_authentication',{p_auth_method:'EMAIL'});
   const completed=await rpc(access,'get_current_onboarding_state');
   assert.equal(completed.gameplay_authorized,true);assert.equal(completed.authentication_pending,false);assert.equal(completed.identity_integrity_valid,true);
   report.checks.push({name:'normal authenticated completion RPC',status:'PASS',onboarding:completed,uiPerformed:false});
  }
  const ensure=await rpc(access,'ensure_initial_equipment_v1');
  assert.deepEqual(ensure.equipmentIds.slice().sort(),expected);
  const logout=await fetch(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+access}});
  assert.ok(logout.ok);
  access=await login();
  const again=await rpc(access,'ensure_initial_equipment_v1');
  assert.deepEqual(again.equipmentIds.slice().sort(),expected);
  const finalIds=await readJson(await request('/rest/v1/user_equipments?select=id&user_id=eq.'+uid+'&order=id'),'equipment final');
  assert.deepEqual(finalIds.map(x=>x.id).sort(),expected);
  report.checks.push({name:'logout then normal password signin and repeated ensure',status:'PASS',sameUuid:true,equipmentIds:expected,additionalEquipment:0});
  const finalLogout=await fetch(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+access}});
  assert.ok(finalLogout.ok);
  // Password is never exported. Future browser acceptance uses a separately approved QA credential setup.
  report.status='HTTP_RELOGIN_PASS_UI_UNVERIFIED';
 }
}catch(e){report.status='FAIL';report.error={name:e.name,message:e.message};process.exitCode=1;}
fs.writeFileSync(out+(process.argv[2]==='complete-pending'?'/same-user-completion-http.json':'/same-user-http.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
