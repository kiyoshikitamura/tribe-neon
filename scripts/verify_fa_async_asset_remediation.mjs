import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCompositeOperation } from "../src/domain/async/runCompositeOperation.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const calls = [];
const firstRun = await runCompositeOperation(["S", "M", "L"], async (entry) => {
  calls.push(entry);
  return entry !== "M";
});
assert.deepEqual(calls, ["S", "M"], "Composite operation must stop at the first failed step");
assert.deepEqual(firstRun.completed, ["S"], "Only authoritative successes may be cleared");
assert.deepEqual(firstRun.remaining, ["M", "L"], "Failed and unexecuted selections must remain for retry");
const retry = await runCompositeOperation(firstRun.remaining, async () => true);
assert.equal(retry.complete, true, "A repeated operation must process the preserved tail");
assert.deepEqual(retry.completed, ["M", "L"]);

const progression = await read("src/app/context/hooks/useCharacterProgression.ts");
assert.match(progression, /handleCharacterGrowthBatch/);
assert.match(progression, /handleEquipmentGrowthBatch/);
assert.match(progression, /handleAutoEquipComposite/);
assert.match(progression, /lockOwned: true, refresh: false/);
assert.match(progression, /await syncBootstrapData\(session\.user\.id\);[\s\S]*endUpgradeActionAfterPaint/);
const characterGrowthBatch = progression.slice(
  progression.indexOf("const handleCharacterGrowthBatch"),
  progression.indexOf("const handleCharacterAwaken"),
);
assert.match(characterGrowthBatch, /className: "growth-result-v0", "data-growth-result": "level-up"/);
assert.match(characterGrowthBatch, /kind: "result", presentation: "legacy"/);
assert.match(characterGrowthBatch, /playCyberSe\("LEVEL_UP"\)/);

const characterUi = await read("src/app/components/character/CharacterSystemV2.tsx");
assert.match(characterUi, /character-v2-pending-surface" disabled=\{game\.upgradeLoading\}/);
assert.match(characterUi, /handleCharacterGrowthBatch\(snapshot\)/);
assert.match(characterUi, /handleEquipmentGrowthBatch\(snapshot\)/);
assert.match(characterUi, /result\.completedItemIds\.includes\(itemId\) \? 0 : count/);

const mission = await read("src/app/components/MissionPanel.tsx");
assert.match(mission, /closeDisabled=\{missionClaimLoading\}/);
assert.match(mission, /mission-operation-surface" disabled=\{missionClaimLoading\}/);

const guild = await read("src/app/context/hooks/useGuild.ts");
assert.match(guild, /guildPrivilegedOperation/);
assert.match(guild, /key: "promote" \| "demote" \| "transfer" \| "kick"/);
assert.match(guild, /await syncBootstrapData\(session\.user\.id\);[\s\S]*endPrivilegedOperation/);

const pvpUi = await read("src/app/components/PvpTab.tsx");
assert.doesNotMatch(pvpUi, /pvp-defense-save-surface|防衛設定を保存|防衛・履歴/);
assert.match(pvpUi, /pvp_match_rewards_master/);
const pvpMainFormation = await read("supabase/migrations/20260901000216_pvp_main_formation_matchmaking.sql");
assert.match(pvpMainFormation, /join public\.user_main_formations/);
assert.match(pvpMainFormation, /milestone='first_pvp'/);

console.log(JSON.stringify({ status: "PASS", fa001: true, fa002: true, fa003: true, fa004: true, fa005: true }, null, 2));
