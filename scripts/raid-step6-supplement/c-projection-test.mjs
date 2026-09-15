import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const code=readFileSync('scripts/raid-step6-supplement/c-equipment-projection.txt','utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('supabase','userId','charsData','currentAuthUserIdRef','selectedEquipment','setUserEquipmentsList','setSelectedEquipment','setEquipmentLevel','setEquipmentLimitBreak','setSubOptions','console',code+'\nreturn equipsData;');
const persisted=[{id:'saved',level:3,plus_val:1,random_options:[]}];
async function trial({initial=[],refreshed=persisted,rpcError=null,readError=null,switchDuringRpc=false,switchDuringRead=false}={}){
 const ref={current:'owner'},state={},calls=[];let reads=0;
 const supabase={from(name){assert.equal(name,'user_equipments');return {select(){return this;},eq(){return this;},async order(){reads++;if(reads===2&&switchDuringRead)ref.current='other';return {data:reads===1?initial:refreshed,error:reads===2?readError:null};}};},async rpc(name){calls.push(name);if(switchDuringRpc)ref.current=null;return {error:rpcError};}};
 const result=await run(supabase,'owner',[{id:'owned'}],ref,null,v=>state.list=v,v=>state.selected=v,v=>state.level=v,v=>state.lb=v,v=>state.options=v,{warn(){}});
 return {result,state,calls,reads};
}
const results=[];
let t=await trial();assert.equal(t.state.list,persisted);assert.equal(t.result,persisted);assert.equal(t.state.level,3);results.push('same DB projection for UI and downstream power');
t=await trial({initial:persisted});assert.equal(t.calls.length,0);assert.equal(t.reads,1);results.push('existing equipment no grant');
t=await trial({rpcError:{code:'NETWORK'},refreshed:persisted});assert.equal(t.result,persisted);assert.equal(t.calls.length,1);results.push('unknown RPC outcome reconciles persisted rows without new request');
t=await trial({rpcError:{code:'42501'},refreshed:[]});assert.deepEqual(t.state.list,[]);assert.equal(t.state.selected,null);results.push('rejected grant no phantom');
await assert.rejects(()=>trial({readError:{code:'NETWORK'},refreshed:null}),/projection unavailable/);results.push('read failure not projected as zero');
for(const key of ['switchDuringRpc','switchDuringRead']){t=await trial({[key]:true});assert.deepEqual(t.state,{});assert.equal(t.result,undefined);}results.push('logout/account switch blocks stale projection');
mkdirSync('outputs/raid-step6-supplement',{recursive:true});writeFileSync('outputs/raid-step6-supplement/c-projection-local.json',JSON.stringify({results,candidateOnly:true},null,2));console.log(`PASS ${results.length} local projection groups`);
