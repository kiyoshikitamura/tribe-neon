export type GrowthExpLevel = { level: number; required_exp: number; cost_cash: number };
export type GrowthExpMaster = { character: GrowthExpLevel[]; equipment: GrowthExpLevel[]; version?: string };
export function calculateGrowthExp(level: number, xp: number, cap: number, gainedExp: number, rows: GrowthExpLevel[]) {
  if (!Number.isSafeInteger(level) || level < 1 || level > 100 ||
      !Number.isSafeInteger(xp) || xp < 0 || !Number.isSafeInteger(gainedExp) || gainedExp < 0 ||
      !Number.isSafeInteger(cap) || cap < 1 || cap > 100 ||
      !Number.isSafeInteger(xp + gainedExp)) throw new Error("INVALID_GROWTH_INPUT");
  const byLevel = new Map(rows.map(row => [Number(row.level), row]));
  let afterLevel = level;
  let afterXp = xp + gainedExp;
  let cashSpent = 0;
  while (afterLevel < cap && afterLevel < 100) {
    const next = byLevel.get(afterLevel + 1);
    if (!next || !Number.isSafeInteger(next.required_exp) || next.required_exp <= 0 ||
        !Number.isSafeInteger(next.cost_cash) || next.cost_cash < 0) throw new Error("GROWTH_MASTER_INCOMPLETE");
    if (afterXp < next.required_exp) break;
    afterXp -= next.required_exp;
    cashSpent += next.cost_cash;
    afterLevel += 1;
  }
  const required = (atLevel: number) => atLevel >= 100 ? null : byLevel.get(atLevel + 1)?.required_exp ?? null;
  return {
    currentLevel: level, currentXp: xp, currentRequiredExp: required(level),
    level: afterLevel, xp: afterXp, nextRequiredExp: required(afterLevel),
    levelCap: cap, gainedExp, levelsGained: afterLevel - level, cashSpent,
    canApply: level < 100 && (gainedExp > 0 || afterLevel > level),
  };
}
export type GrowthExpPreview = ReturnType<typeof calculateGrowthExp>;
export function parseGrowthExpMaster(value: unknown): GrowthExpMaster {
  const candidate = value as GrowthExpMaster | null;
  if (!candidate) throw new Error("GROWTH_MASTER_UNAVAILABLE");
  for (const rows of [candidate.character, candidate.equipment]) {
    if (!Array.isArray(rows) || rows.length !== 99) throw new Error("GROWTH_MASTER_INCOMPLETE");
    const levels = new Set<number>();
    for (const row of rows) {
      if (!Number.isInteger(row.level) || row.level < 2 || row.level > 100 || levels.has(row.level) ||
          !Number.isSafeInteger(row.required_exp) || row.required_exp <= 0 ||
          !Number.isSafeInteger(row.cost_cash) || row.cost_cash < 0) throw new Error("GROWTH_MASTER_INVALID");
      levels.add(row.level);
    }
  }
  return candidate;
}
