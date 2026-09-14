export const RECENT_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

const VISIBLE_ACTIVITY_TYPES = new Set([
  "SSR_CHARACTER", "POWER_RANK_1", "GUILD_CREATED", "RAID_HELP_REQUEST", "RAID_BOSS_DEFEATED",
]);

export type RecentActivityRecord = Readonly<{
  id: string;
  activity_type?: string | null;
  created_at?: string | null;
}>;

export function normalizeRecentActivities<T extends RecentActivityRecord>(
  activities: readonly T[],
  nowMs = Date.now(),
): T[] {
  const oldestVisibleAt = nowMs - RECENT_ACTIVITY_WINDOW_MS;

  return activities
    .filter((activity) => {
      // 9/14 Production Hotfix受入: 永続feedのSSRキャラ取得を表示する。
      // Gacha/Rewardの一時通知はこのサーバーfeedへ混在させない。
      if (!VISIBLE_ACTIVITY_TYPES.has(activity.activity_type || "")) return false;
      const createdAt = Date.parse(activity.created_at || "");
      return Number.isFinite(createdAt) && createdAt >= oldestVisibleAt && createdAt <= nowMs;
    })
    .sort((left, right) => {
      const createdAtDifference = Date.parse(right.created_at!) - Date.parse(left.created_at!);
      if (createdAtDifference !== 0) return createdAtDifference;
      if (left.id === right.id) return 0;
      return left.id < right.id ? 1 : -1;
    });
}
