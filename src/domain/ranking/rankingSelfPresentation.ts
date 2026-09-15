/** Rank positions may be shared. Pagination always uses the server's absolute row position. */
export function rankingNearbyOffset(self: { row_position?: unknown } | null): number | null {
  const position = Number(self?.row_position);
  return Number.isSafeInteger(position) && position >= 1 ? Math.max(0, position - 3) : null;
}

export function rankingSelfStatusText(status: string | null): string {
  switch (status) {
    case "NO_GUILD": return "未所属";
    case "DAILY_INACTIVE": return "本日の集計対象外";
    case "EXCLUDED": return "集計対象外";
    case "NO_PVP_RECORD": return "バトル順位未登録";
    case "NO_POWER_RECORD": return "総合力未登録";
    case "NOT_STARTED": return "開催前";
    case "NO_SNAPSHOT": return "確定順位なし";
    default: return "順位情報なし";
  }
}
