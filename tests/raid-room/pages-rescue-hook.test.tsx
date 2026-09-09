import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useRaidRescueCards } from '../../src/app/components/raid/useRaidRescueCards';
import { createTopFixture } from '../../src/app/qa/raid-top/topFixture';
import { deferred } from './fixtures';
type Context={session:{user:{id:string};access_token:string}|null;userGuildMember:{guild_id:string}|null};
const runtime=globalThis as unknown as {qaContext:Context;qaRpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>};
afterEach(cleanup);
function reset(){process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED='true';runtime.qaContext={session:{user:{id:'user-a'},access_token:'local-test-token-a'},userGuildMember:{guild_id:'guild-a'}};}
test('表示中救援は重複除去最大50件を1回取得しdisabledでは取得しない',async()=>{
 reset();const calls:Record<string,unknown>[]=[];runtime.qaRpc=async(name,args)=>{assert.equal(name,'get_raid_rescue_cards_v1');calls.push(args);return {data:{entries:[]},error:null};};
 const values=Array.from({length:60},(_,i)=>`id-${i}`);const h=renderHook(({enabled})=>useRaidRescueCards([...values,values[0]],enabled),{initialProps:{enabled:true}});
 await waitFor(()=>assert.equal(h.result.current.status,'success'));assert.equal(calls.length,1);assert.equal((calls[0].p_rescue_ids as string[]).length,50);
 assert.equal(h.result.current.statusFor('id-59'),'success');assert.equal(h.result.current.statusFor('id-0'),'idle');
 h.rerender({enabled:false});assert.equal(h.result.current.byId.size,0);assert.equal(h.result.current.status,'idle');assert.equal(calls.length,1);
});
test('user/token/Guild変更は前データを即隠し旧遅延応答を破棄する',async()=>{
 reset();const top=createTopFixture('single',Date.now());if(top.rescues.status!=='ready')throw Error('fixture');const entry=top.rescues.data[0];if(entry.rescue.status!=='available')throw Error('fixture');const id=entry.rescue.value.rescueId;
 const old=deferred<{data:unknown;error:unknown}>();let count=0;runtime.qaRpc=async()=>{count++;return count===2?old.promise:{data:{entries:count===1?[entry]:[]},error:null};};
 const h=renderHook(()=>useRaidRescueCards([id],true));await waitFor(()=>assert.equal(h.result.current.byId.size,1));
 runtime.qaContext={...runtime.qaContext,session:{user:{id:'user-a'},access_token:'local-test-token-b'}};h.rerender();assert.equal(h.result.current.byId.size,0);
 runtime.qaContext={...runtime.qaContext,userGuildMember:{guild_id:'guild-b'}};h.rerender();await waitFor(()=>assert.equal(h.result.current.status,'success'));
 await act(async()=>old.resolve({data:{entries:[entry]},error:null}));assert.equal(h.result.current.byId.size,0);
 runtime.qaContext={...runtime.qaContext,session:{user:{id:'user-b'},access_token:'local-test-token-c'}};h.rerender();assert.equal(h.result.current.byId.size,0);await waitFor(()=>assert.equal(h.result.current.status,'success'));
 runtime.qaContext={session:null,userGuildMember:null};h.rerender();assert.equal(h.result.current.status,'idle');
});
test('取得失敗を成功0件にせずerrorとして返す',async()=>{
 reset();runtime.qaRpc=async()=>({data:null,error:{message:'fixture failure'}});const h=renderHook(()=>useRaidRescueCards(['rescue'],true));await waitFor(()=>assert.equal(h.result.current.status,'error'));assert.equal(h.result.current.byId.size,0);
});
