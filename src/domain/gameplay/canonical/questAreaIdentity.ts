/** Quest 21 Stage Balance Master v2 の街ごとの周回目的。 */
export const QUEST_AREA_IDENTITIES = {
  shinjuku: { enemy: "攻撃型の敵が多い", reward: "キャラクター育成素材 UP" },
  shibuya: { enemy: "素早い敵が多い", reward: "スキル素材 UP" },
  ikebukuro: { enemy: "防御・HP型の敵が多い", reward: "装備育成素材 UP" },
  roppongi: { enemy: "スキル型の敵が多い", reward: "スキル指南書 UP" },
  akihabara: { enemy: "妨害・特殊型の敵が多い", reward: "ガチャチケット UP" },
  kawasaki: { enemy: "高火力の敵が多い", reward: "改造パーツ UP" },
  yokohama: { enemy: "バランス・耐久型の敵が多い", reward: "キャラ・装備素材 バランス" },
} as const;

export function questAreaIdentity(townId: string) {
  return QUEST_AREA_IDENTITIES[townId as keyof typeof QUEST_AREA_IDENTITIES];
}

// Display only rewards actually returned by the server, including difficulty-specific pools.
export function questAreaRewardItemIds(courses: readonly { town_id?: string; reward_items?: { item_id?: string; probability_bp?: number; quantity?: number }[] }[], townId: string): string[] {
  return [...new Set(courses.filter(course => course.town_id === townId).flatMap(course =>
    (course.reward_items || []).filter(item => Number(item.quantity) > 0 && Number(item.probability_bp ?? 10000) > 0)
      .map(item => String(item.item_id || "")).filter(Boolean)))];
}
