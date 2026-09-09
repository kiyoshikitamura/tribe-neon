import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
const {parseCanonicalEffect}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(fs.readFileSync('src/domain/battle/canonical_effects.ts','utf8'))).toString('base64'));
const dir='docs/development/raid-launch-balance';
const data='src/domain/gameplay/canonical/data/';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const variants=json(data+'raid_production_20260830.json').variants;
const characters=json(data+'characters_20260821.json');
const skills=json(data+'skills_20260821.json').skills;
const equipment=json(data+'equipment_20260821.json').equipments;
const gates={beginner:null,intermediate:160000,advanced:200000,expert:240000};
fs.mkdirSync(dir,{recursive:true});
const protectedFiles=execFileSync('git',['ls-files','src/domain/battle','supabase/functions/resolve-battle','src/domain/gameplay/canonical/data','supabase/migrations','docs/development/raid-production-preparation/bundle','config/raid-room/preview-settings.template.json'],{encoding:'utf8'}).trim().split(/\r?\n/);
const baselineFile=dir+'/validation-baseline.json';
if(process.argv.includes('--baseline')){
 const pool=json(data+'quest_enemy_pools_20260830.json').entries;
 const baseline={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),protectedFiles:Object.fromEntries(protectedFiles.map(p=>[p,hash(p)])),authority:'Repository candidate. No live DB reads; old audit Damage excluded.',difficulties:gates,settings:json('docs/development/raid-production-preparation/audit-a/public-settings.json'),rewards:json(data+'raid_rewards_20260830.json'),profiles:variants.flatMap(v=>Object.keys(gates).map(d=>({...v,difficultyId:d,minimumPower:gates[d],members:v.memberCharacterIds.map(id=>({characterId:id,equipment:[],skills:pool.filter(p=>p.characterId===id&&p.difficulty==='HARD').sort((a,b)=>Number(b.localAffinity==='LOCAL')-Number(a.localAffinity==='LOCAL')||b.weight-a.weight)[0]?.skillLoadout??null}))})))};
 fs.writeFileSync(baselineFile,JSON.stringify(baseline,null,2)+'\n');console.log('Baseline saved: 28 effective profiles; '+protectedFiles.length+' protected files');
}
const baseline=json(baselineFile),candidate=json('config/raid-room/launch-balance.json');
assert.equal(candidate.profiles.length,28);
const expected=new Set(variants.flatMap(v=>Object.keys(gates).map(d=>v.raidVariantId+'/'+d)));
const ids=new Set(),seenChars=new Set(),seenSkills=new Set(),seenEquipment=new Set();
for(const p of candidate.profiles){
 const key=p.raidVariantId+'/'+p.difficultyId;assert(expected.has(key),key);assert(!ids.has(key),'duplicate '+key);ids.add(key);
 const original=variants.find(v=>v.raidVariantId===p.raidVariantId);assert.equal(p.raidName,original.raidName);assert.equal(p.areaId,original.areaId);assert.equal(p.minimumPower,gates[p.difficultyId]);
 assert(Number.isSafeInteger(p.maxHp)&&p.maxHp>0);assert.equal(p.members.length,5);assert.equal(new Set(p.members.map(m=>m.characterId)).size,5);
 for(const [i,m] of p.members.entries()){
  assert.equal(m.slot,i+1);assert(characters.characters.some(c=>c.character_id===m.characterId),m.characterId);seenChars.add(m.characterId);
  assert(Number.isInteger(m.level)&&m.level>=1&&m.level<=100);assert(Number.isInteger(m.awakeningLevel)&&m.awakeningLevel>=0&&m.awakeningLevel<=5);
  for(const k of ['hp','atk','def','spd','luk'])assert(Number.isSafeInteger(m.baseStats[k])&&m.baseStats[k]>=0,key+' '+k);
  assert(m.skills.length>0&&m.skills.length<=characters.awakening.skill_slots[m.awakeningLevel]);assert.equal(new Set(m.skills.map(s=>s.skillId)).size,m.skills.length);
  let exclusive=0;for(const s of m.skills){const master=skills.find(x=>x.skill_id===s.skillId);assert(master,s.skillId);assert(Number.isInteger(s.plus)&&s.plus>=0&&s.plus<=10);if(master.exclusive_character_id){exclusive++;assert.equal(master.exclusive_character_id,m.characterId);}assert(master.effects.length>0);seenSkills.add(s.skillId);}assert(exclusive<=1);
  const slots=new Set();for(const e of m.equipment){const master=equipment.find(x=>x.equipment_id===e.equipmentId);assert(master,e.equipmentId);assert(!slots.has(master.category));slots.add(master.category);assert(Number.isInteger(e.plus)&&e.plus>=0&&e.plus<=10);assert(Number.isInteger(e.level)&&e.level>=1&&e.level<=Math.min(100,50+e.plus*10));if(master.exclusive_character_id)assert.equal(master.exclusive_character_id,m.characterId);seenEquipment.add(e.equipmentId);}
 }
}
for(const [p,h] of Object.entries(baseline.protectedFiles))assert.equal(hash(p),h,'Protected file changed: '+p);
for(const id of seenSkills){const skill=skills.find(s=>s.skill_id===id);for(const e of skill.effects)assert.notEqual(parseCanonicalEffect(e).type,'RAW','Unsupported effect '+id+': '+e);}
const result={status:'PASS',profiles:ids.size,characters:seenChars.size,skills:seenSkills.size,equipment:seenEquipment.size,protectedFilesUnchanged:Object.keys(baseline.protectedFiles).length,checks:['all 7 Areas x 4 difficulties exactly once','5 distinct valid Characters per party','party names unchanged','equipment references/category/owner/level caps valid','skills references/owner/exclusive limit/slot count valid','all four fixed power gates unchanged','common masters, canonical runtime, Replay Edge, existing migrations and release bundle byte-identical'],candidateSha256:hash('config/raid-room/launch-balance.json')};
fs.writeFileSync(dir+'/validation-structure.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
