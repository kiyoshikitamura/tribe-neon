import itemSource from "./data/items_20260822.json" with { type: "json" };

export type CanonicalItem = (typeof itemSource.items)[number];

export const CANONICAL_ITEM_VERSION = itemSource.version;
export const CANONICAL_ITEMS: readonly CanonicalItem[] = Object.freeze(itemSource.items);
export const CANONICAL_ITEM_BY_ID = new Map(CANONICAL_ITEMS.map((item) => [item.id, item]));
const CANONICAL_REWARD_ALIAS_NAMES: Record<string, string> = {
  NORMAL_GACHA_TICKET_RANDOM: "ランダムNormalガチャチケット",
  SPECIAL_TICKET_RANDOM: "ランダムSPガチャチケット",
  SPECIAL_TICKET_SKILL_OR_EQUIPMENT: "SPスキル・装備チケット",
};

export function canonicalItemName(itemId: string): string {
  if (itemId === "PLAYER_XP") return "プレイヤー経験値";
  if (itemId === "CASH") return "CASH";
  if (itemId === "DIAMOND") return "ダイヤ";
  return CANONICAL_ITEM_BY_ID.get(itemId)?.name ?? CANONICAL_REWARD_ALIAS_NAMES[itemId] ?? itemId;
}

export function canonicalItemEffectValue(itemId: string): number | null {
  const usage = CANONICAL_ITEM_BY_ID.get(itemId)?.runtimeUsage;
  if (!usage || !("effectValue" in usage)) return null;
  return typeof usage.effectValue === "number" ? usage.effectValue : null;
}
