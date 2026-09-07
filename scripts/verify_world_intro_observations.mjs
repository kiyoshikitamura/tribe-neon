import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const source=await readFile(new URL('../src/utils/acquisitionAttribution.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const storage=new Map();
const facts=new Map();
let failures=2;
let offline=false;
let landingMetadata;
const calls=[];
function load() {
  const exports={};
  const context={exports,crypto:webcrypto,Uint8Array,console:{warn(){}},
    window:{sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},location:{href:'https://test/?utm_source=x'},setTimeout:fn=>setTimeout(fn,0)},
    document:{referrer:''},
    require(name) {
      if(name==='./supabase') return {usingMockSupabase:false,supabase:{async rpc(rpc,payload) {
        calls.push(rpc);
        if(rpc==='record_kpi_acquisition_landing_v1') { landingMetadata=payload.p_metadata; return {error:null}; }
        assert.equal(rpc,'record_kpi_acquisition_observation_v1');
        if(offline || failures-- >0) return {error:{message:'offline'}};
        const key=payload.p_token+':'+payload.p_idempotency_key;
        if(facts.has(key)) assert.deepEqual(facts.get(key),payload);
        facts.set(key,payload);
        return {error:null};
      }}};
      return {captureAcquisitionLandingMetadata:()=>({utm_source:'x',utm_campaign:'test',utm_content:'creative-a'})};
    },
  };
  vm.runInNewContext(code,context);
  return exports;
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,50));
let app=load();
app.recordWorldIntroObservation('WORLD_INTRO_VIEWED');
app.recordWorldIntroObservation('WORLD_INTRO_VIEWED');
await settle();
assert.equal(facts.size,1);
assert.equal(landingMetadata.utm_source,'x');
offline=true;
app.recordWorldIntroObservation('WORLD_INTRO_SKIPPED');
await settle();
assert.equal(facts.size,1);
assert.ok([...storage.values()].some(value=>value.includes('"WORLD_INTRO_SKIPPED":"pending"')));
offline=false;
app=load();
await app.initializeAcquisitionAttribution();
await settle();
assert.equal(facts.size,2);
app.recordWorldIntroObservation('WORLD_INTRO_SKIPPED');
app.recordWorldIntroObservation('WORLD_INTRO_VIEWED');
await settle();
assert.equal(facts.size,2);
assert.deepEqual([...facts.values()].map(f=>f.p_event_type),['WORLD_INTRO_VIEWED','WORLD_INTRO_SKIPPED']);
assert.equal(new Set([...facts.values()].map(f=>f.p_token)).size,1);
assert.ok(calls.every(rpc=>['record_kpi_acquisition_landing_v1','record_kpi_acquisition_observation_v1'].includes(rpc)));
console.log('PASS: retry, reload, offline pending, one fact per journey/event, attribution reuse, no subject/tutorial calls');
