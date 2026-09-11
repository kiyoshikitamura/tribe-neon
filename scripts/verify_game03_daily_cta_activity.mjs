import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateCanonicalMissionProgress, syncCanonicalMissions } from "../src/domain/gameplay/canonical/mission_runtime.ts";

import { resolveHomeInitialCta, describeHomeActivity } from "../src/domain/presentation/homeInitialGuide.ts";
import { HOME_ACTION_PRESENTATION_SLOTS } from "../src/domain/presentation/homeActionPresentation.ts";

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

const guideSteps = ["first_free_skill_ten_pull", "first_free_equipment_ten_pull", "first_main_loadout", "post_tutorial_quest", "first_pvp", "first_raid"];
const orderedCtas = [];
for (let index = 0; index <= guideSteps.length; index += 1) {
  const cta = resolveHomeInitialCta({ ready: true, gameplayAuthorized: true, milestones: new Set(guideSteps.slice(0, index)), raidAvailability: "active" });
  orderedCtas.push(cta?.tab || cta?.action);
}
assert.deepEqual(orderedCtas, ["gacha", "gacha", "character", "patrol", "pvp", "raid", "mission_handoff"]);
const guide = (milestones, overrides = {}) => resolveHomeInitialCta({
  ready: true, tutorialStep: "AUTHENTICATION", gameplayAuthorized: true,
  milestones: new Set(milestones), raidAvailability: "unknown", ...overrides,
});
assert.equal(guide([], { ready: false }), null);
assert.equal(guide(["activation_mission_handoff"]), null, "Legacy completion must not restart the guide");
assert.equal(guide(["activation_mission_handoff"], { tutorialStep: "FREE_GACHA", gameplayAuthorized: false })?.key, "tutorial");
assert.equal(guide([...guideSteps.slice(0, 2), "character_setup_dialog_consumed"])?.tab, "patrol");
assert.equal(guide(guideSteps.filter((step) => step !== "post_tutorial_quest"))?.tab, "patrol");
assert.equal(guide(guideSteps.slice(0, 5))?.title, "レイドを確認");
const pausedRaid = guide(guideSteps.slice(0, 5), { raidAvailability: "inactive" });
assert.equal(pausedRaid?.disabled, true);
assert.equal(pausedRaid?.action, undefined, "Unavailable raid must never bypass first_raid");
assert.equal(guide(guideSteps.map((step) => step === "first_main_loadout" ? "character_setup_dialog_consumed" : step))?.action, "mission_handoff");
assert.deepEqual(HOME_ACTION_PRESENTATION_SLOTS.map((slot) => slot.destination), ["patrol", "pvp", "raid", "guild"]);
assert.ok(HOME_ACTION_PRESENTATION_SLOTS.every((slot) => slot.exposure === "ACTIVE"));
assert.equal(describeHomeActivity("future_type"), "アクティビティを更新");
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
assert.equal(describeHomeActivity("RAID_BOSS_DEFEATED"), "レイドボスを撃破");
assert.equal(describeHomeActivity("GUILD_CREATED"), "TRIBEを結成");
assert.equal(describeHomeActivity("POWER_RANK_1"), "総戦力ランキング1位に到達");
assert.ok(!home.slice(home.indexOf("VISIBLE_ACTIVITY_TYPES"), home.indexOf("const activityDescription")).includes("SSR_CHARACTER"));

for (const claimContract of [
  'if (funcName === "claim_mission_reward")',
  'if (funcName === "claim_all_mission_rewards")',
  "mission_reward_delivery_ledger",
  "grantMockMissionReward",
]) assert.ok(mock.includes(claimContract), `Mission claim contract missing: ${claimContract}`);

console.log(JSON.stringify({ status: "PASS", mission: mission.id, cases: [0, 1, 2, "3+", "JST reset"], claimAuthority: ["single", "claim-all", "exactly-once ledger"], ctas: orderedCtas }, null, 2));
