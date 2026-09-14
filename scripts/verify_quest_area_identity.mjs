import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const q=JSON.parse(fs.readFileSync('src/domain/gameplay/canonical/data/quests_20260830.json','utf8'));
const enemy=JSON.parse(fs.readFileSync('src/domain/gameplay/canonical/data/quest_enemy_pools_20260830.json','utf8'));
assert.equal(q.quests.length,21);
assert.equal(new Set(q.quests.map(x=>x.rewardPoolId)).size,21);
for(const quest of q.quests){
 assert.equal(quest.cashReward,({EASY:300,NORMAL:600,HARD:1000})[quest.difficulty]);
 const pool=q.rewardPools.find(x=>x.rewardPoolId===quest.rewardPoolId);
 const baseline=q.rewardPools.find(x=>x.rewardPoolId===`QUEST_${quest.difficulty}_20260830`);
 assert.deepEqual(pool.items,baseline.items,'Unapproved probability bias must not be activated');
 const entries=enemy.entries.filter(e=>e.areaId===quest.townId.toUpperCase()&&e.difficulty===quest.difficulty);
 assert(entries.every(e=>e.weight>0));
 for(const rarity of quest.difficulty==='EASY'?['N','R']:quest.difficulty==='NORMAL'?['N','R','SR']:['R','SR']){
  assert(entries.filter(e=>e.rarity===rarity).length >= (rarity==='R'&&quest.difficulty==='EASY'?1:rarity==='SR'&&quest.difficulty==='HARD'?3:2));
 }
}
const source=fs.readFileSync('src/domain/gameplay/canonical/questAreaIdentity.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const sandbox={exports:{},Set};vm.runInNewContext(compiled,sandbox);
const api=sandbox.exports;
assert.equal(Object.keys(api.QUEST_AREA_IDENTITIES).length,7);
assert.deepEqual(Array.from(api.questAreaRewardItemIds([
 {town_id:'shinjuku',reward_items:[{item_id:'A',quantity:1,probability_bp:0},{item_id:'B',quantity:1,probability_bp:200}]},
 {town_id:'shibuya',reward_items:[{item_id:'C',quantity:1,probability_bp:10000}]}
],'shinjuku')),['B']);
console.log('PASS: 21 separate pools, approved CASH, unchanged probabilities, enemy rarity feasibility, truthful area reward summaries');
