export type OverviewMetric = {
  value: number | null; numerator: number | null; denominator: number | null;
  status: string; reason?: string | null; authority?: string; authority_label?: string | null;
  observation_status?: string; target?: number | null;
};
export type OverviewRow = {
  date: string; new_users: number | null; tutorial: OverviewMetric;
  guild: OverviewMetric & { create?: number | null; join?: number | null };
  chat: OverviewMetric; retention: Array<OverviewMetric & { day: number }>;
  from?: string; to?: string; partial?: boolean;
  active_users?: number | null; total_registered?: number | null;
  active_guilds?: number | null; effective_active_guilds?: number | null;
  generated_at?: string | null; saved_status?: string;
  monetization?: { payers: number | null; payer_rate: number | null; revenue: number | null; arppu: number | null; arpu: number | null; reason: string };
};

function aggregate(metrics: OverviewMetric[], allowImmature = false): OverviewMetric {
  const observed = metrics.filter((m) => m.numerator != null && m.denominator != null);
  const unavailable = metrics.some((m) => m.status === "UNAVAILABLE");
  const incomplete = observed.length !== metrics.length;
  const usable = !unavailable && (allowImmature || !incomplete) && observed.length > 0;
  const numerator = usable ? observed.reduce((sum, m) => sum + m.numerator!, 0) : null;
  const denominator = usable ? observed.reduce((sum, m) => sum + m.denominator!, 0) : null;
  const value = numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
  const target = metrics[0]?.target ?? null;
  const authorities = [...new Set(metrics.map((m) => m.authority).filter(Boolean))];
  const labels = [...new Set(metrics.map((m) => m.authority_label).filter(Boolean))];
  return {
    numerator, denominator, value, target,
    status: unavailable ? "UNAVAILABLE" : value == null ? "NOT_READY" : target != null && value >= target ? "PASS" : "FAIL",
    observation_status: incomplete ? "partial" : "complete",
    reason: unavailable ? "authority_unavailable" : value == null ? (denominator === 0 ? "zero_denominator" : "immature_cohorts") : incomplete ? "mature_cohorts_only" : null,
    authority: authorities.length === 1 ? authorities[0] : "mixed",
    authority_label: labels.length === 1 ? labels[0] : labels.length > 1 ? "複数の計測方式" : null,
  };
}

// 登録日のコホートは互いに独立。人数を加算し、率を再計算する。
// D1〜D5はそれぞれ成熟済みコホートだけを分母・分子に含める。
export function monthlyRows(rows: OverviewRow[], today: string): OverviewRow[] {
  const months = [...new Set(rows.map((row) => row.date.slice(0, 7)))].sort().reverse();
  return months.map((month) => {
    const days = rows.filter((row) => row.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    const activeDays = days.filter((row) => (row.new_users ?? 0) > 0);
    const sumBreakdown = (key: "create" | "join") => activeDays.every((row) => row.guild[key] != null)
      ? activeDays.reduce((sum, row) => sum + row.guild[key]!, 0) : null;
    return {
      date: month, from: days[0].date, to: days.at(-1)!.date,
      partial: month === today.slice(0, 7),
      new_users: days.reduce((sum, row) => sum + (row.new_users ?? 0), 0),
      tutorial: aggregate(days.map((row) => row.tutorial)),
      guild: { ...aggregate(days.map((row) => row.guild)), create: sumBreakdown("create"), join: sumBreakdown("join") },
      chat: aggregate(days.map((row) => row.chat)),
      retention: [1, 2, 3, 4, 5].map((day) => ({ day, ...aggregate(activeDays.map((row) => row.retention.find((m) => m.day === day)!), true) })),
    };
  });
}
