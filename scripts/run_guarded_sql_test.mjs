import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { verifySupabaseTarget } from "./supabase_target_guard.mjs";
import { getLinkedPostgresConnection, loadEnvironmentFile } from "./postgres_connection.mjs";

const environmentIndex = process.argv.indexOf("--environment");
const fileIndex = process.argv.indexOf("--file");
const environment = environmentIndex >= 0 ? process.argv[environmentIndex + 1]?.toLowerCase() : "";
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
const testRoot = resolve("supabase/tests");
const sqlPath = resolve(file);
if (!environment || !file || relative(testRoot, sqlPath).startsWith("..")) throw new Error("Only SQL files inside supabase/tests may be executed.");
if (environment === "production") {
  throw new Error("ProductionではSQL testを実行できません。catalog監査はread-only postflightを使用してください。");
}

const sql = await readFile(sqlPath, "utf8");
if (!/^\s*begin\s*;/i.test(sql) || !/rollback\s*;\s*$/i.test(sql)) throw new Error("Guarded SQL tests must begin a transaction and end with ROLLBACK.");
loadEnvironmentFile(environment);
await verifySupabaseTarget({ environment, mutation: true });
const connection = await getLinkedPostgresConnection();
const executable = process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" : "psql";
const result = spawnSync(executable, ["-X", "-v", "ON_ERROR_STOP=1", "--host", connection.host, "--port", connection.port, "--username", connection.user, "--dbname", connection.database, "--file", sqlPath], {
  stdio: "inherit",
  env: { ...process.env, PGPASSWORD: connection.password },
});
if (result.error) console.error(`psql could not be started: ${result.error.message}`);
process.exit(result.status ?? 1);
