import assert from "node:assert/strict";
import { executeMockRpc } from "../src/utils/mock/mockRpc.ts";
import { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS } from "../src/domain/gameplay/canonical/masters.ts";

const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
localStorage.setItem("mock_auth_mode", "ANONYMOUS");

const tables = new Map();
const client = { getStorage: (name) => tables.get(name) ?? [], setStorage: (name, value) => tables.set(name, value) };
const set = (name, value) => client.setStorage(name, structuredClone(value));
const rpc = (name, params = {}) => executeMockRpc(client, name, params);
const firstCharacter = CANONICAL_CHARACTERS[0];
const firstEquipment = CANONICAL_EQUIPMENTS.find((entry) => !entry.exclusive_character_id);

const newUser = "00000000-0000-4000-8000-000000003101";
localStorage.setItem("tribe_demo_uuid", newUser);
set("users", []);
set("tutorial_progress", []);
let result = await rpc("initialize_current_player", { p_username: "短縮QA" });
assert.equal(result.data?.tutorial_step, "FREE_GACHA", "new players must skip World Introduction UI state");

set("user_characters", [{ id: "short-owned-1", user_id: newUser, character_id: firstCharacter.character_id, level: 1, awakening_level: 0 }]);
set("user_main_formations", []);
set("user_power_rankings", []);
set("user_equipments", []);
set("user_skills", []);
set("user_patrols", []);
set("user_funnel_milestones", []);
client.getStorage("tutorial_progress")[0].step_id = "AUTO_FORMATION";
result = await rpc("resume_short_tutorial");
assert.equal(result.data?.tutorial_step, "TUTORIAL_BATTLE", "removed formation/dispatch/instant UI states must resume at Battle");
assert.equal(client.getStorage("user_main_formations").length, 1, "owned-character shortage must form safely");
assert.equal(client.getStorage("user_skills").length, 0, "short tutorial must not auto-set Skills");
assert.equal(client.getStorage("user_patrols")[0]?.has_battle_event, true, "tutorial Battle authority must be prepared");

result = await rpc("advance_tutorial_progress", { p_expected_step: "TUTORIAL_BATTLE", p_next_step: "COMPLETE" });
assert.equal(result.data, "COMPLETE");
assert(client.getStorage("user_funnel_milestones").some((row) => row.user_id === newUser && row.milestone === "tutorial_complete"));
assert(client.getStorage("user_funnel_milestones").some((row) => row.user_id === newUser && row.milestone === "character_setup_dialog_eligible"));

result = await rpc("get_character_setup_dialog_state");
assert.deepEqual(result.data, { eligible: true, consumed: false });
result = await rpc("complete_character_setup_dialog", { p_action: "AUTO_SETUP" });
assert.equal(result.data?.status, "success");
assert.equal(result.data?.partyCount, 1);
assert.equal(result.data?.equipmentCount, 0, "Equipment shortage must be accepted");
assert(client.getStorage("user_funnel_milestones").some((row) => row.user_id === newUser && row.milestone === "first_main_loadout"));
result = await rpc("complete_character_setup_dialog", { p_action: "AUTO_SETUP" });
assert.equal(result.data?.status, "already_consumed", "duplicate primary operation must be idempotent");

const laterUser = "00000000-0000-4000-8000-000000003102";
localStorage.setItem("tribe_demo_uuid", laterUser);
client.getStorage("user_funnel_milestones").push({ user_id: laterUser, milestone: "character_setup_dialog_eligible", metadata: {} });
result = await rpc("complete_character_setup_dialog", { p_action: "LATER" });
assert.equal(result.data?.status, "success");
assert(!client.getStorage("user_funnel_milestones").some((row) => row.user_id === laterUser && row.milestone === "first_main_loadout"));
result = await rpc("get_character_setup_dialog_state");
assert.deepEqual(result.data, { eligible: true, consumed: true }, "Later must consume the dialog permanently");

const existingUser = "00000000-0000-4000-8000-000000003103";
localStorage.setItem("tribe_demo_uuid", existingUser);
client.getStorage("user_funnel_milestones").push({ user_id: existingUser, milestone: "tutorial_complete", metadata: {} });
result = await rpc("get_character_setup_dialog_state");
assert.deepEqual(result.data, { eligible: false, consumed: false }, "already-completed users must not receive the new dialog");

assert(firstEquipment, "canonical Equipment fixture must exist");
console.log("GAME03 short tutorial + Character setup verification: PASS");
