import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateProductionKpiRuntime } from "@/utils/kpiRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories = new Set(["acquisition", "active_retention", "guild", "content", "revenue"]);
const periodTypes = new Set(["daily", "monthly", "cohort"]);

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
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

  const category = request.nextUrl.searchParams.get("category");
  const periodType = request.nextUrl.searchParams.get("periodType");
  const periodStart = request.nextUrl.searchParams.get("periodStart");
  const periodEnd = request.nextUrl.searchParams.get("periodEnd");
  if (!category || !categories.has(category) || !periodType || !periodTypes.has(periodType)
      || !isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
    return NextResponse.json({ error: "集計条件が不正です。" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return NextResponse.json({ error: "ProductionのKPIサーバー設定が未完了です。" }, { status: 503 });
  }
  const service = createClient(runtime.origin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: run, error: runError } = await service
    .from("kpi_aggregation_runs")
    .select("run_id,source_watermark,finished_at")
    .eq("category", category)
    .eq("period_type", periodType)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  if (!run) return NextResponse.json({ snapshots: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data: snapshots, error: snapshotError } = await service
    .from("kpi_metric_snapshots")
    .select("run_id,metric_id,dimension_key,value,numerator,denominator,value_status,null_reason,calculated_at")
    .eq("run_id", run.run_id)
    .order("metric_id", { ascending: true });
  if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 });

  return NextResponse.json({
    snapshots: (snapshots || []).map((snapshot) => ({
      ...snapshot,
      source_watermark: run.source_watermark,
      finished_at: run.finished_at,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
