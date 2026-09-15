import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  KPI_PRODUCTION_STANDARD_ORIGIN,
  validateProductionKpiRuntime,
} from "../src/utils/kpiRuntime.ts";

const nextConfig = await readFile("next.config.ts", "utf8");
const page = await readFile("src/app/admin/kpi/page.tsx", "utf8");
const dashboard = await readFile("src/app/admin/kpi/KpiDashboard.tsx", "utf8");
const refreshRoute = await readFile("src/app/api/admin/kpi/refresh/route.ts", "utf8");
const snapshotsRoute = await readFile("src/app/api/admin/kpi/snapshots/route.ts", "utf8");
const timeseriesRoute = await readFile("src/app/api/admin/kpi/timeseries/route.ts", "utf8");
const proxy = await readFile("src/proxy.ts", "utf8");
const envExample = await readFile(".env.example", "utf8");

for (const host of ["kpi.tribe-neon.com", "kpi-preview.tribe-neon.com"]) {
  assert.ok(nextConfig.includes(`"${host}"`), `${host} root routing is missing`);
}
assert.match(nextConfig, /source:\s*"\/"/);
assert.match(nextConfig, /destination:\s*"\/admin\/kpi"/);
assert.match(nextConfig, /permanent:\s*false/);

assert.match(page, /validateProductionKpiRuntime/);
assert.doesNotMatch(dashboard, /supabase\.auth|signInWithPassword|signInWithOAuth/);
assert.match(dashboard, /\/api\/admin\/kpi\/timeseries/);
assert.match(proxy, /KPI_BASIC_AUTH_USER/);
assert.match(proxy, /KPI_BASIC_AUTH_PASSWORD/);
assert.match(proxy, /WWW-Authenticate/);
assert.match(proxy, /\/admin\/kpi\/:path\*/);
assert.match(proxy, /\/api\/admin\/kpi\/:path\*/);
assert.doesNotMatch(dashboard, /signInWithOAuth/);
assert.match(refreshRoute, /validateProductionKpiRuntime/);
assert.doesNotMatch(refreshRoute, /getUser|app_metadata|Bearer/);
assert.match(snapshotsRoute, /kpi_aggregation_runs/);
assert.match(snapshotsRoute, /kpi_metric_snapshots/);
assert.doesNotMatch(snapshotsRoute, /refresh_kpi_snapshots/);
assert.match(timeseriesRoute, /length:\s*30/);
assert.match(timeseriesRoute, /length:\s*12/);
assert.match(timeseriesRoute, /p0-v2-timeseries/);
assert.doesNotMatch(timeseriesRoute, /refresh_kpi_snapshots/);
assert.match(envExample, /NEXT_PUBLIC_KPI_DATA_ENV=/);
assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/);
assert.match(envExample, /KPI_BASIC_AUTH_USER=/);
assert.match(envExample, /KPI_BASIC_AUTH_PASSWORD=/);
assert.doesNotMatch(envExample, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);

const valid = validateProductionKpiRuntime({
  appEnvironment: "preview",
  dataEnvironment: "production",
  supabaseUrl: KPI_PRODUCTION_STANDARD_ORIGIN,
});
assert.deepEqual(valid, { enabled: true, origin: KPI_PRODUCTION_STANDARD_ORIGIN });

for (const [reason, config] of [
  ["app_environment", { appEnvironment: "production", dataEnvironment: "production", supabaseUrl: KPI_PRODUCTION_STANDARD_ORIGIN }],
  ["data_environment", { appEnvironment: "preview", dataEnvironment: "preview", supabaseUrl: KPI_PRODUCTION_STANDARD_ORIGIN }],
  ["missing_supabase_url", { appEnvironment: "preview", dataEnvironment: "production" }],
  ["production_custom_domain_forbidden", { appEnvironment: "preview", dataEnvironment: "production", supabaseUrl: "https://api.tribe-neon.com" }],
  ["production_project_mismatch", { appEnvironment: "preview", dataEnvironment: "production", supabaseUrl: "https://sufvuqdnqohpfzkwxohq.supabase.co" }],
]) {
  assert.deepEqual(validateProductionKpiRuntime(config), { enabled: false, reason });
}

console.log("KPI fixed-domain runtime contract verification PASS");
