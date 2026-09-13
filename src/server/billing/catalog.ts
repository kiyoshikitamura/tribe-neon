export const CATALOG_VERSION = "20260912";
export const PAID_PACKS = [
  { id: "beginner_pack_01", amount_jpy: 100, purchase_limit: 1, items: { CASH: 1000, SPECIAL_TICKET_CHARACTER: 1, SPECIAL_TICKET_SKILL: 1, SPECIAL_TICKET_EQUIPMENT: 1, RAID_POINT_TICKET: 3 } },
  { id: "ticket_pack_01", amount_jpy: 1500, purchase_limit: 3, items: { SPECIAL_TICKET_CHARACTER: 5, SPECIAL_TICKET_SKILL: 5, SPECIAL_TICKET_EQUIPMENT: 5 } },
  { id: "growth_pack_01", amount_jpy: 500, purchase_limit: 3, items: { CHAR_EXP_L: 30, EQUIP_EXP_L: 20, CASH: 10000 } },
  { id: "awakening_pack_01", amount_jpy: 1000, purchase_limit: 3, items: { AWAKENING_BOOK: 3, SKILL_MANUAL: 3, EQUIP_LB_PART: 3, CASH: 20000 } },
] as const;
export const UNRESOLVED_DIA_PRODUCTS = [300, 500, 1030, 2080, 5240, 10680].map(n => `diamond_${n}`);
type CatalogRow = { id: string; amount_jpy: number; purchase_limit: number; validity_days: number; items: { itemId: string; quantity: number }[] };

/** UIだけ最新商品、DBは旧内容という状態ではCheckoutへ進ませない。 */
export function catalogMatches(rows: CatalogRow[]) {
  return PAID_PACKS.every(expected => {
    const actual = rows.find(row => row.id === expected.id);
    const quantities = Object.entries(expected.items);
    return actual?.amount_jpy === expected.amount_jpy && actual.purchase_limit === expected.purchase_limit &&
      actual.validity_days === 120 && Array.isArray(actual.items) && actual.items.length === quantities.length &&
      quantities.every(([id, quantity]) => actual.items.filter(item => item.itemId === id && item.quantity === quantity).length === 1);
  });
}
