/** Selection follows the current filtered roster, never a persisted ordinal. */
export function resolveHomeCharacter<T extends { character_id: string }>(roster: readonly T[], masterId: string | undefined): T | undefined {
  return roster.find((entry) => entry.character_id === masterId) ?? roster[0];
}
