import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executeMockRpc } from "../src/utils/mock/mockRpc.ts";
import { CANONICAL_MISSIONS } from "../src/domain/gameplay/canonical/masters.ts";
import { jstCycleDate } from "../src/domain/gameplay/canonical/mission_runtime.ts";

const userId = "00000000-0000-4000-8000-000000002510";
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
const cycleDate = jstCycleDate();
const ids = ["MIS_N_B001", "MIS_D_001", "MIS_N_P001"];

set("users", [{ id: userId, username: "TN10 QA", cash: 100, neon_diamonds: 5 }]);
set("user_items", []);
set("user_equipments", []);
set("presents", []);
set("user_funnel_milestones", []);
set("mission_reward_delivery_ledger", []);
set("user_missions", ids.map((id) => {
  const master = CANONICAL_MISSIONS.find((entry) => entry.id === id);
  assert(master, `mission master missing: ${id}`);
  return {
    id: `um-${id}`,
    user_id: userId,
    mission_id: id,
    current_progress: master.targetValue,
    status: "CLEAR",
    cycle_date: master.category === "DAILY" ? cycleDate : null,
  };
}));

const originalRandom = Math.random;
Math.random = () => 0;
let result;
try {
  result = await rpc("claim_mission_reward", { p_mission_id: "MIS_N_B001" });
} finally {
  Math.random = originalRandom;
}
assert.equal(result.error, null, "single claim must succeed");
assert.equal(result.data.delivery, "DIRECT");
assert.equal(result.data.rewards[0].item_id, "NORMAL_GACHA_TICKET_CHARACTER", "resolved random reward must be returned");
assert.equal(client.getStorage("presents").length, 0, "mission claim must not create a present");
assert.equal(client.getStorage("user_items").find((row) => row.item_id === "NORMAL_GACHA_TICKET_CHARACTER")?.quantity, 1);
assert.equal(client.getStorage("mission_reward_delivery_ledger")[0]?.resolved_item_id, "NORMAL_GACHA_TICKET_CHARACTER");
assert.equal(client.getStorage("mission_reward_delivery_ledger")[0]?.delivery_status, "DELIVERED");

result = await rpc("claim_mission_reward", { p_mission_id: "MIS_N_B001" });
assert(result.error, "claimed mission must not be delivered twice");
assert.equal(client.getStorage("user_items").find((row) => row.item_id === "NORMAL_GACHA_TICKET_CHARACTER")?.quantity, 1);

result = await rpc("claim_all_mission_rewards", { p_mission_ids: ["MIS_D_001", "MIS_N_P001", "MIS_D_001"] });
assert.equal(result.error, null, "bulk claim must succeed");
assert.equal(result.data.delivery, "DIRECT");
assert.equal(result.data.claimed_count, 2);
assert.equal(client.getStorage("presents").length, 0, "bulk mission claim must not create presents");
assert.equal(client.getStorage("users")[0].cash, 200, "cash reward must be granted directly exactly once");
assert.equal(client.getStorage("mission_reward_delivery_ledger").length, 3, "each mission cycle must retain one audit row");

const [migration, inventoryHook, chatHook, gameContext] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260902000225_mission_direct_grant_refresh.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/hooks/useInventory.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/hooks/useChat.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/GameContext.tsx", import.meta.url), "utf8"),
]);
for (const contract of [
  "mission_reward_delivery_ledger",
  "grant_present_payload",
  "pg_advisory_xact_lock",
  "for update",
  "'delivery', 'DIRECT'",
]) assert(migration.toLowerCase().includes(contract.toLowerCase()), `migration contract missing: ${contract}`);
const claimFunctions = migration.slice(migration.indexOf("create or replace function public.claim_mission_reward"));
assert(!claimFunctions.toLowerCase().includes("insert into public.presents"), "mission claim functions must not create presents");
assert(inventoryHook.includes('message: "報酬を獲得しました。"'));
assert(inventoryHook.includes('delivery: "INVENTORY"'));
assert(chatHook.includes("await refreshAfterGuildChat(session.user.id)"));
assert(chatHook.includes("Guild chat mission projection refresh failed"));
assert(gameContext.includes("(userId: string) => syncBootstrapData(userId)"));

console.log("TN-10 mission direct grant verification: PASS");
