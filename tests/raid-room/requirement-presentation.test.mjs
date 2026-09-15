import test from 'node:test';
import assert from 'node:assert/strict';
import { getRaidJoinRequirementMessage } from '../../src/domain/raidRoomJoinPresentation.ts';
import { createRaidRoomRpcTransport } from '../../src/domain/raidRoomRpcTransport.ts';
import { createRaidRoomController } from '../../src/domain/raidRoomClient.ts';

const gate = (status, reason, actualPower = null, minimumPower = null) => ({ status, reason, actualPower, minimumPower });
test('level、定員、終了をサーバー理由から区別する', () => {
  assert.match(getRaidJoinRequirementMessage(gate('failed','level_requirement')), /プレイヤーLv5以上/);
  assert.match(getRaidJoinRequirementMessage(gate('failed','room_full')), /人数が上限/);
  assert.match(getRaidJoinRequirementMessage(gate('failed','room_ended')), /受付は終了/);
});
test('unknownは不足を断定せずpassedは表示しない', () => {
  assert.match(getRaidJoinRequirementMessage(gate('unknown','below_minimum',0,160000)), /確認できません/);
  assert.equal(getRaidJoinRequirementMessage(gate('passed','below_minimum',0,160000)),null);
  assert.doesNotMatch(getRaidJoinRequirementMessage(gate('failed','new_server_reason')), /new_server_reason/);
});
test('取得済み総合力と必要値、未取得を区別', () => {
  assert.match(getRaidJoinRequirementMessage(gate('failed','below_minimum',123456,160000)), /必要総合力：160,000以上／現在の総合力：123,456/);
  assert.match(getRaidJoinRequirementMessage(gate('failed','below_minimum',null,200000)), /現在の総合力：未確認/);
});

async function createFailure(message, code='42501', snapshot={data:{total_power:78228},error:null}) {
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return name==='get_my_power_snapshot'?snapshot:{data:null,error:{message,code}};}};
  const controller=createRaidRoomController(createRaidRoomRpcTransport(client,{enableCreation:true}));
  await controller.createRoom('intermediate','RAID_SHIBUYA_V1');
  return {calls,controller,error:controller.getSnapshot().createError};
}
test('create拒否をadapter→controllerへ伝搬、現在値readは1回',async()=>{
  const r=await createFailure('raid power requirement');
  assert.match(r.error,/必要総合力：160,000以上／現在の総合力：78,228/);
  assert.deepEqual(r.calls.map(c=>c.name),['create_raid_room_v1','get_my_power_snapshot']);
  assert.equal(r.controller.getSnapshot().selectedRoomId,null);
  await r.controller.createRoom('intermediate','RAID_SHIBUYA_V1');
  assert.equal(r.calls[0].args.p_request_id,r.calls[2].args.p_request_id,'same request retry contract unchanged');
});
for(const snapshot of [{data:null,error:{message:'offline'}},{data:{total_power:null},error:null},{data:{total_power:'123'},error:null}]) {
  test(`create補完失敗/不正値は0と断定しない ${JSON.stringify(snapshot)}`,async()=>{
    const r=await createFailure('raid power requirement','42501',snapshot);assert.match(r.error,/現在の総合力：未確認/);
  });
}
test('level/未取得/日次変更は余分なpower取得なし',async()=>{
  for(const [message,code,expected] of [['raid level requirement','42501',/プレイヤーLv5以上/],['power unavailable','42501',/総合力を確認できません/],['raid variant outside daily targets','22023',/現在の対象ではありません/]]){
    const r=await createFailure(message,code);assert.match(r.error,expected);assert.equal(r.calls.length,1);
  }
});
test('未知エラー本文は表示せず汎用失敗に留める',async()=>{
  const r=await createFailure('private server details');assert.doesNotMatch(r.error,/private server details/);assert.match(r.error,/挑戦を受け付けられません/);assert.equal(r.calls.length,1);
});
