import assert from 'node:assert/strict';
import { canPromptBeginnerReward } from '../src/domain/mission/beginnerRewardPrompt.ts';
const facts = {free_skill:true,free_equipment:true,character:false,quest:false,pvp:false,raid:false,guild:false};
const state={facts,missions:[{id:'MIS_N_P002',status:'CLEAR'},{id:'MIS_N_P004',status:'CLEAR'}]};
assert.equal(canPromptBeginnerReward({...state,facts:{...facts,free_equipment:false}},'gacha'),false);
assert.equal(canPromptBeginnerReward(state,'gacha'),true);
assert.equal(canPromptBeginnerReward(state,'character'),false,'Tutorial reward is not a new experience');
assert.equal(canPromptBeginnerReward(state,'patrol'),false);
for(const [tab,fact] of [['character','character'],['patrol','quest'],['pvp','pvp'],['raid','raid']]) {
 assert.equal(canPromptBeginnerReward({...state,facts:{...facts,[fact]:true}},tab),true);
}
assert.equal(canPromptBeginnerReward({...state,facts:{...facts,guild:true}},'guild'),false,'Guild view is not joining');
assert.equal(canPromptBeginnerReward({...state,missions:[{id:'MIS_N_P010',status:'CLEAR'}]},'guild'),true);
console.log('PASS: both free categories, post-Tutorial experience gating, Guild view excluded');
