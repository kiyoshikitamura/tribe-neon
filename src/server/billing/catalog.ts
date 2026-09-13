export const CATALOG_VERSION = "20260913";
export const PAID_PACKS = [
  { id: "beginner_pack_01", amount_jpy: 100, purchase_limit: 1, items: { CASH: 1000, SPECIAL_TICKET_CHARACTER: 1, SPECIAL_TICKET_SKILL: 1, SPECIAL_TICKET_EQUIPMENT: 1, RAID_POINT_TICKET: 3 } },
  { id: "ticket_pack_01", amount_jpy: 1500, purchase_limit: 3, items: { SPECIAL_TICKET_CHARACTER: 5, SPECIAL_TICKET_SKILL: 5, SPECIAL_TICKET_EQUIPMENT: 5 } },
  { id: "growth_pack_01", amount_jpy: 500, purchase_limit: 3, items: { CHAR_EXP_L: 30, EQUIP_EXP_L: 20, CASH: 10000 } },
  { id: "awakening_pack_01", amount_jpy: 1000, purchase_limit: 3, items: { AWAKENING_BOOK: 3, SKILL_MANUAL: 3, EQUIP_LB_PART: 3, CASH: 20000 } },
] as const;
export const DIA_PRODUCTS = [[300,300,0],[500,500,0],[1030,1000,30],[2080,2000,80],[5240,5000,240],[10680,10000,680]].map(([total,paid,free]) => ({
  id: `diamond_${total}`, amount_jpy: paid, purchase_limit: 0,
  items: [{itemId:"DIAMOND",quantity:paid,validity_days:120}, ...(free ? [{itemId:"DIAMOND",quantity:free,validity_days:null}] : [])],
}));
export const PAID_PRODUCT_IDS = [...PAID_PACKS.map(p=>p.id),...DIA_PRODUCTS.map(p=>p.id)];
type CatalogRow = { id: string; amount_jpy: number; purchase_limit: number; validity_days: number; items: { itemId: string; quantity: number; validity_days?: number | null }[] };
/** UIとDBの価格・内容・有償無償内訳が一致する場合だけ販売可能。 */
export function catalogMatches(rows: CatalogRow[]) {
  return PAID_PACKS.every(expected => {
    const actual = rows.find(row => row.id === expected.id);
    const quantities = Object.entries(expected.items);
    return actual?.amount_jpy === expected.amount_jpy && actual.purchase_limit === expected.purchase_limit &&
      actual.validity_days === 120 && Array.isArray(actual.items) && actual.items.length === quantities.length &&
      quantities.every(([id, quantity]) => actual.items.filter(item => item.itemId === id && item.quantity === quantity).length === 1);
  }) && DIA_PRODUCTS.every(expected => {
    const actual = rows.find(row => row.id === expected.id);
    return actual?.amount_jpy === expected.amount_jpy && actual.purchase_limit === 0 && actual.validity_days === 120 &&
      Array.isArray(actual.items) && actual.items.length === expected.items.length && expected.items.every(wanted =>
        actual.items.filter(item => item.itemId === wanted.itemId && item.quantity === wanted.quantity && item.validity_days === wanted.validity_days).length === 1);
  });
}
