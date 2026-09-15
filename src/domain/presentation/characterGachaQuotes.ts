import source from "./data/character_gacha_quotes_20260908.json" with { type: "json" };
import { SSR_GACHA_QUOTES, type SsrGachaQuote } from "./ssrGachaQuotes";

// SSRの確定文言は既存マスタを参照。ホームの配信対象は変更しない。
export const CHARACTER_GACHA_QUOTES: readonly SsrGachaQuote[] = Object.freeze([
  ...SSR_GACHA_QUOTES,
  ...source.quotes.map((entry) => Object.freeze({ ...entry })),
]);
const quoteById = new Map(CHARACTER_GACHA_QUOTES.filter((entry) => entry.enabled).map((entry) => [entry.characterId, entry.quote]));
export function resolveCharacterGachaQuote(characterId: string): string | null {
  return quoteById.get(characterId) ?? null;
}
