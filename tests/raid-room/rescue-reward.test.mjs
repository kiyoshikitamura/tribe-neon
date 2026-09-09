import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaidRoomRescueRewardClient} from '../../src/domain/raidRoomRescueReward.ts';
const empty={roomId:'room',status:'unconfigured',rescueGate:{status:'unknown',minimumBattles:null,minimumContributionDamage:null},issuedAt:null,expiresAt:null,items:[]};
const issued={...empty,status:'issued',issuedAt:'2026-09-08T00:00:00Z',expiresAt:'2026-10-08T00:00:00Z',items:[{itemId:'CASH',quantity:37,presentId:'present',presentStatus:'UNCLAIMED',claimedAt:null,expiresAt:'2026-10-08T00:00:00Z'}]};
test('救援報酬adapterは参照RPCのみを呼び送付記録を保持',async()=>{let call;const c=createRaidRoomRescueRewardClient({rpc:async(name,args)=>{call={name,args};return {data:issued,error:null};}});assert.deepEqual(await c.getReward('room'),issued);assert.deepEqual(call,{name:'get_raid_room_rescue_reward_v1',args:{p_room_id:'room'}});});
test('救援報酬adapterは未設定と通信エラーを区別',async()=>{let error=null;const c=createRaidRoomRescueRewardClient({rpc:async()=>({data:empty,error})});assert.deepEqual(await c.getReward('room'),empty);error={message:'denied'};await assert.rejects(()=>c.getReward('room'));});
test('救援報酬adapterは別Room/不完全発行/数量不正を拒否',async()=>{for(const data of [{...empty,roomId:'other'},{...empty,status:'issued'},{...issued,issuedAt:null},{...issued,items:[{...issued.items[0],quantity:0}]},{...empty,items:issued.items}]){const c=createRaidRoomRescueRewardClient({rpc:async()=>({data,error:null})});await assert.rejects(()=>c.getReward('room'));}});
