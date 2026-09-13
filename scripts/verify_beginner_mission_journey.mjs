import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextBeginnerAction, beginnerRewardIds, priorityBeginnerRewardIds } from '../src/domain/mission/beginnerJourney.ts';
const facts = { free_skill:true, free_equipment:true, character:true, quest:true, pvp:false, raid:false, guild:false };
const mission = id => ({id,category:'NORMAL',status:'CLEAR'});
const state = {facts,missions:[mission('MIS_D_001'),mission('MIS_N_P003'),mission('MIS_N_P004')]};
assert.equal(nextBeginnerAction(state,'inactive').key,'pvp'); // Tutorial後の自由先行経験のやり直しなし
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
const home = fs.readFileSync('src/app/components/HomeTab.tsx','utf8');
const contextual = fs.readFileSync('src/app/components/mission/BeginnerMissionRewardCta.tsx','utf8');
assert.doesNotMatch(home,/今回のミッション報酬を受け取る/);
assert.doesNotMatch(home,/mypage-primary-cta-eyebrow/);
assert.match(home,/ミッション：/);
assert.doesNotMatch(home,/その他の未受取報酬/);


console.log('PASS: server facts, advance without claims, reward priority, shared free reward, expiry, post-tutorial facts, Raid reoffer');

// Tutorial報酬が既にCLEARでも、学習Factsだけで全順序を決める。
const fresh = {facts:{free_skill:false,free_equipment:false,character:false,quest:false,pvp:false,raid:false,guild:false},missions:[mission('MIS_N_P002'),mission('MIS_N_P003'),mission('MIS_N_P004')]};
assert.equal(nextBeginnerAction(fresh,'inactive').key,'free_assets');
fresh.facts.free_skill=true;
assert.equal(nextBeginnerAction(fresh,'inactive').key,'free_assets');
fresh.facts.free_equipment=true;
for (const [key,fact] of [['character','character'],['quest','quest'],['pvp','pvp'],['guild','guild']]) {
  assert.equal(nextBeginnerAction(fresh,'inactive').key,key);
  const withClaims={...fresh,missions:fresh.missions.map(m=>({...m,status:'CLAIMED'}))};
  assert.equal(nextBeginnerAction(withClaims,'inactive').key,key);
  fresh.facts[fact]=true;
}
assert.equal(nextBeginnerAction(fresh,'inactive').key,'reflow');
assert.equal(nextBeginnerAction({...fresh,reflow_completed:true},'active').key,'raid');
const aheadQuest={...fresh,facts:{...fresh.facts,character:false,quest:true,pvp:true,guild:false}};
assert.equal(nextBeginnerAction(aheadQuest,'inactive').key,'character');
aheadQuest.facts.character=true;
assert.equal(nextBeginnerAction(aheadQuest,'inactive').key,'guild');
console.log('PASS: complete post-tutorial order, claim-independent advancement, free exploration, Raid reoffer');

const historical={facts:{...fresh.facts,free_skill:false,character:false,quest:false},missions:[],reflow_completed:true};
assert.equal(nextBeginnerAction(historical,'inactive'),null);
assert.equal(nextBeginnerAction(historical,'active').key,'raid');

// 開催中に未参加で帰還しても、過去の開催待ち・受取状態でGuildへ飛ばない。
const unjoined = {...fresh, facts:{...fresh.facts, raid:false, guild:false}, raid_unavailable_ack:true};
assert.equal(nextBeginnerAction(unjoined,'active').key,'raid');
assert.equal(nextBeginnerAction(unjoined,'unknown').key,'raid');
assert.equal(nextBeginnerAction(unjoined,'inactive').key,'guild');
assert.equal(nextBeginnerAction(unjoined,'inactive').title,'TRIBEに参加しよう');
assert.equal(nextBeginnerAction({...unjoined,facts:{...unjoined.facts,raid:true}},'active').key,'guild');
