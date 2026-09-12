import { CANONICAL_MISSIONS } from "./masters.ts";
import { canonicalItemName } from "./items.ts";
import type { CanonicalMissionUiStatus } from "./types.ts";

export const CANONICAL_MISSION_REWARD_NAMES: Readonly<Record<string, string>> = Object.freeze({
  CASH: "CASH",
  DIAMOND: "ダイヤ",
  CHAR_EXP_S: canonicalItemName("CHAR_EXP_S"),
  CHAR_EXP_M: canonicalItemName("CHAR_EXP_M"),
  CHAR_EXP_L: canonicalItemName("CHAR_EXP_L"),
  EQUIP_EXP_S: canonicalItemName("EQUIP_EXP_S"),
  EQUIP_EXP_M: canonicalItemName("EQUIP_EXP_M"),
  EQUIP_EXP_L: canonicalItemName("EQUIP_EXP_L"),
  EQUIP_LB_PART: canonicalItemName("EQUIP_LB_PART"),
  SKILL_MANUAL: canonicalItemName("SKILL_MANUAL"),
  NORMAL_GACHA_TICKET_CHARACTER: canonicalItemName("NORMAL_GACHA_TICKET_CHARACTER"),
});

export const CANONICAL_MISSION_REWARD_IDS = Object.freeze(Object.keys(CANONICAL_MISSION_REWARD_NAMES));
export const CANONICAL_MISSION_BY_ID = new Map(CANONICAL_MISSIONS.map((mission) => [mission.id, mission]));

export function canonicalMissionRewardName(rewardItemId: string): string {
  return CANONICAL_MISSION_REWARD_NAMES[rewardItemId] ?? canonicalItemName(rewardItemId);
}

export function canonicalMissionUiStatus(
  serverStatus: unknown,
  prerequisiteClaimed: boolean,
): CanonicalMissionUiStatus {
  if (!prerequisiteClaimed) return "LOCKED";
  if (serverStatus === "CLEAR" || serverStatus === "CLAIMED") return serverStatus;
  return "IN_PROGRESS";
}
