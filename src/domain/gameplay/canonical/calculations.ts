import growthSource from "./data/character_growth_20260914.json" with { type: "json" };
import type { CanonicalGrowthPattern, CanonicalStats } from "./types";
import equipmentProgressionSource from "./data/equipment_progression_20260821.json" with { type: "json" };

const mainStatAwakeningBp = [10000, 10800, 11500, 13200, 15000, 17500] as const;
const speedLuckAwakeningBp = [10000, 10300, 10600, 11000, 11500, 12000] as const;
const skillSlots = [3, 4, 5, 5, 5, 6] as const;
const equipmentLevelCaps = equipmentProgressionSource.level_cap_by_limit_break;

export const CANONICAL_AWAKENING_MAIN_STAT_BP = mainStatAwakeningBp;
export const CANONICAL_AWAKENING_SPEED_LUCK_BP = speedLuckAwakeningBp;
export const CANONICAL_SKILL_SLOTS = skillSlots;
export const CANONICAL_EQUIPMENT_LEVEL_CAPS = equipmentLevelCaps;

export function canonicalLevelBaseStat(lv1: number, lv100: number, level: number, exponent = 1): number {
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new RangeError("level must be an integer from 1 through 100");
  if (!Number.isFinite(exponent) || exponent <= 0) throw new RangeError("growth exponent must be positive");
  return Math.round(lv1 + (lv100 - lv1) * Math.pow((level - 1) / 99, exponent));
}

export function canonicalCharacterStats(lv1: CanonicalStats, lv100: CanonicalStats, level: number, awakening: number, growthPattern: CanonicalGrowthPattern): CanonicalStats {
  if (!Number.isInteger(awakening) || awakening < 0 || awakening > 5) throw new RangeError("awakening must be an integer from 0 through 5");
  const exponents = growthSource.exponents[growthPattern];
  if (!exponents) throw new RangeError("unknown character growth pattern");
  const mainBp = mainStatAwakeningBp[awakening];
  const utilityBp = speedLuckAwakeningBp[awakening];
  const apply = (value: number, bp: number) => Math.floor(value * bp / 10000);
  return {
    hp: apply(canonicalLevelBaseStat(lv1.hp, lv100.hp, level, exponents.hp), mainBp),
    atk: apply(canonicalLevelBaseStat(lv1.atk, lv100.atk, level, exponents.atk), mainBp),
    def: apply(canonicalLevelBaseStat(lv1.def, lv100.def, level, exponents.def), mainBp),
    spd: apply(canonicalLevelBaseStat(lv1.spd, lv100.spd, level, exponents.spd), utilityBp),
    luk: apply(canonicalLevelBaseStat(lv1.luk, lv100.luk, level, exponents.luk), utilityBp),
  };
}

export function canonicalSkillSlotCount(awakening: number): number {
  if (!Number.isInteger(awakening) || awakening < 0 || awakening > 5) throw new RangeError("awakening must be an integer from 0 through 5");
  return skillSlots[awakening];
}

export function canonicalEquipmentLimitBreakMultiplier(plusValue: number): number {
  if (!Number.isInteger(plusValue) || plusValue < 0 || plusValue > 10) throw new RangeError("plusValue must be an integer from 0 through 10");
  return 1 + plusValue * equipmentProgressionSource.limit_break_multiplier_bp_per_step / 10000;
}

function assertEquipmentLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new RangeError("level must be an integer from 1 through 100");
}

function equipmentLevelScaleRatio(level: number): readonly [numerator: bigint, denominator: bigint] {
  assertEquipmentLevel(level);
  const segment = equipmentProgressionSource.level_scale.segments.find((entry) => level >= entry.from && level <= entry.to);
  if (!segment) throw new RangeError("equipment level scale segment is missing");
  const offset = level - segment.anchor_level;
  return [
    BigInt(segment.base_bp * segment.intervals + offset * segment.span_bp),
    BigInt(segment.intervals * 10000),
  ];
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator < BigInt(0) && numerator % denominator !== BigInt(0) ? quotient - BigInt(1) : quotient;
}

export function canonicalEquipmentLevelScale(level: number): number {
  const [numerator, denominator] = equipmentLevelScaleRatio(level);
  return Number(numerator) / Number(denominator);
}

export function canonicalEquipmentLevelCap(plusValue: number): number {
  canonicalEquipmentLimitBreakMultiplier(plusValue);
  const cap = equipmentLevelCaps[plusValue];
  if (cap == null) throw new RangeError("equipment level cap is missing");
  return cap;
}

export function canonicalEquipmentLevelAllowed(level: number, plusValue: number): boolean {
  assertEquipmentLevel(level);
  return level <= canonicalEquipmentLevelCap(plusValue);
}

export function canonicalEquipmentFlatStat(masterFlat: number, level: number, plusValue: number): number {
  if (!Number.isSafeInteger(masterFlat)) throw new RangeError("masterFlat must be a safe integer");
  canonicalEquipmentLimitBreakMultiplier(plusValue);
  const [levelNumerator, levelDenominator] = equipmentLevelScaleRatio(level);
  const lbNumerator = BigInt(10000 + plusValue * equipmentProgressionSource.limit_break_multiplier_bp_per_step);
  return Number(floorDivide(BigInt(masterFlat) * levelNumerator * lbNumerator, levelDenominator * BigInt(10000)));
}

export type CanonicalEquipmentSlot = "WEAPON" | "HEAD" | "BODY" | "LEGS" | "ACCESSORY";
export type CanonicalLimitBreakSlotOptions = Readonly<Record<CanonicalEquipmentSlot, Readonly<Record<string, Readonly<Record<string, number>>>>>>;

export function canonicalEquipmentLimitBreakOptions(
  category: CanonicalEquipmentSlot,
  plusValue: number,
  slotOptions: CanonicalLimitBreakSlotOptions,
): ReadonlyArray<Readonly<{ unlockLevel: 3 | 5 | 10; values: Readonly<Record<string, number>> }>> {
  canonicalEquipmentLimitBreakMultiplier(plusValue);
  return ([3, 5, 10] as const)
    .filter((unlockLevel) => plusValue >= unlockLevel)
    .map((unlockLevel) => ({ unlockLevel, values: slotOptions[category][String(unlockLevel)] }));
}
