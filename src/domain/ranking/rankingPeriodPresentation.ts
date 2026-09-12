type PeriodMetadata = {
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  finalized_at?: string | null;
};

/** Presentation only: never advance or finalize a server season from the clock. */
export function rankingPeriodText(
  metadata: PeriodMetadata | null,
  options: { preopen: boolean; daily: boolean; now: number; format: (value: string) => string | null },
): string {
  const finalized = Boolean(metadata?.finalized_at)
    || ["FINALIZED", "COMPLETED", "CLOSED"].includes(String(metadata?.status || "").toUpperCase());
  // The preopen event's far-future end is a server sentinel, not a published deadline.
  if (options.preopen) return finalized ? "開催終了" : "プレオープン中開催";
  const start = metadata?.starts_at;
  const end = metadata?.ends_at;
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
    return "集計期間情報なし";
  }
  const formattedStart = options.format(start);
  const formattedEnd = options.format(end);
  if (!formattedStart || !formattedEnd) return "集計期間情報なし";
  const period = `${formattedStart} ～ ${formattedEnd} JST`;
  if (!options.daily && String(metadata?.status).toUpperCase() === "ACTIVE" && Date.parse(end) <= options.now) {
    return `${period}（集計期間終了・状態確認中）`;
  }
  return period;
}
