export type DailyFreeRate = { gacha_id: string; rarity: string; weight: number; version: string };

// 表示した契約版を抽選へ渡す。取得失敗時に通常率で無料を代替しない。
export function parseDailyFreeRates(value: unknown): DailyFreeRate[] | null {
  if (!Array.isArray(value) || value.length !== 12) return null;
  const ids = ["CHAR_NORMAL", "SKILL_NORMAL", "EQUIP_NORMAL"];
  const rarities = ["N", "R", "SR", "SSR"];
  const seen = new Set<string>();
  const versions = new Set<string>();
  const rows: DailyFreeRate[] = [];
  for (const row of value) {
    if (!row || !ids.includes(row.gacha_id) || !rarities.includes(row.rarity)
      || typeof row.version !== "string" || !row.version.trim()) return null;
    const weight = Number(row.weight);
    if (!Number.isFinite(weight) || weight < 0) return null;
    const key = `${row.gacha_id}:${row.rarity}`;
    if (seen.has(key)) return null;
    seen.add(key);
    versions.add(row.version);
    rows.push({ gacha_id: row.gacha_id, rarity: row.rarity, weight, version: row.version });
  }
  if (versions.size !== 1 || ids.some(id => rows.filter(row => row.gacha_id === id).reduce((total, row) => total + row.weight, 0) <= 0)) return null;
  return rows.sort((a, b) => rarities.indexOf(a.rarity) - rarities.indexOf(b.rarity));
}
