import { unstable_cache } from "next/cache";
import { addDays, noStore, rangeFrom, serviceClient, TIMEZONE } from "./_shared";
import type { NextRequest } from "next/server";
import type { OverviewRow } from "@/utils/kpiMonthly";

type SavedRecord = { period_start: string; generated_at: string; generation_id: string; payload: OverviewRow };
export const SAVED_DEFINITION = "kpi-overview-saved-v1";

// 認証済みAPI内でのみ使用。閲覧では保存テーブルのSELECTだけを実行する。
export async function readSavedOverview(period: string, from: string, to: string, origin: string, _cacheBust = ""): Promise<SavedRecord[]> {
  const service = serviceClient();
  if (!service || origin !== process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) throw new Error("KPI configuration unavailable");
  const { data, error } = await service.from("kpi_overview_saved_results")
    .select("period_start,generated_at,generation_id,payload")
    .eq("period_type", period).eq("definition_version", SAVED_DEFINITION)
    .gte("period_start", from).lte("period_start", to).order("period_start", { ascending: false });
  if (error) throw error;
  return (data || []) as SavedRecord[];
}
const cachedRead = unstable_cache(readSavedOverview, [SAVED_DEFINITION], { revalidate: 60 });

export async function savedOverviewResponse(request: NextRequest, period: "daily" | "monthly") {
  const range = rangeFrom(request);
  if (!range) return noStore({ error: "Invalid JST date range" }, 400);
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!origin || !serviceClient()) return noStore({ error: "KPI server configuration unavailable" }, 503);
  try {
    const from = period === "monthly" ? range.from.slice(0, 7) + "-01" : range.from;
    const to = period === "monthly" ? range.to.slice(0, 7) + "-01" : range.to;
    const cacheBust = request.nextUrl.searchParams.get("refresh") || "";
    const saved = await cachedRead(period, from, to, origin, cacheBust);
    const byDate = new Map(saved.map((row) => [row.period_start, row]));
    const keys: string[] = [];
    for (let date = from; date <= to;) {
      keys.push(date);
      if (period === "daily") date = addDays(date, 1);
      else { const next = new Date(date + "T00:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1); date = next.toISOString().slice(0, 10); }
    }
    const rows = keys.reverse().map((date) => {
      const record = byDate.get(date);
      return record ? { ...record.payload, generated_at: record.generated_at } : {
        date: period === "daily" ? date : date.slice(0, 7), new_users: null, active_users: null,
        total_registered: null, retention: [], saved_status: "not_aggregated", generated_at: null,
      };
    });
    const generated = saved.map((row) => row.generated_at).sort();
    const updatedAt = generated[0] || null;
    return noStore({ rows, timezone: TIMEZONE, definition_version: SAVED_DEFINITION,
      source: "saved_results", refresh_interval_minutes: 30, updated_at: updatedAt,
      stale: saved.length < keys.length || updatedAt == null || Date.now() - Date.parse(updatedAt) > 90 * 60_000,
      missing_periods: keys.length - saved.length, from: range.from, to: range.to });
  } catch (error) {
    console.error("KPI saved results read failed", error);
    return noStore({ error: "保存済みKPIを取得できません。閲覧時の再集計は行いません。" }, 503);
  }
}
