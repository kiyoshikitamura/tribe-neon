export type RankingRewardGrant = {
  periodKind: "DAILY" | "SEASON";
  periodKey: string;
  rankingCategory: string;
  rankPosition: number;
  itemId: string;
  quantity: number;
  grantedAt: string;
  rewardKind: "ITEM" | "COSMETIC";
  displayName?: string;
};

export type PendingRankingRewardNotification = {
  notificationIds: string[];
  grants: RankingRewardGrant[];
};

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const GUILD_COSMETIC_NAMES: Record<string, string> = {
  guild_preopen_2026_participation: "プレオープン参加記念ギルド装飾",
  guild_preopen_2026_rank_1: "プレオープン第1位限定ギルド紋章",
  guild_preopen_2026_rank_2: "プレオープン第2位限定ギルド装飾",
  guild_preopen_2026_rank_3: "プレオープン第3位限定ギルド装飾",
};

function isCosmeticGrant(grant: Record<string, unknown>): boolean {
  const rewardKind = String(grant.reward_kind ?? "").toUpperCase();
  const displayName = String(grant.display_name ?? "");
  if (rewardKind === "ITEM") return false;
  return rewardKind === "COSMETIC"
    || /ギルド装飾/.test(displayName)
    || /^guild_preopen_2026_/.test(String(grant.item_id ?? ""));
}

export function parsePendingRankingRewardNotification(value: unknown): PendingRankingRewardNotification | null {
  if (value == null) return null;
  if (typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.notification_ids) || !Array.isArray(payload.grants)) return null;
  const notificationIds = payload.notification_ids.filter(nonEmptyString);
  const grants = payload.grants.flatMap((entry): RankingRewardGrant[] => {
    if (!entry || typeof entry !== "object") return [];
    const grant = entry as Record<string, unknown>;
    const periodKind = grant.period_kind;
    const rankPosition = Number(grant.rank_position);
    const quantity = Number(grant.quantity);
    const rewardKind = isCosmeticGrant(grant) ? "COSMETIC" : "ITEM";
    if ((periodKind !== "DAILY" && periodKind !== "SEASON")
      || !nonEmptyString(grant.period_key)
      || !nonEmptyString(grant.ranking_category)
      || !Number.isInteger(rankPosition)
      || rankPosition <= 0
      || !nonEmptyString(grant.item_id)
      || !Number.isFinite(quantity)
      || quantity <= 0
      || !nonEmptyString(grant.granted_at)) return [];
    return [{
      periodKind,
      periodKey: grant.period_key,
      rankingCategory: grant.ranking_category,
      rankPosition,
      itemId: grant.item_id,
      quantity,
      grantedAt: grant.granted_at,
      rewardKind,
      displayName: nonEmptyString(grant.display_name)
        ? grant.display_name
        : rewardKind === "COSMETIC" ? GUILD_COSMETIC_NAMES[grant.item_id as string] || "ギルド装飾" : undefined,
    }];
  });
  return notificationIds.length > 0 && grants.length > 0 ? { notificationIds, grants } : null;
}

export function aggregateRankingRewardItems(grants: RankingRewardGrant[]): Array<{ id: string; quantity: number }> {
  const totals = new Map<string, number>();
  for (const grant of grants) totals.set(grant.itemId, (totals.get(grant.itemId) || 0) + grant.quantity);
  return [...totals].map(([id, quantity]) => ({ id, quantity }));
}

export type RankingRewardReceipt = {
  id: string;
  quantity: number;
  rewardKind: "ITEM" | "COSMETIC";
  displayName?: string;
};

export function aggregateRankingRewardReceipts(grants: RankingRewardGrant[]): RankingRewardReceipt[] {
  const totals = new Map<string, RankingRewardReceipt>();
  for (const grant of grants) {
    const key = `${grant.rewardKind}:${grant.itemId}`;
    const current = totals.get(key);
    totals.set(key, {
      id: grant.itemId,
      quantity: (current?.quantity || 0) + grant.quantity,
      rewardKind: grant.rewardKind,
      displayName: grant.displayName || current?.displayName,
    });
  }
  return [...totals.values()];
}
