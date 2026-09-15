import assert from "node:assert/strict";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF;
if (!url || !anonKey || !expectedRef) throw new Error("Missing Preview configuration");
assert.equal(new URL(url).hostname.split(".")[0], expectedRef, "Refusing non-Preview target");

const makeUser = async (label) => {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error || new Error(`Failed to create ${label}`);
  const username = `${label}${Date.now().toString(36).slice(-5)}`.slice(0, 8);
  const { error: initError } = await client.rpc("initialize_current_player", { p_username: username });
  if (initError) throw initError;
  return { client, id: data.user.id, username };
};

const qa = await makeUser("GS1");
const tutorial = await makeUser("GT1");
console.log(`QA_FIXTURE_REQUEST=${JSON.stringify({ qaUserId: qa.id, tutorialUserId: tutorial.id })}`);
console.log("Apply Preview-only QA currency/tickets and set qaUser tutorial step COMPLETE, then send CONTINUE.");
process.stdin.resume();
await once(process.stdin, "data");
process.stdin.pause();

const snapshot = async () => {
  const [user, items, skills, equipment, history] = await Promise.all([
    qa.client.from("users").select("cash,neon_diamonds").eq("id", qa.id).single(),
    qa.client.from("user_items").select("item_id,quantity").eq("user_id", qa.id),
    qa.client.from("user_skills").select("skill_card_id,plus_val").eq("user_id", qa.id),
    qa.client.from("user_equipments").select("id,equipment_id").eq("user_id", qa.id),
    qa.client.from("gacha_execution_history").select("request_id,status,result_payload").eq("user_id", qa.id),
  ]);
  for (const result of [user, items, skills, equipment, history]) if (result.error) throw result.error;
  return { user: user.data, items: items.data, skills: skills.data, equipment: equipment.data, history: history.data };
};

const execute = async (client, userId, gachaId, pullCount, currency, requestId = crypto.randomUUID()) => {
  const rpc = gachaId.startsWith("CHAR_") ? "execute_character_gacha" : "execute_asset_gacha";
  const { data, error } = await client.rpc(rpc, {
    p_user_id: userId,
    p_gacha_id: gachaId,
    p_pull_count: pullCount,
    p_currency_type: currency,
    p_request_id: requestId,
  });
  if (error) throw error;
  assert.equal(data?.status, "success");
  assert.equal(data?.results?.length, pullCount);
  return data;
};

const draws = [];
draws.push(await execute(qa.client, qa.id, "CHAR_NORMAL", 1, "cash"));
draws.push(await execute(qa.client, qa.id, "SKILL_NORMAL", 1, "cash"));
draws.push(await execute(qa.client, qa.id, "EQUIP_NORMAL", 10, "cash"));

const retryId = crypto.randomUUID();
const ticketFirst = await execute(qa.client, qa.id, "SKILL_NORMAL", 1, "ticket", retryId);
const beforeReplay = await snapshot();
const ticketReplay = await execute(qa.client, qa.id, "SKILL_NORMAL", 1, "ticket", retryId);
const afterReplay = await snapshot();
assert.deepEqual(ticketReplay, ticketFirst, "same request must return the original payload");
assert.deepEqual(afterReplay, beforeReplay, "same request must not consume or grant twice");
draws.push(ticketFirst);
draws.push(await execute(qa.client, qa.id, "EQUIP_NORMAL", 10, "ticket"));
draws.push(await execute(qa.client, qa.id, "CHAR_NORMAL", 10, "free"));
draws.push(await execute(qa.client, qa.id, "SKILL_NORMAL", 10, "free"));
draws.push(await execute(qa.client, qa.id, "EQUIP_NORMAL", 10, "free"));

const failureId = crypto.randomUUID();
const beforeFailure = await snapshot();
const { error: failure } = await qa.client.rpc("execute_asset_gacha", {
  p_user_id: qa.id,
  p_gacha_id: "SKILL_NORMAL",
  p_pull_count: 10,
  p_currency_type: "ticket",
  p_request_id: failureId,
});
assert.match(failure?.message || "", /insufficient gacha tickets/i);
const afterFailure = await snapshot();
assert.deepEqual(afterFailure, beforeFailure, "failed request must roll back history, cost, and grants");

const allResults = draws.flatMap((draw) => draw.results);
const skillResults = allResults.filter((row) => row.type === "SKILL");
const equipmentResults = allResults.filter((row) => row.type === "EQUIPMENT");
const characterResults = allResults.filter((row) => row.type === "CHARACTER");
const [skillMaster, equipmentMaster, characterMaster, ownedSkills, ownedEquipment, ownedCharacters] = await Promise.all([
  qa.client.from("canonical_skill_master").select("skill_id,rarity").in("skill_id", [...new Set(skillResults.map((row) => row.item_id))]),
  qa.client.from("canonical_equipment_master").select("equipment_id,rarity").in("equipment_id", [...new Set(equipmentResults.map((row) => row.item_id))]),
  qa.client.from("canonical_character_master").select("character_id,rarity").in("character_id", [...new Set(characterResults.map((row) => row.character_id))]),
  qa.client.from("user_skills").select("skill_card_id,plus_val").eq("user_id", qa.id),
  qa.client.from("user_equipments").select("equipment_id").eq("user_id", qa.id),
  qa.client.from("user_characters").select("character_id,awakening_level").eq("user_id", qa.id),
]);
for (const result of [skillMaster,equipmentMaster,characterMaster,ownedSkills,ownedEquipment,ownedCharacters]) if (result.error) throw result.error;
const skillRarity = new Map(skillMaster.data.map((row) => [row.skill_id,row.rarity]));
const equipmentRarity = new Map(equipmentMaster.data.map((row) => [row.equipment_id,row.rarity]));
const characterRarity = new Map(characterMaster.data.map((row) => [row.character_id,row.rarity]));
for (const row of skillResults) assert.equal(row.rarity,skillRarity.get(row.item_id));
for (const row of equipmentResults) assert.equal(row.rarity,equipmentRarity.get(row.item_id));
for (const row of characterResults) assert.equal(row.rarity,characterRarity.get(row.character_id));
assert.ok(skillResults.every((row) => ownedSkills.data.some((owned) => owned.skill_card_id===row.item_id)));
assert.ok(equipmentResults.every((row) => ownedEquipment.data.some((owned) => owned.equipment_id===row.item_id)));
assert.ok(characterResults.every((row) => ownedCharacters.data.some((owned) => owned.character_id===row.character_id)));

const { error: introError } = await tutorial.client.rpc("advance_tutorial_progress", {
  p_expected_step: "WORLD_INTRO", p_next_step: "FREE_GACHA",
});
if (introError) throw introError;
const tutorialRequestId = crypto.randomUUID();
const { data: tutorialDraw, error: tutorialError } = await tutorial.client.rpc("execute_tutorial_character_gacha", {
  p_request_id: tutorialRequestId,
});
if (tutorialError) throw tutorialError;
assert.equal(tutorialDraw.results.length,10);
assert.equal(tutorialDraw.results[9].rarity,"SSR");
const { data: tutorialReplay, error: tutorialReplayError } = await tutorial.client.rpc("execute_tutorial_character_gacha", {
  p_request_id: tutorialRequestId,
});
if (tutorialReplayError) throw tutorialReplayError;
assert.deepEqual(tutorialReplay,tutorialDraw);

const { data: onboarding, error: onboardingError } = await qa.client.rpc("get_current_onboarding_state");
if (onboardingError) throw onboardingError;
assert.equal(onboarding.tutorial_step,"COMPLETE");

console.log(JSON.stringify({
  projectRef: expectedRef,
  qaUserId: qa.id,
  tutorialUserId: tutorial.id,
  normalOnePull: true,
  normalTenPull: true,
  freeCashTicket: true,
  sameRequestReplay: true,
  errorRollback: true,
  canonicalRarityAndOwnership: true,
  tutorialGuaranteedSsrAndReplay: true,
  postTutorialGacha: true,
  resultCounts: { character: characterResults.length, skill: skillResults.length, equipment: equipmentResults.length },
}, null, 2));

await Promise.all([qa.client.auth.signOut(), tutorial.client.auth.signOut()]);
