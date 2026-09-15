export const PRODUCTION_CREATIVE_STATUS = "MY PAGE + GACHA DELIVERED" as const;

export type CanonicalGachaId =
  | "CHAR_SPECIAL"
  | "SKILL_SPECIAL"
  | "EQUIP_SPECIAL"
  | "CHAR_NORMAL"
  | "SKILL_NORMAL"
  | "EQUIP_NORMAL";

export type ProductionCreativeSlot =
  | "GACHA_SP_CHARACTER"
  | "GACHA_SP_SKILL"
  | "GACHA_SP_EQUIPMENT"
  | "GACHA_NORMAL_CHARACTER"
  | "GACHA_NORMAL_SKILL"
  | "GACHA_NORMAL_EQUIPMENT"
  | "MYPAGE_BANNER_01"
  | "MYPAGE_BANNER_02"
  | "MYPAGE_BANNER_03"
  | "MYPAGE_BANNER_04";

export type ProductionCreative = Readonly<{
  id: string;
  slot: ProductionCreativeSlot;
  assetPath: string;
  destination: string | null;
  order: number | null;
  enabled: boolean;
  available: boolean;
  width: number;
  height: number;
}>;

export const PRODUCTION_CREATIVES = [
  { id: "gacha_sp_character", slot: "GACHA_SP_CHARACTER", assetPath: "/promotion/gacha_sp_character.png", destination: null, order: null, enabled: true, available: true, width: 1280, height: 640 },
  { id: "gacha_sp_skill", slot: "GACHA_SP_SKILL", assetPath: "/promotion/gacha_sp_skill.jpg", destination: null, order: null, enabled: true, available: true, width: 1280, height: 640 },
  { id: "gacha_sp_equipment", slot: "GACHA_SP_EQUIPMENT", assetPath: "/promotion/gacha_sp_equipment.jpg", destination: null, order: null, enabled: true, available: true, width: 1280, height: 640 },
  { id: "gacha_normal_character", slot: "GACHA_NORMAL_CHARACTER", assetPath: "/promotion/gacha_normal_character.png", destination: null, order: null, enabled: true, available: true, width: 1280, height: 640 },
  { id: "gacha_normal_skill", slot: "GACHA_NORMAL_SKILL", assetPath: "/promotion/gacha_normal_skill.jpg", destination: null, order: null, enabled: true, available: true, width: 1280, height: 640 },
  { id: "gacha_normal_equipment", slot: "GACHA_NORMAL_EQUIPMENT", assetPath: "/promotion/gacha_normal_equipment.jpg", destination: null, order: null, enabled: true, available: true, width: 1280, height: 640 },
  { id: "mypage_banner_quest", slot: "MYPAGE_BANNER_01", assetPath: "/promotion/mypage_banner_quest.webp", destination: "patrol", order: 1, enabled: true, available: true, width: 1200, height: 200 },
  { id: "mypage_banner_battle", slot: "MYPAGE_BANNER_02", assetPath: "/promotion/mypage_banner_battle.webp", destination: "pvp", order: 2, enabled: true, available: true, width: 1200, height: 200 },
  { id: "mypage_banner_ranking", slot: "MYPAGE_BANNER_03", assetPath: "/promotion/mypage_banner_ranking.webp", destination: "ranking", order: 3, enabled: true, available: true, width: 1200, height: 200 },
  { id: "mypage_banner_community", slot: "MYPAGE_BANNER_04", assetPath: "/promotion/mypage_banner_community.webp", destination: "community", order: 4, enabled: true, available: true, width: 1200, height: 200 }
] as const satisfies readonly ProductionCreative[];

export const PRODUCTION_CREATIVE_BY_GACHA_ID: Readonly<Record<CanonicalGachaId, ProductionCreativeSlot>> = {
  CHAR_SPECIAL: "GACHA_SP_CHARACTER",
  SKILL_SPECIAL: "GACHA_SP_SKILL",
  EQUIP_SPECIAL: "GACHA_SP_EQUIPMENT",
  CHAR_NORMAL: "GACHA_NORMAL_CHARACTER",
  SKILL_NORMAL: "GACHA_NORMAL_SKILL",
  EQUIP_NORMAL: "GACHA_NORMAL_EQUIPMENT"
};

export function resolveAvailableGachaCreative(
  gachaId: CanonicalGachaId,
  creatives: readonly ProductionCreative[] = PRODUCTION_CREATIVES
): ProductionCreative | null {
  const slot = PRODUCTION_CREATIVE_BY_GACHA_ID[gachaId];
  return creatives.find((creative) => creative.slot === slot && creative.enabled && creative.available) ?? null;
}

export function resolveAvailableMyPageCreatives(
  creatives: readonly ProductionCreative[] = PRODUCTION_CREATIVES
): readonly ProductionCreative[] | null {
  const resolved = creatives
    .filter((creative) => creative.slot.startsWith("MYPAGE_BANNER_") && creative.enabled && creative.available)
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER));

  if (resolved.length !== 4 || resolved.some((creative, index) => creative.order !== index + 1)) return null;
  return resolved;
}
