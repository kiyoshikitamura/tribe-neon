import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=fs.readFileSync('src/app/components/RaidTab.tsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
function fixture({points=0,free=false,tickets=2,fail=false}={}) {
 const slots=[];let cursor=0,calls=0,prepared=0,block;
 const context={session:{user:{id:'qa'}},raidPoints:points,raidFirstEntryFree:free,userLevel:5,raidTopRefreshRevision:0,setRaidPoints:v=>context.raidPoints=v,setRaidFirstEntryFree:v=>context.raidFirstEntryFree=v,prepareRaidRoomBattle:async(_briefing,_presentation,gate)=>{if(await gate())prepared++},syncBootstrapData:async()=>{},playCyberSe(){}};
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:init=>{const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:init=>{const i=cursor++;return slots[i]??=({current:init})},useLayoutEffect(){},useEffect(){},useCallback:fn=>fn};
 const supabase={rpc:async name=>{if(name==='get_current_raid_attempt_state')return {data:{raidPoints:points,firstEntryFree:free}};assert.equal(name,'use_action_resource_ticket');calls++;if(block)await block;if(fail)return {error:Error('network')};points++;tickets--;return {data:{status:'success',points,quantity:tickets}}},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{quantity:tickets}})};return q}};
 const module={exports:{}};vm.runInNewContext(code,{exports:module.exports,module,process:{env:{NEXT_PUBLIC_RAID_ROOM_UI_ENABLED:'true'}},require:name=>name==='react'?react:name.includes('GameContext')?{useGame:()=>context}:name==='@/utils/supabase'?{supabase}:name.includes('game_constants')?{getCanonicalBattleAreaName:()=>'',getCanonicalBattleBackground:()=>''}:name.includes('screenAssets')?{preloadAsset:async()=>({resolvedSrc:'/test.jpg'})}:name.includes('useScreenReadiness')?{useScreenReadiness:()=>({status:'ready'})}:name.includes('screenManifests')?{SCREEN_ASSET_MANIFESTS:{raid:[]}}:name.includes('canonical/items')?{}:name});
 const render=()=>{cursor=0;return module.exports.default()};
 const find=(node,p)=>{if(!node||typeof node!=='object')return null;if(p(node))return node;for(const child of (Array.isArray(node)?node:node.props?.children??[])){const result=find(child,p);if(result)return result;}return null};
 const dialog=()=>find(render(),n=>n.props?.title==='レイドチケットで回復しますか？');
 const enter=()=>find(render(),n=>n.props?.onBriefingReady).props.onBriefingReady({roomId:'room',baseId:'base'});
 return {render,find,dialog,enter,context,get calls(){return calls},get prepared(){return prepared},hold:()=>{let release;block=new Promise(r=>release=r);return release}};
}
const checks=[];
let f=fixture();await f.enter();assert.ok(f.dialog());assert.equal(f.calls,0);f.dialog().props.actions[0].onClick();assert.equal(f.dialog(),null);assert.equal(f.calls,0);checks.push('zero RP opens; close consumes nothing');
f=fixture({tickets:0});await f.enter();assert.equal(f.dialog().props.actions[1].disabled,true);checks.push('no ticket disables recovery');
f=fixture();await f.enter();const release=f.hold();const action=f.dialog().props.actions[1];action.onClick();action.onClick();assert.equal(f.calls,1);assert.equal(f.dialog().props.actions[1].disabled,true);release();await new Promise(r=>setImmediate(r));assert.equal(f.context.raidPoints,1);assert.equal(f.dialog(),null);await f.enter();assert.equal(f.prepared,1);assert.equal(f.calls,1);checks.push('double click consumes one; updates RP; next preparation succeeds');
f=fixture({free:true});await f.enter();assert.equal(f.dialog(),null);assert.equal(f.prepared,1);assert.equal(f.calls,0);checks.push('zero RP with free entry bypasses recovery');
f=fixture({points:1});await f.enter();assert.equal(f.prepared,1);assert.equal(f.calls,0);checks.push('positive RP bypasses recovery');
f=fixture({fail:true});await f.enter();f.dialog().props.actions[1].onClick();await new Promise(r=>setImmediate(r));assert.equal(f.context.raidPoints,0);assert.ok(f.find(f.render(),n=>n.props?.title==='RPの回復結果を確認してください'));assert.equal(f.calls,1);checks.push('failure does not fake recovery or auto retry');
fs.mkdirSync('outputs/raid-ticket-recovery',{recursive:true});fs.writeFileSync('outputs/raid-ticket-recovery/result.json',JSON.stringify({status:'PASS',scope:'Actual RaidTab handlers and dialog props; mocked React hooks and server transport. No real tickets consumed.',checks},null,2));console.log('PASS',checks);
