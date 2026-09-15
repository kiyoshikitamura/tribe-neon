import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { battleDisplayText } from "../src/domain/presentation/battleTerminology.ts";

assert.equal(battleDisplayText("PvP Pointが不足しています"), "BPが不足しています");
assert.equal(battleDisplayText("PvPポイントを回復"), "BPを回復");
assert.equal(battleDisplayText("PvPに挑戦しよう"), "バトルに挑戦しよう");

const sources = Object.fromEntries(await Promise.all([
  "src/app/components/HomeTab.tsx",
  "src/app/components/MenuTab.tsx",
  "src/app/components/PvpTab.tsx",
  "src/app/components/RankingTab.tsx",
  "src/app/components/MissionPanel.tsx",
  "src/app/components/InboxPanel.tsx",
  "src/app/components/BagTab.tsx",
  "src/app/context/hooks/useInventory.ts",
  "src/hooks/battle/battleUtils.ts",
  "src/hooks/useBattle.ts",
  "src/utils/game_constants.ts",
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));

for (const [path, source] of Object.entries(sources)) {
  const withoutInternalSymbols = source
    .replaceAll("isPvP", "")
    .replaceAll("firstPvpPending", "")
    .replaceAll("officialPvp", "")
    .replaceAll("hasOfficialPvpResult", "")
    .replace(/^\s*\/\/.*PvP.*$/gm, "")
    .replace(/^\s*console\.warn\(.*PvP.*$/gm, "");
  assert.doesNotMatch(withoutInternalSymbols, /["'`]([^"'`]*(?:PvP|PVP Point|PVP POINT)[^"'`]*)["'`]/, `user-facing PvP copy remains in ${path}`);
}

assert.match(sources["src/app/components/HomeTab.tsx"], /key: "first_pvp"[\s\S]*tab: "pvp"/);
assert.match(sources["src/app/components/PvpTab.tsx"], /startCardBattle\(\s*"PVP"/);
assert.match(sources["src/hooks/useBattle.ts"], /export type BattleMode = "PVP" \| "PVP_PRACTICE"/);
assert.match(sources["src/app/components/RankingTab.tsx"], /id: "pvp", label: "バトル"/);

console.log("TN-08 battle terminology presentation verification: PASS");
