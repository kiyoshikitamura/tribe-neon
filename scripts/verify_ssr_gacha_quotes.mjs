import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const characters = JSON.parse(await readFile(resolve(root, "src/domain/gameplay/canonical/data/characters_20260821.json"), "utf8")).characters;
const quoteMaster = JSON.parse(await readFile(resolve(root, "src/domain/presentation/data/ssr_gacha_quotes_20260824.json"), "utf8"));
const productionSsr = characters.filter((entry) => entry.rarity === "SSR").map((entry) => entry.character_id).sort();
const enabled = quoteMaster.quotes.filter((entry) => entry.enabled);
const enabledIds = enabled.map((entry) => entry.characterId).sort();
const expectedQuotes = new Map([
  ["char_ageha_01", "退屈してる暇ある？　夜はこれからでしょ。"],
  ["char_go_01", "邪魔するなら、まとめてぶっ潰す。"],
  ["char_kaede_01", "この街で上に立つなら、覚悟を見せなさい。"],
  ["char_karen_01", "運命なんて退屈。私が面白くしてあげる。"],
  ["char_kengo_01", "やるなら最後まで来い。途中で逃げんなよ。"],
  ["char_koharu_01", "仲間に手ぇ出すなら、ウチが相手になる。"],
  ["char_leo_01", "ノロノロしてたら、置いてくぜ。"],
  ["char_mio_01", "無茶せずに俺のそばにいろ…！"],
  ["char_miyabi_01", "見えているものだけが、真実とは限りません。"],
  ["char_reiji_01", "俺の前に立つなら、覚悟くらい決めてこい。"],
]);

assert.equal(productionSsr.length, 10, "Production SSR count must remain 10");
assert.equal(enabled.length, 10, "Enabled SSR Gacha Quote count must be 10");
assert.equal(new Set(quoteMaster.quotes.map((entry) => entry.characterId)).size, quoteMaster.quotes.length, "Duplicate Character Quote entry");
assert.deepEqual(enabledIds, productionSsr, "Enabled Quote set must equal Canonical Production SSR set");
assert.ok(enabled.every((entry) => typeof entry.quote === "string" && entry.quote.trim().length > 0), "Every enabled Quote must contain text");
assert.ok(quoteMaster.quotes.every((entry) => productionSsr.includes(entry.characterId)), "Non-SSR or unknown Character Quote entry");
assert.ok(enabled.every((entry) => expectedQuotes.get(entry.characterId) === entry.quote), "Production SSR Quote text drifted");

const modal = await readFile(resolve(root, "src/app/components/CommonModals.tsx"), "utf8");
const presentation = await readFile(resolve(root, "src/app/components/gacha/CharacterGachaPresentation.tsx"), "utf8");
assert.match(modal, /<CharacterGachaPresentation results=\{scoutResults\}/, "Tutorial and normal pulls must use confirmed results");
assert.match(presentation, /resolveCharacterGachaQuote\(current.characterId\)/, "Quote must resolve by canonical ID");
assert.match(presentation, /stage === "QUOTE"/, "SSR Quote stage is missing");
assert.match(presentation, /data-character-id=\{stage === "QUOTE" \? undefined/, "SSR identity must not be projected before reveal");

console.log(JSON.stringify({ status: "PASS", productionSsr: productionSsr.length, enabledQuotes: enabled.length, duplicate: 0, missing: 0, unknown: 0 }, null, 2));
