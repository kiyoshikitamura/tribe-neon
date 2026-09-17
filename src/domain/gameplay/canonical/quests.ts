import questData from "./data/quests_20260830.json" with { type: "json" };
import enemyPoolData from "./data/quest_enemy_pools_20260830.json" with { type: "json" };
import encounterData from "./data/quest_encounters_20260917.json" with { type: "json" };
import { CANONICAL_CHARACTERS } from "./masters.ts";

export type CanonicalQuestDifficulty = "EASY" | "NORMAL" | "HARD";

type DifficultyContract = {
  durationSec: number;
  vitalityCost: number;
  userExp: number;
  cashReward: number;
  firstClearUserExp: number;
  rewardPoolId: string;
  dailyFirstClearCash: number;
};

const difficultyContracts = questData.difficultyContracts as Record<CanonicalQuestDifficulty, DifficultyContract>;

export const CANONICAL_QUEST_TOWNS = questData.towns;
export const CANONICAL_QUEST_REWARD_POOLS = questData.rewardPools;
export const CANONICAL_QUEST_AUTHORITY_GAPS = questData.unresolvedContracts;
export const CANONICAL_QUEST_ENCOUNTERS = encounterData.encounters;
export const CANONICAL_QUEST_ENEMY_POOLS = enemyPoolData;

type QuestPoolEntry = (typeof enemyPoolData.entries)[number];

const pickWeightedUnique = (entries: readonly QuestPoolEntry[], count: number, used: Set<string>, roll: () => number) => {
  const selected: QuestPoolEntry[] = [];
  while (selected.length < count) {
    const available = entries.filter((entry) => !used.has(entry.characterId));
    if (!available.length) throw new Error("Canonical Quest enemy pool cannot satisfy the no-duplicate contract");
    const total = available.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = roll() * total;
    const chosen = available.find((entry) => ((cursor -= entry.weight) < 0)) ?? available[available.length - 1];
    used.add(chosen.characterId);
    selected.push(chosen);
  }
  return selected;
};

export function generateCanonicalQuestEncounter(
  questId: string,
  roll: () => number = Math.random,
  previousPartySignature: string | null = null,
) {
  const quest = canonicalQuestById(questId);
  if (!quest) throw new Error(`Unknown Canonical Quest: ${questId}`);
  const fixedEncounter = CANONICAL_QUEST_ENCOUNTERS.find((entry) => entry.townId === quest.townId && entry.difficulty === quest.difficulty);
  if (fixedEncounter) {
    const entries = enemyPoolData.entries.filter((entry) => entry.areaId === quest.townId.toUpperCase() && entry.difficulty === quest.difficulty);
    const base = enemyPoolData.contract.baseStats[quest.difficulty];
    const area = enemyPoolData.areaModifiers[quest.townId.toUpperCase() as keyof typeof enemyPoolData.areaModifiers];
    const balanceOverride = (fixedEncounter as any).balanceOverride;
    const scale = (value: number, basis: string) => Math.round((value * Number(balanceOverride?.[basis] ?? 10000) / 10000) / 10) * 10;
    const members = fixedEncounter.members.map((member) => {
      const entry = entries.find((candidate) => candidate.characterId === member.characterId);
      const character = CANONICAL_CHARACTERS.find((candidate) => candidate.character_id === member.characterId);
      if (!character) throw new Error(`Canonical Quest fixed encounter references unknown enemy: ${member.characterId}`);
      const growthPattern = entry?.growthPattern ?? character.growth_pattern;
      const growth = enemyPoolData.growthModifiers[growthPattern as keyof typeof enemyPoolData.growthModifiers];
      return {
        ...member,
        rarity: entry?.rarity ?? character.rarity,
        growthPattern,
        stats: {
          hp: scale(Math.round(base.hp * area.hp * growth.hp), "hpBp"),
          atk: scale(Math.round(base.atk * area.atk * growth.atk), "atkBp"),
          def: scale(Math.round(base.def * area.def * growth.def), "defBp"),
          spd: Math.round((base.spdMin + 0.5 * (base.spdMax - base.spdMin)) * area.spd * growth.spd),
          luk: 0,
        },
      };
    });
    const signature = members.map((member) => member.characterId).sort().join("|");
    return { ...fixedEncounter, questId: quest.questId, encounterId: `encounter_${quest.questId}_${signature}`, partySignature: signature, members };
  }
  const build = () => {
    const entries = enemyPoolData.entries.filter((entry) => entry.areaId === quest.townId.toUpperCase() && entry.difficulty === quest.difficulty);
    const used = new Set<string>();
    const rarityCounts = quest.difficulty === "EASY"
      ? { N: 2, R: 1, SR: 0 }
      : quest.difficulty === "NORMAL"
        ? { N: roll() < 0.5 ? 2 : 1, R: 0, SR: roll() < 0.5 ? 1 : 2 }
        : { N: 0, R: 0, SR: roll() < 0.5 ? 2 : 3 };
    if (quest.difficulty === "NORMAL") rarityCounts.R = 5 - rarityCounts.N - rarityCounts.SR;
    if (quest.difficulty === "HARD") rarityCounts.R = 5 - rarityCounts.SR;
    const selected = (["N", "R", "SR"] as const).flatMap((rarity) =>
      pickWeightedUnique(entries.filter((entry) => entry.rarity === rarity), rarityCounts[rarity], used, roll));
    const base = enemyPoolData.contract.baseStats[quest.difficulty];
    const area = enemyPoolData.areaModifiers[quest.townId.toUpperCase() as keyof typeof enemyPoolData.areaModifiers];
    return selected.map((entry, index) => {
      const growth = enemyPoolData.growthModifiers[entry.growthPattern as keyof typeof enemyPoolData.growthModifiers];
      return {
        slot: index + 1,
        characterId: entry.characterId,
        rarity: entry.rarity,
        level: quest.difficulty === "EASY" ? 5 : quest.difficulty === "NORMAL" ? 12 : 20,
        awakening: 0,
        growthPattern: entry.growthPattern,
        stats: {
          hp: Math.round(base.hp * area.hp * growth.hp),
          atk: Math.round(base.atk * area.atk * growth.atk),
          def: Math.round(base.def * area.def * growth.def),
          spd: Math.round((base.spdMin + roll() * (base.spdMax - base.spdMin)) * area.spd * growth.spd),
          luk: 0,
        },
        skillLoadout: entry.skillLoadout,
        equipmentLoadout: [] as never[],
      };
    });
  };
  let members = build();
  let signature = members.map((member) => member.characterId).sort().join("|");
  if (previousPartySignature && signature === previousPartySignature) {
    members = build();
    signature = members.map((member) => member.characterId).sort().join("|");
  }
  return { encounterId: `encounter_${quest.questId}_${signature}`, questId: quest.questId, townId: quest.townId, difficulty: quest.difficulty, enemyTactic: "BALANCED", partySignature: signature, members };
}

export const CANONICAL_QUESTS = questData.quests.map((quest) => {
  const contract = difficultyContracts[quest.difficulty as CanonicalQuestDifficulty];
  return {
    ...quest,
    difficulty: quest.difficulty as CanonicalQuestDifficulty,
    ...contract,
    rewardPoolId: quest.rewardPoolId,
    firstClearRewardPoolId: null,
    recommendedPower: quest.questId === "q_shinjuku_2" ? 60000 : null,
    enemyPoolKey: quest.enemyPoolKey,
    unlockCondition: quest.unlockCondition,
    isProductionEnabled: quest.isProductionEnabled,
  };
});

export function canonicalQuestById(questId: string) {
  const direct = CANONICAL_QUESTS.find((quest) => quest.questId === questId);
  if (direct) return direct;
  const legacy = /^q_([a-z]+)_([123])$/.exec(questId);
  if (!legacy) return undefined;
  const difficulty = ({ "1": "EASY", "2": "NORMAL", "3": "HARD" } as const)[legacy[2] as "1" | "2" | "3"];
  return CANONICAL_QUESTS.find((quest) => quest.townId === legacy[1] && quest.difficulty === difficulty);
}

export function canonicalQuestRewardPool(rewardPoolId: string) {
  return CANONICAL_QUEST_REWARD_POOLS.find((pool) => pool.rewardPoolId === rewardPoolId);
}

export function rollCanonicalQuestItems(rewardPoolId: string, roll: () => number = Math.random) {
  const pool = canonicalQuestRewardPool(rewardPoolId);
  if (!pool) throw new Error(`Unknown Canonical Quest reward pool: ${rewardPoolId}`);
  return pool.items
    .filter((item) => Math.floor(roll() * 10000) < item.probabilityBp)
    .map((item) => ({ item_id: item.itemId, quantity: item.quantity }));
}
