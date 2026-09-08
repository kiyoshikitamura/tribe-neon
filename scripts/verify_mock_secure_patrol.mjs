const storage = new Map();

globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const userId = "mock-secure-patrol-user";
localStorage.setItem("tribe_demo_uuid", userId);

const { executeMockRpc } = await import("../src/utils/mock/mockRpc.ts");
const { resolveBattle } = await import("../supabase/functions/resolve-battle/engine.ts");
const { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS } = await import("../src/domain/gameplay/canonical/masters.ts");
const { canonicalCharacterStats, canonicalEquipmentFlatStat } = await import("../src/domain/gameplay/canonical/calculations.ts");
const client = {
  getStorage: (key) => storage.has(key) ? JSON.parse(storage.get(key)) : [],
  setStorage: (key, value) => storage.set(key, JSON.stringify(value)),
};

client.setStorage("users", [{ id: userId, vitality: 20, cash: 5000, neon_diamonds: 200, level: 1, xp: 0 }]);
client.setStorage("user_characters", [{ id: "owned-1", user_id: userId, character_id: "char_reiji_01", level: 1, awakening_level: 0 }]);
client.setStorage("user_equipments", [{ id: "equip-1", user_id: userId, equipment_id: "WEAPON_001", equipped_character_id: "owned-1", slot_index: 1, level: 2, plus_val: 1 }]);
client.setStorage("user_skills", [
  { id: "skill-1", user_id: userId, skill_card_id: "SKILL_001", equipped_character_id: "owned-1", slot_index: 1, plus_val: 10 },
  { id: "skill-placeholder", user_id: userId, skill_card_id: "SKILL_051", equipped_character_id: "owned-1", slot_index: 2, plus_val: 0 },
]);
client.setStorage("quests", [{ id: "quest-1", name: "Mock patrol", duration_seconds: 120, cost_vitality: 7, cash_reward: 250, exp_reward: 40, item_rewards: [] }]);

const unowned = await executeMockRpc(client, "start_patrol", { p_course_id: "quest-1", p_character_id: "not-owned" });
if (unowned.error?.code !== "23503") throw new Error("Unowned patrol character was not rejected");

const started = await executeMockRpc(client, "start_patrol", { p_course_id: "quest-1", p_character_id: "owned-1" });
const patrol = client.getStorage("user_patrols")[0];
const user = client.getStorage("users")[0];
if (started.error || !patrol || patrol.character_id !== "char_reiji_01" || started.data.duration_seconds !== 120 || started.data.remaining_vitality !== 13 || user.vitality !== 13) {
  throw new Error("Secure patrol start did not use authoritative quest and ownership data");
}

const duplicate = await executeMockRpc(client, "start_patrol", { p_course_id: "quest-1", p_character_id: "owned-1" });
if (duplicate.error?.code !== "23505") throw new Error("Duplicate active patrol was not rejected");

const instant = await executeMockRpc(client, "complete_patrol_instantly", {
  p_user_id: userId,
  p_patrol_id: patrol.id,
  p_use_currency: "FREE_PREOPEN",
});
const instantPatrol = client.getStorage("user_patrols")[0];
const chargedUser = client.getStorage("users")[0];
if (instant.error || instantPatrol.status !== "CLAIMABLE" || chargedUser.cash !== 5000 || chargedUser.quest_free_skips_count !== 1) {
  throw new Error("Secure patrol free instant completion did not atomically count and complete the patrol");
}

const repeatedInstant = await executeMockRpc(client, "complete_patrol_instantly", {
  p_user_id: userId,
  p_patrol_id: patrol.id,
  p_use_currency: "FREE_PREOPEN",
});
if (!repeatedInstant.error || client.getStorage("users")[0].cash !== 5000) {
  throw new Error("Repeated patrol instant completion was not rejected before charging");
}

const blockedClaim = await executeMockRpc(client, "claim_patrol_rewards", { p_patrol_id: patrol.id });
if (!blockedClaim.error) throw new Error("An unresolved mandatory NPC battle did not block patrol rewards");

client.setStorage("patrol_npcs", [{ id: "npc-quest-1", quest_id: "quest-1", npc_name: "Mock NPC", enemy_data: { hp: 900, atk: 55, def: 35, spd: 75, luk: 3 } }]);
const replay = await executeMockRpc(client, "create_patrol_battle_replay", { p_patrol_id: patrol.id, p_tactic_id: "ATTACK_PRIORITY" });
if (replay.error || !replay.data?.replay_session_id) throw new Error("Server-authoritative patrol replay was not created");
const characterMaster = CANONICAL_CHARACTERS.find((entry) => entry.character_id === "char_reiji_01");
const equipmentMaster = CANONICAL_EQUIPMENTS.find((entry) => entry.equipment_id === "WEAPON_001");
const baseStats = canonicalCharacterStats(characterMaster.lv1, characterMaster.lv100, 1, 0);
const equipmentAtk = canonicalEquipmentFlatStat(equipmentMaster.base_stats.atk, 2, 1);
if (replay.data.player_snapshot[0]?.stats?.atk !== baseStats.atk + equipmentAtk
  || replay.data.player_snapshot[0]?.equipment?.[0]?.equipmentId !== "WEAPON_001"
  || replay.data.player_snapshot[0]?.equippedSkillRefs?.[0]?.plusValue !== 10
  || replay.data.player_snapshot[0]?.skills?.[0]?.id !== "SKILL_001"
  || replay.data.player_snapshot[0]?.skills?.[0]?.availableFromRound !== 1
  || !Array.isArray(replay.data.player_snapshot[0]?.skills?.[0]?.effects)
  || replay.data.player_snapshot[0]?.skills?.some((skill) => skill.id === "SKILL_051")) {
  throw new Error("Patrol replay did not snapshot canonical equipment stats and executable skills");
}
const replayRow = client.getStorage("battle_replay_sessions").find((entry) => entry.id === replay.data.replay_session_id);
const resolved = resolveBattle(Number(replayRow.random_seed) || 1, replayRow.tactic_id, 15, replayRow.player_snapshot, replayRow.enemy_snapshot);
if (!["PLAYER", "ENEMY"].includes(resolved.winner)) throw new Error("Server-authoritative patrol replay was not resolved");
const resolvedPatrols = client.getStorage("user_patrols");
const resolvedPatrol = resolvedPatrols.find((entry) => entry.id === patrol.id);
resolvedPatrol.battle_resolved = true;
resolvedPatrol.battle_result = resolved.winner === "PLAYER" ? "VICTORY" : "DEFEAT";
client.setStorage("user_patrols", resolvedPatrols);

const claimed = await executeMockRpc(client, "claim_patrol_rewards", { p_patrol_id: patrol.id });
const claimedPatrol = client.getStorage("user_patrols")[0];
const rewardedUser = client.getStorage("users")[0];
if (claimed.error || claimedPatrol.status !== "COMPLETED" || rewardedUser.cash !== 5250 || claimed.data.cash !== 250 || claimedPatrol.rewards_accrued.cash !== 250 || rewardedUser.xp !== 40) {
  throw new Error("Patrol reward claim did not use authoritative quest rewards");
}

const repeatedClaim = await executeMockRpc(client, "claim_patrol_rewards", { p_patrol_id: patrol.id });
if (!repeatedClaim.error || client.getStorage("presents").length !== 0 || client.getStorage("users")[0].cash !== 5250 || client.getStorage("users")[0].xp !== 40) {
  throw new Error("Repeated patrol reward claim was not rejected before granting rewards");
}

const limitUser = client.getStorage("users")[0];
limitUser.quest_free_skips_count = 5;
limitUser.quest_paid_skips_count = 0;
limitUser.quest_skips_reset_date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
client.setStorage("users", [limitUser]);
const limitPatrol = {
  id: "patrol-cash-limit",
  user_id: userId,
  course_id: "quest-1",
  character_id: "char_reiji_01",
  status: "ONGOING",
  expires_at: new Date(Date.now() + 120_000).toISOString(),
};
client.setStorage("user_patrols", [...client.getStorage("user_patrols"), limitPatrol]);

const freeLimited = await executeMockRpc(client, "complete_patrol_instantly", {
  p_user_id: userId,
  p_patrol_id: limitPatrol.id,
  p_use_currency: "FREE_PREOPEN",
});
if (!freeLimited.error || client.getStorage("users")[0].cash !== 5250) {
  throw new Error("Daily free instant-completion limit was not enforced");
}

const diamondInstant = await executeMockRpc(client, "complete_patrol_instantly", {
  p_user_id: userId,
  p_patrol_id: limitPatrol.id,
  p_use_currency: "DIAMOND",
});
if (diamondInstant.error || client.getStorage("users")[0].neon_diamonds !== 170) {
  throw new Error("DIAMOND instant completion should remain available after the free daily limit at fixed cost 30");
}

console.log("Mock secure patrol verification passed.");
