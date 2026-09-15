import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { previewBillingDiagnostics, sandboxEnvironmentChecks } from '../../src/server/billing/contracts.ts';
const sandbox={VERCEL_ENV:'preview',BILLING_SANDBOX_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://sufvuqdnqohpfzkwxohq.supabase.co',STRIPE_SECRET_KEY:'sk_test_private_fixture',STRIPE_WEBHOOK_SECRET:'whsec_private_fixture',SUPABASE_SERVICE_ROLE_KEY:'service_private_fixture',BILLING_RETURN_ORIGIN:'https://acceptance.example.com'};
const checks=sandboxEnvironmentChecks(sandbox,'https://acceptance.example.com');
assert.ok(Object.values(checks).every(value=>value===true));
assert.equal(sandboxEnvironmentChecks(sandbox,'https://different.example.com').return_origin_matches_request,false);
const diagnostic=previewBillingDiagnostics('READY',undefined,sandbox);
for(const value of [sandbox.STRIPE_SECRET_KEY,sandbox.STRIPE_WEBHOOK_SECRET,sandbox.SUPABASE_SERVICE_ROLE_KEY,sandbox.BILLING_RETURN_ORIGIN])assert.ok(!JSON.stringify(diagnostic).includes(value));
for(const runtime of ['production','development',undefined])assert.deepEqual(previewBillingDiagnostics('ENVIRONMENT_INVALID',undefined,{...sandbox,VERCEL_ENV:runtime}),{});
const source=fs.readFileSync('src/app/api/billing/config/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const executable=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
for(const testCase of [{name:'environment',throws:true,code:'ENVIRONMENT_INVALID'},{name:'query',error:{message:'secret DB exception'},code:'CATALOG_QUERY_FAILED'},{name:'empty',data:null,code:'CATALOG_QUERY_FAILED'},{name:'mismatch',matches:false,code:'CATALOG_MISMATCH'},{name:'connection',reject:true,code:'SERVICE_FAILED'},{name:'ready',code:'READY',available:true}]) {
 const service=()=>{if(testCase.throws)throw new Error('secret config');return {config:{mode:'sandbox'},db:{from:()=>({select:async()=>{if(testCase.reject)throw new Error('secret network');return {data:Object.hasOwn(testCase,'data')?testCase.data:[],error:testCase.error};}})}};};
 for(const runtime of ['preview','production']) {
  const get=new Function('billingService','billingResponse','catalogMatches','CATALOG_VERSION','previewBillingDiagnostics',executable+';return GET;')(service,(data)=>Response.json(data),()=>testCase.matches!==false,'20260913',(code,origin)=>previewBillingDiagnostics(code,origin,{...sandbox,VERCEL_ENV:runtime}));
  const json=await (await get(new Request('https://acceptance.example.com/api/billing/config'))).json();
  assert.equal(json.available,!!testCase.available,testCase.name);
  assert.equal(json.diagnostics?.code,runtime==='preview'?testCase.code:undefined);
  for (const sensitive of ['secret DB exception','secret config','secret network','private_fixture']) assert.ok(!JSON.stringify(json).includes(sensitive));
 }
}
console.log('PASS: config API 6 readiness branches, Preview-only diagnostics, Production response compatibility, no secret values, return-origin comparison');

assert.equal(previewBillingDiagnostics('READY',undefined,{...sandbox,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)}).diagnostics.commitSha,'a'.repeat(40));
assert.equal(previewBillingDiagnostics('READY',undefined,{...sandbox,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'unexpected-value'}).diagnostics.commitSha,null);
