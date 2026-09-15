import skillSource from "../gameplay/canonical/data/skills_20260821.json" with { type: "json" };
import equipmentSource from "../gameplay/canonical/data/equipment_20260821.json" with { type: "json" };
import characterSource from "../gameplay/canonical/data/characters_20260821.json" with { type: "json" };
import { getCanonicalSkillIcon } from "../../utils/skillVisualAssets";

/** Presentation catalogue only. Draw eligibility and ownership remain server authorities. */
export type ExclusiveContent = Readonly<{
  id: string;
  kind: "SKILL" | "EQUIPMENT";
  name: string;
  rarity: "SR" | "SSR";
  characterId: string;
  characterName: string;
  imageSrc: string;
}>;

const characterNames = new Map(characterSource.characters.map((entry) => [entry.character_id, entry.name]));

export const EXCLUSIVE_CONTENT: readonly ExclusiveContent[] = Object.freeze([
  ...skillSource.skills.flatMap((entry): ExclusiveContent[] => {
    if (!entry.exclusive_character_id || (entry.rarity !== "SR" && entry.rarity !== "SSR")) return [];
    return [Object.freeze({
      id: entry.skill_id, kind: "SKILL", name: entry.name, rarity: entry.rarity,
      characterId: entry.exclusive_character_id,
      characterName: characterNames.get(entry.exclusive_character_id) ?? "",
      imageSrc: getCanonicalSkillIcon(entry.skill_id) ?? "",
    })];
  }),
  ...equipmentSource.equipments.flatMap((entry): ExclusiveContent[] => {
    if (!entry.exclusive_character_id || entry.rarity !== "SSR") return [];
    return [Object.freeze({
      id: entry.equipment_id, kind: "EQUIPMENT", name: entry.display_name, rarity: "SSR",
      characterId: entry.exclusive_character_id,
      characterName: characterNames.get(entry.exclusive_character_id) ?? "",
      imageSrc: `/equipments/${entry.equipment_id.toLowerCase()}.png`,
    })];
  }),
]);

const contentById = new Map(EXCLUSIVE_CONTENT.map((entry) => [entry.id, entry]));

export function resolveExclusiveContent(id: string | null | undefined): ExclusiveContent | null {
  return id ? contentById.get(id) ?? null : null;
}

/** Resolve against the immutable battle snapshot, never current inventory or Home leader. */
export function exclusiveEquipmentForBattleMember(
  characterId: string,
  equippedMasterIds: readonly string[],
): readonly ExclusiveContent[] {
  const seen = new Set<string>();
  return equippedMasterIds.flatMap((id) => {
    const entry = resolveExclusiveContent(id);
    if (!entry || entry.kind !== "EQUIPMENT" || entry.characterId !== characterId || seen.has(id)) return [];
    seen.add(id);
    return [entry];
  });
}

export function exclusiveSkillForBattleMember(
  characterId: string,
  skillId: string,
): ExclusiveContent | null {
  const entry = resolveExclusiveContent(skillId);
  return entry?.kind === "SKILL" && entry.characterId === characterId ? entry : null;
}
