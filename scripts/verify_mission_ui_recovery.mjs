import assert from 'node:assert/strict';
import { canClaimMission, missionClaimExpired, missionProgressEnded, reconcileMissionClaim, missionEventPriority, needsMissionGuild } from '../src/domain/mission/availability.ts';
const now = Date.parse('2026-09-12T09:00:00Z');
const deadline = new Date(now).toISOString();
assert.equal(canClaimMission({status:'CLEAR',eventClaimEndAt:deadline}, now-1),true);
assert.equal(canClaimMission({status:'CLEAR',eventClaimEndAt:deadline}, now),false);
assert.equal(canClaimMission({status:'CLEAR',eventClaimEndAt:null}, now),true);
assert.equal(canClaimMission({status:'CLAIMED',eventClaimEndAt:null}, now),false);
assert.equal(missionClaimExpired({eventClaimEndAt:'invalid'}, now),true);
assert.equal(missionProgressEnded({eventProgressOpen:true,eventProgressEndAt:deadline},now),true);
let requestCount=0, refreshCount=0, serverStatus='CLEAR', projectedStatus='CLEAR', grantCount=0, locked=true;
const lostResponse=new Error('network response lost');
await assert.rejects(reconcileMissionClaim(async()=>{requestCount++;serverStatus='CLAIMED';grantCount++;throw lostResponse;},async()=>{assert.equal(locked,true);refreshCount++;projectedStatus=serverStatus;},()=>true),e=>e===lostResponse);
locked=false;
assert.equal(projectedStatus,'CLAIMED');assert.equal(requestCount,1);assert.equal(grantCount,1);assert.equal(refreshCount,1);
let oldOwnerRefresh=0;
await assert.rejects(reconcileMissionClaim(async()=>{throw lostResponse;},async()=>{oldOwnerRefresh++;},()=>false));
assert.equal(oldOwnerRefresh,0,'session swap cannot project old owner');
const partial = await reconcileMissionClaim(async()=>({claimed_count:0,rewards:[]}),async()=>{projectedStatus='CLEAR';},()=>true);
assert.equal(partial.claimed_count,0);assert.equal(projectedStatus,'CLEAR','server no-op remains unclaimed');
await assert.rejects(reconcileMissionClaim(async()=>{throw lostResponse;},async()=>{throw new Error('refresh offline');},()=>true),e=>e===lostResponse);
console.log('Mission UI availability/reconciliation: PASS (deadline boundary, no expiry, invalid deadline, lost response after grant, owner swap, zero grant, refresh failure)');

assert.equal(needsMissionGuild({ctaTab:'guild',triggerType:'DONATE'}),true);
assert.equal(needsMissionGuild({triggerType:'GUILD_DONATION_COUNT'}),true);
assert.equal(needsMissionGuild({ctaAction:'guild_chat'}),true);
assert.equal(needsMissionGuild({ctaTab:'raid'}),false);
assert.deepEqual([
  {status:'CLAIMED',eventProgressOpen:false},
  {status:'CLEAR',eventProgressOpen:false,eventClaimEndAt:new Date(now+1).toISOString()},
  {status:'IN_PROGRESS',eventProgressOpen:true}
].map(m=>missionEventPriority(m,now)),[2,1,0]);
console.log('Mission event priority and Guild prerequisites: PASS');
