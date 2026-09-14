import { strict as assert } from "node:assert";
import {
  canonicalCharacterStats,
  canonicalEquipmentLimitBreakMultiplier,
  canonicalEquipmentLimitBreakOptions,
  canonicalEquipmentLevelCap,
  canonicalEquipmentLevelScale,
  canonicalLevelBaseStat,
  canonicalSkillSlotCount,
} from "../src/domain/gameplay/canonical/calculations.ts";
import {
  CANONICAL_CHARACTERS,
  CANONICAL_EQUIPMENT_LIMIT_BREAK,
  CANONICAL_EQUIPMENT_PROGRESSION,
  CANONICAL_EQUIPMENTS,
  CANONICAL_SKILLS,
} from "../src/domain/gameplay/canonical/masters.ts";

const unique = (values) => assert.equal(new Set(values).size, values.length);
assert.equal(CANONICAL_CHARACTERS.length, 60); unique(CANONICAL_CHARACTERS.map((item) => item.character_id));
assert.equal(CANONICAL_SKILLS.length, 70); unique(CANONICAL_SKILLS.map((item) => item.skill_id));
assert.equal(CANONICAL_EQUIPMENTS.length, 170); unique(CANONICAL_EQUIPMENTS.map((item) => item.equipment_id));

const characterIds = new Set(CANONICAL_CHARACTERS.map((item) => item.character_id));
for (const skill of CANONICAL_SKILLS) if (skill.exclusive_character_id) assert.ok(characterIds.has(skill.exclusive_character_id), skill.skill_id);
for (const equipment of CANONICAL_EQUIPMENTS) if (equipment.exclusive_character_id) assert.ok(characterIds.has(equipment.exclusive_character_id), equipment.equipment_id);
assert.deepEqual([0, 1, 2, 3, 4, 5].map(canonicalSkillSlotCount), [3, 4, 5, 5, 5, 6]);
assert.equal(CANONICAL_EQUIPMENT_LIMIT_BREAK.cost_curve.reduce((sum, cost) => sum + cost, 0), 25);
assert.equal(CANONICAL_EQUIPMENT_LIMIT_BREAK.max_level, 10);
assert.equal(canonicalEquipmentLimitBreakMultiplier(10), 1.4);
assert.equal(CANONICAL_EQUIPMENT_PROGRESSION.status, "PRODUCTION_FROZEN");
assert.deepEqual(CANONICAL_EQUIPMENT_PROGRESSION.level_cap_by_limit_break, [50,60,70,80,90,100,100,100,100,100,100]);
assert.deepEqual([...Array(11).keys()].map(canonicalEquipmentLevelCap), [50,60,70,80,90,100,100,100,100,100,100]);
assert.equal(canonicalEquipmentLevelScale(1), 0.5);
assert.equal(canonicalEquipmentLevelScale(50), 0.75);
assert.equal(canonicalEquipmentLevelScale(100), 1);
assert.deepEqual(
  canonicalEquipmentLimitBreakOptions("ACCESSORY", 5, CANONICAL_EQUIPMENT_LIMIT_BREAK.slot_options),
  [{ unlockLevel: 3, values: { LUK_RATE: 0.03 } }, { unlockLevel: 5, values: { CRITICAL_RATE: 0.05 } }],
);
assert.equal(CANONICAL_EQUIPMENTS.filter((item) => item.random_options).length, 0);
assert.equal(CANONICAL_EQUIPMENTS.find((item) => item.equipment_id === "ACCESSORY_049")?.display_name, "フェイト・チャーム");
assert.equal(CANONICAL_EQUIPMENTS.find((item) => item.equipment_id === "ACCESSORY_050")?.display_name, "クイーンズ・シグネット");
assert.equal(CANONICAL_SKILLS.find((item) => item.skill_id === "SKILL_051")?.effects.includes("IGNORE_DEF 55%"), true);
assert.equal(canonicalLevelBaseStat(100, 1000, 1), 100);
assert.equal(canonicalLevelBaseStat(100, 1000, 100), 1000);
assert.deepEqual(canonicalCharacterStats({ hp: 100, atk: 100, def: 100, spd: 100, luk: 100 }, { hp: 1000, atk: 1000, def: 1000, spd: 1000, luk: 1000 }, 1, 1, "BALANCED"), { hp: 108, atk: 108, def: 108, spd: 103, luk: 103 });
for (const character of CANONICAL_CHARACTERS) {
  for (const level of [1, 2, 50, 99, 100]) {
    for (const awakening of [0, 1, 2, 3, 4, 5]) {
      const stats = canonicalCharacterStats(character.lv1, character.lv100, level, awakening, character.growth_pattern);
      assert.ok(Object.values(stats).every(Number.isInteger), `${character.character_id} level ${level} awakening ${awakening}`);
    }
  }
}
console.log("Canonical gameplay foundation verification passed.");
