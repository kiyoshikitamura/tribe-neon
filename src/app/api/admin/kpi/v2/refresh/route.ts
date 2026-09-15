import { validateProductionKpiRuntime } from "@/utils/kpiRuntime";
import { noStore, serviceClient } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export async function POST() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "preview") return noStore({ error: "Not found" }, 404);
  const runtime = validateProductionKpiRuntime({
    appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
    dataEnvironment: process.env.NEXT_PUBLIC_KPI_DATA_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!runtime.enabled) return noStore({ error: `KPIサーバー設定を拒否しました: ${runtime.reason}` }, 503);
  const service = serviceClient();
  if (!service) return noStore({ error: "ProductionのKPIサーバー設定が未完了です。" }, 503);

  // PostgREST経由ではDEFAULT引数付きRPCの引数なし解決が安定しないため、
  // DB Authorityと同じAsia/Tokyoの観測日を明示して呼ぶ。
  const observationDate = todayJst();
  const { data, error } = await service.rpc("request_kpi_overview_saved_refresh", { p_today: observationDate });
  if (error) {
    console.error("KPI manual refresh failed", { code: error.code, message: error.message });
    return noStore({ error: "KPIを更新できませんでした。" }, 500);
  }
  return noStore({ status: "succeeded", refreshedRows: data ?? 0, observationDate, refreshToken: new Date().toISOString() });
}
