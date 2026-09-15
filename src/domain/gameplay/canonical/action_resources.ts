import actionResourceData from "./data/action_resources_20260914.json" with { type: "json" };
import userLevelData from "./data/user_level_progression_20260822.json" with { type: "json" };

export const CANONICAL_ACTION_RESOURCES = actionResourceData;
export const CANONICAL_USER_LEVEL_PROGRESSION = userLevelData;

export type CanonicalResourceType = keyof typeof actionResourceData.resources;

export function recoverCanonicalResource(
  current: number,
  lastRecoveredAtMs: number,
  nowMs: number,
  type: CanonicalResourceType,
) {
  const rule = actionResourceData.resources[type];
  const safeCurrent = Math.max(0, Math.min(rule.hardCap, Math.trunc(current)));
  if (safeCurrent >= rule.naturalMax || nowMs <= lastRecoveredAtMs) {
    return { value: safeCurrent, recovered: 0, lastRecoveredAtMs };
  }
  const elapsedSteps = Math.floor((nowMs - lastRecoveredAtMs) / (rule.recoveryIntervalSeconds * 1000));
  const recovered = Math.min(
    rule.naturalMax - safeCurrent,
    Math.max(0, elapsedSteps * rule.recoveryAmount),
  );
  if (recovered === 0) return { value: safeCurrent, recovered: 0, lastRecoveredAtMs };
  const value = safeCurrent + recovered;
  return {
    value,
    recovered,
    lastRecoveredAtMs: value >= rule.naturalMax
      ? nowMs
      : lastRecoveredAtMs + (recovered / rule.recoveryAmount) * rule.recoveryIntervalSeconds * 1000,
  };
}

export function applyFrozenUserXp(level: number, xp: number, gainedXp: number) {
  if (!Number.isInteger(gainedXp) || gainedXp < 0) throw new Error("XP amount must be a non-negative integer");
  let nextLevel = Math.max(1, Math.trunc(level));
  if (nextLevel > userLevelData.maxUserLevel) return { level: nextLevel, xp: Math.max(0, Math.trunc(xp)), leveledUp: false };
  if (nextLevel === userLevelData.maxUserLevel) return { level: nextLevel, xp: 0, leveledUp: false };
  let nextXp = Math.max(0, Math.trunc(xp)) + gainedXp;
  let leveledUp = false;
  while (nextLevel < userLevelData.frozenThroughLevel) {
    const row = userLevelData.levels.find((entry) => entry.level === nextLevel);
    if (row?.requiredExp == null || nextXp < row.requiredExp) break;
    nextXp -= row.requiredExp;
    nextLevel += 1;
    leveledUp = true;
  }
  if (nextLevel === userLevelData.maxUserLevel) nextXp = 0;
  return { level: nextLevel, xp: nextXp, leveledUp };
}

export function canUseEnergyDrink(vitality: number) {
  const item = actionResourceData.recoveryItems.ENERGY_DRINK;
  return vitality >= 0 && vitality + item.amount <= actionResourceData.resources.VITALITY.hardCap;
}

export function canUseActionResourceTicket(points: number) {
  return Number.isInteger(points) && points >= 0 && points < 5;
}
