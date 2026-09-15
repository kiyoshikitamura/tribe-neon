import { SSR_GACHA_QUOTES } from "./ssrGachaQuotes";

export type HomeCharacterDialogue = Readonly<{
  characterId: string;
  lines: readonly string[];
  source: "approved-character-quote";
}>;

// The SSR quote master is currently the only reviewed, character-ID-bound
// dialogue source. Keep Home silent for characters without an approved line;
// a generic line would incorrectly present shared placeholder copy as canon.
export const HOME_CHARACTER_DIALOGUES: readonly HomeCharacterDialogue[] = Object.freeze(
  SSR_GACHA_QUOTES
    .filter((entry) => entry.enabled && entry.quote.trim().length > 0)
    .map((entry) => Object.freeze({
      characterId: entry.characterId,
      lines: Object.freeze([entry.quote]),
      source: "approved-character-quote" as const,
    })),
);

const dialogueByCharacterId = new Map(
  HOME_CHARACTER_DIALOGUES.map((entry) => [entry.characterId, entry.lines]),
);

export function resolveHomeCharacterDialogueLines(characterId: string | null | undefined): readonly string[] {
  if (!characterId) return [];
  return dialogueByCharacterId.get(characterId) ?? [];
}
