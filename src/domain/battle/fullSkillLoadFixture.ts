import { canonicalCharacterStats, canonicalSkillSlotCount } from "../gameplay/canonical/calculations.ts";
import { CANONICAL_CHARACTERS, CANONICAL_SKILLS } from "../gameplay/canonical/masters.ts";
import { canonicalQuestById } from "../gameplay/canonical/quests.ts";
import { resolveDeterministicBattle, type BattleReplayEvent, type BattleSkill, type BattleUnitInput } from "../../lib/battle/deterministicBattle.ts";
import { getCharacterLocationBackground } from "../../utils/characterVisualAssets.ts";

export const BATTLE_FULL_SKILL_LOAD_SEED = 20260829;
export const BATTLE_FULL_SKILL_LOAD_LEVEL = 100;
export const BATTLE_FULL_SKILL_LOAD_AWAKENING = 5;
export const BATTLE_FULL_SKILL_LOAD_QUEST_ID = "QUEST_SHINJUKU_HARD";

export const BATTLE_FULL_SKILL_LOAD_PLAYER_NAMES = ["アゲハ", "レオ", "ミヤビ", "ゴウ", "コハル"] as const;
export const BATTLE_FULL_SKILL_LOAD_ENEMY_NAMES = ["ソラ", "タイガ", "ケンゴ", "レイジ", "ノア"] as const;

// The loadout fixes only Skill IDs. Every value below (effects, cooldown,
// availability and ownership) is read from the Current Canonical Master.
// Staggered availability deliberately keeps a long replay skill-heavy without
// changing Battle formula, balance, RNG or Master values.
const COMMON_STRESS_SKILL_IDS = ["SKILL_011", "SKILL_019", "SKILL_027", "SKILL_036", "SKILL_046"] as const;

const STATUS_STRESS_SKILL_IDS = ["SKILL_002", "SKILL_014", "SKILL_025", "SKILL_030", "SKILL_038"] as const;
const SUPPORT_STRESS_SKILL_IDS = ["SKILL_002", "SKILL_014", "SKILL_025", "SKILL_038", "SKILL_040"] as const;

const LOADOUT_KIND_BY_CHARACTER: Readonly<Record<string, "STATUS" | "SUPPORT" | "ATTACK">> = {
  char_ageha_01: "STATUS",
  char_leo_01: "SUPPORT",
  char_miyabi_01: "SUPPORT",
  char_koharu_01: "SUPPORT",
  char_sora_01: "SUPPORT",
  char_taiga_01: "SUPPORT",
  char_kengo_01: "SUPPORT",
  char_reiji_01: "STATUS",
  char_noa_01: "SUPPORT",
};

const FALLBACK_SIXTH_SKILL_BY_CHARACTER: Readonly<Record<string, string>> = {
  char_sora_01: "SKILL_049",
  char_taiga_01: "SKILL_049",
  char_noa_01: "SKILL_049",
};

const canonicalSkill = (skillId: string): BattleSkill => {
  const master = CANONICAL_SKILLS.find((entry) => entry.skill_id === skillId);
  if (!master) throw new Error(`Current Canonical Skill is missing: ${skillId}`);
  return {
    id: master.skill_id,
    name: master.name,
    activationType: master.activation_type as BattleSkill["activationType"],
    cooldown: master.cooldown,
    availableFromRound: master.available_from_round,
    target: master.target as BattleSkill["target"],
    effects: master.effects,
    exclusiveCharacterId: master.exclusive_character_id,
    skillPlusVal: 0,
  };
};

const loadoutIds = (characterId: string): string[] => {
  const exclusive = CANONICAL_SKILLS.find((entry) => entry.exclusive_character_id === characterId)?.skill_id;
  const sixth = FALLBACK_SIXTH_SKILL_BY_CHARACTER[characterId] ?? exclusive ?? "SKILL_025";
  const kind = LOADOUT_KIND_BY_CHARACTER[characterId] ?? "ATTACK";
  const base = kind === "STATUS" ? STATUS_STRESS_SKILL_IDS : kind === "SUPPORT" ? SUPPORT_STRESS_SKILL_IDS : COMMON_STRESS_SKILL_IDS;
  return [...base, sixth];
};

const unit = (name: string, team: "PLAYER" | "ENEMY", index: number): BattleUnitInput => {
  const character = CANONICAL_CHARACTERS.find((entry) => entry.name === name);
  if (!character) throw new Error(`Current Canonical Character is missing: ${name}`);
  const skillIds = loadoutIds(character.character_id);
  const slotCount = canonicalSkillSlotCount(BATTLE_FULL_SKILL_LOAD_AWAKENING);
  if (skillIds.length !== slotCount) throw new Error(`${character.character_id}: ${skillIds.length}/${slotCount} Skill Slots`);
  return {
    id: `${team === "PLAYER" ? "player" : "enemy"}-${index + 1}-${character.character_id}`,
    characterId: character.character_id,
    name: character.name,
    team,
    alignment: character.attribute,
    level: BATTLE_FULL_SKILL_LOAD_LEVEL,
    awakeningLevel: BATTLE_FULL_SKILL_LOAD_AWAKENING,
    rarity: character.rarity,
    stats: canonicalCharacterStats(character.lv1, character.lv100, BATTLE_FULL_SKILL_LOAD_LEVEL, BATTLE_FULL_SKILL_LOAD_AWAKENING, character.growth_pattern),
    skills: skillIds.map(canonicalSkill),
  };
};

type BattleFullSkillLoadFixtureOptions = {
  maxRounds?: number;
  tactic?: "ATTACK_PRIORITY" | "SKILL_PRIORITY";
  enemyTactic?: "ATTACK_PRIORITY" | "SKILL_PRIORITY";
};

export function createBattleFullSkillLoadFixture(options: BattleFullSkillLoadFixtureOptions = {}) {
  const player = BATTLE_FULL_SKILL_LOAD_PLAYER_NAMES.map((name, index) => unit(name, "PLAYER", index));
  const enemy = BATTLE_FULL_SKILL_LOAD_ENEMY_NAMES.map((name, index) => unit(name, "ENEMY", index));
  const quest = canonicalQuestById(BATTLE_FULL_SKILL_LOAD_QUEST_ID);
  if (!quest) throw new Error(`Current Canonical Quest is missing: ${BATTLE_FULL_SKILL_LOAD_QUEST_ID}`);
  const encounterSnapshot = enemy.map((entry) => ({
    id: entry.id,
    characterId: entry.characterId,
    name: entry.name,
    level: entry.level,
    awakeningLevel: entry.awakeningLevel,
    stats: entry.stats,
    skillIds: entry.skills.map((skill) => skill.id),
  }));
  return {
    seed: BATTLE_FULL_SKILL_LOAD_SEED,
    maxRounds: options.maxRounds ?? 15,
    tactic: options.tactic ?? "ATTACK_PRIORITY",
    enemyTactic: options.enemyTactic ?? "ATTACK_PRIORITY",
    player,
    enemy,
    encounterSnapshot,
    location: {
      questId: quest.questId,
      questName: quest.name,
      townId: quest.townId,
      difficulty: quest.difficulty,
      expectedBackgroundPath: getCharacterLocationBackground(quest.townId),
      runtimeBattleBackgroundPath: getCharacterLocationBackground(quest.townId),
    },
  };
}

export function resolveBattleFullSkillLoadFixture(options: BattleFullSkillLoadFixtureOptions = {}) {
  const fixture = createBattleFullSkillLoadFixture(options);
  return { fixture, replay: resolveDeterministicBattle(fixture) };
}

export const actionEvents = (events: readonly BattleReplayEvent[]) => events.filter((event) => event.type === "ACTION");
export const isSkillAction = (event: BattleReplayEvent) => event.type === "ACTION" && String(event.payload.skillId ?? "BASIC_ATTACK") !== "BASIC_ATTACK";
