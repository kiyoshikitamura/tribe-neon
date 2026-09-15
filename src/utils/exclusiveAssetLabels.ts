import { CANONICAL_CHARACTERS } from "@/domain/gameplay/canonical/masters";

/** Presentation only: canonical IDs and gameplay names remain unchanged. */
export function exclusiveAssetLabel(characterId?: string | null): string {
  const owner = CANONICAL_CHARACTERS.find((character) => character.character_id === characterId);
  return owner ? `[${owner.name}専用]` : "";
}

export function exclusiveAssetName(name: string, characterId?: string | null): string {
  const label = exclusiveAssetLabel(characterId);
  return label && !name.startsWith(label) ? `${label}${name}` : name;
}
