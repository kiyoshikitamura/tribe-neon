import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRaidActivity} from '../../src/domain/raidRoomActivity.ts';
import {roomFixture} from './fixtures.ts';
const now=Date.parse('2026-09-08T12:00:00Z');

test('Room切替後のbootstrapはRoom全ページを読み開催中の最大期限を返す',async()=>{
 const calls=[];
 const client={rpc:async(name,args)=>{
  calls.push({name,args});return {data:args.p_offset===0?{rooms:[roomFixture('first')],nextOffset:1}:{rooms:[roomFixture('last',{expiresAt:{status:'available',value:'2026-09-09T12:00:00Z'}})],nextOffset:null},error:null};
 }};
 assert.deepEqual(await loadRaidActivity(client,true,now),{mode:'room',activeUntil:Date.parse('2026-09-09T12:00:00Z')});
 assert.deepEqual(calls.map(c=>c.name),['list_raid_rooms_v1','list_raid_rooms_v1']);
 assert.deepEqual(calls.map(c=>c.args.p_offset),[0,1]);
});
test('撃破・期限切れ・HP0・情報不明Roomは開催通知に含めない',async()=>{
 const rooms=[roomFixture('clear',{state:{status:'available',value:'cleared'}}),roomFixture('expired',{expiresAt:{status:'available',value:'2026-09-08T12:00:00Z'}}),roomFixture('zero',{hp:{status:'available',value:{current:0,max:1000}}}),roomFixture('unknown-state',{state:{status:'unknown'}}),roomFixture('unknown-hp',{hp:{status:'unknown'}}),roomFixture('unknown-expiry',{expiresAt:{status:'unknown'}})];
 assert.deepEqual(await loadRaidActivity({rpc:async()=>({data:{rooms,nextOffset:null},error:null})},true,now),{mode:'room',activeUntil:0});
});
test('Room取得失敗・不正応答時に旧一覧へフォールバックしない',async()=>{
 for(const response of [{data:null,error:{message:'network'}},{data:{},error:null}]){
  const calls=[];await assert.rejects(()=>loadRaidActivity({rpc:async name=>{calls.push(name);return response;}},true,now));
  assert.deepEqual(calls,['list_raid_rooms_v1']);
 }
});
test('Room flag falseは旧一覧応答とerrorを保持しRoom RPCを呼ばない',async()=>{
 for(const response of [{data:[{id:'legacy'}],error:null},{data:null,error:{message:'failure'}}]){
  const calls=[];assert.deepEqual(await loadRaidActivity({rpc:async name=>{calls.push(name);return response;}},false,now),{mode:'legacy',...response});
  assert.deepEqual(calls,['get_active_raids']);
 }
});
