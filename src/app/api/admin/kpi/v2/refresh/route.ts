import { validateProductionKpiRuntime } from "@/utils/kpiRuntime";
import { noStore, serviceClient } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { data, error } = await service.rpc("request_kpi_overview_saved_refresh");
  if (error) {
    console.error("KPI manual refresh failed", error);
    return noStore({ error: "KPIを更新できませんでした。" }, 500);
  }
  return noStore({ status: "succeeded", refreshedRows: data ?? 0, refreshToken: new Date().toISOString() });
}
