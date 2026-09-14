import assert from 'node:assert/strict';
import { RAID_AREA_STRATEGIES, getRaidAreaStrategy, parseRaidRewardPolicies } from '../src/domain/raidStrategy.ts';
import { createRaidRoomClearRewardClient } from '../src/domain/raidRoomClearReward.ts';
assert.equal(Object.keys(RAID_AREA_STRATEGIES).length, 7);
assert.equal(getRaidAreaStrategy('SHIBUYA').counter, '耐久・SPD対策');
assert.equal(getRaidAreaStrategy('UNKNOWN'), null);
assert.equal(getRaidAreaStrategy('AKIHABARA', true).identity, '状態異常型');
assert.equal(getRaidAreaStrategy('YOKOHAMA', true).identity, '持久・回復型');
assert.equal(getRaidAreaStrategy('AKIHABARA', false).identity, '速度・バランス型');
const policies = ['beginner','intermediate','advanced','expert'].map((difficulty, i) => ({difficulty, enabled:i<2, status:i<2?'ACTIVE':'PENDING_CONTRIBUTION', version:2, instanceItems:[{itemId:'SKILL_MANUAL',quantity:1}], daily:{chanceBp:3000, items:[{itemId:'NORMAL_GACHA_TICKET_RANDOM',quantity:1}]}}));
assert.equal(parseRaidRewardPolicies(policies).length, 4);
for (const mutate of [p=>p[2].enabled=true,p=>p[0].daily.chanceBp=10001,p=>p[0].instanceItems[0].quantity=0,p=>p[3].difficulty='beginner']) {
 const bad=structuredClone(policies);mutate(bad);assert.throws(()=>parseRaidRewardPolicies(bad));
}
const timestamp='2026-09-14T12:00:00Z';
const base={roomId:'room-a',status:'issued',clearGate:{status:'succeeded',ruleVersion:2,contributionDamage:100,minimumContributionDamage:0,cleared:true},issuedAt:timestamp,expiresAt:null,items:[{itemId:'SKILL_MANUAL',quantity:1,delivery:'DIRECT',presentId:null,presentStatus:null,claimedAt:timestamp,expiresAt:null}]};
async function parse(data) { return createRaidRoomClearRewardClient({rpc:async()=>({data,error:null})}).getReward('room-a'); }
assert.equal((await parse(base)).dailyBonus, undefined);
const daily={dayKey:'2026-09-14',won:true,items:[{itemId:'NORMAL_GACHA_TICKET_RANDOM',quantity:1}],sourceRoomId:'room-a',issuedAt:timestamp};
assert.deepEqual((await parse({...base,dailyBonus:daily})).dailyBonus,daily);
assert.equal((await parse({...base,dailyBonus:{...daily,won:false,items:[]}})).dailyBonus.items.length,0);
await assert.rejects(parse({...base,dailyBonus:{...daily,sourceRoomId:'room-b'}}));
await assert.rejects(parse({...base,dailyBonus:{...daily,won:false}}));
console.log('PASS: seven hints, authority policy fail-closed, legacy receipt, daily winner/loser, cross-room rejection');
