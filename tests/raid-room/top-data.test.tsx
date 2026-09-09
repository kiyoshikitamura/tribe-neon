import React from 'react';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {render,renderHook,cleanup,waitFor,act} from '@testing-library/react';
import {createRaidTopRpcLoader,millisecondsUntilNextRaidJstDay} from '../../src/domain/raidTopRpc';
import {parseRaidTopSnapshot} from '../../src/domain/raidTopData';
import {useRaidTop} from '../../src/app/components/raid/useRaidTop';
import RaidTop from '../../src/app/components/raid/RaidTop';
import {createTopFixture} from '../../src/app/qa/raid-top/topFixture';
const actual=JSON.parse(readFileSync('outputs/raid-top-data/actual-pg-snapshot.json','utf8'));
afterEach(cleanup);
test('隔離PG実get_raid_top_v1出力→1RPC loader→実parser→実RaidTopの縦結合',async()=>{
 const calls:unknown[]=[];const loaded=await createRaidTopRpcLoader({rpc:async(...args)=>{calls.push(args);return {data:actual,error:null};}})();
 assert.deepEqual(calls,[['get_raid_top_v1']]);assert.equal(loaded.participating.status,'ready');if(loaded.participating.status!=='ready')throw Error('ready');
 const entry=loaded.participating.data[0];assert.equal(entry.enemy.status,'available');if(entry.enemy.status!=='available')throw Error('enemy');assert.equal(entry.enemy.value.roster.length,5);
 assert.equal(entry.room.owner.status,'available');if(entry.room.owner.status==='available')assert.equal(entry.room.owner.value.leaderIconUrl.status,'available');
 const view=render(<RaidTop data={{...loaded,canCreate:true}} onOpenRoom={()=>{}} onChooseEnemy={()=>{}} onBrowse={()=>{}} onRefresh={()=>{}}/>);await view.findByTestId('raid-top');assert.ok(view.getAllByText(entry.enemy.value.bossName).length);assert.deepEqual(entry.membership,{status:'available',value:'rescue'});assert.ok(view.getAllByRole('button',{name:'続きへ'}).length);
});
test('RPC例外/不正データを0件にしない',async()=>{for(const response of [{data:null,error:{message:'offline'}},{data:{},error:null}])await assert.rejects(createRaidTopRpcLoader({rpc:async()=>response})());});
test('Guild scope整合、顔6件、21件pageを拒否し未取得人物を固定値にしない',async()=>{
 const invalid=structuredClone(actual);invalid.rescues.data[0].rescue.value.guildId='not-null-for-activity';await assert.rejects(parseRaidTopSnapshot(invalid));
 const six=structuredClone(actual);six.participating.data[0].participants.value.push(six.participating.data[0].participants.value[0]);await assert.rejects(parseRaidTopSnapshot(six));
 const tooMany=structuredClone(actual);tooMany.participating.data=Array.from({length:21},(_,i)=>({...tooMany.participating.data[0],room:{...tooMany.participating.data[0].room,roomId:`r-${i}`}}));await assert.rejects(parseRaidTopSnapshot(tooMany));
 const missing=structuredClone(actual);missing.participating.data[0].room.owner.value.leaderCharacterId={status:'available',value:'no-canonical-person'};const parsed=await parseRaidTopSnapshot(missing);if(parsed.participating.status==='ready'&&parsed.participating.data[0].room.owner.status==='available')assert.equal(parsed.participating.data[0].room.owner.value.leaderIconUrl.status,'unknown');
});
test('既定hookは一括1RPCで取得し本人変更の旧応答を破棄、失敗とemptyを区別',async()=>{
 let resolveOld!:(value:{data:unknown,error:null})=>void;let calls=0;const pending=new Promise<{data:unknown,error:null}>(r=>resolveOld=r);
 const rpcClient={rpc:async()=>++calls===1?pending:{data:createTopFixture('empty'),error:null}};
 const h=renderHook(({userId})=>useRaidTop({rpcClient,userId,enabled:true,canCreate:true,refreshRevision:0}),{initialProps:{userId:'one'}});await waitFor(()=>assert.equal(calls,1));assert.equal(String(h.result.current.data.participating.status),'loading');h.rerender({userId:'two'});await waitFor(()=>assert.equal(h.result.current.data.participating.status,'ready'));
 await act(async()=>{resolveOld({data:actual,error:null});await pending;});const p=h.result.current.data.participating;assert.equal(p.status,'ready');if(p.status==='ready')assert.equal(p.data.length,0);assert.equal(calls,2);h.unmount();
 const badClient={rpc:async()=>({data:null,error:{message:'offline'}})};const bad=renderHook(()=>useRaidTop({rpcClient:badClient,userId:'one',enabled:true,canCreate:true,refreshRevision:0}));await waitFor(()=>assert.equal(bad.result.current.data.participating.status,'error'));
});
test('JST0時+100msを次回取得時刻とし独自抽選なし',()=>{assert.equal(millisecondsUntilNextRaidJstDay(Date.parse('2026-09-09T14:59:59.000Z')),1100);assert.equal(millisecondsUntilNextRaidJstDay(Date.parse('2026-09-09T15:00:00.000Z')),86400100);});


test('非表示からの復帰で再取得、ログアウト後は通信停止',async()=>{
 let calls=0;const rpcClient={rpc:async()=>{calls++;return {data:actual,error:null};}};
 const h=renderHook(({userId})=>useRaidTop({rpcClient,userId,enabled:true,canCreate:true,refreshRevision:0}),{initialProps:{userId:'one' as string|undefined}});await waitFor(()=>assert.equal(h.result.current.data.participating.status,'ready'));assert.equal(calls,1);
 const descriptor=Object.getOwnPropertyDescriptor(document,'visibilityState');Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 try{await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await waitFor(()=>assert.equal(calls,2));h.rerender({userId:undefined});assert.equal(h.result.current.data.participating.status,'unavailable');await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));assert.equal(calls,2);}finally{if(descriptor)Object.defineProperty(document,'visibilityState',descriptor);else delete (document as unknown as {visibilityState?:string}).visibilityState;}
});
