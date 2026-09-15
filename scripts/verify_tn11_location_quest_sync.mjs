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

const userId = "26000000-0000-4000-8000-000000000011";
localStorage.setItem("tribe_demo_uuid", userId);
const tables = new Map([["users", [{ id: userId, current_base_id: "shinjuku" }]]]);
const client = {
  getStorage: (name) => tables.get(name) ?? [],
  setStorage: (name, value) => tables.set(name, value),
};

let result = await executeMockRpc(client, "move_current_user_base", { p_base_id: "yokohama" });
assert.equal(result.error, null);
assert.equal(result.data.previous_base_id, "shinjuku");
assert.equal(result.data.current_base_id, "yokohama");
assert.equal(client.getStorage("users")[0].current_base_id, "yokohama");

result = await executeMockRpc(client, "move_current_user_base", { p_base_id: "osaka" });
assert.equal(result.error?.code, "22023");
assert.equal(client.getStorage("users")[0].current_base_id, "yokohama");

const expiredPatrol = {
  id: "26000000-0000-4000-8000-000000000012",
  user_id: userId,
  course_id: "QUEST_SHINJUKU_EASY",
  status: "ONGOING",
  expires_at: new Date(Date.now() - 1_000).toISOString(),
  has_battle_event: true,
  battle_resolved: false,
  encounter_snapshot: { encounterId: "natural-completion", questId: "QUEST_SHINJUKU_EASY", members: [{ level: 5 }] },
};
tables.set("user_patrols", [expiredPatrol]);
result = await executeMockRpc(client, "get_patrol_battle_enemy", { p_patrol_id: expiredPatrol.id });
assert.equal(result.error, null);
assert.equal(result.data.id, "natural-completion");
assert.equal(result.data.quest_id, expiredPatrol.course_id);
assert.equal(result.data.npc_level, 5);
assert.deepEqual(result.data.enemy_data, expiredPatrol.encounter_snapshot);
expiredPatrol.expires_at = new Date(Date.now() + 60_000).toISOString();
result = await executeMockRpc(client, "get_patrol_battle_enemy", { p_patrol_id: expiredPatrol.id });
assert.equal(result.error?.code, "P0002");
expiredPatrol.expires_at = new Date(Date.now() - 1_000).toISOString();
expiredPatrol.user_id = "26000000-0000-4000-8000-000000000099";
result = await executeMockRpc(client, "get_patrol_battle_enemy", { p_patrol_id: expiredPatrol.id });
assert.equal(result.error?.code, "P0002");

const [migration, encounterMigration, context, patrolHook, presentation, mockRpc, dbTest, patrolDbTest] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260902000226_location_movement_authority.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260902000231_natural_patrol_encounter_authority.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/GameContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/hooks/usePatrol.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/components/quest/QuestPresentationV2.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/utils/mock/mockRpc.ts", import.meta.url), "utf8"),
  readFile(new URL("../tests/db/location-movement-authority.sql", import.meta.url), "utf8"),
  readFile(new URL("../tests/db/patrol-replay-idempotency-convergence.sql", import.meta.url), "utf8"),
]);

for (const contract of ["security definer", "auth.uid()", "for update", "update public.users", "Invalid base id"]) {
  assert(migration.toLowerCase().includes(contract.toLowerCase()), `location migration contract missing: ${contract}`);
}
assert(!/from\("users"\)\s*\.update\(\{\s*current_base_id/.test(context), "client must not update current_base_id directly");
assert(context.includes('supabase.rpc("move_current_user_base"'));
assert(dbTest.includes("another user location was changed"));
for (const contract of ["auth.uid()", "patrol.user_id = v_user_id", "patrol.status = 'ONGOING'", "patrol.expires_at <= now()", "patrol.encounter_snapshot is not null"]) {
  assert(encounterMigration.includes(contract), `natural encounter migration contract missing: ${contract}`);
}
for (const contract of ["natural completion was not authorized", "early natural completion was authorized", "another user''s natural completion was authorized", "enemy_data did not preserve encounter snapshot"]) {
  assert(patrolDbTest.includes(contract), `natural encounter DB regression missing: ${contract}`);
}

// TN-11B contracts are asserted after its independent commit is applied.
if (patrolHook.includes("encounterSnapshot")) {
  assert(context.includes("encounterSnapshot: p.encounter_snapshot"));
  assert(presentation.includes("patrol.encounterSnapshot?.members"));
  assert(/enemy_members:\s*\[\]/.test(mockRpc), "mock progression must match Production dynamic encounter projection");
  assert(
    patrolHook.includes("transitionTutorialQuestToBattle(\n            patrolId,\n            nextTutorialStep,\n            encounterSnapshot,"),
    "tutorial speed-up must carry the recovered encounter snapshot into immediate state",
  );
}

console.log("TN-11 location and Quest synchronization verification: PASS");
