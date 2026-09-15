import test from 'node:test';
import assert from 'node:assert/strict';
import {missionVisible, canClaimMission} from '../../src/domain/mission/availability.ts';
const deadline='2026-10-15T12:00:00Z',boundary=Date.parse(deadline);
test('SPECIAL: deadline crossing hides every status, preserving claim before boundary',()=>{
 for(const status of ['CLEAR','CLAIMED','IN_PROGRESS','LOCKED']) {
  const m={category:'SPECIAL',status,eventClaimEndAt:deadline};
  assert.equal(missionVisible(m,boundary-1),true);
  assert.equal(missionVisible(m,boundary),false);
  assert.equal(missionVisible(m,boundary+1),false);
  assert.equal(canClaimMission(m,boundary),false);
 }
 assert.equal(canClaimMission({status:'CLEAR',eventClaimEndAt:deadline},boundary-1),true);
});
test('null expiry and permanent missions remain visible',()=>{
 assert.equal(missionVisible({category:'SPECIAL',eventClaimEndAt:null},boundary),true);
 for(const category of ['NORMAL','DAILY']) assert.equal(missionVisible({category,eventClaimEndAt:deadline},boundary),true);
});
