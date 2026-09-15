import assert from "node:assert/strict";
import { calculateCommunityContinuity, calculateFormalOpenStatus, calculateFormalRetention } from "../src/utils/kpiFormalOpen.ts";

const day = (number, numerator, denominator, incomplete = false) => ({
  day: number, numerator: incomplete ? null : numerator, denominator: incomplete ? null : denominator,
  observation_status: incomplete ? "incomplete" : "complete",
});
const cohort = (date, size, retained) => ({
  cohort_date: date, game_start_uu: size,
  days: [1, 2, 3, 4, 5].map((number) => day(number, retained[number - 1], size)),
});

const passing = [
  cohort("2026-08-20", 10, [4, 3, 3, 3, 3]),
  cohort("2026-08-21", 20, [8, 6, 6, 5, 5]),
  cohort("2026-08-22", 70, [28, 21, 19, 17, 15]),
];
assert.deepEqual(calculateFormalRetention(passing).map((item) => item.status), ["PASS", "PASS", "PASS", "PASS", "PASS"]);
assert.equal(calculateFormalRetention(passing.slice(0, 2))[0].status, "NOT_READY");

const weighted = calculateFormalRetention([
  cohort("2026-08-20", 1, [1, 1, 1, 1, 1]),
  cohort("2026-08-21", 1, [1, 1, 1, 1, 1]),
  cohort("2026-08-22", 98, [0, 0, 0, 0, 0]),
])[0];
assert.equal(weighted.value, 0.02);
assert.equal(weighted.status, "FAIL");
assert.notEqual(weighted.value, (1 + 1 + 0) / 3, "rates must not be averaged");

const communityPass = calculateCommunityContinuity([
  { date: "2026-09-03", effective_active_guild_count: 18 },
  { date: "2026-09-04", effective_active_guild_count: 18 },
  { date: "2026-09-05", effective_active_guild_count: 18 },
], "2026-09-06", "2026-09-06");
assert.equal(communityPass.status, "PASS");
assert.equal(communityPass.current_consecutive_days, 3);
assert.equal(calculateCommunityContinuity([
  { date: "2026-09-03", effective_active_guild_count: 18 },
  { date: "2026-09-04", effective_active_guild_count: 17 },
  { date: "2026-09-05", effective_active_guild_count: 18 },
], "2026-09-06", "2026-09-06").status, "FAIL");
assert.equal(calculateCommunityContinuity([
  { date: "2026-09-04", effective_active_guild_count: 18 },
  { date: "2026-09-05", effective_active_guild_count: 18 },
], "2026-09-06", "2026-09-06").status, "NOT_READY");
assert.equal(calculateCommunityContinuity([
  { date: "2026-09-04", effective_active_guild_count: 18 },
  { date: "2026-09-05", effective_active_guild_count: 18 },
  { date: "2026-09-06", effective_active_guild_count: 0 },
], "2026-09-06", "2026-09-06").status, "NOT_READY", "future/current day must not be zero-filled");

const allPass = { marketing: "PASS", acquisition: "PASS", tutorial: "PASS", guild_chat_activation: "PASS", d1: "PASS", d2: "PASS", d3: "PASS", d4: "PASS", d5: "PASS", community: "PASS" };
assert.equal(calculateFormalOpenStatus(allPass).status, "GO");
assert.equal(calculateFormalOpenStatus({ ...allPass, d3: "FAIL" }).status, "FAIL");
assert.equal(calculateFormalOpenStatus({ ...allPass, d3: "NOT_READY", d2: "FAIL" }).status, "NOT_READY");

console.log("KPI Formal Open canonical contract: PASS");
