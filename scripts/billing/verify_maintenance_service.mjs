/** Isolated service gate checks. No network, DB, Stripe, or persistent user data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as contracts from '../../src/server/billing/contracts.ts';
const uid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const compiled = ts.transpileModule(fs.readFileSync('src/server/billing/service.ts', 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture({ maintenance='MAINTENANCE', state='OPEN', expires=Date.now()+60000, member=uid, error=null, stateError=null }={}) {
 const reads=[];
 const db={ auth:{getUser:async token=>token==='valid'?{data:{user:{id:uid}},error:null}:{data:{user:null},error:{}}}, from(table) {
  reads.push(table);
  if(table==='feature_operating_states') return {select:()=>({in:async()=>({data:[{feature_key:'MAINTENANCE',state:maintenance},{feature_key:'PAYMENT',state,mutation_allowed:true}],error:stateError})})};
  assert.equal(table,'operations_maintenance_testers');
  return {select:()=>({eq:(key,value)=>{
   assert.equal(key,'user_id'); assert.equal(value,uid,'Gate checks authenticated user, never service-role identity');
   return {gt:(timeKey,iso)=>{
    assert.equal(timeKey,'expires_at'); assert.ok(Math.abs(Date.now()-Date.parse(iso))<1000);
    return {maybeSingle:async()=>({data:expires>Date.parse(iso)&&member?{user_id:member}:null,error})};
   }};
  }})};
 }};
 const exports={};
 new Function('require','exports',compiled)(name=>({
  '@supabase/supabase-js':{createClient:()=>db},
  './contracts':{...contracts,billingConfig:()=>({})},
  './reconciliation':{reconcileCheckout:()=>{throw Error('No reconciliation allowed in gate test');}},
 }[name]),exports);
 return {service:exports.billingService(),reads};
}
const valid=fixture();
assert.equal(await valid.service.authenticatedUser(new Request('https://qa.invalid',{headers:{authorization:'Bearer valid'}})),uid);
await assert.rejects(()=>valid.service.authenticatedUser(new Request('https://qa.invalid',{headers:{authorization:'Bearer invalid'}})),e=>e.status===401);
await valid.service.assertPurchasingAllowed('PAYMENT',uid);
for(const options of [{member:null},{member:other},{expires:Date.now()-1000},{error:{message:'lookup failure'}},{state:'CLOSED'},{stateError:{message:'state failure'}}]) {
 await assert.rejects(()=>fixture(options).service.assertPurchasingAllowed('PAYMENT',uid),e=>e.status===503);
}
const normal=fixture({maintenance:'CLOSED',member:null});
await normal.service.assertPurchasingAllowed('PAYMENT',uid);
assert.deepEqual(normal.reads,['feature_operating_states'],'Normal operation never depends on tester table');
console.log('PASS: authenticated owner, member mismatch, missing membership, expiry, lookup failures, feature closure, normal maintenance-off path.');
