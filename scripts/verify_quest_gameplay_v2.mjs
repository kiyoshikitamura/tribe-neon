import assert from "node:assert/strict";
import fs from "node:fs";
import { CANONICAL_CHARACTERS, CANONICAL_SKILLS } from "../src/domain/gameplay/canonical/masters.ts";
import { canonicalCharacterStats } from "../src/domain/gameplay/canonical/calculations.ts";
import { resolveCanonicalBattle } from "../src/domain/battle/canonical_runtime.ts";
import { CANONICAL_QUESTS, CANONICAL_QUEST_ENCOUNTERS } from "../src/domain/gameplay/canonical/quests.ts";

assert.equal(CANONICAL_QUESTS.length, 21);
assert.equal(CANONICAL_QUEST_ENCOUNTERS.length, 21);
assert.equal(CANONICAL_QUESTS.filter((q) => q.unlockCondition.type === "OPEN").length, 7);
assert.equal(CANONICAL_QUESTS.filter((q) => q.unlockCondition.type === "FIRST_CLEAR").length, 14);
assert.equal(new Set(CANONICAL_QUEST_ENCOUNTERS.flatMap((e) => e.members.map((m) => m.characterId))).size, 60);
const allowedEnemySkillIds = new Set(Array.from({length:50}, (_, index) => `SKILL_${String(index + 1).padStart(3, "0")}`));
const enemySkillRefs = CANONICAL_QUEST_ENCOUNTERS.flatMap((e) => e.members.flatMap((m) => m.skillLoadout));
assert(enemySkillRefs.length > 0);
assert(enemySkillRefs.every((id) => allowedEnemySkillIds.has(id)), "Quest Enemy skill refs must be SKILL_001-SKILL_050");
assert.equal(enemySkillRefs.filter((id) => /^SKILL_0(?:5[1-9]|6[0-9]|70)$/.test(id)).length, 0);
for (const encounter of CANONICAL_QUEST_ENCOUNTERS) {
  assert.equal(encounter.members.length, 5);
  assert(["BALANCED","ATTACK_PRIORITY","SKILL_PRIORITY"].includes(encounter.enemyTactic));
  for (const member of encounter.members) {
    assert.equal(member.equipmentLoadout.length, 0);
    assert(member.skillLoadout.length >= 1 && member.skillLoadout.length <= (encounter.difficulty === "HARD" ? 3 : 2));
    for (const id of member.skillLoadout) assert(CANONICAL_SKILLS.some((skill) => skill.skill_id === id));
  }
}

const skill = (id) => {
  const master = CANONICAL_SKILLS.find((entry) => entry.skill_id === id);
  assert(master, id);
  return { id:master.skill_id,name:master.name,activationType:master.activation_type,target:master.target,cooldown:master.cooldown,availableFromRound:master.available_from_round,effects:master.effects,exclusiveCharacterId:master.exclusive_character_id };
};
const unit = (characterId, level, awakening, team, skillIds, index) => {
  const character = CANONICAL_CHARACTERS.find((entry) => entry.character_id === characterId);
  assert(character, characterId);
  return { id:`${team.toLowerCase()}_${index}_${characterId}`,characterId,name:character.name,team,alignment:character.attribute,stats:canonicalCharacterStats(character.lv1,character.lv100,level,awakening,character.growth_pattern),skills:skillIds.map(skill) };
};
const enemyParty = (encounter) => encounter.members.map((member,index) => unit(member.characterId,member.level,member.awakening,"ENEMY",member.skillLoadout,index));
const playerIds = ["char_reiji_01","char_mio_01","char_go_01","char_koharu_01","char_ageha_01"];
const loadouts = [
  ["SKILL_054","SKILL_047","SKILL_036"], ["SKILL_060","SKILL_048","SKILL_039"],
  ["SKILL_051","SKILL_050","SKILL_036"], ["SKILL_053","SKILL_028","SKILL_006"],
  ["SKILL_055","SKILL_045","SKILL_037"],
];
const playerParty = (level, awakening, skillCount) => playerIds.map((id,index) => unit(id,level,awakening,"PLAYER",loadouts[index].slice(0,skillCount),index));
const profiles = {
  fresh: playerParty(7,0,1),
  recommended: playerParty(21,1,3),
  overpowered: playerParty(40,2,3),
};
const summary = {};
for (const profileName of Object.keys(profiles)) {
  summary[profileName] = {};
  for (const difficulty of ["EASY","NORMAL","HARD"]) {
    const rows = CANONICAL_QUEST_ENCOUNTERS.filter((entry) => entry.difficulty === difficulty);
    let wins=0,total=0,timeouts=0,oneRound=0,noDamage=0;
    for (const encounter of rows) for (let seed=1;seed<=12;seed+=1) {
      const input = { seed:seed*7919+encounter.questId.length,tactic:"BALANCED",enemyTactic:encounter.enemyTactic,maxRounds:15,player:profiles[profileName],enemy:enemyParty(encounter) };
      const result = resolveCanonicalBattle(input);
      const repeat = resolveCanonicalBattle(input);
      assert.deepEqual({winner:result.winner,rounds:result.rounds,events:result.events},{winner:repeat.winner,rounds:repeat.rounds,events:repeat.events});
      total++; if(result.winner==="PLAYER") wins++; if(result.rounds>=15) timeouts++; if(result.rounds<=1) oneRound++; if(result.playerRawDamage===0) noDamage++;
    }
    summary[profileName][difficulty]={wins,total,winRate:Number((wins/total).toFixed(3)),timeouts,oneRound,noDamage};
  }
}
assert(summary.fresh.EASY.winRate >= .8, "Fresh EASY target");
assert(summary.recommended.NORMAL.winRate >= .65, "Recommended NORMAL target");
assert(summary.fresh.HARD.winRate <= .5, "Fresh HARD must remain challenging");
assert(summary.recommended.HARD.winRate >= .35, "Recommended HARD must be viable");
assert(summary.overpowered.HARD.winRate >= .9, "Overpowered HARD target");
for (const profile of Object.values(summary)) for (const result of Object.values(profile)) { assert.equal(result.noDamage,0); assert(result.oneRound < result.total/2); }

const migration = fs.readFileSync("supabase/migrations/20260822000185_quest_gameplay_v2.sql","utf8");
for (const token of ["canonical_quest_is_unlocked","get_canonical_quest_progression","enemy_tactic_id","canonical_skill_master","expected_members","FIRST_CLEAR:"]) assert(migration.includes(token),token);
console.log(JSON.stringify({status:"PASS",characterExposure:"60/60",enemySkillAuthority:"SKILL_001-SKILL_050",uniqueEnemySkillRefs:new Set(enemySkillRefs).size,summary},null,2));
