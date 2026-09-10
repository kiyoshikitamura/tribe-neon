import characterSource from "./data/characters_20260821.json" with { type: "json" };
import skillSource from "./data/skills_20260821.json" with { type: "json" };
import equipmentSource from "./data/equipment_20260821.json" with { type: "json" };
import equipmentLimitBreakSource from "./data/equipment_limit_break_20260821.json" with { type: "json" };
import equipmentProgressionSource from "./data/equipment_progression_20260821.json" with { type: "json" };
import missionSource from "./data/missions_20260910.json" with { type: "json" };
export * from "./combat_production.ts";
export * from "./guild_production.ts";
import type { CanonicalCharacter, CanonicalEquipment, CanonicalMission } from "./types";

export const CANONICAL_CHARACTERS: readonly CanonicalCharacter[] = characterSource.characters.map((character) => ({
  character_id: character.character_id,
  name: character.name,
  rarity: character.rarity as CanonicalCharacter["rarity"],
  attribute: character.attribute as CanonicalCharacter["attribute"],
  hometown: character.hometown,
  lv1: { hp: character.lv1_hp, atk: character.lv1_atk, def: character.lv1_def, spd: character.lv1_spd, luk: character.lv1_luk },
  lv100: { hp: character.lv100_hp, atk: character.lv100_atk, def: character.lv100_def, spd: character.lv100_spd, luk: character.lv100_luk },
}));
export const CANONICAL_SKILLS = skillSource.skills;
export const CANONICAL_EQUIPMENTS = equipmentSource.equipments as readonly CanonicalEquipment[];
export const CANONICAL_EQUIPMENT_LIMIT_BREAK = equipmentLimitBreakSource;
export const CANONICAL_EQUIPMENT_PROGRESSION = equipmentProgressionSource;
export const CANONICAL_MISSIONS = missionSource.missions as readonly CanonicalMission[];
