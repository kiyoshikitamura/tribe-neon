import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executeMockRpc } from "../src/utils/mock/mockRpc.ts";
import {
  CANONICAL_CHARACTERS,
  CANONICAL_MISSIONS,
} from "../src/domain/gameplay/canonical/masters.ts";
import {
  jstCycleDate,
  refreshDailyMissionCompletionAggregates,
} from "../src/domain/gameplay/canonical/mission_runtime.ts";

const userId = "00000000-0000-4000-8000-000000002222";
const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
localStorage.setItem("tribe_demo_uuid", userId);

const tables = new Map();
const client = {
  getStorage: (name) => tables.get(name) ?? [],
  setStorage: (name, value) => tables.set(name, value),
};
const set = (name, value) => client.setStorage(name, structuredClone(value));
const rpc = (name, params = {}) => executeMockRpc(client, name, params);
const mission = (id) => client.getStorage("user_missions").find((row) => row.user_id === userId && row.mission_id === id);

const cycleDate = jstCycleDate();
set("users", [{ id: userId, username: "TN02 QA", cash: 1_000_000, neon_diamonds: 1_000 }]);
set("tutorial_progress", [{ user_id: userId, step_id: "FREE_GACHA" }]);
set("user_characters", []);
set("user_items", []);
set("user_skills", []);
set("user_equipments", []);
set("user_funnel_milestones", []);
set("user_lifetime_onboarding_grants", []);
set("user_daily_gacha_claims", []);
set("gacha_execution_history", []);
set("guild_members", [{ user_id: userId, guild_id: "00000000-0000-4000-8000-000000009999" }]);
set("board_posts", []);
set("gacha_masters", [{ id: "CHAR_NORMAL", gacha_type: "CHARACTER", cost_cash: 100, cost_diamond: 10 }]);

const normalCharacters = ["N", "R", "SR"].map((rarity) => CANONICAL_CHARACTERS.find((row) => row.rarity === rarity));
const ssrCharacter = CANONICAL_CHARACTERS.find((row) => row.rarity === "SSR");
assert(normalCharacters.every(Boolean) && ssrCharacter, "canonical character buckets are required");
set("gacha_items_master", [
  ...normalCharacters.map((row) => ({ gacha_id: "CHAR_NORMAL", item_id: row.character_id, rarity: row.rarity, weight: 1 })),
  { gacha_id: "CHAR_SPECIAL", item_id: ssrCharacter.character_id, rarity: "SSR", weight: 1 },
]);
set("user_missions", CANONICAL_MISSIONS.filter((entry) => entry.isEnabled && entry.preopen).map((entry) => ({
  id: `um-${entry.id}`,
  user_id: userId,
  mission_id: entry.id,
  current_progress: 0,
  status: "PROGRESS",
  cycle_date: entry.category === "DAILY" ? cycleDate : null,
})));

let result = await rpc("execute_tutorial_character_gacha", { p_request_id: "00000000-0000-4000-8000-000000000001" });
assert.equal(result.error, null, "tutorial free character ten-pull must succeed");
assert.equal(client.getStorage("user_daily_gacha_claims").find((row) => row.user_id === userId && row.gacha_type === "CHARACTER")?.last_claimed_date, cycleDate, "tutorial draw must consume today's Character entitlement");
assert.equal(mission("MIS_D_001")?.status, "CLEAR", "successful free tutorial draw must complete the free-gacha daily mission");

const historyCount = client.getStorage("gacha_execution_history").length;
result = await rpc("execute_tutorial_character_gacha", { p_request_id: "00000000-0000-4000-8000-000000000001" });
assert.equal(result.error, null, "tutorial request replay must be idempotent");
assert.equal(client.getStorage("gacha_execution_history").length, historyCount, "tutorial replay must not create another authority row");

result = await rpc("execute_character_gacha", {
  p_user_id: userId,
  p_gacha_id: "CHAR_NORMAL",
  p_pull_count: 10,
  p_currency_type: "free",
  p_request_id: "00000000-0000-4000-8000-000000000002",
});
assert(result.error, "a second same-day free Character ten-pull must be rejected");
assert.equal(mission("MIS_D_001")?.current_progress, 1, "failed/replayed draws must not increment a cleared daily mission");

result = await rpc("evaluate_mission_progress", {
  p_user_id: userId,
  p_trigger_type: "PVP_BATTLE_COUNT",
  p_progress_increment: 1,
});
assert.equal(result.error, null);
assert.equal(mission("MIS_D_004")?.status, "CLEAR", "finalized PvP alias must complete the battle daily mission");

result = await rpc("send_chat_message", { p_target_type: "GLOBAL", p_content: "global message" });
assert.equal(result.error, null);
assert.equal(mission("MIS_D_006")?.status, "PROGRESS", "global chat must not complete the guild daily mission");
result = await rpc("send_chat_message", { p_target_type: "GUILD", p_content: "guild message" });
assert.equal(result.error, null);
assert.equal(mission("MIS_D_006")?.status, "CLEAR", "successful Guild chat must complete the guild daily mission");
assert.equal(mission("MIS_D_008")?.current_progress, 3, "three source daily completions must be server-aggregated");
assert.equal(mission("MIS_D_008")?.status, "CLEAR");
assert.equal(mission("MIS_D_009")?.current_progress, 3);

await rpc("evaluate_mission_progress", { p_user_id: userId, p_trigger_type: "PATROL_CLEAR", p_progress_increment: 1 });
await rpc("evaluate_mission_progress", { p_user_id: userId, p_trigger_type: "CHAR_LEVEL_UP", p_progress_increment: 1 });
assert.equal(mission("MIS_D_009")?.current_progress, 5, "five source daily completions must be server-aggregated");
assert.equal(mission("MIS_D_009")?.status, "CLEAR");

const aggregateMaster = CANONICAL_MISSIONS.filter((entry) => (
  ["MIS_D_001", "MIS_D_002", "MIS_D_003", "MIS_D_004", "MIS_D_009"].includes(entry.id)
)).map((entry) => ({
  id: entry.id,
  category: entry.category,
  trigger_type: entry.triggerType,
  target_value: entry.targetValue,
  is_enabled: entry.isEnabled,
  prerequisite_mission_id: entry.prerequisiteMissionId,
}));
aggregateMaster.push({
  ...aggregateMaster.find((entry) => entry.id === "MIS_D_001"),
  id: "MIS_D_DISABLED_FIXTURE",
  is_enabled: false,
});
const aggregateRows = aggregateMaster.map((entry) => ({
  id: `um-aggregate-${entry.id}`,
  user_id: userId,
  mission_id: entry.id,
  current_progress: entry.id === "MIS_D_009" ? 0 : 1,
  status: entry.id === "MIS_D_009" ? "PROGRESS" : "CLEAR",
  cycle_date: cycleDate,
}));
aggregateRows.push({
  id: "um-disabled-fixture",
  user_id: userId,
  mission_id: "MIS_D_DISABLED_FIXTURE",
  current_progress: 1,
  status: "CLEAR",
  cycle_date: cycleDate,
});
refreshDailyMissionCompletionAggregates(aggregateMaster, aggregateRows, userId, cycleDate);
assert.equal(
  aggregateRows.find((row) => row.mission_id === "MIS_D_009")?.current_progress,
  4,
  "disabled Daily rows must not contribute to the server-authoritative aggregate",
);

Object.assign(mission("MIS_D_001"), { current_progress: 0, status: "PROGRESS" });
result = await rpc("execute_character_gacha", {
  p_user_id: userId,
  p_gacha_id: "CHAR_NORMAL",
  p_pull_count: 1,
  p_currency_type: "cash",
  p_request_id: "00000000-0000-4000-8000-000000000003",
});
assert.equal(result.error, null);
assert.equal(mission("MIS_D_001")?.current_progress, 0, "paid gacha must not complete the free-gacha daily mission");
result = await rpc("execute_character_gacha", {
  p_user_id: userId,
  p_gacha_id: "CHAR_NORMAL",
  p_pull_count: 10,
  p_currency_type: "free",
  p_request_id: "00000000-0000-4000-8000-000000000004",
});
assert(result.error);
assert.equal(mission("MIS_D_001")?.current_progress, 0, "failed free gacha must not complete the daily mission");

const [migration, correction, panel, missionMaster] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260902000222_daily_mission_authority_convergence.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260902000223_daily_mission_authority_corrections.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/app/components/MissionPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/domain/gameplay/canonical/data/missions_20260910.json", import.meta.url), "utf8"),
]);
for (const contract of [
  "consume_tutorial_character_daily_free_gacha_trigger",
  "dispatch_completed_free_normal_gacha_mission_trigger",
  "dispatch_guild_chat_mission_trigger",
  "daily_mission_authority_change_trigger",
  "PVP_FINALIZED_BATTLE_COUNT",
  "GUILD_ACTIVITY_COUNT",
]) assert(migration.includes(contract), `migration authority contract missing: ${contract}`);
for (const contract of [
  "new.status not in ('CLEAR', 'CLAIMED')",
  "new.status in ('CLEAR', 'CLAIMED')",
  "and m.is_enabled",
  "insert into public.user_daily_gacha_claims",
  "NORMAL_FREE_GACHA_PULL_COUNT",
]) assert(correction.includes(contract), `correction authority contract missing: ${contract}`);
assert(!panel.includes("displayGroup === group && mission.status === \"IN_PROGRESS\").slice(0, 1)"), "Normal mission groups must not truncate details to one row");
for (const detail of ["mission.description", "mission.reward_item", "mission.reward_amount", "mission.current_progress", "mission.target_value"]) {
  assert(panel.includes(detail), `Normal mission details are missing: ${detail}`);
}
const parsedMaster = JSON.parse(missionMaster);
assert.equal(parsedMaster.version, "2026-09-10");
assert.equal(parsedMaster.missions.find((entry) => entry.id === "MIS_D_006")?.title, "ギルドで発言しよう");

console.log("TN-02 gacha/mission authority verification: PASS");
