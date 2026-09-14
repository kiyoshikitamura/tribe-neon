import { strict as assert } from "node:assert";
import { canonicalCharacterStats, canonicalLevelBaseStat } from "../src/domain/gameplay/canonical/calculations.ts";
import { CANONICAL_CHARACTERS } from "../src/domain/gameplay/canonical/masters.ts";
import source from "../src/domain/gameplay/canonical/data/characters_20260821.json" with { type: "json" };
import growth from "../src/domain/gameplay/canonical/data/character_growth_20260914.json" with { type: "json" };
import expected from "../docs/development/evidence/character_growth_client_expected_20260914.json" with { type: "json" };

assert.equal(CANONICAL_CHARACTERS.length, 60);
for (const character of CANONICAL_CHARACTERS) {
  assert.equal(character.growth_pattern, source.characters.find(row => row.character_id === character.character_id).growth_pattern);
  assert.ok(Object.hasOwn(growth.exponents, character.growth_pattern));
}
assert.deepEqual(CANONICAL_CHARACTERS.reduce((counts, character) => {
  counts[character.growth_pattern] = (counts[character.growth_pattern] || 0) + 1;
  return counts;
}, {}), { ATTACKER: 12, DEFENDER: 12, SPEEDSTER: 12, LUCKY_STAR: 12, BALANCED: 12 });
assert.equal(canonicalLevelBaseStat(100, 200, 51), 151, "ROUND, not FLOOR");
for (const row of expected) {
  const character = CANONICAL_CHARACTERS.find(character => character.character_id === row.character_id);
  assert.deepEqual(
    canonicalCharacterStats(character.lv1, character.lv100, row.level, row.awakening, character.growth_pattern),
    { hp: row.hp, atk: row.atk, def: row.def, spd: row.spd, luk: row.luk },
    `${row.character_id} Lv${row.level} +${row.awakening}`,
  );
}
assert.throws(() => canonicalLevelBaseStat(100, 200, 0), RangeError);
assert.throws(() => canonicalLevelBaseStat(100, 200, 50, 0), RangeError);
assert.throws(() => canonicalCharacterStats({}, {}, 50, 6, "BALANCED"), RangeError);
assert.throws(() => canonicalCharacterStats({}, {}, 50, 0, "UNKNOWN"), RangeError);
console.log("Character growth authority and 360 shared client/server fixture cases passed.");
