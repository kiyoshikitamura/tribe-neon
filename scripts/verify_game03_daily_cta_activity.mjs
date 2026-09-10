import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateCanonicalMissionProgress, syncCanonicalMissions } from "../src/domain/gameplay/canonical/mission_runtime.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const master = JSON.parse(await read("src/domain/gameplay/canonical/data/missions_20260910.json"));
const home = await read("src/app/components/HomeTab.tsx");
const mock = await read("src/utils/mock/mockRpc.ts");
const migration = await read("supabase/migrations/20260910003220_game03_daily_cta_activity_authority.sql");

const mission = master.missions.find((entry) => entry.id === "MIS_D_010");
assert.ok(mission, "MIS_D_010 must exist");
assert.deepEqual({
  category: mission.category,
  triggerType: mission.triggerType,
  targetValue: mission.targetValue,
  rewardItemId: mission.rewardItemId,
  rewardQuantity: mission.rewardQuantity,
  repeatRule: mission.repeatRule,
  claimRule: mission.claimRule,
}, {
  category: "DAILY",
  triggerType: "PVP_FINALIZED_BATTLE_COUNT",
  targetValue: 2,
  rewardItemId: "RAID_POINT_TICKET",
  rewardQuantity: 1,
  repeatRule: "DAILY_RESET",
  claimRule: "EXACTLY_ONCE",
});
assert.equal(master.missions.filter((entry) => entry.id === "MIS_D_010").length, 1);

const runtimeMaster = [{
  id: mission.id,
  category: mission.category,
  trigger_type: mission.triggerType,
  target_value: mission.targetValue,
  prerequisite_mission_id: null,
  is_enabled: mission.isEnabled,
  reward_item_id: mission.rewardItemId,
  reward_quantity: mission.rewardQuantity,
}];
const userId = "00000000-0000-4000-8000-000000000303";
const rows = syncCanonicalMissions(runtimeMaster, [], userId, "2026-09-10").rows;
const row = () => rows.find((entry) => entry.mission_id === mission.id);
assert.deepEqual([row().current_progress, row().status], [0, "PROGRESS"]);
evaluateCanonicalMissionProgress(runtimeMaster, rows, userId, "PVP_FINALIZED", 1);
assert.deepEqual([row().current_progress, row().status], [1, "PROGRESS"]);
evaluateCanonicalMissionProgress(runtimeMaster, rows, userId, "PVP_FINALIZED", 1);
assert.deepEqual([row().current_progress, row().status], [2, "CLEAR"]);
evaluateCanonicalMissionProgress(runtimeMaster, rows, userId, "PVP_FINALIZED", 1);
assert.deepEqual([row().current_progress, row().status], [2, "CLEAR"]);
syncCanonicalMissions(runtimeMaster, rows, userId, "2026-09-11");
assert.deepEqual([row().current_progress, row().status, row().cycle_date], [0, "PROGRESS", "2026-09-11"]);

const orderedCtas = ["無料ガチャ", "キャラ装備", "CASHをゲット", "腕試しをしよう", "強敵に挑戦", "ミッションを確認"];
let cursor = -1;
for (const copy of orderedCtas) {
  const next = home.indexOf(`title: "${copy}"`, cursor + 1);
  assert.ok(next > cursor, `CTA order mismatch at ${copy}`);
  cursor = next;
}
const primaryCtaBlock = home.slice(home.indexOf("const primaryCta"), home.indexOf("const openPrimaryCta"));
assert.ok(!primaryCtaBlock.includes("guild_discovery") && !primaryCtaBlock.includes("guild_join"), "Guild must not gate the post-tutorial CTA");
assert.ok(mock.includes('"post_tutorial_quest"') && mock.includes('"first_pvp"') && mock.includes('"first_raid"'));

for (const contract of [
  "drop trigger if exists m9x_gacha_activity_trigger",
  "'POWER_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED'",
  "v_room.owner_user_id",
  "'boss_name',v_boss_name",
  "social_activity_feed_raid_boss_defeated_once_idx",
]) assert.ok(migration.includes(contract), `Activity contract missing: ${contract}`);
assert.ok(home.includes('"RAID_BOSS_DEFEATED"') && home.includes('"GUILD_CREATED"') && home.includes('"POWER_RANK_1"'));
assert.ok(!home.slice(home.indexOf("VISIBLE_ACTIVITY_TYPES"), home.indexOf("const activityDescription")).includes("SSR_CHARACTER"));

for (const claimContract of [
  'if (funcName === "claim_mission_reward")',
  'if (funcName === "claim_all_mission_rewards")',
  "mission_reward_delivery_ledger",
  "grantMockMissionReward",
]) assert.ok(mock.includes(claimContract), `Mission claim contract missing: ${claimContract}`);

console.log(JSON.stringify({ status: "PASS", mission: mission.id, cases: [0, 1, 2, "3+", "JST reset"], claimAuthority: ["single", "claim-all", "exactly-once ledger"], ctas: orderedCtas }, null, 2));
