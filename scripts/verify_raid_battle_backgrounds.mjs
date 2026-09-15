import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const constants = readFileSync("src/utils/game_constants.ts", "utf8");
const raid = readFileSync("src/app/components/RaidTab.tsx", "utf8");
const battle = readFileSync("src/app/components/CardBattleView.tsx", "utf8");

for (const town of ["shinjuku", "shibuya", "ikebukuro", "roppongi", "akihabara", "kawasaki", "yokohama"]) {
  const background = `/bg/bg_street_${town}.jpg`;
  assert(constants.includes(`${town}: {`), `Missing ${town} presentation mapping.`);
  assert(constants.includes(`backgroundPath: "${background}"`), `Missing ${town} battle background path.`);
  assert(existsSync(`public${background}`), `Missing ${town} battle background asset.`);
}

assert(raid.includes("await preloadAsset({ src: requestedBackground"), "Raid entry must await background decode.");
assert(raid.includes("backgroundPath: background.resolvedSrc"), "Raid must persist the decoded/fallback path in battle context.");
assert(raid.includes("<GlobalInteractionBlocker isBlocking={battleBackgroundLoading}"), "Raid decode must block background interaction.");
assert(battle.includes("backgroundPath={battlePresentationContext?.backgroundPath}"), "PLAYING must retain the battle background context.");
assert(battle.includes("style={battleBackgroundStyle}"), "RESULT must retain the battle background context.");

console.log("Raid battle background contract verified for all seven towns.");
