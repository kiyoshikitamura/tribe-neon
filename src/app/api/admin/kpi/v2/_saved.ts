import { unstable_cache } from "next/cache";
import { addDays, noStore, rangeFrom, serviceClient, TIMEZONE } from "./_shared";
import type { NextRequest } from "next/server";
import type { OverviewRow } from "@/utils/kpiMonthly";

type SavedRecord = { period_start: string; generated_at: string; generation_id: string; payload: OverviewRow };
type BillingOrder = { user_id: string; amount_jpy: number; granted_at: string };
type BillingAggregate = { payers: Set<string>; revenue: number };
export const SAVED_DEFINITION = "kpi-overview-saved-v1";
const BILLING_AUTHORITY = "billing_orders.status=GRANTED,billing_mode=live,granted_at(JST)";

// 認証済みAPI内でのみ使用。Product / Community は保存済み結果のみを読む。
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

function nextMonth(date: string) {
  const next = new Date(date + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
}
function jstStartUtc(date: string) {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}
function billingKey(timestamp: string, period: "daily" | "monthly") {
  const jstDate = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(new Date(timestamp));
  return period === "daily" ? jstDate : jstDate.slice(0, 7);
}

// 課金KPIは確定済み注文台帳をAuthorityとして読む。Grant履歴から売上を算出しない。
async function readBillingOverview(period: "daily" | "monthly", from: string, to: string, origin: string): Promise<Map<string, BillingAggregate>> {
  const service = serviceClient();
  if (!service || origin !== process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) throw new Error("KPI billing configuration unavailable");
  const endExclusive = period === "daily" ? addDays(to, 1) : nextMonth(to);
  const { data, error } = await service.from("billing_orders")
    .select("user_id,amount_jpy,granted_at")
    .eq("status", "GRANTED")
    .eq("billing_mode", "live")
    // ユーザー確認済みの実機決済テスト。注文・付与は保持し、課金KPIだけ除外する。
    .neq("user_id", "fac21f4a-095b-4732-aa09-f02fe9be0481")
    .not("granted_at", "is", null)
    .gte("granted_at", jstStartUtc(from))
    .lt("granted_at", jstStartUtc(endExclusive));
  if (error) throw error;
  const aggregates = new Map<string, BillingAggregate>();
  for (const order of (data || []) as BillingOrder[]) {
    const key = billingKey(order.granted_at, period);
    const current = aggregates.get(key) || { payers: new Set<string>(), revenue: 0 };
    current.payers.add(order.user_id);
    current.revenue += Number(order.amount_jpy) || 0;
    aggregates.set(key, current);
  }
  return aggregates;
}

export async function savedOverviewResponse(request: NextRequest, period: "daily" | "monthly") {
  const range = rangeFrom(request);
  if (!range) return noStore({ error: "Invalid JST date range" }, 400);
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!origin || !serviceClient()) return noStore({ error: "KPI server configuration unavailable" }, 503);
  try {
    const from = period === "monthly" ? range.from.slice(0, 7) + "-01" : range.from;
    const to = period === "monthly" ? range.to.slice(0, 7) + "-01" : range.to;
    const cacheBust = request.nextUrl.searchParams.get("refresh") || "";
    const [saved, billing] = await Promise.all([
      cachedRead(period, from, to, origin, cacheBust),
      readBillingOverview(period, from, to, origin),
    ]);
    const byDate = new Map(saved.map((row) => [row.period_start, row]));
    const keys: string[] = [];
    for (let date = from; date <= to;) {
      keys.push(date);
      date = period === "daily" ? addDays(date, 1) : nextMonth(date);
    }
    const rows = keys.reverse().map((date) => {
      const record = byDate.get(date);
      const row: OverviewRow = record ? { ...record.payload, generated_at: record.generated_at } : {
        date: period === "daily" ? date : date.slice(0, 7), new_users: null, active_users: null,
        tutorial: { value: null, numerator: null, denominator: null, status: "NOT_READY" },
        guild: { value: null, numerator: null, denominator: null, status: "NOT_READY" },
        chat: { value: null, numerator: null, denominator: null, status: "NOT_READY" },
        total_registered: null, retention: [], saved_status: "not_aggregated", generated_at: null,
      };
      const key = period === "daily" ? date : date.slice(0, 7);
      const aggregate = billing.get(key);
      const payers = aggregate?.payers.size ?? 0;
      const revenue = aggregate?.revenue ?? 0;
      const activeUsers = row.active_users;
      row.monetization = {
        payers,
        payer_rate: activeUsers != null && activeUsers > 0 ? payers / activeUsers : null,
        revenue,
        arppu: payers > 0 ? revenue / payers : null,
        arpu: activeUsers != null && activeUsers > 0 ? revenue / activeUsers : null,
        reason: BILLING_AUTHORITY,
      };
      return row;
    });
    const generated = saved.map((row) => row.generated_at).sort();
    const updatedAt = generated[0] || null;
    return noStore({ rows, timezone: TIMEZONE, definition_version: SAVED_DEFINITION,
      source: "saved_results+billing_orders", billing_authority: BILLING_AUTHORITY,
      refresh_interval_minutes: 30, updated_at: updatedAt,
      stale: saved.length < keys.length || updatedAt == null || Date.now() - Date.parse(updatedAt) > 90 * 60_000,
      missing_periods: keys.length - saved.length, from: range.from, to: range.to });
  } catch (error) {
    console.error("KPI saved results read failed", error);
    return noStore({ error: "保存済みKPIまたは課金KPIを取得できません。閲覧時の再集計は行いません。" }, 503);
  }
}
