import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dailyRoot = resolve(process.env.DAILY_AUTHORITY_ROOT || repositoryRoot);
const missionRoot = resolve(process.env.MISSION_AUTHORITY_ROOT || repositoryRoot);
const read = (root, path) => readFileSync(resolve(root, path), "utf8");

const daily = read(dailyRoot, "supabase/migrations/20260903000234_daily_ranking_reward_authority.sql");
const mission = read(missionRoot, "supabase/migrations/20260903000235_preopen_gvg_preparation_missions.sql");

// Daily Ranking: four categories share the frozen five-band, two-item table.
assert.match(daily, /array\['POWER','GUILD_POWER','PVP','RAID_PERSONAL'\]/);
for (const band of [
  "(1,1,'L'::text,2)", "(2,3,'L',1)", "(4,10,'M',3)",
  "(11,30,'M',2)", "(31,100,'M',1)",
]) assert.ok(daily.includes(band), `Daily reward band missing: ${band}`);
assert.match(daily, /\('CHAR_EXP_'\|\|band\.size\),\('EQUIP_EXP_'\|\|band\.size\)/);
assert.match(daily, /unique \(ranking_day_key,ranking_type,recipient_user_id\)/i,
  "Daily award exactly-once key must be day + type + user");
assert.match(daily, /insert into public\.user_items\(user_id,item_id,quantity\)[\s\S]*?on conflict\(user_id,item_id\) do update/i,
  "Daily rewards must be granted directly to the bag");
assert.match(daily, /participation\.ranking_type='PVP'[\s\S]*?participation\.finalized_count>=1/,
  "Battle Daily must require one finalized battle");
assert.match(daily, /participation\.ranking_type='RAID_PERSONAL'[\s\S]*?participation\.finalized_count>=1/,
  "Raid Daily must require one finalized raid");
assert.match(daily, /sum\(log\.raw_damage\)[\s\S]*?join public\.raid_damage_logs log/,
  "Raid Daily must aggregate authoritative damage logs");
assert.doesNotMatch(daily, /raid_damage_logs log[\s\S]{0,500}(?:base_id|location_id)\s*=/,
  "Raid Daily must not restrict aggregation to one location");
assert.match(daily, /create table if not exists public\.ranking_daily_activity_snapshots/,
  "Power and Guild Daily must persist closed-day-safe activity inputs");
assert.match(daily, /with active_members as \([\s\S]*?ranking_daily_activity_snapshots[\s\S]*?ranking_day_key=v_day[\s\S]*?guild_id is not null/,
  "Guild Daily must use active members and cutoff guild membership from the daily snapshot");
const finalizeBlock = daily.match(/create or replace function public\.finalize_daily_ranking_rewards[\s\S]*?\n\$\$;/i)?.[0] || "";
assert.doesNotMatch(finalizeBlock, /calculate_user_total_power|player\.last_active_at/,
  "Delayed Daily finalization must not read mutable current power or activity");
assert.match(daily, /cron\.schedule\('daily-ranking-reward-finalize-jst-midnight','0 15 \* \* \*'/,
  "Daily finalize must run at JST 00:00 / UTC 15:00");
assert.match(daily, /period_kind,period_key[\s\S]*?'DAILY',p_ranking_day_key::text[\s\S]*?on conflict\(recipient_user_id,period_kind,period_key\)/,
  "same-day multi-category notices must aggregate under one notification");

// SPECIAL Mission: generic event authority, exact window, 12 + COMPLETE, and
// the frozen reward bundle. Claimability deliberately has no deadline.
for (const contract of [
  "create table if not exists public.mission_events",
  "add column if not exists event_id text references public.mission_events(id)",
  "category in ('DAILY', 'NORMAL', 'SPECIAL')",
  "create table if not exists public.mission_reward_components",
  "create or replace function public.get_active_mission_events()",
  "create or replace function public.get_pending_mission_event_dialog()",
  "create or replace function public.mark_mission_event_dialog_viewed(p_event_id text,p_jst_date date)",
]) assert.ok(mission.includes(contract), `SPECIAL mission contract missing: ${contract}`);
assert.match(mission, /'2026-09-04 00:00:00 Asia\/Tokyo'::timestamptz/);
assert.match(mission, /'2026-09-08 00:00:00 Asia\/Tokyo'::timestamptz/);
assert.match(mission, /'GVG_PREP_20260904'[\s\S]*?null, 'Asia\/Tokyo'/,
  "SPECIAL mission claims must have no deadline");

const missionIds = [...mission.matchAll(/"id":"(GVG_PREP_(?:\d{2}|COMPLETE))"/g)].map((match) => match[1]);
assert.deepEqual(missionIds, [
  "GVG_PREP_01", "GVG_PREP_02", "GVG_PREP_03", "GVG_PREP_04",
  "GVG_PREP_05", "GVG_PREP_06", "GVG_PREP_07", "GVG_PREP_08",
  "GVG_PREP_09", "GVG_PREP_10", "GVG_PREP_11", "GVG_PREP_12",
  "GVG_PREP_COMPLETE",
]);
assert.match(mission, /"id":"GVG_PREP_COMPLETE"[\s\S]*?"target_value":12/);
assert.match(mission, /"id":"GVG_PREP_07"[\s\S]*?"shared_counter":"QUEST_CLEAR_COUNT"/);
assert.match(mission, /"id":"GVG_PREP_08"[\s\S]*?"shared_counter":"QUEST_CLEAR_COUNT"/);
assert.match(mission, /m\.category <> 'SPECIAL'[\s\S]*?clock_timestamp\(\) >= event\.start_at[\s\S]*?clock_timestamp\(\) < event\.progress_end_at/,
  "SPECIAL progress must use an inclusive start and exclusive end");
assert.match(mission, /status in \('CLEAR', 'CLAIMED'\)[\s\S]*?trigger_type = 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'/,
  "COMPLETE must count achieved normal missions, not reward claims or itself");
assert.match(mission, /insert into public\.mission_event_dialog_views[\s\S]*?on conflict do nothing/,
  "daily event dialog view acknowledgement must be idempotent");
assert.match(mission, /perform public\.grant_present_payload\(p_user_id,v_item_id,v_component\.quantity\)/,
  "mission bundle items must use the existing direct grant authority");

const componentsBlock = mission.match(/insert into public\.mission_reward_components\(mission_id, reward_order, item_id, quantity\)\s*values([\s\S]*?);/i)?.[1];
assert.ok(componentsBlock, "mission reward component seed is missing");
const totals = new Map();
for (const match of componentsBlock.matchAll(/\('GVG_PREP_(?:\d{2}|COMPLETE)',\d+,'([^']+)',(\d+)\)/g)) {
  totals.set(match[1], (totals.get(match[1]) || 0) + Number(match[2]));
}
assert.deepEqual(Object.fromEntries([...totals.entries()].sort()), {
  AWAKENING_BOOK: 1,
  CHAR_EXP_L: 7,
  ENERGY_DRINK: 2,
  EQUIP_EXP_L: 5,
  EQUIP_LB_PART: 8,
  PVP_POINT_TICKET: 2,
  RAID_POINT_TICKET: 2,
  SKILL_MANUAL: 8,
  SPECIAL_TICKET_CHARACTER: 1,
  SPECIAL_TICKET_EQUIPMENT: 1,
  SPECIAL_TICKET_SKILL: 1,
});
const cashTotal = [...mission.matchAll(/"id":"GVG_PREP_(?:\d{2}|COMPLETE)"[^\n]*?"cash_reward":(\d+)/g)]
  .reduce((sum, match) => sum + Number(match[1]), 0);
assert.equal(cashTotal, 1000);

console.log(JSON.stringify({
  status: "PASS",
  dailyRanking: { categories: 4, bands: 5, directBag: true, exactlyOnce: true },
  specialMission: { normal: 12, complete: 1, cash: cashTotal, claimDeadline: null },
}, null, 2));
