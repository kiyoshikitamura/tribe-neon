import type growthSource from "./data/character_growth_20260914.json";

export type CanonicalGrowthPattern = keyof typeof growthSource.exponents;

export type CanonicalStats = Readonly<{ hp: number; atk: number; def: number; spd: number; luk: number }>;

export type CanonicalCharacter = Readonly<{
  character_id: string;
  name: string;
  rarity: "N" | "R" | "SR" | "SSR";
  attribute: "JUSTICE" | "ORDER" | "EVIL" | "CHAOS";
  hometown: string;
  growth_pattern: CanonicalGrowthPattern;
  lv1: CanonicalStats;
  lv100: CanonicalStats;
}>;

export type CanonicalEquipment = Readonly<{
  equipment_id: string;
  display_name: string;
  rarity: "N" | "R" | "SR" | "SSR";
  category: "WEAPON" | "HEAD" | "BODY" | "LEGS" | "ACCESSORY";
  base_stats: CanonicalStats;
  fixed_effects: readonly string[];
  exclusive_character_id: string | null;
  random_options: false;
}>;

export type CanonicalMissionCategory = "DAILY" | "NORMAL";
export type CanonicalMissionUiStatus = "IN_PROGRESS" | "CLEAR" | "CLAIMED" | "LOCKED";

export type CanonicalMission = Readonly<{
  id: string;
  category: CanonicalMissionCategory;
  triggerType: string;
  displayGroup: "PROGRESS" | "GROWTH" | "BATTLE" | "GUILD";
  title: string;
  description: string;
  targetValue: number;
  conditionParams: Readonly<Record<string, unknown>>;
  rewardItemId: string;
  rewardQuantity: number;
  cashReward: number;
  prerequisiteMissionId: string | null;
  nextMissionId: string | null;
  displayOrder: number;
  isEnabled: boolean;
  isRepeatable: boolean;
  repeatRule: "DAILY_RESET" | "ONCE";
  claimRule: "EXACTLY_ONCE";
  preopen: boolean;
  isProvisional: false;
  cta: Readonly<{ tab: string | null; action: string | null; label: string }> | null;
}>;
