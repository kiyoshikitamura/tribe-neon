import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../src/domain/gameplay/canonical/data/${name}`, import.meta.url), "utf8"));
const quests = await readJson("quests_20260830.json");
const missions = await readJson("missions_20260910.json");
const login = await readJson("login_bonus_20260830.json");
const gacha = await readJson("gacha_production_20260830.json");
const enemies = await readJson("quest_enemy_pools_20260830.json");
const raid = await readJson("raid_production_20260830.json");
const raidRewards = await readJson("raid_rewards_20260830.json");
const sql = await readFile(new URL("../supabase/migrations/20260830000210_canonical_master_freeze_runtime.sql", import.meta.url), "utf8");
const guild = await readJson("guild_production_20260823.json");

assert.deepEqual(guild.creation, { userLevel: 5, cashCost: 500, nameMin: 1, nameMax: 12 });
assert.equal(quests.quests.length, 21);
assert.deepEqual([quests.difficultyContracts.EASY.durationSec,quests.difficultyContracts.NORMAL.durationSec,quests.difficultyContracts.HARD.durationSec],[300,3600,10800]);
assert.deepEqual([quests.difficultyContracts.EASY.vitalityCost,quests.difficultyContracts.NORMAL.vitalityCost,quests.difficultyContracts.HARD.vitalityCost],[3,10,20]);
assert.equal(quests.difficultyContracts.HARD.dailyFirstClearCash,20);
assert.equal(missions.missions.length,48);
assert.equal(missions.missions.filter((mission)=>mission.isEnabled&&mission.preopen).length,41);
assert.deepEqual([...new Set(missions.missions.map((m)=>m.category))].sort(),["DAILY","NORMAL"]);
assert.equal(missions.missions.filter((m)=>m.displayGroup==="PROGRESS").reduce((sum,m)=>sum+m.cashReward,0),2000);
assert.equal(missions.missions.filter((m)=>m.displayGroup!=="PROGRESS").reduce((sum,m)=>sum+m.cashReward,0),5300);
assert.equal(login.rewards.length,30); assert.equal(login.rewards.some((r)=>r.rewardItemId==="CASH"),false);
assert.deepEqual(gacha.gachas.find((g)=>g.id==="CHAR_NORMAL").rates,{N:60,R:30,SR:9,SSR:1});
assert.equal(gacha.gachas.find((g)=>g.id==="CHAR_SPECIAL").pity.pulls,200);
assert.equal(gacha.gachas.find((g)=>g.id==="SKILL_SPECIAL").pity,null);
assert.equal(gacha.gachas.find((g)=>g.id==="EQUIP_SPECIAL").pity,null);
assert.equal(enemies.entries.some((e)=>e.rarity==="SSR"),false);
assert.equal(raid.variants.length,7); assert.equal(raid.respawnSeconds,300);
assert.deepEqual(raid.clearRewardUniqueBoundary,["raidDayKey","userId","CLEAR_REWARD"]);
assert.deepEqual(raidRewards.clear.uniqueBoundary,["raidDayKey","userId","CLEAR_REWARD"]);
for (const required of [
  "primary key(raid_day_key,user_id,reward_type)",
  "FINALIZED_BEFORE_INSTANCE_CLEAR",
  "status='CLEARED'",
  "respawn_after=now()+interval '5 minutes'",
  "ticket_roll boolean not null default false",
  "ticket_item_id text",
  "v_claim.ticket_item_id",
  "v_claim.source_instance_id",
  "if v_inserted then",
  "set ticket_roll=random()<0.30",
  "awakening_roll boolean not null",
  "delivery_status='PENDING'",
  "p_creation_cost<>500",
  "cash=cash-500",
  "resolve_canonical_reward_item(v_mission.reward_item_id)",
  "revoke all on function public.resolve_canonical_reward_item(text)",
  "update public.pvp_match_rewards_master set cash_reward=0",
]) assert.ok(sql.includes(required),`missing migration contract: ${required}`);

const signature = /primary key\(raid_day_key,user_id,reward_type\)/g;
assert.equal([...sql.matchAll(signature)].length >= 1,true);
console.log(JSON.stringify({status:"PASS",quests:21,missions:48,raidVariants:7,raidClearBoundary:"raid_day_key+user_id+CLEAR_REWARD"},null,2));
