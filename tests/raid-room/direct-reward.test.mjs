import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaidRoomClearRewardClient } from '../../src/domain/raidRoomClearReward.ts';
import { createRaidRoomRescueRewardClient } from '../../src/domain/raidRoomRescueReward.ts';
const time='2026-09-14T12:00:00Z';
const item={itemId:'CASH',quantity:300,delivery:'DIRECT',presentId:null,presentStatus:null,claimedAt:time,expiresAt:null};
for(const [name,create,gate] of [
 ['clear',createRaidRoomClearRewardClient,{clearGate:{status:'succeeded',ruleVersion:1,contributionDamage:100,minimumContributionDamage:1,cleared:true}}],
 ['rescue',createRaidRoomRescueRewardClient,{rescueGate:{status:'succeeded',minimumBattles:1,minimumContributionDamage:1}}],
]) {
 const receipt={roomId:'room',status:'issued',issuedAt:time,expiresAt:null,items:[item],...gate};
 test(`${name}: direct delivery requires no Present or claim expiry`,async()=>{
  const client=create({rpc:async()=>({data:receipt,error:null})});
  assert.deepEqual(await client.getReward('room'),receipt);
 });
 test(`${name}: rejects incomplete direct receipt and mismatched Present`,async()=>{
  for(const change of [{claimedAt:null},{presentId:'legacy'},{expiresAt:time},{delivery:'UNRECOGNIZED'}]) {
   const client=create({rpc:async()=>({data:{...receipt,items:[{...item,...change}]},error:null})});
   await assert.rejects(()=>client.getReward('room'));
  }
 });
}
