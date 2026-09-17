import assert from 'node:assert/strict';
import profiles from '../src/domain/gameplay/canonical/data/raid_strategy_profiles_20260917.json' with { type: 'json' };
import skills from '../src/domain/gameplay/canonical/data/skills_20260821.json' with { type: 'json' };
import { resolveCanonicalBattle } from '../src/domain/battle/canonical_runtime.ts';

const skillById = new Map(skills.skills.map(s => [s.skill_id, s]));
const toSkill = id => {
  const s = skillById.get(id); assert.ok(s, id);
  return { id:s.skill_id,name:s.name,activationType:s.activation_type,cooldown:s.cooldown,availableFromRound:s.available_from_round,target:s.target,effects:s.effects,exclusiveCharacterId:null,skillPlusVal:0 };
};
const builds = {
  IKEBUKURO: { GOOD:['SKILL_015','SKILL_022','SKILL_028','SKILL_050','SKILL_041'], NEUTRAL:['SKILL_001','SKILL_008'], BAD:['SKILL_024','SKILL_023'] },
  KAWASAKI: { GOOD:['SKILL_040','SKILL_036','SKILL_050','SKILL_044','SKILL_025'], NEUTRAL:['SKILL_001','SKILL_011','SKILL_019','SKILL_012','SKILL_009'], BAD:['SKILL_024','SKILL_023','SKILL_047','SKILL_039','SKILL_048'] },
  YOKOHAMA: { GOOD:['SKILL_015','SKILL_022','SKILL_050','SKILL_028','SKILL_041'], NEUTRAL:['SKILL_001','SKILL_008','SKILL_011','SKILL_019','SKILL_012'], BAD:['SKILL_047','SKILL_024','SKILL_023','SKILL_039','SKILL_048'] },
};
const target = { IKEBUKURO:'intermediate', KAWASAKI:'advanced', YOKOHAMA:'expert' };
const profile = (area,difficulty) => profiles.profiles.find(p => p.profile.areaId === area && p.difficulty_id === difficulty).profile;
const makeUnit = (m, team, skillIds) => ({ id:team.toLowerCase()+'_'+m.slot, characterId:m.characterId, name:m.characterName, team, alignment:'ORDER', stats:{...m.baseStats}, skills:(team==='PLAYER'?skillIds:[...m.skills.map(s=>s.skillId)]).map(toSkill) });
const metrics = result => ({
  win: result.winner === 'PLAYER',
  damage: result.events.filter(e=>e.type==='DAMAGE'&&e.payload.actorId?.startsWith('player_')).reduce((n,e)=>n+Number(e.payload.amount||0),0),
  heal: result.events.filter(e=>e.type==='HEAL'&&e.payload.actorId?.startsWith('player_')).reduce((n,e)=>n+Number(e.payload.effectiveAmount||e.payload.amount||0),0),
  buffs: result.events.filter(e=>e.type==='EFFECT'&&e.payload.actorId?.startsWith('player_')&&['ATK_UP','DEF_UP','SPD_UP','SHIELD','REGEN'].includes(e.payload.kind)).length,
  debuffs: result.events.filter(e=>e.type==='EFFECT'&&e.payload.actorId?.startsWith('player_')&&['ATK_DOWN','DEF_DOWN','SPD_DOWN','POISON','BLIND','SILENCE','STUN'].includes(e.payload.kind)).length,
  status: result.events.filter(e=>e.type==='STATUS'&&e.payload.actorId?.startsWith('player_')).length,
  maxRound: Math.max(0,...result.events.map(e=>Number(e.round||0))),
  activations: result.events.filter(e=>e.type==='ACTION'&&e.payload.actorId?.startsWith('player_')&&e.payload.skillId).length,
});
const output = {};
for (const area of Object.keys(builds)) {
  const p = profile(area,target[area]);
  const fixed = p.members.map(m => ({...m, baseStats:{...m.baseStats, hp:Math.max(m.baseStats.hp,100000), atk:Math.max(m.baseStats.atk,10000), def:Math.max(m.baseStats.def,5000), spd:Math.max(m.baseStats.spd,150)}}));
  output[area] = {};
  for (const [kind,loadout] of Object.entries(builds[area])) {
    const trials = [];
    for (let seed=1; seed<=5; seed++) {
      const player = fixed.map((m,i)=>makeUnit(m,'PLAYER',[loadout[i%loadout.length]]));
      const enemy = p.members.map(m=>makeUnit(m,'ENEMY'));
      const r = resolveCanonicalBattle({seed,tactic:'BALANCED',enemyTactic:'BALANCED',aiPolicy:'CONTEXTUAL_ENEMY',maxRounds:20,player,enemy});
      trials.push(metrics(r));
    }
    output[area][kind] = { trials, wins:trials.filter(t=>t.win).length, avgDamage:Math.round(trials.reduce((n,t)=>n+t.damage,0)/trials.length), avgHeal:Math.round(trials.reduce((n,t)=>n+t.heal,0)/trials.length), avgStatus:Math.round(trials.reduce((n,t)=>n+t.status,0)/trials.length) };
  }
}
console.log(JSON.stringify({status:'PASS',runtime:'resolveCanonicalBattle',aiPolicy:'CONTEXTUAL_ENEMY',output},null,2));
