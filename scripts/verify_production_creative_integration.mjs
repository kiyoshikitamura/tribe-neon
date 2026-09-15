import assert from "node:assert/strict";
import {
  PRODUCTION_CREATIVES,
  PRODUCTION_CREATIVE_BY_GACHA_ID,
  resolveAvailableGachaCreative,
  resolveAvailableMyPageCreatives
} from "../src/domain/presentation/production_creatives.ts";

const expectedGachaPaths = {
  CHAR_SPECIAL: "/promotion/gacha_sp_character.png",
  SKILL_SPECIAL: "/promotion/gacha_sp_skill.jpg",
  EQUIP_SPECIAL: "/promotion/gacha_sp_equipment.jpg",
  CHAR_NORMAL: "/promotion/gacha_normal_character.png",
  SKILL_NORMAL: "/promotion/gacha_normal_skill.jpg",
  EQUIP_NORMAL: "/promotion/gacha_normal_equipment.jpg"
};
const expectedMyPagePaths = [
  "/promotion/mypage_banner_quest.webp",
  "/promotion/mypage_banner_battle.webp",
  "/promotion/mypage_banner_ranking.webp",
  "/promotion/mypage_banner_community.webp",
];

assert.equal(PRODUCTION_CREATIVES.length, 10, "Production Creative slot count must be 10");
assert.equal(new Set(PRODUCTION_CREATIVES.map((creative) => creative.id)).size, 10, "Creative IDs must be unique");
assert.equal(new Set(PRODUCTION_CREATIVES.map((creative) => creative.assetPath)).size, 10, "Creative paths must be unique");
assert.ok(PRODUCTION_CREATIVES.every((creative) => creative.enabled), "All frozen slots must be enabled");
assert.ok(PRODUCTION_CREATIVES.filter((creative) => creative.slot.startsWith("GACHA_")).every((creative) => creative.available), "All six delivered Gacha banners must be available");

for (const [gachaId, expectedPath] of Object.entries(expectedGachaPaths)) {
  const slot = PRODUCTION_CREATIVE_BY_GACHA_ID[gachaId];
  const creative = PRODUCTION_CREATIVES.find((candidate) => candidate.slot === slot);
  assert.equal(creative?.assetPath, expectedPath, `${gachaId} path mismatch`);
  assert.deepEqual([creative?.width, creative?.height], [1280, 640], `${gachaId} dimensions mismatch`);
  assert.equal(resolveAvailableGachaCreative(gachaId)?.assetPath, expectedPath, `${gachaId} must resolve its approved banner`);
}

const productionMyPage = resolveAvailableMyPageCreatives();
assert.deepEqual(productionMyPage?.map((creative) => creative.assetPath), expectedMyPagePaths);
assert.deepEqual(productionMyPage?.map((creative) => creative.destination), ["patrol", "pvp", "ranking", "community"]);
assert.ok(productionMyPage?.every((creative) => creative.width === 1200 && creative.height === 200));

const deliveredFixture = PRODUCTION_CREATIVES.map((creative) => ({ ...creative, available: true }));
for (const [gachaId, expectedPath] of Object.entries(expectedGachaPaths)) {
  assert.equal(resolveAvailableGachaCreative(gachaId, deliveredFixture)?.assetPath, expectedPath);
}

const deliveredMyPage = resolveAvailableMyPageCreatives(deliveredFixture);
assert.deepEqual(deliveredMyPage?.map((creative) => creative.assetPath), expectedMyPagePaths);
assert.deepEqual(deliveredMyPage?.map((creative) => creative.order), [1, 2, 3, 4]);
assert.deepEqual(deliveredMyPage?.map((creative) => creative.destination), ["patrol", "pvp", "ranking", "community"]);
assert.ok(deliveredMyPage?.every((creative) => creative.width === 1200 && creative.height === 200));

const partialFixture = deliveredFixture.map((creative) => creative.id === "mypage_banner_community" ? { ...creative, available: false } : creative);
assert.equal(resolveAvailableMyPageCreatives(partialFixture), null, "Partial My Page delivery must not replace fallback");

console.log("Production Creative x10 integration verification PASS");
