import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const rawUrl = process.env.SUPABASE_LOCAL_DB_URL;
if (!rawUrl) throw new Error("SUPABASE_LOCAL_DB_URL is required.");

const connection = new URL(rawUrl);
if (!new Set(["postgres:", "postgresql:"]).has(connection.protocol)) {
  throw new Error("SUPABASE_LOCAL_DB_URL must use postgres or postgresql.");
}
const hostname=connection.hostname.replace(/^\[|\]$/g,"");
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
  throw new Error("Ranking lifecycle mutation tests may connect only to a local PostgreSQL host.");
}

const sqlPath=resolve("supabase/tests/ranking-lifecycle-safety-convergence-local.sql");
const executable=process.platform==="win32"
  ? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
  : "psql";
const result=spawnSync(executable,[
  "-X","-v","ON_ERROR_STOP=1",
  "--host",hostname,
  "--port",connection.port||"5432",
  "--username",decodeURIComponent(connection.username),
  "--dbname",connection.pathname.replace(/^\//,"")||"postgres",
  "--command","set tribe_neon.local_fixture_runner='on';",
  "--file",sqlPath,
],{
  stdio:"inherit",
  env:{...process.env,PGPASSWORD:decodeURIComponent(connection.password)},
});
if(result.error) console.error(`psql could not be started: ${result.error.message}`);
process.exit(result.status??1);
