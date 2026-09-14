import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolveBattle, memberSnapshot, makeParty, difficulties, skillSnapshot } from './raid-launch-balance-simulate.mjs';

const candidate = JSON.parse(fs.readFileSync('src/domain/gameplay/canonical/data/raid_strategy_profiles_20260914.json', 'utf8'));
const counters = { SHINJUKU: ['SKILL_006','SKILL_002'], SHIBUYA: ['SKILL_004','SKILL_030'], IKEBUKURO: ['SKILL_015','SKILL_022'], ROPPONGI: ['SKILL_030','SKILL_039'], AKIHABARA: ['SKILL_013','SKILL_039'], KAWASAKI: ['SKILL_004','SKILL_011'], YOKOHAMA: ['SKILL_030','SKILL_011'] };
const seeds = Array.from({length:20}, (_,i)=>104729+i*7919);
const rows = [];
for (const {profile,baseline} of candidate.profiles) {
  const tier = difficulties.indexOf(profile.difficultyId);
  const party = makeParty(tier, [0,160000,200000,260000][tier]);
  const players = party.members.map((m,i)=>memberSnapshot(m,i,'PLAYER'));
  // Identical characters, levels, equipment and stats; change two general skills only.
  const counterPlayers = structuredClone(players);
  for (let i=0;i<2;i++) {
    const replacement=skillSnapshot({skillId:counters[profile.areaId][i],plus:tier});
    if (!counterPlayers[i].skills.some(s=>s.id===replacement.id)) {
      const index=counterPlayers[i].skills.findLastIndex(s=>!s.exclusiveCharacterId);
      assert.ok(index>=0);
      counterPlayers[i].skills[index]=replacement;
    }
  }
  assert.deepEqual(players.map(p=>p.stats),counterPlayers.map(p=>p.stats));
  const variants = {};
  for (const [name,p,en] of [['baseline',players,baseline],['candidate',players,profile],['counter',counterPlayers,profile]]) {
    const actions = {}; let damage=0, applied=0, healing=0, rounds=0, survivors=0;
    for (const seed of seeds) {
      const enemies = en.members.map((m,i)=>memberSnapshot(m,i));
      const result = resolveBattle(seed,'BALANCED',30,p,enemies);
      damage += result.playerRawDamage;
      applied += enemies.reduce((sum,e,i)=>sum+Math.max(0,e.stats.hp-result.enemy[i].hp),0);
      rounds += result.rounds; survivors += result.player.filter(p=>p.hp>0).length;
      for (const e of result.events) {
        if (e.type==='ACTION' && e.payload.actorId?.startsWith('enemy_') && e.payload.skillId) actions[e.payload.skillId]=(actions[e.payload.skillId]??0)+1;
        if (e.type==='HEAL' && e.payload.targetId?.startsWith('enemy_')) healing+=e.payload.effectiveAmount??0;
      }
    }
    variants[name]={rawDamage:Math.round(damage/seeds.length),netHpReduction:Math.round(applied/seeds.length),enemyHealing:Math.round(healing/seeds.length),rounds:rounds/seeds.length,survivors:survivors/seeds.length,enemySkillActions:actions};
  }
  rows.push({area:profile.areaId,difficulty:profile.difficultyId,partyPower:party.power,maxHp:profile.maxHp,...variants});
}
const output='docs/development/raid_strategy_simulation_20260914.json';
fs.writeFileSync(output,JSON.stringify({status:'CANDIDATE_MEASUREMENT_NOT_ACCEPTANCE',seeds,notes:['Local current repository engine; not live E2E.','Synthetic parties; same stats for counter comparison.','netHpReduction is end-of-battle remaining-HP comparison, not the server contribution ledger.'],rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({area:r.area,difficulty:r.difficulty,power:r.partyPower,raw:r.candidate.rawDamage,counterRaw:r.counter.rawDamage,heal:r.candidate.enemyHealing,skills:Object.keys(r.candidate.enemySkillActions)})),null,2));
