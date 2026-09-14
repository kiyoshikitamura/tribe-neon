import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalCharacterStats,
  canonicalEquipmentLimitBreakMultiplier,
  canonicalSkillSlotCount,
} from "../src/domain/gameplay/canonical/calculations.ts";
import {
  CANONICAL_CHARACTERS,
  CANONICAL_EQUIPMENTS,
  CANONICAL_SKILLS,
} from "../src/domain/gameplay/canonical/masters.ts";

const root = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

assert.equal(CANONICAL_CHARACTERS.length, 60);
assert.equal(CANONICAL_SKILLS.length, 70);
assert.equal(CANONICAL_EQUIPMENTS.length, 170);
assert.deepEqual([0, 1, 2, 3, 4, 5].map(canonicalSkillSlotCount), [3, 4, 5, 5, 5, 6]);
assert.deepEqual([0, 1, 5, 10].map(canonicalEquipmentLimitBreakMultiplier), [1, 1.04, 1.2, 1.4]);

for (const character of CANONICAL_CHARACTERS) {
  assert.deepEqual(canonicalCharacterStats(character.lv1, character.lv100, 1, 0, character.growth_pattern), character.lv1);
  assert.deepEqual(canonicalCharacterStats(character.lv1, character.lv100, 100, 0, character.growth_pattern), character.lv100);
}

const runtimeFiles = [
  "src/hooks/useBattle.ts",
  "src/hooks/battle/battleAI.ts",
  "src/hooks/battle/deterministicBattleAdapter.ts",
  "src/hooks/battle/gvgSnapshotAdapter.ts",
  "src/lib/battle/battleSnapshot.ts",
  "src/lib/battle/deterministicBattle.ts",
  "src/domain/battle/canonical_runtime.ts",
  "src/utils/stats_calculator.ts",
  "supabase/functions/resolve-battle/engine.ts",
];
const forbiddenRuntime = [
  /CHARACTER_GROWTH_PATTERNS/,
  /OPEN_BETA_PROVISIONAL_CHARACTERS/,
  /rarityMultiplier/,
  /getCharacterApBonus/,
  /\bap_cost\b/,
  /\bap_max(?:_up)?\b/,
  /initialCooldown/,
  /plus_val\s*\*\s*0\.(?:10|1|20|2)\b/,
  /\b27000\b/,
];
for (const file of runtimeFiles) {
  const text = source(file);
  for (const pattern of forbiddenRuntime) assert.ok(!pattern.test(text), `${file} contains ${pattern}`);
}

const stats = source("src/utils/stats_calculator.ts");
assert.match(stats, /canonicalCharacterStats/);
assert.match(stats, /canonicalEquipmentFlatStat/);
assert.ok(!/random_options|rarity|growth|ap_/i.test(stats));

const clientAdapter = source("src/hooks/battle/deterministicBattleAdapter.ts");
assert.match(clientAdapter, /CANONICAL_SKILLS/);
assert.match(clientAdapter, /availableFromRound:\s*master\.available_from_round/);
assert.match(clientAdapter, /effects:\s*master\.effects/);
const battleHook = source("src/hooks/useBattle.ts");
assert.match(battleHook, /resolveDeterministicBattle/);
assert.match(battleHook, /battleMode === "GVG" \|\| battleMode === "PVP_PRACTICE" \? canonicalAuxEvents/);
assert.ok(!/characterId\s*===\s*["']11111111/.test(battleHook), "skill behavior must not be character-ID hardcoded");

const mock = source("src/utils/mock/mockRpc.ts");
assert.match(mock, /CANONICAL_CHARACTERS/);
assert.match(mock, /CANONICAL_SKILLS/);
assert.match(mock, /CANONICAL_EQUIPMENTS/);
assert.match(mock, /canonicalSkillSlotCount/);
assert.ok(!/skill_battle_master|equipment_battle_master/.test(mock));

const characterUi = source("src/app/components/CharacterTab.tsx");
assert.match(characterUi, /CANONICAL_SKILL_VIEW/);
assert.match(characterUi, /CANONICAL_EQUIPMENT_VIEW/);
assert.match(characterUi, /canonicalSkillSlotCount/);
assert.ok(!/AP-1|synergy-ap-reduced|SKILL_COOLDOWN_BY_RARITY/.test(characterUi));
const gachaUi = source("src/app/components/GachaTab.tsx");
assert.match(gachaUi, /handleScout\(normalGachaId, count, currency\)/);
assert.match(gachaUi, /gachaMasters\?\.find/);

const allProductionSources = [
  ...runtimeFiles,
  "src/app/components/CharacterTab.tsx",
  "src/app/components/CommonModals.tsx",
  "src/app/components/GachaTab.tsx",
  "src/app/context/GameContext.tsx",
  "src/app/context/hooks/useCharacterProgression.ts",
  "src/utils/mock/mockRpc.ts",
].map(source).join("\n");
assert.ok(!/constants\/characters|open_beta_provisional_characters/.test(allProductionSources));

assert.match(source("src/utils/skills_master_data.ts"), /CANONICAL_SKILLS\.map/);
assert.match(source("src/utils/equipments_master_data.ts"), /CANONICAL_EQUIPMENTS\.map/);
assert.match(source("supabase/functions/resolve-battle/engine.ts"), /resolveCanonicalBattle/);
assert.match(source("src/lib/battle/deterministicBattle.ts"), /resolveCanonicalBattle/);

console.log("canonical runtime final integration verification: PASS");
