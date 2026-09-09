import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
// Execute the actual equipment bootstrap block, not a second implementation.
const source = process.env.BOOTSTRAP_SOURCE_REF
  ? execFileSync('git',['show',`${process.env.BOOTSTRAP_SOURCE_REF}:src/app/context/GameContext.tsx`],{encoding:'utf8'})
  : fs.readFileSync('src/app/context/GameContext.tsx','utf8');
const start=source.indexOf('      const { data: equipsData } = await supabase');
const end=source.indexOf('      // 総合力データの同期',start);
assert.ok(start>0&&end>start);
const code=ts.transpile(source.slice(start,end),{target:ts.ScriptTarget.ES2022});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('supabase','userId','charsData','selectedEquipment','setUserEquipmentsList','setSelectedEquipment','setEquipmentLevel','setEquipmentLimitBreak','setSubOptions',code);
async function bootstrap({rows=[],characters=[{id:'owned-uuid',character_id:'char_ren_01'}],reply=()=>({data:null,error:{code:'42501'}}),selected={id:'old-phantom'}}={}) {
 const calls=[],state={list:[selected],selected,level:99,lb:9,options:['stale']};
 const supabase={from(name){assert.equal(name,'user_equipments');return {select(){return this},eq(){return this},order:async()=>({data:rows,error:null}),insert(row){calls.push(row);return {select(){return this},maybeSingle:async()=>reply(row,calls.length-1)}}}}};
 await run(supabase,'user-uuid',characters,selected,v=>state.list=v,v=>state.selected=v,v=>state.level=v,v=>state.lb=v,v=>state.options=v);
 return {state,calls};
}
test('all rejected grants purge stale phantom list and selection',async()=>{const {state,calls}=await bootstrap();assert.equal(calls.length,5);assert.deepEqual(state,{list:[],selected:null,level:1,lb:0,options:[]});});
test('fresh successful grants keep exact DB-returned records and original five slots',async()=>{const persisted=[];const {state,calls}=await bootstrap({reply:(r,i)=>{const row={...r,id:`db-${i}`,level:2,random_options:[]};persisted.push(row);return {data:row,error:null}}});assert.deepEqual(calls.map(x=>x.slot_index),[0,2,3,4,5]);assert.deepEqual(calls.map(x=>x.equipment_id),['WEAPON_001','HEAD_001','BODY_001','LEGS_001','ACCESSORY_001']);assert.deepEqual(state.list,persisted);assert.equal(state.selected,persisted[0]);assert.equal(state.level,2);});
test('partial failure retains only successful persisted grants',async()=>{const {state}=await bootstrap({reply:(r,i)=>i%2?{data:null,error:{code:'42501'}}:{data:{...r,id:`db-${i}`},error:null}});assert.deepEqual(state.list.map(x=>x.id),['db-0','db-2','db-4']);});
test('empty insert response is not treated as persistence',async()=>{const {state}=await bootstrap({reply:()=>({data:null,error:null})});assert.deepEqual(state.list,[]);assert.equal(state.selected,null);});
test('error accompanied by data is never accepted',async()=>{const {state}=await bootstrap({reply:r=>({data:r,error:{code:'42501'}})});assert.deepEqual(state.list,[]);});
test('empty owned roster clears previously selected equipment without grants',async()=>{const {state,calls}=await bootstrap({characters:[]});assert.deepEqual(state.list,[]);assert.equal(state.selected,null);assert.equal(calls.length,0);});
test('reload/relogin with persisted equipment does not duplicate grants',async()=>{const rows=[{id:'db-persisted',level:4,plus_val:2,random_options:[]}];for(let i=0;i<2;i++){const {state,calls}=await bootstrap({rows});assert.equal(calls.length,0);assert.equal(state.selected,rows[0]);assert.equal(state.lb,2);}});
test('failed repeated bootstrap remains empty',async()=>{for(let i=0;i<2;i++){const {state}=await bootstrap();assert.deepEqual(state.list,[]);}});
