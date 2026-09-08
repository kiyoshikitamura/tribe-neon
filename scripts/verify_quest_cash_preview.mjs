import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// 書き込みは固定Previewと、この実行で生成したユーザーのfixtureだけに限定する。
const projectRef = "sufvuqdnqohpfzkwxohq";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, `${projectRef}.supabase.co`, "Preview target required");
assert.equal(process.env.SUPABASE_EXPECTED_PROJECT_REF, projectRef);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const player = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const stranger = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const master = JSON.parse(readFileSync(new URL("../src/domain/gameplay/canonical/data/quests_20260830.json", import.meta.url), "utf8"));
const users = [];
const results = [];
async function data(request) {
  const result = await request;
  if (result.error) throw new Error(`${result.error.code || ""}: ${result.error.message}`);
  return result.data;
}
async function makePlayer(client, prefix) {
  const auth = await data(client.auth.signInAnonymously());
  users.push(auth.user.id);
  await data(client.rpc("initialize_current_player", { p_username: `${prefix}${Date.now().toString(36).slice(-6)}`.slice(0, 8) }));
  return auth.user.id;
}
const state = (id) => data(admin.from("users").select("cash,level,xp,vitality").eq("id", id).single());
const presents = (id) => data(admin.from("presents").select("id,item_id,quantity,message").eq("user_id", id).order("id"));
const missions = (id) => data(admin.from("user_missions").select("mission_id,current_progress,status").eq("user_id", id).order("mission_id"));

try {
  const userId = await makePlayer(player, "QC");
  await makePlayer(stranger, "QF");
  const dbMaster = await data(player.from("canonical_quest_master").select("*").eq("version", master.version));
  assert.equal(dbMaster.length, 21);
  for (const quest of master.quests) {
    const row = dbMaster.find((row) => row.town_id === quest.townId && row.difficulty === quest.difficulty);
    assert.ok(row, quest.questId);
    assert.equal(row.cash_reward, quest.cashReward);
    assert.equal(row.daily_first_clear_cash, 0);
  }
  await data(admin.from("users").update({ cash: 1234, level: 20, xp: 0, vitality: 100, vitality_last_recovered_at: new Date().toISOString() }).eq("id", userId));
  await data(player.rpc("sync_current_missions"));
  const owned = await data(admin.from("user_characters").insert({ user_id: userId, character_id: "char_reiji_01", level: 20, awakening_level: 0 }).select("id,character_id").single());
  const questMissions = await data(admin.from("missions").select("id,target_value").in("trigger_type", ["QUEST_COMPLETE_COUNT", "QUEST_CLEAR_COUNT"]).eq("is_enabled", true));
  assert.ok(questMissions.length > 0, "Quest mission fixtures available");

  const locked = await player.rpc("start_patrol", { p_course_id: "q_shinjuku_2", p_character_id: owned.id });
  assert.ok(locked.error && /locked/.test(locked.error.message), "NORMAL must be locked before EASY clear");

  for (const [index, questId] of ["q_shinjuku_1", "q_shinjuku_2", "q_shinjuku_3", "q_shinjuku_3"].entries()) {
    const quest = dbMaster.find((row) => row.quest_id === questId);
    const beforeStart = await state(userId);
    const started = await data(player.rpc("start_patrol", { p_course_id: questId, p_character_id: owned.id }));
    assert.equal(started.duration_seconds, quest.duration_sec);
    assert.equal(started.cost_vitality, quest.vitality_cost);
    assert.equal((await state(userId)).vitality, beforeStart.vitality - quest.vitality_cost);
    const patrolId = started.patrol_id;
    const snapshot = await data(admin.from("user_patrols").select("encounter_snapshot").eq("id", patrolId).single());
    const members = snapshot.encounter_snapshot.members;
    assert.equal(members.length, quest.difficulty === "EASY" ? 3 : 5);
    assert.equal(new Set(members.map((member) => member.characterId)).size, members.length);
    assert.ok(members.every((member) => member.skills?.length > 0));
    const premature = await player.rpc("claim_patrol_rewards", { p_patrol_id: patrolId });
    assert.ok(premature.error, "Ongoing patrol must not grant CASH");
    // 長時間待機だけを省略し、Encounter生成・Battle解決は通常のRuntimeを実行する。
    await data(admin.from("user_patrols").update({ status: "CLAIMABLE", expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", patrolId).eq("user_id", userId));
    const unresolved = await player.rpc("claim_patrol_rewards", { p_patrol_id: patrolId });
    assert.ok(unresolved.error && /battle must be resolved/.test(unresolved.error.message));
    assert.equal((await state(userId)).cash, beforeStart.cash);
    const replay = await data(player.rpc("create_patrol_battle_replay", { p_patrol_id: patrolId, p_tactic_id: "ATTACK_PRIORITY" }));
    assert.deepEqual(replay.enemy_snapshot, members);
    const battle = await data(player.functions.invoke("resolve-battle", { body: { replaySessionId: replay.replay_session_id } }));
    assert.ok(["PLAYER", "ENEMY"].includes(battle.winner));
    const foreign = await stranger.rpc("claim_patrol_rewards", { p_patrol_id: patrolId });
    assert.ok(foreign.error && /not found/.test(foreign.error.message));
    const before = await state(userId);
    const itemsBefore = await presents(userId);
    const missionsBefore = await missions(userId);
    const attempts = await Promise.all(Array.from({ length: 8 }, () => player.rpc("claim_patrol_rewards", { p_patrol_id: patrolId })));
    const successes = attempts.filter((result) => !result.error);
    assert.equal(successes.length, 1, "Only one concurrent request may succeed");
    assert.ok(attempts.filter((result) => result.error).every((result) => result.error.code === "23505"));
    const reward = successes[0].data;
    const after = await state(userId);
    assert.equal(reward.cash, quest.cash_reward);
    assert.equal(after.cash, before.cash + quest.cash_reward);
    assert.equal(reward.xp, quest.user_exp);
    assert.equal(after.level, before.level, "Lv20 fixture must not level up during this test");
    assert.equal(after.xp, before.xp + quest.user_exp);
    assert.equal(after.vitality, before.vitality);
    assert.equal(reward.first_clear, index !== 3);
    const completed = await data(admin.from("user_patrols").select("status,rewards_accrued,battle_resolved").eq("id", patrolId).single());
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.battle_resolved, true);
    assert.equal(completed.rewards_accrued.cash, reward.cash);
    assert.equal(completed.rewards_accrued.xp, reward.xp);
    assert.deepEqual(completed.rewards_accrued.items, reward.items);
    const itemsAfter = await presents(userId);
    const newItems = itemsAfter.filter((item) => !itemsBefore.some((old) => old.id === item.id));
    const itemKey = (item) => `${item.item_id}:${item.quantity}`;
    assert.deepEqual(newItems.map(itemKey).sort(), reward.items.map(itemKey).sort());
    assert.ok(newItems.length >= (quest.difficulty === "EASY" ? 1 : 2));
    assert.ok(!newItems.some((item) => item.item_id === "CASH"));
    const missionsAfter = await missions(userId);
    let checked = 0;
    for (const previous of missionsBefore) {
      const definition = questMissions.find((mission) => mission.id === previous.mission_id);
      if (!definition || previous.status !== "PROGRESS") continue;
      const current = missionsAfter.find((mission) => mission.mission_id === previous.mission_id);
      assert.equal(current.current_progress, Math.min(definition.target_value, previous.current_progress + 1));
      checked++;
    }
    assert.ok(checked > 0, "At least one Quest mission must advance exactly once");
    const retry = await player.rpc("claim_patrol_rewards", { p_patrol_id: patrolId });
    assert.equal(retry.error?.code, "23505");
    assert.deepEqual(await state(userId), after);
    assert.deepEqual(await presents(userId), itemsAfter);
    assert.deepEqual(await missions(userId), missionsAfter);
    const legacy = await data(admin.from("canonical_daily_activity_claims").select("source_key").eq("user_id", userId).eq("source_key", "QUEST_HARD_FIRST"));
    assert.equal(legacy.length, 0);
    assert.ok(!(await presents(userId)).some((item) => item.message === "HARDクエスト本日初回報酬"));
    results.push({ difficulty: quest.difficulty, cashBefore: before.cash, cashAfter: after.cash, responseCash: reward.cash, accruedCash: completed.rewards_accrued.cash, successfulClaims: 1, rejectedConcurrentClaims: 7, retryRejected: true, xp: reward.xp, missionChecks: checked, battleWinner: battle.winner, legacyHardCash: 0 });
    console.log(`${quest.difficulty} #${index + 1}: PASS (${before.cash} + ${reward.cash} = ${after.cash})`);
  }
} finally {
  for (const id of users.reverse()) {
    await data(admin.from("users").delete().eq("id", id));
    await data(admin.auth.admin.deleteUser(id));
  }
}
const report = { status: "PASS", projectRef, masterRows: 21, results, fixturesDeleted: users.length, checkedAt: new Date().toISOString() };
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/quest-cash-preview.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
