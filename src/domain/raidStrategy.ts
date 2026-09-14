/** 2026-09-14 approved identity. Runtime hints describe the existing stats only.
 * target descriptions become live only after the combat-profile rollout is verified. */
export const RAID_AREA_STRATEGIES = {
  shinjuku: { identity: '高火力型', counter: 'DEF・ダメージ軽減', description: '高い攻撃力に備え、防御とダメージ軽減を重視。', target: 'ATK / Burst' },
  shibuya: { identity: '高速型', counter: '耐久・SPD対策', description: '素早い敵に備え、耐久力と行動順を意識。', target: 'SPD / 先制' },
  ikebukuro: { identity: '鉄壁型', counter: 'DEF Down・高火力', description: '高いHPと防御力に、防御低下と火力で対抗。', target: 'DEF / HP' },
  roppongi: { identity: '防御・バランス型', counter: 'DEF Down・継続火力', description: '高めの防御を崩し、安定してダメージを与える。', target: 'Skill型 / Buff / Debuff / Skill' },
  akihabara: { identity: '速度・バランス型', counter: '耐久・SPD対策', description: '速めの行動に備え、回復と耐久を確保。', target: '妨害型 / 状態異常 / 行動阻害' },
  kawasaki: { identity: '高火力型', counter: 'SPD・短期決戦', description: '高い攻撃力に注意。先手と集中攻撃を意識。', target: '超火力型 / ATK最大 / 低耐久' },
  yokohama: { identity: '耐久型', counter: '継続火力', description: '高めのHPに、継続して火力を出せる編成で対抗。', target: '持久型 / HP / 回復 / 耐久' },
} as const;
export function getRaidAreaStrategy(areaId: string) {
  return RAID_AREA_STRATEGIES[areaId.toLowerCase() as keyof typeof RAID_AREA_STRATEGIES] ?? null;
}

export type RaidRewardPolicy = {
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  enabled: boolean;
  status: 'ACTIVE' | 'PENDING_CONTRIBUTION';
  version: 2;
  instanceItems: { itemId: string; quantity: number }[];
  daily: { chanceBp: number; items: { itemId: string; quantity: number }[] };
};
export function parseRaidRewardPolicies(value: unknown): RaidRewardPolicy[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Invalid raid reward policy');
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || !['beginner','intermediate','advanced','expert'].includes(row.difficulty) || seen.has(row.difficulty)
      || row.version !== 2 || typeof row.enabled !== 'boolean' || !['ACTIVE','PENDING_CONTRIBUTION'].includes(row.status)
      || row.enabled !== (row.status === 'ACTIVE') || !row.daily || !Number.isInteger(row.daily.chanceBp)
      || row.daily.chanceBp < 0 || row.daily.chanceBp > 10000) throw new Error('Invalid raid reward policy');
    for (const items of [row.instanceItems, row.daily.items]) {
      if (!Array.isArray(items) || items.length === 0 || items.some(item => !item || typeof item.itemId !== 'string'
        || !item.itemId || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Invalid raid reward items');
    }
    seen.add(row.difficulty);
  }
  return value as RaidRewardPolicy[];
}
