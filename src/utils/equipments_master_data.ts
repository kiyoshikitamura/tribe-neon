import { exclusiveAssetName } from "./exclusiveAssetLabels";
import { CANONICAL_EQUIPMENTS } from "@/domain/gameplay/canonical/masters";

/** UI compatibility view generated exclusively from Equipment170 Canonical Master. */
export interface EquipmentMaster {
  id: string; name: string; rarity: "N" | "R" | "SR" | "SSR";
  slot_type: "WEAPON" | "HEAD" | "BODY" | "LEGS" | "ACCESSORY";
  atk: number; def: number; hp: number; spd: number; luk: number;
  is_exclusive: boolean; exclusive_character_id: string | null;
  effect_description: string | null; description: string;
  assetPath: string;
}

export function canonicalEquipmentAssetPath(equipmentId: string, slotType?: EquipmentMaster["slot_type"]): string {
  const master = slotType ? null : CANONICAL_EQUIPMENTS.find((equipment) => equipment.equipment_id === equipmentId);
  const category = String(slotType ?? master?.category ?? "").toLowerCase();
  const sequence = equipmentId.match(/_(\d{3})$/)?.[1];
  if (!category || !sequence) return "";
  return `/equipments/${category}_${sequence}.png`;
}

export const CANONICAL_EQUIPMENT_VIEW: EquipmentMaster[] = CANONICAL_EQUIPMENTS.map((equipment) => ({
  id: equipment.equipment_id, name: exclusiveAssetName(equipment.display_name, equipment.exclusive_character_id), rarity: equipment.rarity,
  slot_type: equipment.category, ...equipment.base_stats,
  is_exclusive: equipment.exclusive_character_id !== null,
  exclusive_character_id: equipment.exclusive_character_id,
  effect_description: equipment.fixed_effects.filter((effect) => effect !== "—").join(" / ") || null,
  description: equipment.fixed_effects.filter((effect) => effect !== "—").join(" / ") || equipment.display_name,
  assetPath: canonicalEquipmentAssetPath(equipment.equipment_id, equipment.category),
}));

/** @deprecated Canonical compatibility alias retained while old imports are retired. */
export const EQUIPMENTS_MASTER_DATA = CANONICAL_EQUIPMENT_VIEW;
