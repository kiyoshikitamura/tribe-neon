import assert from "node:assert/strict";
import { executeMockRpc } from "../src/utils/mock/mockRpc.ts";
import { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS, CANONICAL_SKILLS } from "../src/domain/gameplay/canonical/masters.ts";

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
let result;
// Owned exclusive skills must participate in the guide, without requiring five characters.
const skillUser = "00000000-0000-4000-8000-000000003104";
localStorage.setItem("tribe_demo_uuid", skillUser);
const exclusive = CANONICAL_SKILLS.find((entry) => entry.exclusive_character_id);
assert(exclusive);
set("user_characters", [{ id: "guide-exclusive-owner", user_id: skillUser, character_id: exclusive.exclusive_character_id, awakening_level: 0, level: 1 }]);
set("user_skills", [{ id: "guide-exclusive-skill", user_id: skillUser, skill_card_id: exclusive.skill_id, plus_val: 0 }]);
set("user_equipments", []);
set("user_main_formations", []);
set("user_funnel_milestones", [{ user_id: skillUser, milestone: "character_setup_dialog_eligible", metadata: {} }]);
result = await rpc("complete_character_setup_dialog", { p_action: "AUTO_SETUP" });
assert.equal(result.data?.skillCount, 1);
assert.equal(client.getStorage("user_skills")[0].equipped_character_id, "guide-exclusive-owner");
assert.equal(client.getStorage("user_skills")[0].slot_index, 0);
const assigned = structuredClone(client.getStorage("user_skills"));
result = await rpc("complete_character_setup_dialog", { p_action: "AUTO_SETUP" });
assert.equal(result.data?.status, "already_consumed");
assert.deepEqual(client.getStorage("user_skills"), assigned);

// No compatible skill (another character's exclusive) must not block onboarding.
localStorage.setItem("tribe_demo_uuid", skillUser);
set("user_funnel_milestones", [{ user_id: skillUser, milestone: "character_setup_dialog_eligible", metadata: {} }]);
set("user_characters", [{ id: "guide-other-owner", user_id: skillUser, character_id: CANONICAL_CHARACTERS.find((entry) => entry.character_id !== exclusive.exclusive_character_id).character_id, awakening_level: 0, level: 1 }]);
set("user_skills", [{ id: "guide-incompatible-skill", user_id: skillUser, skill_card_id: exclusive.skill_id, plus_val: 0 }]);
result = await rpc("complete_character_setup_dialog", { p_action: "AUTO_SETUP" });
assert.equal(result.data?.status, "success");
assert.equal(result.data?.skillCount, 0);
assert.equal(client.getStorage("user_skills")[0].equipped_character_id, undefined);
set("user_funnel_milestones", [{ user_id: skillUser, milestone: "character_setup_dialog_eligible", metadata: {} }]);
const beforeLater = structuredClone(client.getStorage("user_skills"));
result = await rpc("complete_character_setup_dialog", { p_action: "LATER" });
assert.equal(result.data?.status, "success");
assert.deepEqual(client.getStorage("user_skills"), beforeLater);

console.log("Preview guide exclusive skill setup and duplicate: PASS");
