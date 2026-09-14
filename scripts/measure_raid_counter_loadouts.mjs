import fs from 'node:fs';
import { resolveBattle, memberSnapshot, makeParty, difficulties, skillSnapshot } from './raid-launch-balance-simulate.mjs';
const data=JSON.parse(fs.readFileSync('src/domain/gameplay/canonical/data/raid_strategy_profiles_20260914.json','utf8'));
const options={SHINJUKU:['SKILL_006','SKILL_002','SKILL_039'],SHIBUYA:['SKILL_004','SKILL_030','SKILL_013'],IKEBUKURO:['SKILL_015','SKILL_022'],ROPPONGI:['SKILL_030','SKILL_018'],AKIHABARA:['SKILL_013','SKILL_023','SKILL_039'],KAWASAKI:['SKILL_004','SKILL_011','SKILL_035'],YOKOHAMA:['SKILL_030','SKILL_011','SKILL_015']};
const train=[104729,112648,120567,128486,136405];
const holdout=Array.from({length:20},(_,i)=>800011+i*7919);
const rows=[];
for(const {profile} of data.profiles){
 const tier=difficulties.indexOf(profile.difficultyId),party=makeParty(tier,[0,160000,200000,260000][tier]);
 const players=party.members.map((m,i)=>memberSnapshot(m,i,'PLAYER')),enemies=profile.members.map((m,i)=>memberSnapshot(m,i));
 const score=(units,seeds)=>{let damage=0,survivors=0,rounds=0;for(const seed of seeds){const r=resolveBattle(seed,'BALANCED',30,units,enemies);damage+=Math.min(profile.maxHp,r.playerRawDamage);survivors+=r.player.filter(p=>p.hp>0).length;rounds+=r.rounds;}return {appliedAtFullHp:Math.round(damage/seeds.length),survivors:survivors/seeds.length,rounds:rounds/seeds.length};};
 let best=null;
 for(const skill of options[profile.areaId])for(let slot=0;slot<5;slot++){
  const refs=players[slot].skills;if(refs.some(s=>s.id===skill))continue;
  for(let index=0;index<refs.length;index++){
   if(refs[index].exclusiveCharacterId)continue;
   const copy=structuredClone(players);copy[slot].skills[index]=skillSnapshot({skillId:skill,plus:tier});
   const result=score(copy,train);
   if(!best||result.appliedAtFullHp>best.train.appliedAtFullHp)best={units:copy,slot:slot+1,replaced:refs[index].id,skill,train:result};
  }
 }
 const baseline=score(players,holdout),counter=score(best.units,holdout);
 rows.push({area:profile.areaId,difficulty:profile.difficultyId,power:party.power,maxHp:profile.maxHp,baseline,counter,ratio:counter.appliedAtFullHp/baseline.appliedAtFullHp,change:{slot:best.slot,from:best.replaced,to:best.skill}});
}
const result={status:'LOCAL_CANDIDATE_NOT_LIVE_ACCEPTANCE',metric:'min(playerRawDamage, full shared HP); matches non-late finalize. Battle-local healing does not refill shared HP.',method:'One general skill substitution; unchanged characters/stats/equipment. Select using 5 training seeds and evaluate using 20 different seeds.',train,holdout,rows};
fs.writeFileSync('docs/development/raid_counter_loadouts_20260914.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({area:r.area,difficulty:r.difficulty,ratio:+r.ratio.toFixed(3),change:r.change,damage:r.counter.appliedAtFullHp})),null,2));
