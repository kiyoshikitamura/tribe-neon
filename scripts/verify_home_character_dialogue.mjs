import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const characterMaster = JSON.parse(await readFile(resolve(root, "src/domain/gameplay/canonical/data/characters_20260821.json"), "utf8"));
const quoteMaster = JSON.parse(await readFile(resolve(root, "src/domain/presentation/data/ssr_gacha_quotes_20260824.json"), "utf8"));
const dialogueSource = await readFile(resolve(root, "src/domain/presentation/homeCharacterDialogue.ts"), "utf8");
const homeSource = await readFile(resolve(root, "src/app/components/HomeTab.tsx"), "utf8");

const canonicalIds = new Set(characterMaster.characters.map((entry) => entry.character_id));
const approved = quoteMaster.quotes.filter((entry) => entry.enabled && entry.quote.trim().length > 0);
const approvedIds = new Set(approved.map((entry) => entry.characterId));
const missing = characterMaster.characters.filter((entry) => !approvedIds.has(entry.character_id));

assert.equal(canonicalIds.size, 60, "Canonical character roster must contain 60 unique IDs");
assert.equal(approved.length, 10, "Expected 10 reviewed character quotes");
assert.ok(approved.every((entry) => canonicalIds.has(entry.characterId)), "Dialogue contains an unknown character ID");
assert.match(dialogueSource, /SSR_GACHA_QUOTES/,
  "Home dialogue must derive from the reviewed character quote source");
assert.match(dialogueSource, /dialogueByCharacterId\.get\(characterId\) \?\? \[\]/,
  "Missing dialogue must resolve to an empty list");
assert.match(homeSource, /resolveHomeCharacterDialogueLines\(leaderCharacterId\)/,
  "Home must resolve dialogue by the active character ID");
assert.match(homeSource, /leaderDialogueLines\.length > 0/,
  "Characters without reviewed dialogue must not expose a talk target");
assert.doesNotMatch(homeSource, /今夜も、ここを守る。|行くぞ。街は俺たちのものだ。|仲間の準備はできてるか？/,
  "Shared placeholder dialogue must not remain in Home");

console.log(JSON.stringify({
  status: "PASS",
  canonicalCharacters: canonicalIds.size,
  approvedDialogues: approved.length,
  safelySilentCharacters: missing.length,
}, null, 2));
