import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateProductionKpiRuntime } from "@/utils/kpiRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories = new Set(["acquisition", "active_retention", "guild", "content", "revenue"]);
const periodTypes = new Set(["daily", "monthly", "cohort"]);

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "preview") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const runtime = validateProductionKpiRuntime({
    appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
    dataEnvironment: process.env.NEXT_PUBLIC_KPI_DATA_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!runtime.enabled) {
    return NextResponse.json({ error: `KPIサーバー設定を拒否しました: ${runtime.reason}` }, { status: 503 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "ProductionのKPIサーバー設定が未完了です。" }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as null | Record<string, unknown>;
  const category = body?.category;
  const periodType = body?.periodType;
  const periodStart = body?.periodStart;
  const periodEnd = body?.periodEnd;
  if (typeof category !== "string" || !categories.has(category)
      || typeof periodType !== "string" || !periodTypes.has(periodType)
      || !isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
    return NextResponse.json({ error: "集計条件が不正です。" }, { status: 400 });
  }

  const startMs = Date.parse(`${periodStart}T00:00:00Z`);
  const endMs = Date.parse(`${periodEnd}T00:00:00Z`);
  const days = (endMs - startMs) / 86_400_000;
  if (days < 1 || days > 31) {
    return NextResponse.json({ error: "集計期間は1〜31日で指定してください。" }, { status: 400 });
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: runId, error: refreshError } = await service.rpc("refresh_kpi_snapshots", {
    p_category: category,
    p_period_type: periodType,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_requested_by: null,
  });
  if (refreshError || !runId) {
    return NextResponse.json({ error: refreshError?.message || "集計runを作成できませんでした。" }, { status: 500 });
  }

  const { data: run, error: runError } = await service
    .from("kpi_aggregation_runs")
    .select("run_id,status,finished_at,error_code,error_detail")
    .eq("run_id", runId)
    .single();
  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || "集計結果を確認できませんでした。" }, { status: 500 });
  }

  return NextResponse.json({
    runId: run.run_id,
    status: run.status,
    finishedAt: run.finished_at,
    errorCode: run.error_code,
    errorDetail: run.error_detail,
  }, { headers: { "Cache-Control": "no-store" } });
}
