import { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS } from "@/domain/gameplay/canonical/masters";
import { canonicalCharacterStats, canonicalEquipmentFlatStat } from "@/domain/gameplay/canonical/calculations";

export type CharacterRuntimeRecord = { id?: string; character_id: string; level?: number; awakening_level?: number };
export type EquipmentRuntimeRecord = { equipment_id?: string; equipment_master_id?: string; equipped_character_id?: string | null; level?: number; plus_val?: number };

export function getCharacterBaseStats(characterId: string, level: number, awaken: number) {
  const character = CANONICAL_CHARACTERS.find((entry) => entry.character_id === characterId);
  if (!character) return { hp: 0, atk: 0, def: 0, spd: 0, luk: 0 };
  return canonicalCharacterStats(character.lv1, character.lv100, Math.max(1, Math.min(100, Math.trunc(level || 1))), Math.max(0, Math.min(5, Math.trunc(awaken || 0))), character.growth_pattern);
}

export function getCharacterTotalStats(charRecord: CharacterRuntimeRecord | null | undefined, equipsList: EquipmentRuntimeRecord[]) {
  if (!charRecord) return { hp: 0, atk: 0, def: 0, spd: 0, luk: 0 };
  const base = getCharacterBaseStats(charRecord.character_id, charRecord.level ?? 1, charRecord.awakening_level ?? 0);
  const equipment = equipsList.filter((entry) => entry.equipped_character_id === charRecord.id).reduce((total, owned) => {
    const equipmentId = owned.equipment_id || owned.equipment_master_id;
    const master = CANONICAL_EQUIPMENTS.find((entry) => entry.equipment_id === equipmentId);
    if (!master || (master.exclusive_character_id && master.exclusive_character_id !== charRecord.character_id)) return total;
    const plusValue = Math.max(0, Math.min(10, Math.trunc(owned.plus_val ?? 0)));
    const level = Math.max(1, Math.min(100, Math.trunc(owned.level ?? 1)));
    total.hp += canonicalEquipmentFlatStat(master.base_stats.hp, level, plusValue);
    total.atk += canonicalEquipmentFlatStat(master.base_stats.atk, level, plusValue);
    total.def += canonicalEquipmentFlatStat(master.base_stats.def, level, plusValue);
    total.spd += canonicalEquipmentFlatStat(master.base_stats.spd, level, plusValue);
    total.luk += canonicalEquipmentFlatStat(master.base_stats.luk, level, plusValue);
    return total;
  }, { hp: 0, atk: 0, def: 0, spd: 0, luk: 0 });
  return { hp: base.hp + equipment.hp, atk: base.atk + equipment.atk, def: base.def + equipment.def, spd: base.spd + equipment.spd, luk: base.luk + equipment.luk };
}
