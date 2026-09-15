export const INVENTORY_PROJECTION_ITEM_IDS = Object.freeze([
  "ENERGY_DRINK",
  "CHAR_EXP_S",
  "CHAR_EXP_M",
  "CHAR_EXP_L",
  "EQUIP_EXP_S",
  "EQUIP_EXP_M",
  "EQUIP_EXP_L",
  "AWAKENING_BOOK",
  "SKILL_MANUAL",
  "EQUIP_LB_PART",
] as const);

export type InventoryProjectionItemId = (typeof INVENTORY_PROJECTION_ITEM_IDS)[number];
export type InventoryRow = { item_id?: string | null; quantity?: number | string | null };

export function buildInventoryQuantityProjection(rows: readonly InventoryRow[]) {
  const quantities = Object.fromEntries(
    INVENTORY_PROJECTION_ITEM_IDS.map((itemId) => [itemId, 0]),
  ) as Record<InventoryProjectionItemId, number>;

  for (const row of rows) {
    const itemId = row.item_id as InventoryProjectionItemId;
    if (!Object.hasOwn(quantities, itemId)) continue;
    quantities[itemId] = Math.max(0, Number(row.quantity || 0));
  }
  return quantities;
}
