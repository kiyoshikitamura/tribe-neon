import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateProductionKpiRuntime } from "@/utils/kpiRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type View = "summary" | "guild" | "content";
type Period = "daily" | "monthly";
type Run = {
  run_id: string;
  category: string;
  period_start: string;
  finished_at: string;
  source_watermark: string;
};
type Snapshot = {
  run_id: string;
  metric_id: string;
  value: number | string | null;
  value_status: string;
};

const views = new Set<View>(["summary", "guild", "content"]);
const periods = new Set<Period>(["daily", "monthly"]);

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMonths(month: string, months: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + months, 1)).toISOString().slice(0, 7);
}

function jstToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function categoriesFor(view: View) {
  if (view === "summary") return ["acquisition", "active_retention", "revenue"];
  return [view];
}

function displayedMetricIds(view: View, period: Period) {
  if (view === "summary") {
    const active = period === "daily" ? "active.dau" : "active.mau";
    return new Set([
      active, `${active}_authenticated`, `${active}_anonymous`,
      "user.new_total", "user.new_authenticated_eop", "user.new_anonymous_eop",
      "revenue.gross", "revenue.pu", "revenue.pur", "revenue.arppu", "revenue.arpu",
    ]);
  }
  if (view === "guild") {
    return new Set([
      "guild.valid_count", "guild.active_count", "guild.active_rate",
      "guild.member_total", "guild.member_average", "guild.created_count", "guild.disbanded_count",
    ]);
  }
  return new Set(["gacha.free10.character", "gacha.free10.skill", "gacha.free10.equipment"]);
}

export async function GET(request: NextRequest) {
  const runtime = validateProductionKpiRuntime({
    appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
    dataEnvironment: process.env.NEXT_PUBLIC_KPI_DATA_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!runtime.enabled) {
    return NextResponse.json({ error: `KPIサーバー設定を拒否しました: ${runtime.reason}` }, { status: 503 });
  }

  const viewValue = request.nextUrl.searchParams.get("view") as View;
  const periodValue = request.nextUrl.searchParams.get("period") as Period;
  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  if (!views.has(viewValue) || !periods.has(periodValue) || !Number.isInteger(page) || page < 1 || page > 120) {
    return NextResponse.json({ error: "表示条件が不正です。" }, { status: 400 });
  }

  const today = jstToday();
  const currentMonth = today.slice(0, 7);
  const keys = periodValue === "daily"
    ? Array.from({ length: 30 }, (_, index) => addDays(today, -((page - 1) * 30 + index)))
    : Array.from({ length: 12 }, (_, index) => addMonths(currentMonth, -((page - 1) * 12 + index)));
  const firstStart = periodValue === "daily" ? keys.at(-1)! : `${keys.at(-1)}-01`;
  const lastStart = periodValue === "daily" ? keys[0] : `${keys[0]}-01`;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return NextResponse.json({ error: "KPIサーバー設定が未完了です。" }, { status: 503 });
  const service = createClient(runtime.origin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: runData, error: runError } = await service
    .from("kpi_aggregation_runs")
    .select("run_id,category,period_start,finished_at,source_watermark")
    .in("category", categoriesFor(viewValue))
    .eq("period_type", periodValue)
    .eq("status", "succeeded")
    .eq("aggregation_version", "p0-v2-timeseries")
    .gte("period_start", firstStart)
    .lte("period_start", lastStart)
    .order("finished_at", { ascending: false });
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const latestRuns = new Map<string, Run>();
  for (const run of (runData || []) as Run[]) {
    const key = `${run.period_start}:${run.category}`;
    if (!latestRuns.has(key)) latestRuns.set(key, run);
  }
  const runIds = [...latestRuns.values()].map((run) => run.run_id);
  let snapshots: Snapshot[] = [];
  if (runIds.length) {
    const { data, error } = await service
      .from("kpi_metric_snapshots")
      .select("run_id,metric_id,value,value_status")
      .in("run_id", runIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    snapshots = (data || []) as Snapshot[];
  }
  const metricsByRun = new Map<string, Map<string, Snapshot>>();
  for (const snapshot of snapshots) {
    const runMetrics = metricsByRun.get(snapshot.run_id) || new Map<string, Snapshot>();
    runMetrics.set(snapshot.metric_id, snapshot);
    metricsByRun.set(snapshot.run_id, runMetrics);
  }

  const rows = keys.map((displayKey) => {
    const periodStart = periodValue === "daily" ? displayKey : `${displayKey}-01`;
    const metric = (category: string, id: string) => {
      const run = latestRuns.get(`${periodStart}:${category}`);
      return run ? metricsByRun.get(run.run_id)?.get(id) : undefined;
    };
    const number = (category: string, id: string) => {
      const value = metric(category, id)?.value;
      return value == null ? null : Number(value);
    };
    const usedRuns = categoriesFor(viewValue)
      .map((category) => latestRuns.get(`${periodStart}:${category}`))
      .filter((run): run is Run => !!run);
    const visibleMetrics = displayedMetricIds(viewValue, periodValue);
    const statuses = usedRuns.flatMap((run) => [...(metricsByRun.get(run.run_id)?.values() || [])]
      .filter((item) => visibleMetrics.has(item.metric_id))
      .map((item) => item.value_status));
    const base = {
      key: displayKey,
      status: statuses.includes("provisional") ? "provisional" : usedRuns.length ? "final" : "unavailable",
      updatedAt: usedRuns.map((run) => run.finished_at).sort().at(-1) || null,
    };

    if (viewValue === "summary") {
      const activePrefix = periodValue === "daily" ? "active.dau" : "active.mau";
      return {
        ...base,
        activeTotal: number("active_retention", activePrefix),
        activeAuthenticated: number("active_retention", `${activePrefix}_authenticated`),
        activeAnonymous: number("active_retention", `${activePrefix}_anonymous`),
        newTotal: number("acquisition", "user.new_total"),
        newAuthenticated: number("acquisition", "user.new_authenticated_eop"),
        newAnonymous: number("acquisition", "user.new_anonymous_eop"),
        sales: null, pu: null, pur: null, arppu: null, arpu: null,
      };
    }
    if (viewValue === "guild") {
      return {
        ...base,
        validGuilds: number("guild", "guild.valid_count"),
        activeGuilds: number("guild", "guild.active_count"),
        activeRate: number("guild", "guild.active_rate"),
        memberTotal: number("guild", "guild.member_total"),
        memberAverage: number("guild", "guild.member_average"),
        createdGuilds: number("guild", "guild.created_count"),
        disbandedGuilds: number("guild", "guild.disbanded_count"),
      };
    }
    const character = number("content", "gacha.free10.character");
    const skill = number("content", "gacha.free10.skill");
    const equipment = number("content", "gacha.free10.equipment");
    return {
      ...base, character, skill, equipment,
      total: character == null || skill == null || equipment == null ? null : character + skill + equipment,
    };
  });

  return NextResponse.json({ view: viewValue, period: periodValue, page, rows }, {
    headers: { "Cache-Control": "no-store" },
  });
}
