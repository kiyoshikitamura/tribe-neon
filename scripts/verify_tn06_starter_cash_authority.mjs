import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executeMockRpc } from "../src/utils/mock/mockRpc.ts";

const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const tables = new Map();
const client = {
  getStorage: (name) => tables.get(name) ?? [],
  setStorage: (name, value) => tables.set(name, value),
};
const set = (name, value) => client.setStorage(name, structuredClone(value));
const rpc = (name, params = {}) => executeMockRpc(client, name, params);

const currentUserId = "00000000-0000-4000-8000-000000002600";
localStorage.setItem("tribe_demo_uuid", currentUserId);
localStorage.setItem("mock_auth_mode", "ANONYMOUS");
set("users", []);
set("tutorial_progress", []);

let result = await rpc("initialize_current_player", { p_username: "初期QA" });
assert.equal(result.error, null, "current initializer must succeed");
assert.equal(client.getStorage("users")[0]?.cash, 2600, "current initializer must grant CASH 2,600");

const currentCharacterId = "00000000-0000-4000-8000-000000002601";
set("user_characters", [{ id: currentCharacterId, user_id: currentUserId, character_id: "char_ageha_01", level: 1, awakening_level: 0 }]);
set("user_items", [{ user_id: currentUserId, item_id: "CHAR_EXP_S", quantity: 6 }]);
set("character_level_up_master", Array.from({ length: 6 }, (_, index) => ({ level: index + 2, cost_cash: 100, required_material_count: 1 })));
result = await rpc("level_up_character", { p_character_id: currentCharacterId, p_exp_item_id: "CHAR_EXP_S", p_count: 6 });
assert.equal(result.error, null, "tutorial growth equivalent must succeed");
assert.equal(result.data?.cash_spent, 600, "Lv1 to Lv7 tutorial growth must spend CASH 600");
assert.equal(result.data?.remaining_cash, 2000, "tutorial growth must leave CASH 2,000");

const legacyUserId = "00000000-0000-4000-8000-000000002602";
result = await rpc("initialize_new_user", {
  p_user_id: legacyUserId,
  p_username: "旧初期QA",
  p_character_id: "char_reiji_01",
  p_area_id: "shinjuku",
  p_gift_code: null,
});
assert.equal(result.error, null, "legacy mock initializer must succeed");
assert.equal(client.getStorage("users").find((row) => row.id === legacyUserId)?.cash, 2600, "legacy mock initializer must grant CASH 2,600");

const resetUserId = "00000000-0000-4000-8000-000000002603";
localStorage.setItem("tribe_demo_uuid", resetUserId);
const users = client.getStorage("users");
users.push({ id: resetUserId, username: "再初期QA", cash: 7777, level: 7, xp: 300 });
set("users", users);
set("user_lifetime_onboarding_grants", [{ user_id: resetUserId }]);
for (const table of ["payment_transactions", "user_shop_purchases", "user_monthly_passes", "guild_members", "guilds", "user_patrols", "battle_replay_sessions"]) set(table, []);
result = await rpc("reset_current_gameplay", { p_request_id: "00000000-0000-4000-8000-000000002604", p_acknowledged: true });
assert.equal(result.error, null, "gameplay reset must succeed");
assert.equal(client.getStorage("users").find((row) => row.id === resetUserId)?.cash, 2600, "gameplay reset must restore CASH 2,600");

const [migration, mockRpc, gameContext, resetTest, transactionTest] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260902000224_starter_cash_authority.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/utils/mock/mockRpc.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/GameContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../tests/db/gameplay-reset-authority.sql", import.meta.url), "utf8"),
  readFile(new URL("../tests/db/starter-cash-authority.sql", import.meta.url), "utf8"),
]);

assert.match(migration, /alter\s+table\s+public\.users\s+alter\s+column\s+cash\s+set\s+default\s+2600/i);
assert.doesNotMatch(migration, /update\s+public\.users/i, "migration must not rewrite existing balances");
assert.match(gameContext, /useState<number>\(2600\)/, "unloaded UI state must match Fresh authority");
assert.match(resetTest, /cash=2600/, "DB reset authority test must expect CASH 2,600");
for (const contract of ["existing balance was rewritten", "Fresh User did not receive CASH 2600", "tutorial growth did not leave CASH 2000", "rollback;"]) {
  assert.match(transactionTest, new RegExp(contract, "i"), `DB transaction fixture is missing: ${contract}`);
}
assert.equal((mockRpc.match(/cash:\s*2600/g) ?? []).length >= 2, true, "both mock initializers must use CASH 2,600");
assert.match(mockRpc, /cash:\s*2600[^\n]+current_base_id:\s*"shinjuku"/, "mock reset must use CASH 2,600");

console.log("TN-06 starter CASH authority verification: PASS");
