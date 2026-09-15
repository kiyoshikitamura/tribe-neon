import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260911100100_normalize_gacha_stage1.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/manual/20260911_gacha_stage1_rollback.sql",
  "utf8",
);

const expectedEquipment = {
  normal: [
    "WEAPON_009", "WEAPON_010",
    "ACCESSORY_011", "HEAD_005", "LEGS_005",
    "ACCESSORY_026", "BODY_014", "BODY_015", "HEAD_011", "LEGS_011",
    "ACCESSORY_042", "ACCESSORY_043", "ACCESSORY_044", "ACCESSORY_045", "WEAPON_041", "WEAPON_042",
  ],
  specialReclassify: [
    "ACCESSORY_026", "BODY_014", "BODY_015", "HEAD_011", "LEGS_011",
    "ACCESSORY_042", "ACCESSORY_043", "ACCESSORY_044", "ACCESSORY_045", "WEAPON_041", "WEAPON_042",
    "BODY_023", "BODY_024", "HEAD_017", "LEGS_017",
  ],
  specialRemove: ["ACCESSORY_011", "HEAD_005", "LEGS_005", "ACCESSORY_051", "LEGS_021"],
};

assert.match(migration, /skill_id between 'SKILL_036' and 'SKILL_050'/);
assert.match(rollback, /item_id between 'SKILL_036' and 'SKILL_050'/);
assert.match(migration, /rarity='SSR'\s+and exclusive_character_id is null/);

for (const itemId of [...expectedEquipment.normal, ...expectedEquipment.specialReclassify, ...expectedEquipment.specialRemove]) {
  assert.ok(migration.includes(`'${itemId}'`), `migration is missing ${itemId}`);
  assert.ok(rollback.includes(`'${itemId}'`), `rollback is missing ${itemId}`);
}

assert.equal(new Set(expectedEquipment.normal).size, 16);
assert.equal(new Set(expectedEquipment.specialReclassify).size, 15);
assert.equal(new Set(expectedEquipment.specialRemove).size, 5);

const statementsWithoutComments = migration.replace(/^--.*$/gm, "").toLowerCase();
for (const forbidden of [
  "update public.gacha_rarity_rates",
  "insert into public.gacha_rarity_rates",
  "delete from public.gacha_rarity_rates",
  "update public.canonical_skill_master",
  "update public.canonical_equipment_master",
  "user_skills",
  "user_equipments",
  "update public.feature_operating_states",
  "create or replace function",
]) {
  assert.ok(!statementsWithoutComments.includes(forbidden), `out-of-scope mutation found: ${forbidden}`);
}

assert.match(migration, /^begin;/m);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /GACHA_STAGE1_POOL_DRIFT/);
assert.match(migration, /GACHA_STAGE1_RATE_DRIFT/);
assert.match(migration, /GACHA_STAGE1_POST_CANONICAL_MISMATCH/);
assert.match(migration, /GACHA_STAGE1_REACHABLE_BUCKET_EMPTY/);

console.log("PASS gacha Stage 1 normalization contract");
