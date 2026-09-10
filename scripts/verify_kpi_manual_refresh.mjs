import { readFile } from "node:fs/promises";

const files = {
  route: await readFile(new URL("../src/app/api/admin/kpi/v2/refresh/route.ts", import.meta.url), "utf8"),
  saved: await readFile(new URL("../src/app/api/admin/kpi/v2/_saved.ts", import.meta.url), "utf8"),
  ui: await readFile(new URL("../src/app/admin/kpi/KpiDailyOverview.tsx", import.meta.url), "utf8"),
  migration: await readFile(new URL("../supabase/migrations/20260910000939_kpi_manual_saved_refresh.sql", import.meta.url), "utf8"),
};
const checks = [
  ["route uses service-only refresh RPC", files.route.includes('rpc("request_kpi_overview_saved_refresh")')],
  ["route validates production runtime", files.route.includes("validateProductionKpiRuntime")],
  ["saved reader accepts cache bust", files.saved.includes("_cacheBust") && files.saved.includes('searchParams.get("refresh")')],
  ["UI has manual refresh button", files.ui.includes('最新値に更新') && files.ui.includes('/api/admin/kpi/v2/refresh')],
  ["migration grants only service role", files.migration.includes("revoke all on function") && files.migration.includes("to service_role")],
];
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}
