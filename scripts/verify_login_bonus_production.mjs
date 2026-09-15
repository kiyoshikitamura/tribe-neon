import assert from "node:assert/strict";
import fs from "node:fs";

const items = JSON.parse(fs.readFileSync("src/domain/gameplay/canonical/data/items_20260822.json", "utf8")).items;
const master = JSON.parse(fs.readFileSync("src/domain/gameplay/canonical/data/login_bonus_20260830.json", "utf8"));
const itemById = new Map(items.map((item) => [item.id, item]));
const legacyIds = new Set(["LAW_OF_STRIFE", "ITEM_STAMINA_01", "ITEM_EXP_DRINK", "TRAINING_MANUAL", "EXCLUSIVE_CONTRACT", "EQUIP_LB_HAMMER", "SKILL_LB_BOOK", "NORMAL_GACHA_TICKET"]);

assert.equal(master.cycleDays, 30);
assert.equal(master.timezone, "Asia/Tokyo");
assert.equal(master.rewards.length, 30);
assert.deepEqual(master.rewards.map((reward) => reward.day), Array.from({ length: 30 }, (_, index) => index + 1));
assert.equal(master.rewards.filter((reward) => legacyIds.has(reward.rewardItemId)).length, 0);
assert.ok(master.rewards.every((reward) => ["CASH", "DIAMOND"].includes(reward.rewardItemId) || itemById.has(reward.rewardItemId)));
assert.equal(master.cashTotal, 0);
assert.equal(master.rewards.filter((reward) => reward.rewardItemId === "CASH").length, 0);

const aggregate = {};
for (const reward of master.rewards) {
  const effectValue = Number(itemById.get(reward.rewardItemId)?.runtimeUsage?.effectValue || 0);
  if (["CASH", "DIAMOND", "SKILL_MANUAL", "EQUIP_LB_PART", "ENERGY_DRINK", "AWAKENING_BOOK"].includes(reward.rewardItemId)) aggregate[reward.rewardItemId] = (aggregate[reward.rewardItemId] || 0) + reward.rewardQty;
  if (reward.rewardItemId.startsWith("SPECIAL_TICKET_")) {
    aggregate[reward.rewardItemId] = (aggregate[reward.rewardItemId] || 0) + reward.rewardQty;
    aggregate.SPECIAL_TICKET = (aggregate.SPECIAL_TICKET || 0) + reward.rewardQty;
  }
  if (reward.rewardItemId.startsWith("CHAR_EXP_")) aggregate.CHARACTER_EXP = (aggregate.CHARACTER_EXP || 0) + reward.rewardQty * effectValue;
  if (reward.rewardItemId.startsWith("EQUIP_EXP_")) aggregate.EQUIPMENT_EXP = (aggregate.EQUIPMENT_EXP || 0) + reward.rewardQty * effectValue;
}
console.log(`Login Bonus Production verification PASS: ${master.rewards.length} days, CASH ${master.cashTotal}, aggregate ${JSON.stringify(aggregate)}.`);
