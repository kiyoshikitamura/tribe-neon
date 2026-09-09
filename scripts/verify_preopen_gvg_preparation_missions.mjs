import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260903000235_preopen_gvg_preparation_missions.sql",
  import.meta.url,
);
const sql = (await readFile(migrationUrl, "utf8")).replace(/\r\n/g, "\n");

const missionBlock = sql.match(
  /from jsonb_to_recordset\(\$missions\$(.*?)\$missions\$::jsonb\)/s,
);
assert.ok(missionBlock, "mission master payload is missing");
const missions = JSON.parse(missionBlock[1]);
assert.equal(missions.length, 13, "event must contain 12 missions plus complete");
assert.deepEqual(
  missions.map(({ id }) => id),
  [
    ...Array.from({ length: 12 }, (_, index) =>
      `GVG_PREP_${String(index + 1).padStart(2, "0")}`,
    ),
    "GVG_PREP_COMPLETE",
  ],
);
assert.equal(
  missions.reduce((total, mission) => total + mission.cash_reward, 0),
  1_000,
  "event CASH total must match the workbook",
);

const componentBlock = sql.match(
  /insert into public\.mission_reward_components.*?values\n(.*?);\n\ncreate or replace function/s,
);
assert.ok(componentBlock, "mission reward component seed is missing");
const components = Array.from(
  componentBlock[1].matchAll(/\('([^']+)',(\d+),'([^']+)',(\d+)\)/g),
  ([, missionId, order, itemId, quantity]) => ({
    missionId,
    order: Number(order),
    itemId,
    quantity: Number(quantity),
  }),
);
const totals = Object.fromEntries(
  Object.entries(
    components.reduce((result, { itemId, quantity }) => {
      result[itemId] = (result[itemId] ?? 0) + quantity;
      return result;
    }, {}),
  ).sort(([left], [right]) => left.localeCompare(right)),
);
assert.deepEqual(totals, {
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
assert.ok(
  components.some(
    ({ missionId, order, itemId, quantity }) =>
      missionId === "GVG_PREP_COMPLETE" &&
      order === 4 &&
      itemId === "EQUIP_LB_PART" &&
      quantity === 2,
  ),
  "complete mission fourth reward must be EQUIP_LB_PART x2",
);

for (const contract of [
  "'2026-09-04 00:00:00 Asia/Tokyo'::timestamptz",
  "'2026-09-08 00:00:00 Asia/Tokyo'::timestamptz",
  "category in ('DAILY', 'NORMAL', 'SPECIAL')",
  "clock_timestamp() >= event.start_at",
  "clock_timestamp() < event.progress_end_at",
  "grant_mission_reward_bundle",
  "ranking_successful_view_special_mission_trigger",
  "main_formation_special_mission_change_trigger",
  "get_pending_mission_event_dialog",
  "mark_mission_event_dialog_viewed",
  "'progress_open',clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at",
]) {
  assert.ok(sql.includes(contract), `missing contract: ${contract}`);
}

const questMissions = missions.filter(({ id }) =>
  ["GVG_PREP_07", "GVG_PREP_08"].includes(id),
);
assert.deepEqual(
  questMissions.map(({ trigger_type, target_value }) => ({
    trigger_type,
    target_value,
  })),
  [
    { trigger_type: "QUEST_CLEAR_COUNT", target_value: 5 },
    { trigger_type: "QUEST_CLEAR_COUNT", target_value: 10 },
  ],
);

console.log(
  "Pre-open Guild Battle preparation mission verification: PASS (13 missions, exact rewards, JST window, authority hooks).",
);
