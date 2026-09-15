import assert from "node:assert/strict";
import { executeMockRpc } from "../src/utils/mock/mockRpc.ts";
import { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS, CANONICAL_SKILLS } from "../src/domain/gameplay/canonical/masters.ts";

const userId = "00000000-0000-4000-8000-000000002218";
const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
localStorage.setItem("tribe_demo_uuid", userId);
localStorage.setItem("mock_auth_mode", "ANONYMOUS");

const tables = new Map();
const client = {
  getStorage: (name) => tables.get(name) ?? [],
  setStorage: (name, value) => tables.set(name, value),
};
const set = (name, value) => client.setStorage(name, structuredClone(value));
const milestones = () => client.getStorage("user_funnel_milestones").filter((row) => row.user_id === userId).map((row) => row.milestone);
const rpc = async (name, params = {}) => {
  const result = await executeMockRpc(client, name, params);
  return result;
};

const characters = CANONICAL_CHARACTERS.slice(0, 6).map((master, index) => ({
  id: `owned-character-${index + 1}`,
  user_id: userId,
  character_id: master.character_id,
  level: index + 1,
  awakening_level: 0,
}));
set("users", [{ id: userId, username: "Guide QA", cash: 1_000_000, neon_diamonds: 1_000 }]);
set("tutorial_progress", [{ user_id: userId, step_id: "COMPLETE", authentication_pending: true }]);
set("user_characters", characters);
set("user_funnel_milestones", [{ user_id: userId, milestone: "tutorial_complete", occurrence_count: 1 }]);
set("user_main_formations", []);
set("user_power_rankings", []);
set("user_daily_gacha_claims", []);
set("user_gacha_pity_points", []);
set("gacha_execution_history", []);
set("user_items", []);
set("user_skills", []);
set("user_equipments", []);
set("gacha_masters", [
  { id: "SKILL_NORMAL", gacha_type: "SKILL", cost_cash: 100, cost_diamond: 10 },
  { id: "EQUIP_NORMAL", gacha_type: "EQUIPMENT", cost_cash: 100, cost_diamond: 10 },
]);
set("gacha_items_master", [
  ...["N", "R", "SR"].map((rarity) => ({ gacha_id: "SKILL_NORMAL", item_id: CANONICAL_SKILLS.find((row) => row.rarity === rarity && !row.exclusive_character_id)?.skill_id, rarity, weight: 1 })),
  ...["N", "R", "SR"].map((rarity) => ({ gacha_id: "EQUIP_NORMAL", item_id: CANONICAL_EQUIPMENTS.find((row) => row.rarity === rarity && !row.exclusive_character_id)?.equipment_id, rarity, weight: 1 })),
]);

assert.deepEqual(milestones(), ["tutorial_complete"], "opening a page must not record guide milestones");
let onboarding = await rpc("get_current_onboarding_state");
assert.equal(onboarding.data?.gameplay_authorized, true, "deferred anonymous players must remain gameplay-authorized");
let result = await rpc("execute_asset_gacha", { p_user_id: userId, p_gacha_id: "SKILL_NORMAL", p_pull_count: 10, p_currency_type: "cash", p_request_id: "paid-skill" });
assert.equal(result.error, null);
assert(!milestones().includes("first_free_skill_ten_pull"), "paid Skill gacha must not complete the milestone");

result = await rpc("execute_asset_gacha", { p_user_id: userId, p_gacha_id: "SKILL_NORMAL", p_pull_count: 10, p_currency_type: "free", p_request_id: "free-skill" });
assert.equal(result.error, null);
assert(milestones().includes("first_free_skill_ten_pull"), "valid free Skill ten-pull must complete its lifetime milestone");
assert(!milestones().includes("first_free_equipment_ten_pull"));

result = await rpc("execute_asset_gacha", { p_user_id: userId, p_gacha_id: "EQUIP_NORMAL", p_pull_count: 10, p_currency_type: "ticket", p_request_id: "ticket-equipment" });
assert(result.error, "ticket gacha without tickets must fail");
assert(!milestones().includes("first_free_equipment_ten_pull"), "ticket Equipment gacha must not complete the milestone");
result = await rpc("execute_asset_gacha", { p_user_id: userId, p_gacha_id: "EQUIP_NORMAL", p_pull_count: 10, p_currency_type: "free", p_request_id: "free-equipment" });
assert.equal(result.error, null);
assert(milestones().includes("first_free_equipment_ten_pull"), "valid free Equipment ten-pull must complete its lifetime milestone");

result = await rpc("save_recommended_main_formation");
assert.equal(result.data?.status, "success");
assert.equal(result.data.character_ids.length, 5);
const formation = client.getStorage("user_main_formations").filter((row) => row.user_id === userId);
assert.equal(formation.length, 5);
assert.deepEqual(result.data.character_ids, formation.sort((a, b) => a.slot - b.slot).map((row) => characters.find((entry) => entry.id === row.user_character_id).character_id));

const offParty = characters.find((character) => !formation.some((row) => row.user_character_id === character.id));
const protectedEquipment = {
  id: "off-party-protected-equipment", user_id: userId,
  equipment_id: CANONICAL_EQUIPMENTS.find((row) => !row.exclusive_character_id).equipment_id,
  level: 100, plus_val: 10, equipped_character_id: offParty.id, slot_index: 0,
};
client.setStorage("user_equipments", [...client.getStorage("user_equipments"), protectedEquipment]);
assert(!milestones().includes("first_main_loadout"), "formation save alone must not complete loadout");
result = await rpc("apply_recommended_main_loadout");
assert.equal(result.data?.status, "success");
assert(result.data.skillCount > 0 && result.data.equipmentCount > 0);
assert(milestones().includes("first_main_loadout"), "successful verified party loadout must complete the milestone");
assert.equal(client.getStorage("user_equipments").find((row) => row.id === protectedEquipment.id).equipped_character_id, offParty.id, "off-party Equipment must not be stolen");
const assignedEquipmentIds = client.getStorage("user_equipments").filter((row) => formation.some((member) => member.user_character_id === row.equipped_character_id)).map((row) => row.id);
assert.equal(new Set(assignedEquipmentIds).size, assignedEquipmentIds.length, "an Equipment instance cannot be assigned twice");
assert.equal(client.getStorage("user_power_rankings").find((row) => row.user_id === userId).total_power, result.data.totalPower, "saved UI power projection must match Canonical server power");

const failedTables = new Map(tables);
failedTables.set("user_equipments", []);
failedTables.set("user_funnel_milestones", client.getStorage("user_funnel_milestones").filter((row) => row.milestone !== "first_main_loadout"));
const failedClient = { getStorage: (name) => failedTables.get(name) ?? [], setStorage: (name, value) => failedTables.set(name, value) };
result = await executeMockRpc(failedClient, "apply_recommended_main_loadout", {});
assert(result.error, "loadout without Equipment must fail");
assert(!failedClient.getStorage("user_funnel_milestones").some((row) => row.milestone === "first_main_loadout"), "failed loadout must not complete the milestone");

console.log("post-tutorial loadout guide mock verification: PASS");
