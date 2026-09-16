// Read-only playtest verification for the explicitly approved Shinjuku EASY adjustment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBattle } from '../supabase/functions/resolve-battle/engine.ts';
const read = name => JSON.parse(readFileSync(new URL(`../src/domain/gameplay/canonical/data/${name}`, import.meta.url), 'utf8'));
const characters = new Map(read('characters_20260821.json').characters.map(c => [c.character_id, c]));
const bosses = read('quest_bosses_20260917.json').stages;
const source = JSON.parse(readFileSync(new URL('../docs/product/quest-balance-20260917/source-extracted.json', import.meta.url), 'utf8'));
for (const stage of bosses) {
 for (const [index, member] of stage.members.entries()) {
  const row = source.boss_members105.find(r => r.Stage === stage.stageOrder && r.Slot === index + 1);
  assert.equal(member.characterId,row['Character ID']);
  assert.equal(member.level,row.Level);
  assert.equal(member.equippedSkillRefs[0],row['Skill ID']);
  assert.equal(member.stats.spd,row.SPD);
  for(const k of ['hp','atk','def']) assert.equal(member.stats[k],stage.questId === 'q_shinjuku_1' ? Math.round(row[k.toUpperCase()]*0.6/10)*10 : row[k.toUpperCase()]);
 }
}

// Real Lv1/+0 canonical characters, no equipment or skills. These are explicit
// comparison formations, not a claim that every newcomer receives these cards.
const parties = [
 ['ageha','kengo','shun','tomoya','souta'],
 ['ageha','naoto','sawat','gou','yoshihiko'],
 ['ageha','kengo','naoto','sawat','tomoya'],
 ['ageha','kengo','kaede','tomoya','shun'],
 ['go','kengo','ageha','leo','karen'],
].map(ids => ids.map((id,i) => {
 const c = characters.get(`char_${id}_01`); assert.ok(c);
 return {id:`player_${i}`,characterId:c.character_id,name:c.name,team:'PLAYER',alignment:c.attribute,level:1,awakeningLevel:0,rarity:c.rarity,stats:Object.fromEntries(['hp','atk','def','spd','luk'].map(k=>[k,c[`lv1_${k}`]])),skills:[]};
}));
const results = parties.map(player => {
 const power = player.reduce((n,p)=>n+p.stats.hp+p.stats.atk+p.stats.def,0);
 assert.ok(power>=50000 && power<=75000);
 return {power,characters:player.map(p=>p.characterId),stages:bosses.slice(0,3).map(b=>{
  const samples = Array.from({length:100},(_,i)=>{
   const result=resolveBattle(i+1,'ATTACK_PRIORITY',15,structuredClone(player),structuredClone(b.members),'BALANCED');
   return {seed:i+1,winner:result.winner,rounds:result.rounds};
  });
  return {questId:b.questId,enemyPower:b.recommendedPower,wins:samples.filter(r=>r.winner==='PLAYER').length,seedCount:samples.length,rounds:[Math.min(...samples.map(r=>r.rounds)),Math.max(...samples.map(r=>r.rounds))]};
 })};
});
for (const result of results) assert.ok(result.stages[0].wins >= 95, 'Shinjuku EASY introductory sample must pass at least 95/100 seeds');
console.log(JSON.stringify({engine:'unmodified resolve-battle/engine.ts',maxRounds:15,tactic:'ATTACK_PRIORITY',seeds:'1..100',assumption:'Lv1/+0, no skills or equipment; sample formations, not guaranteed starter roster',results},null,2));
