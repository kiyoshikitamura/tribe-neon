import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
// Execute the actual equipment bootstrap block; SQL atomicity is tested separately.
const source = process.env.BOOTSTRAP_SOURCE_REF
  ? execFileSync('git',['show',`${process.env.BOOTSTRAP_SOURCE_REF}:src/app/context/GameContext.tsx`],{encoding:'utf8'})
  : fs.readFileSync('src/app/context/GameContext.tsx','utf8');
const start=source.indexOf('      const readPersistedEquipment');
const end=source.indexOf('      // 総合力データの同期',start);
assert.ok(start>0&&end>start);
assert.match(source.slice(end,end+350),/syncUserPower\(userId, charsData, equipsData \|\| \[\], localDeck\)/);
const code=ts.transpile(source.slice(start,end),{target:ts.ScriptTarget.ES2022});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('supabase','userId','charsData','currentAuthUserIdRef','selectedEquipment','setUserEquipmentsList','setSelectedEquipment','setEquipmentLevel','setEquipmentLimitBreak','setSubOptions','console',code+'\nreturn equipsData;');
async function bootstrap({rows=[],persisted=[],characters=[{id:'owned-uuid',character_id:'char_ren_01'}],reply={data:null,error:{code:'42501'}},readError=null,selected={id:'old-phantom'}}={}) {
 const calls=[],state={list:[selected],selected,level:99,lb:9,options:['stale']};let reads=0;
 const supabase={from(name){assert.equal(name,'user_equipments');return {select(){return this;},eq(){return this;},order:async()=>({data:++reads===1?rows:persisted,error:reads===1?null:readError}),insert(){assert.fail('direct equipment insert must not return');}};},async rpc(name){assert.equal(name,'ensure_initial_equipment_v1');calls.push(name);return reply;}};
 const powerEquipment=await run(supabase,'user-uuid',characters,{current:'user-uuid'},selected,v=>state.list=v,v=>state.selected=v,v=>state.level=v,v=>state.lb=v,v=>state.options=v,{warn(){}});
 return {state,calls,powerEquipment};
}
test('rejected grant and empty persisted read purge stale phantom list and selection',async()=>{const {state,calls}=await bootstrap();assert.equal(calls.length,1);assert.deepEqual(state,{list:[],selected:null,level:1,lb:0,options:[]});});
test('successful authority uses exact persisted records for UI and power',async()=>{const persisted=[0,2,3,4,5].map((slot_index,i)=>({id:`db-${i}`,slot_index,level:2,random_options:[]}));const {state,calls,powerEquipment}=await bootstrap({persisted,reply:{data:{status:'granted'},error:null}});assert.equal(calls.length,1);assert.equal(state.list,persisted);assert.equal(powerEquipment,persisted);assert.equal(state.selected,persisted[0]);assert.equal(state.level,2);});
test('failed or lost RPC response keeps only separately confirmed persisted rows',async()=>{const persisted=[{id:'confirmed',level:1}];const {state}=await bootstrap({persisted});assert.deepEqual(state.list,persisted);});
test('empty RPC response without persisted records never invents equipment',async()=>{const {state}=await bootstrap({reply:{data:null,error:null}});assert.deepEqual(state.list,[]);assert.equal(state.selected,null);});
test('RPC data accompanied by error is never treated as a persisted row',async()=>{const {state}=await bootstrap({reply:{data:{id:'untrusted',level:99},error:{code:'42501'}}});assert.deepEqual(state.list,[]);});
test('empty owned roster clears previously selected equipment without a grant',async()=>{const {state,calls}=await bootstrap({characters:[]});assert.deepEqual(state.list,[]);assert.equal(state.selected,null);assert.equal(calls.length,0);});
test('reload/relogin with persisted equipment does not call grant authority',async()=>{const rows=[{id:'db-persisted',level:4,plus_val:2,random_options:[]}];for(let i=0;i<2;i++){const {state,calls,powerEquipment}=await bootstrap({rows});assert.equal(calls.length,0);assert.equal(state.selected,rows[0]);assert.equal(state.lb,2);assert.equal(powerEquipment,rows);}});
test('failed repeated bootstrap stays empty and read failure is not a zero projection',async()=>{for(let i=0;i<2;i++){const {state}=await bootstrap();assert.deepEqual(state.list,[]);}await assert.rejects(()=>bootstrap({persisted:null,readError:{code:'NETWORK'}}),/projection unavailable/);});
