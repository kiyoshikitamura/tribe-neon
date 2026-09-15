import { CANONICAL_EQUIPMENTS } from "../src/domain/gameplay/canonical/masters.ts";

const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
};

const userId = "equipment-owner";
const characterMasterId = "char_reiji_01";
const exclusiveMaster = CANONICAL_EQUIPMENTS.find((item) => item.category === "WEAPON" && item.exclusive_character_id && item.exclusive_character_id !== characterMasterId);
if (!exclusiveMaster) throw new Error("Canonical exclusive weapon fixture is unavailable");
localStorage.setItem("tribe_demo_uuid", userId);
const { executeMockRpc } = await import("../src/utils/mock/mockRpc.ts");
const client = {
  getStorage: (key) => storage.has(key) ? JSON.parse(storage.get(key)) : [],
  setStorage: (key, value) => storage.set(key, JSON.stringify(value)),
};

client.setStorage("user_characters", [
  { id: "char-owned", user_id: userId, character_id: characterMasterId },
  { id: "char-other", user_id: "other-user", character_id: "char_other" },
]);
client.setStorage("user_equipments", [
  { id: "weapon-1", user_id: userId, equipment_id: "WEAPON_001", equipped_character_id: null, slot_index: null },
  { id: "weapon-2", user_id: userId, equipment_id: "WEAPON_002", equipped_character_id: null, slot_index: null },
  { id: "head-1", user_id: userId, equipment_id: "HEAD_001", equipped_character_id: null, slot_index: null },
  { id: "accessory-1", user_id: userId, equipment_id: "ACCESSORY_001", equipped_character_id: null, slot_index: null },
  { id: "exclusive-1", user_id: userId, equipment_id: exclusiveMaster.equipment_id, equipped_character_id: null, slot_index: null },
  { id: "other-weapon", user_id: "other-user", equipment_id: "WEAPON_001", equipped_character_id: null, slot_index: null },
]);

const single = await executeMockRpc(client, "set_character_equipment", { p_character_id: "char-owned", p_equipment_id: "weapon-1", p_slot_index: 0 });
if (single.error || client.getStorage("user_equipments").find((item) => item.id === "weapon-1").slot_index !== 0) throw new Error("Atomic single equip failed");

const inventoryBeforeRejections = JSON.stringify(client.getStorage("user_equipments"));
const wrongType = await executeMockRpc(client, "set_character_equipment", { p_character_id: "char-owned", p_equipment_id: "head-1", p_slot_index: 1 });
if (wrongType.error?.code !== "23514") throw new Error("Wrong equipment type was not rejected");

const otherOwner = await executeMockRpc(client, "set_character_equipment", { p_character_id: "char-owned", p_equipment_id: "other-weapon", p_slot_index: 1 });
if (otherOwner.error?.code !== "P0002") throw new Error("Other owner's equipment was not rejected");

const exclusive = await executeMockRpc(client, "set_character_equipment", { p_character_id: "char-owned", p_equipment_id: "exclusive-1", p_slot_index: 1 });
if (exclusive.error?.code !== "42501") throw new Error("Exclusive equipment mismatch was not rejected");

if (JSON.stringify(client.getStorage("user_equipments")) !== inventoryBeforeRejections) throw new Error("Rejected equip changed inventory");

const bulk = await executeMockRpc(client, "set_character_equipment_bulk", {
  p_character_id: "char-owned",
  p_equipment_ids: ["weapon-1", "weapon-2", "head-1", "accessory-1"],
  p_slot_indexes: [0, 1, 2, 5],
});
if (bulk.error) throw new Error(`Atomic bulk equip failed: ${bulk.error.message}`);
const loadout = client.getStorage("user_equipments").filter((item) => item.equipped_character_id === "char-owned");
if (loadout.length !== 4 || !loadout.some((item) => item.id === "weapon-2" && item.slot_index === 1)) throw new Error("Canonical seven-slot mapping was not applied");

console.log("Mock secure equipment loadout verification passed.");
