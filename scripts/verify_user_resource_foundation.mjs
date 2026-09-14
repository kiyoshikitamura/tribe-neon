import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyFrozenUserXp, canUseActionResourceTicket, canUseEnergyDrink, recoverCanonicalResource } from "../src/domain/gameplay/canonical/action_resources.ts";

const levels = JSON.parse(await readFile("src/domain/gameplay/canonical/data/user_level_progression_20260822.json", "utf8"));
const resources = JSON.parse(await readFile("src/domain/gameplay/canonical/data/action_resources_20260914.json", "utf8"));
const activation = JSON.parse(await readFile("src/domain/gameplay/canonical/data/activation_budget_20260822.json", "utf8"));
assert.equal(levels.levels.length, 100);
assert.deepEqual(levels.levels.slice(0, 7).map((row) => row.requiredExp), [100, 150, 200, 250, 300, 350, 400]);
assert.deepEqual(levels.levels[4].unlockKeys, ["GUILD_CREATION"]);
assert.deepEqual(levels.levels[7].unlockKeys, []);
for (const [level, cumulative] of [[8,1750],[10,3050],[20,28050],[30,120550],[50,708050],[75,2712750],[100,6858050]]) {
  assert.equal(levels.levels[level - 1].cumulativeExp, cumulative);
}
for (let level = 8; level < 100; level += 1) {
  const x = level - 8;
  assert.equal(levels.levels[level - 1].requiredExp, Math.floor((600 + 100 * x + 25 * x * x + 24) / 50) * 50);
}
assert.equal(levels.levels[99].requiredExp, 0);
assert.deepEqual(resources.questCosts, { EASY: 3, NORMAL: 10, HARD: 20 });
assert.equal(resources.resources.VITALITY.naturalMax, 50);
assert.equal(resources.resources.VITALITY.hardCap, 500);
assert.equal(resources.resources.VITALITY.recoveryIntervalSeconds, 360);
assert.equal(resources.resources.PVP_POINT.naturalMax, 5);
assert.equal(resources.resources.PVP_POINT.recoveryIntervalSeconds, 7200);
assert.equal(resources.resources.PVP_POINT.practiceCost, 0);
assert.equal(resources.resources.RAID_POINT.naturalMax, 5);
assert.equal(resources.resources.RAID_POINT.recoveryIntervalSeconds, 7200);
assert.equal(resources.resources.RAID_POINT.firstEntryCost, 0);
assert.equal(resources.recoveryItems.ENERGY_DRINK.amount, 50);
assert.equal(resources.recoveryItems.PVP_POINT_TICKET.amount, 1);
assert.equal(resources.recoveryItems.RAID_POINT_TICKET.amount, 1);
assert.equal(resources.authorityGaps.length, 0);

assert.deepEqual(applyFrozenUserXp(1, 0, 1750), { level: 8, xp: 0, leveledUp: true });
assert.deepEqual(applyFrozenUserXp(7, 399, 1), { level: 8, xp: 0, leveledUp: true });
assert.deepEqual(applyFrozenUserXp(8, 0, 1300), { level: 10, xp: 0, leveledUp: true });
assert.deepEqual(applyFrozenUserXp(99, 0, levels.levels[98].requiredExp), { level: 100, xp: 0, leveledUp: true });
assert.deepEqual(applyFrozenUserXp(100, 999, 5000), { level: 100, xp: 0, leveledUp: false });
assert.deepEqual(applyFrozenUserXp(101, 999, 5000), { level: 101, xp: 999, leveledUp: false });
assert.deepEqual(applyFrozenUserXp(1, 0, 99_999_999), { level: 100, xp: 0, leveledUp: true });
assert.deepEqual(recoverCanonicalResource(49, 0, 360_000, "VITALITY"), { value: 50, recovered: 1, lastRecoveredAtMs: 360_000 });
assert.deepEqual(recoverCanonicalResource(120, 0, 3_600_000, "VITALITY"), { value: 120, recovered: 0, lastRecoveredAtMs: 0 });
assert.deepEqual(recoverCanonicalResource(3, 0, 14_400_000, "PVP_POINT"), { value: 5, recovered: 2, lastRecoveredAtMs: 14_400_000 });
assert.deepEqual(recoverCanonicalResource(4, 0, 7_200_000, "RAID_POINT"), { value: 5, recovered: 1, lastRecoveredAtMs: 7_200_000 });
assert.equal(canUseEnergyDrink(450), true);
assert.equal(canUseEnergyDrink(451), false);
assert.equal(canUseActionResourceTicket(4), true);
assert.equal(canUseActionResourceTicket(5), false);

assert.equal(activation.steps.reduce((sum, step) => sum + step.userExp, 0), 1750);
assert.deepEqual(activation.omittedDependencies, ["FRIEND", "FRIEND_HELPER"]);

console.log(JSON.stringify({
  status: "PASS",
  frozenUserLevels: "1-100",
  cumulativeExpToLevel8: 1750,
  cumulativeExpToLevel100: 6858050,
  activationBudget: 1750,
  authorityGaps: [...levels.authorityGaps, ...resources.authorityGaps],
}, null, 2));
