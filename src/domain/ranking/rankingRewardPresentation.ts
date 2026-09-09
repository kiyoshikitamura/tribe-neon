import { CANONICAL_RANKING_REWARDS } from "../gameplay/canonical/combat_production.ts";

export type RankingRewardCategory = "power" | "guild_power" | "pvp" | "raid";
export type RankingRewardPeriod = "daily" | "season";
export type RankingRewardTier = {
  from: number;
  to: number;
  itemId: string;
  quantity: number;
  displayName?: string;
  eligibilityLabel?: string;
  rewardKind?: "item" | "cosmetic";
};
export type RankingRewardCadence = "DAILY" | "WEEKLY" | "MONTHLY";
export type RankingRewardSection = { title: string; cadence: RankingRewardCadence; tiers: RankingRewardTier[] };
export type RankingRewardMasterPayload = {
  periods?: Record<string, unknown>;
  daily?: Record<string, unknown>;
  progression?: Record<string, unknown>;
  progressionByPeriod?: Record<string, Record<string, unknown>>;
  guildSeasonCosmetics?: unknown;
  guild_season_cosmetics?: unknown;
  guildSeasonRewards?: unknown;
};

const PREOPEN_GUILD_COSMETIC_FALLBACK: RankingRewardTier[] = [
  {
    from: 1,
    to: Number.MAX_SAFE_INTEGER,
    itemId: "guild_preopen_2026_participation",
    quantity: 1,
    displayName: "プレオープン参加記念ギルド装飾",
    eligibilityLabel: "参加ギルド",
    rewardKind: "cosmetic",
  },
  ...[1, 2, 3].map((rank): RankingRewardTier => ({
    from: rank,
    to: rank,
    itemId: `guild_preopen_2026_rank_${rank}`,
    quantity: 1,
    displayName: `プレオープン第${rank}位限定ギルド装飾`,
    rewardKind: "cosmetic",
  })),
];

type RewardCategoryDefinition = { key: string; title: string };

const CATEGORY_DEFINITIONS: Record<RankingRewardCategory, RewardCategoryDefinition[]> = {
  power: [{ key: "POWER", title: "個人ランキング" }],
  guild_power: [{ key: "GUILD_POWER", title: "ギルドランキング" }],
  pvp: [{ key: "PVP", title: "個人ランキング" }],
  // Retain the legacy category input, but never present retired Raid rewards.
  raid: [],
};

function isRewardTier(value: unknown): value is [number, number, string, number] {
  if (!Array.isArray(value) || value.length < 4) return false;
  const [from, to, itemId, quantity] = value;
  return Number.isInteger(Number(from))
    && Number(from) > 0
    && Number.isInteger(Number(to))
    && Number(to) >= Number(from)
    && typeof itemId === "string"
    && itemId.length > 0
    && Number.isFinite(Number(quantity))
    && Number(quantity) > 0;
}

function parseRewardTier(value: unknown): RankingRewardTier | null {
  if (isRewardTier(value)) return { from: Number(value[0]), to: Number(value[1]), itemId: value[2], quantity: Number(value[3]) };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const from = Number(row.rankMin ?? row.rank_min ?? row.from);
  const to = Number(row.rankMax ?? row.rank_max ?? row.to);
  const itemId = String(row.itemId ?? row.item_id ?? "");
  const quantity = Number(row.quantity);
  if (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to < from || !itemId || !Number.isFinite(quantity) || quantity <= 0) return null;
  return { from, to, itemId, quantity };
}

function parseCosmeticRewardTier(value: unknown): RankingRewardTier | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const itemId = String(row.rewardId ?? row.reward_id ?? row.cosmeticId ?? row.cosmetic_id ?? row.itemId ?? row.item_id ?? "");
  const displayName = String(row.displayName ?? row.display_name ?? row.rewardName ?? row.reward_name ?? row.cosmeticName ?? row.cosmetic_name ?? row.name ?? "");
  const eligibilityLabel = String(row.eligibilityLabel ?? row.eligibility_label ?? row.targetLabel ?? row.target_label ?? "");
  const isParticipation = Boolean(row.isParticipation ?? row.is_participation)
    || /参加/.test(eligibilityLabel)
    || /PARTICIP/i.test(itemId);
  const from = isParticipation ? 1 : Number(row.rankMin ?? row.rank_min ?? row.from ?? row.rank);
  const to = isParticipation ? Number.MAX_SAFE_INTEGER : Number(row.rankMax ?? row.rank_max ?? row.to ?? row.rank);
  const quantity = Number(row.quantity ?? 1);
  const isCosmetic = String(row.rewardKind ?? row.reward_kind ?? row.type ?? "").toUpperCase().includes("COSMETIC")
    || Boolean(row.cosmeticId ?? row.cosmetic_id)
    || /COSMETIC|DECORATION/i.test(itemId)
    || /装飾/.test(displayName);
  if (!isCosmetic || !itemId || !displayName || !Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to < from || !Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    from,
    to,
    itemId,
    quantity,
    displayName,
    eligibilityLabel: eligibilityLabel || (isParticipation ? "参加ギルド" : undefined),
    rewardKind: "cosmetic",
  };
}

function cadenceFor(payload: RankingRewardMasterPayload, key: string, period: RankingRewardPeriod): RankingRewardCadence {
  if (period === "daily") return "DAILY";
  const cadence = payload.periods?.[key];
  return cadence === "MONTHLY" ? "MONTHLY" : "WEEKLY";
}

export function rankingRewardSectionsFromPayload(
  payload: RankingRewardMasterPayload | null | undefined,
  category: RankingRewardCategory,
  period: RankingRewardPeriod,
): RankingRewardSection[] {
  if (!payload) return [];
  const progression = period === "daily"
    ? payload.daily ?? payload.progressionByPeriod?.DAILY
    : payload.progressionByPeriod?.SEASON ?? payload.progression;

  return CATEGORY_DEFINITIONS[category].flatMap(({ key, title }) => {
    const rows = progression?.[key];
    if (!Array.isArray(rows)) return [];
    const tiers = rows.flatMap((row) => {
      const tier = parseRewardTier(row);
      return tier ? [tier] : [];
    });
    return tiers.length > 0 ? [{ title, cadence: cadenceFor(payload, key, period), tiers }] : [];
  });
}

export function rankingRewardSections(category: RankingRewardCategory, period: RankingRewardPeriod): RankingRewardSection[] {
  return rankingRewardSectionsFromPayload(CANONICAL_RANKING_REWARDS, category, period);
}

export function guildSeasonCosmeticRewardSectionsFromPayload(
  payload: RankingRewardMasterPayload | null | undefined,
): RankingRewardSection[] {
  const progressionSeason = payload?.progressionByPeriod?.SEASON?.GUILD_POWER;
  const candidates = [
    payload?.guildSeasonCosmetics,
    payload?.guild_season_cosmetics,
    payload?.guildSeasonRewards,
    progressionSeason,
  ];
  const masterRows = candidates.find(Array.isArray) as unknown[] | undefined;
  const tiers = masterRows?.flatMap((row) => {
    const tier = parseCosmeticRewardTier(row);
    return tier ? [tier] : [];
  });
  return [{
    title: "プレオープン限定シーズン",
    cadence: "WEEKLY",
    tiers: tiers && tiers.length > 0 ? tiers : PREOPEN_GUILD_COSMETIC_FALLBACK,
  }];
}
