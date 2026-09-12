import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { canClaimMission, reconcileMissionClaim } from '../src/domain/mission/availability.ts';
const js = ts.transpileModule(fs.readFileSync('src/app/context/hooks/useInventory.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness() {
  let states=[], index=0, dialog=null, returned=0, mode='success', server='CLEAR', owner='qa', calls=0;
  const react={ useState(initial){const i=index++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}, useRef(initial){const i=index++;if(!(i in states))states[i]={current:initial};return states[i];},useCallback:f=>f,useLayoutEffect:f=>f() };
  const supabase={rpc:async()=>{calls++;if(mode==='fail')throw Error('network');server='CLAIMED';if(mode==='lost')throw Error('response lost');return {data:{rewards:mode==='noop'?[]:[{item_id:'CASH',quantity:10}]}};},from:()=>({select:()=>({eq:async()=>({data:[{mission_id:'target',status:server,current_progress:1}]})})})};
  const exports={};
  vm.runInNewContext(js,{exports,console:{warn(){}},require(name){if(name==='react')return react;if(name.includes('/supabase'))return {supabase};if(name.includes('/availability'))return {canClaimMission,reconcileMissionClaim};if(name.includes('useImmediateActionLock'))return {useImmediateActionLock:()=>({beginAction:()=>true,endAction(){},endActionAfterPaint(){}})};if(name.includes('inventoryProjection'))return {buildInventoryQuantityProjection:()=>({})};return {canonicalMissionRewardName:x=>x,canonicalItemName:x=>x};}});
  const render=()=>{index=0;return exports.useInventory({user:{id:owner}},0,()=>{},0,()=>{},0,()=>{},()=>{},async()=>{},value=>{dialog=value;});};
  let hook=render();hook.setMissions([{id:'target',status:'CLEAR',category:'DAILY'}]);hook=render();
  return {get hook(){return hook;}, get dialog(){return dialog;},get returned(){return returned;},get calls(){return calls;}, callback:()=>returned++,mode:v=>mode=v,rerender:()=>hook=render(),swap:()=>{owner='other';hook=render();}};
}
for (const bulk of [false,true]) {
  const receive=(h,callback)=>bulk?h.hook.handleClaimAllMissions(undefined,callback,['target']):h.hook.handleClaimMission('target',callback);
  const h=harness();await receive(h,h.callback);assert.equal(h.returned,0,'no navigation during receipt');h.dialog.onConfirm();assert.equal(h.returned,1,'confirmed receipt reflows');h.rerender();await receive(h,h.callback);assert.equal(h.calls,1,'retry of claimed row does not issue another grant');
  const regular=harness();await receive(regular,undefined);regular.dialog.onConfirm();assert.equal(regular.returned,0,'ordinary claim retains source');
  const cancel=harness();await receive(cancel,cancel.callback);cancel.dialog.onCancel();assert.equal(cancel.returned,0,'dismiss does not navigate');
  const stale=harness();await receive(stale,stale.callback);const receipt=stale.dialog;stale.swap();receipt.onConfirm();assert.equal(stale.returned,0,'old owner cannot navigate');
  const lost=harness();lost.mode('lost');await receive(lost,lost.callback);assert.equal(lost.dialog.kind,undefined,'lost response cannot invent reward detail');lost.dialog.onConfirm();assert.equal(lost.returned,1,'server confirmed claimed can return');
  const fail=harness();fail.mode('fail');await receive(fail,fail.callback);fail.dialog.onConfirm();assert.equal(fail.returned,0,'unconfirmed failure remains in mission');
  const duplicate=harness();duplicate.mode('noop');await receive(duplicate,duplicate.callback);duplicate.dialog.onConfirm();assert.equal(duplicate.returned,1,'already claimed server state is recognized');
}
console.log('Beginner Mission receipt: PASS (single/bulk, confirmation, ordinary source, cancel, owner swap, lost response, failure, duplicate)');
