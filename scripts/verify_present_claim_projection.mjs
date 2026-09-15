import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync('src/app/context/hooks/useInventory.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(mode='success') {
  const states=[]; let cursor=0,owner='qa',dialog,cash=0,diamonds=0,equipment=[],calls=0,bootstrap=0,release;
  const gate=mode==='hold'?new Promise(r=>release=r):Promise.resolve();
  let rows=[{id:'one',user_id:'qa',status:'UNCLAIMED',item_id:'CASH',quantity:10,message:'gift',expire_at:null}];
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=cursor++;return states[i]??=({current:initial});},useCallback:f=>f,useLayoutEffect:f=>f()};
  const supabase={async rpc(){calls++;await gate;if(mode==='reject')return {error:Error('network')};rows=rows.map(p=>({...p,status:'CLAIMED'}));if(mode==='lost')throw Error('network');return {data:{status:'success',claimed_count:1}};},from(table){const q={select(){return q;},eq(){return q;},order(){return q;},single(){return q;},then(resolve,reject){const data=table==='users'?{cash:10,neon_diamonds:30}:table==='presents'?rows:table==='user_items'?[{item_id:'ENERGY_DRINK',quantity:5}]:[{id:'gear'}];return Promise.resolve(mode==='readfail'?{error:Error('read failed')}:{data}).then(resolve,reject);}};return q;}};
  const exports={};vm.runInNewContext(code,{exports,console,require(name){if(name==='react')return react;if(name.endsWith('/supabase'))return {supabase};if(name.includes('useImmediateActionLock'))return {useImmediateActionLock(){const lock=react.useRef(false);return {isLocked:lock.current,beginAction(){if(lock.current)return false;lock.current=true;return true;},endAction(){lock.current=false;}};}};if(name.includes('actionPerformance'))return {beginActionPerformance:()=>({mark(){},markVisualReady(){}})};if(name.includes('inventoryProjection'))return {buildInventoryQuantityProjection:()=>({ENERGY_DRINK:5})};return {canonicalItemName:x=>x};}});
  const render=()=>{cursor=0;return exports.useInventory({user:{id:owner}},0,v=>cash=v,0,v=>diamonds=v,0,()=>{},()=>{},async()=>bootstrap++,v=>dialog=v,undefined,v=>equipment=v);};
  let hook=render();hook.setPresents(rows);hook=render();
  return {get hook(){return hook;},get dialog(){return dialog;},get calls(){return calls;},get bootstrap(){return bootstrap;},get cash(){return cash;},get diamonds(){return diamonds;},get equipment(){return equipment;},rerender(){hook=render();},swap(){owner='other';hook=render();},release:()=>release()};
}
for(const bulk of [false,true]) {
  const run=f=>bulk?f.hook.handleClaimAllPresents():f.hook.handleClaimPresent('one');
  const f=fixture();await run(f);assert.equal(f.cash,10);assert.equal(f.diamonds,30);assert.equal(f.equipment[0].id,'gear');assert.equal(f.bootstrap,0);assert.equal(f.dialog.rewards[0].quantity,10);f.rerender();assert.equal(f.hook.presents[0].status,'CLAIMED');f.dialog.onConfirm();await run(f);assert.equal(f.calls,1);
  const held=fixture('hold');const pending=run(held);await run(held);assert.equal(held.calls,1);held.swap();held.release();await pending;assert.equal(held.cash,0);assert.equal(held.dialog,undefined);
  const failed=fixture('reject');await run(failed);failed.rerender();assert.equal(failed.hook.presents[0].status,'UNCLAIMED');assert.equal(failed.dialog.kind,undefined);
  const lost=fixture('lost');await run(lost);lost.rerender();assert.equal(lost.hook.presents[0].status,'CLAIMED');assert.equal(lost.calls,1);assert.equal(lost.dialog.kind,undefined);
  const readfail=fixture('readfail');await run(readfail);assert.equal(readfail.dialog.title,'プレゼント受取済み');assert.equal(readfail.calls,1);
}
console.log('Present claim projection PASS: single/bulk wallet/items/gear, no bootstrap, duplicate lock, owner swap, failure/lost response/read failure');
