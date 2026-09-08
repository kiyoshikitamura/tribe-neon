import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF;
if (!url || !anonKey || !serviceKey || !expectedRef) throw new Error("Missing Preview configuration");
if (new URL(url).hostname.split(".")[0] !== expectedRef || expectedRef !== "sufvuqdnqohpfzkwxohq") {
  throw new Error("Refusing non-Preview Supabase target");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [];
const raids = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const uniqueName = (prefix) => `${prefix}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 8);

async function makePlayer(prefix) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.signInAnonymously();
  if (authError || !auth.user) throw authError || new Error("Anonymous auth failed");
  users.push(auth.user.id);
  const { error: initError } = await client.rpc("initialize_current_player", { p_username: uniqueName(prefix) });
  if (initError) throw initError;
  return { client, id: auth.user.id };
}

async function setUser(id, values) {
  const { error } = await admin.from("users").update(values).eq("id", id);
  if (error) throw error;
}

async function addCharacters(userId, characterIds) {
  const { data, error } = await admin.from("user_characters").insert(
    characterIds.map((characterId) => ({ user_id: userId, character_id: characterId, level: 20, awakening_level: 0 })),
  ).select("id,character_id");
  if (error) throw error;
  return data;
}

async function guildAcceptance() {
  const lowLevel = await makePlayer("GL");
  await setUser(lowLevel.id, { level: 4, cash: 500 });
  const lowResult = await lowLevel.client.rpc("create_guild_v2", {
    p_user_id: lowLevel.id, p_guild_name: uniqueName("GL"), p_creation_cost: 500,
  });
  assert(lowResult.error, "Lv<5 guild creation unexpectedly succeeded");

  const lowCash = await makePlayer("GC");
  await setUser(lowCash.id, { level: 5, cash: 499 });
  const cashResult = await lowCash.client.rpc("create_guild_v2", {
    p_user_id: lowCash.id, p_guild_name: uniqueName("GC"), p_creation_cost: 500,
  });
  assert(cashResult.error, "CASH 499 guild creation unexpectedly succeeded");

  const exact = await makePlayer("GE");
  await setUser(exact.id, { level: 5, cash: 500 });
  const guildName = uniqueName("GE");
  const first = await exact.client.rpc("create_guild_v2", {
    p_user_id: exact.id, p_guild_name: guildName, p_creation_cost: 500,
  });
  if (first.error) throw first.error;
  const retry = await exact.client.rpc("create_guild_v2", {
    p_user_id: exact.id, p_guild_name: guildName, p_creation_cost: 500,
  });
  assert(retry.error, "Guild create retry unexpectedly succeeded");
  const [{ data: user }, { count: guildCount }, { count: memberCount }] = await Promise.all([
    admin.from("users").select("cash,guild_id").eq("id", exact.id).single(),
    admin.from("guilds").select("id", { count: "exact", head: true }).eq("leader_id", exact.id),
    admin.from("guild_members").select("user_id", { count: "exact", head: true }).eq("user_id", exact.id),
  ]);
  assert(user.cash === 0 && guildCount === 1 && memberCount === 1, "Guild exactly-once state mismatch");
  return "PASS";
}

async function questAcceptance() {
  const player = await makePlayer("QA");
  await setUser(player.id, { level: 20, vitality: 100 });
  const owned = await addCharacters(player.id, [
    "char_reiji_01", "char_mio_01", "char_takuro_01", "char_leon_01", "char_kageyama_01",
  ]);
  const signatures = [];
  let parityPatrol = null;
  for (const character of owned) {
    const started = await player.client.rpc("start_patrol", {
      p_course_id: "q_shinjuku_1", p_character_id: character.id,
    });
    if (started.error) throw started.error;
    const { data: patrol, error } = await admin.from("user_patrols")
      .select("id,encounter_snapshot,encounter_party_signature")
      .eq("id", started.data.patrol_id).single();
    if (error) throw error;
    const members = patrol.encounter_snapshot?.members || [];
    assert(members.length === 3, "EASY encounter member count mismatch");
    assert(new Set(members.map((member) => member.characterId)).size === 3, "Encounter contains duplicate character");
    assert(members.filter((member) => member.rarity === "N").length === 2, "EASY N rarity template mismatch");
    assert(members.filter((member) => member.rarity === "R").length === 1, "EASY R rarity template mismatch");
    assert(members.every((member) => Array.isArray(member.skills) && member.skills.length >= 1), "Encounter skill loadout missing");
    signatures.push(patrol.encounter_party_signature);
    parityPatrol ||= patrol;
  }
  assert(signatures.every((value, index) => index === 0 || value !== signatures[index - 1]), "Immediate party signature repeated");
  assert(new Set(signatures).size > 1, "Random encounter produced no variation");

  await admin.from("user_patrols").update({ status: "CLAIMABLE", expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", parityPatrol.id);
  const replay = await player.client.rpc("create_patrol_battle_replay", {
    p_patrol_id: parityPatrol.id, p_tactic_id: "ATTACK_PRIORITY",
  });
  if (replay.error) throw replay.error;
  assert(JSON.stringify(replay.data.enemy_snapshot) === JSON.stringify(parityPatrol.encounter_snapshot.members),
    "New Quest UI/snapshot/replay enemy parity mismatch");

  await admin.from("user_quest_first_clears").upsert([
    { user_id: player.id, quest_id: "q_shinjuku_1" },
    { user_id: player.id, quest_id: "q_shinjuku_2" },
  ]);
  const hardCharacters = owned.slice(1, 3);
  for (const character of hardCharacters) {
    await admin.from("user_patrols").update({ status: "COMPLETED" }).eq("user_id", player.id).eq("character_id", character.character_id);
    const started = await player.client.rpc("start_patrol", {
      p_course_id: "q_shinjuku_3", p_character_id: character.id,
    });
    if (started.error) throw started.error;
    await admin.from("user_patrols").update({
      status: "CLAIMABLE", battle_resolved: true, expires_at: new Date(Date.now() - 1000).toISOString(),
    }).eq("id", started.data.patrol_id);
    const claimed = await player.client.rpc("claim_patrol_rewards", { p_patrol_id: started.data.patrol_id });
    if (claimed.error) throw claimed.error;
    const retry = await player.client.rpc("claim_patrol_rewards", { p_patrol_id: started.data.patrol_id });
    assert(retry.error, "Quest reward retry unexpectedly succeeded");
  }
  const { data: hardClaims } = await admin.from("canonical_daily_activity_claims")
    .select("source_key,reward_payload").eq("user_id", player.id).eq("source_key", "QUEST_HARD_FIRST");
  const { data: hardCash } = await admin.from("presents").select("quantity")
    .eq("user_id", player.id).eq("item_id", "CASH").eq("message", "HARDクエスト本日初回報酬");
  assert(hardClaims.length === 0 && hardCash.length === 0,
    "Retired HARD daily CASH grant was issued");
  return "PASS";
}

async function missionAndLoginAcceptance() {
  const player = await makePlayer("MA");
  await player.client.rpc("sync_current_missions");
  const { data: mission } = await admin.from("user_missions").select("id")
    .eq("user_id", player.id).eq("mission_id", "MIS_N_P001").single();
  await admin.from("user_missions").update({ current_progress: 1, progress_val: 1, status: "CLEAR" }).eq("id", mission.id);
  const results = await Promise.all([
    player.client.rpc("claim_mission_reward", { p_mission_id: "MIS_N_P001" }),
    player.client.rpc("claim_mission_reward", { p_mission_id: "MIS_N_P001" }),
  ]);
  assert(results.filter((result) => !result.error).length === 1, "Concurrent Mission claim was not exactly-once");
  const { data: receipts } = await admin.from("presents").select("item_id,quantity")
    .eq("user_id", player.id).eq("message", "ミッション報酬: キャラクターを1回強化");
  assert(receipts.length === 2
    && receipts.some((row) => row.item_id === "CHAR_EXP_M" && row.quantity === 2)
    && receipts.some((row) => row.item_id === "CASH" && row.quantity === 100), "Mission receipt mismatch");

  const firstLogin = await player.client.rpc("process_login_bonus");
  const secondLogin = await player.client.rpc("process_login_bonus");
  if (firstLogin.error) throw firstLogin.error;
  assert(!secondLogin.error, "Login idempotent retry returned an authority error");
  const { data: loginState } = await admin.from("user_login_bonuses").select("current_day,last_claimed_at")
    .eq("user_id", player.id).single();
  assert(loginState.current_day >= 1 && loginState.current_day <= 30 && loginState.last_claimed_at,
    "Login 30-day state mismatch");
  return "PASS";
}

async function existingPatrolParity() {
  const { data: patrols, error } = await admin.from("user_patrols")
    .select("id,encounter_snapshot").eq("has_battle_event", true).eq("battle_resolved", false);
  if (error) throw error;
  let replayCount = 0;
  for (const patrol of patrols) {
    assert(patrol.encounter_snapshot?.members?.length > 0, `Missing preserved snapshot ${patrol.id}`);
    const { data: replays } = await admin.from("battle_replay_sessions")
      .select("enemy_snapshot").eq("source_reference_id", patrol.id).eq("battle_mode", "QUEST");
    for (const replay of replays) {
      replayCount += 1;
      assert(JSON.stringify(replay.enemy_snapshot) === JSON.stringify(patrol.encounter_snapshot.members),
        `Preserved Patrol replay parity mismatch ${patrol.id}`);
    }
  }
  assert(replayCount >= 1, "No existing Patrol replay available for parity acceptance");
  return "PASS";
}

async function rlsAcceptance() {
  const player = await makePlayer("RA");
  await setUser(player.id, { level: 5, cash: 321 });
  const owned = await addCharacters(player.id, ["char_reiji_01"]);
  const started = await player.client.rpc("start_patrol", { p_course_id: "q_shinjuku_1", p_character_id: owned[0].id });
  if (started.error) throw started.error;
  const { data: activeRaid } = await admin.from("raid_bosses").select("id,current_hp").eq("status", "ACTIVE").limit(1).single();
  const attempts = await Promise.all([
    player.client.from("users").update({ cash: 999999 }).eq("id", player.id),
    player.client.from("user_patrols").update({ encounter_snapshot: { forged: true } }).eq("id", started.data.patrol_id),
    player.client.from("raid_bosses").update({ current_hp: 0 }).eq("id", activeRaid.id),
    player.client.from("raid_clear_reward_claims").insert({
      raid_day_key: "forged", user_id: player.id, reward_type: "CLEAR_REWARD", source_instance_id: activeRaid.id,
    }),
  ]);
  const [{ data: user }, { data: patrol }, { data: raid }] = await Promise.all([
    admin.from("users").select("cash").eq("id", player.id).single(),
    admin.from("user_patrols").select("encounter_snapshot").eq("id", started.data.patrol_id).single(),
    admin.from("raid_bosses").select("current_hp").eq("id", activeRaid.id).single(),
  ]);
  assert(user.cash === 321 && !patrol.encounter_snapshot?.forged && raid.current_hp === activeRaid.current_hp,
    "RLS allowed an authoritative state mutation");
  assert(attempts[3].error, "RLS allowed a forged Raid clear claim");
  return "PASS";
}

try {
  const checks = {
    guildCreation: await guildAcceptance(),
    questEnemyCashParity: await questAcceptance(),
    missionLoginExactlyOnce: await missionAndLoginAcceptance(),
    existingPatrolParity: await existingPatrolParity(),
    rlsAuthority: await rlsAcceptance(),
  };
  console.log(JSON.stringify({ projectRef: expectedRef, status: "PASS", checks }, null, 2));
} finally {
  for (const userId of users.reverse()) {
    await admin.from("guilds").delete().eq("leader_id", userId);
    const { error: publicDeleteError } = await admin.from("users").delete().eq("id", userId);
    if (publicDeleteError) console.error(`Fixture public user cleanup failed: ${userId}`);
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError && authDeleteError.status !== 404) console.error(`Fixture auth cleanup failed: ${userId}`);
  }
  for (const raidId of raids.reverse()) await admin.from("raid_bosses").delete().eq("id", raidId);
}
