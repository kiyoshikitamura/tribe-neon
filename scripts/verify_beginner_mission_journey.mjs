import assert from 'node:assert/strict';
import { nextBeginnerAction, beginnerRewardIds, priorityBeginnerRewardIds } from '../src/domain/mission/beginnerJourney.ts';
const facts = { free_skill:true, free_equipment:true, character:true, quest:true, pvp:false, raid:false, guild:false };
const mission = id => ({id,category:'NORMAL',status:'CLEAR'});
const state = {facts,missions:[mission('MIS_D_001'),mission('MIS_N_P003'),mission('MIS_N_P004')]};
assert.equal(nextBeginnerAction(state,'inactive').key,'pvp'); // Tutorial経験のやり直しなし
assert.deepEqual(priorityBeginnerRewardIds(state),['MIS_N_P004']);
assert.deepEqual(priorityBeginnerRewardIds({...state,facts:{...facts,free_skill:false,free_equipment:false}}),[]);
const ahead = {...state,facts:{...facts,pvp:true,guild:true}};
assert.deepEqual(priorityBeginnerRewardIds(ahead),[]); // 古い報酬で巻き戻さない
assert.deepEqual(beginnerRewardIds(ahead),['MIS_D_001','MIS_N_P003','MIS_N_P004']);
assert.equal(nextBeginnerAction(ahead,'inactive').key,'reflow');
assert.equal(nextBeginnerAction({...ahead,reflow_completed:true},'inactive'),null);
assert.equal(nextBeginnerAction({...ahead,reflow_completed:true},'active').key,'raid');
assert.equal(ahead.facts.raid,false); // 開催待ちで参加を書換えない
const pulls = {...state,missions:[mission('MIS_D_001')]};
assert.deepEqual(beginnerRewardIds(pulls,'gacha'),['MIS_D_001']); // 2カテゴリ1報酬
assert.deepEqual(beginnerRewardIds({...pulls,missions:[{...mission('MIS_D_001'),status:'CLAIMED'}]},'gacha'),[]);
const tomorrow = {...pulls,missions:[{...mission('MIS_D_001'),expires_at:'2026-09-13T15:00:00Z'}]};
assert.deepEqual(beginnerRewardIds(tomorrow,'gacha',Date.parse('2026-09-13T15:00:00Z')),[]);
assert.equal(nextBeginnerAction(tomorrow,'inactive').key,'pvp'); // 日次リセットは生涯経験を消さない
assert.equal(nextBeginnerAction(null,'active'),null);
console.log('PASS: server facts, advance without claims, reward priority, shared free reward, expiry, tutorial reuse, Raid reoffer');
