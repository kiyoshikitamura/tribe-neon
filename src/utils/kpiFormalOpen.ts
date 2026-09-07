export type FormalStatus = "PASS" | "FAIL" | "NOT_READY";

type RetentionDay = {
  day: number;
  numerator: number | null;
  denominator: number | null;
  observation_status?: string;
};

type RetentionCohort = {
  cohort_date: string;
  game_start_uu: number;
  days: RetentionDay[];
};

export type RetentionFormalMetric = {
  metric_key: string;
  target: number;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  mature_cohort_count: number;
  cohorts_used: string[];
  status: FormalStatus;
  reason: string | null;
};

const retentionTargets = [0, 0.38, 0.30, 0.26, 0.23, 0.21];

export function calculateFormalRetention(cohorts: RetentionCohort[]) {
  return [1, 2, 3, 4, 5].map((day): RetentionFormalMetric => {
    const mature = cohorts
      .map((cohort) => ({ cohort, result: cohort.days.find((candidate) => candidate.day === day) }))
      .filter(({ result }) => result?.observation_status !== "incomplete"
        && result?.numerator != null && result?.denominator != null)
      .sort((a, b) => a.cohort.cohort_date.localeCompare(b.cohort.cohort_date));
    const selected = mature.slice(-3);
    const ready = selected.length === 3;
    const numerator = ready ? selected.reduce((sum, item) => sum + Number(item.result!.numerator), 0) : null;
    const denominator = ready ? selected.reduce((sum, item) => sum + Number(item.result!.denominator), 0) : null;
    const value = denominator && numerator != null ? numerator / denominator : null;
    const target = retentionTargets[day];
    return {
      metric_key: `formal_open.retention.d${day}`,
      target,
      numerator,
      denominator,
      value,
      mature_cohort_count: mature.length,
      cohorts_used: selected.map((item) => item.cohort.cohort_date),
      status: !ready || !denominator ? "NOT_READY" : value! >= target ? "PASS" : "FAIL",
      reason: !ready ? "requires_three_mature_cohorts" : !denominator ? "zero_denominator" : null,
    };
  });
}

type CommunityDay = {
  date: string;
  effective_active_guild_count: number;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calculateCommunityContinuity(series: CommunityDay[], today: string, rangeEnd: string) {
  const completed = series.filter((row) => row.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const first = completed[0]?.date;
  const end = rangeEnd < today ? rangeEnd : addDays(today, -1);
  const byDate = new Map(completed.map((row) => [row.date, Number(row.effective_active_guild_count || 0)]));
  const daily_series: CommunityDay[] = [];
  if (first && first <= end) {
    for (let date = first; date <= end; date = addDays(date, 1)) {
      daily_series.push({ date, effective_active_guild_count: byDate.get(date) || 0 });
    }
  }
  let current = 0;
  for (let index = daily_series.length - 1; index >= 0; index -= 1) {
    if (daily_series[index].effective_active_guild_count < 18) break;
    current += 1;
  }
  const status: FormalStatus = daily_series.length < 3 ? "NOT_READY" : current >= 3 ? "PASS" : "FAIL";
  return {
    daily_series,
    target: 18,
    required_consecutive_days: 3,
    current_consecutive_days: current,
    status,
    reason: status === "NOT_READY" ? "insufficient_completed_jst_days" : status === "FAIL" ? "continuity_threshold_not_met" : null,
  };
}

export function calculateFormalOpenStatus(components: Record<string, string>) {
  const entries = Object.entries(components);
  const notReady = entries.filter(([, status]) => status === "NOT_READY" || status === "UNAVAILABLE").map(([key]) => key);
  const failed = entries.filter(([, status]) => status === "FAIL").map(([key]) => key);
  if (notReady.length) return { status: "NOT_READY" as const, reasons: notReady.map((key) => `${key}:not_ready`) };
  if (failed.length) return { status: "FAIL" as const, reasons: failed.map((key) => `${key}:threshold_not_met`) };
  return { status: "GO" as const, reasons: [] as string[] };
}
