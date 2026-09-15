import { spawnSync } from "node:child_process";
import { assertStandardRouteAllowed } from './raid-room/standard-route-guard.mjs';
import { relative, resolve } from "node:path";
import { verifySupabaseTarget } from "./supabase_target_guard.mjs";
import { getLinkedPostgresConnection, loadEnvironmentFile } from "./postgres_connection.mjs";

const environmentIndex = process.argv.indexOf("--environment");
const fileIndex = process.argv.indexOf("--file");
const environment = environmentIndex >= 0 ? process.argv[environmentIndex + 1]?.toLowerCase() : "";
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
const migrationRoot = resolve("supabase/migrations");
const sqlPath = resolve(file);
if (!environment || !file || relative(migrationRoot, sqlPath).startsWith("..")) {
  console.error("Only SQL files inside supabase/migrations may be applied.");
  process.exit(1);
}

loadEnvironmentFile(environment);
assertStandardRouteAllowed({environment,file:true});
const target = await verifySupabaseTarget({ environment, mutation: true });
assertStandardRouteAllowed({environment,projectRef:target.projectRef,file:true});
const connection = await getLinkedPostgresConnection();
const executable = process.platform === "win32"
  ? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
  : "psql";
const result = spawnSync(executable, [
  "-X", "-v", "ON_ERROR_STOP=1",
  "--host", connection.host,
  "--port", connection.port,
  "--username", connection.user,
  "--dbname", connection.database,
  "--file", sqlPath,
], {
  stdio: "inherit",
  env: { ...process.env, PGPASSWORD: connection.password },
});
if (result.error) console.error(`psql could not be started: ${result.error.message}`);
process.exit(result.status ?? 1);
