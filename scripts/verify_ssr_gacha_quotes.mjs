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

// CommonModals delegates both tutorial/normal Character results; presentation now owns the gate.
const modal = await readFile(resolve(root, "src/app/components/CommonModals.tsx"), "utf8");
const presentation = await readFile(resolve(root, "src/app/components/gacha/CharacterGachaPresentation.tsx"), "utf8");
const resolver = await readFile(resolve(root, "src/domain/presentation/characterGachaQuotes.ts"), "utf8");
const additionalQuotes = JSON.parse(await readFile(resolve(root, "src/domain/presentation/data/character_gacha_quotes_20260908.json"), "utf8")).quotes;
assert.match(modal, /scoutResults\.every\(\(result: any\) => result\?\.type === "CHARACTER"/, "Tutorial and Normal Character pulls must share reveal flow");
assert.match(modal, /<CharacterGachaPresentation results=\{scoutResults\} tutorial=\{onboardingState\?\.tutorial_step === "AUTO_FORMATION"\}/, "Character results must delegate to the shared presentation");
assert.match(resolver, /\.\.\.SSR_GACHA_QUOTES/, "Character resolver must retain the frozen SSR Quote source");
assert.match(resolver, /quoteById\.get\(characterId\) \?\? null/, "Character resolver must resolve by canonical Character ID");
const combined = [...quoteMaster.quotes, ...additionalQuotes];
assert.equal(new Set(combined.map(entry => entry.characterId)).size, combined.length, "Additional Character quotes must not shadow frozen SSR quotes");
assert.ok(additionalQuotes.every(entry => characters.some(character => character.character_id === entry.characterId)), "Unknown Character in additional Quote master");
assert.match(presentation, /resolveCharacterGachaQuote\(current\.characterId\)/, "Reveal must resolve Quote by canonical Character ID");
assert.match(presentation, /setStage\(rarity === "SSR" && quote \? "QUOTE" : "REVEAL"\)/, "Initial SSR Quote gate is missing");
assert.match(presentation, /next\.rarity\.toUpperCase\(\) === "SSR" && resolveCharacterGachaQuote\(next\.characterId\) \? "QUOTE" : "REVEAL"/, "Subsequent SSR results must retain the Quote gate");
assert.match(presentation, /stage === "QUOTE"\) \{ if \(letters < quote\.length\) setLetters\(quote\.length\); else setStage\("REVEAL"\);/, "SSR Quote tap must complete typing then enter reveal state");
assert.match(presentation, /data-character-id=\{stage === "QUOTE" \? undefined : current\.characterId\}/, "SSR identity must not be projected before reveal");
assert.match(presentation, /aria-label=\{stage === "QUOTE" \? "セリフを表示して登場演出へ" :/, "SSR accessible label must not expose the name before reveal");
const quoteBranch = presentation.match(/stage === "QUOTE" \? <div className="cg-quote-intro">([\s\S]*?)<\/div> : <div className="cg-reveal-content"/);
assert.ok(quoteBranch, "Dedicated pre-reveal Quote branch is missing");
assert.match(quoteBranch[1], /quote\.slice\(/, "Quote branch must render the selected canonical Quote");
assert.doesNotMatch(quoteBranch[1], /current\.(?:name|characterId|imageUrl)|StandingArt|<h[1-6]/, "SSR Character name or identity must not appear before reveal");
console.log(JSON.stringify({ status: "PASS", productionSsr: productionSsr.length, enabledQuotes: enabled.length, duplicate: 0, missing: 0, unknown: 0 }, null, 2));
