import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {masters,difficulties,parties,measure} from '../raid-launch-balance-simulate.mjs';
const dir='docs/development/raid-launch-balance/rarity-revision';
fs.mkdirSync(dir,{recursive:true});
const write=(name,data)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2)+'\n');
const baselineSha='1bf1bbe48909423430bd98a35216da9b19d44655';
const before=JSON.parse(execFileSync('git',['show',`${baselineSha}:config/raid-room/launch-balance.json`],{encoding:'utf8'}));
const config=structuredClone(before),chars=masters.characters.characters,skills=masters.skills.skills;
const cities=['新宿','渋谷','池袋','六本木','秋葉原','川崎','横浜'];
const areas=[...new Set(config.profiles.map(p=>p.areaId))];
const patterns=[['N','N','N','R','R'],['R','R','R','N','SR'],['SR','SR','SR','R','R'],['SSR','SSR','SSR','SR','SR']];
const usage=new Map(chars.map(c=>[c.character_id,0]));
const areaUsed=new Map(areas.map(a=>[a,new Set()]));
write('before',{baselineSha,config:before});
for(let tier=0;tier<4;tier++)for(const [a,area] of areas.entries()){
 const p=config.profiles.find(p=>p.areaId===area&&p.difficultyId===difficulties[tier]);
 const used=areaUsed.get(area),city=cities[a],roster=[];
 for(const rarity of patterns[tier]){
  const candidates=chars.filter(c=>c.rarity===rarity&&!used.has(c.character_id));
  candidates.sort((x,y)=>(usage.get(x.character_id)*100-(x.hometown===city?40:0))-(usage.get(y.character_id)*100-(y.hometown===city?40:0))||x.character_id.localeCompare(y.character_id));
  assert(candidates.length,`${area}/${rarity}`);
  const c=candidates[0];roster.push(c);used.add(c.character_id);usage.set(c.character_id,usage.get(c.character_id)+1);
 }
 // Area affiliation chooses the leader when available; the other slots retain rarity roles.
 const local=roster.findIndex(c=>c.hometown===city);if(local>0)roster.unshift(...roster.splice(local,1));
 p.members.forEach((m,i)=>{
  const c=roster[i];m.characterId=c.character_id;m.characterName=c.name;
  m.skills=m.skills.flatMap(ref=>{
   const old=skills.find(s=>s.skill_id===ref.skillId);
   if(!old.exclusive_character_id)return [ref];
   const own=skills.find(s=>s.exclusive_character_id===c.character_id&&!s.effects.some(e=>/SHIELD|HEAL|REGEN/.test(e)));
   return own?[{skillId:own.skill_id,plus:ref.plus}]:[];
  });
  assert(m.skills.length>0);
 });
}
assert([...areaUsed.values()].every(s=>s.size===20));
assert([...usage.values()].every(n=>n>0),'Use all available characters');
config.version='2026-09-10-launch-2-rarity';
config.status='offline-validated-candidate';
config.notes=['Difficulty rarity majority: N / R / SR / SSR, three primary and two complementary members.','Each Area has 20 distinct Characters across four difficulties; cross-Area reuse is allowed.','Names unchanged; local affiliation preferred, other Areas supply missing rarity roles.','baseStats are raid-only, before canonical equipment additions; equipment and generic skill roles are preserved.','Shared HP calibrated to current-engine damage at a nominal 15-hour uniform participation supply.','No common master, reward rule, power rule or Replay computation is modified.'];
const run=()=>config.profiles.map(p=>measure(p,parties[difficulties.indexOf(p.difficultyId)]));
const initial=run();write('initial',{profiles:structuredClone(config.profiles),rows:initial});
for(const [i,p] of config.profiles.entries()){
 const r=initial[i],t=difficulties.indexOf(p.difficultyId);
 assert(r.damage.min>0&&r.minimumPlayersActed===5,`Early incapacitation ${p.areaId}/${p.difficultyId}`);
 const desired=r.damage.average*[3,4,7.5,15][t]*[2.5,3.5,4.5,5.5][t]*.625;
 const step=desired<1e6?10000:100000;p.maxHp=Math.max(step,Math.round(desired/step)*step);
 p.members.forEach(m=>m.baseStats.hp=Math.ceil(p.maxHp/5));
}
const final=run();
const rows=final.map(r=>{
 const lower=final.find(x=>x.areaId===r.areaId&&difficulties.indexOf(x.difficultyId)===difficulties.indexOf(r.difficultyId)-1);
 const abnormal=r.damage.max>r.damage.min*1.5||r.rounds.min<8||r.rounds.max-r.rounds.min>=8||r.uniformSupplyHours<12||r.uniformSupplyHours>18||(lower&&r.damage.average<lower.damage.average*.85);
 const p=config.profiles.find(p=>p.areaId===r.areaId&&p.difficultyId===r.difficultyId);
 return abnormal?measure(p,parties[difficulties.indexOf(p.difficultyId)],[104729,130363,155921,196613,216091,262147]):r;
});
assert(rows.every(r=>r.minimumPlayersActed===5&&r.damage.min>0));
fs.writeFileSync('config/raid-room/launch-balance.json',JSON.stringify(config,null,2)+'\n');
write('after',{config,parties,rows,battleCount:rows.reduce((n,r)=>n+r.seedCount,0),usage:Object.fromEntries(usage)});
console.table(rows.map(r=>({area:r.areaId,tier:r.difficultyId,hp:r.maxHp,min:r.damage.min,max:r.damage.max,rounds:`${r.rounds.min}-${r.rounds.max}`,alive:`${r.survivors.min}-${r.survivors.max}`,hours:r.uniformSupplyHours.toFixed(1)})));
