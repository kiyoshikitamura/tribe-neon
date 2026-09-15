import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInventoryQuantityProjection } from "../src/domain/gameplay/inventoryProjection.ts";

const gameContext = readFileSync(new URL("../src/app/context/GameContext.tsx", import.meta.url), "utf8");
const inventoryHook = readFileSync(new URL("../src/app/context/hooks/useInventory.ts", import.meta.url), "utf8");
const characterSystem = readFileSync(new URL("../src/app/components/character/CharacterSystemV2.tsx", import.meta.url), "utf8");

const ownedRows = [
  { item_id: "CHAR_EXP_S", quantity: 11 },
  { item_id: "CHAR_EXP_M", quantity: "7" },
  { item_id: "CHAR_EXP_L", quantity: 3 },
  { item_id: "EQUIP_EXP_S", quantity: 13 },
  { item_id: "EQUIP_EXP_M", quantity: 5 },
  { item_id: "EQUIP_EXP_L", quantity: 2 },
  { item_id: "AWAKENING_BOOK", quantity: 1 },
  { item_id: "SKILL_MANUAL", quantity: 4 },
  { item_id: "EQUIP_LB_PART", quantity: 6 },
];
const projected = buildInventoryQuantityProjection(ownedRows);
assert.deepEqual(projected, {
  ENERGY_DRINK: 0,
  CHAR_EXP_S: 11,
  CHAR_EXP_M: 7,
  CHAR_EXP_L: 3,
  EQUIP_EXP_S: 13,
  EQUIP_EXP_M: 5,
  EQUIP_EXP_L: 2,
  AWAKENING_BOOK: 1,
  SKILL_MANUAL: 4,
  EQUIP_LB_PART: 6,
});
assert.ok(Object.values(buildInventoryQuantityProjection([])).every((quantity) => quantity === 0), "user switch reset must clear every derived quantity");

const resumeStart = gameContext.indexOf("const resumeCurrentSession");
const resumeInventory = gameContext.indexOf("refreshUserItemsProjection(userId)", resumeStart);
const resumeRelease = gameContext.indexOf("setAuthenticatedProjectionOwnerUserId(userId)", resumeStart);
assert.ok(resumeInventory > resumeStart && resumeInventory < resumeRelease, "continue must await inventory before releasing the authenticated shell");

const tutorialProjection = gameContext.indexOf("projectUserItems(ownedItems, session.user.id, tutorialInventoryRequestGeneration)");
assert.ok(tutorialProjection > 0, "tutorial acquisition must project character and equipment materials through the shared authority");
assert.match(gameContext, /resetAuthenticatedProjection[\s\S]*?resetUserItemsProjection\(nextUserId \|\| ""\)/, "auth owner change must synchronously replace the inventory owner and clear every derived quantity");
assert.equal((inventoryHook.match(/refreshUserItemsProjection\(session\.user\.id\)/g) || []).length, 2, "single and bulk present claims must refresh inventory immediately");
assert.match(inventoryHook, /activeInventoryUserIdRef\.current !== ownerUserId/, "stale responses from a previous auth owner must be rejected");
assert.match(inventoryHook, /requestGeneration !== inventoryProjectionGenerationRef\.current/, "older requests for the same owner must be rejected");
assert.match(inventoryHook, /resetUserItemsProjection = useCallback\(\(nextActiveUserId = ""\)[\s\S]*?activeInventoryUserIdRef\.current = nextActiveUserId[\s\S]*?inventoryProjectionGenerationRef\.current \+= 1/, "auth reset must replace the active owner before invalidating requests and clearing state");
assert.match(inventoryHook, /useLayoutEffect\(\(\) => \{[\s\S]*?activeInventoryUserIdRef\.current === activeSessionUserId[\s\S]*?resetUserItemsProjection\(activeSessionUserId\)/, "direct session changes must receive the same synchronous owner reset fallback");
assert.match(gameContext, /const inventoryProjectionPromise = refreshUserItemsProjection\(userId\)/, "bootstrap must reuse one executable inventory promise");
assert.match(gameContext, /beginUserItemsProjectionRequest\(session\.user\.id\)[\s\S]*?projectUserItems\(ownedItems, session\.user\.id, tutorialInventoryRequestGeneration\)/, "tutorial projection must reject a stale response");
assert.match(characterSystem, /inventoryProjectionOwnerUserId === game\.session\.user\.id/, "Growth must not expose false zeroes before the current user's inventory is ready");

console.log("TN-13 inventory projection verification passed.");
